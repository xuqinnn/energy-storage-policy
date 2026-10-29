'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),M=require(path.join(root,'assets/content-model.js'));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/storage.json'))),layer=JSON.parse(fs.readFileSync(path.join(root,'content/content-layer.json')));
const replies=JSON.parse(fs.readFileSync(path.join(root,'content/reply-insights.json'))).items;
if(data.meta.dataset==='synthetic'){console.log('Synthetic-only build: real classification contract not applicable.');process.exit(0);}
const before=JSON.stringify(data),model=M.create(data,layer,replies),stats=M.stats(model);
assert.strictEqual(JSON.stringify(data),before,'classification must not change source statuses, dates or parameters');
assert.deepStrictEqual([stats.policy,stats.notices,stats.important,stats.unscored],[9,14,7,2]);
assert.strictEqual(model.records.size,new Set([...Object.keys(data.docs),...layer.notices.map(n=>n.id),...replies.map(r=>r.id)]).size);
for(const id of ['ZCHEB52','ZCLN37']){assert.strictEqual(M.query(model,{q:id,type:'notice'})[0].importance,3);}
assert(M.query(model,{q:'广州电力交易中心 正式运行',type:'notice'}).some(r=>r.id==='NTF-GZPEC-20261024-FORMAL'));
assert(M.query(model,{q:'1461',type:'notice'}).some(r=>r.id==='ZCGJ110'));
assert.strictEqual(model.records.get('ZCGJ110').kind,'policy','use its own existing document renderer, not a reused reply body');
assert.strictEqual(model.records.get('ZCGJ110').summary,layer.classifications.find(c=>c.id==='ZCGJ110').classification_basis);
assert.strictEqual(model.records.get('ZCGJ110').body,'','do not inherit a separate accepted reply or old unreviewed analysis');
assert.strictEqual(M.query(model,{type:'notice',prov:'广东'}).some(r=>r.id==='NTF-GZPEC-20261024-FORMAL'),false);
assert.strictEqual(M.query(model,{type:'notice',prov:'安徽'}).filter(r=>r.kind==='reply').length,1);
assert.strictEqual(M.query(model,{type:'notice',yr:'2026-10'}).filter(r=>r.kind==='reply').length,0,'June replies are not October additions');
assert.strictEqual(M.query(model,{type:'article_report'}).length,0,'unreviewed research materials are not all reclassified as reports');
assert(stats.classification_pending>0);
for(const id of ['ZCSN34','ZCSD45','ZCAH63'])assert.strictEqual(model.records.get(id).importance,4);
assert.strictEqual(layer.classifications.length,20);
for(const [id,province,published] of [['ZCSH43','上海','2026-10-20'],['ZCSD53','山东','2026-10-15']]){
  assert.strictEqual(M.query(model,{q:id,type:'policy',prov:province})[0].id,id);
  assert.strictEqual(M.query(model,{q:id,type:'notice'}).length,0,'policy wording is not a notice event');
  assert.strictEqual(model.records.get(id).sortDate,published,'stored page publication differs from issued/effective date');
  assert(data.docs[id].url.startsWith('http'),'reviewed original source remains reachable');
  assert(data.briefs.some(b=>b.编号===id&&b.观察点.length===3));
}
assert.strictEqual(data.docs.ZCSH16.status,'已废止');
assert.strictEqual(data.docs.ZCSD21.status,'现行有效','same-topic revision does not establish explicit repeal');
assert.strictEqual(model.records.get('ZCMD22').review_hold,true);
assert.strictEqual(model.records.get('ZCMD22').content_type,'unclassified');
assert.strictEqual(model.records.get('ZCMD22').importance,null);
assert.strictEqual(M.query(model,{q:'ZCMD22',type:'notice'}).length,0);
assert.strictEqual(M.query(model,{q:'ZCMD22'})[0].body,'');
const fallback=M.create(data,{schema:1,notices:[],classifications:[],source_links:[],source_gaps:[]},replies);
assert.strictEqual(fallback.records.get('ZCMD22').review_hold,true,'content fetch failure must not release a known source hold');
assert.throws(()=>M.validate({...layer,classifications:[...layer.classifications,{...layer.classifications[0],id:'ZCMD22',canonical_document_id:'ZCMD22'}]}));
assert.throws(()=>M.create({...data,docs:{...data.docs,[layer.notices[0].id]:{title:'duplicate'}}},layer,replies));
assert.throws(()=>M.validate({...layer,classifications:[...layer.classifications,layer.classifications[0]]}));
assert.throws(()=>M.validate({...layer,private_source_path:'excluded'}));
const related=layer.source_links.filter(s=>!s.role.startsWith('ORIGINAL_'));
assert.strictEqual(related.length,6);assert.strictEqual(layer.source_links.length-related.length,29);
assert(related.filter(s=>['ZCAH16','ZCAH18'].includes(s.policy_id)).every(s=>s.role==='OFFICIAL_REPRINT_ATTACHMENT'&&s.url.endsWith('.pdf')));
console.log('Content search, deduplication, limited counts, dates, low/unscored notices, source roles and negative contracts passed.');

assert.strictEqual(model.records.get('ZCXJ32').content_type,'policy');
assert.strictEqual(model.records.get('ZCXJ24').status,'已废止');
assert.strictEqual(model.records.get('ZCXJ13').status,'现行有效');
assert(data.docs.ZCXJ13.reference_warning.text.includes('不改本件状态'));
assert(data.provinces['新疆']['②c5'].staleCites.includes('ZCXJ24'));

for(const id of ['ZCGJ13','ZCGJ120','ZCGJ03','ZCGJ04']){assert.strictEqual(M.query(model,{q:id,type:'policy'}).length,1);const b=data.briefs.find(b=>b.编号===id);assert.strictEqual(b.分析验收,'完整');assert(b.完整分析.章节.length>=5);}
assert.strictEqual(M.query(model,{q:'ZCGJ03 未开展评估',type:'policy'})[0].id,'ZCGJ03','full analysis body is searchable');
