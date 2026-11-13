/* Channel metadata and the province map. Archive input is injected only by the local preview. */
(function () {
  'use strict';

  const channels = [
    ['policy', '政策与公告'],
    ['industry', '行业与项目'],
    ['report', '研究与咨询'],
    ['paper', '论文与技术'],
  ];
  const themeColors = {
    '储能': '#ee561f',
    '绿电直连': '#009d70',
    '虚拟电厂': '#3863e6',
    '零碳园区': '#008f9a',
    '零碳工厂': '#d88502',
    '绿色算力': '#007fcb',
    '电力市场': '#c12680',
    '其他': '#65758b',
  };
  const mapZero = '#e8edf5';
  const mapHue = topic => themeColors[topic] || '#f22759';
  const extraThemes = [
    {name: '电力市场', terms: ['电力市场', '现货', '电力交易', '辅助服务', '输配电价', '电力系统', 'power system']},
  ];
  const paperTerms = ['论文', '厂商技术文档', '技术方案', '标准信息'];
  const industryTerms = ['媒体报道', '媒体专访', '新闻', '监管工作动态', '市场统计数据', '市场运行半年报'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  function topicsOf(value, definitions) {
    const text = String(value).toLowerCase();
    return definitions.filter(theme => theme.terms.some(term => text.includes(term.toLowerCase()))).map(theme => theme.name);
  }

  function researchChannel(type) {
    if (paperTerms.some(term => type.includes(term))) return 'paper';
    if (industryTerms.some(term => type.includes(term))) return 'industry';
    return 'report';
  }

  function researchMaterials(raw, documents, definitions, cutoff) {
    const seen = new Set();
    return (raw.research || []).flatMap(research => {
      const doc = documents.get(research.code);
      if (!doc || seen.has(doc.id) || doc.kind !== 'article') return [];
      seen.add(doc.id);
      const date = EnergyContent.validDate(research.date) && research.date <= cutoff ? research.date : '';
      const topics = topicsOf((research.topic || '') + ' ' + research.title, definitions);
      const channel = researchChannel(research.type || '');
      return [{
        ...doc, date, dateLabel: '资料日期', topics, topic: topics[0] || '其他', channel,
        kindLabel: channelLabel(channel), source: research.publisher, sourceType: research.type,
        region: '', importance: null, route: '#/research?q=' + encodeURIComponent(research.title),
      }];
    });
  }

  function archiveMaterials(archive, definitions) {
    const known = new Set(definitions.map(theme => theme.name));
    return (archive?.items || []).flatMap(item => {
      if (!/^archive-\d+$/.test(item.id) || !EnergyContent.validDate(item.reportDate)
          || !channels.some(([key]) => key === item.channel) || !/^https:\/\//.test(item.url)
          || typeof item.title !== 'string' || !item.title.trim()) return [];
      const topics = (item.topics || []).filter(topic => known.has(topic));
      return [{
        ...item, archive: true, date: item.reportDate, dateLabel: '日报刊期', topics,
        topic: topics[0] || '其他', kindLabel: channelLabel(item.channel), importance: null,
      }];
    });
  }

  const tr = (zh, en) => document.documentElement.lang === 'en' ? en : zh;
  const topicNames = {'储能':'Storage','绿电直连':'Direct green power','虚拟电厂':'Virtual power plants','零碳园区':'Zero-carbon parks','零碳工厂':'Zero-carbon factories','绿色算力':'Green computing','电力市场':'Power markets','其他':'Other'};
  const provinces = {
    北京:['Beijing','BJ'], 天津:['Tianjin','TJ'], 河北:['Hebei','HE'], 山西:['Shanxi','SX'],
    内蒙古:['Inner Mongolia','NM'], 辽宁:['Liaoning','LN'], 吉林:['Jilin','JL'], 黑龙江:['Heilongjiang','HL'],
    上海:['Shanghai','SH'], 江苏:['Jiangsu','JS'], 浙江:['Zhejiang','ZJ'], 安徽:['Anhui','AH'],
    福建:['Fujian','FJ'], 江西:['Jiangxi','JX'], 山东:['Shandong','SD'], 河南:['Henan','HA'],
    湖北:['Hubei','HB'], 湖南:['Hunan','HN'], 广东:['Guangdong','GD'], 广西:['Guangxi','GX'],
    海南:['Hainan','HI'], 重庆:['Chongqing','CQ'], 四川:['Sichuan','SC'], 贵州:['Guizhou','GZ'],
    云南:['Yunnan','YN'], 西藏:['Tibet','XZ'], 陕西:['Shaanxi','SN'], 甘肃:['Gansu','GS'],
    青海:['Qinghai','QH'], 宁夏:['Ningxia','NX'], 新疆:['Xinjiang','XJ'],
  };
  const provinceName = (name, short = false) => tr(name, provinces[name]?.[short ? 1 : 0] || name);
  const topicLabel = name => tr(name, topicNames[name] || name);

  function channelLabel(key) {
    const english = {policy:'Policies & notices',industry:'Industry & projects',report:'Research & advisory',paper:'Papers & technology'};
    return tr(channels.find(([channel]) => channel === key)?.[1] || '资料', english[key] || 'Material');
  }

  function provinceTiles(tiles) {
    const {蒙东, 蒙西, ...others} = tiles;
    return {内蒙古:蒙西, ...others};
  }

  function regionNames(region, tiles) {
    if (Object.hasOwn(tiles, region)) return [region];
    if (region === '河北·冀北') return ['河北'];
    if (region === '蒙东' || region === '蒙西') return ['内蒙古'];
    return [];
  }

  const matchesTopic = (row, topic) => !topic || (topic === '其他' ? !row.topics.length : row.topics.includes(topic));
  const rated = value => Number.isInteger(value) && value >= 1 && value <= 5;

  function provinceHeat(records, tiles, topic = '') {
    const result = new Map();
    for (const row of records) {
      if (row.kind !== 'policy' || !row.date || !matchesTopic(row, topic)) continue;
      for (const name of regionNames(row.region, tiles)) {
        const entry = result.get(name) || {score:0, unrated:0, rows:[]};
        entry.rows.push(row);
        if (rated(row.importance)) entry.score += row.importance;
        else entry.unrated++;
        result.set(name, entry);
      }
    }
    return result;
  }

  function heatLabel(name, entry) {
    const {score, unrated, rows} = entry;
    return tr(`${provinceName(name)}，${rows.length} 份政策，${score} 分${unrated ? '，'+unrated+' 份未评级' : ''}`,
      `${provinceName(name)}: ${rows.length} policies, ${score} points${unrated ? ', '+unrated+' unrated' : ''}`);
  }

  function useLightTileText(hue, intensity) {
    // Match the CSS sRGB mix, then choose the higher-contrast text.
    const neutral = mapZero.slice(1).match(/../g).map(channel => parseInt(channel,16));
    const weights = [.2126,.7152,.0722];
    const fraction = intensity / 100;
    const luminance = neutral.reduce((sum,base,index) => {
      const channel = parseInt(hue.slice(1+2*index,3+2*index),16);
      const mixed = (base*(1-fraction)+channel*fraction) / 255;
      const linear = mixed<=.04045 ? mixed/12.92 : ((mixed+.055)/1.055)**2.4;
      return sum+weights[index]*linear;
    },0);
    return luminance<.179;
  }

  function map(heat, tiles, selected, max, topic) {
    const hue = mapHue(topic);
    const entries = Object.entries(tiles);
    const xs = entries.map(([, [x]]) => x);
    const ys = entries.map(([, [, y]]) => y);
    const left = Math.min(...xs), top = Math.min(...ys);
    const columns = Math.max(...xs) - left + 1, rows = Math.max(...ys) - top + 1;
    return `<div class="watch-province-viewport">
      <div class="watch-province-map" style="--map-hue:${hue};--map-zero:${mapZero};--map-cols:${columns};--map-rows:${rows}" role="group" aria-label="${tr('省份政策热度图','Provincial policy heatmap')}">${entries.map(([name,[x,y]]) => {
        const entry = heat.get(name) || {score:0,unrated:0,rows:[]};
        const intensity = entry.score ? Math.round(13 + 87 * entry.score / Math.max(1,max)) : 0;
        const label = heatLabel(name, entry);
        return `<button type="button" class="watch-province-tile${useLightTileText(hue,intensity) ? ' is-hot' : ''}"
          data-watch-province="${esc(name)}" data-policy-count="${entry.rows.length}" data-heat-score="${entry.score}" data-unrated-count="${entry.unrated}"
          aria-pressed="${selected === name}" aria-label="${esc(label)}" title="${esc(label)}"
          style="grid-column:${x-left+1};grid-row:${y-top+1};--heat:${intensity}%">
          <strong>${esc(provinceName(name,true))}</strong>${entry.score ? `<small>${entry.score}</small>` : ''}
        </button>`;
      }).join('')}</div>
    </div>`;
  }

  function topicButtons(definitions, selected) {
    return `<label class="watch-select"><span class="sr-only">${tr('按主题筛选','Filter by topic')}</span>
      <select data-watch-topic-select><option value="">${tr('全部主题','All topics')}</option>
      ${definitions.map(topic => `<option value="${esc(topic)}"${selected===topic?' selected':''}>${esc(topicLabel(topic))}</option>`).join('')}
      </select></label>`;
  }

  function provincePane(heat, state) {
    if (!state.province) return '';
    const {score, unrated, rows} = heat.get(state.province) || {score:0,unrated:0,rows:[]};
    const links = state.province === '内蒙古' ? ['蒙东','蒙西'] : [state.province];
    return `<div class="watch-province-detail">
      <header><strong>${esc(provinceName(state.province))}</strong><small>${score} ${tr('分','pts')} · ${rows.length} ${tr('份政策','policies')}${unrated ? ` · ${unrated} ${tr('份未评级','unrated')}` : ''}</small><button type="button" data-watch-clear-province aria-label="${tr('清除省份','Clear province')}">×</button></header>
      ${rows.length ? `<ol class="watch-province-docs">${rows.slice(0,3).map(doc=>`<li><a href="${esc(doc.route)}">${esc(doc.title)}</a><small>${rated(doc.importance) ? doc.importance + tr(' 分',' pts') : tr('未评级','Unrated')}</small></li>`).join('')}</ol>` : `<p>${tr('本站当前筛选内暂无本省政策。','No indexed policies in this selection.')}</p>`}
      <div class="watch-province-links">${links.map(name=>`<a href="#/p/${encodeURIComponent(name)}">${links.length === 1 ? tr('省份看板','Province dossier') : tr(name,name === '蒙东' ? 'East grid' : 'West grid')} ↗</a>`).join('')}</div>
    </div>`;
  }

  const investmentDimensions = {
    '储能': [['②c6','容量补偿','Capacity payments'],['②c9','充电费用','Charging costs'],['②c17','项目清单','Project listing']],
    '绿电直连': [['④c15','项目申报','Project approval'],['④c4','用电侧自用比例','Consumption thresholds'],['④c17','计量与费用','Metering and charges']],
    '虚拟电厂': [['⑩c6','准入门槛','Entry requirements'],['⑩c10','参与品种','Market products'],['⑩c12','结算与计量','Settlement']],
    '零碳园区': [['③c11','验收退出','Accreditation and exit'],['③c8','储能配置','Storage requirements'],['③c12','配套支持','Support']],
    '零碳工厂': [['⑨c12','评价条件','Assessment'],['⑨c13','申报流程','Applications'],['⑨c15','奖补政策','Support']],
    '绿色算力': [['compute-storage','算力侧配储','Storage for computing'],['compute-green','绿电与算电协同','Green power coordination']],
    '电力市场': [['⑧c54','现货运行依据','Spot market operation'],['②c16','现货报价条件','Bidding rules']],
  };
  const investmentBands = {
    current:['现行依据','In force','#31675b'],
    pending:['公布待施行','Pending effect','#d5ad66'],
    draft:['征求意见','Draft','#b7a6cb'],
    historical:['历史依据','Historical','#c1cbd2'],
    unknown:['未核到本地依据','Unverified','#ebebea'],
  };
  // Explicitly cited passages in the approved reader. No title-keyword promotion.
  const reviewedDimensionEvidence = {
    'compute-storage': {四川:['ZCSC55'],广东:['ZCGD51']},
    'compute-green': {四川:['ZCSC34']},
    '②c6': {辽宁:['ZCLN38']},
  };

  function bandOf(doc, asof) {
    if (/已过期|已废止|已替代|历史参考/.test(doc.status)) return 'historical';
    if (/征求意见/.test(doc.status)) return 'draft';
    if (/未施行/.test(doc.status) || (doc.effective && doc.effective > asof)) return 'pending';
    if (/^现行有效/.test(doc.status)) return 'current';
    return 'unknown';
  }

  function investmentEvidence(raw, documents, tiles, topic, dimension, asof) {
    const rows=raw.topics?.find(t=>t.名===(topic==='电力市场'&&dimension==='②c16'?'储能':topic))?.rows||{};
    const groups = new Map();
    const add=(area,ids)=>{
      const name=regionNames(area,tiles)[0];
      if(!name)return;
      const group=groups.get(name)||new Map();
      for(const id of ids){
        const doc=documents.get(id),rawDoc=raw.docs[id];
        if(!doc||rawDoc?.kind!=='政策'||doc.kind==='notice'||!regionNames(doc.region,tiles).includes(name))continue;
        const band=bandOf(doc,asof);
        if(band!=='unknown')group.set(id,{doc,band});
      }
      if(group.size)groups.set(name,group);
    };
    for(const [area,ids] of Object.entries(reviewedDimensionEvidence[dimension]||{}))add(area,ids);
    if(dimension==='⑧c54'){
      for(const [area,fields] of Object.entries(raw.provinces||{}))add(area,(fields[dimension]?.cites||[]).map(cite=>cite.code));
    }else{
      for(const [area,fields] of Object.entries(rows))add(area,[...(fields[dimension]||'').matchAll(/【((?:ZC|YJC?|FG|NY|QY|XW)[A-Z]*\d+)(?:·[^】]*)?】/g)].map(hit=>hit[1]));
    }
    return new Map([...groups].map(([name,group])=>{
      const items=[...group.values()].sort((a,b)=>Object.keys(investmentBands).indexOf(a.band)-Object.keys(investmentBands).indexOf(b.band));
      return [name,{band:items[0].band,items}];
    }));
  }

  function investmentMap(evidence,tiles,selection,topic) {
    const label=band=>tr(...investmentBands[band].slice(0,2));
    const current=evidence.get(selection);
    const sources=current?`<ul class="topic-investment-sources">${current.items.map(({doc,band})=>`<li><a href="${esc(doc.route)}">${esc(doc.title)}</a><small>${label(band)}${regionNames(doc.region,tiles)[0]!==doc.region?' · '+esc(doc.region):''}</small></li>`).join('')}</ul>`:`<p>${tr('本站暂未核到该维度的本地条款。','No local provision has been verified in this view.')}</p>`;
    return `<div class="topic-investment-layout"><div class="watch-province-map topic-investment-grid" role="group" aria-label="${tr('投资条件地图','Investment conditions map')}">
      ${Object.entries(tiles).map(([name,[x,y]])=>{
        const band=evidence.get(name)?.band||'unknown';
        const aria=`${provinceName(name)} · ${label(band)}`;
        return `<button type="button" class="watch-province-tile${band==='current'?' is-hot':''}" data-investment-province="${esc(name)}" data-investment-band="${band}" style="grid-column:${x+1};grid-row:${y+2};--tile-color:${investmentBands[band][2]}" aria-label="${esc(aria)}" title="${esc(aria)}" aria-pressed="${selection===name}"><strong>${esc(provinceName(name,true))}</strong></button>`;
      }).join('')}</div>
      <div class="topic-investment-evidence">
        <ul class="topic-investment-legend">${Object.entries(investmentBands).map(([band,[,,color]])=>`<li><i style="--swatch:${color}" aria-hidden="true"></i>${label(band)}</li>`).join('')}</ul>
        ${selection?`<h3>${esc(provinceName(selection))} <small>${label(current?.band||'unknown')}</small></h3>${sources}`:''}
        <p>${tr('按所选维度的政策依据分档，点省份看文件及适用范围。','Tiers show the status of evidence for the selected criterion. Select a province to see its sources and scope.')}</p>
        ${topic==='储能'? `<a href="#/map">${tr('储能政策参数对照','Storage policy indicators')} ↗</a>`:''}
      </div></div>`;
  }

  function bindInvestment(root,raw,documents,tiles,asof) {
    if(!root || root.dataset.bound) return;
    const dimensions=investmentDimensions[root.dataset.topicInvestment];
    const view=root.querySelector('[data-investment-view]');
    let dimension=dimensions[0][0],province=root.dataset.province||'';
    const paint=()=>{
      for(const button of root.querySelectorAll('[data-investment-dimension]'))button.setAttribute('aria-pressed',String(button.dataset.investmentDimension===dimension));
      const evidence=investmentEvidence(raw,documents,tiles,root.dataset.topicInvestment,dimension,asof);
      view.innerHTML=investmentMap(evidence,tiles,province,root.dataset.topicInvestment);
    };
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button)return;
      if(button.dataset.investmentDimension){
        dimension=button.dataset.investmentDimension;
        paint();
      }else if(button.dataset.investmentProvince){
        const name=button.dataset.investmentProvince;
        province=province===name?'':name;
        paint();
        [...view.querySelectorAll('[data-investment-province]')].find(tile=>tile.dataset.investmentProvince===name)?.focus({preventScroll:true});
      }
    });
    paint();
    root.dataset.bound='true';
  }

  function investmentPanel(topic,province='') {
    const dimensions=investmentDimensions[topic];
    if(!dimensions)return '';
    return `<section id="topic-investment" class="topic-investment" data-topic-investment="${esc(topic)}" data-province="${esc(province)}">
      <header><h2>${tr('投资分级地图','Investment conditions map')}</h2></header>
      <div class="watch-mode-picker" role="group" aria-label="${tr('分级维度','Investment criteria')}">${dimensions.map(([key,zh,en])=>`<button type="button" data-investment-dimension="${key}">${tr(zh,en)}</button>`).join('')}</div>
      <div data-investment-view></div></section>`;
  }

  window.EnergyWatchChannels = Object.freeze({
    channels, extraThemes, themeColor: name => themeColors[name] || themeColors.其他, topicsOf, channelLabel, researchChannel, researchMaterials, archiveMaterials, mapHue, mapZero,
    map, topicButtons, provincePane, provinceTiles, provinceName, provinceHeat, regionNames, matchesTopic, topicLabel, tr, investmentPanel, bindInvestment, investmentEvidence,
  });
})();
