/* Read-only views over the accepted public snapshot. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateShift=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
  const dossiers=[
    {key:'capacity',name:'辽宁可靠容量补偿',topic:'储能',region:'辽宁',lead:'ZCLN38',scope:'国家依据与地方版本',steps:[['ZCGJ03','国家依据'],['ZCLN05','征求意见'],['ZCLN38','正式公布']]},
    {key:'grid-access',name:'绿电直连的接入与交易',topic:'绿电直连',region:'吉林',lead:'ZCJL42',scope:'国家政策与地方实践',steps:[['ZCGJ120','国家政策方向'],['ZCNF36','南方区域注册细则'],['ZCJL42','吉林多用户试行方案']]},
    {key:'southern-market',name:'南方区域电力市场正式运行',topic:'电力市场',lead:'ZCGJ182',scope:'区域规则与运行安排',steps:[['ZCNF36','注册与披露细则'],['NTF-GZPEC-20261024-FORMAL','交易中心运行公告'],['ZCGJ182','主管部门复函']]},
    {key:'park-energy',name:'园区与算力的储能配置',topic:'零碳园区',lead:'ZCSC55',scope:'四川与广东同类条款对照',steps:[['ZCSC55','四川储能专项方案'],['ZCGD51','广东节能降碳行动计划']]}
  ];
  const Channels = window.EnergyWatchChannels;
  const {tr,topicLabel,provinceName}=Channels;
  const issueNames={
    capacity:['Reliable capacity payments in Liaoning','National framework and provincial rules'],
    'grid-access':['Grid access for direct green power','National policy and provincial implementation'],
    'southern-market':['Southern power market launch','Regional rules and operation'],
    'park-energy':['Storage for industrial parks and data centers','A comparison of Sichuan and Guangdong'],
  };
  const feedPageSize=6;
  let model;
  let overviewState;
  const caseRoute=key=>'#/watch/'+key;
  function project(raw,atlas,history={},daily=null,archive=null){
    const definitions=[...atlas.topics,...Channels.extraThemes];
    const themes=definitions.map(t=>t.name);
    const ranked=new Map((daily?.items || []).map(row=>[row.id,row.importance]));
    const documents=new Map(atlas.docs.filter(d=>d.status!=='来源待核').map(d=>[d.id,d]));
    const reviewedThemes=new Map((raw.briefs||[]).filter(b=>b.分析验收==='完整').map(b=>[b.编号,b.完整分析?.专题||[]]));
    const snapshot=raw.meta.exported.slice(0,10);
    const cutoff=EnergyContent.validDate(snapshot)&&snapshot<atlas.meta.asof?snapshot:atlas.meta.asof;
    const knownDocs=[...documents.values()].map(doc=>{
      const tags=reviewedThemes.get(doc.id)?.filter(t=>themes.includes(t))||[];
      const officialDate=doc.published||history[doc.id]?.date;
      const date=EnergyContent.validDate(officialDate)?officialDate:'';
      const topics=tags.length?tags:Channels.topicsOf(doc.title,definitions);
      return {...doc,date,dateLabel:'公开日期',topic:topics[0]||'其他',topics,channel:'policy',
        importance:ranked.get(doc.id)??null,url:history[doc.id]?.url||doc.url,kindLabel:doc.kind==='notice'?'公告':'政策'};
    });
    const known=new Map(knownDocs.map(doc=>[doc.id,doc]));
    const records=knownDocs.filter(doc=>doc.date&&doc.date<=cutoff&&['policy','notice'].includes(doc.kind))
      .sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
    const cases=dossiers.flatMap(dossier=>{
      const lead=known.get(dossier.lead);
      const steps=dossier.steps.flatMap(([id,label])=>{
        const doc=known.get(id);
        return doc?.url&&doc.date&&doc.date<=cutoff?[{doc,label,date:doc.date}]:[];
      }).sort((a,b)=>a.date.localeCompare(b.date));
      if(!lead?.url||steps.length<2||!steps.some(step=>step.doc.id===lead.id))return [];
      return [{...dossier,lead,steps}];
    });
    const library=Channels.researchMaterials(raw,known,definitions,cutoff);
    const replay=Channels.archiveMaterials(archive,definitions);
    const tiles=Channels.provinceTiles(window.EnergyPolicyMap.build(atlas.map).tiles);
    return {cutoff,asof:atlas.meta.asof,records,cases,documents:known,themes,library,replay,tiles};
  }
  function materials(){
    return model?.library||[];
  }
  function topicOf(row){
    return model?.documents.get(row.id)?.topic||'其他';
  }
  function setData(raw,atlas,history,daily){
    model=project(raw,atlas,history,daily,window.__OBSERVATORY_ARCHIVE__);
  }
  const kindBadge=doc=>`<span class="watch-kind ${doc.kind==='notice'?'notice':''}">${doc.archive||doc.channel!=='policy'?Channels.channelLabel(doc.channel):doc.kind==='notice'?tr('公告','Notice'):tr('政策','Policy')}</span>`;
  const dateName=doc=>doc.archive?tr('日报刊期','Briefing date'):doc.channel==='policy'?tr('公开日期','Published'):tr('资料日期','Material date');
  const sourceLink=(doc,label=tr('来源原页','Original source'))=>doc.url?`<a class="watch-source" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'';
  const icon=key=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.EnergyIcons?.[key]||''}</svg>`;
  function searchForm(){
    const label=tr('搜索政策、文号或地区','Search policies, references or regions');
    return `<form class="watch-search" data-atlas-search role="search"><label class="sr-only" for="watch-q">${label}</label><input id="watch-q" type="search" name="q" required placeholder="${label}"><button type="submit">${icon('search')}${tr('搜索','Search')}</button></form>`;
  }
  function caseIndex(topic=''){
    return `<ol class="watch-case-index">${model.cases.filter(c=>!topic||c.topic===topic).map(c=>`<li><a href="${caseRoute(c.key)}"><div><small>${esc(topicLabel(c.topic))}</small><strong>${tr(c.name,issueNames[c.key][0])}</strong><small>${tr(c.scope,issueNames[c.key][1])} · ${c.steps.length} ${tr('份材料','sources')}</small></div><span aria-hidden="true">↗</span></a></li>`).join('')}</ol>`;
  }
  const rangeLabels=()=>({7:tr('近 7 天','7 days'),30:tr('近 30 天','30 days'),all:tr('历史总览','All time')});
  const shortDate=date=>date.slice(5).replace('-','/');

  function timeWindow(range,replay){
    const end=replay?model.replay[0]?.date||model.asof:model.asof;
    return {start:range==='all'?'':dateShift(end,1-Number(range)),end};
  }

  function timeBins({start,end},records,range){
    if(range==='7'||range==='30'){
      const daysPerBin=range==='7'?1:5;
      return Array.from({length:Number(range)/daysPerBin},(_,i)=>{
        const first=dateShift(start,i*daysPerBin),last=dateShift(first,daysPerBin-1);
        return {first,last,label:shortDate(first)+(daysPerBin===1?'':'–'+shortDate(last))};
      });
    }
    const firstDate=records.filter(doc=>doc.date).map(doc=>doc.date).sort()[0];
    if(!firstDate)return [];
    const monthIndex=date=>Number(date.slice(0,4))*12+Number(date.slice(5,7))-1;
    const monthDate=index=>Math.floor(index/12)+'-'+String(index%12+1).padStart(2,'0')+'-01';
    const months=monthIndex(end)-monthIndex(firstDate)+1,step=Math.max(1,Math.ceil(months/7));
    return Array.from({length:Math.ceil(months/step)},(_,i)=>{
      const first=monthDate(monthIndex(firstDate)+i*step);
      const last=[dateShift(monthDate(monthIndex(first)+step),-1),end].sort()[0];
      return {first,last,label:first.slice(0,7)};
    });
  }

  function stream(records,window,range,topic,selectedBin){
    const bins=timeBins(window,records,range);
    if(!bins.length||!records.some(doc=>doc.date))return `<p class="watch-empty">${tr('当前范围暂无可按日期排列的材料。','No dated materials in this view.')}</p>`;
    const themes=topic?[topic]:[...model.themes,'其他'];
    const lanes=themes.map(theme=>{
      const rows=records.filter(doc=>doc.date&&(topic||doc.topic===theme));
      return {theme,total:rows.length,counts:bins.map(({first,last})=>rows.filter(doc=>doc.date>=first&&doc.date<=last).length)};
    });
    const max=Math.max(1,...lanes.flatMap(lane=>lane.counts));
    const dateLabels=bins.map(({first,last,label})=>`<time datetime="${first}" title="${first} – ${last}"><span class="watch-bin-full">${label}</span><span class="watch-bin-compact">${range==='all'?first.slice(2,7):shortDate(first)}</span></time>`).join('');
    return `<div class="watch-stream-grid"><div class="watch-lane watch-lane-dates"><span></span><small></small><div>${dateLabels}</div></div>${lanes.map(({theme,total,counts})=>
      `<div class="watch-lane" style="--lane:${Channels.themeColor(theme)}"><button type="button" class="watch-lane-theme" data-watch-topic="${esc(theme)}" title="${esc(topicLabel(theme))}" aria-pressed="${topic===theme}">${esc(topicLabel(theme))}</button><small>${total}</small><div>${bins.map(({first,last},i)=>{
        const count=counts[i];
        const dates=first===last?first:first+' – '+last;
        const label=`${topicLabel(theme)} · ${dates} · ${count}`;
        return count?`<button class="watch-lane-bin" type="button" title="${esc(label)}" aria-label="${esc(label)}"
          data-watch-bin="${first}" data-watch-bin-end="${last}" data-watch-bin-theme="${esc(theme)}"
          aria-pressed="${selectedBin?.start===first&&selectedBin.theme===theme}" style="--level:${Math.round(count/max*100)}%"><span>${count}</span></button>`:
          '<span class="watch-lane-gap" aria-hidden="true"></span>';
      }).join('')}</div></div>`).join('')}</div>`;
  }
  function material(doc){
    if(!doc)return `<p class="watch-empty">${tr('当前筛选没有材料。','No matching materials.')}</p>`;
    const title=doc.route?`<a href="${esc(doc.route)}">${esc(doc.title)}</a>`:esc(doc.title);
    return `<article class="watch-material" data-watch-current="${esc(doc.id)}">
      <div class="watch-card-meta">${kindBadge(doc)}<span>${esc(provinceName(doc.region)||doc.source||doc.issuer||'')}</span>${doc.date?`<time datetime="${esc(doc.date)}">${esc(doc.date)}</time>`:''}</div>
      <h3>${title}</h3>
      ${doc.summary?`<p>${esc(doc.summary)}</p>`:''}
      ${doc.archive?`<p class="watch-source-dates">${tr('旧稿标注日期','Date in archived item')} ${esc(doc.sourceDate||tr('未注明','Not given'))}</p>`:''}
      <div class="watch-material-foot">${doc.route?`<a href="${esc(doc.route)}">${doc.channel==='policy'?tr('阅读分析','Read analysis'):tr('查看资料','Open research')} →</a>`:''}${sourceLink(doc)}</div>
    </article>`;
  }

  function overview(){
    if(!overviewState)overviewState={channel:'',topic:'',province:'',range:'30',limit:feedPageSize,query:'',replay:false,selectedId:'',selectedBin:null,liveRange:'30'};
    const provinceOptions=Object.keys(model.tiles).sort((a,b)=>provinceName(a).localeCompare(provinceName(b),document.documentElement.lang));
    return `<div class="watch-overview obs-home">
      <header class="watch-masthead">
        <div><h1>${tr('能碳政策研究站','Energy & Carbon Policy Research')}</h1><p data-watch-coverage></p></div>
        ${searchForm()}
      </header>
      <div class="watch-frame" data-watch-board>
        <div class="watch-observer">
          <div class="watch-observer-controls">
            <div class="watch-topic-controls"><div data-watch-topics></div>${model.replay.length?`<button type="button" class="watch-control" data-watch-replay aria-pressed="${overviewState.replay}">${tr('旧日报题录','Briefing archive')}</button>`:''}</div>
            <div class="watch-mode-picker watch-range" role="group" aria-label="${tr('地图与政策流时间范围','Date range for map and policy feed')}">${Object.entries(rangeLabels()).map(([range,label])=>`<button type="button" data-watch-range="${range}" aria-pressed="${overviewState.range===range}">${label}</button>`).join('')}</div>
          </div>
          <div class="watch-scan-layout">
            <section class="watch-scan" aria-labelledby="watch-scan-title">
              <header class="watch-section-head"><h2 id="watch-scan-title">${tr('速览','At a glance')}</h2><div class="watch-step"><button type="button" data-watch-step="-1" aria-label="${tr('上一份材料','Previous item')}">${icon('chevron-left')}</button><button type="button" data-watch-step="1" aria-label="${tr('下一份材料','Next item')}">${icon('chevron-right')}</button></div></header>
              <div data-watch-channels></div><div data-watch-material></div><ul class="watch-material-list" aria-label="${tr('速览卡片','Briefing cards')}" data-watch-materials></ul>
            </section>
            <section class="watch-map-chart" aria-labelledby="watch-map-title">
              <header class="watch-map-toolbar">
                <h2 id="watch-map-title">${tr('省份分布','By province')}</h2>
                <label class="watch-province-picker watch-select"><span class="sr-only">${tr('定位省份','Find a province')}</span><select data-watch-province-picker><option value="">${tr('全部省份','All provinces')}</option>${provinceOptions.map(name=>`<option value="${esc(name)}">${esc(provinceName(name))}</option>`).join('')}</select></label>
              </header>
              <div class="watch-map-plate"><div data-watch-map></div><div data-watch-legend></div></div>
              <div data-watch-province-pane aria-live="polite"></div>
            </section>
          </div>
        </div>
        <section class="watch-stream" aria-labelledby="watch-stream-title">
          <header class="watch-section-head"><h2 id="watch-stream-title">${tr('政策流','Policy feed')}</h2><small class="watch-range-caption" data-watch-timeline-caption></small><a href="#/policy">${tr('能碳日报','Energy & Carbon Daily')} →</a></header>
          <div data-watch-stream></div>
          <div class="watch-archive-feed"><div class="watch-section-head"><div><h3 data-watch-feed-title></h3><small data-watch-feed-count></small></div><label><span class="sr-only">${tr('筛选政策流','Filter the policy feed')}</span><input type="search" data-watch-feed-search placeholder="${tr('筛选政策流','Filter feed')}"></label></div><div data-watch-feed></div></div>
        </section>
      </div>
    </div>`;
  }

  function feedList(rows,state){
    const byDate=new Map();
    for(const doc of rows.slice(0,state.limit)){
      const date=doc.date||tr('资料日期未注明','Date not recorded');
      if(!byDate.has(date))byDate.set(date,[]);
      byDate.get(date).push(doc);
    }
    if(!byDate.size)return `<p class="watch-empty">${tr('当前筛选没有材料。','No matching materials.')}</p>`;
    return [...byDate].map(([date,docs])=>`<section class="watch-feed-group" style="--items:${docs.length}">
      <header><strong>${esc(date)}</strong><span>${docs.length} ${tr('份','items')}</span></header>
      ${docs.map(doc=>`<article class="watch-feed-item" tabindex="-1">
        <div class="watch-card-meta">${kindBadge(doc)}<span>${esc(doc.source||doc.issuer||doc.region||'')}</span>${doc.archive?`<span>${tr('历史题录','Archive entry')}</span>`:`<span>${dateName(doc)}</span>`}</div>
        <h3>${doc.route?`<a href="${esc(doc.route)}">${esc(doc.title)}</a>`:esc(doc.title)}</h3>
        ${doc.summary?`<p>${esc(doc.summary)}</p>`:''}
        <footer>${doc.archive?`<span>${tr('旧稿标注日期','Date in archived item')} ${esc(doc.sourceDate||tr('未注明','Not given'))}</span>`:''}${sourceLink(doc)}</footer>
      </article>`).join('')}
    </section>`).join('')+(rows.length>state.limit?`<button class="watch-control" type="button" data-watch-more>${tr('加载更多','Load more')}</button>`:'');
  }

  function bindOverview(){
    const board=document.querySelector('[data-watch-board]');
    if(!board)return;
    const state=overviewState;
    const find=s=>board.querySelector(s);
    const coverage=document.querySelector('[data-watch-coverage]');
    const queryInput=find('[data-watch-feed-search]');
    const provincePicker=find('[data-watch-province-picker]');
    find('[data-watch-topics]').innerHTML=Channels.topicButtons([...model.themes,'其他'],state.topic);
    const topicPicker=find('[data-watch-topic-select]');
    topicPicker.onchange=()=>{state.topic=topicPicker.value;state.limit=feedPageSize;state.selectedBin=null;paint();};
    queryInput.value=state.query;
    const allRows=[...model.records,...model.library].sort((a,b)=>b.date.localeCompare(a.date));
    const sourceRows=()=>{
      const {start,end}=timeWindow(state.range,state.replay);
      return (state.replay?model.replay:allRows).filter(doc=>doc.date?doc.date>=start&&doc.date<=end:!start);
    };
    const channelRows=()=>sourceRows().filter(doc=>!state.channel||doc.channel===state.channel);
    const sameProvince=doc=>!state.province||Channels.regionNames(doc.region,model.tiles).includes(state.province);
    const topicMatch=doc=>Channels.matchesTopic(doc,state.topic);

    function paintFeed(rows){
      const q=state.query.trim().toLowerCase();
      const {selectedBin}=state;
      const dated=selectedBin?rows.filter(doc=>doc.date>=selectedBin.start&&doc.date<=selectedBin.end&&(state.topic||doc.topic===selectedBin.theme)):rows;
      const filtered=q?dated.filter(doc=>[doc.title,doc.summary,doc.source,doc.issuer,doc.region,...doc.topics].join(' ').toLowerCase().includes(q)):dated;
      const title=state.channel?Channels.channelLabel(state.channel):tr('全部动态','All updates');
      find('[data-watch-feed-title]').textContent=[provinceName(state.province),topicLabel(state.topic||selectedBin?.theme||''),title].filter(Boolean).join(' · ');
      const dates=selectedBin?(selectedBin.start===selectedBin.end?selectedBin.start:selectedBin.start+' – '+selectedBin.end):'';
      find('[data-watch-feed-count]').textContent=[dates,`${filtered.length} ${tr('份','items')}`].filter(Boolean).join(' · ');
      find('[data-watch-feed]').innerHTML=feedList(filtered,state);
    }

    function selectedRows(){
      return channelRows().filter(doc=>sameProvince(doc)&&topicMatch(doc));
    }

    function paint(){
      const source=sourceRows();
      const rows=selectedRows();
      const selected=rows.find(doc=>doc.id===state.selectedId)||rows[0];
      state.selectedId=selected?.id||'';
      const position=rows.findIndex(doc=>doc.id===selected?.id);
      const window=timeWindow(state.range,state.replay);
      const dateLabel=window.start?`${window.start} – ${window.end}`:`${tr('截至','Through')} ${window.end}`;
      coverage.textContent=state.replay?tr('历史日报题录 · 按刊期','Briefing archive · by issue date'):`${tr('公开快照','Public snapshot')} ${model.cutoff}`;
      find('[data-watch-replay]')?.setAttribute('aria-pressed',String(state.replay));
      find('[data-watch-range][aria-pressed=true]')?.setAttribute('aria-pressed','false');
      find(`[data-watch-range="${state.range}"]`)?.setAttribute('aria-pressed','true');
      provincePicker.value=state.province;
      find('[data-watch-channels]').innerHTML=`<div class="watch-channels" role="group" aria-label="${tr('内容频道','Channels')}">${['',...Channels.channels.map(([key])=>key)].map(key=>`<button type="button" data-watch-channel="${key}" aria-pressed="${state.channel===key}">${key?Channels.channelLabel(key):tr('全部动态','All updates')}<small>${key?source.filter(doc=>doc.channel===key).length:source.length}</small></button>`).join('')}</div>`;
      find('[data-watch-topic-select]').value=state.topic;
      const fullHeat=Channels.provinceHeat(source,model.tiles);
      const heat=state.topic?Channels.provinceHeat(source,model.tiles,state.topic):fullHeat;
      const max=Math.max(0,...[...fullHeat.values()].map(entry=>entry.score));
      find('[data-watch-legend]').innerHTML=`<span class="watch-map-key" title="${tr('热度为已评级政策的重要性之和','Heat sums published policy ratings')}"><span>0</span><i style="--map-hue:${Channels.mapHue(state.topic)};--map-zero:${Channels.mapZero}" aria-hidden="true"></i><span>${max}</span><span class="sr-only">${tr('政策热度，按重要性计分','Policy heat, weighted by importance')}</span></span>`;
      find('[data-watch-map]').innerHTML=Channels.map(heat,model.tiles,state.province,max,state.topic);
      find('[data-watch-province-pane]').innerHTML=Channels.provincePane(heat,state);
      find('[data-watch-material]').innerHTML=material(selected);
      const cardStart=Math.max(0,Math.min(position,rows.length-4));
      const recent=rows.slice(cardStart,cardStart+4).filter(doc=>doc.id!==selected?.id);
      find('[data-watch-materials]').innerHTML=recent.map(doc=>`<li><button type="button" data-watch-doc="${esc(doc.id)}" aria-pressed="${doc.id===selected?.id}"><strong>${esc(doc.title)}</strong>${doc.date?`<time datetime="${esc(doc.date)}">${shortDate(doc.date)}</time>`:''}</button></li>`).join('');
      find('[data-watch-stream]').innerHTML=stream(rows,window,state.range,state.topic,state.selectedBin);
      find('[data-watch-timeline-caption]').textContent=dateLabel;
      board.querySelectorAll('[data-watch-step]').forEach(button=>button.disabled=rows.length<2);
      paintFeed(rows);
    }

    function step(delta){
      const rows=selectedRows();
      if(!rows.length)return;
      const position=rows.findIndex(doc=>doc.id===state.selectedId);
      state.selectedId=rows[(position+delta+rows.length)%rows.length].id;
      paint();
    }
    queryInput.oninput=()=>{
      state.query=queryInput.value;
      state.limit=feedPageSize;
      paintFeed(selectedRows());
    };
    function selectProvince(name){
      state.selectedBin=null;
      state.province=name;
      state.limit=feedPageSize;
      paint();
      if(name&&window.matchMedia('(max-width: 780px)').matches)
        find('[data-watch-province-pane]').scrollIntoView({block:'nearest'});
    }
    provincePicker.onchange=()=>selectProvince(provincePicker.value);
    board.onclick=event=>{
      const button=event.target.closest('button');
      if(!button)return;
      const {watchStep,watchDoc,watchRange,watchChannel,watchTopic,watchProvince,watchBin,watchBinEnd,watchBinTheme}=button.dataset;
      if(watchBin){
        const bin=state.selectedBin;
        state.selectedBin=bin?.start===watchBin&&bin.theme===watchBinTheme?null:{start:watchBin,end:watchBinEnd,theme:watchBinTheme};
        state.limit=feedPageSize;
        board.querySelector('[data-watch-bin][aria-pressed="true"]')?.setAttribute('aria-pressed','false');
        button.setAttribute('aria-pressed',String(!!state.selectedBin));
        paintFeed(selectedRows());
        return;
      }
      if(watchStep){step(Number(watchStep));return;}
      if(watchDoc){
        state.selectedId=watchDoc;paint();
        find('[data-watch-current] h3 a,[data-watch-current] .watch-source')?.focus({preventScroll:true});
        return;
      }
      if(watchChannel!==undefined)Object.assign(state,{channel:watchChannel,query:''});
      else if(watchTopic!==undefined)state.topic=state.topic===watchTopic?'':watchTopic;
      else if(watchProvince!==undefined){
        selectProvince(state.province===watchProvince?'':watchProvince);
        [...board.querySelectorAll('[data-watch-province]')].find(tile=>tile.dataset.watchProvince===watchProvince)?.focus({preventScroll:true});
        return;
      }
      else if(watchRange)state.range=watchRange;
      else if(button.hasAttribute('data-watch-replay')){
        if(!state.replay)state.liveRange=state.range;
        Object.assign(state,{replay:!state.replay,range:state.replay?state.liveRange:'30',channel:'',province:'',topic:'',query:''});
      }
      else if(button.hasAttribute('data-watch-clear-province'))state.province='';
      else if(button.hasAttribute('data-watch-more')){
        const visible=board.querySelectorAll('.watch-feed-item').length;
        state.limit+=feedPageSize;
        paintFeed(selectedRows());
        board.querySelectorAll('.watch-feed-item')[visible]?.focus();
        return;
      }
      else return;
      state.selectedBin=null;
      state.limit=feedPageSize;
      queryInput.value=state.query;
      const key=Object.keys(button.dataset).find(key=>key.startsWith('watch'));
      const value=button.dataset[key];
      paint();
      if(!button.isConnected)[...board.querySelectorAll('button')].find(item=>item.dataset[key]===value)?.focus({preventScroll:true});
    };
    paint();
  }
  function milestones(issue,through=model.asof){
    const steps=issue.steps.filter(step=>step.date<=through);
    const effective=issue.lead.effective;
    if(steps.some(step=>step.doc.id===issue.lead.id)&&EnergyContent.validDate(effective)){
      steps.push({doc:issue.lead,date:effective,label:'施行节点',scheduled:effective>through,event:true});
    }
    return steps.sort((a,b)=>a.date.localeCompare(b.date)||Number(!!a.event)-Number(!!b.event));
  }
  const stageLabels={
    '国家依据':'National framework','征求意见':'Consultation','正式公布':'Final publication',
    '国家政策方向':'National policy','南方区域注册细则':'Southern market registration','吉林多用户试行方案':'Jilin pilot',
    '注册与披露细则':'Registration and disclosure','交易中心运行公告':'Exchange notice','主管部门复函':'Regulator approval',
    '四川储能专项方案':'Sichuan storage plan','广东节能降碳行动计划':'Guangdong carbon plan','施行节点':'Effective date',
  };
  const stageLabel=step=>tr(step.label,stageLabels[step.label]||step.label);
  const progressHref=issue=>{
    const path=topicRoute(issue.topic);
    return path+(path.includes('?')?'&amp;':'?')+'case='+issue.key;
  };
  function progressStrip(id,through){
    const issue=model?.cases.find(c=>c.steps.some(step=>step.doc.id===id));
    if(!issue)return '';
    const nodes=milestones(issue,through);
    if(nodes.length<2)return '';
    return `<div class="issue-progress"><a class="watch-case-link" href="${progressHref(issue)}">${icon('chart-line')}${tr('政策脉络','Policy timeline')} ${icon('arrow-right')}</a>
      <ol aria-label="${tr('本期可见的政策节点','Policy milestones known in this issue')}">${nodes.map(step=>`<li${step.scheduled?' class="scheduled"':''}><time datetime="${step.date}">${step.date}</time><span>${stageLabel(step)}${step.scheduled?` · ${tr('按文件安排','Scheduled')}`:''}</span></li>`).join('')}</ol></div>`;
  }
  function progressTimeline(issue){
    const nodes=milestones(issue);
    return `<ol class="watch-story-line dossier-timeline">${nodes.map(step=>`<li${step.scheduled?' class="scheduled"':''}><time datetime="${step.date}">${step.date}</time><div>
      <small>${stageLabel(step)}${step.scheduled?` · ${tr('按文件安排','Scheduled')}`:''}</small>
      <h3><a href="${esc(step.doc.route)}">${esc(step.doc.title)}</a></h3>${sourceLink(step.doc)}
    </div></li>`).join('')}</ol>`;
  }
  function issuePage(key){
    const issue=model.cases.find(c=>c.key===key);
    if(!issue)return `<div class="watch-story"><header class="watch-masthead"><h1>${tr('重点议题','Policy watch')}</h1></header><section class="watch-story-card">${caseIndex()}</section></div>`;
    const latest=issue.steps.at(-1);
    const official=issue.lead;
    const effective=EnergyContent.validDate(official.effective)?official.effective:'';
    const tabNames=[tr('议题概览','Overview'),tr('政策脉络','Timeline'),tr('来源材料','Sources')];
    return `<article class="watch-story"><div class="watch-back"><a href="${topicRoute(issue.topic)}">‹ ${esc(topicLabel(issue.topic))}</a></div>
      <header class="watch-masthead"><div><p class="watch-eyeline">${esc(topicLabel(issue.topic))} · ${tr(issue.scope,issueNames[issue.key][1])}</p><h1>${tr(issue.name,issueNames[issue.key][0])}</h1></div></header>
      <p class="watch-story-meta">${issue.steps.length} ${tr('份材料','sources')} <span>${tr('最后公开','Latest publication')} ${latest.date}</span>${effective?`<span>${tr('文件所载施行','Effective date in document')} ${esc(effective)}</span>`:''}</p>
      <nav class="watch-story-nav" aria-label="${tr('议题阅读目录','Dossier sections')}">${tabNames.map((label,i)=>`<button type="button" data-watch-section="watch-section-${i}">${label}</button>`).join('')}</nav>
      <div class="watch-story-columns"><div>
        <section class="watch-story-card" id="watch-section-0"><h2 tabindex="-1">${tabNames[0]}</h2><p>${esc(official.summary)}</p><a href="${esc(official.route)}">${tr('打开完整政策分析','Open policy analysis')} →</a></section>
        <section class="watch-story-card" id="watch-section-1"><h2 tabindex="-1">${tabNames[1]}</h2>${progressTimeline(issue)}</section>
        <section class="watch-story-card" id="watch-section-2"><h2 tabindex="-1">${tabNames[2]}</h2><ul class="watch-story-sources">${issue.steps.map(({doc})=>`<li>${esc(doc.title)} ${sourceLink(doc)}</li>`).join('')}</ul></section>
      </div><aside><section class="watch-story-card"><h2>${tr('相关研究','Related research')}</h2><a href="${topicRoute(issue.topic)}">${esc(topicLabel(issue.topic))} →</a>${issue.region?`<a href="#/p/${encodeURIComponent(issue.region)}">${esc(provinceName(issue.region))} ${tr('看板','dossier')} →</a>`:''}</section><section class="watch-story-card"><h2>${tr('其他议题','Other dossiers')}</h2>${caseIndex(issue.topic)}</section></aside></div>
    </article>`;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-watch-section]');
    if(!button)return;
    const target=document.getElementById(button.dataset.watchSection);
    target?.querySelector('h2')?.focus({preventScroll:true});
    target?.scrollIntoView({block:'start'});
  });
  const topicRoute=topic=>['电力市场','绿色算力'].includes(topic)
    ? '#/view/topic/'+encodeURIComponent(topic)
    : '#/topics?topic='+encodeURIComponent(topic);

  function topicCases(topic,openCase=''){
    const matches=model?.cases.filter(issue=>issue.topic===topic)||[];
    if(!matches.length)return '';
    return `<section class="topic-dossiers" id="topic-dossiers">
      <h2>${tr('专题研判','Issue dossiers')}</h2>
      ${matches.map(issue=>`<details class="topic-dossier" id="dossier-${issue.key}"${issue.key===openCase?' open':''}>
        <summary><span class="dossier-title">${icon('chart-line')}<strong>${tr(issue.name,issueNames[issue.key][0])}</strong></span><span class="dossier-meta"><time datetime="${issue.steps.at(-1).date}">${issue.steps.at(-1).date}</time>${icon('chevron-right')}</span></summary>
        <div class="topic-dossier-body">
          <div class="dossier-lead"><small>${tr('主文件','Key document')} · ${esc(issue.lead.status||issue.lead.kindLabel)}</small>
            <h3><a href="${esc(issue.lead.route)}">${esc(issue.lead.title)}</a></h3>
            ${issue.lead.summary?`<p>${esc(issue.lead.summary)}</p>`:''}${sourceLink(issue.lead)}
          </div>
          ${progressTimeline(issue)}
        </div>
      </details>`).join('')}</section>`;
  }

  function bindTopicMap(raw,root=document){
    Channels.bindInvestment(root.querySelector('[data-topic-investment]'),raw,model.documents,model.tiles,model.asof);
  }

  function caseLink(id){
    const issue=model?.cases.find(c=>c.steps.some(step=>step.doc.id===id));
    if(!issue)return '';
    return `<a href="${progressHref(issue)}" class="watch-case-link">${tr('专题研判','Issue dossier')} →</a>`;
  }
  window.EnergyWatch=Object.freeze({setData,project,overview,bindOverview,issuePage,caseLink,progressStrip,topicCases,materials,topicOf,
    investmentPanel:Channels.investmentPanel,bindTopicMap});
})();
