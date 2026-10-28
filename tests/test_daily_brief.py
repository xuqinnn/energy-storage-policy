"""Date provenance, canonical identity and reviewed scope, using synthetic fixtures."""
import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('daily_builder',ROOT/'tools/build.py');B=importlib.util.module_from_spec(spec);spec.loader.exec_module(B)
class DailyBriefTest(unittest.TestCase):
    def inputs(self):
        data={'meta':{'dataset':'public-reviewed','version':'fixture','exported':'2026-10-27 09:00'},'docs':{'P1':{'title':'合成规则','summary':'已审短摘要','published':'2026-10-13','date':'2026-09-21'},'LEGACY':{'title':'未分类旧索引','published':'2026-10-27'}},'lib':[['P1','','','','','','','', '2026-10-27']],'briefs':[]}
        row={'id':'P1','canonical_document_id':'P1','content_type':'policy','subtype':'合成规则','importance':4,'classification_basis':'合成分类依据','evidence_scope':'受控摘要'}
        layer={'classifications':[row],'notices':[],'source_links':[],'source_gaps':[]}
        return data,layer
    def test_historical_issue_or_backfill_does_not_become_today_publication(self):
        d,l=self.inputs();r=B.assemble_daily(d,l,[])['items'][0]
        self.assertEqual((r['display_date'],r['date_basis']),('2026-10-13','published'));self.assertTrue(r['publication_verified'])
        d['docs']['P1'].pop('published');r=B.assemble_daily(d,l,[])['items'][0];self.assertEqual(r['date_basis'],'issued');self.assertFalse(r['publication_verified'])
        d['docs']['P1'].pop('date');r=B.assemble_daily(d,l,[])['items'][0];self.assertEqual(r['date_basis'],'collected');self.assertFalse(r['publication_verified'])
    def test_impossible_calendar_dates_are_not_rolled_forward(self):
        d,l=self.inputs();d['docs']['P1'].update(published='2026-02-30',date='2026-13-01');d['lib']=[]
        r=B.assemble_daily(d,l,[])['items'][0];self.assertEqual((r['display_date'],r['date_basis']),('','unknown'))
        d['docs']['P1']['published']='2024-02-29';self.assertEqual(B.assemble_daily(d,l,[])['items'][0]['display_date'],'2024-02-29')
    def test_same_master_and_attachment_are_counted_once_and_legacy_not_promoted(self):
        d,l=self.inputs();alias=copy.deepcopy(l['classifications'][0]);alias['id']='ATTACHMENT';l['classifications'].append(alias)
        out=B.assemble_daily(d,l,[]);self.assertEqual(len(out['items']),1);self.assertEqual(out['counts']['policy'],1);self.assertNotIn('LEGACY',{r['id'] for r in out['items']})
    def test_low_null_notices_retained_but_not_promoted_to_important(self):
        d,l=self.inputs()
        for i,rating in enumerate((2,4,None)):
            code='N'+str(i);d['docs'][code]={'title':'合成公告','published':'2026-10-27'};c=copy.deepcopy(l['classifications'][0]);c.update(id=code,canonical_document_id=code,content_type='notice',importance=rating);l['classifications'].append(c)
        out=B.assemble_daily(d,l,[]);self.assertEqual(out['counts'],{'policy':1,'notice':3,'important_notice':1})
    def test_classification_only_does_not_claim_a_complete_report(self):
        d,l=self.inputs();l['classifications'][0]['evidence_scope']='无新增完整内容';d['briefs']=[{'编号':'P1','概述':'未获本次接受的旧正文','分析验收':'完整','依据':[1]}]
        r=B.assemble_daily(d,l,[])['items'][0];self.assertEqual(r['summary'],'合成分类依据');self.assertEqual(r['analysis_state'],'summary')
    def test_production_scope_counts_and_synthetic_isolation(self):
        d=json.loads((ROOT/'data/storage.json').read_text());l=json.loads((ROOT/'content/content-layer.json').read_text());r=json.loads((ROOT/'content/reply-insights.json').read_text())['items'];out=B.assemble_daily(d,l,r)
        if d['meta']['dataset']=='public-reviewed':
            self.assertEqual(len(out['items']),len({x['canonical_document_id'] for x in out['items']}));self.assertNotIn('ZCMD22',{x['id'] for x in out['items']})
        d['meta']['dataset']='synthetic';self.assertEqual(B.assemble_daily(d,l,r)['items'],[])
    def test_full_analysis_cannot_be_a_label_or_missing_body(self):
        d,l=self.inputs();d['briefs']=[{'编号':'P1','概述':'有摘要','分析验收':'完整','依据':[1]}]
        self.assertEqual(B.assemble_daily(d,l,[])['items'][0]['analysis_state'],'summary')
        d['briefs'][0]['完整分析']={'章节':[]}
        self.assertEqual(B.assemble_daily(d,l,[])['items'][0]['analysis_state'],'summary')

    def test_accepted_core_bodies_and_dates_fail_closed(self):
        d=json.loads((ROOT/'data/storage.json').read_text())
        if d['meta']['dataset']=='synthetic':self.skipTest('synthetic has no real complete analysis')
        B.validate_core_analyses(d)
        for mutate in [lambda x:x['briefs'].remove(next(b for b in x['briefs'] if b['编号']=='ZCGJ13')),
                       lambda x:next(b for b in x['briefs'] if b['编号']=='ZCGJ03')['完整分析']['章节'].clear(),
                       lambda x:x['docs']['ZCGJ04'].update(date='2025-08-01')]:
            bad=copy.deepcopy(d);mutate(bad)
            with self.assertRaises(ValueError):B.validate_core_analyses(bad)

    def test_learning_is_complete_public_projection_and_routes_are_known(self):
        d=json.loads((ROOT/'data/storage.json').read_text())
        if not d.get('topic_learning'):self.skipTest('synthetic fixture has no real lessons')
        pack=d['topic_learning'];B.validate_topic_learning(pack,d['docs'])
        self.assertEqual(len(pack['lessons']),14);self.assertEqual(len(pack['topics']),5)
        self.assertNotEqual(next(t for t in pack['topics'] if t['name']=='零碳园区')['intro'],next(t for t in pack['topics'] if t['name']=='零碳工厂')['intro'])
        for modify in [lambda p:p.update(source_sha256='private'),lambda p:p['lessons'].pop(),lambda p:p['lessons'][0]['links'][0].update(href='javascript:alert(1)')]:
            bad=copy.deepcopy(pack);modify(bad)
            with self.assertRaises(ValueError):B.validate_topic_learning(bad,d['docs'])
if __name__=='__main__':unittest.main()
