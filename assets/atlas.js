/* Source-backed research views; reuse the current public data, never a second frozen dataset. */
(function(){
const DEFS={"regions": ["北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆"], "topics": [{"name": "储能", "terms": ["储能", "容量电价", "容量补偿"]}, {"name": "绿电直连", "terms": ["绿电直连", "源网荷储", "就近消纳"]}, {"name": "虚拟电厂", "terms": ["虚拟电厂", "需求响应", "负荷聚合"]}, {"name": "零碳园区", "terms": ["零碳园区", "近零碳园区"]}, {"name": "零碳工厂", "terms": ["零碳工厂", "近零碳工厂", "绿色制造"]}, {"name": "绿色算力", "terms": ["绿色算力", "数据中心", "算电协同", "AIDC"]}], "technologies": [{"name": "锂离子", "terms": ["锂离子", "锂电", "磷酸铁锂"], "short": "Li"}, {"name": "钠离子", "terms": ["钠离子", "钠电"], "short": "Na"}, {"name": "液流", "terms": ["液流", "全钒"], "short": "FL"}, {"name": "压缩空气", "terms": ["压缩空气"], "short": "CA"}, {"name": "抽水蓄能", "terms": ["抽水蓄能"], "short": "PS"}, {"name": "氢储能", "terms": ["氢储能", "储氢"], "short": "H₂"}]};
function shellHTML(){
 const english=document.documentElement.lang==='en';
 const label=(zh,en)=>english?en:zh;
 const groups=[
  [label('动态','Updates'),[['home','#/','layout-dashboard',label('总览','Overview')],['daily','#/policy','file-analytics',label('能碳日报','Energy & Carbon Daily')],['library','#/lib','search',label('政策库','Policy library')],['saved','#/saved','bookmark',label('收藏','Saved')]]],
  [label('研究','Research'),[['topic','#/topics','books',label('重点专题研究','Research themes')],['research','#/research','book-2',label('研究资料','Research library')],['graph','#/view/graph/储能','chart-line',label('政策图谱','Policy relationships')],['technology','#/view/technology/锂离子','bolt',label('技术路线','Technology')]]],
  [label('工具与服务','Resources'),[['tools','#/explore','calculator',label('收益测算工具','Returns tools')],['services','#/services','messages',label('咨询与定制','Advisory')],['work','#/work','books',label('研究案例','Work & evidence')],['about','#/about','books',label('来源与方法','Sources & methods')]]]
 ];
 const links=group=>group.map(([id,path,symbol,name])=>`<a href="${path}" data-view="${id}">${icon(symbol)}${name}</a>`).join('');
 return `<div class="atlas-shell observatory-shell">
  <aside class="rail"><div class="watch-rail-title"><a href="#/">${icon('bolt','brand')}<span>${label('能碳政策研究站','Energy & Carbon Policy Research')}</span></a><div class="watch-language" role="group" aria-label="${label('站点语言','Site language')}"><button type="button" data-watch-language="zh" aria-pressed="${!english}">中文</button><button type="button" data-watch-language="en" aria-pressed="${english}">English</button></div></div><nav aria-label="${label('研究导航','Research navigation')}">${groups.map(([name,group])=>`<div class="obs-nav-group"><p>${name}</p>${links(group)}</div>`).join('')}</nav>
   <div class="rail-foot"><a href="https://github.com/xuqinnn/energy-storage-policy" target="_blank" rel="noopener noreferrer">${icon('brand-github')} GitHub</a><span id="atlas-version"></span></div>
  </aside>
  <div class="atlas-main"><div class="watch-mobile-language"><button type="button" data-watch-language="${english?'zh':'en'}">${label('English','中文')}</button></div><div id="atlas-workspace"></div><section id="atlas-reader" tabindex="-1" hidden></section></div>
  <nav class="watch-mobile-nav" aria-label="${label('主要内容','Main navigation')}"><a href="#/" data-view="home">${icon('layout-dashboard')}<span>${label('总览','Overview')}</span></a><a href="#/policy" data-view="daily">${icon('file-analytics')}<span>${label('能碳日报','Daily brief')}</span></a><a href="#/topics" data-view="topic">${icon('books')}<span>${label('研究专题','Research')}</span></a><a href="#/lib" data-view="library">${icon('search')}<span>${label('政策库','Library')}</span></a><button type="button" aria-controls="primary-nav" aria-expanded="false" data-watch-menu>${icon('menu-2')}<span>${label('更多','More')}</span></button></nav>
 </div>`;
}
function normalize(raw,layer,replies,daily){
 const records=new Map(),classifications=new Map((layer.classifications||[]).map(x=>[x.id,x]));
 const research=new Map((raw.research||[]).map(x=>[x.code,x])),library=new Map((raw.lib||[]).map(x=>[x[0],x]));
 const summaries=new Map((raw.briefs||[]).map(x=>[x.编号,x.概述]));
 const sources=new Map((layer.source_links||[]).filter(x=>x.role==='ORIGINAL_PUBLICATION_OR_ATTACHMENT').map(x=>[x.policy_id,x.url]));
 const gaps=new Map((layer.source_gaps||[]).map(x=>[x.id,x.boundary]));
 for(const id of new Set([...library.keys(),...research.keys()])){
  const d=raw.docs[id]||{},r=research.get(id),l=library.get(id),c=classifications.get(id);
  const kind=c?(c.content_type==='article_report'?'article':c.content_type):r?'article':'index';
  records.set(id,{id,title:d.title||r?.title||l?.[1]||id,no:String(d.no||'').replace(/〔(?:v\d|T\d|K\d|JL\d|同事表)[^〕]*〕/g,'').trim(),status:gaps.has(id)?'来源待核':d.status||l?.[3]||'研究资料',issued:d.date||r?.date||l?.[4]||'',published:d.published||'',effective:d.effective||'',region:d.prov||l?.[5]||'',summary:gaps.get(id)||(c?c.classification_basis:d.summary||summaries.get(id)||r?.summary)||'',url:gaps.has(id)?'':sources.get(id)||d.url||'',issuer:r?.publisher||'',kind,route:(c?.content_type==='notice'?'#/notice/':'#/brief/')+id});
 }
 for(const n of [...(layer.notices||[]),...replies]){
  const isReply=n.id.startsWith('RPLY-'),regions=n.verified_region_codes||[];
  records.set(n.id,{id:n.id,title:n.title,no:n.reply_number||'',status:isReply?'答复资料':n.subtype||'公告',issued:n.issued_at||n.reply_issued_at||'',published:n.published_at||n.official_page_publishdate||'',effective:'',region:regions.length===1?regions[0]:n.region_scope||'',summary:n.summary||'',url:n.source_url||'',issuer:n.issuer||'',kind:'notice',route:'#/notice/'+n.id,boundary:n.boundary||'',quote:n.quote||''});
 }
 for(const n of daily?.items||[]){const d=records.get(n.id);if(d){if(n.publication_verified&&n.published_at)d.published=n.published_at;if(n.summary&&!gaps.has(n.id))d.summary=n.summary;}}
 const edges=(raw.links||[]).filter(e=>records.has(e.从)&&records.has(e.到)&&e.从!==e.到).map(e=>({from:e.从,to:e.到,type:e.关系||'关联',date:e.日期||'',evidence:(Array.isArray(e.依据)?e.依据:[]).filter(x=>x&&typeof x==='object'&&x.原句)})).filter(e=>e.evidence.length);
 return {meta:{version:raw.meta.version,exported:raw.meta.exported,asof:EnergyContent.today()},docs:[...records.values()],edges,regions:DEFS.regions,topics:DEFS.topics,technologies:DEFS.technologies,map:raw};
}
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base='';const url=(view,obj='')=>view==='home'?'#/':view==='map'?'#/map':view==='daily'?'#/policy'+(obj?'?date='+encodeURIComponent(obj):''):view==='topic'?(obj==='绿色算力'?'#/view/topic/'+encodeURIComponent(obj):'#/topics'+(obj&&obj!=='总览'?'?topic='+encodeURIComponent(obj):'')):'#/view/'+view+'/'+encodeURIComponent(obj);
let D,byId,historicalSources={},opener=null,compareOriginY=0,openHandler=null;const state={view:'home',object:'辽宁',tab:'policy',observation:2,topic:'全部',status:'全部状态',scope:'全国',national:false,limit:24,compare:[],graphMode:'chains',mapMetric:'cap',mapPick:'',graphTopic:'储能',graphPage:0,techCell:null,month:''};
const defaults={...state},viewStates=new Map();let stateKey=null;
function rememberView(){if(stateKey){const {compare,...snapshot}=state;viewStates.set(stateKey,{...snapshot,techCell:state.techCell?{...state.techCell}:null});}}
function restoreView(){const key=decodeURIComponent(location.hash||'#/'),compare=state.compare;rememberView();Object.assign(state,defaults,{compare},viewStates.get(key)||{});stateKey=key;}
const names={home:'研究总览',watch:'重点议题',map:'投资分级地图',province:'省份看板',technology:'技术路线',topic:'专题研究',graph:'政策图谱',daily:'能碳日报',tools:'收益测算工具',services:'咨询与定制'},kindName={policy:'政策',notice:'通知',article:'资料',index:'索引'};
const allText=d=>d.title+' '+d.summary,mention=(d,terms)=>terms.some(t=>allText(d).includes(t));
const regionName=r=>/蒙西|蒙东|内蒙古/.test(r)?'内蒙古':r?.startsWith('河北')?'河北':r;
const sameRegion=(d,r)=>r==='全国'||d.region===r||regionName(d.region)===r;
const topicDef=n=>D.topics.find(t=>t.name===n)||window.EnergyWatchChannels.extraThemes.find(t=>t.name===n),techDef=n=>D.technologies.find(t=>t.name===n);
const topicMatch=(d,n)=>n==='全部'||!topicDef(n)||mention(d,topicDef(n).terms);
const sorted=rows=>[...rows].sort((a,b)=>(b.published||b.issued||'').localeCompare(a.published||a.issued||''));
const badge=d=>`<span class="badge ${/征求|草案|公示/.test(d.status)?'draft':/未施行/.test(d.status)?'future':''}">${esc(d.status||'状态未标注')}</span>`;
const icon=(key,modifier='')=>`<svg class="ui-icon ${modifier}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.EnergyIcons||{})[key]||''}</svg>`;
const topicIcons=['bolt','chart-line','database','map-2','building-factory-2','file-analytics'];
function head(title,sub){return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>`;}
function scopeHTML(){return `<div class="scope-line"><label for="scope">地区范围</label><select id="scope" data-scope><option>全国</option>${[...new Set([...D.regions,...(state.scope==='全国'?[]:[state.scope])])].map(r=>`<option ${state.scope===r?'selected':''}>${r}</option>`).join('')}</select></div>`;}
function row(d){return `<article class="doc-row"><span class="doc-icon ${d.kind}">${kindName[d.kind]||'资料'}</span><div class="doc-main"><button class="doc-title" data-doc="${d.id}">${esc(d.title)}</button><div class="doc-meta">${badge(d)}<span>${esc(d.region||'地区未标注')}</span><span>${d.published?'公开 '+esc(d.published):'成文 '+esc(d.issued||'未确认')+' · 公开日未标注'}</span>${d.no?`<span>${esc(d.no)}</span>`:''}</div></div><div class="row-actions"><button data-doc="${d.id}">展开</button><button data-compare="${d.id}" class="${state.compare.includes(d.id)?'on':''}" aria-label="${state.compare.includes(d.id)?'移出':'加入'}对照：${esc(d.title)}">${state.compare.includes(d.id)?'已选':'对照 ＋'}</button></div></article>`;}
function list(rows,title='相关文件'){rows=sorted(rows);return `<section class="panel"><div class="panel-head"><h2>${title}</h2><small>${rows.length} 条索引</small></div><div class="doc-list">${rows.length?rows.slice(0,state.limit).map(row).join(''):'<p class="empty">当前快照暂无匹配记录，可切换范围或主题查看。</p>'}</div>${rows.length>state.limit?`<div class="panel-foot"><span>当前显示 ${state.limit} / ${rows.length}</span><button class="text-link" data-more>继续展开24条 ↓</button></div>`:''}</section>`;}
function compareTray(){return state.compare.length?`<div class="compare-tray"><span>文件对照 · ${state.compare.map(c=>esc(byId[c].region||byId[c].id)).join(' / ')}<small>（最多3件）</small></span><div><button class="chip" data-show-compare ${state.compare.length<2?'disabled':''}>展开对照 ${state.compare.length}</button> <button class="text-link" data-clear-compare>清空</button></div></div>`:'';}

function mapBlock(compact=false){const model=window.EnergyPolicyMap.build(D.map),metric=model.metrics.find(m=>m.key===state.mapMetric)||model.metrics[0];const categories=[...new Set([...metric.order,...metric.provinces.map(p=>p.category)])].filter(c=>metric.provinces.some(p=>p.category===c));
const tiles=`<div class="policy-tiles" role="group" aria-label="${esc(metric.label)}省份方块地图">${metric.provinces.map(p=>`<a class="policy-tile ${state.mapPick&&state.mapPick!==p.category?'dimmed':''}" href="#/p/${encodeURIComponent(p.name)}" data-map-province="${p.name}" style="grid-column:${p.position[0]+1};grid-row:${p.position[1]+1};--tile:${p.color};--tile-ink:${['#2F4B8A','#5B78BD','#C9553F'].includes(p.color)?'#fff':'#26374b'}" aria-label="${esc(p.name+'，'+p.category+'，进入省份看板')}" title="${esc(p.name+' · '+p.category)}"><b>${p.name}</b><small>${esc(p.category.replace('连续结算试运行','连续试运行').replace('未见省级容量补偿','库内未见').replace('其他补偿形式','其他形式'))}</small></a>`).join('')}</div>`;
const controls=`<div class="atlas-map-modes" aria-label="地图维度" role="group">${model.metrics.map(m=>`<button type="button" data-map-metric="${m.key}" aria-pressed="${metric.key===m.key}">${esc(m.label)}</button>`).join('')}</div>`;
if(compact){
  const legend=categories.map(category=>{
    const color=metric.provinces.find(p=>p.category===category).color;
    const picked=state.mapPick===category;
    return `<button type="button" data-map-category="${esc(category)}" aria-pressed="${picked}"><i style="--swatch:${color}" aria-hidden="true"></i>${esc(category)}</button>`;
  }).join('');
  return `<section class="atlas-home-map panel" aria-labelledby="home-map-title">
    <div class="atlas-section-head"><h2 id="home-map-title">投资分级地图</h2><a href="#/map">完整地图 <span aria-hidden="true">↗</span></a></div>
    ${controls}
    <div class="atlas-map-view" tabindex="0" role="region" aria-label="省份地图">${tiles}</div>
    <div class="atlas-map-key" aria-label="筛选地图图例" role="group">${legend}</div>
    <p class="atlas-map-note">${esc(metric.note)}</p>
  </section>`;
}
return `<section class="panel map-panel ${compact?'map-compact':''}"><div class="panel-head"><div><h2>投资分级地图</h2><small>电网侧独立储能 · 切换维度查看区域差异</small></div>${compact?`<a class="text-link" href="${url('map')}">展开地图 →</a>`:`<a class="text-link" href="${base}#/map" target="_blank" rel="noopener">已有在线地图 ↗</a>`}</div><div class="filterbar"><small>着色维度</small>${model.metrics.map(m=>`<button class="chip ${metric.key===m.key?'active':''}" data-map-metric="${m.key}" aria-pressed="${metric.key===m.key}">${esc(m.label)}</button>`).join('')}</div><div class="map-layout"><div class="map-canvas">${tiles}</div><aside class="map-context"><div class="legend-label">图例 <small>点击筛选，再点取消</small></div><div class="map-legend">${categories.map(c=>`<button class="${state.mapPick===c?'picked':''}" data-map-category="${esc(c)}" aria-pressed="${state.mapPick===c}"><i style="background:${metric.provinces.find(p=>p.category===c).color}"></i><span>${esc(c)}</span><small>${metric.provinces.filter(p=>p.category===c).length}</small></button>`).join('')}</div><div id="map-peek" class="map-peek"><b>从地图进入负责地区</b><span>悬停或键盘聚焦看分类，点击进入省份看板。</span></div><p class="map-note">${esc(metric.note)}</p></aside></div><p class="map-scroll-hint">窄屏可横向滑动地图，点省份进入看板。</p><div class="panel-foot">同一政策维度下看地区差异。蒙东、蒙西按原电网板块分别展示。</div></section>`;}
const topicDetails={
  储能:['bolt','容量电价、现货与辅助服务'],
  绿电直连:['arrow-right','接入、消纳与结算'],
  零碳园区:['map-2','园区用能与项目边界'],
  零碳工厂:['building-factory-2','创建条件、评价与认定'],
  虚拟电厂:['adjustments-horizontal','聚合准入、调度与响应'],
  绿色算力:['database','算电协同与用能约束'],
};
function observedChain(){
 const official=byId.ZCLN38,framework=byId.ZCGJ03,draft=byId.ZCLN05;
 if(!official?.url||!framework?.url||!draft?.title||!historicalSources.ZCLN05||!official.effective||!official.published||!framework.published)return '';
 const nodes=[
  {doc:framework,label:'国家依据',date:framework.published},
  {doc:draft,label:'辽宁征求意见',date:historicalSources.ZCLN05.date,source:historicalSources.ZCLN05.url},
  {doc:official,label:'正式公布',date:official.published},
  {doc:official,label:'施行日期',date:official.effective,summary:`文件规定自 ${official.effective} 起试行。`}
 ];
 return `<section class="obs-feature" aria-labelledby="observation-title">
  <header><div><div class="obs-feature-kicker"><span aria-hidden="true"></span>政策观测台</div><h2 id="observation-title">辽宁可靠容量补偿</h2></div><a href="#/topics?topic=储能&amp;section=capacity&amp;province=辽宁">容量电价专题 ↗</a></header>
  <ol class="obs-track">${nodes.map(({label,date},i)=>`<li><button type="button" data-observation="${i}" aria-pressed="${i===state.observation}"><span aria-hidden="true"></span><time datetime="${esc(date)}">${esc(date.slice(date.slice(0,4)===official.published.slice(0,4)?5:0).replaceAll('-','.'))}</time><strong>${label}</strong></button></li>`).join('')}</ol>
  <div class="obs-evidence" aria-live="polite">${observationDetail(nodes[state.observation])}</div>
 </section>`;
}
function observationDetail({doc,source,summary}){
 const href=source||doc.url;
 return `<div><h3>${esc(doc.title)}</h3>${summary||doc.summary?`<p>${esc(summary||doc.summary)}</p>`:''}</div><div class="obs-feature-links"><a href="${esc(doc.route)}">阅读分析 →</a>${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">官方原文 ↗</a>`:''}</div>`;
}
function home(){return window.EnergyWatch.overview();}
function watch(){return window.EnergyWatch.issuePage(state.object);}
function mapPage(){return head('投资分级地图','切换政策维度、筛选图例，再进入省份看板。')+mapBlock(false);}

function province(){const region=state.object;const regional=D.docs.filter(d=>sameRegion(d,region));const rows=state.national?[...regional,...D.docs.filter(d=>['全国','国家'].includes(d.region))]:regional;
 const filtered=rows.filter(d=>topicMatch(d,state.topic)&&(state.status==='全部状态'||d.status===state.status));let visible=filtered;
 if(['policy','notice','article'].includes(state.tab))visible=filtered.filter(d=>d.kind===state.tab||(state.tab==='policy'&&d.kind==='index'));
 if(state.tab==='development')visible=filtered.filter(d=>mention(d,['准入','建设','备案','并网','布局','申报','清单']));
 if(state.tab==='questions')visible=filtered.filter(d=>!d.published||/征求|未施行|废止|失效/.test(d.status));
 return `${head('按省份进入研究','选择负责地区，再按政策、通知、开发环节和状态查看。')}<div class="object-layout"><aside class="object-list"><label><input id="province-search" placeholder="定位省份" aria-label="定位省份"></label><ul>${D.regions.map(r=>`<li data-province-name="${r}"><a href="${url('province',r)}" class="${region===r?'selected':''}"><span>${r}</span><small>${D.docs.filter(d=>sameRegion(d,r)).length}</small></a></li>`).join('')}</ul></aside><div class="object-content"><section class="object-head"><div><h1><span class="object-mark">${region.slice(0,2)}</span>${esc(region)}</h1><p>地区文件索引 · ${region==='内蒙古'?'蒙东 / 蒙西板块保持各自原文范围':'国家文件可按需并入查看'}</p><a class="text-link" href="#/p/${encodeURIComponent(region==='内蒙古'?'蒙西':region)}">参数与开发条件看板 →</a> <a class="text-link" href="#/topics?topic=储能&amp;section=capacity&amp;province=${encodeURIComponent(region)}">看容量电价专题与省际对照 →</a></div><div class="object-counts"><div><strong>${regional.length}</strong>文件索引</div><div><strong>${regional.filter(d=>d.kind==='notice').length}</strong>通知</div><div><strong>${new Set(regional.map(d=>(d.published||d.issued||'').slice(0,4)).filter(Boolean)).size}</strong>年度</div></div></section><section class="panel"><div class="filterbar">${[['policy','政策与索引'],['notice','通知'],['development','开发条件'],['questions','问题与状态']].map(([v,n])=>`<button class="chip ${state.tab===v?'active':''}" data-tab="${v}" aria-pressed="${state.tab===v}">${n}</button>`).join('')}<label class="muted"><input type="checkbox" data-national ${state.national?'checked':''}> 同时看国家文件</label></div><div class="filterbar"><small>主题</small>${['全部',...D.topics.map(t=>t.name)].map(t=>`<button class="chip ${state.topic===t?'active':''}" data-topic-filter="${t}">${t}</button>`).join('')}<select aria-label="文件状态" data-status><option>全部状态</option>${[...new Set(rows.map(d=>d.status).filter(Boolean))].sort().map(s=>`<option ${state.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>${state.tab==='development'?'<div class="panel-foot">按题名与摘要中的准入、建设、备案、并网、布局等词定位文件；展开文件核具体条件。</div>':state.tab==='questions'?'<div class="panel-foot">归集公开日未标注、征求意见、未施行与失效等状态，便于逐项核对；不自动生成项目风险结论。</div>':''}</section>${compareTray()}${list(visible)}<section class="panel"><div class="panel-head"><h2>从本省继续浏览</h2><small>关联主题</small></div><div class="topic-chips">${D.topics.map(t=>{const n=regional.filter(d=>topicMatch(d,t.name)).length;return `<a class="topic-pill" href="${url('topic',t.name)}"><b>${t.name}</b><span>${n} 条本省摘要提及</span></a>`}).join('')}</div></section></div></div>`;}
const phases=[{name:'规划与建设',terms:['规划','行动','建设','布局']},{name:'项目与名单',terms:['项目','清单','名单','试点']},{name:'电价与交易',terms:['电价','补偿','结算','交易','市场']},{name:'安全与管理',terms:['安全','管理','监管','标准']}];
function technology(){
 const selected=techDef(state.object)||D.technologies[0],scoped=D.docs.filter(d=>sameRegion(d,state.scope)),rows=scoped.filter(d=>mention(d,selected.terms));
 const cell=state.techCell,active=cell?techDef(cell.tech):selected;
 const technologyRows=D.technologies.map(tech=>{
  const matches=scoped.filter(d=>mention(d,tech.terms));
  return {tech,matches,counts:phases.map(p=>matches.filter(d=>mention(d,p.terms)).length)};
 });
 const picked=cell?technologyRows.find(row=>row.tech===active).matches.filter(d=>mention(d,phases[cell.phase].terms)):rows;
 return `${head(selected.name+' · 技术路线','按技术与政策环节阅读文件，具体条件回到原文。')}
 <nav class="technology-picker" aria-label="选择技术路线">${D.technologies.map(t=>`<a href="${url('technology',t.name)}" class="technology-choice ${selected.name===t.name?'selected':''}" ${selected.name===t.name?'aria-current="page"':''}><span class="technology-mark">${esc(t.short)}</span><strong>${esc(t.name)}</strong></a>`).join('')}</nav>
 <section class="panel route-lens"><div class="panel-head"><h2>按环节看${esc(selected.name)}</h2>${scopeHTML()}</div>
 <div class="filterbar" aria-label="筛选环节"><button class="chip ${!cell?'active':''}" data-clear-cell aria-pressed="${!cell}">全部</button>${phases.map((phase,i)=>`<button class="chip ${cell?.tech===selected.name&&cell.phase===i?'active':''}" data-tech-cell="${esc(selected.name)}|${i}" aria-pressed="${cell?.tech===selected.name&&cell.phase===i}">${phase.name}</button>`).join('')}</div>
 <details class="obs-technology-compare"${cell&&cell.tech!==selected.name?' open':''}><summary>展开跨技术对照</summary><p class="note">统计题名或摘要提及。同一文件可涉及多个环节。</p>
 <div class="matrix-scroll technology-matrix" role="region" aria-label="技术路线与政策环节对照表" tabindex="0">
  <table class="matrix"><thead><tr><th scope="col">技术路线</th>${phases.map(p=>`<th scope="col">${p.name}</th>`).join('')}</tr></thead>
  <tbody>${technologyRows.map(({tech,counts})=>`<tr class="${tech===active?'selected':''}"><th scope="row"><a href="${url('technology',tech.name)}">${esc(tech.name)}</a></th>
   ${counts.map((n,i)=>`<td>${n?`<button type="button" data-tech-cell="${esc(tech.name)}|${i}" aria-pressed="${cell?.tech===tech.name&&cell.phase===i}" aria-label="${esc(tech.name)}，${phases[i].name}，${n}份文件">${n}</button>`:'<span class="matrix-empty" aria-label="无匹配">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
 <div class="route-selection">${cell?`<strong>${esc(active.name)} · ${phases[cell.phase].name}</strong><button type="button" class="text-link" data-clear-cell>查看${esc(selected.name)}全部文件</button>`:`<strong>${esc(selected.name)} · 全部相关文件</strong>`}</div></section>
 ${compareTray()}${list(picked,active.name+' · '+(cell?phases[cell.phase].name:'相关文件'))}`;
}

function topic(){const t=topicDef(state.object);if(!t)return `${head('按专题组织阅读','政策、通知、技术提及与沿革，围绕同一主题关联。')}<div class="theme-grid">${D.topics.map((t,i)=>{const rows=D.docs.filter(d=>topicMatch(d,t.name));return `<a class="theme-card" href="${url('topic',t.name)}"><span class="theme-sign">${icon(topicIcons[i])}</span><h3>${t.name}</h3><p>${t.terms.join(' / ')}</p><footer><span>${rows.length} 条摘要提及</span><span>进入专题 →</span></footer></a>`}).join('')}</div>`;
 const rows=D.docs.filter(d=>topicMatch(d,t.name)&&sameRegion(d,state.scope));
 const watch=window.EnergyWatch, tr=window.EnergyWatchChannels.tr;
 const label=window.EnergyWatchChannels.topicLabel(t.name);
 const openCase=new URLSearchParams(location.hash.split('?')[1]||'').get('case')||'';

 return `<div class="page-head"><h1>${esc(label)}</h1><a class="text-link" href="#/topics">${tr('全部专题','All themes')} →</a></div><nav class="obs-context-links" aria-label="${tr('专题路径','Research links')}"><a href="${url('graph',t.name)}">${tr('政策图谱','Policy relationships')} →</a><a href="#/research">${tr('研究资料','Research library')} →</a></nav>${watch.investmentPanel(t.name)}${watch.topicCases(t.name,openCase)}${scopeHTML()}${compareTray()}${list(rows,tr('专题文件','Related documents'))}`;}

function graph(){
 const topic=topicDef(state.object)?state.object:'储能';state.graphTopic=topic;
 const rows=D.docs.filter(d=>topicMatch(d,topic)&&sameRegion(d,state.scope)),set=new Set(rows.map(d=>d.id)),edges=D.edges.filter(e=>set.has(e.from)||set.has(e.to));
 const clusters=new Map();
 for(const edge of edges){
  if(!clusters.has(edge.from))clusters.set(edge.from,[]);
  clusters.get(edge.from).push(edge);
 }
 const groups=[...clusters].sort((a,b)=>b[1].length-a[1].length);
 const size=8,pages=Math.max(1,Math.ceil(groups.length/size));
 state.graphPage=Math.min(state.graphPage,pages-1);
 const chosen=groups.slice(state.graphPage*size,state.graphPage*size+size);
 if(!['chains','time'].includes(state.graphMode))state.graphMode='chains';
 const docCard=(id)=>{const d=byId[id];return `<div class="relation-document"><span class="relation-document-meta">${esc(d.region||'地区未标注')} · ${d.published?'公开 '+esc(d.published):'成文 '+esc(d.issued||'未标注')}</span><button class="relation-document-title" data-doc="${esc(id)}">${esc(d.title||id)}</button><div class="relation-document-foot">${badge(d)}<button class="text-link" data-compare="${esc(id)}" aria-label="${state.compare.includes(id)?'移出':'加入'}对照：${esc(d.title||id)}">${state.compare.includes(id)?'已选对照':'加入对照'}</button></div></div>`;};
 let content,files='';
 if(state.graphMode==='chains'){
 content=chosen.length?`<div class="obs-relation-index">${chosen.map(([from,group],i)=>`<details class="obs-relation-cluster"${i===0?' open':''}><summary><span>${esc(byId[from].title)}</span><small>${group.length} 条关联</small></summary><div>${group.map(edge=>`<article class="relation-story"><div class="relation-story-label"><strong>${esc(edge.type)}</strong></div><div class="relation-pair">${docCard(edge.from)}<span class="relation-connector" aria-label="索引方向">→</span>${docCard(edge.to)}</div><details class="relation-proof"><summary>查看关系依据 · ${edge.evidence.length}条</summary>${edge.evidence.map(x=>`<blockquote>${esc(x.原句)}<cite>${esc(x.编号||edge.to)} · 物理页 ${esc(x.页||'未标注')}</cite></blockquote>`).join('')}</details></article>`).join('')}</div></details>`).join('')}</div>`:'<p class="empty">此范围尚未收录带原句的文件关系。</p>';
 if(!chosen.length)files=list(rows,'该范围的相关文件');
 }else{
 const year=D.meta.asof.slice(0,4),months=Array.from({length:Number(D.meta.asof.slice(5,7))},(_,i)=>year+'-'+String(i+1).padStart(2,'0')),
 valid=rows.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.published)&&d.published<=D.meta.asof),counts=months.map(m=>valid.filter(d=>d.published.startsWith(m)).length),max=Math.max(1,...counts);
 if(!months.includes(state.month))state.month=[...months].reverse().find((m)=>valid.some(d=>d.published.startsWith(m)))||months.at(-1);
 content=`<div class="timeline reading-timeline"><div class="bars">${months.map((m,i)=>`<button class="bar-col ${state.month===m?'active':''}" data-month="${m}" aria-pressed="${state.month===m}" aria-label="${m}公开日索引${counts[i]}条"><span class="bar-val">${counts[i]}</span><span class="bar" style="height:${counts[i]/max*112}px"></span><span>${i+1}月</span></button>`).join('')}</div><p class="note">${year}年本站收录文件的公开日期分布，非全国发布总量或政策支持强度。未标公开日的文件不混入。</p></div>`;
 files=list(valid.filter(d=>d.published.startsWith(state.month)),state.month+' · 对应文件');
 }
 return `${head(topic+' · 政策图谱','按文件查引用关系，按时间看收录分布。')}${topic==='储能'&&['全国','辽宁'].includes(state.scope)?observedChain():''}<section class="panel graph-controls"><div class="filterbar" aria-label="图谱主题">${D.topics.map(t=>`<a class="chip ${t.name===topic?'active':''}" href="${url('graph',t.name)}">${t.name}</a>`).join('')}</div><div class="panel-head"><div class="view-switch" aria-label="图谱视图">${[['chains','关联脉络'],['time','时间分布']].map(([v,n])=>`<button class="chip ${state.graphMode===v?'active':''}" data-graph-mode="${v}" aria-pressed="${state.graphMode===v}">${n}</button>`).join('')}</div>${scopeHTML()}</div></section>${compareTray()}
 ${state.graphMode==='chains'?`<p class="graph-caption">${edges.length}条政策关联 · 按已收录引句阅读；关联不等于效力替代。</p>`:''}
 ${content}${state.graphMode==='chains'&&groups.length>size?`<div class="panel-foot"><button class="chip" data-graph-prev ${state.graphPage===0?'disabled':''}>上一组</button><span>${state.graphPage+1} / ${pages}</span><button class="chip" data-graph-next ${state.graphPage===pages-1?'disabled':''}>下一组</button></div>`:''}${files}`;
}
function daily(){const dates=[...new Set(D.docs.map(d=>d.published).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=D.meta.asof))].sort().reverse(),day=dates.includes(state.object)?state.object:dates[0];const rows=D.docs.filter(d=>d.published===day);return `${head('按公开日期阅读','按文件页面公开日定位；成文日、施行日和补录日分开。')}<div class="object-layout"><aside class="object-list"><ul>${dates.slice(0,50).map(d=>`<li><a href="${url('daily',d)}" class="${d===day?'selected':''}"><span>${d}</span><small>${D.docs.filter(r=>r.published===d).length}</small></a></li>`).join('')}</ul></aside><div class="object-content"><section class="object-head"><div><h1>${day}</h1><p>${day===D.meta.asof?'当日页面公开记录':'历史页面公开记录；不冒作今日新发'}</p></div><div class="object-counts"><div><strong>${rows.filter(d=>d.kind==='policy').length}</strong>已分类政策</div><div><strong>${rows.filter(d=>d.kind==='notice').length}</strong>通知</div></div></section>${compareTray()}${list(rows,'该日文件')}</div></div>`;}
function resetReader(){const reader=$('#atlas-reader');if(reader){reader.hidden=true;document.querySelector('.atlas-main')?.append(reader);}}
function render(){if(!D)return;const [path,query]=location.hash.split('?');const parts=path.replace(/^#\/?/,'').replace(/^view\//,'').split('/');state.view=names[parts[0]]?parts[0]:'home';state.object=decodeURIComponent(parts.slice(1).join('/')||({home:'总览',map:'全国',province:'辽宁',technology:'锂离子',topic:'总览',graph:'储能',daily:'2026-11-09'}[state.view]));document.querySelector('#app').dataset.workspace=state.view;if(state.view==='province')state.scope=state.object;const requested=new URLSearchParams(query).get('region');if(requested&&(D.regions.includes(requested)||Object.hasOwn(D.map.provinces,requested)))state.scope=requested;resetReader();document.querySelectorAll('[data-view]').forEach(a=>a.setAttribute('aria-current',a.dataset.view===(state.view==='province'?'map':state.view)?'page':'false'));$('#atlas-workspace').innerHTML=({home,watch,map:mapPage,province,technology,topic,graph,daily}[state.view])();$('#atlas-version').textContent=D.meta.version+' · '+D.meta.exported;if(state.view==='home')window.EnergyWatch.bindOverview();if(state.view==='topic'){window.EnergyWatch.bindTopicMap(D.map);const dossier=$('.topic-dossier[open]');if(dossier)requestAnimationFrame(()=>dossier.scrollIntoView({block:'start'}));}}
function refresh(){const keepCompare=!$('#atlas-reader')?.hidden&&!!$('#atlas-reader .compare-table');resetReader();const limit=state.limit;$('#atlas-workspace').innerHTML=({home,watch,map:mapPage,province,technology,topic,graph,daily}[state.view])();state.limit=limit;if(state.view==='home')window.EnergyWatch.bindOverview();if(keepCompare&&state.compare.length>=2){const trigger=$('[data-show-compare]');if(trigger)showCompare(trigger,{scroll:false,preserveOrigin:true});}}
function openDoc(id,origin){if(openHandler&&byId[id]){const reader=$('#atlas-reader');if(reader)reader.hidden=true;openHandler(id,origin);return;}const d=byId[id];if(!d)return;opener=origin||opener;const p=$('#atlas-reader');p.hidden=false;const related=D.edges.filter(e=>e.from===id||e.to===id).slice(0,8);p.innerHTML=`<div class="reader-head"><div><small class="muted">${kindName[d.kind]||'资料'} / ${esc(d.region)} / ${d.id}</small><h2>${esc(d.title)}</h2></div><button class="reader-close" data-close-reader aria-label="收起文件详情">×</button></div><div class="reader-meta">${badge(d)}${d.no?`<span class="badge">${esc(d.no)}</span>`:''}<span class="muted">成文 ${esc(d.issued||'未标注')} · 公开 ${esc(d.published||'未标注')}${d.effective?' · 施行 '+esc(d.effective):''}</span></div><div class="reader-summary"><small>已有公开摘要</small><p>${esc(d.summary||'此索引尚未提供摘要，请查看原文或已有研究页。')}</p></div><div class="reader-links">${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener">来源原页 ↗</a>`:''}${!id.startsWith('RPLY-')?`<a href="${base}${d.route||('#/brief/'+id)}">已有研究页 ↗</a>`:''}${D.regions.includes(regionName(d.region))?`<a href="${url('province',regionName(d.region))}">进入${esc(regionName(d.region))}看板 →</a>`:''}</div><div class="topic-chips">${D.topics.filter(t=>topicMatch(d,t.name)).map(t=>`<a class="chip" href="${url('topic',t.name)}">${t.name}</a>`).join('')}${D.technologies.filter(t=>mention(d,t.terms)).map(t=>`<a class="chip" href="${url('technology',t.name)}">${t.name}</a>`).join('')}</div>${d.boundary?`<div class="evidence"><strong>适用边界</strong><p>${esc(d.boundary)}</p>${d.quote?`<blockquote>${esc(d.quote)}</blockquote>`:''}</div>`:''}${related.length?`<div class="relations"><h3>沿关联继续阅读</h3>${related.map(e=>{const other=e.from===id?e.to:e.from;return `<div class="relation-row"><span class="badge">${esc(e.type)}</span><button data-doc="${other}">${esc(byId[other].title)} →</button></div>`}).join('')}</div>`:''}`;p.focus({preventScroll:true});p.scrollIntoView({block:'nearest',behavior:'smooth'});}
function openEdge(i,origin){const e=D.edges[i];if(!e)return;openDoc(e.to,origin);const proof=`<div class="evidence"><strong>${esc(byId[e.from].title)} → ${esc(byId[e.to].title)}</strong><small>索引关系：${esc(e.type)}；关系文字与引句均按既有公开索引呈现。</small>${e.evidence.map(x=>`<p>“${esc(x.原句)}”<small>${esc(x.编号||e.to)} · 原索引页码 ${esc(x.页||'未标注')}</small></p>`).join('')}</div>`;const anchor=openHandler?document.querySelector('#analysis-workspace .analysis-toolbar'):$('#atlas-reader .reader-meta');if(anchor)anchor.insertAdjacentHTML('afterend',proof);}
function showCompare(origin,options={}){document.querySelector('#analysis-workspace [data-analysis-close]')?.click();opener=origin;if(!options.preserveOrigin)compareOriginY=window.scrollY;const p=$('#atlas-reader'),rows=state.compare.map(c=>byId[c]);origin.closest('.compare-tray')?.after(p);p.hidden=false;p.innerHTML=`<div class="reader-head"><div><small class="muted">同字段对照 · 文件作用不等同</small><h2>文件并排看</h2></div><div><button class="chip" data-close-reader>返回列表</button> <button class="chip" data-close-reader>收起分析</button></div></div><div class="matrix-scroll"><table class="compare-table"><thead><tr><th>字段</th>${rows.map(d=>`<th>${esc(d.region)} / ${esc(d.title)}</th>`).join('')}</tr></thead><tbody>${[['状态','status'],['成文日期','issued'],['公开日期','published'],['施行日期','effective'],['已有摘要','summary']].map(([label,key])=>`<tr><th>${label}</th>${rows.map(d=>`<td>${esc(d[key]||'未标注')}</td>`).join('')}</tr>`).join('')}<tr><th>回到文件</th>${rows.map(d=>`<td><button class="text-link" data-doc="${d.id}">展开文件与关联 →</button></td>`).join('')}</tr></tbody></table></div>`;if(options.scroll!==false){p.focus({preventScroll:true});p.scrollIntoView({block:'nearest',behavior:'smooth'});}}
document.addEventListener('click',e=>{if(!e.target.closest('.atlas-shell'))return;const b=e.target.closest('button');if(!b)return;if(b.dataset.mapMetric){state.mapMetric=b.dataset.mapMetric;state.mapPick='';refresh();$('[data-map-metric="'+CSS.escape(b.dataset.mapMetric)+'"]')?.focus({preventScroll:true});}if(b.dataset.mapCategory){state.mapPick=state.mapPick===b.dataset.mapCategory?'':b.dataset.mapCategory;refresh();$('[data-map-category="'+CSS.escape(b.dataset.mapCategory)+'"]')?.focus({preventScroll:true});}if(b.dataset.observation!==undefined){
 state.observation=Number(b.dataset.observation);
 const feature=b.closest('.obs-feature'),next=document.createElement('template');
 next.innerHTML=observedChain();
 feature.querySelectorAll('[data-observation]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));
 feature.querySelector('.obs-evidence').innerHTML=next.content.querySelector('.obs-evidence').innerHTML;
}if(b.dataset.doc)openDoc(b.dataset.doc,b);if(b.dataset.edge!==undefined)openEdge(Number(b.dataset.edge),b);if(b.hasAttribute('data-close-reader')){$('#atlas-reader').hidden=true;if(opener?.isConnected)opener.focus({preventScroll:true});window.scrollTo(0,compareOriginY);}if(b.dataset.tab){state.tab=b.dataset.tab;state.limit=24;refresh();}if(b.dataset.topicFilter){state.topic=b.dataset.topicFilter;state.limit=24;refresh();}if(b.hasAttribute('data-more')){state.limit+=24;refresh();}if(b.dataset.compare){const id=b.dataset.compare;if(state.compare.includes(id))state.compare=state.compare.filter(x=>x!==id);else if(state.compare.length<3)state.compare.push(id);refresh();}if(b.hasAttribute('data-clear-compare')){state.compare=[];refresh();}if(b.hasAttribute('data-show-compare'))showCompare(b);if(b.dataset.techCell){const [tech,phase]=b.dataset.techCell.split('|');state.techCell={tech,phase:Number(phase)};refresh();$('[data-tech-cell="'+CSS.escape(b.dataset.techCell)+'"]')?.focus({preventScroll:true});}if(b.hasAttribute('data-clear-cell')){state.techCell=null;refresh();}if(b.hasAttribute('data-graph-prev')){state.graphPage=Math.max(0,state.graphPage-1);refresh();}if(b.hasAttribute('data-graph-next')){state.graphPage++;refresh();}if(b.dataset.graphMode){state.graphMode=b.dataset.graphMode;state.month='';refresh();}if(b.dataset.month){state.month=b.dataset.month;refresh();}});
document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-atlas-search]');
  if(!form)return;
  event.preventDefault();
  const query=String(new FormData(form).get('q')||'').trim();
  if(query)location.hash='#/lib?q='+encodeURIComponent(query);
});
document.addEventListener('change',e=>{if(!e.target.closest('.atlas-shell'))return;if(e.target.hasAttribute('data-national')){state.national=e.target.checked;refresh();}if(e.target.hasAttribute('data-status')){state.status=e.target.value;refresh();}if(e.target.hasAttribute('data-scope')){state.scope=e.target.value;state.graphPage=0;state.techCell=null;refresh();}});
document.addEventListener('input',e=>{if(!e.target.closest('.atlas-shell'))return;if(e.target.id==='province-search'){const q=e.target.value.trim();document.querySelectorAll('[data-province-name]').forEach(x=>x.hidden=!x.dataset.provinceName.includes(q));}});
function peekMap(e){if(!D||!document.querySelector('.atlas-shell'))return;const a=e.target.closest('[data-map-province]');if(!a)return;const model=window.EnergyPolicyMap.build(D.map),m=model.metrics.find(m=>m.key===state.mapMetric)||model.metrics[0],p=m.provinces.find(p=>p.name===a.dataset.mapProvince),el=$('#map-peek');if(el&&p)el.innerHTML=`<b>${esc(p.name)} · ${esc(p.category)}</b><span>${esc(m.label)} · 点击进入省份文件与开发条件。</span>`;}
document.addEventListener('mouseover',peekMap);document.addEventListener('focusin',peekMap);

function readDailyFilters(p,now,legacy=''){
 const date=EnergyContent.validDate(p.get('date'))?p.get('date'):now;
 return {date,range:['day','week','month','7','30','all','index'].includes(p.get('range'))?p.get('range'):'day',type:['policy','notice'].includes(p.get('type'))?p.get('type'):'',prov:p.get('prov')||legacy,important:p.get('important')==='1',q:p.get('q')||''};
}
function dailyRoute(filters,entry=''){
 return '#/policy?'+new URLSearchParams(Object.entries({...filters,important:filters.important?'1':'',entry}).filter(([,value])=>value));
}
window.EnergyAtlas=Object.freeze({mount(raw,layer,replies,daily,history={}){
 historicalSources=history;D=normalize(raw,layer,replies,daily);window.EnergyWatch.setData(raw,D,history,daily);byId=Object.fromEntries(D.docs.map(d=>[d.id,d]));
 const host=document.querySelector('#app');host.classList.add('atlas-host');host.innerHTML=shellHTML();
 restoreView();render();
},wrap(raw,layer,replies,daily,view,object,history={}){
 const host=document.querySelector('#app');if(host.querySelector(':scope > .atlas-shell'))return;rememberView();stateKey=null;
 D=normalize(raw,layer,replies,daily);window.EnergyWatch.setData(raw,D,history,daily);byId=Object.fromEntries(D.docs.map(d=>[d.id,d]));
 const content=[...host.childNodes];host.classList.add('atlas-host');host.innerHTML=shellHTML();
 const work=document.querySelector('#atlas-workspace');for(const node of content)work.append(node);host.dataset.workspace=view;if(view==='map'){const map=work.querySelector('.mapcard'),kpis=work.querySelector('.kpis');if(map&&kpis&&map.parentElement===kpis.parentElement)kpis.before(map);}
 state.view=view;state.object=object||names[view]||'研究';
 document.querySelectorAll('.atlas-shell [data-view]').forEach(a=>a.setAttribute('aria-current',a.dataset.view===(view==='province'?'map':view)?'page':'false'));
 document.querySelector('#atlas-version').textContent=D.meta.version+' · '+D.meta.exported;
},setOpenHandler(handler){openHandler=handler;},readDailyFilters,dailyRoute,normalize});
})();
