"""Fixed data-only Git adapter. Production CLI has no origin/fetch/test override."""
import argparse
import base64
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from wb_feed_guard import (SH,check_batch,canonical,validate_live,empty_state,
                           batch_shape,item_shape,trusted_identities,validate_reviews)

ORIGIN='https://github.com/xuqinnn/energy-storage-policy.git'
INBOX='wb-feed-inbox';LIVE='wb-feed-live';SUB='feed/submission.json';OUT='feed/live.json';STATE='feed/state.json'
ROOT=Path(__file__).resolve().parent.parent

def parse_json(raw,limit=100000):
    if len(raw.encode() if isinstance(raw,str) else raw)>limit:raise ValueError('JSON too large')
    def pairs(values):
        result={}
        for k,v in values:
            if k in result:raise ValueError('duplicate JSON key')
            result[k]=v
        return result
    def bad(_):raise ValueError('nonfinite JSON value')
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=bad)

def git(*args,cwd=None,check=True,env=None,input=None):
    # No checkout, shell, hooks or code from either data branch. Test transports
    # use a temporary bare origin through the Python API, never CLI flags.
    p=subprocess.run(['git','-c','core.hooksPath=/dev/null',*args],cwd=cwd,env=env,
                     input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=60)
    if check and p.returncode:raise RuntimeError('git operation failed: '+args[0])
    return p

def assert_origin(path,origin=ORIGIN,env=None):
    if git('remote',cwd=path,env=env).stdout.splitlines()!=['origin'] or git('remote','get-url','origin',cwd=path,env=env).stdout.strip()!=origin:raise ValueError('unexpected remote')

def assert_clean(path,env=None):
    if git('status','--porcelain','--untracked-files=all',cwd=path,env=env).stdout:raise ValueError('workspace must be clean')

def remote_head(path,branch,env=None):
    if branch not in (INBOX,LIVE):raise ValueError('branch forbidden')
    ref='refs/heads/'+branch;lines=git('ls-remote','--heads','origin',ref,cwd=path,env=env).stdout.splitlines()
    if not lines:return None
    if len(lines)!=1 or len(lines[0].split())!=2 or lines[0].split()[1]!=ref or not re.fullmatch(r'[a-f0-9]{40}',lines[0].split()[0]):raise ValueError('unexpected remote ref')
    return lines[0].split()[0]

def fetch_head(path,branch,env=None):
    sha=remote_head(path,branch,env)
    if sha:
        git('fetch','--no-tags','origin','refs/heads/'+branch,cwd=path,env=env)
        if git('rev-parse','FETCH_HEAD',cwd=path,env=env).stdout.strip()!=sha:raise RuntimeError('remote changed during fetch')
    return sha

def read_branch(path,commit,allowed,limits,env=None):
    rows=git('ls-tree','-rz','--full-tree',commit,cwd=path,env=env).stdout.split('\0');blobs={}
    for row in filter(None,rows):
        meta,name=row.split('\t',1);mode,kind,sha=meta.split()
        if mode!='100644' or kind!='blob' or name not in allowed:raise ValueError('data branch contains non-fixed path or mode')
        blobs[name]=sha
    if set(blobs)!=set(allowed):raise ValueError('data branch missing fixed file')
    result={}
    for name,sha in blobs.items():
        size=int(git('cat-file','-s',sha,cwd=path,env=env).stdout)
        if size>limits[name]:raise ValueError('data blob too large')
        result[name]=parse_json(git('cat-file','blob',sha,cwd=path,env=env).stdout,limits[name])
    return result

def fixed_target(path,relative):
    if relative not in (SUB,OUT,STATE):raise ValueError('path forbidden')
    root=Path(path).resolve();target=root/relative
    if any(p.is_symlink() for p in (target.parent,target)) or root not in target.resolve().parents:raise ValueError('symlink or escaping path')
    return target

def commit_data(path,branch,parent,files,env=None):
    allowed={SUB} if branch==INBOX else {OUT,STATE} if branch==LIVE else set()
    if set(files)!=allowed:raise ValueError('commit path scope')
    entries=[]
    for name,value in sorted(files.items()):
        blob=git('hash-object','-w','--stdin',input=canonical(value).decode()+'\n',cwd=path,env=env).stdout.strip()
        entries.append('100644 blob '+blob+'\t'+Path(name).name+'\n')
    feed=git('mktree',input=''.join(entries),cwd=path,env=env).stdout.strip()
    tree=git('mktree',input='040000 tree '+feed+'\tfeed\n',cwd=path,env=env).stdout.strip()
    args=['-c','user.name=WB feed bot','-c','user.email=wb-feed@users.noreply.github.com','commit-tree',tree]
    if parent:args+=['-p',parent]
    commit=git(*args,input='Update fixed WB feed data\n',cwd=path,env=env).stdout.strip()
    if not re.fullmatch(r'[a-f0-9]{40}',commit):raise ValueError('invalid created commit')
    return commit

class PushUncertain(RuntimeError):
    def __init__(self,branch,commit):
        super().__init__('ordinary push attempted; remote readback not confirmed')
        self.receipt={'status':'push_unverified','publication_state':'unknown','branch':branch,
                      'attempted_commit':commit,'published':None,
                      'site_feed_published':None if branch==LIVE else False,
                      'workbook_written':False,'content_acceptance':False}

def push_fixed(path,branch,expected,commit,env=None):
    if branch not in (INBOX,LIVE) or not re.fullmatch(r'[a-f0-9]{40}',commit):raise ValueError('branch/commit forbidden')
    if remote_head(path,branch,env)!=expected:raise RuntimeError('concurrent remote update')
    try:
        git('push','origin',commit+':refs/heads/'+branch,cwd=path,env=env)
        if remote_head(path,branch,env)!=commit:raise RuntimeError('remote readback mismatch')
    except (ValueError,RuntimeError,OSError,subprocess.SubprocessError) as error:
        raise PushUncertain(branch,commit) from error

def materialize_inbox(path,commit,env=None):
    # Read only a validated JSON tree; no branch checkout or filter execution.
    read_branch(path,commit,{SUB},{SUB:100000},env)
    git('update-ref','refs/heads/'+INBOX,commit,cwd=path,env=env)
    git('read-tree',commit,cwd=path,env=env)
    target=fixed_target(path,SUB);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(git('show',commit+':'+SUB,cwd=path,env=env).stdout,encoding='utf-8')
    assert_clean(path,env)
    if git('branch','--show-current',cwd=path,env=env).stdout.strip()!=INBOX:raise ValueError('wrong local inbox branch')

def create_submit(path,submission,apply=False,*,origin=ORIGIN,env=None,now=None):
    path=Path(path).absolute();src=Path(submission)
    if src.is_symlink() or not src.is_file() or src.stat().st_size>100000:raise ValueError('submission must be bounded regular file')
    batch=parse_json(src.read_bytes());now=now or dt.datetime.now(SH);created=batch_shape(batch,now)
    ids=[]
    for item in batch['items']:
        pub,collected=item_shape(item)
        if collected>created or (now.astimezone(SH).date()-pub).days not in range(3 if batch['mode']=='daily' else 31):raise ValueError('submission calendar/time window')
        ids.append(item['id'])
    if len(set(ids))!=len(ids):raise ValueError('duplicate submission ID')
    if path.exists() or path.is_symlink():raise ValueError('clone path must not exist')
    if not apply:return {'status':'dry_run','published':False,'branch':INBOX,'path':SUB}
    git('init',str(path),env=env);git('symbolic-ref','HEAD','refs/heads/'+INBOX,cwd=path,env=env);git('remote','add','origin',origin,cwd=path,env=env);assert_origin(path,origin,env);assert_clean(path,env)
    if git('branch','--show-current',cwd=path,env=env).stdout.strip()!=INBOX:raise ValueError('wrong local inbox branch')
    old=fetch_head(path,INBOX,env)
    if old:
        prior=read_branch(path,old,{SUB},{SUB:100000},env)
        if prior[SUB]==batch:
            materialize_inbox(path,old,env)
            return {'status':'unchanged','inbox_commit':old,'published':False}
    commit=commit_data(path,INBOX,old,{SUB:batch},env);materialize_inbox(path,commit,env);push_fixed(path,INBOX,old,commit,env)
    return {'status':'submitted','inbox_commit':commit,'inbox_url':'https://github.com/xuqinnn/energy-storage-policy/commit/'+commit,'published':False,'site_feed_published':False,'workbook_written':False,'content_acceptance':False}

def action_env():
    expected={'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/main','GITHUB_REPOSITORY':'xuqinnn/energy-storage-policy'}
    if any(os.environ.get(k)!=v for k,v in expected.items()) or os.environ.get('GITHUB_EVENT_NAME') not in ('schedule','workflow_dispatch') or os.environ.get('GITHUB_WORKFLOW_REF')!='xuqinnn/energy-storage-policy/.github/workflows/wb-feed.yml@refs/heads/main':raise ValueError('requires trusted main workflow')
    sha=os.environ.get('GITHUB_SHA','')
    if not re.fullmatch(r'[a-f0-9]{40}',sha) or git('rev-parse','HEAD',cwd=ROOT).stdout.strip()!=sha:raise ValueError('trusted checkout SHA mismatch')
    token=os.environ.pop('GITHUB_TOKEN',None)
    if not token:raise ValueError('missing job token')
    env=os.environ.copy()
    for k in list(env):
        if k=='GIT_CONFIG_PARAMETERS' or k.startswith('GIT_CONFIG_'):env.pop(k)
    env.update(GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_CONFIG_COUNT='1',
               GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',
               GIT_CONFIG_VALUE_0='AUTHORIZATION: basic '+base64.b64encode(('x-access-token:'+token).encode()).decode(),GIT_TERMINAL_PROMPT='0')
    return env

def trusted_main():
    data=parse_json((ROOT/'data/storage.json').read_bytes(),10*1024*1024);layer=parse_json((ROOT/'content/content-layer.json').read_bytes(),2*1024*1024)
    validate_reviews(parse_json((ROOT/'content/wb-feed-reviews.json').read_bytes(),2*1024*1024),set(data['docs']))
    return trusted_identities(data,layer)

def process(*,origin=ORIGIN,env=None,fetcher=None,now=None,known=None):
    if known is None:known=trusted_main()
    with tempfile.TemporaryDirectory(prefix='wb-feed-') as td:
        git('init',td,env=env);git('remote','add','origin',origin,cwd=td,env=env);assert_origin(td,origin,env)
        inbox=fetch_head(td,INBOX,env)
        if inbox is None:return {'status':'empty_inbox','published':False,'site_feed_published':False}
        batch=read_branch(td,inbox,{SUB},{SUB:100000},env)[SUB];old=fetch_head(td,LIVE,env)
        state=empty_state()
        if old:
            previous=read_branch(td,old,{STATE,OUT},{STATE:20*1024*1024,OUT:2*1024*1024},env);state=validate_live(previous[STATE])
            # A trusted state is not inferred from the lightweight branch projection.
            if previous[OUT].get('records')!=state['records']:raise ValueError('live/state drift')
        args={'known':known}
        if fetcher is not None:args['fetcher']=fetcher
        state,receipt=check_batch(batch,state,now or dt.datetime.now(SH),**args)
        if receipt['status']=='duplicate':return {'inbox_commit':inbox,'observed_live_commit':old,'status':'duplicate','published':False,'site_feed_published':False}
        receipt['inbox_commit']=inbox
        public={'schema':1,'updated_at':receipt['checked_at'],'records':state['records'],'gate_stats':{'pending':len(state['records'])},'recent_batches':[{k:r[k] for k in ('batch_id','checked_at','status')} for r in state['receipts'][-10:]]}
        if len(canonical(state))>20*1024*1024 or len(canonical(public))>2*1024*1024:raise ValueError('output bounds')
        commit=commit_data(td,LIVE,old,{STATE:state,OUT:public},env);push_fixed(td,LIVE,old,commit,env)
        return {'inbox_commit':inbox,'live_commit':commit,'live_url':'https://github.com/xuqinnn/energy-storage-policy/commit/'+commit,'status':receipt['status'],'published':True,'site_feed_published':True,'formal_site_accepted':False,'workbook_written':False,'content_acceptance':False,'items':receipt['items']}

def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    s=sub.add_parser('submit');s.add_argument('clone_path');s.add_argument('submission');s.add_argument('--apply',action='store_true');sub.add_parser('process');a=p.parse_args()
    try:
        result=create_submit(a.clone_path,a.submission,a.apply) if a.command=='submit' else process(env=action_env())
        print(json.dumps(result,ensure_ascii=False))
    except PushUncertain as error:
        print(json.dumps(error.receipt));raise SystemExit(1)
    except (ValueError,RuntimeError,OSError,subprocess.SubprocessError) as error:
        certain=isinstance(error,ValueError)
        print(json.dumps({'status':'blocked','publication_state':'not_attempted' if certain else 'not_confirmed','published':False if certain else None,'site_feed_published':False if certain else None,'workbook_written':False,'content_acceptance':False,'reason':'Fixed-scope validation, network, git or permission gate failed. No alternate credential or bypass is attempted.'}));raise SystemExit(1)
if __name__=='__main__':main()
