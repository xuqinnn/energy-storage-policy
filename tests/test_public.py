"""Portable build, boundary and reproducibility tests. Standard library only."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('public_builder',ROOT/'tools/build.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class PublicBuildTest(unittest.TestCase):
 def example(self):return json.loads((ROOT/'examples/synthetic.json').read_text())
 def test_synthetic_build_is_reproducible(self):
  with tempfile.TemporaryDirectory() as temp:
   a=Path(temp)/'a';b=Path(temp)/'b';builder.build_package(self.example(),a,ROOT);builder.build_package(self.example(),b,ROOT)
   self.assertEqual((a/'BUILD.json').read_bytes(),(b/'BUILD.json').read_bytes())
   self.assertTrue((a/'tools/build.py').is_file());self.assertFalse((a/'data.enc.json').exists())
 def test_denies_legacy_private_blocks_and_paths(self):
  for key,value in [('dev',{'site':'private'}),('example',{'rows':[{'value':1}]}),('score',{'rows':[1]})]:
   d=self.example();d[key]=value
   with self.assertRaises(ValueError):builder.validate_snapshot(d)
  d=self.example();d['docs']['ZCDEMO01']['title']='/Users/person/private.xlsx'
  with self.assertRaises(ValueError):builder.validate_snapshot(d)
 def test_missing_summary_and_unknown_field_refused(self):
  d=self.example();d['docs']['ZCDEMO01']['summary']=''
  with self.assertRaises(ValueError):builder.validate_snapshot(d)
  d=self.example();d['unexpected_private_blob']='test'
  with self.assertRaises(ValueError):builder.validate_snapshot(d)
 def test_production_input_is_public_and_manifest_matches(self):
  d=json.loads((ROOT/'data/storage.json').read_text());builder.validate_snapshot(d)
  manifest=json.loads((ROOT/'BUILD.json').read_text())
  for name,h in manifest['files_sha256'].items():self.assertEqual(builder.digest(ROOT/name),h,name)
if __name__=='__main__':unittest.main()
