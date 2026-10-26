'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),M=require(path.join(root,'assets/content-model.js'));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/storage.json'))),layer=JSON.parse(fs.readFileSync(path.join(root,'content/content-layer.json')));
const replies=JSON.parse(fs.readFileSync(path.join(root,'content/reply-insights.json'))).items;
if(data.meta.dataset==='synthetic'){console.log('Synthetic-only build: real classification contract not applicable.');process.exit(0);}
const before=JSON.stringify(data),model=M.create(data,layer,replies),stats=M.stats(model);
assert.strictEqual(JSON.stringify(data),before,'classification must not change source statuses, dates or parameters');
assert.deepStrictEqual([stats.policy,stats.notices,stats.important,stats.unscored],[1,12,7,2]);
assert.strictEqual(model.records.size,new Set([...Object.keys(data.docs),...layer.notices.map(n=>n.id),...replies.map(r=>r.id)]).size);
for(const id of ['ZCHEB52','ZCLN37']){assert.strictEqual(M.query(model,{q:id,type:'notice'})[0].importance,2);}
assert(M.query(model,{q:'广州电力交易中心 正式运行',type:'notice'}).some(r=>r.id==='NTF-GZPEC-20261024-FORMAL'));
assert(M.query(model,{q:'1461',type:'notice'}).some(r=>r.id==='ZCGJ110'));
assert.strictEqual(model.records.get('ZCGJ110').kind,'policy','use its own existing document renderer, not a reused reply body');
assert.strictEqual(model.records.get('ZCGJ110').summary,layer.classifications.find(c=>c.id==='ZCGJ110').classification_boundary);
assert.strictEqual(model.records.get('ZCGJ110').body,'','do not inherit a separate accepted reply or old unreviewed analysis');
assert.strictEqual(M.query(model,{type:'notice',prov:'广东'}).some(r=>r.id==='NTF-GZPEC-20261024-FORMAL'),false);
assert.strictEqual(M.query(model,{type:'notice',prov:'安徽'}).filter(r=>r.kind==='reply').length,1);
assert.strictEqual(M.query(model,{type:'notice',yr:'2026-10'}).filter(r=>r.kind==='reply').length,0,'June replies are not October additions');
assert.strictEqual(M.query(model,{type:'article_report'}).length,0,'unreviewed research materials are not all reclassified as reports');
assert(stats.classification_pending>0);
assert.throws(()=>M.create({...data,docs:{...data.docs,[layer.notices[0].id]:{title:'duplicate'}}},layer,replies));
assert.throws(()=>M.validate({...layer,classifications:[...layer.classifications,layer.classifications[0]]}));
assert.throws(()=>M.validate({...layer,private_source_path:'excluded'}));
const related=layer.source_links.filter(s=>!s.role.startsWith('ORIGINAL_'));
assert.strictEqual(related.length,6);assert.strictEqual(layer.source_links.length-related.length,25);
assert(related.filter(s=>['ZCAH16','ZCAH18'].includes(s.policy_id)).every(s=>s.role==='OFFICIAL_REPRINT_ATTACHMENT'&&s.url.endsWith('.pdf')));
console.log('Content search, deduplication, limited counts, dates, low/unscored notices, source roles and negative contracts passed.');
