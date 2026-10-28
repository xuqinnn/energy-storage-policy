'use strict';
const A=require('assert'),crypto=require('crypto'),path=require('path');
if(!globalThis.crypto)globalThis.crypto=crypto.webcrypto;
const W=require(path.join(__dirname,'../assets/wb-feed.js'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),NOW=Date.parse('2026-10-28T12:00:00+08:00');
function record(){const url='https://www.gov.cn/synthetic-test.html',v={id:'wb_'+sha(url).slice(0,20),category:'policy',title:'关于电力能源发展的政策通知',issuer:'国家能源局',source_url:url,published_date:'2026-10-27',publication_evidence:'发布日期：2026-10-27',collected_at:'2026-10-28T10:00:00+08:00',source_sha256:'a'.repeat(64),source_excerpt:'推动电力和新能源高质量发展。'};return {...v,record_sha256:sha(W.canonical(v)),gate_checked_at:'2026-10-28T11:30:00+08:00',review_state:'pending',mode:'daily',source_check:{source_sha256_declared:v.source_sha256,source_sha256_fetched:v.source_sha256,bytes_changed:false,fetched_bytes:500,match:'normalized whitespace and HTML entities; title exact heading'}};}
function pack(r=record()){return {schema:1,updated_at:'2026-10-28T11:30:00+08:00',records:[r],gate_stats:{pending:1},recent_batches:[]};}
const clone=x=>JSON.parse(JSON.stringify(x));let checks=0;
function check(v,msg){A.ok(v,msg);checks++;}
async function reject(v,msg){await A.rejects(()=>W.validatePayload(v,NOW),undefined,msg);checks++;}
(async()=>{
 await W.validatePayload(W.EMPTY,NOW);checks++;const r=record();await W.validatePayload(pack(r),NOW);checks++;
 for(const [k,v]of [['id','wb_'+'0'.repeat(20)],['source_url','https://www.gov.cn.evil.com/a'],['source_url','https://www.gov.cn/a#x'],['source_url','javascript:alert(1)'],['source_url','https://www.gov.cn/%0dBad'],['title','<img src=x onerror=alert(1)>'],['source_excerpt','内部资料，不得公开'],['published_date','2026-02-30'],['collected_at','2026-10-29T10:00:00+08:00'],['review_state','accepted']]){const v0=clone(r);v0[k]=v;await reject(pack(v0),k);}
 for(const control of ['\u0085','\u061c']){const c=record();c.source_excerpt+='正文'+control+'控制';c.record_sha256=sha(W.canonical(Object.fromEntries(W.FIELDS.map(k=>[k,c[k]]))));await reject(pack(c),'re-signed Unicode control');}
 let p=pack();p.gate_stats.pending=true;await reject(p,'bool count');p=pack();p.records.push(clone(p.records[0]));p.gate_stats.pending=2;await reject(p,'duplicate ID');p=pack();p.records[0].extra='bad';await reject(p,'unknown record key');p=pack();p.records[0].source_check.bytes_changed=true;await reject(p,'proof inconsistency');p=pack();p.updated_at='2026-09-01T10:00:00+08:00';await reject(p,'stale');p=pack();p.updated_at='2026-10-29T10:00:00+08:00';await reject(p,'future');
 const old={id:r.id,record_sha256:'0'.repeat(64),status:'accepted'},empty={schema:1,reviews:[]};W.validateReviews(empty,{});check(W.overlay(pack(r),{schema:1,reviews:[old]})[0].review===null,'old version must not authorize');
 for(const status of ['accepted','withdrawn','corrected']){const review={id:r.id,record_sha256:r.record_sha256,status,...(status!=='accepted'?{note:'此处为合成测试复核说明。'}:{}),...(status==='corrected'?{correction:{category:'notice'}}:{})};W.validateReviews({schema:1,reviews:[review]},{});check(W.overlay(pack(r),{schema:1,reviews:[review]})[0].review.status===status,status);}
 for(const review of [{...old,record_sha256:r.record_sha256,status:'corrected',note:'缺少更正正文'},{...old,record_sha256:r.record_sha256,status:'withdrawn'},{...old,formal_id:'ZCUNKNOWN00'},{...old,note:'<script>unsafe</script>'},{...old,correction:{source_url:'https://evil.com/'}}]){A.throws(()=>W.validateReviews({schema:1,reviews:[review]},{}));checks++;}
 check(W.URL_FIXED==='https://raw.githubusercontent.com/xuqinnn/energy-storage-policy/wb-feed-live/feed/live.json','fixed endpoint');
 const fs=require('fs'),source=fs.readFileSync(path.join(__dirname,'../assets/wb-feed.js'),'utf8');check(!source.includes('.innerHTML'),'feed text must never use HTML injection');check(!source.includes('localStorage'),'no stale unsigned cache');check(source.includes("redirect:'error'")&&source.includes("credentials:'omit'"),'no redirects or credentials');check(source.includes("location.protocol==='file:'"),'offline guard');
 console.log(JSON.stringify({checks,failed:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
