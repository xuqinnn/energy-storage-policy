/* Isolated, text-only official-source collection feed. No formal database writes. */
(function(root){
  'use strict';
  const URL_FIXED='https://raw.githubusercontent.com/xuqinnn/energy-storage-policy/wb-feed-live/feed/live.json';
  const FIELDS=['id','category','title','issuer','source_url','published_date','publication_evidence','collected_at','source_sha256','source_excerpt'];
  const EXTRA=['record_sha256','gate_checked_at','review_state','mode','source_check'];
  const PROOF=['source_sha256_declared','source_sha256_fetched','bytes_changed','fetched_bytes','match'];
  const MATCH='normalized whitespace and HTML entities; title exact heading';
  const bad=/[<>\\\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]|内部资料|企业内部|商业秘密|密码|token|secret|api[_ -]?key|\/Users\/|\/home\//i;
  const hash=/^[a-f0-9]{64}$/, idPattern=/^wb_[a-f0-9]{20}$/;
  function fail(){throw Error('Unavailable or unverified collection feed');}
  function keys(v,allowed){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...allowed].sort().join('|'))fail();}
  function text(v,max=300,min=1){if(typeof v!=='string'||Array.from(v).length<min||Array.from(v).length>max||bad.test(v)||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v))fail();return v;}
  function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail();const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)fail();return v;}
  function time(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00|\+08:00)$/.test(v)||!Number.isFinite(Date.parse(v)))fail();date(v.slice(0,10));return Date.parse(v);}
  function source(v){text(v);let u;try{u=new URL(v);}catch(e){fail();}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port||!/(^|\.)gov\.cn$/.test(u.hostname)||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*gov\.cn$/.test(u.hostname)||u.href!==v)fail();let decoded;try{decoded=decodeURIComponent(v);}catch(e){fail();}if(/[\u0000-\u0020\\]/.test(decoded))fail();return v;}
  function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
  async function digest(s){if(!root.crypto?.subtle)fail();return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function validateReviews(pack,docs={}){
    keys(pack,['schema','reviews']);if(pack.schema!==1||!Array.isArray(pack.reviews)||pack.reviews.length>2400)fail();const seen=new Set();
    for(const r of pack.reviews){if(!r||Array.isArray(r)||Object.keys(r).some(k=>!['id','record_sha256','status','note','formal_id','correction'].includes(k))||!['id','record_sha256','status'].every(k=>k in r)||!idPattern.test(r.id)||!hash.test(r.record_sha256)||!['accepted','corrected','withdrawn'].includes(r.status))fail();const key=r.id+':'+r.record_sha256;if(seen.has(key))fail();seen.add(key);if(r.note!==undefined)text(r.note);if(r.status!=='accepted'&&!r.note)fail();if(r.formal_id!==undefined&&(!/^ZC[A-Z0-9]{2,20}$/.test(r.formal_id)||!docs[r.formal_id]))fail();
      if(r.status==='corrected'){if(!r.correction||typeof r.correction!=='object'||Array.isArray(r.correction)||!Object.keys(r.correction).length)fail();for(const [k,v]of Object.entries(r.correction)){if(!['title','issuer','published_date','source_excerpt','category'].includes(k))fail();text(v,k==='source_excerpt'?160:300);if(k==='published_date')date(v);if(k==='category'&&!['policy','notice'].includes(v))fail();}}else if(r.correction!==undefined)fail();
    }return pack;
  }
  async function validatePayload(pack,now=Date.now()){
    keys(pack,['schema','updated_at','records','gate_stats','recent_batches']);if(pack.schema!==1||!Array.isArray(pack.records)||pack.records.length>600||!Array.isArray(pack.recent_batches)||pack.recent_batches.length>10)fail();keys(pack.gate_stats,['pending']);if(!Number.isInteger(pack.gate_stats.pending)||pack.gate_stats.pending!==pack.records.length)fail();
    if(pack.updated_at===null){if(pack.records.length||pack.recent_batches.length)fail();return pack;}
    const updated=time(pack.updated_at);if(updated>now+300000||now-updated>7*86400000)fail();const seen=new Set();
    for(const r of pack.records){keys(r,[...FIELDS,...EXTRA]);for(const k of FIELDS)text(r[k]);text(r.title,300,8);text(r.issuer,300,4);text(r.source_excerpt,160,10);source(r.source_url);date(r.published_date);if(!/储能|电力|电价|电网|新能源|虚拟电厂|需求响应|绿电直连|零碳园区|零碳工厂|绿证|能源保供|绿色算力|算电协同/.test(r.title+r.source_excerpt)||!/发布时间|发布日期|公开日期|发布于|公开时间/.test(r.publication_evidence))fail();const [yy,mm,dd]=r.published_date.split('-').map(Number),compact=r.publication_evidence.replace(/\s+/g,'');if(!new RegExp('(?<![0-9])'+yy+'(?:年|[-./])0?'+mm+'(?:月|[-./])0?'+dd+'(?:日)?(?![0-9])').test(compact))fail();const collected=time(r.collected_at),checked=time(r.gate_checked_at);if(collected>checked||checked>updated||Date.parse(r.published_date+'T00:00:00+08:00')>collected||updated-checked>90*86400000||!['policy','notice'].includes(r.category)||!['daily','backfill'].includes(r.mode)||r.review_state!=='pending'||!hash.test(r.source_sha256)||!hash.test(r.record_sha256)||!idPattern.test(r.id)||seen.has(r.id))fail();seen.add(r.id);
      if(r.id!=='wb_'+(await digest(r.source_url)).slice(0,20))fail();const original=Object.fromEntries(FIELDS.map(k=>[k,r[k]]));if(await digest(canonical(original))!==r.record_sha256)fail();const p=r.source_check;keys(p,PROOF);if(p.source_sha256_declared!==r.source_sha256||!hash.test(p.source_sha256_fetched)||typeof p.bytes_changed!=='boolean'||p.bytes_changed!==(p.source_sha256_declared!==p.source_sha256_fetched)||!Number.isInteger(p.fetched_bytes)||p.fetched_bytes<1||p.fetched_bytes>2097152||p.match!==MATCH)fail();
    }
    for(const b of pack.recent_batches){keys(b,['batch_id','checked_at','status']);if(!/^WB-\d{8}-\d{3}$/.test(b.batch_id)||!['passed','partial','rejected'].includes(b.status)||time(b.checked_at)>updated)fail();}return pack;
  }
  function overlay(pack,reviews){const by=new Map(reviews.reviews.map(r=>[r.id+':'+r.record_sha256,r]));return pack.records.map(record=>({record,review:by.get(record.id+':'+record.record_sha256)||null}));}
  const EMPTY={schema:1,updated_at:null,records:[],gate_stats:{pending:0},recent_batches:[]};
  let state={pack:EMPTY,reviews:{schema:1,reviews:[]},status:'loading'},loading=null;
  async function jsonResponse(response,max){if(!response.ok)fail();const declared=response.headers?.get('Content-Length');if(declared&&+declared>max)fail();if(!response.body?.getReader)fail();const reader=response.body.getReader(),chunks=[];let size=0;while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>max){await reader.cancel();fail();}chunks.push(r.value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  async function load(options,force=false){
    if(loading&&!force)return loading;
    loading=(async()=>{const offline=location.protocol==='file:'||!!root.__YC_DATA__||options.offline===true;try{
      const reviews=root.__WB_FEED_REVIEWS__||await jsonResponse(await fetch('content/wb-feed-reviews.json',{cache:'no-store'}),2000000);validateReviews(reviews,options.docs);state.reviews=reviews;
      const snapshot=root.__WB_FEED_SNAPSHOT__||EMPTY;await validatePayload(snapshot);state.pack=snapshot;
      if(offline){state.status='offline';return;}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
      try{const pack=await jsonResponse(await fetch(URL_FIXED,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal}),2097152);await validatePayload(pack);state.pack=pack;state.status='live';}finally{clearTimeout(timer);}
    }catch(error){state.status='unavailable';}})();return loading;
  }
  function node(tag,value,cls){const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;}
  function render(container,options){
    if(!container?.isConnected)return;container.replaceChildren();container.className='card wb-feed';container.dataset.feedStatus=state.status;const rows=overlay(state.pack,state.reviews),pending=rows.filter(r=>!r.review).length;
    container.append(node('h2','采集快讯 · 待复核 '+pending+' 件'),node('p','采集信息先回官方原文核对；复核结果逐条更新。此处数量单列。','note'));container.dataset.feedPending=String(pending);
    if(state.status==='offline')container.append(node('p','离线版不联网获取快讯。','note'));
    else if(state.status==='unavailable')container.append(node('p','暂无可用快讯，已有政策与分析可继续阅读。','note'));
    else if(state.status==='loading')container.append(node('p','正在取得采集快讯…','note'));
    if(state.pack.updated_at)container.append(node('p','最近检查 '+new Date(state.pack.updated_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）','note'));
    const list=node('div',undefined,'wb-feed-list');container.append(list);
    for(const {record:r,review:v}of rows){
      const article=node('article');article.dataset.wbId=r.id;article.dataset.reviewState=v?.status||'pending';list.append(article);
      if(v?.status==='withdrawn'){article.append(node('h3','一条快讯已撤回'),node('p',v.note));continue;}
      const effective={...r,...(v?.correction||{})},details=node('details'),summary=node('summary'),title=node('h3',effective.title);summary.append(title,node('span',(effective.category==='policy'?'政策':'公告')+' · 该页公开 '+effective.published_date+' · '+(v?.status==='accepted'?'已复核':v?.status==='corrected'?'已更正':'待复核')));details.append(summary);
      if(r.mode==='backfill')details.append(node('strong','历史补录 · 不计今日新发','date-fallback'));
      details.append(node('p',effective.issuer),node('p','官方页面发布此文件，可先回原文核对。'),node('blockquote',effective.source_excerpt),node('p','原文短引按空白与HTML实体归一化核对。','note'),node('p','采集于 '+new Date(r.collected_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）','note'));
      if(r.source_check.bytes_changed)details.append(node('p',v?'采集时来源页有更新，所列事实仍匹配。':'来源页有更新，所列事实仍匹配，待复核。','note'));
      if(v?.note)details.append(node('p','复核说明：'+v.note));
      const link=node('a','查看官方原文 ↗');link.href=r.source_url;link.target='_blank';link.rel='noopener noreferrer';details.append(link);
      if(v?.formal_id){const formal=node('a','查看已入库分析 →');formal.href='#/brief/'+v.formal_id;formal.className='wb-formal-link';details.append(formal);}
      article.append(details);
    }
    if(!rows.length&&state.status==='live')list.append(node('p','当前没有新的采集快讯。'));
    if(state.status==='unavailable'&&!options.offline&&location.protocol!=='file:'&&!root.__YC_DATA__){const retry=node('button','重试快讯');retry.type='button';retry.onclick=()=>{retry.disabled=true;load(options,true).then(()=>render(container,options));};container.append(retry);}
  }
  function mount(container,options){render(container,options);load(options).then(()=>render(container,options));}
  const api={URL_FIXED,FIELDS,canonical,validatePayload,validateReviews,overlay,mount,EMPTY};root.WBFeed=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
