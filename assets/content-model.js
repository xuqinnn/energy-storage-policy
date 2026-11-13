/* Public content identities and search. Classification never changes legal status or parameters. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnergyContent=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TYPES={policy:'政策',notice:'公告',article_report:'文章研报',research_material:'研究资料',unclassified:'其他资料'};
  const SOURCE_LABELS={ORIGINAL_PUBLICATION_OR_ATTACHMENT:'官方原发布页／附件',ORIGINAL_EXPLANATORY_ATTACHMENT:'原件配套起草说明',OFFICIAL_RELEASE_REPORT:'政府发布消息（关联来源）',OFFICIAL_INSTITUTION_REPRINT:'官方机构转载（关联来源）',OFFICIAL_INTERPRETATION:'官方政策解读（关联来源）',OFFICIAL_REPRINT_ATTACHMENT:'政府转载附件（关联来源）',OFFICIAL_ANALYSIS_MENTION_ONLY:'官方分析引用（关联来源）'};
  function validate(layer){
    if(!layer||Object.keys(layer).sort().join(',')!=='classifications,notices,schema,source_gaps,source_links'||layer.schema!==1||!['notices','classifications','source_links','source_gaps'].every(k=>Array.isArray(layer[k])))throw Error('内容分类清单格式不符');
    const ids=new Set();
    for(const n of layer.notices){if(!n.id||ids.has(n.id)||n.content_type!=='notice'||!Number.isInteger(n.importance)||n.importance<1||n.importance>5||!Array.isArray(n.verified_region_codes)||!Array.isArray(n.policy_ids)||!/^https:\/\//.test(n.source_url))throw Error('通知记录格式不符');ids.add(n.id);}
    for(const c of layer.classifications){if(!c.id||c.id==='ZCMD22'||ids.has(c.id)||c.id!==c.canonical_document_id||!['notice','policy','article_report'].includes(c.content_type)||!Number.isInteger(c.importance)||c.importance<1||c.importance>5)throw Error('分类映射有重复、待核项或格式不符');ids.add(c.id);}
    for(const gap of layer.source_gaps){if(!gap.id||ids.has(gap.id)||typeof gap.boundary!=='string'||!gap.boundary.trim())throw Error('来源缺口与已审分类重叠或格式不符');ids.add(gap.id);}
    for(const s of layer.source_links){if(!s.policy_id||!SOURCE_LABELS[s.role]||!/^https?:\/\//.test(s.url))throw Error('来源角色或链接格式不符');}
    return layer;
  }
  function create(snapshot,layer,replies){
    layer=validate(layer);const records=new Map(),classes=new Map(layer.classifications.map(c=>[c.id,c])),gaps=new Map(layer.source_gaps.map(g=>[g.id,g.boundary]));
    const research=new Map((snapshot.research||[]).map(r=>[r.code,r]));
    const tags=new Map();for(const t of snapshot.tags||[])for(const id of snapshot.tagdocs?.[t.标签]?.主||[])tags.set(id,[...(tags.get(id)||[]),t.标签]);
    const briefs=new Map((snapshot.briefs||[]).map(b=>[b.编号,b]));
    for(const [id,d] of Object.entries(snapshot.docs||{})){
      const c=classes.get(id),r=research.get(id),gap=gaps.get(id)||(id==='ZCMD22'?'公告发布母页尚未核实；原索引不作为已审通知或重要更新。':'');
      records.set(id,{id,kind:'policy',content_type:gap?'unclassified':c?.content_type||(r?'research_material':'unclassified'),subtype:c?.subtype||'',importance:gap?null:c?.importance??null,
        title:d.title||r?.title||id,issuer:r?.publisher||d.issuer||'',document_number:d.no||'',status:d.status||'',summary:gap||(c?.content_type==='notice'?c.classification_basis:(d.summary||r?.summary||'')),
        sortDate:d.published||d.date||r?.date||'',dateLabel:d.published?'公开':'索引日期',province:d.prov||'',verified_region_codes:[],
        importance_reason:c?.importance_reason||'',classification_basis:c?.classification_basis||'',evidence_scope:c?.evidence_scope||'',
        classification_boundary:c?[c.classification_basis,c.evidence_scope].join(' '):'',review_hold:!!gap,source_gap:gap||'',tags:tags.get(id)||[],body:gap||id==='ZCGJ110'?'':JSON.stringify(briefs.get(id)||{})});
    }
    for(const n of layer.notices){if(records.has(n.id))throw Error('通知与现有文档ID冲突');records.set(n.id,{...n,kind:'notice',sortDate:n.event_at||n.published_at||n.issued_at||'',dateLabel:n.event_at?'事件':'公开',province:'',tags:[],body:[n.quote,n.our_analysis,n.boundary].join(' ')});}
    for(const r of replies||[]){if(records.has(r.id))throw Error('答复与现有文档ID冲突');records.set(r.id,{...r,kind:'reply',content_type:'notice',subtype:r.source_kind,importance:null,
      document_number:r.reply_number,title:r.title,sortDate:r.reply_issued_at,dateLabel:'答复落款',province:'',tags:r.tags||[],body:[r.reply_title,r.quote,r.our_analysis,r.boundary].join(' ')});}
    for(const id of classes.keys())if(!records.has(id))throw Error('分类映射找不到现有文档');
    return {records,layer};
  }
  function query(model,filters={}){
    const tokens=String(filters.q||'').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return [...model.records.values()].filter(r=>
      (!filters.type||r.content_type===filters.type)&&
      (!filters.prov||r.province===filters.prov||r.verified_region_codes?.includes(filters.prov))&&
      (!filters.yr||String(r.sortDate||'').startsWith(filters.yr))&&
      (!filters.important||(r.content_type==='notice'&&r.importance!==null&&r.importance>=4))&&
      tokens.every(t=>[r.id,r.title,r.document_number,r.issuer,r.summary,r.subtype,r.tags.join(' '),r.body].join(' ').toLocaleLowerCase().includes(t))
    ).sort((a,b)=>String(b.sortDate).localeCompare(String(a.sortDate))||a.id.localeCompare(b.id));
  }
  function stats(model){
    const rows=[...model.records.values()],notices=rows.filter(r=>r.content_type==='notice');
    return {policy:rows.filter(r=>r.content_type==='policy').length,notices:notices.length,important:notices.filter(r=>r.importance>=4).length,
      unscored:notices.filter(r=>r.importance===null).length,article_report:rows.filter(r=>r.content_type==='article_report').length,
      classification_pending:rows.filter(r=>['unclassified','research_material'].includes(r.content_type)).length};
  }
  function today(now=new Date()){
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const [y,m,d]=value.split('-').map(Number);if(y<1||m<1||m>12||d<1||d>31)return false;
    const day=new Date(0);day.setUTCHours(0,0,0,0);day.setUTCFullYear(y,m-1,d);
    return day.getUTCFullYear()===y&&day.getUTCMonth()===m-1&&day.getUTCDate()===d;
  }
  function validateDaily(d,model=null,meta=null){
    if(!d||d.schema!==1||d.timezone!=='Asia/Shanghai'||!Array.isArray(d.items)||!d.counts||typeof d.snapshot_built_at!=='string')throw Error('速递数据格式不符');
    const ids=new Set();
    for(const r of d.items){if(!r.id||ids.has(r.canonical_document_id)||r.id!==r.canonical_document_id||!['policy','notice'].includes(r.type)||!['policy','notice','reply'].includes(r.renderer)||!['full','summary','index'].includes(r.analysis_state)||typeof r.summary!=='string'||!['event','published','issued','collected','unknown'].includes(r.date_basis)||r.publication_verified!==['event','published'].includes(r.date_basis))throw Error('速递身份/类型/日期依据不符');if(r.date_basis==='unknown'?(r.display_date!=null&&r.display_date!==''):!validDate(r.display_date))throw Error('速递日期不是有效公历日');for(const key of ['issued_at','published_at','event_at'])if(r[key]&&!validDate(r[key]))throw Error('速递日期字段不是有效公历日');ids.add(r.canonical_document_id);}
    const expected={policy:d.items.filter(r=>r.type==='policy').length,notice:d.items.filter(r=>r.type==='notice').length,important_notice:d.items.filter(r=>r.type==='notice'&&r.importance!==null&&r.importance>=4).length};
    if(Object.keys(expected).some(k=>expected[k]!==d.counts[k]))throw Error('速递计数与唯一文档不符');
    if(model){const reviewed=[...model.records.values()].filter(r=>['policy','notice'].includes(r.content_type)&&!r.review_hold);if(reviewed.length!==d.items.length||d.items.some(r=>{const original=model.records.get(r.id);return !original||original.content_type!==r.type||original.importance!==r.importance||original.kind!==r.renderer;}))throw Error('速递与统一内容模型不一致');}
    if(meta&&(d.snapshot_version!==meta.version||d.snapshot_built_at!==meta.exported))throw Error('速递与资料快照版本不一致');return d;
  }
  const shiftDay=(day,offset)=>new Date(Date.parse(day)+offset*86400000).toISOString().slice(0,10);
  function editionRange(day,mode,now=today()){
    if(!validDate(day)||!validDate(now))return null;
    if(mode==='day')return {start:day,end:day};
    if(mode==='week'){
      const offset=(new Date(day).getUTCDay()+6)%7;
      const start=shiftDay(day,-offset);
      const end=shiftDay(start,6);
      return {start,end:end>now&&start<=now?now:end};
    }
    if(mode==='month'){
      const start=day.slice(0,7)+'-01';
      const last=new Date(day);last.setUTCMonth(last.getUTCMonth()+1,0);
      const end=last.toISOString().slice(0,10);
      return {start,end:end>now&&start<=now?now:end};
    }
    if(mode==='all')return {start:'',end:now};
    return {start:shiftDay(day,mode==='30'?-29:-6),end:day};
  }
  function dailyQuery(d,f={},now=today()){
    const mode=f.range||'day';
    const period=editionRange(f.date||now,mode,now);
    if(!period)return [];
    const tokens=String(f.q||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const issue=['day','week','month'].includes(mode);
    return d.items.filter(r=>(!f.type||r.type===f.type)&&(!f.prov||r.region===f.prov)&&(!f.important||(r.type==='notice'&&r.importance!==null&&r.importance>=4))&&
      tokens.every(t=>[r.title,r.summary,r.issuer,r.subtype,r.region,r.search_text,r.source_excerpt].join(' ').toLocaleLowerCase().includes(t))&&
      (mode==='index'?r.date_basis!=='published':r.publication_verified&&(!issue||r.date_basis==='published')&&!!r.display_date&&r.display_date>=period.start&&r.display_date<=period.end&&r.display_date<=now));
  }
  function editionLead(items){
    const complete=items.filter(row=>!row.collection_only&&row.summary&&row.source_url&&row.importance>=4);
    complete.sort((a,b)=>b.importance-a.importance||(a.type===b.type?0:a.type==='policy'?-1:1)||b.display_date.localeCompare(a.display_date));
    return complete[0]||null;
  }
  // View projection only: feed objects must already pass WBFeed validation and version-bound overlay.
  // It never changes the formal snapshot, classification counts, legal status or parameters.
  function mergeDaily(d,feedRows=[],model=null){
    const items=(d?.items||[]).map(r=>({...r,issuer:model?.records.get(r.id)?.issuer||'',search_text:model?.records.get(r.id)?.body||'',collection_only:false}));
    const byId=new Map(items.map(r=>[r.id,r])),sources=new Map(),corrections=[];
    const title=s=>String(s||'').replace(/---国家能源局$/,'').trim();
    const identity=r=>JSON.stringify([r.source_url,title(r.title),r.published_at||r.display_date]);
    for(const row of items){const key=identity(row);sources.set(key,[...(sources.get(key)||[]),row]);}
    for(const {record,review} of feedRows){
      // A stale acceptance must not be applied to a changed version, even for direct callers.
      const v=review?.id===record.id&&review.record_sha256===record.record_sha256?review:null;
      const r={...record,...(v?.correction||{})};
      if(v?.status==='withdrawn'){
        corrections.push({id:r.id,title:'来源类型更正',note:v.note,date:r.published_date,source_url:r.source_url});continue;
      }
      if(!['policy','notice'].includes(r.category))continue;
      let original=v?.formal_id?byId.get(v.formal_id):null;
      if(!original&&v){
        const candidates=sources.get(JSON.stringify([r.source_url,title(r.title),r.published_date]))||[];
        // A shared URL is insufficient. Require title/date and compatible original publisher.
        const same=candidates.filter(x=>x.type===r.category&&x.issuer&&x.issuer===r.issuer);
        if(same.length===1)original=same[0];
      }
      if(original){
        original.source_excerpt=r.source_excerpt;
        original.source_correction=v?.note||'';
        original.feed_aliases=[...(original.feed_aliases||[]),record.id];
        continue;
      }
      const source={id:r.id,canonical_document_id:r.id,type:r.category,renderer:'source',title:r.title,issuer:r.issuer,
        summary:r.source_excerpt,source_excerpt:r.source_excerpt,source_correction:v?.note||'',subtype:'原文摘录',analysis_state:'source',
        importance:null,status:'',region:'',source_url:r.source_url,source_label:'来源原文',published_at:r.published_date,
        display_date:r.published_date,date_basis:'published',date_label:'该页公开日',publication_verified:true,collection_only:true,
        route:'#/policy?'+new URLSearchParams({date:r.published_date,range:'all',entry:r.id})};
      // Two source URLs of uncertain equivalence remain separate; no title-only merge.
      if(!byId.has(source.id)){items.push(source);byId.set(source.id,source);}
    }
    const depth={full:0,summary:1,index:2,source:3};
    items.sort((a,b)=>String(b.display_date||'').localeCompare(String(a.display_date||''))||(depth[a.analysis_state]??2)-(depth[b.analysis_state]??2)||a.id.localeCompare(b.id));
    return {items,corrections,counts:d?.counts||null};
  }
  return {TYPES,SOURCE_LABELS,validate,create,query,stats,today,validDate,validateDaily,editionRange,dailyQuery,editionLead,mergeDaily};
});
