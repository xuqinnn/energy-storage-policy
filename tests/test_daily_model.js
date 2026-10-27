'use strict';
const A=require('assert'),fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),M=require(path.join(root,'assets/content-model.js'));
const item=(id,date,basis='published',rating=null,type='policy')=>({id,canonical_document_id:id,type,renderer:type,analysis_state:'summary',summary:'合成检查',display_date:date,date_basis:basis,publication_verified:['published','event'].includes(basis),importance:rating});
const pack=items=>({schema:1,timezone:'Asia/Shanghai',snapshot_built_at:'2026-10-27 09:00',items,counts:{policy:items.filter(r=>r.type==='policy').length,notice:items.filter(r=>r.type==='notice').length,important_notice:items.filter(r=>r.type==='notice'&&r.importance!==null&&r.importance>=4).length}});
A.strictEqual(M.today(new Date('2026-10-26T15:59:59Z')),'2026-10-26');A.strictEqual(M.today(new Date('2026-10-26T16:00:00Z')),'2026-10-27');
for(const d of ['2026-02-30','2026-13-01','2026-04-31','2026-2-01','0000-01-01']){A.strictEqual(M.validDate(d),false);A.throws(()=>M.validateDaily(pack([item('BAD',d)])));}
A(M.validDate('2024-02-29'));A.strictEqual(M.validDate('2026-02-29'),false);
const d=M.validateDaily(pack([item('NOW','2026-10-27'),item('OLD','2026-09-21'),item('ISSUED','2026-10-27','issued'),item('BACKFILL','2026-10-27','collected'),item('LOW','2026-10-27','published',2,'notice'),item('NULL','2026-10-27','published',null,'notice'),item('HIGH','2026-10-27','event',4,'notice')]));
A.deepStrictEqual(M.dailyQuery(d,{},'2026-10-27').map(r=>r.id),['NOW','LOW','NULL','HIGH']);A.strictEqual(M.dailyQuery(d,{date:'2026-10-28'}).length,0);
A.deepStrictEqual(M.dailyQuery(d,{important:true},'2026-10-27').map(r=>r.id),['HIGH']);A.deepStrictEqual(M.dailyQuery(d,{range:'index'},'2026-10-27').map(r=>r.id),['ISSUED','BACKFILL']);
A.strictEqual(M.dailyQuery(d,{date:'2026-02-30'}).length,0);A.throws(()=>M.validateDaily(pack([item('DUP','2026-10-27'),item('DUP','2026-10-27')])));
A.doesNotThrow(()=>M.validateDaily(pack([item('UNKNOWN',null,'unknown')])));
const built=JSON.parse(fs.readFileSync(path.join(root,'content/daily-brief.json')));M.validateDaily(built);
console.log('Shanghai calendar, midnight, empty days, backfill, identity and low/null announcement contracts passed.');
