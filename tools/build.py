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

HERE = Path(__file__).resolve().parent
ROOT = HERE if (HERE / 'index.html').is_file() else HERE.parent
WEB_FILES = ['assets/research-ui.css', 'assets/vendor/open-props-1.7.23.min.css', 'assets/vendor/tabler-icons.js', 'assets/vendor/OPEN-PROPS-LICENSE.txt', 'assets/vendor/TABLER-LICENSE.txt', 'assets/vendor/DESIGN-SOURCES.json'] + ['index.html', 'assets/app.js', 'assets/storage-math.js', 'assets/app.css', 'assets/vendor/echarts.min.js', 'assets/vendor/LICENSE', 'assets/vendor/NOTICE']
DOC_FILES = ['content/reply-insights.json', 'tests/test_reply_insights.py', 'content/reading-notes.json', 'README.md', 'LICENSE', 'LICENSE-DATA.md', 'CONTRIBUTING.md', 'ASSETS.json', '.gitignore', 'examples/synthetic.json', 'tests/test_public.py', 'tests/test_storage_math.js', 'examples/method-arithmetic.json', 'tools/park_examples.py', 'examples/park-scenarios.json', 'tests/test_park_examples.py']
ALLOWED_TOP = {'meta','metrics','provinces','docs','cards','events','dev','diff','score','example','briefs','links','tags','tagdocs','methods','lib','research','learning','stats','mech','topics','topicmap','synthetic_example','public_guides'}

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
    for row in data.get('lib', []):
        if not str(row[0]).startswith('ZC') or str(row[0]).startswith('ZCQY'): errors.append('research/company mixed into policy')
    for e in data.get('events', []):
        if not docs.get(e['code'], {}).get('summary'): errors.append('recent policy lacks summary: ' + e['code'])
    for t in data.get('learning', []):
        if set(t['codes']) - set(docs): errors.append('unknown learning reference')
    demo = data.get('synthetic_example', {})
    if demo.get('kind') != 'synthetic' or not demo.get('inputs'): errors.append('missing explicit synthetic example')
    if errors: raise ValueError('; '.join(errors))
    return copy.deepcopy(data)


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


def build_package(snapshot, dist, source=ROOT):
    data = validate_snapshot(snapshot); dist = Path(dist); source = Path(source)
    if dist.exists() and any(dist.iterdir()): raise ValueError('output directory must be empty; old files are never deleted')
    dist.mkdir(parents=True, exist_ok=True)
    docs = source / 'open_source' if (source / 'open_source').is_dir() else source
    validate_method_examples(docs/'examples/method-arithmetic.json')
    validate_park_examples(docs/'examples/park-scenarios.json')
    validate_reading_notes(docs/'content/reading-notes.json')
    replies=validate_reply_insights(docs/'content/reply-insights.json')
    if data['meta'].get('dataset')=='public-reviewed' and any(code not in data['docs'] for r in replies['items'] for code in r['policy_ids']):raise ValueError('reply refers to a policy absent from public snapshot')
    for f in WEB_FILES + DOC_FILES:
        src = (source if f in WEB_FILES else docs) / f
        dst = dist / f; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src, dst)
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
