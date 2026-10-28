"""Independent feed gates, adversarial inputs and real temporary-bare Git integration.
Synthetic HTML is injected into Python functions only. No production CLI bypass.
"""
import copy,datetime as dt,importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
import wb_feed_guard as g
import wb_feed_runtime as r
NOW=dt.datetime(2026,10,28,12,tzinfo=g.SH)
TITLE='关于电力能源发展的政策通知';ISSUER='国家能源局';EXCERPT='推动电力和新能源高质量发展。'
def html(title=TITLE,published='2026-10-27',excerpt=EXCERPT):
 return f'<html><head><meta charset="utf-8"><title>{title}</title></head><body><h1>{title}</h1><p>发布机关：{ISSUER}</p><p>发布日期：{published}</p><p>{excerpt}</p></body></html>'.encode()
DATA=html()
def item(url='https://www.gov.cn/synthetic-test.html',**changes):
 d={'id':'wb_'+g.digest(url.encode())[:20],'category':'policy','title':TITLE,'issuer':ISSUER,'source_url':url,'published_date':'2026-10-27','publication_evidence':'发布日期：2026-10-27','collected_at':'2026-10-28T10:00:00+08:00','source_sha256':g.digest(DATA),'source_excerpt':EXCERPT};d.update(changes);return d

def batch(items=None,number=1,mode='daily'):
 return {'schema':1,'batch_id':f'WB-20261028-{number:03}','mode':mode,'created_at':'2026-10-28T11:00:00+08:00','items':items or [item()]}

def run(b,state=None,data=DATA,now=NOW,known=None,fetcher=None):
 return g.check_batch(b,state,now,fetcher or (lambda url:(data,'utf-8')),known)

class ShapeDates(unittest.TestCase):
 def test_canonical_roundtrip_and_partial(self):
  state,receipt=run(batch([item(),item('https://www.gov.cn/other.html',issuer='<script>')]))
  self.assertEqual(receipt['status'],'partial');self.assertEqual(len(state['records']),1);g.validate_live(state)
 def test_schema_bool_unknowns_and_duplicate_keys(self):
  for raw in ['{"x":1,"x":2}','{"x":NaN}','{"x":Infinity}']:
   with self.assertRaises(ValueError):r.parse_json(raw)
  for key,val in [('schema',True),('items',[]),('mode','fixture')]:
   b=batch();b[key]=val
   with self.assertRaises(ValueError):run(b)
  for key,val in [('category',True),('source_sha256','x'*64),('published_date','2026-02-30'),('collected_at','2026-10-28 10:00:00+08:00'),('collected_at','2026-10-28T10:00:00')]:
   with self.subTest(key=key,val=val):self.assertEqual(run(batch([item(**{key:val})]))[1]['status'],'rejected')
  self.assertEqual(run(batch([item(secret='not allowed')]))[1]['status'],'rejected')
 def test_controls_and_public_plain_text(self):
  for value in ['<img src=x onerror=alert(1)>','正文\u202e测试','内部资料摘录','/Users/example/private','plain\nline']:
   self.assertEqual(run(batch([item(source_excerpt=value)]))[1]['status'],'rejected')
 def test_collection_cannot_precede_publication_or_be_future_late(self):
  for stamp in ['2026-10-26T23:59:59+08:00','2026-10-28T11:00:01+08:00','2026-10-29T00:00:00+08:00']:
   self.assertEqual(run(batch([item(collected_at=stamp)]))[1]['status'],'rejected')
  i=item(published_date='2026-10-26',publication_evidence='发布日期：2026-10-26',collected_at='2026-10-26T11:59:59+08:00')
  self.assertEqual(run(batch([i]),data=html(published='2026-10-26'))[1]['status'],'rejected')
  i['collected_at']='2026-10-26T12:00:00+08:00';self.assertEqual(run(batch([i]),data=html(published='2026-10-26'))[1]['status'],'passed')
 def test_three_shanghai_calendar_days_not_rolling_72_hours(self):
  now=dt.datetime(2026,10,28,0,0,1,tzinfo=g.SH)
  for day,expected in [('2026-10-26','passed'),('2026-10-25','rejected')]:
   i=item(published_date=day,publication_evidence='发布日期：'+day,collected_at='2026-10-28T00:00:00+08:00');b=batch([i]);b['created_at']='2026-10-28T00:00:00+08:00'
   self.assertEqual(run(b,now=now,data=html(published=day))[1]['status'],expected)
 def test_utc_day_and_backfill_30_day_boundary(self):
  b=batch();b['created_at']='2026-10-28T03:00:00Z';b['items'][0]['collected_at']='2026-10-28T02:00:00Z';self.assertEqual(run(b)[1]['status'],'passed')
  for day,expected in [('2026-09-28','passed'),('2026-09-27','rejected')]:
   i=item(published_date=day,publication_evidence='发布日期：'+day);self.assertEqual(run(batch([i],mode='backfill'),data=html(published=day))[1]['status'],expected)
 def test_date_complete_boundaries(self):
  self.assertFalse(g.date_in_text('2026-10-02','发布日期：2026-10-28'));self.assertFalse(g.date_in_text('2026-10-02','发布日期：12026-10-02'));self.assertTrue(g.date_in_text('2026-10-02','发布日期：2026年10月2日'))

class SourceIdentity(unittest.TestCase):
 def test_reject_fake_domains_ports_paths(self):
  for url in ['http://gov.cn/a','https://gov.cn.evil.com/a','https://gov.cn@evil.com/a','https://gov.cn:444/a','https://gov.cn/a#part','https://gov.cn/%0dX','https://gov.cn\\evil/a','https://gov.cn./a','https://gov.cn/%5cevil','https://gov.cn/a/../b','https://gov.cn/a/%2e%2e/b']:
   with self.subTest(url=url),self.assertRaises(ValueError):g.urlcheck(url)
 def test_private_and_mixed_dns(self):
  for ip in ['127.0.0.1','10.0.0.1','169.254.169.254','::1','fc00::1','198.18.0.1']:
   with self.subTest(ip=ip),self.assertRaises(ValueError):g.resolve_public('www.gov.cn',lambda *a,**k:[(None,None,None,None,('8.8.8.8',443)),(None,None,None,None,(ip,443))])
 def test_visible_heading_date_issuer_excerpt_not_navigation(self):
  pages=[DATA.replace(TITLE.encode(),b'Unrelated title'),html().replace(b'<body>',b'<body><nav>').replace(b'</body>',b'</nav></body>'),DATA.replace(b'</head>',b'<meta name="PubDate" content="2026-10-26"></head>'),DATA.replace('发布日期'.encode(),'成文日期'.encode()),DATA.replace(ISSUER.encode(),'其他机关'.encode()),DATA.replace(EXCERPT.encode(),'其他内容与标题无关。'.encode()),DATA+'<p>访问被拒绝 CAPTCHA</p>'.encode(),DATA+'<p>公开日期：2026-10-26</p>'.encode(),DATA+b'<p>Checking your browser before accessing this site</p>',DATA+b'<p>JavaScript is required</p>']
  for page in pages:
   with self.subTest(page_sha=g.digest(page)):self.assertEqual(run(batch(),data=page)[1]['status'],'rejected')
 def test_hidden_and_script_evidence_not_visible(self):
  for start in ['<div hidden>','<div style="display:none">','<div class="hidden">','<script>','<template>']:
   page=DATA.replace('<p>发布日期：2026-10-27</p>'.encode(),(start+'发布日期：2026-10-27</'+start[1:].split()[0].strip('>')+'>').encode())
   self.assertEqual(run(batch(),data=page)[1]['status'],'rejected')
 def test_changed_bytes_dual_sha_pending_not_original_equality(self):
  state,result=run(batch([item(source_sha256='0'*64)]));self.assertTrue(result['items'][0]['bytes_changed']);self.assertEqual(state['records'][0]['review_state'],'pending');self.assertNotEqual(state['records'][0]['source_sha256'],state['records'][0]['source_check']['source_sha256_fetched'])
 def test_known_main_original_dedupe_and_conflict_without_fetch(self):
  i=item();data={'docs':{'ZCXX01':{'title':TITLE,'url':i['source_url'],'published':'2026-10-27'}}};layer={'source_links':[],'notices':[]};known=g.trusted_identities(data,layer)
  for title in [TITLE,'关于电网能源发展的其他通知']:
   _,rec=run(batch([item(title=title)]),known=known,fetcher=lambda url:self.fail('duplicate fetched'))
   self.assertEqual(rec['status'],'rejected')
 def test_associated_source_not_original(self):
  i=item();data={'docs':{'ZCXX01':{'title':TITLE,'url':i['source_url']}}};layer={'source_links':[{'policy_id':'ZCXX01','url':i['source_url'],'role':'OFFICIAL_INTERPRETATION'}],'notices':[]}
  self.assertEqual(run(batch(),known=g.trusted_identities(data,layer))[1]['status'],'passed')
 def test_same_identity_other_url_manual_but_draft_distinct(self):
  known=g.trusted_identities({'docs':{'ZCXX01':{'title':TITLE,'url':'https://www.gov.cn/another.html','issuer':ISSUER,'published':'2026-10-27'}}},{'source_links':[],'notices':[]})
  self.assertEqual(run(batch(),known=known)[1]['status'],'rejected')
  title=TITLE+'（征求意见稿）';self.assertEqual(run(batch([item(title=title)]),data=html(title),known=known)[1]['status'],'passed')
  state,_=run(batch());self.assertEqual(run(batch([item('https://www.gov.cn/elsewhere.html')],2),state)[1]['status'],'rejected')
 def test_title_excerpt_relevance_not_page_navigation_keyword(self):
  title='关于公共文化服务发展的通知';excerpt='公共文化服务水平持续不断地提高。'
  self.assertEqual(run(batch([item(title=title,source_excerpt=excerpt)]),data=html(title,excerpt=excerpt)+b'<nav>energy</nav>')[1]['status'],'rejected')

class HttpThreats(unittest.TestCase):
 def fake(self,headers=None,data=DATA,status=200,location=None):
  values={'Content-Type':'text/html',**(headers or {})}
  class Response:
   def __init__(self):self.status=status;self.rest=data
   def getheader(self,k,default=None):return location if k=='Location' else values.get(k,default)
   def read1(self,n):a=self.rest[:n];self.rest=self.rest[n:];return a
  class Connection:
   def __init__(self,*a):pass
   def request(self,*a,**k):pass
   def getresponse(self):return Response()
   def close(self):pass
  return Connection
 def test_meta_and_bom_charset_clear_not_guessed(self):
  for data in [DATA,b'\xef\xbb\xbf'+DATA.replace(b'<meta charset="utf-8">',b'')]:
   with patch.object(g,'resolve_public',return_value=['8.8.8.8']),patch.object(g,'PinnedHTTPS',self.fake(data=data)):
    body,charset=g.fetch('https://www.gov.cn/a');self.assertEqual(body,data);g.page_check(item(),body,charset)
  with patch.object(g,'resolve_public',return_value=['8.8.8.8']),patch.object(g,'PinnedHTTPS',self.fake(data=DATA.replace(b'<meta charset="utf-8">',b''))):
   with self.assertRaises(ValueError):g.fetch('https://www.gov.cn/a')
 def test_redirect_host_private_and_dns_rebind(self):
  with patch.object(g,'resolve_public',return_value=['8.8.8.8']),patch.object(g,'PinnedHTTPS',self.fake(status=302,location='https://evil.com/a')):
   with self.assertRaises(ValueError):g.fetch('https://www.gov.cn/a')
  with patch.object(g,'resolve_public',side_effect=[['8.8.8.8'],ValueError('private DNS')]),patch.object(g,'PinnedHTTPS',self.fake(status=302,location='/next')):
   with self.assertRaises(ValueError):g.fetch('https://www.gov.cn/a')
 def test_non_html_compression_oversize_status(self):
  cases=[self.fake(headers={'Content-Type':'application/pdf'}),self.fake(headers={'Content-Type':'text/html; charset=utf-8','Content-Encoding':'gzip'}),self.fake(data=b'x'*(2097153),headers={'Content-Type':'text/html; charset=utf-8'}),self.fake(status=403)]
  for fake in cases:
   with patch.object(g,'resolve_public',return_value=['8.8.8.8']),patch.object(g,'PinnedHTTPS',fake),self.assertRaises(ValueError):g.fetch('https://www.gov.cn/a')

class StateReview(unittest.TestCase):
 def test_duplicate_batches_and_unchanged_records_skip_network(self):
  state,_=run(batch());fail=lambda url:self.fail('unchanged source fetched')
  self.assertEqual(run(batch(),state,fetcher=fail)[1]['status'],'duplicate');self.assertEqual(run(batch(number=2),state,fetcher=fail)[1]['items'][0]['status'],'unchanged')
  b=batch();b['items'][0]['title']+='更新'
  with self.assertRaises(ValueError):run(b,state)
 def test_duplicate_ids_reject_both_and_no_mutation(self):
  b=batch([item(),item()]);state,rec=run(b);self.assertEqual(rec['status'],'rejected');self.assertEqual(state['records'],[])
 def test_new_versions_invalidate_old_review(self):
  state,_=run(batch());old=state['records'][0];review={'schema':1,'reviews':[{'id':old['id'],'record_sha256':old['record_sha256'],'status':'accepted'}]}
  b=batch([item(source_excerpt=EXCERPT[:-1])],2);state,rec=run(b,state);self.assertEqual(len(state['history']),2);self.assertIsNone(g.apply_reviews(state,review)[0]['review']);self.assertNotEqual(old['record_sha256'],state['records'][0]['record_sha256'])
 def test_reviews_correction_withdrawal_and_invalid_schema(self):
  state,_=run(batch());record=state['records'][0];base={'id':record['id'],'record_sha256':record['record_sha256']}
  for review in [dict(base,status='withdrawn',note='来源身份待重新核对。'),dict(base,status='corrected',note='分类改为公告。',correction={'category':'notice'})]:
   g.validate_reviews({'schema':1,'reviews':[review]});self.assertIsNotNone(g.apply_reviews(state,{'schema':1,'reviews':[review]})[0]['review'])
  for review in [dict(base,status='corrected',note='缺更正'),dict(base,status='withdrawn'),dict(base,status='accepted',formal_id='ZCUNKNOWN00'),dict(base,status='accepted',note='<b>unsafe</b>')]:
   with self.assertRaises(ValueError):g.validate_reviews({'schema':1,'reviews':[review]},set())
 def test_tampered_state_not_authorized_by_sha_format(self):
  state,_=run(batch())
  for key,value in [('category','bogus'),('published_date','2026-02-30')]:
   corrupt=copy.deepcopy(state);r0=corrupt['records'][0];r0[key]=value;r0['record_sha256']=g.digest(g.canonical({k:r0[k] for k in g.FIELDS}))
   with self.assertRaises(ValueError):g.validate_live(corrupt)
 def test_daily_limit_survives_truncated_history(self):
  state=g.empty_state();state['daily_counts']={'2026-10-28':12};_,rec=run(batch(),state);self.assertEqual(rec['status'],'rejected')
 def test_retention_bounded_by_real_calendar(self):
  state,_=run(batch());old=copy.deepcopy(state['records'][0]);old['gate_checked_at']='2026-07-30T10:00:00+08:00';old['collected_at']='2026-07-30T09:00:00+08:00';old['published_date']='2026-07-29';old['publication_evidence']='发布日期：2026-07-29';old['record_sha256']=g.digest(g.canonical({k:old[k] for k in g.FIELDS}));state['records']=[old];state['history']=[];state['receipts']=[]
  updated,_=run(batch(),state);self.assertEqual(len(updated['records']),1);self.assertEqual(updated['records'][0]['gate_checked_at'],NOW.isoformat())

class GitIntegration(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name);self.remote=self.path/'remote.git';r.git('init','--bare',str(self.remote));self.env=dict(os.environ,GIT_AUTHOR_NAME='Test',GIT_AUTHOR_EMAIL='test@example.com',GIT_COMMITTER_NAME='Test',GIT_COMMITTER_EMAIL='test@example.com');self.src=self.path/'submission.json';self.src.write_bytes(g.canonical(batch()))
 def tearDown(self):self.tmp.cleanup()
 def submit(self,n=1,b=None):
  if b:self.src.write_bytes(g.canonical(b))
  return r.create_submit(self.path/f'clone{n}',self.src,True,origin=str(self.remote),env=self.env,now=NOW)
 def process(self,**args):return r.process(origin=str(self.remote),env=self.env,now=NOW,known={},fetcher=lambda url:(DATA,'utf-8'),**args)
 def test_initial_noop_submit_fixed_tree_live_update_and_duplicate(self):
  self.assertEqual(self.process()['status'],'empty_inbox');self.submit();self.assertEqual(r.git('branch','--show-current',cwd=self.path/'clone1',env=self.env).stdout.strip(),r.INBOX);r.assert_clean(self.path/'clone1',self.env);first=self.process();self.assertTrue(first['site_feed_published']);self.assertFalse(first['workbook_written']);self.assertFalse(first['content_acceptance'])
  live=first['live_commit'];tree=r.git('--git-dir',str(self.remote),'ls-tree','-r','--name-only',live).stdout.splitlines();self.assertEqual(tree,sorted([r.OUT,r.STATE]));self.assertEqual(self.process()['status'],'duplicate')
  self.submit(2,batch([item(source_excerpt=EXCERPT[:-1])],2));second=self.process();state=json.loads(r.git('--git-dir',str(self.remote),'show',second['live_commit']+':'+r.STATE).stdout);self.assertEqual(len(state['history']),2)
 def test_scope_ref_and_symlink(self):
  with self.assertRaises(ValueError):r.push_fixed(self.path,'main',None,'a'*40,self.env)
  self.submit();clone=self.path/'symlink-scope';clone.mkdir();(clone/'feed').symlink_to(self.path.parent,target_is_directory=True)
  with self.assertRaises(ValueError):r.fixed_target(clone,r.SUB)
 def test_malicious_inbox_files_not_executed_or_checked_out(self):
  self.submit();clone=self.path/'clone1';head=r.remote_head(clone,r.INBOX,self.env);self.assertEqual(r.git('branch','--show-current',cwd=clone,env=self.env).stdout.strip(),r.INBOX)
  malicious=clone/'malicious.py';malicious.write_text('raise RuntimeError("must never run")');r.git('add','--','malicious.py',cwd=clone,env=self.env);r.git('commit','-m','foreign file',cwd=clone,env=self.env);r.git('push','origin','HEAD:refs/heads/'+r.INBOX,cwd=clone,env=self.env)
  with self.assertRaises(ValueError):self.process()
  self.assertIsNone(r.remote_head(clone,r.LIVE,self.env))
 def test_concurrent_push_and_real_non_fast_forward(self):
  one=self.submit();clone=self.path/'clone1';stale=r.commit_data(clone,r.INBOX,one['inbox_commit'],{r.SUB:batch(number=3)},self.env);self.submit(2,batch(number=2))
  with self.assertRaises(RuntimeError):r.push_fixed(clone,r.INBOX,one['inbox_commit'],stale,self.env)
  rejected=r.git('push','origin',stale+':refs/heads/'+r.INBOX,cwd=clone,env=self.env,check=False);self.assertNotEqual(rejected.returncode,0)
 def test_submit_shape_wrong_remote_and_no_arbitrary_flags(self):
  self.src.write_text('{}')
  with self.assertRaises(ValueError):self.submit()
  with patch.object(r,'git') as call:
   call.return_value.stdout='other\n'
   with self.assertRaises(ValueError):r.assert_origin(self.path)
  text=(ROOT/'tools/wb_feed_runtime.py').read_text();self.assertNotIn("add_argument('--skip",text);self.assertNotIn("add_argument('--origin",text)

class WorkflowContract(unittest.TestCase):
 def test_workflow_fixed_entry_and_no_untrusted_code_trigger(self):
  s=(ROOT/'.github/workflows/wb-feed.yml').read_text();self.assertIn('3d3c42e5aac5ba805825da76410c181273ba90b1',s);self.assertIn('ref: ${{ github.sha }}',s);self.assertIn('persist-credentials: false',s);self.assertIn('python3 tools/wb_feed_runtime.py process',s);self.assertNotIn('pull_request_target',s);self.assertNotIn('exit 1',s);self.assertIn('permissions: {}',s)
 def test_actions_context_and_checkout_sha_gate(self):
  env={'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/wb-feed-inbox','GITHUB_REPOSITORY':'xuqinnn/energy-storage-policy','GITHUB_TOKEN':'synthetic-not-a-credential'}
  with patch.dict(os.environ,env,clear=True),self.assertRaises(ValueError):r.action_env()
 def test_build_empty_snapshot_and_reviews_version_fields(self):
  self.assertEqual(json.loads((ROOT/'content/wb-feed-snapshot.json').read_text())['records'],[]);g.validate_reviews(json.loads((ROOT/'content/wb-feed-reviews.json').read_text()))

if __name__=='__main__':unittest.main()
