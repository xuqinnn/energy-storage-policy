/* Research-view adapter boundaries. Node standard library; no browser required. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={window:{},document:{addEventListener(){}},EnergyContent:{today:()=> '2026-11-10'}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/atlas.js'),'utf8'),ctx);
const raw={meta:{version:'fixture',exported:'2026-11-10'},docs:{A:{title:'Synthetic draft',date:'2026-11-09',status:'征求意见',summary:'Not accepted as a full analysis'},B:{title:'Synthetic source gap',date:'2026-11-08',summary:'Unverified assertion'},C:{title:'Synthetic article',date:'2026-11-08'}},lib:[['A'],['B']],research:[{code:'C',title:'Synthetic article'}],briefs:[],provinces:{},links:[{从:'A',到:'B',关系:'关联',依据:'legacy text only'},{从:'C',到:'A',关系:'引用',依据:[{编号:'A',页:2,原句:'Synthetic quotation'}]}]};
const layer={classifications:[{id:'A',content_type:'policy',classification_basis:'Classification only'}],source_links:[],source_gaps:[{id:'B',boundary:'Identity and source unresolved'}],notices:[]};
const replies=[{id:'RPLY-TEST',title:'Synthetic national reply',verified_region_codes:[],region_scope:'National background only',summary:'Not a local eligibility rule'}];
const before=JSON.stringify({raw,layer,replies});
const normalized=ctx.window.EnergyAtlas.normalize(raw,layer,replies,{items:[]});
const a=normalized.docs.find(d=>d.id==='A'),b=normalized.docs.find(d=>d.id==='B'),reply=normalized.docs.find(d=>d.id==='RPLY-TEST');
assert.equal(a.published,'','issue date must not become publication date');
assert.equal(a.summary,'Classification only','classification acceptance must not promote a legacy full analysis');
assert.equal(b.kind,'index');assert.equal(b.status,'来源待核');assert.equal(b.summary,'Identity and source unresolved');
assert.equal(reply.region,'National background only','do not broadcast a national reply to all provinces');
assert.equal(reply.route,'#/notice/RPLY-TEST');
assert.equal(normalized.edges.length,1,'unstructured evidence must not create a quoted edge');
assert.equal(normalized.edges[0].evidence[0].原句,'Synthetic quotation');
assert.equal(JSON.stringify({raw,layer,replies}),before,'adapter must not mutate the authoritative snapshot');
console.log('Atlas adapter boundaries: passed');
