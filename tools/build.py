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

HERE = Path(__file__).resolve().parent
ROOT = HERE if (HERE / 'index.html').is_file() else HERE.parent
WEB_FILES = ['index.html', 'assets/app.js', 'assets/storage-math.js', 'assets/app.css', 'assets/vendor/echarts.min.js', 'assets/vendor/LICENSE', 'assets/vendor/NOTICE']
DOC_FILES = ['README.md', 'LICENSE', 'LICENSE-DATA.md', 'CONTRIBUTING.md', 'ASSETS.json', '.gitignore', 'examples/synthetic.json', 'tests/test_public.py', 'tests/test_storage_math.js', 'examples/method-arithmetic.json', 'tools/park_examples.py', 'examples/park-scenarios.json', 'tests/test_park_examples.py']
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


def build_package(snapshot, dist, source=ROOT):
    data = validate_snapshot(snapshot); dist = Path(dist); source = Path(source)
    if dist.exists() and any(dist.iterdir()): raise ValueError('output directory must be empty; old files are never deleted')
    dist.mkdir(parents=True, exist_ok=True)
    docs = source / 'open_source' if (source / 'open_source').is_dir() else source
    validate_method_examples(docs/'examples/method-arithmetic.json')
    validate_park_examples(docs/'examples/park-scenarios.json')
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
