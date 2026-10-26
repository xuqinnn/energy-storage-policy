"""Fail-closed public projection, identity and source-role boundaries."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('content_builder',ROOT/'tools/build.py')
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class ContentProjectionTest(unittest.TestCase):
    def layer(self):
        return json.loads((ROOT/'content/content-layer.json').read_text())

    def test_reviewed_projection_is_immutable_and_frozen(self):
        layer=self.layer();before=copy.deepcopy(layer)
        self.assertEqual(builder.validate_content_schema(layer),before)
        self.assertEqual(builder.validate_content_layer(ROOT/'content/content-layer.json'),before)
        self.assertEqual(layer,before)
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'content.json';path.write_text(json.dumps(layer))
            with self.assertRaisesRegex(ValueError,'SHA changed'):builder.validate_content_layer(path)

    def test_private_fields_html_and_date_inference_are_denied(self):
        for key,value in [('raw_path','private'),('source_raw_sha256','0'*64),('first_publication_date','2026-10-24'),
                          ('verified_region_codes',['广东','广西','云南','贵州','海南']),('policy_ids',['ZCNF31']),
                          ('event_at','2026-02-30'),('summary','<script>alert(1)</script>')]:
            layer=self.layer();layer['notices'][0][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):builder.validate_content_schema(layer)

    def test_identity_and_classification_are_not_duplicated_or_promoted(self):
        for modify in [lambda d:d['classifications'].append(copy.deepcopy(d['classifications'][0])),
                       lambda d:d['classifications'][0].update(canonical_document_id='OTHER'),
                       lambda d:d['classifications'][0].update(importance=True),
                       lambda d:d['classifications'][1].update(content_type='policy')]:
            layer=self.layer();modify(layer)
            with self.assertRaises(ValueError):builder.validate_content_schema(layer)

    def test_related_sources_are_not_originals_and_bad_links_are_denied(self):
        for code in ('ZCAH14','ZCAH16','ZCAH17','ZCAH18','ZCGJ175','ZCHEB60'):
            layer=self.layer();next(s for s in layer['source_links'] if s['policy_id']==code)['role']='ORIGINAL_PUBLICATION_OR_ATTACHMENT'
            with self.subTest(code=code),self.assertRaises(ValueError):builder.validate_content_schema(layer)
        layer=self.layer();layer['source_links'][0]['url']='javascript:alert(1)'
        with self.assertRaises(ValueError):builder.validate_content_schema(layer)

    def test_existing_snapshot_and_two_replies_keep_their_own_identities(self):
        data=json.loads((ROOT/'data/storage.json').read_text());layer=self.layer()
        if data['meta']['dataset']=='synthetic':self.skipTest('synthetic snapshot has no real classifications')
        self.assertTrue(all(c['id'] in data['docs'] for c in layer['classifications']))
        self.assertTrue(all(s['policy_id'] in data['docs'] for s in layer['source_links']))
        replies=json.loads((ROOT/'content/reply-insights.json').read_text())['items']
        self.assertEqual(len(replies),2)
        self.assertNotIn('ZCGJ110',{r['id'] for r in replies})
        self.assertEqual(next(c for c in layer['classifications'] if c['id']=='ZCGJ110')['importance'],4)
        self.assertNotIn(layer['notices'][0]['id'],data['docs'])

if __name__=='__main__':unittest.main()
