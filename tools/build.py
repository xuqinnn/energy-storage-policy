"""Portable, fail-closed public build. Python standard library only; no keys or private workbook.

Local: python publish_build.py --input <reviewed-public.json> --out <new-directory>
Public repo: python tools/build.py --input data/storage.json --out /tmp/energy-site
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
from datetime import date
import re
import importlib.util

HERE = Path(__file__).resolve().parent
ROOT = HERE if (HERE / 'index.html').is_file() else HERE.parent
WEB_FILES = ['assets/wb-feed.js'] + ['assets/research-ui.css', 'assets/vendor/open-props-1.7.23.min.css', 'assets/vendor/tabler-icons.js', 'assets/vendor/OPEN-PROPS-LICENSE.txt', 'assets/vendor/TABLER-LICENSE.txt', 'assets/vendor/DESIGN-SOURCES.json'] + ['index.html', 'assets/app.js', 'assets/storage-math.js', 'assets/app.css', 'assets/vendor/echarts.min.js', 'assets/vendor/LICENSE', 'assets/vendor/NOTICE']
DOC_FILES = ['content/reply-insights.json', 'tests/test_reply_insights.py', 'content/reading-notes.json', 'README.md', 'LICENSE', 'LICENSE-DATA.md', 'CONTRIBUTING.md', 'ASSETS.json', '.gitignore', 'examples/synthetic.json', 'tests/test_public.py', 'tests/test_storage_math.js', 'examples/method-arithmetic.json', 'tools/park_examples.py', 'examples/park-scenarios.json', 'tests/test_park_examples.py']
WEB_FILES += ['assets/content-model.js']
DOC_FILES += ['content/content-layer.json','tests/test_content_layer.py','tests/test_content_model.js','tests/test_daily_brief.py','tests/test_daily_model.js']
DOC_FILES += ['content/wb-feed-reviews.json','content/wb-feed-snapshot.json','tools/wb_feed_guard.py','tools/wb_feed_runtime.py','tests/test_wb_feed.py','tests/test_wb_feed.js','.github/workflows/wb-feed.yml','WB-FEED.md']
ALLOWED_TOP = {'meta','metrics','provinces','docs','cards','events','dev','diff','score','example','briefs','links','tags','tagdocs','methods','lib','research','learning','stats','mech','topics','topicmap','synthetic_example','public_guides','topic_learning'}

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_snapshot(data):
    errors = []
    if set(data) - ALLOWED_TOP: errors.append('unapproved top-level fields')
    if data.get('meta', {}).get('access') != 'public-free' or not data.get('meta', {}).get('public'): errors.append('not a public-free snapshot')
    if data.get('example') or data.get('score') or data.get('cards') or data.get('dev'): errors.append('legacy derived blocks require separate review; not permitted in C1')
    if data.get('meta', {}).get('dataset') not in ('public-reviewed', 'synthetic'): errors.append('missing dataset classification')
    txt = json.dumps(data, ensure_ascii=False)
    # 原句标题重影中的‘交易储能’并非原企业名，扫描时只消除此跨词命中，原句不改。
    scan_txt = txt.replace('交易储能', '交易 储能')
    for token in ('ZCQY', 'ZCSN16', '/Users/', 'file://', '资料库（易储）', '易储', 'yichu-site-key-', 'data.enc.json'):
        if token in scan_txt: errors.append('excluded content: ' + token)
    for code, fields in data.get('provinces', {}).items():
        if any(k in fields for k in ('⑧c11', '⑧c13', '⑧c16', '⑧c44', '②c2')): errors.append('unreviewed project/market parameter: ' + code)
    guides=data.get('public_guides', [])
    if not isinstance(guides,list): errors.append('invalid public guides')
    else:
        ids=[]
        for guide in guides:
            if not isinstance(guide,dict) or set(guide)!={'id','title','md'} or guide.get('id') not in ('read-policy','capacity-cost','services') or not isinstance(guide.get('md'),str) or len(guide.get('md',''))<10: errors.append('unreviewed public guide schema')
            else: ids.append(guide['id'])
        if len(ids)!=len(set(ids)):errors.append('duplicate public guide')
    docs = data.get('docs', {})
    if data.get('topic_learning'):
        try:validate_topic_learning(data['topic_learning'],docs)
        except ValueError as error:errors.append(str(error))
    for row in data.get('lib', []):
        if not str(row[0]).startswith('ZC') or str(row[0]).startswith('ZCQY'): errors.append('research/company mixed into policy')
    for e in data.get('events', []):
        if not docs.get(e['code'], {}).get('summary'): errors.append('recent policy lacks summary: ' + e['code'])
    for t in data.get('learning', []):
        if set(t['codes']) - set(docs): errors.append('unknown learning reference')
    demo = data.get('synthetic_example', {})
    if demo.get('kind') != 'synthetic' or not demo.get('inputs'): errors.append('missing explicit synthetic example')
    if data.get('meta',{}).get('dataset')=='public-reviewed':
        validate_core_analyses(data)
    if errors: raise ValueError('; '.join(errors))
    return copy.deepcopy(data)


def validate_core_analyses(data):
    rows=[b for b in data.get('briefs',[]) if b.get('编号') in CORE_ANALYSIS_IDS]
    if len(rows)!=4 or {b['编号'] for b in rows}!=CORE_ANALYSIS_IDS:raise ValueError('core analyses: missing or duplicate identity')
    encoded=json.dumps(sorted(rows,key=lambda b:b['编号']),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
    if hashlib.sha256(encoded).hexdigest()!=CORE_ANALYSES_SHA:raise ValueError('core analyses: independent approved content changed')
    for b in rows:
        if set(b)!={'编号','标题','文号','发文日期','官网公开日期','分析验收','概述','状态标签','省份','依据','完整分析'}:raise ValueError('core analyses: private or missing fields')
        body=b['完整分析'];evidence=b['依据'];code=b['编号'];d=data['docs'][code]
        if b['分析验收']!='完整' or len(body['章节'])<5 or len(evidence)<8:raise ValueError('core analyses: incomplete body or evidence')
        if any(d.get(k)!=b[v] for k,v in [('summary','概述'),('date','发文日期'),('published','官网公开日期')]):raise ValueError('core analyses: metadata or summary drift')
        for section in body['章节']:
            if not section['段落'] or not section['依据索引'] or any(type(i)is not int or i<0 or i>=len(evidence) for i in section['依据索引']):raise ValueError('core analyses: section evidence missing')
        for e in evidence:
            if set(e)!={'编号','页','条款','原句'} or e['编号']!=code or type(e['页'])is not int or e['页']<1:raise ValueError('core analyses: unreviewed evidence')
        if any(not re.match(r'^#/(methods|tools|park-demo)',href) for href in body['方法链接']):raise ValueError('core analyses: unreviewed method route')


def validate_topic_learning(pack,docs):
    if not isinstance(pack,dict) or set(pack)!={'schema_version','language','topics','lessons'}:raise ValueError('unreviewed topic learning fields')
    topics=pack['topics'];lessons=pack['lessons'];names={'储能','绿电直连','零碳园区','零碳工厂','虚拟电厂'}
    if len(topics)!=5 or {t['name'] for t in topics}!=names or len(lessons)!=14 or {l['id'] for l in lessons}!={f'tl-{i:02d}' for i in range(1,15)}:raise ValueError('topic/lesson mapping incomplete')
    topic_fields={'name','title','audience','goal','intro','sections','lesson_ids','route','lesson_contexts'}
    lesson_fields={'id','source_theme','title','primary_topic','topic_ids','question','sections','misconceptions','exercise','links','public_boundary','related_lessons'}
    for topic in topics:
        if set(topic)!=topic_fields or len(topic['sections'])<3 or not topic['lesson_ids']:raise ValueError('topic introduction incomplete or private fields')
        if set(topic['lesson_ids'])-{l['id'] for l in lessons}:raise ValueError('unknown mapped lesson')
    if set().union(*(set(t['lesson_ids']) for t in topics))!={l['id'] for l in lessons}:raise ValueError('unmapped lesson')
    for lesson in lessons:
        if set(lesson)!=lesson_fields or len(lesson['sections'])<3 or lesson['primary_topic'] not in names or set(lesson['topic_ids'])-names:raise ValueError('lesson fields or content incomplete')
        if not lesson['misconceptions'] or not lesson['exercise'].get('prompt') or len(lesson['exercise'].get('answer_points',[]))<2:raise ValueError('lesson exercise incomplete')
        for link in lesson['links']:
            if not isinstance(link.get('href'),str) or not re.match(r'^(#/|https?://)',link['href']):raise ValueError('unsafe lesson route')
            if link.get('policy_id') and link['policy_id'] not in docs:raise ValueError('lesson references absent public document')
    for item in topics+lessons:
        for section in item['sections']:
            if set(section)!={'title','paragraphs'} or not section['paragraphs'] or not all(isinstance(t,str) and len(t)>20 for t in section['paragraphs']):raise ValueError('lesson section incomplete')
    raw=json.dumps(pack,ensure_ascii=False)
    if any(token in raw for token in ('/Users/','file://','source_sha256','input_sha256','workbook_sha256')) or re.search(r'<[!/a-zA-Z]',raw):raise ValueError('private or unsafe lesson payload')
    return pack


def validate_method_examples(path):
    if digest(path) != '1973fc2ea58a578f13f229d142a27291f1c24c969fd4b16084190fe2dfcf236d':raise ValueError('unreviewed method examples; fixture SHA changed')
    return json.loads(Path(path).read_text(encoding='utf-8'))


def validate_park_examples(path):
    if digest(path) != '47e55be8e1d5ca2e025a5ed79184c282b2d1e55c94310698f1b4d0d1b23cb5ef':raise ValueError('unreviewed park examples; fixture SHA changed')
    return json.loads(Path(path).read_text(encoding='utf-8'))


def validate_reading_notes(path):
    if digest(path) != 'b263935471dfb51749d4cc608d6206095eb20fb5b1e45fa6a2f835a3eb2bd317':
        raise ValueError('unreviewed reading notes; content SHA changed')
    return json.loads(Path(path).read_text(encoding='utf-8'))


REPLY_CONTENT_SHA = '3ebf7946dea944b3ac49ed0451947d1d24f65c1175e61439f52e60fc5db6cf8f'
REPLY_SOURCES = {
 'RPLY-NEA-20260630-4106':'https://www.nea.gov.cn/20260803/2eaa886b47074aa395ff974d7895494f/c.html',
 'RPLY-NEA-20260630-7948':'https://www.nea.gov.cn/20260724/e663dba5f6274b6abf267dac57dcd6c4/c.html',
}
REPLY_FIELDS = {'id','title','source_kind','issuer','reply_title','reply_number','date_precision','first_publication_date_status','evidence_check_scope','reply_issued_at','official_page_publishdate','first_publication_date','source_url','quote','source_anchor','summary','our_analysis','boundary','tags','region_scope','verified_region_codes','policy_ids','reviewed_on','evidence_checks'}

def validate_reply_schema(payload):
    if not isinstance(payload,dict) or set(payload)!={'schema','items'} or payload['schema']!=1 or not isinstance(payload['items'],list):
        raise ValueError('reply schema: unexpected fields or envelope')
    ids=[]
    for item in payload['items']:
        if not isinstance(item,dict) or set(item)!=REPLY_FIELDS:raise ValueError('reply schema: internal or unknown fields')
        code=item['id'];ids.append(code)
        if code not in REPLY_SOURCES or item['source_url']!=REPLY_SOURCES[code]:raise ValueError('reply schema: unreviewed source/id')
        for key in REPLY_FIELDS-{'tags','verified_region_codes','policy_ids','evidence_checks','first_publication_date'}:
            if not isinstance(item[key],str) or not item[key].strip():raise ValueError('reply schema: missing text '+key)
        for key in ('reply_issued_at','official_page_publishdate','reviewed_on'):
            try:date.fromisoformat(item[key])
            except (ValueError,TypeError):raise ValueError('reply schema: invalid date')
        if item['reply_issued_at']!='2026-06-30' or item['official_page_publishdate']!='2026-06-30' or item['first_publication_date'] is not None:raise ValueError('reply schema: unreviewed date inference')
        if item['date_precision']!='day' or item['first_publication_date_status']!='NOT_ESTABLISHED_BY_URL_OR_CURRENT_META':raise ValueError('reply schema: unreviewed date semantics')
        if item['source_kind'] not in ('人大建议答复','政协提案答复'):raise ValueError('reply schema: not a reply')
        for key in ('tags','verified_region_codes','policy_ids'):
            if not isinstance(item[key],list) or any(not isinstance(v,str) for v in item[key]) or len(set(item[key]))!=len(item[key]):raise ValueError('reply schema: invalid mapping')
        if any(v!='安徽' for v in item['verified_region_codes']) or (code.endswith('7948') and item['verified_region_codes']):raise ValueError('reply schema: unreviewed province broadcast')
        if any(not re.fullmatch(r'ZC[A-Z]+\d+',v) for v in item['policy_ids']):raise ValueError('reply schema: invalid policy reference')
        flags=item['evidence_checks']
        if not isinstance(flags,dict) or set(flags)!={'source_verified','cited_policies_verified','project_applicability_verified'} or any(type(v) is not bool for v in flags.values()):raise ValueError('reply schema: evidence levels must be separate')
        text=json.dumps(item,ensure_ascii=False)
        if any(t in text for t in ('/Users/','file://','source_evidence_path','original_locator','publication_status')) or re.search(r'<[!/a-zA-Z]',text):raise ValueError('reply schema: internal content or unsafe markup')
    if len(ids)!=len(set(ids)):raise ValueError('reply schema: duplicate reply id')
    return payload


def validate_reply_insights(path):
    if digest(path)!=REPLY_CONTENT_SHA:raise ValueError('unreviewed reply insights; content SHA changed')
    return validate_reply_schema(json.loads(Path(path).read_text(encoding='utf-8')))


CONTENT_LAYER_SHA = 'd935b83861a8bb76633803f08d65ed6efe5089b8b0ad3a119c142478c13362b8'
CORE_ANALYSIS_IDS = {'ZCGJ13','ZCGJ120','ZCGJ03','ZCGJ04'}
CORE_ANALYSES_SHA = '2771497116d19595f252645ff8ca8074395fdd71fbaf8093a452b9a1cf494dd1'
CONTENT_CLASS_IDS = CORE_ANALYSIS_IDS | {'ZCGJ45','ZCGJ110','ZCSN34','ZCGX34','ZCHEB52','ZCLN37','ZCSD45','ZCAH63','ZCTJ19','ZCSH43','ZCSD53','ZCXJ32'}
NOTICE_FIELDS = {'id','content_type','subtype','title','issuer','importance','importance_reason','issued_at','published_at','publication_date_basis','first_publication_date','event_at','summary','our_analysis','quote','source_url','source_access_note','corroborating_url','boundary','region_scope','verified_region_codes','policy_ids','cited_document_number','cited_document_verification'}
SOURCE_ROLES = {'ORIGINAL_PUBLICATION_OR_ATTACHMENT','ORIGINAL_EXPLANATORY_ATTACHMENT','OFFICIAL_RELEASE_REPORT','OFFICIAL_INSTITUTION_REPRINT','OFFICIAL_INTERPRETATION','OFFICIAL_REPRINT_ATTACHMENT','OFFICIAL_ANALYSIS_MENTION_ONLY'}

def validate_content_schema(layer):
    if not isinstance(layer,dict) or set(layer)!={'schema','notices','classifications','source_links','source_gaps'} or layer['schema']!=1:
        raise ValueError('content layer schema: envelope')
    if any(not isinstance(layer[k],list) for k in ('notices','classifications','source_links','source_gaps')):
        raise ValueError('content layer schema: arrays')
    if len(layer['notices'])!=1:raise ValueError('content layer schema: one reviewed new notice')
    notice=layer['notices'][0]
    if not isinstance(notice,dict) or set(notice)!=NOTICE_FIELDS:raise ValueError('content layer schema: internal or missing notice fields')
    if notice['id']!='NTF-GZPEC-20261024-FORMAL' or notice['content_type']!='notice' or type(notice['importance']) is not int or notice['importance']!=5:
        raise ValueError('content layer schema: unreviewed notice identity or importance')
    if notice['first_publication_date'] is not None or notice['verified_region_codes']!=[] or notice['policy_ids']!=[]:
        raise ValueError('content layer schema: unreviewed first publication, province or policy mapping')
    for key in NOTICE_FIELDS-{'importance','first_publication_date','verified_region_codes','policy_ids'}:
        if not isinstance(notice[key],str) or not notice[key].strip():raise ValueError('content layer schema: missing text '+key)
    for key in ('issued_at','published_at','event_at'):
        try:date.fromisoformat(notice[key])
        except (ValueError,TypeError):raise ValueError('content layer schema: invalid date')
        if notice[key]!='2026-10-24':raise ValueError('content layer schema: unreviewed date')
    if not notice['source_url'].startswith('https://mp.weixin.qq.com/s?') or not notice['corroborating_url'].startswith('https://www.nea.gov.cn/'):
        raise ValueError('content layer schema: unreviewed notice sources')
    seen=set()
    for item in layer['classifications']:
        if not isinstance(item,dict) or set(item)!={'id','canonical_document_id','content_type','subtype','importance','importance_reason','classification_basis','evidence_scope'}:
            raise ValueError('content layer schema: classification fields')
        code=item['id']
        if code in seen or code not in CONTENT_CLASS_IDS or code!=item['canonical_document_id']:raise ValueError('content layer schema: duplicate or unknown identity')
        seen.add(code)
        if item['content_type']!=('policy' if code in ({'ZCAH63','ZCSH43','ZCSD53','ZCXJ32'} | CORE_ANALYSIS_IDS) else 'notice') or type(item['importance']) is not int or not 1<=item['importance']<=5:
            raise ValueError('content layer schema: unreviewed classification or rating')
        if not all(isinstance(item[k],str) and item[k].strip() for k in ('subtype','importance_reason','classification_basis','evidence_scope')):raise ValueError('content layer schema: missing classification boundary')
    if seen!=CONTENT_CLASS_IDS:raise ValueError('content layer schema: incomplete reviewed labels')
    expected_ratings={'ZCGJ13':3,'ZCGJ120':4,'ZCGJ03':5,'ZCGJ04':5,'ZCGJ45':5,'ZCGJ110':4,'ZCSN34':4,'ZCGX34':4,'ZCHEB52':3,'ZCLN37':3,'ZCSD45':4,'ZCAH63':4,'ZCTJ19':3,'ZCSH43':4,'ZCSD53':4,'ZCXJ32':4}
    if {x['id']:x['importance'] for x in layer['classifications']}!=expected_ratings:raise ValueError('content layer schema: unreviewed importance revision')
    gaps=layer['source_gaps']
    if len(gaps)!=1 or not isinstance(gaps[0],dict) or set(gaps[0])!={'id','boundary'} or gaps[0]['id']!='ZCMD22' or not isinstance(gaps[0]['boundary'],str) or not gaps[0]['boundary'].strip():raise ValueError('content layer schema: held source gap missing or changed identity')
    seen=set();original=0
    for link in layer['source_links']:
        if not isinstance(link,dict) or set(link)!={'policy_id','url','role'}:raise ValueError('content layer schema: source fields')
        if link['policy_id'] in seen or not re.fullmatch(r'ZC[A-Z]+\d+',link['policy_id']):raise ValueError('content layer schema: duplicate source identity')
        seen.add(link['policy_id'])
        if link['role'] not in SOURCE_ROLES or not isinstance(link['url'],str) or not re.match(r'^https?://',link['url']):raise ValueError('content layer schema: source role or URL')
        original+=link['role'].startswith('ORIGINAL_')
        if link['policy_id'] in {'ZCAH14','ZCAH16','ZCAH17','ZCAH18','ZCGJ175','ZCHEB60'} and link['role'].startswith('ORIGINAL_'):
            raise ValueError('content layer schema: related source promoted to original')
    if len(seen)!=31 or original!=25:raise ValueError('content layer schema: expected 25 original / 6 related links')
    text=json.dumps(layer,ensure_ascii=False)
    if any(token in text for token in ('/Users/','file://','source_path','source_raw_sha256','raw_path','workbook_written')) or re.search(r'<[!/a-zA-Z]',text):
        raise ValueError('content layer schema: private fields or unsafe markup')
    return copy.deepcopy(layer)

def validate_content_layer(path):
    if digest(path)!=CONTENT_LAYER_SHA:raise ValueError('unreviewed content layer; SHA changed')
    return validate_content_schema(json.loads(Path(path).read_text(encoding='utf-8')))


def assemble_daily(data, layer, replies):
    """Derive a public canonical reading index; never classify unreviewed legacy rows.

    Fixed snapshot timestamps preserve deterministic rebuilds. The browser computes
    today's date in Asia/Shanghai rather than treating the build date as today.
    """
    docs=data.get('docs',{}); briefs={b['编号']:b for b in data.get('briefs',[])}
    if data['meta'].get('dataset')=='synthetic':
        layer={'classifications':[],'notices':[],'source_links':[],'source_gaps':[]};replies=[]
    links={s['policy_id']:s for s in layer['source_links']}
    collected={r[0]:r[8] for r in data.get('lib',[]) if len(r)>8}
    records={}
    def valid_day(value):
        try:return date.fromisoformat(value).isoformat() if isinstance(value,str) and len(value)==10 else ''
        except ValueError:return ''
    def stamp(event='', published='', issued='', landed=''):
        for value,basis,label in [(event,'event','事件日'),(published,'published','该页公开日'),(issued,'issued','成文/索引日（公开日未核）'),(landed,'collected','收录日（历史补录，非新发）')]:
            if valid_day(value):return value,basis,label
        return '','unknown','日期未确认'
    def add(record, event='', published='', issued='', landed=''):
        canonical=record['canonical_document_id']
        if canonical in records:return
        day,basis,label=stamp(event,published,issued,landed)
        record.update(display_date=day,date_basis=basis,date_label=label,publication_verified=basis in ('event','published'),issued_at=valid_day(issued),published_at=valid_day(published),event_at=valid_day(event))
        if record['source_url'] and not re.match(r'^https?://',record['source_url']):raise ValueError('daily index unsafe source')
        records[canonical]=record
    for c in layer['classifications']:
        canonical=c['canonical_document_id'];d=docs.get(canonical)
        if not d or canonical in {g['id'] for g in layer['source_gaps']}:continue
        b=briefs.get(canonical,{});s=links.get(canonical)
        source_url=s['url'] if s else d.get('url','')
        source_label=('官方原发布页/附件' if s['role'].startswith('ORIGINAL_') else '官方关联来源（不替代原件）') if s else '官方来源'
        classification_only='无新增完整内容' in c['evidence_scope']
        summary=c['classification_basis'] if c['content_type']=='notice' or classification_only else b.get('概述') or d.get('summary') or c['classification_basis']
        full=not classification_only and b.get('分析验收')=='完整' and bool(b.get('完整分析',{}).get('章节')) and bool(b.get('依据'))
        add({'id':canonical,'canonical_document_id':canonical,'type':c['content_type'],'renderer':'policy','subtype':c['subtype'],'title':d.get('title') or canonical,'summary':summary,'analysis_state':'full' if full else 'summary' if summary else 'index','importance':c['importance'],'status':d.get('status',''),'region':d.get('prov',''),'source_url':source_url,'source_label':source_label,'route':'#/notice/'+canonical if c['content_type']=='notice' else '#/brief/'+canonical},published=d.get('published',''),issued=d.get('date',''),landed=collected.get(canonical,''))
    for n in layer['notices']:
        add({'id':n['id'],'canonical_document_id':n.get('canonical_document_id') or n['id'],'type':'notice','renderer':'notice','subtype':n['subtype'],'title':n['title'],'summary':n['summary'],'analysis_state':'summary','importance':n['importance'],'status':'','region':n['region_scope'],'source_url':n['source_url'],'source_label':'署名公告原页','route':'#/notice/'+n['id']},event=n.get('event_at',''),published=n.get('published_at',''),issued=n.get('issued_at',''))
    for r in replies:
        add({'id':r['id'],'canonical_document_id':r.get('canonical_document_id') or r['id'],'type':'notice','renderer':'reply','subtype':r['source_kind'],'title':r['title'],'summary':r['summary'],'analysis_state':'summary','importance':None,'status':'答复资料','region':'、'.join(r.get('verified_region_codes',[])),'source_url':r['source_url'],'source_label':'官方答复原页','route':'#/notice/'+r['id']},published=r.get('official_page_publishdate',''),issued=r.get('reply_issued_at',''))
    items=sorted(records.values(),key=lambda r:(r['display_date'],r['id']),reverse=True)
    return {'schema':1,'timezone':'Asia/Shanghai','snapshot_version':data['meta']['version'],'snapshot_built_at':data['meta']['exported'],'scope':'仅已审公开政策与公告；该页公开日不等于最早首发；成文/收录索引不计今日新发。','counts':{'policy':sum(r['type']=='policy' for r in items),'notice':sum(r['type']=='notice' for r in items),'important_notice':sum(r['type']=='notice' and r['importance'] is not None and r['importance']>=4 for r in items)},'items':items}

def validate_feed_files(docs,data):
    spec=importlib.util.spec_from_file_location('feed_build_guard',docs/'tools/wb_feed_guard.py')
    guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
    reviews=json.loads((docs/'content/wb-feed-reviews.json').read_text(encoding='utf-8'))
    guard.validate_reviews(reviews,set(data['docs']) if data['meta'].get('dataset')=='public-reviewed' else None)
    snapshot=json.loads((docs/'content/wb-feed-snapshot.json').read_text(encoding='utf-8'))
    # Initial offline snapshot is deliberately empty. A future reviewed local
    # snapshot needs a separate change and acceptance, not a feed data bypass.
    if snapshot!={'schema':1,'updated_at':None,'records':[],'gate_stats':{'pending':0},'recent_batches':[]}:raise ValueError('unreviewed local collection snapshot')
    return reviews,snapshot


def build_package(snapshot, dist, source=ROOT):
    data = validate_snapshot(snapshot); dist = Path(dist); source = Path(source)
    if dist.exists() and any(dist.iterdir()): raise ValueError('output directory must be empty; old files are never deleted')
    dist.mkdir(parents=True, exist_ok=True)
    docs = source / 'open_source' if (source / 'open_source').is_dir() else source
    validate_feed_files(docs,data)
    validate_method_examples(docs/'examples/method-arithmetic.json')
    validate_park_examples(docs/'examples/park-scenarios.json')
    validate_reading_notes(docs/'content/reading-notes.json')
    replies=validate_reply_insights(docs/'content/reply-insights.json')
    content=validate_content_layer(docs/'content/content-layer.json')
    if data['meta'].get('dataset')=='public-reviewed' and any(code not in data['docs'] for r in replies['items'] for code in r['policy_ids']):raise ValueError('reply refers to a policy absent from public snapshot')
    if data['meta'].get('dataset')=='public-reviewed':
        if any(c['id'] not in data['docs'] for c in content['classifications']) or any(s['policy_id'] not in data['docs'] for s in content['source_links']):raise ValueError('content refers to a document absent from public snapshot')
        if content['notices'][0]['id'] in data['docs']:raise ValueError('new notice duplicates existing snapshot identity')
    for f in WEB_FILES + DOC_FILES:
        src = (source if f in WEB_FILES else docs) / f
        dst = dist / f; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src, dst)
    daily=assemble_daily(data,content,replies['items'])
    (dist/'content/daily-brief.json').write_text(json.dumps(daily,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    script = Path(__file__).resolve(); (dist / 'tools').mkdir(exist_ok=True); shutil.copyfile(script, dist / 'tools/build.py')
    (dist / 'data').mkdir(exist_ok=True)
    (dist / 'data/storage.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (dist / '.nojekyll').write_text('')
    paths = sorted(p for p in dist.rglob('*') if p.is_file())
    manifest = {'schema': 1, 'access': 'public-free', 'files_sha256': {p.relative_to(dist).as_posix(): digest(p) for p in paths}}
    (dist / 'BUILD.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,default=ROOT/'data/storage.json'); parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    try:
        result=build_package(json.loads(args.input.read_text(encoding='utf-8')),args.out)
    except (OSError,ValueError,KeyError) as error: parser.exit(1,'Build refused: '+str(error)+'\n')
    print('Public-free source package:',len(result['files_sha256'])+1,'files ->',args.out)

if __name__=='__main__': main()
