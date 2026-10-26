"""Public reply projection boundary and policy-data separation, no private inputs."""
import copy,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUILDER=ROOT/'tools/build.py' if (ROOT/'tools/build.py').exists() else ROOT.parent/'publish_build.py'
spec=importlib.util.spec_from_file_location('reply_builder',BUILDER);b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class ReplyBoundaryTests(unittest.TestCase):
 def payload(self):
  return {'schema':1,'items':[{'id':'RPLY-NEA-20260630-4106','title':'Synthetic reading question','source_kind':'人大建议答复','issuer':'国家能源局','reply_title':'Synthetic title','reply_number':'Synthetic number','date_precision':'day','first_publication_date_status':'NOT_ESTABLISHED_BY_URL_OR_CURRENT_META','evidence_check_scope':'Synthetic scope; independent stages','reply_issued_at':'2026-06-30','official_page_publishdate':'2026-06-30','first_publication_date':None,'source_url':b.REPLY_SOURCES['RPLY-NEA-20260630-4106'],'quote':'Synthetic short quote','source_anchor':'Synthetic section','summary':'Synthetic summary','our_analysis':'Synthetic analysis','boundary':'Synthetic scope; no project eligibility','tags':['Synthetic'],'region_scope':'Synthetic example','verified_region_codes':[],'policy_ids':[],'reviewed_on':'2026-10-25','evidence_checks':{'source_verified':True,'cited_policies_verified':False,'project_applicability_verified':False}}]}
 def test_projection_validates_without_mutating_snapshot(self):
  d=self.payload();before=copy.deepcopy(d);self.assertEqual(b.validate_reply_schema(d),before)
 def test_rejects_private_fields_and_free_text_leak(self):
  for key in ['original_locator','source_evidence_path','publication_status']:
   d=self.payload();d['items'][0][key]='private'
   with self.assertRaises(ValueError):b.validate_reply_schema(d)
  d=self.payload();d['items'][0]['summary']='/Users/person/private'
  with self.assertRaises(ValueError):b.validate_reply_schema(d)
 def test_rejects_date_inference_and_broadcast(self):
  for key,value in [('first_publication_date','2026-08-03'),('reply_issued_at','2026-08-03'),('verified_region_codes',['全国'])]:
   d=self.payload();d['items'][0][key]=value
   with self.assertRaises(ValueError):b.validate_reply_schema(d)
 def test_rejects_duplicate_unknown_id_and_unsafe_links(self):
  d=self.payload();d['items'].append(copy.deepcopy(d['items'][0]))
  with self.assertRaises(ValueError):b.validate_reply_schema(d)
  for url in ['javascript:alert(1)','file:///private/source','https://example.org/unreviewed']:
   d=self.payload();d['items'][0]['source_url']=url
   with self.assertRaises(ValueError):b.validate_reply_schema(d)
 def test_rejects_missing_boundary_combined_flags_and_injection(self):
  for key,value in [('boundary',''),('evidence_checks',{'all_verified':True}),('quote','</script><script>alert(1)</script>')]:
   d=self.payload();d['items'][0][key]=value
   with self.assertRaises(ValueError):b.validate_reply_schema(d)
 def test_changed_payload_cannot_pass_acceptance_sha(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'reply.json';p.write_text(json.dumps(self.payload()))
   with self.assertRaisesRegex(ValueError,'unreviewed reply insights'):b.validate_reply_insights(p)
if __name__=='__main__':unittest.main()
