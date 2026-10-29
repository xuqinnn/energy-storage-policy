"""Trusted feed validation. Network is injectable by callers only; CLI always fetches."""
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import re
import socket
import ssl
import copy
import time
import unicodedata
from urllib.parse import urlsplit, urljoin, urlunsplit, unquote

SH = dt.timezone(dt.timedelta(hours=8))
FIELDS = {'id','category','title','issuer','source_url','published_date','publication_evidence','collected_at','source_sha256','source_excerpt'}
TOP = {'schema','batch_id','mode','created_at','items'}
LABEL = r'(发布时间|发布日期|公开日期|发布于|公开时间)'
BAD = re.compile(r'[<>]|\\|[\x00-\x1f\x7f]|(?:内部资料|企业内部|商业秘密|密码|token|secret|api[_ -]?key)|(?:/Users/|/home/|[A-Za-z]:\\\\)', re.I)
HEX = re.compile(r'^[0-9a-f]{64}$')
def digest(data): return hashlib.sha256(data).hexdigest()
def canonical(obj): return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
def normalize(s): return re.sub(r'\s+', '', html.unescape(s))
def urlcheck(url):
    if not isinstance(url,str) or len(url)>300 or BAD.search(url) or any(ord(c)<33 or c=='\\' for c in unquote(url)): raise ValueError('invalid URL')
    u = urlsplit(url)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.fragment or u.port not in (None,443): raise ValueError('URL must be HTTPS without credentials, port or fragment')
    if any(part in ('.','..') for part in unquote(u.path).split('/')):raise ValueError('noncanonical URL path')
    host = u.hostname.lower()
    if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*gov\.cn', host): raise ValueError('URL host outside gov.cn')
    if u.netloc.lower() not in (host, host+':443'): raise ValueError('noncanonical host')
    return urlunsplit(('https', host, u.path or '/', u.query, ''))
def timestamp(s):
    if not isinstance(s,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+]00:00|[+]08:00)',s): raise ValueError('timestamp type')
    try: v = dt.datetime.fromisoformat(s.replace('Z','+00:00'))
    except ValueError: raise ValueError('invalid timestamp')
    if v.tzinfo is None or v.utcoffset() not in (dt.timedelta(0),dt.timedelta(hours=8)): raise ValueError('timestamp timezone')
    return v
class Page(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[]; self.headings=[]; self.text=[]; self.heading=None; self.hidden_dates=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag == 'meta' and re.search(r'pub(?:lication)?date|publishdate',attrs.get('name','')+attrs.get('property',''),re.I): self.hidden_dates.append(attrs.get('content',''))
        hidden=(bool(self.stack and self.stack[-1][1]) or tag in ('script','style','noscript','template','nav','footer','aside') or 'hidden' in attrs or attrs.get('aria-hidden','').lower() == 'true' or bool(re.search(r'(?:^|[\s_-])(?:hidden|hide|sr-only)(?:$|[\s_-])',attrs.get('class',''),re.I)) or bool(re.search(r'display\s*:\s*none|visibility\s*:\s*hidden',attrs.get('style',''),re.I)))
        if tag not in self.VOID: self.stack.append((tag,hidden))
        if not hidden and tag in ('title','h1','h2','h3'): self.heading=[]
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in self.VOID: self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for index in range(len(self.stack)-1,-1,-1):
            if self.stack[index][0]==tag:
                hidden=self.stack[index][1]; del self.stack[index:]
                if not hidden and tag in ('title','h1','h2','h3') and self.heading is not None:
                    self.headings.append(''.join(self.heading)); self.heading=None
                break
    def handle_data(self,data):
        if not (self.stack and self.stack[-1][1]):
            self.text.append(data)
            if self.heading is not None: self.heading.append(data)
def resolve_public(host, resolver=socket.getaddrinfo):
    addresses = {x[4][0] for x in resolver(host,443,type=socket.SOCK_STREAM)}
    if not addresses or any(not ipaddress.ip_address(x).is_global for x in addresses): raise ValueError('DNS includes non-public address')
    return sorted(addresses)
class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,ip,timeout): super().__init__(host,443,timeout=timeout,context=ssl.create_default_context()); self.ip=ip
    def connect(self):
        raw=socket.create_connection((self.ip,443), self.timeout)
        self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
def fetch(url):
    initial=urlcheck(url); host=urlsplit(initial).hostname; current=initial
    deadline=time.monotonic()+35
    for _ in range(6):
        if time.monotonic()>deadline:raise ValueError('fetch deadline')
        u=urlsplit(urlcheck(current))
        if u.hostname != host: raise ValueError('redirect changes host')
        ips=resolve_public(host); con=PinnedHTTPS(host,ips[0],10)
        try:
            con.request('GET',urlunsplit(('', '', u.path, u.query, '')),headers={'Accept':'text/html','Accept-Encoding':'identity','User-Agent':'WBFeedGuard/1'})
            response=con.getresponse()
            if response.status in (301,302,303,307,308):
                loc=response.getheader('Location')
                if not loc: raise ValueError('redirect without location')
                current=urljoin(current,loc); continue
            if response.status != 200: raise ValueError('HTTP status not 200')
            if response.getheader('Content-Encoding','identity').lower() not in ('','identity'): raise ValueError('compressed response')
            content_type=response.getheader('Content-Type','')
            if not re.match(r'^text/html(?:\s*;|\s*$)',content_type,re.I): raise ValueError('not HTML')
            m=re.search(r'charset\s*=\s*["\']?([\w-]+)',content_type,re.I)
            parts=[]; size=0
            while True:
                if time.monotonic()>deadline:raise ValueError('fetch deadline')
                chunk=response.read1(min(65536,2*1024*1024+1-size))
                if not chunk:break
                parts.append(chunk);size+=len(chunk)
                if size>2*1024*1024:raise ValueError('response too large')
            data=b''.join(parts)
            if not m:
                m=re.search(r'<meta[^>]+charset\s*=\s*[\"\']?([\w-]+)',data[:8192].decode('ascii',errors='ignore'),re.I)
            if not m and not data.startswith(b'\xef\xbb\xbf'):raise ValueError('missing explicit charset')
            charset=m.group(1).lower() if m else 'utf-8-sig'
            if charset not in ('utf-8','utf-8-sig','utf8','gbk','gb2312','gb18030'):raise ValueError('unsupported charset')
            return data,charset
        finally: con.close()
    raise ValueError('too many redirects')
def page_check(item,data,charset):
    try: document=data.decode(charset,errors='strict')
    except (LookupError,UnicodeError): raise ValueError('invalid charset or bytes')
    page=Page(); page.feed(document)
    body=normalize(' '.join(page.text));
    if any(v and not date_in_text(item['published_date'], v) for v in page.hidden_dates): raise ValueError('conflicting hidden publication date')
    headings=[normalize(s) for s in page.headings]
    if re.search(r'验证码|安全验证|访问验证|人机验证|just\s*a\s*moment|enable\s*javascript|请开启javascript|登录后查看|访问被拒绝|页面不存在|页面已删除|404\s*not\s*found|access\s*denied|captcha|robot\s*check|checking\s*your\s*browser|javascript\s*(?:is\s*)?required|sign\s*in\s*to\s*continue|please\s*log\s*in',body,re.I): raise ValueError('challenge/login/error page')
    if normalize(item['title']) not in headings: raise ValueError('title not in document heading')
    if normalize(item['issuer']) not in body: raise ValueError('issuer not visible')
    if normalize(item['source_excerpt']) not in body: raise ValueError('excerpt not visible')
    evidence=normalize(item['publication_evidence'])
    dates=re.findall(LABEL + r'[:：]?\s*(\d{4})\s*(?:年|[-./])\s*(\d{1,2})\s*(?:月|[-./])\s*(\d{1,2})(?:日)?(?!\d)',body)
    if len({(int(y),int(m),int(d)) for _,y,m,d in dates})>1: raise ValueError('multiple publication dates')
    if evidence not in body or not re.search(LABEL,evidence) or not date_in_text(item['published_date'],evidence): raise ValueError('publication evidence not visible or mismatched')
    return {'source_sha256_declared':item['source_sha256'],'source_sha256_fetched':digest(data),'bytes_changed':digest(data)!=item['source_sha256'],'fetched_bytes':len(data),'match':'normalized whitespace and HTML entities; title exact heading'}
def date_in_text(date,s):
    y,m,d=date.split('-'); return bool(re.search(rf'(?<!\d){y}\s*(?:年|[-./])\s*0?{int(m)}\s*(?:月|[-./])\s*0?{int(d)}\s*(?:日)?(?!\d)',s))

PROOF_FIELDS={'source_sha256_declared','source_sha256_fetched','bytes_changed','fetched_bytes','match'}
MATCH='normalized whitespace and HTML entities; title exact heading'
RECORD_EXTRA={'record_sha256','gate_checked_at','review_state','mode','source_check'}
# Applied only to reader-facing fields. Protocol IDs/SHA and private receipt reasons
# retain their own validators; ordinary policy 回执/验收流程/待核 remain legitimate.
PROCESS = re.compile(r'WB[·_ -]?(?:任务书|交付|派发|接单|流水|回执|调度)|WorkBuddy|Codex.{0,8}(?:验收|复核|任务|流程|额度)|(?:任务书.{0,8}(?:派发|派单|接单|转发|低峰|调度)|交付流水|派单回执|验收流水)|(?:batch[_ -]?id|record[_ -]?sha256|input[_ -]?sha256|source[_ -]?sha256)|wb_[a-f0-9]{20}|(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])|(?:batch|hash|sha-?256)\s*[:：=]|(?:Hy4\s*preview|gpt-6[\w.-]*|DeepSeek-V4[\w.-]*)|(?:额度|token).{0,8}(?:耗尽|上限|重置|不足|切换|已用)|(?:已用|剩余).{0,8}(?:额度|token)|/(?:private/tmp|tmp|var/folders|Volumes|mnt)/',re.I)

def plain(value, maximum=300, minimum=1):
    if not isinstance(value,str) or not minimum<=len(value)<=maximum or BAD.search(value) or any(unicodedata.category(c) in ('Cc','Cf','Cs') for c in value):
        raise ValueError('invalid plain text or prohibited content')
    return value

def public_plain(value, maximum=300, minimum=1):
    plain(value,maximum,minimum)
    if PROCESS.search(value):raise ValueError('private process marker in reader text')
    return value

def item_shape(item):
    if not isinstance(item,dict) or set(item)!=FIELDS:raise ValueError('item fields')
    for v in item.values():plain(v)
    public_plain(item['title'],minimum=8);public_plain(item['issuer'],minimum=4);public_plain(item['source_excerpt'],160,10);public_plain(item['publication_evidence'])
    if not re.search(r'储能|电力|电价|电网|新能源|虚拟电厂|需求响应|绿电直连|零碳园区|零碳工厂|绿证|能源保供|绿色算力|算电协同',item['title']+item['source_excerpt']):raise ValueError('outside energy relevance vocabulary')
    url=urlcheck(item['source_url'])
    if url!=item['source_url'] or item['id']!='wb_'+digest(url.encode())[:20]:raise ValueError('noncanonical URL or ID')
    if item['category'] not in ('policy','notice') or not HEX.fullmatch(item['source_sha256']):raise ValueError('category or SHA')
    pub=dt.date.fromisoformat(item['published_date'])
    if pub.isoformat()!=item['published_date']:raise ValueError('noncanonical date')
    collected=timestamp(item['collected_at'])
    if pub>collected.astimezone(SH).date() or collected.year<2020:raise ValueError('publication after collection or placeholder time')
    if not re.search(LABEL,item['publication_evidence']) or not date_in_text(item['published_date'],item['publication_evidence']):raise ValueError('publication evidence')
    return pub,collected

def batch_shape(batch,now):
    if not isinstance(batch,dict) or set(batch)!=TOP or type(batch['schema']) is not int or batch['schema']!=1:raise ValueError('batch schema/fields')
    if not isinstance(batch['batch_id'],str) or not re.fullmatch(r'WB-\d{8}-\d{3}',batch['batch_id']):raise ValueError('batch id')
    if batch['mode'] not in ('daily','backfill'):raise ValueError('mode')
    created=timestamp(batch['created_at'])
    if created>now or created.year<2020 or created.astimezone(SH).strftime('%Y%m%d')!=batch['batch_id'][3:11]:raise ValueError('batch time/id')
    if not isinstance(batch['items'],list) or not 1<=len(batch['items'])<=4:raise ValueError('item count')
    return created

def empty_state():return {'schema':1,'records':[],'history':[],'receipts':[],'daily_counts':{}}

def trusted_identities(data,layer):
    """Trusted main only. Explicit associated sources never establish original identity."""
    known={};identities=[];roles={}
    for s in layer['source_links']:
        roles.setdefault((s['policy_id'],s['url']),set()).add(s['role'])
    def add(url,title,code,issuer='',published=''):
        entry={'source_url':url,'title':normalize(title),'formal_id':code,'issuer':normalize(issuer),'published_date':published}
        identities.append(entry)
        try:url=urlcheck(url)
        except ValueError:return
        known.setdefault(url,[]).append(entry)
    for code,d in data['docs'].items():
        url=d.get('url','');rs=roles.get((code,url),set())
        if not rs or any(r.startswith('ORIGINAL_') for r in rs):add(url,d['title'],code,d.get('issuer',''),d.get('published',''))
    for s in layer['source_links']:
        if s['role'].startswith('ORIGINAL_') and s['policy_id'] in data['docs']:add(s['url'],data['docs'][s['policy_id']]['title'],s['policy_id'],data['docs'][s['policy_id']].get('issuer',''),data['docs'][s['policy_id']].get('published',''))
    for n in layer.get('notices',[]):add(n['source_url'],n['title'],n['id'],n.get('issuer',''),n.get('published_at',''))
    return {'by_url':known,'identities':identities}

def check_batch(batch,state,now,fetcher=fetch,known=None):
    now=now.astimezone(SH);created=batch_shape(batch,now)
    state=copy.deepcopy(state or empty_state());validate_live(state)
    batchhash=digest(canonical(batch));prior=state['receipts']
    for r in prior:
        if r['batch_id']==batch['batch_id']:
            if r['input_sha256']!=batchhash:raise ValueError('batch id reused with different content')
            return state,{'batch_id':batch['batch_id'],'status':'duplicate','items':r['items']}
    records=state['records'];versions=state['history'];results=[];day=now.date().isoformat();used=state['daily_counts'].get(day,0)
    submitted=[i.get('id') for i in batch['items'] if isinstance(i,dict)]
    for item in batch['items']:
        try:
            pub,collected=item_shape(item)
            if submitted.count(item['id'])!=1:raise ValueError('duplicate id in batch')
            if collected>created or created>now or collected>now:raise ValueError('future collection/batch time')
            if now-collected>dt.timedelta(hours=48):raise ValueError('late collection receipt over 48 hours; manual queue')
            age=(now.date()-pub).days
            if age<0 or age>(2 if batch['mode']=='daily' else 30):raise ValueError('publication outside Shanghai calendar window')
            identity=(known or {}).get('by_url',known or {}).get(item['source_url'],[])
            if identity:
                if any(x['title']==normalize(item['title']) for x in identity):raise ValueError('duplicate trusted main source and title; use formal record')
                raise ValueError('trusted source URL has different document title; manual identity conflict')
            for candidate in (known or {}).get('identities',[]):
                if candidate['source_url']!=item['source_url'] and candidate['title']==normalize(item['title']) and candidate['published_date']==item['published_date'] and (not candidate['issuer'] or candidate['issuer']==normalize(item['issuer'])):raise ValueError('possible trusted-main duplicate at another URL; manual role/issuer review')
            record_sha=digest(canonical(item));old=next((r for r in records if r['id']==item['id']),None)
            if old and old['record_sha256']==record_sha:
                results.append({'id':item['id'],'status':'unchanged','record_sha256':record_sha});continue
            # Different official URLs, same title/issuer/date: manual duplicate identity review.
            if any(r['source_url']!=item['source_url'] and all(normalize(r[k])==normalize(item[k]) for k in ('title','issuer','published_date')) for r in records):raise ValueError('same document identity at another URL; manual review')
            if not old and used>=12:raise ValueError('daily new-item limit')
            data,charset=fetcher(item['source_url']);proof=page_check(item,data,charset)
            record=dict(item,record_sha256=record_sha,gate_checked_at=now.isoformat(),review_state='pending',mode=batch['mode'],source_check=proof)
            if old:records.remove(old)
            else:used+=1
            records.append(record);versions.append({'id':item['id'],'record_sha256':record_sha,'received_day':day,'kind':'update' if old else 'new','record':record})
            results.append({'id':item['id'],'status':'accepted_pending_review','record_sha256':record_sha,**proof})
        except (ValueError,TypeError,KeyError,OSError,http.client.HTTPException):
            # Fixed reason messages only: never echo HTML, arbitrary exception values or secrets.
            import sys
            error=sys.exc_info()[1];reason=str(error)
            allowed_reason=reason if isinstance(error,ValueError) and 0<len(reason)<180 and not BAD.search(reason) else 'source fetch/validation failed'
            raw_id=item.get('id','') if isinstance(item,dict) else ''
            safe_id=raw_id if isinstance(raw_id,str) and re.fullmatch(r'wb_[0-9a-f]{20}',raw_id) else ''
            results.append({'id':safe_id,'status':'rejected','reason':allowed_reason})
    cutoff=now.date()-dt.timedelta(days=89)
    records[:]=[r for r in records if timestamp(r['gate_checked_at']).astimezone(SH).date()>=cutoff][-600:]
    versions[:]=[r for r in versions if dt.date.fromisoformat(r['received_day'])>=cutoff][-2400:]
    state['daily_counts']={k:v for k,v in state['daily_counts'].items() if dt.date.fromisoformat(k)>=cutoff};state['daily_counts'][day]=used
    status='passed' if all(x['status']!='rejected' for x in results) else ('partial' if any(x['status']!='rejected' for x in results) else 'rejected')
    receipt={'batch_id':batch['batch_id'],'input_sha256':batchhash,'checked_at':now.isoformat(),'status':status,'items':results};prior.append(receipt);state['receipts']=prior[-2400:]
    validate_live(state);return state,receipt

def validate_record(r):
    if not isinstance(r,dict) or set(r)!=FIELDS|RECORD_EXTRA:raise ValueError('record fields')
    original={k:r[k] for k in FIELDS};item_shape(original)
    if r['record_sha256']!=digest(canonical(original)) or r['review_state']!='pending' or r['mode'] not in ('daily','backfill'):raise ValueError('record hash/state')
    checked=timestamp(r['gate_checked_at']);collected=timestamp(r['collected_at'])
    if checked<collected:raise ValueError('gate before collection')
    proof=r['source_check']
    if not isinstance(proof,dict) or set(proof)!=PROOF_FIELDS:raise ValueError('source check fields')
    if proof['source_sha256_declared']!=r['source_sha256'] or not isinstance(proof['source_sha256_fetched'],str) or not HEX.fullmatch(proof['source_sha256_fetched']) or type(proof['bytes_changed']) is not bool or proof['bytes_changed']!=(proof['source_sha256_declared']!=proof['source_sha256_fetched']) or type(proof['fetched_bytes']) is not int or not 1<=proof['fetched_bytes']<=2097152 or proof['match']!=MATCH:raise ValueError('source check invalid')
    return r

def validate_live(state):
    if not isinstance(state,dict) or set(state)!={'schema','records','history','receipts','daily_counts'} or type(state['schema']) is not int or state['schema']!=1:raise ValueError('state schema')
    for key,limit in [('records',600),('history',2400),('receipts',2400)]:
        if not isinstance(state[key],list) or len(state[key])>limit:raise ValueError('state bounds')
    seen=set()
    for r in state['records']:
        validate_record(r)
        if r['id'] in seen:raise ValueError('duplicate record')
        seen.add(r['id'])
    if not isinstance(state['daily_counts'],dict) or len(state['daily_counts'])>90:raise ValueError('daily counts')
    for day,n in state['daily_counts'].items():
        if dt.date.fromisoformat(day).isoformat()!=day or type(n) is not int or not 0<=n<=12:raise ValueError('daily counts')
    for h in state['history']:
        if not isinstance(h,dict) or set(h)!={'id','record_sha256','received_day','kind','record'} or h['kind'] not in ('new','update'):raise ValueError('history fields')
        validate_record(h['record']);day=dt.date.fromisoformat(h['received_day'])
        if h['id']!=h['record']['id'] or h['record_sha256']!=h['record']['record_sha256'] or day!=timestamp(h['record']['gate_checked_at']).astimezone(SH).date():raise ValueError('history identity/date')
    batch_ids=set()
    for receipt in state['receipts']:
        if not isinstance(receipt,dict) or set(receipt) not in ({'batch_id','input_sha256','checked_at','status','items'},{'batch_id','input_sha256','checked_at','status','items','inbox_commit'}):raise ValueError('receipt fields')
        if not isinstance(receipt['batch_id'],str) or not re.fullmatch(r'WB-\d{8}-\d{3}',receipt['batch_id']) or receipt['batch_id'] in batch_ids or not isinstance(receipt['input_sha256'],str) or not HEX.fullmatch(receipt['input_sha256']) or receipt['status'] not in ('passed','partial','rejected') or not isinstance(receipt['items'],list) or not 1<=len(receipt['items'])<=4:raise ValueError('receipt values')
        batch_ids.add(receipt['batch_id']);timestamp(receipt['checked_at'])
        if 'inbox_commit' in receipt and not re.fullmatch(r'[a-f0-9]{40}',receipt['inbox_commit']):raise ValueError('commit invalid')
        for result in receipt['items']:
            if not isinstance(result,dict) or result.get('status') not in ('rejected','unchanged','accepted_pending_review'):raise ValueError('result invalid')
            allowed={'id','status','reason'} if result['status']=='rejected' else ({'id','status','record_sha256'} if result['status']=='unchanged' else {'id','status','record_sha256'}|PROOF_FIELDS)
            if set(result)!=allowed:raise ValueError('result fields')
            if result['status']=='rejected':plain(result['reason'],180)
            elif not isinstance(result['record_sha256'],str) or not HEX.fullmatch(result['record_sha256']):raise ValueError('result SHA')
    return state

def validate_reviews(reviews,formal_ids=None):
    if not isinstance(reviews,dict) or set(reviews)!={'schema','reviews'} or type(reviews['schema']) is not int or reviews['schema']!=1 or not isinstance(reviews['reviews'],list) or len(reviews['reviews'])>2400:raise ValueError('reviews schema')
    seen=set()
    for r in reviews['reviews']:
        if not isinstance(r,dict) or set(r)-{'id','record_sha256','status','note','formal_id','correction'} or not {'id','record_sha256','status'}<=set(r):raise ValueError('review fields')
        if r['status'] not in ('accepted','corrected','withdrawn') or not isinstance(r['id'],str) or not re.fullmatch(r'wb_[0-9a-f]{20}',r['id']) or not isinstance(r['record_sha256'],str) or not HEX.fullmatch(r['record_sha256']):raise ValueError('review identity/status')
        k=(r['id'],r['record_sha256'])
        if k in seen:raise ValueError('duplicate version review')
        seen.add(k)
        if 'note' in r:public_plain(r['note'])
        if r['status']!='accepted' and not r.get('note'):raise ValueError('correction/withdrawal requires note')
        if 'formal_id' in r and (not isinstance(r['formal_id'],str) or not re.fullmatch(r'ZC[A-Z0-9]{2,20}',r['formal_id']) or formal_ids is not None and r['formal_id'] not in formal_ids):raise ValueError('unknown formal reference')
        if r['status']=='corrected':
            c=r.get('correction')
            if not isinstance(c,dict) or not c or set(c)-{'title','issuer','published_date','source_excerpt','category'}:raise ValueError('correction fields')
            for key,value in c.items():
                public_plain(value,160 if key=='source_excerpt' else 300)
                if key=='category' and value not in ('policy','notice'):raise ValueError('correction category')
                if key=='published_date' and dt.date.fromisoformat(value).isoformat()!=value:raise ValueError('correction date')
        elif 'correction' in r:raise ValueError('correction on other status')
    return reviews

def apply_reviews(state,reviews):
    validate_live(state);validate_reviews(reviews)
    bykey={(r['id'],r['record_sha256']):r for r in reviews['reviews']}
    return [{'record':r,'review':bykey.get((r['id'],r['record_sha256']))} for r in state['records']]
