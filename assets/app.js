/* 储能政策研究站 · 前台（只读快照 data/storage.json）
   页面：#/ 投资分级地图 ｜ #/rev 收益构成全景 ｜ #/p/<省> 省份看板（政策-开发-问题）｜ #/about 口径与来源
   口径硬约束：状态位必显；「未采集」≠「无规定」；每个数可回到依据编号与页码。 */
(function () {
  'use strict';
  let D = null;
  let replyItems = [], replyLoad, replyLoadError = false;
  let contentLayer = {schema:1,notices:[],classifications:[],source_links:[],source_gaps:[]}, contentLoad, contentLoadError = false, contentModel;
  const inlineAnalysis = {route:null,current:null,history:[],origin:null};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const externalSite = () => !!D?.meta?.public;
  function polishPublicLabels() {
    if (!D) return;
    document.body.classList.toggle('external-site', externalSite());
    if (!externalSite()) return;
    if(document.querySelector('#analysis-workspace'))document.querySelectorAll('#app [data-code][aria-haspopup]').forEach(button=>{button.removeAttribute('aria-haspopup');button.setAttribute('aria-controls','analysis-workspace');});
    document.querySelectorAll('.cite[data-code]').forEach(button => {
      const rawDoc = D.docs[button.dataset.code], sourcePending=contentModel?.records.get(button.dataset.code)?.review_hold;
      const doc=sourcePending?{...rawDoc,status:'来源待核'}:rawDoc;
      if(sourcePending){button.classList.remove('ok','trial','draft','bad','stale');button.classList.add('none');}
      if (button.textContent) button.textContent = '';
      button.classList.add('cite-dot');
      button.setAttribute('aria-label', (doc?.title || '查看政策依据') + (doc?.status ? '，' + doc.status : ''));
    });
    // 编号保留在数据属性用于索引，外站正文只呈现文件名称。
    for (const root of [$('#app'), $('#bsInner')]) {
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const value = node.nodeValue.replace(/【?(?<![A-Za-z])(?:ZC|YJC?|FG|NY)[A-Z]*\d+(?:·[^】]*)?】?/g, '');
        const display = value.replace(/[（(][^（）()]*无(?:独立)?文号[^（）()]*[）)]/g, '').replace(/^[ ·・、]+|[ ·・、]+$/g, '');
        if (display !== node.nodeValue) node.nodeValue = display;
      }
      root.querySelectorAll('.chip.mono').forEach(chip => { if (!chip.textContent.trim()) chip.remove(); });
    }
  }
  let polishPending = false;
  new MutationObserver(() => {
    if (polishPending) return;
    polishPending = true;
    requestAnimationFrame(() => { polishPending = false; polishPublicLabels(); });
  }).observe(document.body, {childList:true, subtree:true});

  // 省份方块图格位（列, 行）：按地理相对位置排，每省一格、等大
  const TILES = {
    '蒙东': [8, 0], '黑龙江': [9, 0], '蒙西': [6, 1], '北京': [7, 1], '吉林': [9, 1],
    '新疆': [1, 2], '甘肃': [4, 2], '宁夏': [5, 2], '山西': [6, 2], '河北': [7, 2], '天津': [8, 2], '辽宁': [9, 2],
    '西藏': [1, 3], '青海': [3, 3], '陕西': [5, 3], '河南': [6, 3], '山东': [7, 3],
    '四川': [3, 4], '重庆': [4, 4], '湖北': [5, 4], '安徽': [6, 4], '江苏': [7, 4], '上海': [8, 4],
    '云南': [3, 5], '贵州': [4, 5], '湖南': [5, 5], '江西': [6, 5], '浙江': [7, 5],
    '广西': [4, 6], '广东': [5, 6], '福建': [6, 6], '海南': [5, 7]
  };
  const PROVS = Object.keys(TILES);

  // ---------- 取值与清洗 ----------
  const F = (p, m) => (D.provinces[p] || {})[m];
  const V = (p, m) => { const f = F(p, m); return f ? String(f.v ?? '').replace(/\*\*/g, '').trim() : ''; };   // 去加粗标记，供分类与标签用
  const N = (p, m) => { const f = F(p, m); return f && f.n != null ? f.n : null; };
  function clean(t) {
    return String(t || '')
      .replace(/\*\*/g, '')
      .replace(/〔(?:v\d|T\d|K\d|JL\d|同事表|v\d+·)[^〕]*〕/g, '')   // 内部维护记录默认收起
      .replace(/\s*\n\s*/g, '\n').trim();
  }
  function firstSentence(t, max = 96) {
    const s = clean(t).split('\n')[0];
    const m = s.match(/^(.{8,}?[。；;])/);
    const one = m ? m[1] : s;
    return one.length > max ? one.slice(0, max) + '…' : one;
  }
  function statusClass(st) {
    if (!st) return 'none';
    if (/已替代|已过期|重复作废/.test(st)) return 'stale';
    if (/已废止/.test(st)) return 'bad';
    if (/征求/.test(st)) return 'draft';
    if (/试行/.test(st)) return 'trial';
    if (/参考/.test(st)) return 'ref';
    if (/现行|正式/.test(st)) return 'ok';
    return 'none';
  }
  function citeHTML(text) {     // 【ZCxx·…】→ 依据标签（颜色＝该文件当前状态）
    return esc(text).replace(/【((?:ZC|YJC?|FG|NY|QY|XW)[A-Z]*\d+)((?:·[^】]*)?)】/g, (m, code) => {
      const d = D.docs[code];
      return `<button type="button" class="cite ${d ? statusClass(d.status) : 'none'}" data-code="${code}">${code}</button>`;
    });
  }
  function rich(text) { return citeHTML(clean(text)); }
  const isMissing = f => !f || f.kind === '未采集' || f.v == null || String(f.v).trim() === '' || /^[—-]$/.test(String(f.v).trim());

  // ---------- 提示框（依据详情） ----------
  const tip = $('#tip');
  document.addEventListener('mouseover', e => {
    const c = e.target.closest('[data-code]'); if (!c) return;
    const rawDoc=D.docs[c.dataset.code],d=contentModel?.records.get(c.dataset.code)?.review_hold?{...rawDoc,status:'来源待核'}:rawDoc;
    tip.innerHTML = d ? `${externalSite() ? '' : `<b>${esc(c.dataset.code)}</b>　`}<span class="st ${statusClass(d.status)}">${esc(d.status)}</span><br>${esc(d.title)}<br>${esc(d.no || '')}　${esc(d.date || '')}${d.yjc && !externalSite() ? '<br>研究库编号：' + esc(d.yjc.join('、')) : ''}`
      : `${externalSite() ? '' : `<b>${esc(c.dataset.code)}</b><br>`}未收录文件`;
    tip.hidden = false; move(e);
  });
  document.addEventListener('mousemove', e => { if (!tip.hidden) move(e); });
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-code]')) tip.hidden = true; });
  function move(e) { tip.style.left = Math.min(e.clientX + 14, innerWidth - 400) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; }

  // ---------- 全国一张图：投资分级地图 ----------
  const GRADES = ['优先开发', '储备开发', '谨慎开发'];
  const gradeOf = p => (clean(V(p, '⑧c2')).match(/^(优先开发|储备开发|谨慎开发)/) || ['未评'])[0];
  const stageOf = p => {
    const s = clean(V(p, '⑧c54')).split('\n')[0].replace(/^\S{1,4}[：:]/, '').replace(/^\s+/, '');
    return (s.match(/^(正式运行|连续结算试运行|结算试运行|启动模拟试运行|模拟试运行|未开展|未启动)/) || ['待核'])[0];
  };
  function capPolicy(p) {      // 容量政策状态分类（⑧c8 首句）
    const s = clean(V(p, '⑧c8')).split('\n')[0];
    if (!s || /无省级容量补偿/.test(s)) return '未见省级容量补偿';
    if (/无容量电价/.test(s)) return '其他补偿形式';
    if (/已过期/.test(s)) return '已过期';
    if (/征求/.test(s)) return '征求意见稿';
    if (/^(正式|现行)/.test(s)) return '已出台';
    return '待核';
  }
  function effDate(p) {        // 执行日在未来的，标出来（如安徽 2027-01-01）
    const m = clean(V(p, '⑧c8')).match(/(\d{4}-\d{2}-\d{2})\s*(?:起)?执行/);
    return m && m[1] > new Date().toISOString().slice(0, 10) ? m[1] : null;
  }
  const first1 = (p, m) => clean(V(p, m)).split('\n')[0];
  const listOf = p => { const s = first1(p, '②c17'); return !s || /^〔/.test(s) ? '未采集' : /^是·征求/.test(s) ? '清单制·征求稿' : /^是/.test(s) ? '清单制' : /^否/.test(s) ? '非清单制' : '待核'; };
  const chargeOf = p => { const m = first1(p, '⑧c43').match(/^(A0|A1|A2|B)(\?)?/); return !m ? '待查' : m[2] ? m[1] + '（待证实）' : m[1]; };
  const rampOf = p => { const s = first1(p, '⑧c35'); return !s ? '未采集' : /^—/.test(s) ? '无补偿·不适用' : (s.match(/^(中高|中低|高|中|低|待定)/) || ['待核'])[0]; };
  // 地图着色维度：后续可继续加（每个维度＝一个把省份分类的函数＋说明＋各类的说明）
  const S = { metric: 'grade', pick: null };
  const pgradeOf = p => (((D.score || {}).rows || []).find(x => x.主体 === p) || {}).档位 || '未评';
  const METRICS = {
    pgrade: { group: '研判', label: '投资分级（公开方法）', cat: pgradeOf, order: ['第一档', '第二档', '第三档', '未评'], note: '五维评分：容量收益机制 30、容量收益水平 20、现货阶段 20、现货价差 15、退坡与到期风险 15；≥70 第一档、50—69 第二档、<50 第三档。只反映政策收益条件，不构成投资建议' },
    grade: { group: '研判', label: '内部综合分级', cat: gradeOf, order: ['优先开发', '储备开发', '谨慎开发', '未评'], note: '综合容量电价是否出台、现货成熟度、收益确定性与退坡风险' },
    cap: { group: '政策', label: '容量电价／补偿', cat: capPolicy, order: ['已出台', '征求意见稿', '其他补偿形式', '已过期', '库内未见省级容量补偿', '待核'], note: '「库内未见」＝本库尚未收到该省正式文件，不等于没有规定' },
    list: { group: '政策', label: '清单制管理', cat: listOf, order: ['清单制', '清单制·征求稿', '非清单制', '未采集', '待核'], note: '只有纳入省级清单的项目才享受容量电价（补偿）' },
    charge: { group: '政策', label: '充电费用承担', cat: chargeOf, order: ['A0', 'A1', 'A2', 'B', 'A2（待证实）', '待查'], note: 'A0 四项全免 · A1 只担线损 · A2 免输配与基金、仍缴系统运行费 · B 视同用户全额缴纳' },
    stage: { group: '市场', label: '现货市场阶段', cat: stageOf, order: ['正式运行', '连续结算试运行', '结算试运行', '启动模拟试运行', '模拟试运行', '未开展', '待核'], note: '现货价差是储能电能量收益的来源' },
    ramp: { group: '风险', label: '补偿退坡风险', cat: rampOf, order: ['高', '中高', '中', '中低', '低', '待定', '无补偿·不适用', '未采集', '待核'], note: '现行容量补偿标准下调或并轨的风险' }
  };
  const PUB = () => !!(D && D.meta && D.meta.public);     // 对外版：不含投资分级、收益测算金额与内部信息（用户 10-14）
  const MET = () => PUB() ? Object.fromEntries(Object.entries(METRICS).filter(([k]) => k !== 'grade' && (k !== 'pgrade' || D.score))) : Object.fromEntries(Object.entries(METRICS).filter(([k]) => k !== 'pgrade' || D.score));
  const PAL = ['#2F4B8A', '#5B78BD', '#97AAD7', '#CBD5EC', '#E9C46A', '#EFE3CF', '#CBCED4', '#EFEDE6', '#EFEDE6'];
  const FIXED = { '第一档': '#2F4B8A', '第二档': '#97AAD7', '第三档': '#EFE3CF', '征求意见稿': '#E9C46A', '清单制·征求稿': '#E9C46A', '谨慎开发': '#EFE3CF', '高': '#C9553F', '中高': '#E39A7E', '中': '#EFC9A8', '中低': '#CBD5EC', '低': '#97AAD7' };
  const colorOf = (m, c) => FIXED[c] || (/未采集|待核|待查|未评|库内未见|未见省级|不适用|未开展/.test(c) ? '#EFEDE6' : PAL[Math.max(0, m.order.indexOf(c))] || '#EFEDE6');
  const DARK = ['#2F4B8A', '#5B78BD', '#C9553F'];
  const short = c => c.replace('连续结算试运行', '连续试运行').replace('启动模拟试运行', '模拟试运行').replace('库内未见省级容量补偿', '库内未见').replace(/^(优先|储备|谨慎)开发$/, '$1')
    .replace('其他补偿形式', '其他形式').replace('征求意见稿', '征求稿').replace('无补偿·不适用', '不适用').replace('清单制·征求稿', '清单·征求稿');

  function capLine(p) {        // 一句话：容量机制
    const pol = capPolicy(p), n = N(p, '⑧c4'), u = capUnit(p).replace(/\(.*$/, '');
    if (pol === '已出台' || pol === '征求意见稿') return `${n != null ? n + ' ' + u : ''}${pol === '征求意见稿' ? '（征求稿）' : ''}${effDate(p) ? '，' + effDate(p) + ' 起执行' : ''}`;
    return pol;
  }
  const capUnit = p => V(p, '⑧c5');
  const isKW = p => /元\/kW·年/.test(capUnit(p));

  function home() {
    const app = $('#app');
    const cnt = g => PROVS.filter(p => gradeOf(p) === g).length;
    const capOut = PROVS.filter(p => capPolicy(p) === '已出台').length;
    const capDraft = PROVS.filter(p => capPolicy(p) === '征求意见稿').length;
    const formalSpot = PROVS.filter(p => stageOf(p) === '正式运行').length;
    if (PUB() && S.metric === 'grade') S.metric = D.score ? 'pgrade' : 'cap';
    const groups = [...new Set(Object.values(MET()).map(m => m.group))];
    app.innerHTML = `
      <section class="hero">
        <div><div class="eyebrow">电网侧独立储能 · ${PUB() ? '政策地图' : '投资分级地图'}</div>
          <h1>${PUB() ? '投资分级地图' : '哪些省优先做、哪些省先储备'}</h1>
          <p class="lede">${PUB() ? '看各省容量电价（补偿）是否出台、清单制、充电费用规则、现货市场阶段与退坡风险。' : '分级综合看容量电价（补偿）是否出台、现货市场成熟度、收益确定性与退坡风险。'}地图可切换着色维度、点图例筛选；点任一省进入它的「政策－开发－问题」看板。每个结论都能回到红头文件与页码。</p></div>
      </section>
      <section class="kpis">
        ${PUB() && D.score ? `<div class="kpi"><div class="k">投资分级·第一档</div><div class="v">${PROVS.filter(p => pgradeOf(p) === '第一档').length}</div><div class="n">第二档 ${PROVS.filter(p => pgradeOf(p) === '第二档').length} 省 · 第三档 ${PROVS.filter(p => pgradeOf(p) === '第三档').length} 省（公开方法）</div></div>` : PUB() ? `<div class="kpi"><div class="k">实行清单制管理</div><div class="v">${PROVS.filter(p => /^清单制/.test(listOf(p))).length}</div><div class="n">只有入清单的项目才享受容量电价（补偿）</div></div>`
          : `<div class="kpi"><div class="k">优先开发（内部）</div><div class="v">${cnt('优先开发')}</div><div class="n">储备开发 ${cnt('储备开发')} 省 · 谨慎开发 ${cnt('谨慎开发')} 省</div></div>`}
        <div class="kpi"><div class="k">容量电价／补偿已出台</div><div class="v">${capOut}</div><div class="n">征求意见稿 ${capDraft} 省（尚未生效）</div></div>
        <div class="kpi"><div class="k">现货市场正式运行</div><div class="v">${formalSpot}</div><div class="n">其余为连续结算试运行或更早阶段</div></div>
        <div class="kpi"><div class="k">数据版本</div><div class="v" style="font-size:22px">${esc(D.meta.version)}</div><div class="n">快照 ${esc(D.meta.exported)}</div></div>
      </section>
      <section class="card mapcard">
        <div class="mapmain"><label class="map-region-picker">直接进入省份板块<select id="mapProvince"><option value="">选择省份/电网…</option>${PROVS.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label><h2 id="mapTitle"></h2><div class="sub" id="mapSub"></div><div class="tilemap" id="tiles"></div></div>
        <aside class="mappanel">
          <div class="mp-h">着色维度</div>
          ${groups.map(g => `<div class="mp-g"><span>${g}</span>${Object.entries(MET()).filter(([, m]) => m.group === g)
            .map(([k, m]) => `<button type="button" class="dim${S.metric === k ? ' on' : ''}" data-dim="${k}">${m.label}</button>`).join('')}</div>`).join('')}
          <div class="mp-h" style="margin-top:16px">图例 <small>点一类筛选，再点取消</small></div>
          <div id="legend" class="mplegend"></div>
          <div id="peek" class="peek"><span class="note">把鼠标移到省份上，这里显示速览</span></div>
        </aside>
      </section>
      ${eventsHTML()}
      <section class="card" style="margin-top:20px"><h2>分级清单与各省速览</h2><div class="sub" id="tblSub"></div>
        <div class="tablewrap"><table class="t" id="tbl"></table></div></section>`;
    app.querySelectorAll('[data-dim]').forEach(b => b.onclick = () => { S.metric = b.dataset.dim; S.pick = null; home(); });
    drawTiles(); drawTable();
    const picker=$('#mapProvince');if(picker)picker.onchange=()=>{if(picker.value)location.hash='#/p/'+encodeURIComponent(picker.value);};
  }

  function eventsHTML() {      // 本月要事（补厚计划 B2）：即将执行、到期／复查、近 30 天新发布
    const ev = (D.events || []).filter(e=>!contentModel?.records.get(e.code)?.review_hold); if (!ev.length) return '';
    const t0 = new Date().toISOString().slice(0, 10);
    const li = e => `<li><span class="mono">${esc((e.published || e.date || '').slice(5))}</span><span class="pv">${esc(e.prov || '')}</span><span>${e.kind !== '新发布' ? `<span class="st ${e.kind === '征求截止' ? 'draft' : e.kind === '即将执行' ? 'ok' : 'none'}">${esc(e.kind)}</span> ` : ''}${e.code ? `<button type="button" class="cite ${statusClass(e.status)}" data-code="${esc(e.code)}">${esc(e.code)}</button> ` : ''}${esc(String(e.title || '').replace(/^\d{6}/, ''))}${e.code && briefOf(e.code) ? ` <button type="button" class="blink" data-code="${esc(e.code)}">分析</button>` : ''}${(D.docs[e.code] || {}).summary ? `<p class="policy-summary">${esc(D.docs[e.code].summary)}</p>` : ''}</span></li>`;
    const up = ev.filter(e => e.kind !== '新发布' && e.date >= t0).slice(0, 10);
    const nw = ev.filter(e => e.kind === '新发布').sort((a, b) => (b.published || b.date || '').localeCompare(a.published || a.date || '') || (b.landed || '').localeCompare(a.landed || ''));   /* 按索引／事件日期倒序（原按收录时间排，日期看着乱） */
    const cats = [...new Set(nw.map(e => e.cat).filter(Boolean))];
    const newList = (items, n) => `<ul class="evl" style="margin-top:10px">${items.slice(0, n).map(li).join('') || '<li class="note">暂无</li>'}</ul>${items.length > n ? `<details class="more"><summary>展开全部 ${items.length} 件</summary><ul class="evl">${items.slice(n).map(li).join('')}</ul></details>` : ''}`;
    // 用户 10-16：全部分类、近 60 天发布或近 30 天新收录，按分类筛；有简析的带链接
    if (PUB() || !up.length) {
      setTimeout(() => document.querySelectorAll('#newcats button').forEach(b => b.onclick = () => {
        document.querySelectorAll('#newcats button').forEach(x => x.classList.toggle('on', x === b));
        const k = b.dataset.cat, items = k ? nw.filter(e => e.cat === k) : nw;
        document.getElementById('newlist').innerHTML = newList(items, 15);
      }), 0);
      return `<section class="card" style="margin-top:20px"><h2>近期新发布的政策 <small class="note" style="display:inline">${nw.length} 件 · ${nw.filter(e => briefOf(e.code)).length} 件有分析</small></h2><div class="sub">近 60 天发布或近 30 天新收录；按公开日倒序，成文日另见详情。圆点可预览，点击查看简述与关联。<a href="#/policy" style="margin-left:8px">看政策看板 →</a></div>
        <div class="seg" id="newcats" style="margin-top:10px;flex-wrap:wrap"><button class="on" data-cat="">全部</button>${cats.map(k => `<button data-cat="${esc(k)}">${esc(k)} ${nw.filter(e => e.cat === k).length}</button>`).join('')}</div>
        <div id="newlist">${newList(nw, 15)}</div></section>`;
    }
    return `<section class="card" style="margin-top:20px"><h2>本月要事</h2><div class="sub">储能、电价、市场、辅助服务四类；悬停圆点看文件与状态。</div>
      <div class="evgrid"><div><h3>接下来：即将执行 · 征求截止 · 到期或复查</h3><ul class="evl">${up.map(li).join('') || '<li class="note">半年内暂无</li>'}</ul></div>
      <div><h3>近期新发布 <a href="#/brief" style="font-size:12.5px;font-weight:400">全部分析 →</a></h3>${newList(nw, 15)}</div></div></section>`;
  }
  // ---------- 政策简析（标准 v2.1，用户 10-16 定样张）：列表只放卡片；全站任何编号点开同一张简析卡（弹窗）。卡内：标题行→概述→关键数字→影响→脉络→观察点→横向→依据。版式只读 D.briefs 与 D.links ----------
  const briefOf = code => (D.briefs || []).find(b => b.编号 === code);
  const DIRC = { 利好: 'up', 利空: 'down', 中性: 'flat' }, ARW = { 利好: '↑', 利空: '↓', 中性: '→' };
  const BRIEF_V1 = [['政策变化', '政策变化'], ['改了什么', '改了什么'], ['对比结论', '新旧对比'], ['纵向', '本省前后'], ['横向', '与他省'], ['确定性与时间表', '确定性与时间表'], ['何时会变', '何时会变']];   /* v1、v2 旧栏目兼容显示 */
  const fieldHTML = v => Array.isArray(v) ? `<ul class="plain">${v.map(x => `<li>${citeHTML(x)}</li>`).join('')}</ul>`
    : v && typeof v === 'object' ? `<ul class="plain">${Object.entries(v).map(([k, x]) => `<li><b>${esc(k)}</b>：${citeHTML(x)}</li>`).join('')}</ul>` : `<p>${citeHTML(v)}</p>`;
  const docName = code => { const d = D.docs[code]; return d ? (externalSite() ? d.title : (d.no && d.no !== '（无文号）' ? d.no : String(d.title || '').replace(/^\d{6}/, ''))) : '相关文件'; };
  function chainOf(code, b) {
    if (b && b.脉络) return b.脉络;
    const L = D.links || [], me = D.docs[code] || {};
    const nodes = L.filter(l => l.到 === code).map(l => ({ 编号: D.docs[l.从] ? l.从 : null, 文号: D.docs[l.从] ? docName(l.从) : l.从, 日期: l.日期 || (D.docs[l.从] || {}).date, 关系: l.关系, 要点: [] }))
      .concat(L.filter(l => l.从 === code && D.docs[l.到]).map(l => ({ 编号: l.到, 文号: docName(l.到), 日期: (D.docs[l.到] || {}).date, 关系: '后续', 要点: [l.关系 === '被本件替代' ? '替代本件' : l.关系] })));
    if (!nodes.length) return [];
    nodes.push({ 编号: code, 文号: me.no || '', 日期: me.date, 关系: '本件', 要点: [] });
    return nodes.sort((a, b) => String(a.日期 || '').localeCompare(String(b.日期 || '')));
  }
  /* 简析 v2.2 边际信号：加码／放宽／转向用强调色，首提／重申／延续中性；不表示利好利空 */
  const sigChip = b => b && b.边际信号 && b.边际信号 !== '待定' ? `<span class="chip sig${/加码|放宽|转向/.test(b.边际信号) ? ' hot' : ''}" title="边际信号：与前值相比的变化方向，不表示利好利空">${esc(b.边际信号)}</span>` : '';
  function stChip(st) { return st ? `<span class="st ${statusClass(st)}">${esc(st)}</span>` : ''; }
  function sheetHTML(code, hitAt) {
    const classified=contentModel?.records.get(code),held=!!classified?.review_hold;
    const d = D.docs[code] || {}, b = held||code==='ZCGJ110'?null:briefOf(code), ml = held?[]:chainOf(code, b);
    const sum = held?classified.source_gap:code==='ZCGJ110'?(classified?.classification_boundary||''):(b ? (b.概述 || b.一句话 || d.summary || '') : (d.summary || ''));
    const head = `<div class="shead"><button type="button" class="close" id="bsClose" aria-label="关闭">×</button>
      <div class="chips">${stChip(held?'来源待核':b && b.状态标签 || d.status)}${sigChip(b)}${!classified?.classification_basis && b && b.层级 ? `<span class="chip">${esc(b.层级)}级</span>` : ''}${b && (b.档 || b.级别) ? `<span class="chip tier">${esc(b.档 || b.级别 + '件')}</span>` : ''}${(b && b.省份) || d.prov ? `<span class="chip">${esc((b && b.省份) || d.prov)}</span>` : ''}<span class="chip mono">${esc(code)}</span></div>
      <h2 id="bsH">${esc((b && b.标题) || String(d.title || code).replace(/^\d{6}/, ''))}</h2>
      <p class="note">${esc(contentTypeLabel(classified))}${classified?.importance!==null&&classified?.importance!==undefined?` · 编辑重要性 ${classified.importance}级`:''}</p>
      ${!b?`<p class="note analysis-coverage">${sum?(replyItems.some(r=>r.policy_ids.includes(code))?'政策摘要与关联答复':'文件摘要与来源'):'文件索引与来源'} · 完整分析待补</p>`:''}
      ${!held && (d.no || (b && b.文号)) ? `<div class="docno">${esc((b && b.文号) || d.no)}</div>` : ''}
      <div class="dates">${held?`<span>旧索引日期 ${esc(d.date||'未载')}（公告日期未核）</span>`:''}${!held && ((b && b.发文日期) || d.date) ? `<span>成文 <b>${esc((b && b.发文日期) || d.date)}</b></span>` : ''}${!held && d.published && d.published !== ((b && b.发文日期) || d.date) ? `<span>公开 <b>${esc(d.published)}</b></span>` : ''}${b && b.生效日期 ? `<span>生效 <b>${esc(b.生效日期)}</b></span>` : ''}</div>
      ${sum ? `<p class="summary">${citeHTML(sum)}</p>` : ''}${mainTagsOf(code).length ? `<div class="chips">${mainTagsOf(code).map(tagLink).join('')}</div>` : ''}</div>`;
    const blk = [];
    if(!held)blk.push(contentSourcesHTML(code));
    if(held)blk.push(`<div class="block" data-source-gap><h3>来源缺口</h3><p>${esc(classified.source_gap)}</p><p class="note">原索引状态与题名不构成公告发布、效力或补偿兑现的核验结果；原资料保留。</p></div>`);
    if(classified?.importance_reason)blk.push(`<div class="block"><h3>编辑重要性 ${classified.importance}级</h3><p>${esc(classified.importance_reason)}</p></div>`);
    if(code==='ZCAH19')blk.push('<div class="block"><p class="note">发布页文号栏未载；正文所引505号属于被引用文件，本件自有文号仍待核。</p></div>');
    if(classified?.classification_boundary)blk.push(`<div class="block"><h3>分类与适用边界</h3><p>${esc(classified.classification_boundary)}</p></div>`);
    blk.push(shareContentHTML(code));
    if (hitAt) blk.push(`<div class="block hit"><h4>正文提及 · 第 ${esc(hitAt.pg)} 页</h4><p>「${esc(hitAt.s)}」</p></div>`);
    if (b && b.关键数字 && b.关键数字.length) blk.push(`<div class="block"><h4>关键数字</h4><div class="tbl"><table><thead><tr><th>参数</th><th>本件</th><th>前值</th></tr></thead><tbody>${b.关键数字.map(k => `<tr><td>${esc(k.参数)}</td><td class="new">${esc(k.新值)}</td><td class="old">${esc(k.前值)}</td></tr>`).join('')}</tbody></table></div></div>`);
    if (b && Array.isArray(b.影响) && b.影响.length) blk.push(`<div class="block"><h4>影响</h4><div class="impact">${b.影响.map(i => `<div class="irow"><div><div class="who">${esc(i.对象)}</div><div class="item">${esc(i.收益项)}</div></div><span class="dir ${DIRC[i.方向] || 'flat'}">${ARW[i.方向] || ''} ${esc(i.方向)}</span><p class="why">${citeHTML(i.机制)}</p></div>`).join('')}</div><p class="disclaim">${esc(b.影响说明 || '定性判断，不构成投资建议')}。</p></div>`);
    if (b && !b.脉络) BRIEF_V1.filter(([k]) => b[k] && !(k === '横向' && typeof b[k] === 'object' && b[k].条目)).forEach(([k, t]) => blk.push(`<div class="block"><h4>${esc(t)}</h4>${fieldHTML(b[k])}</div>`));
    if (ml.length) blk.push(`<div class="block"><h4>脉络</h4><div class="tl">${ml.map(n => {
        const cls = n.关系 === '本件' ? 'me' : /^被本件/.test(n.关系 || '') ? 'gone' : '';
        const nm = n.编号 && n.编号 !== code ? `<button type="button" class="cite ${statusClass((D.docs[n.编号] || {}).status)}" data-code="${esc(n.编号)}">${esc(n.编号)}</button> ${esc(n.文号 || '')}` : esc(n.文号 || '');
        return `<div class="node ${cls}"><div class="nhead"><span class="ndate">${esc(n.日期 || '')}</span><span class="nrel">${esc(n.关系)}</span><span class="ntitle">${nm}</span></div>${(n.要点 || []).length ? `<ul>${n.要点.map(p => `<li>${citeHTML(p)}</li>`).join('')}</ul>` : ''}</div>`;
      }).join('')}</div>${b && b.观察点 && b.观察点.length ? `<div class="watch"><strong>下一个观察点</strong>${b.观察点.map(o => `<span>${citeHTML(o)}</span>`).join('')}</div>` : ''}</div>`);
    if (b && b.横向 && typeof b.横向 === 'object' && (b.横向.条目 || []).length) {
      const it = b.横向.条目, max = Math.max(...it.map(e => +e.值 || 0)) || 1;
      blk.push(`<div class="block"><h4>横向 · 与他省</h4><p class="cap">口径：${esc(b.横向.口径)}；单位：${esc(b.横向.单位)}</p><div class="bars">${it.map(e => `<div class="bar ${e.本件 ? 'me' : ''}"><div>${esc(e.省)}<small>${esc(e.算法 || '')}</small></div><div class="track"><div class="fill" style="width:${((+e.值 || 0) / max * 100).toFixed(1)}%"></div></div><div class="v">${esc(e.值)}</div></div>`).join('')}</div>
        <p class="cap">${it.filter(e => !e.本件).map(e => `${esc(e.省)} <button type="button" class="cite ${statusClass((D.docs[e.编号] || {}).status)}" data-code="${esc(e.编号)}">${esc(e.编号)}</button> ${esc(e.年月)}${e.备注 ? '，' + esc(e.备注) : ''}`).join('；')}</p></div>`);
    } else if (b && b.横向 && typeof b.横向 === 'string' && b.脉络 && !externalSite()) blk.push(`<div class="block"><h4>横向 · 与他省</h4><p>${citeHTML(b.横向)}</p></div>`);
    if (b && (b.依据 || []).length) blk.push(`<details><summary>依据原文（${b.依据.length} 条）</summary><div class="ev">${b.依据.map(e => `<div><span class="src">${esc(e.编号)} ${esc(e.条款 || (e.页 ? "p" + e.页 : ""))}</span>${esc(e.原句)}</div>`).join('')}</div></details>`);

    if(replyItems.some(r=>r.policy_ids.includes(code)))blk.push(relatedReplyBlock(code));
    return head + `<div class="sbody">${blk.join('')}</div>`;
  }
  let bsOpener = null;
  function openSheet(code, hitAt, opener) {
    if(document.querySelector('#analysis-workspace')){showInlineAnalysis('policy',code,{hitAt,opener});return;}
    const dlg = $('#bsheet'); if (!dlg || !code) return;
    bsOpener = bsOpener || document.activeElement;
    tip.hidden = true;
    $('#bsInner').innerHTML = sheetHTML(code, hitAt);
    $('#bsClose').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
    $('#bsInner .sbody').scrollTop = 0;
    dlg.dataset.policyCode=code;
    loadReplyInsights().then(()=>{if(dlg.open&&dlg.dataset.policyCode===code&&!document.querySelector('#bsInner .related-replies'))document.querySelector('#bsInner .sbody')?.insertAdjacentHTML('beforeend',relatedReplyBlock(code));});
  }
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-code]'); if (!c || e.target.closest('a')) return;
    e.preventDefault(); openSheet(c.dataset.code, c.dataset.pg ? { pg: c.dataset.pg, s: c.dataset.s } : null,c);
  });
  function detailControlAttrs(){return document.querySelector('#analysis-workspace')||/^#\/(brief(?:\/|$)|p\/|dev\/)/.test(decodeURIComponent(location.hash||''))?'aria-controls="analysis-workspace"':'aria-haspopup="dialog"';}
  function briefCard(b) {
    const seen = new Set(), foot = (Array.isArray(b.影响) ? b.影响 : []).filter(i => { const k = i.对象 + i.收益项 + i.方向; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(i => `<span class="dir ${DIRC[i.方向] || 'flat'}">${ARW[i.方向] || ''} ${esc(i.对象)}·${esc(i.收益项)}</span>`).join('');
    return `<button type="button" class="bcard" data-code="${esc(b.编号)}" ${detailControlAttrs()}>
      <span class="meta"><span>${esc(b.文号 || (D.docs[b.编号] || {}).no || b.编号)}</span><span>${esc(b.发文日期 || '')}</span></span>
      <span class="ttl">${esc(b.标题 || '')}</span><span class="note">${esc(contentTypeLabel(contentModel?.records.get(b.编号)))}${contentModel?.records.get(b.编号)?.importance!=null?` · 编辑重要性 ${contentModel.records.get(b.编号).importance}级`: ''}</span>
      <span class="chips">${stChip(b.状态标签 || b.状态)}${sigChip(b)}${b.省份 ? `<span class="chip">${esc(b.省份)}</span>` : ''}${b.档 || b.级别 ? `<span class="chip tier">${esc(b.档 || b.级别 + '件')}</span>` : ''}</span>
      <span class="sum">${esc(b.概述 || b.一句话 || '')}</span>${mainTagsOf(b.编号).length ? `<span class="chips">${mainTagsOf(b.编号).map(k => `<span class="chip tier">${esc(k)}</span>`).join('')}</span>` : ''}${foot ? `<span class="foot">${foot}</span>` : ''}</button>`;
  }
  function briefPage(code) {
    const bs = (D.briefs || []).filter(b => b.编号&&!contentModel?.records.get(b.编号)?.review_hold).sort((a, b) => String(b.发文日期 || '').localeCompare(String(a.发文日期 || '')));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">政策分析 · ${bs.length} 件</div>
        <h1>新出的政策改了什么、和以前比、和别省比</h1>
        <p class="lede">一件一卡，按发文日期新→旧。点卡片或网站任何位置的政策编号，打开分析：概述、关键数字、影响、脉络、观察点、横向比较与依据原文。</p></div></section>
      <div class="bcards">${bs.map(briefCard).join('') || '<div class="card note">暂无分析。</div>'}</div>`;
    document.querySelector('#app>.hero').insertAdjacentHTML('afterend',analysisWorkspaceHTML());
    if (code && D.docs[code])showInlineAnalysis('policy',code,{scroll:false});
    loadReplyInsights().then(()=>refreshInlineAnalysis());
  }
  // ---------- 机制标签（研究线标签表 v1.2）：主标签＝题名或核心条款命中，用于筛选与统计；正文提及＝只在条款全文出现，附页码与原句 ----------
  const tagLink = k => `<a class="tagc" href="#/tag/${encodeURIComponent(k)}">${esc(k)}</a>`;
  const mainTagsOf = code => (D.tags || []).filter(t => ((D.tagdocs || {})[t.标签] || { 主: [] }).主.includes(code)).map(t => t.标签);
  const tagsOfMetric = m => (D.tags || []).filter(t => (t.参数列 || []).includes(m)).map(t => t.标签);
  const docRow = (code, extra) => { const d = D.docs[code] || {}; return `<li><span class="mono">${esc(d.date || '')}</span><span class="pv">${esc(d.prov || '')}</span><span><button type="button" class="cite ${statusClass(d.status)}" data-code="${esc(code)}">${esc(code)}</button> ${esc(String(d.title || '').replace(/^\d{6}/, ''))}${extra || ''}</span></li>`; };
  function tagIndex() {
    const by = {}; (D.tags || []).forEach(t => (by[t.类] = by[t.类] || []).push(t));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">机制标签 · ${(D.tags || []).length} 个</div><h1>按收益机制顺着找政策</h1>
      <p class="lede">每个标签是一项收益或成本机制。点进去看定义、相关参数列、关键政策，以及规定了这项机制的全部文件；「正文提及」是只在条文中提到、并非主旨的文件。</p></div></section>
      ${Object.entries(by).map(([c, ts]) => `<section class="card" style="margin-bottom:14px"><h2>${esc(c)}</h2><div class="tagrow">${ts.map(t => { const v = D.tagdocs[t.标签] || { 主: [], 提及: [] }; return `<a class="tagbox" href="#/tag/${encodeURIComponent(t.标签)}"><b>${esc(t.标签)}</b><span>${v.主.length} 件 · 提及 ${v.提及.length}</span></a>`; }).join('')}</div></section>`).join('')}`;
  }
  function tagPage(k) {
    const t = (D.tags || []).find(x => x.标签 === k); if (!t) return tagIndex();
    const v = D.tagdocs[k] || { 主: [], 提及: [] }, byDate = (a, b) => String((D.docs[b] || {}).date || '').localeCompare(String((D.docs[a] || {}).date || ''));
    const main = v.主.slice().sort(byDate), ment = v.提及.slice().sort((a, b) => byDate(a.编号, b.编号));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow"><a href="#/tags">机制标签</a> · ${esc(t.类)}</div><h1>${esc(k)}</h1><p class="lede">${citeHTML(t.定义 || '')}</p></div></section>
      <section class="card" style="margin-bottom:14px"><div class="kv"><div><span class="bk">相关参数列</span> ${(t.参数列 || []).map(m => `<span class="chip">${esc((D.metrics[m] || {}).short || m)}</span>`).join(' ') || '—'}</div>
        <div><span class="bk">关键政策</span> ${(t.关键政策 || []).map(c => `<button type="button" class="cite ${statusClass((D.docs[c] || {}).status)}" data-code="${esc(c)}">${esc(c)}</button>`).join(' ') || '—'}</div>
        ${(t.判据 || []).length && !PUB() ? `<div><span class="bk">判据</span> ${t.判据.map(jlChip).join(' ')}</div>` : ''}</div></section>
      <section class="card" style="margin-bottom:14px"><h2>规定了这项机制的文件 <small class="note" style="display:inline">${main.length} 件</small></h2><ul class="evl">${main.map(c => docRow(c)).join('') || '<li class="note">暂无</li>'}</ul></section>
      ${ment.length ? `<section class="card"><h2>正文提及 <small class="note" style="display:inline">${ment.length} 件，点开定位到该页原句</small></h2><ul class="evl">${ment.map(({ 编号: c, 页: pg, 原句: s }) => docRow(c, ` <button type="button" class="blink" data-code="${esc(c)}" data-pg="${esc(pg)}" data-s="${esc(s)}">p${esc(pg)}</button>`)).join('')}</ul></section>` : ''}`;
  }
  // ---------- 方法库（研究线方法卡 v1）：按类分组；政策编号点开简析卡，判据编号落到引用它的方法卡 ----------
  const methodsOfJL = j => (D.methods || []).filter(m => (m.来源判据 || []).includes(j));
  const jlChip = j => { const m = methodsOfJL(j)[0]; return m ? `<a class="chip mono" href="#/methods/${esc(m.卡号)}">${esc(j)}</a>` : `<span class="chip mono">${esc(j)}</span>`; };
  function methodsPage(id) {
    const by = {}; (D.methods || []).forEach(m => (by[m.类] = by[m.类] || []).push(m));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">方法库 · ${(D.methods || []).length} 张方法卡</div><h1>本站怎么取数、怎么比、怎么算</h1>
      <p class="lede">每张卡写一条规则和它的用法。卡里的政策编号可点开看分析，判据编号标明规则出处。</p></div></section>
      ${Object.entries(by).map(([c, ms]) => `<section class="card" style="margin-bottom:14px"><h2>${esc(c)} <small class="note" style="display:inline">${ms.length} 张</small></h2><div class="mcards">${ms.map(m => `<article class="mcard" id="m-${esc(m.卡号)}"><div class="meta"><span class="mono">${esc(m.卡号)}</span></div><h3>${esc(m.标题)}</h3>
        <p>${citeHTML(m.规则 || '')}</p>${m.怎么用 ? `<p class="use"><b>怎么用</b>　${citeHTML(m.怎么用)}</p>` : ''}
        <div class="chips">${(m.关键政策 || []).map(c => `<button type="button" class="cite ${statusClass((D.docs[c] || {}).status)}" data-code="${esc(c)}">${esc(c)}</button>`).join('')}${(m.来源判据 || []).map(j => `<span class="chip mono">${esc(j)}</span>`).join('')}</div></article>`).join('')}</div></section>`).join('')}`;
    if (id) { const el = document.getElementById('m-' + id); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }
  }
  // ---------- 政策库（信息架构第 3 步）：①表全部文件，分面筛选（省份、分类、状态、机制标签、年份、关键词），条件写在地址里可分享 ----------
  const STG = st => /已替代|重复作废/.test(st) ? '已替代' : /废止|失效|过期/.test(st) ? '已废止' : /征求/.test(st) ? '征求稿' : /参考/.test(st) ? '参考' : '施行中';
  const tagSet = () => { const m = {}; Object.entries(D.tagdocs || {}).forEach(([k, v]) => v.主.forEach(c => (m[c] = m[c] || []).push(k))); return m; };
  function libPage(qs) {
    const P=new URLSearchParams(qs||''),TM=tagSet(),legacy=new Map((D.lib||[]).map(r=>[r[0],r]));
    const f=Object.fromEntries(['type','prov','cat','st','tag','yr','q'].map(k=>[k,P.get(k)||'']));
    const rows=EnergyContent.query(contentModel,f).filter(r=>{const old=legacy.get(r.id);return (!f.cat||old?.[6]===f.cat)&&(!f.st||STG(r.status)===f.st)&&(!f.tag||(TM[r.id]||[]).includes(f.tag));});
    const uniq=i=>[...new Set((D.lib||[]).map(r=>r[i]).filter(Boolean))];
    const opt=(k,values,label)=>`<label class="fc"><span>${label}</span><select data-f="${k}"><option value="">全部</option>${values.map(([v,t])=>`<option value="${esc(v)}"${v===f[k]?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
    const vals=x=>x.map(v=>[v,v]),N=Math.max(1,Math.min(3000,Number(P.get('n'))||120));
    $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">统一资料检索</div><h1>查政策、通知与研究资料</h1><p class="lede">已公开内容可按标题、文号、机构、主题、摘要与已公开正文检索；旧记录未逐件分类，研究资料中包含标准等其他材料。</p></div></section>
      ${contentCountsHTML()}${analysisWorkspaceHTML()}
      <section class="card"><div class="facets">${opt('type',Object.entries(EnergyContent.TYPES),'内容类型')}${opt('prov',vals(uniq(5).sort((a,b)=>a.localeCompare(b,'zh'))),'省份')}${opt('cat',vals(uniq(6).sort((a,b)=>a.localeCompare(b,'zh'))),'原目录主题')}${opt('st',vals(['施行中','征求稿','已替代','已废止','参考']),'原状态')}${opt('tag',vals((D.tags||[]).map(t=>t.标签)),'机制标签')}${opt('yr',vals(uniq(4).map(x=>x.slice(0,4)).filter((x,i,a)=>/^\d{4}$/.test(x)&&a.indexOf(x)===i).sort().reverse()),'年份')}
      <label class="fc grow"><span>关键词</span><input data-f="q" value="${esc(f.q)}" placeholder="名称、机构、文号或正文"></label></div>
      <p class="sub" data-search-count="${rows.length}">${rows.length} 条结果${Object.values(f).some(Boolean)?' · <a href="#/lib">清除筛选</a>':''}</p>
      <div class="bcards">${rows.slice(0,N).map(contentCardHTML).join('')||'<p class="note">当前筛选无结果，不代表没有相关规定。</p>'}</div>
      ${rows.length>N?`<button type="button" class="dim" id="libMore">再显示 ${Math.min(240,rows.length-N)} 条</button>`:''}</section>`;
    const go=patch=>{const state={...f,...patch};const query=new URLSearchParams(Object.entries(state).filter(([,v])=>v)).toString();location.hash='#/lib'+(query?'?'+query:'');};
    document.querySelectorAll('[data-f]').forEach(el=>{el.onchange=()=>go({[el.dataset.f]:el.value.trim(),n:''});});
    if($('#libMore'))$('#libMore').onclick=()=>go({n:String(N+240)});
  }

  function researchPage(qs) {
    const q = new URLSearchParams(qs || '').get('q') || '';
    const rows = (D.research || []).filter(r => !q || (r.title + r.publisher + r.code + (r.topic || '')).includes(q));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">研报与资料</div><h1>研究资料索引</h1><p class="lede">研报、论文、标准信息与官方统计单列；不作为全国政策，不把研究观点当政策规定。点击资料查看摘要和适用边界。</p></div></section>
      <section class="card"><label class="fc">关键词<input id="researchQ" placeholder="题名、机构或编号" value="${esc(q)}"></label><p class="sub">${rows.length} 件研究资料</p><div class="bcards">${rows.slice(0, 150).map(r => `<button class="bcard" data-code="${esc(r.code)}"><span class="meta">${esc(r.publisher)} · ${esc(r.date)}</span><span class="ttl">${esc(r.title)}</span>${r.summary ? `<p class="policy-summary">${esc(r.summary)}</p>` : ''}<span class="chip">${esc(r.topic || r.type || '研究资料')}</span></button>`).join('')}</div></section>`;
    $('#researchQ').onchange = e => { location.hash = '#/research?q=' + encodeURIComponent(e.target.value.trim()); };
  }
  function learningPage() {
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">政策学习</div><h1>学习主题与政策索引</h1><p class="lede">按学习主题汇集已收录政策，随政策状态和主题索引更新。点击圆点查看政策简述与分析。</p></div></section>
      <div class="mech">${(D.learning || []).map(t => `<section class="card"><h2>${esc(t.title)}</h2><p class="sub">${t.codes.length} 件相关政策 · 按索引／事件日期倒序</p><ul class="evl">${t.codes.slice(0, 8).map(code => docRow(code)).join('')}</ul>${t.codes.length > 8 ? `<details><summary>查看其余 ${t.codes.length - 8} 件</summary><ul class="evl">${t.codes.slice(8).map(code => docRow(code)).join('')}</ul></details>` : ''}</section>`).join('')}</div>`;
  }
  // ---------- 首页（研究线首页文案 v1）：主张、家底数字、常问问题、收益机制速览、近期新政策、怎么读本站；数字构建时实时算 ----------
  const MECH = [
    ['容量电价', '容量', ['容量电价'], '国家 114 号确立 → 各省以煤电容量电价为基础、按放电时长折算 → 纳入清单的项目按年领取 → 按月考核、未达标扣减。与容量租赁对同一块容量二选一。'],
    ['现货套利', '现货', ['现货价差', '现货运行阶段'], '现货市场运行阶段决定能否稳定兑现 → 报量报价或报量不报价 → 充放电价差扣除充电成本即为套利空间。本站价差采用同源同期季度数据。'],
    ['辅助服务', '辅助服务', ['调频', '调峰', '爬坡与其他辅助服务'], '调频按里程或容量补偿，部分区域允许与现货同时参与；调峰、爬坡、备用等品种因省而异，现货运行后部分省份调整。'],
    ['容量租赁', '容量', ['容量租赁'], '新能源配储需求通过租赁满足 → 储能按年收取租赁费。各省对是否允许、价格形成方式规定不同；与容量电价二选一。'],
    ['充电与过网成本', '成本', ['储能充电费用'], '自 114 号起充电视作用户：缴上网环节线损费和系统运行费，按单一电量制执行输配电价，放电电量退减输配电费。各省执行时点不同，测算须逐省计入。'],
    ['清单与准入', '准入', ['清单制'], '清单制决定能否领取容量电价 → 申报窗口、准入门槛、建设时限、投资主体锁定、调出情形由各省规定。见省份页「怎么进」。']];
  /* 首页机制卡的省份数从参数表取（研究线 10-16：标签只说明文件提到过，不证明有现行机制）；冀北并入河北、蒙西蒙东并为内蒙古，按 31 省计 */
  const P31 = r => ({ '河北·冀北': '河北', 蒙西: '内蒙古', 蒙东: '内蒙古' }[r] || r);
  const rowsOf = () => Object.keys(D.provinces || {}).filter(r => r !== '国家');
  const countBy = fn => { const m = {}; rowsOf().forEach(r => { const k = fn(r); if (k) (m[k] = m[k] || new Set()).add(P31(r)); }); return m; };
  const seg = (m, order) => order.filter(k => m[k] && m[k].size).map(k => `${esc(k)} <b class="mono">${m[k].size}</b>`).join(' ／ ');
  const today = () => (D.meta.exported || '').slice(0, 10);
  const MECH_COUNT = {
    容量电价: () => seg(countBy(r => { const s = clean(V(r, '⑧c8')).split('\n')[0]; if (!s || /已过期|无省级|无容量电价/.test(s)) return null;   /* 上海等「无容量电价、度电奖励」不计 */ if (/征求/.test(s)) return '征求稿';
      const dt = (s.match(/(\d{4}-\d{2}-\d{2})\s*(?:起)?\s*执行/) || [])[1]; if (/^(正式|现行)/.test(s)) return dt && dt > today() ? '待执行' : '正式执行'; return null; }), ['正式执行', '待执行', '征求稿']),
    现货套利: () => seg(countBy(r => { const s = stageOf(r); return s === '待核' || s === '未开展' || s === '未启动' ? null : s; }), ['正式运行', '连续结算试运行', '结算试运行', '启动模拟试运行', '模拟试运行']),
    辅助服务: () => { const has = (r, cs) => cs.some(c => { const f = F(r, c); return !isMissing(f) && !/^(【[^】]*】)?\s*(暂无|无)/.test(clean(f.v)); });   /* 研究线 10-16：主数只看调频，调峰等另列 */
      const a = countBy(r => has(r, ['②c4']) ? 'x' : null), b = countBy(r => !has(r, ['②c4']) && has(r, ['②c5', '②c7', '②c11']) ? 'x' : null);
      return `调频有补偿或市场规则 <b class="mono">${(a.x || new Set()).size}</b> 省${(b.x || new Set()).size ? `；另有调峰、备用、爬坡等规定 <b class="mono">${b.x.size}</b> 省` : ''}`; },
    容量租赁: () => { const m = D.mech || {}; return `有租赁规则 <b class="mono">${m.rent || 0}</b> 省，其中明文与容量电价二选一 <b class="mono">${m.rentExcl || 0}</b> 省`; },
    充电与过网成本: () => { const m = D.mech || {}; return `国家统一口径（114 号）；已出省级落实件 <b class="mono">${m.chg || 0}</b> 省${m.chgWait ? `，待执行 <b class="mono">${m.chgWait}</b> 省` : ''}`; },   /* 构建时按 ⑧c43 全文算（对外版格值会截断） */
    清单与准入: () => seg(countBy(r => { const s = clean(V(r, '②c17')); return /^是·?征求/.test(s) ? '征求稿' : /^是/.test(s) ? '已实行' : null; }), ['已实行', '征求稿'])
  };
  const provCount = tags => { const L = Object.fromEntries((D.lib || []).map(r => [r[0], r])); const s = new Set();
    tags.forEach(k => ((D.tagdocs || {})[k] || { 主: [] }).主.forEach(c => { const r = L[c]; if (r && STG(r[3]) === '施行中' && PROVS.includes(r[5])) s.add(r[5]); })); return s.size; };
  const FAQ = [['哪些省份已有储能容量电价？', '#/lib?tag=容量电价&st=施行中'], ['4 小时储能每年能拿多少容量收益？', '#/rev'], ['哪些省份现货已正式运行？', '#/map'],
    ['电网侧储能怎么进清单？', '#/tag/清单制'], ['储能充电要缴哪些费用？', '#/tag/储能充电费用'], ['容量电价和容量租赁能不能同时拿？', '#/m/容量租赁'],
    ['绿电直连自发自用比例要求是多少？', '#/topic/绿电直连'], ['零碳工厂怎么认定？', '#/topic/零碳工厂'], ['虚拟电厂准入门槛？', '#/topic/虚拟电厂'], ['最近有哪些新政策？', '#/policy']];

  let UI_LANG = new URLSearchParams(location.search).get('lang');
  if (!['zh','en'].includes(UI_LANG)) { try { UI_LANG=localStorage.getItem('energy-ui-language'); } catch (_) {} }
  if (!['zh','en'].includes(UI_LANG)) UI_LANG='zh';
  const en = () => UI_LANG === 'en';
  const tx = (zh,english) => en()?english:zh;
  function applyLanguage() {
    document.documentElement.lang=en()?'en':'zh-CN';
    document.body.dataset.purpose=en()?'international-services':'portfolio';
    const cta=document.querySelector('.header-cta'); if(cta) cta.href=en()?'#/services':'#/policy';
    document.title=tx('独立能源研究站 · 政策、专题与投资研究','Independent Energy Research · China energy intelligence');
    document.querySelector('.brand').innerHTML=icon('bolt')+'<span>'+tx('独立能源研究站','Independent Energy Research')+'</span>';

    document.querySelectorAll('[data-zh][data-en]').forEach(el=>el.textContent=el.dataset[en()?'en':'zh']);
    const button=$('#language-switch');button.textContent=en()?'中文':'EN';button.setAttribute('aria-label',en()?'切换为中文':'Switch to English');
    $('.menu-toggle').textContent=tx('菜单','Menu');
  }
  function setupShell() {
    applyLanguage();
    $('#language-switch').onclick=()=>{UI_LANG=en()?'zh':'en';try{localStorage.setItem('energy-ui-language',UI_LANG);}catch(_){}const url=new URL(location.href);url.searchParams.set('lang',UI_LANG);history.replaceState(null,'',url);applyLanguage();route();};
    $('.menu-toggle').onclick=()=>{const open=$('.menu-toggle').getAttribute('aria-expanded')!=='true';$('.menu-toggle').setAttribute('aria-expanded',String(open));$('.nav').classList.toggle('mobile-open',open);};
    $('.skip-link').onclick=e=>{e.preventDefault();$('#app').focus();};
  }
  function sectionHeading(kicker,title,link,label){return `<div class="section-heading"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2></div>${link?`<a class="text-link" href="${link}">${label} ↗</a>`:''}</div>`;}
  function workItems() {return [
    {n:'01',tag:tx('数据与证据','DATA & EVIDENCE'),title:tx('政策数据库：从资料到可用数据','A traceable policy library'),problem:tx('政策分散，时间、状态与适用对象容易混淆。','Find the relevant instrument and distinguish its timing, status and scope.'),method:tx('用结构化目录、来源与审定边界支持检索，保留中文原名和文号。','Use structured records, original Chinese names, document numbers and source links.'),proof:tx('检索结果 → 文件状态 → 来源弹窗','Search → document status → primary source'),url:'#/lib',label:tx('检查数据库','Explore the library')},
    {n:'02',tag:tx('研究与判断','RESEARCH & INTERPRETATION'),title:tx('政策脉络：把规则放回条件里','Policy context, conditions and implications'),problem:tx('一个比例或门槛，往往不足以判断项目是否适用。','A single threshold rarely answers whether a project is eligible.'),method:tx('结合上位依据、实施口径和适用条件，区分原文、分析与待核项。','Follow the source instruments, implementation conditions and open questions.'),proof:tx('完整研究示例 → 条件说明 → 原始依据','Worked research → conditions → source evidence'),url:'#/topic/绿电直连',label:tx('阅读完整研究','Read a worked example')},
    {n:'03',tag:tx('建模与工程','MODELLING & ENGINEERING'),title:tx('透明算例：结果可以自己复算','Reproducible worked scenarios'),problem:tx('一个计算结果，需要能解释输入、约束和边界。','A useful model needs visible inputs, constraints and limits.'),method:tx('使用合成数据，展示调度、费用与守恒检查，并提供样例下载。','Use synthetic inputs to explain dispatch, costs and balance checks, with downloadable examples.'),proof:tx('选择样例 → 看约束与结果 → 下载复现','Inspect inputs → check results → reproduce'),url:'#/park-demo',label:tx('试用园区算例','Explore the park example')}
  ];}
  function workRows() {return workItems().map(x=>`<article class="work-row"><div class="work-number">${x.n}</div><div><div class="eyebrow">${x.tag}</div><h3><a href="${x.url}">${x.title} <span>↗</span></a></h3><p>${x.problem}</p><small>${x.proof}</small></div><a class="work-action" href="${x.url}">${x.label} ↗</a></article>`).join('');}
  function icon(name,cls='') {return `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.EnergyIcons||{})[name]||''}</svg>`;}
  const SITE_SECTIONS=[
    {id:'policy',route:'#/policy',zh:'最新政策分析',en:'Policy analysis',icon:'file-analytics',subzh:'政策变化与学习',suben:'Instruments & learning'},
    {id:'topics',route:'#/topics',zh:'重点专题研究',en:'Research',icon:'books',subzh:'专题、资料与方法',suben:'Topics, sources & methods'},
    {id:'map',route:'#/map',zh:'投资分级地图',en:'Investment map',icon:'map-2',subzh:'省份与投资条件',suben:'Regions & conditions'},
    {id:'tools',route:'#/explore',zh:'收益测算工具',en:'Returns tools',icon:'calculator',subzh:'显式假设与复算',suben:'Assumptions & scenarios'},
    {id:'services',route:'#/services',zh:'咨询与定制',en:'Advisory',icon:'messages',subzh:'研究、采购与站点',suben:'Research, sourcing & sites'}
  ];
  function sectionOf(h) {
    if(/^#\/(policy|brief|lib|learning|notice)/.test(h))return 'policy';
    if(/^#\/(topics|topic\/|research|methods|work|glossary)/.test(h))return 'topics';
    if(/^#\/(map|p\/|dev\/|score)/.test(h))return 'map';
    if(/^#\/(explore|tools|rev|park-demo)/.test(h))return 'tools';
    if(/^#\/(services|subscribe)/.test(h))return 'services';return '';
  }
  function setActiveSection(h) {
    const id=sectionOf(h);
    document.querySelectorAll('.nav>[data-nav]').forEach(a=>{const active=a.dataset.nav===id;a.classList.toggle('on',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  }
  function researchContinuations() {
    const latest=(D.research||[]).slice(0,4),guides=(D.public_guides||[]).filter(g=>g.id!=='services');
    return `<section class="page-continuation"><header><h2>${tx('研究资料','Research library')}</h2><a href="#/research">${tx('查看完整资料库','Open the library')} ↗</a></header><div class="continuation-list">${latest.map(r=>`<button type="button" data-code="${esc(r.code)}"><span>${esc(r.publisher)} · ${esc(r.date)}</span><h3>${esc(r.title)}</h3><p>${esc(r.summary||'')}</p></button>`).join('')}</div></section><section class="page-continuation"><header><h2>${tx('研究方法','Research methods')}</h2><a href="#/methods">${tx('查看方法正文','Read the methods')} ↗</a></header><div class="method-continuation">${guides.map(g=>`<article><h3>${esc(g.title)}</h3><p>${tx('核对象、条件、口径与依据，再解释计算和判断。','Inspect scope, conditions, definitions and evidence before interpreting a result.')}</p><a href="#/methods/${esc(g.id)}">${tx('阅读方法','Read the method')} ↗</a></article>`).join('')}</div><p class="work-context">${tx('需要了解研究与工程实现？','Want to inspect the research and engineering?')} <a href="#/work">${tx('查看项目作品与证据清单','View work samples & evidence notes')} ↗</a></p></section>`;
  }
  function learningContinuation() {
    return `<section class="page-continuation"><header><h2>${tx('政策学习','Policy learning')}</h2><a href="#/learning">${tx('展开全部学习主题','Open all learning themes')} ↗</a></header><div class="learning-continuation">${(D.learning||[]).slice(0,4).map(t=>`<article><h3>${esc(t.title)}</h3><p>${tx('从原始政策进入，核状态与适用范围。','Start with the original instruments and their scope.')}</p><ul>${t.codes.slice(0,3).map(code=>`<li><button type="button" data-code="${esc(code)}">${esc(D.docs[code]?.title||code)}</button></li>`).join('')}</ul></article>`).join('')}</div></section>`;
  }
  function sectionHead(no,title,subtitle,route,label){return `<header class="studio-section-head"><div><div class="section-overline"><span>${no}</span>${subtitle}</div><h2>${title}</h2></div><a class="studio-link" href="${route}">${label}${icon('arrow-up-right')}</a></header>`;}
  let DRAW_ID=0;
  function topicDrawing(type){
    const drawingId=type+'-'+(++DRAW_ID);
    const grid='<defs><pattern id="diagram-grid-'+drawingId+'" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="currentColor" opacity=".08"/></pattern></defs><rect width="400" height="160" fill="url(#diagram-grid-'+drawingId+')"/>';
    const shapes=type==='direct'?'<path d="M70 80H180M220 80H335"/><rect x="30" y="50" width="60" height="60" rx="5"/><path d="M40 65H80M40 80H80M40 95H80M50 55V105M70 55V105"/><circle cx="200" cy="80" r="29"/><path d="M194 65L207 65L199 79H210L192 99L197 82H188Z"/><path d="M305 110V67L330 49V110M300 110H345M310 78H325M310 94H325"/>':type==='vpp'?'<rect x="28" y="20" width="65" height="30" rx="4"/><rect x="28" y="65" width="65" height="30" rx="4"/><rect x="28" y="110" width="65" height="30" rx="4"/><path d="M95 35H140V80H183M95 80H183M95 125H140V80M225 80H315"/><circle cx="205" cy="80" r="24"/><rect x="315" y="48" width="55" height="65" rx="5"/><path d="M325 98L335 82L343 91L360 65"/>':'<circle cx="200" cy="80" r="51" stroke-dasharray="5 7"/><path d="M155 65L180 45L205 65L230 40L254 65M155 98H245"/><path d="M176 100V75H222V100M189 90V100M210 90V100"/><circle cx="200" cy="22" r="7"/><circle cx="250" cy="110" r="7"/><circle cx="151" cy="110" r="7"/>';
    return `<svg class="topic-drawing" viewBox="0 0 400 160" fill="none" stroke="currentColor" stroke-width="1.7" role="img" aria-label="${tx('主题结构示意，不是政策关系图','Topic illustration, not a policy relationship graph')}">${grid}${shapes}</svg>`;
  }
  function compactMap() {return `<div class="studio-tilemap" aria-label="${tx('省份与电网板块研究入口','Province and grid-area research navigation')}">${PROVS.map(p=>`<a href="#/p/${encodeURIComponent(p)}" style="grid-column:${TILES[p][0]+1};grid-row:${TILES[p][1]+1};background:${capPolicy(p)==='已出台'?'#c2d9d3':capPolicy(p)==='征求意见稿'?'#f2dfbd':'#e3e6e9'}" title="${esc(p)} · ${esc(capPolicy(p))}">${esc(p)}</a>`).join('')}</div>`;}
  function productHome() {
    const recent=[...new Map([...(D.events||[]).map(e=>contentModel.records.get(e.code)).filter(Boolean),...[...contentModel.records.values()].filter(r=>r.kind==='notice'&&r.importance>=4)].map(r=>[r.id,r])).values()].filter(r=>!r.review_hold&&(r.content_type!=='notice'||r.importance>=4)).sort((a,b)=>String(b.sortDate).localeCompare(String(a.sortDate))).slice(0,4);
    const topics=[['绿电直连','Direct green power','direct',tx('从接入方式到适用条件，沿证据逐项判断。','Connection arrangements, applicable conditions and the source evidence.')],['虚拟电厂','Virtual power plants','vpp',tx('把资源、准入、交易与结算分开研究。','Separate resource aggregation, eligibility, trading and settlement.')],['零碳园区','Zero-carbon parks','park',tx('连接政策目标、园区场景与可复现算例。','Connect policy goals, park scenarios and reproducible examples.')]];
    $('#app').innerHTML=`<section class="studio-hero"><div class="studio-hero-copy"><div class="hero-kicker"><span></span>${tx('中国能源 · 独立研究与分析','CHINA ENERGY · INDEPENDENT RESEARCH')}</div><h1>${tx('看懂政策。<br>看清项目。','Understand policy.<br>Assess the project.')}</h1><p>${tx('政策分析、专题研究、省份研判与透明测算。<br>让每一个判断，都能回到来源与适用边界。','Policy analysis, regional research and transparent scenarios.<br>Trace each assessment to its sources and conditions.')}</p><div class="hero-actions"><a class="btn pri" data-primary-action href="${en()?'#/services':'#/policy'}">${tx('开始政策研究','Discuss a research brief')}${icon('arrow-up-right')}</a><a class="hero-secondary" href="${en()?'#/work':'#/topics'}">${tx('浏览重点专题','Inspect the work')}${icon('arrow-right')}</a></div><form id="home-search" class="hero-search"><label for="home-query">${icon('search')}<span class="sr-only">${tx('搜索政策库','Search the policy library')}</span></label><input id="home-query" type="search" placeholder="${tx('搜索地区、政策或文号','Search a region, policy or document number')}" required><button type="submit" aria-label="${tx('搜索','Search')}">${icon('arrow-right')}</button></form><div class="hero-footnote">${icon('shield-check')}${tx('免费开放 · 无需注册 · 依据可追溯','Free access · No account · Traceable evidence')}</div></div><aside class="hero-research-card"><div class="feature-card-top"><span>${tx('研究视野','RESEARCH PERSPECTIVE')}</span>${icon('chart-line')}</div><div class="hero-visual">${topicDrawing('direct')}<div class="visual-caption"><span>01 / POLICY</span><span>02 / CONDITIONS</span><span>03 / SCENARIOS</span></div></div><h2>${tx('绿电直连，<br>先看哪些条件？','Direct green power.<br>Which conditions matter?')}</h2><p>${tx('从一份完整研究开始，核对政策对象、条件与原文。','Start with a worked study: identify the project scope, conditions and original instruments.')}</p><a href="#/topic/绿电直连">${tx('打开研究示例','Open the worked study')}${icon('arrow-up-right')}</a></aside></section>
    <div class="snapshot-strip"><span class="snapshot-label">${tx('公开研究快照','PUBLIC RESEARCH SNAPSHOT')}</span>${[[D.lib.length,tx('旧资料索引','legacy indexed records')],[(D.research||[]).length,tx('研究资料','research records')],[(D.topics||[]).length,tx('重点专题','research topics')],[PROVS.length,tx('省份/电网入口','region / grid entries')]].map(x=>`<span class="snapshot-count"><b>${x[0].toLocaleString()}</b>${x[1]}</span>`).join('')}<small>${esc(D.meta.exported||'')}</small></div>${contentCountsHTML()}
    <section class="studio-section" data-home-section="policy">${sectionHead('01',tx('最新政策分析','Policy analysis'),tx('保留日期、状态与原始依据','DATES, STATUS & PRIMARY EVIDENCE'),'#/policy',tx('全部政策分析','All policy analysis'))}<div class="policy-study-layout"><div class="policy-update-list">${recent.map(r=>`<button type="button" class="studio-policy-row update-card" ${r.kind==='notice'?`data-notice-id="${esc(r.id)}"`:`data-code="${esc(r.id)}"`}><div class="policy-row-date"><span>${esc(r.sortDate.slice(5)||'—')}</span><small>${esc(r.province||'区域')}</small></div><div><div class="row-status"><span>${esc(contentTypeLabel(r))}</span><span>${esc(r.dateLabel)} ${esc(r.sortDate||'未确认')}</span></div><h3>${esc(r.title)}</h3><p>${esc(r.summary||'').slice(0,96)}</p></div>${icon('arrow-up-right')}</button>`).join('')}</div><aside class="study-panel">${icon('book-2')}<div class="section-overline">${tx('政策学习','POLICY LEARNING')}</div><h3>${tx('看懂政策，<br>也看懂判断的方法。','Read the policy.<br>Inspect the reasoning.')}</h3><p>${tx('从主题索引进入，分清对象、条件、状态和未知项。','Follow topic-based learning and distinguish scope, conditions, status and unknowns.')}</p><a href="#/learning">${tx('进入政策学习','Explore learning')}${icon('arrow-right')}</a></aside></div></section>
    <section class="studio-section" data-home-section="topics">${sectionHead('02',tx('重点专题研究','Research themes'),tx('把分散信息组织成完整问题','RESEARCH A COMPLETE QUESTION'),'#/topics',tx('全部专题','All themes'))}<div class="studio-topics">${topics.map((t,i)=>`<a class="studio-topic topic-${t[2]}" href="#/topic/${encodeURIComponent(t[0])}"><div class="topic-art">${topicDrawing(t[2])}<span>RESEARCH / 0${i+1}</span></div><div class="topic-copy"><h3>${tx(t[0],t[1])}${icon('arrow-up-right')}</h3><p>${t[3]}</p></div></a>`).join('')}</div>${researchContinuations()}</section>
    <section class="studio-section" data-home-section="map">${sectionHead('03',tx('投资分级地图','Investment research map'),tx('保留成熟的参数地图与省份看板','POLICY INDICATORS & REGIONAL VIEWS'),'#/map',tx('打开地图','Open the map'))}<div class="map-preview-layout"><div class="cartogram-surface">${compactMap()}<small>${tx('省份/电网示意布局 · 非地理边界','Province / grid-area cartogram · not geographic boundaries')}</small></div><div class="map-preview-copy"><span class="section-overline">REGIONAL RESEARCH</span><h3>${tx('先核规则与条件，<br>再讨论投资判断。','Understand the rules.<br>Then assess the project.')}</h3><p>${tx('切换容量机制、现货阶段、费用规则等维度，查看图例、分省参数和来源。','Switch between capacity mechanisms, spot-market stages and charge rules; inspect regional parameters and their sources.')}</p><a class="btn" href="#/map">${tx('查看省份板块','Explore regions')}${icon('arrow-right')}</a></div></div></section>
    <section class="studio-section" data-home-section="tools">${sectionHead('04',tx('收益测算工具','Returns & scenario tools'),tx('把假设展开，把结果复算','EXPLICIT INPUTS · REPRODUCIBLE OUTPUTS'),'#/explore',tx('全部工具','All tools'))}<div class="tool-showcase"><div class="tool-feature"><div class="tool-mark">${icon('calculator')}</div><h3>${tx('从一个算例，<br>看清收益的构成。','Start with a scenario.<br>Understand the components.')}</h3><p>${tx('容量折算、充电费用与园区情景，分别展示输入、单位、约束与结果边界。','Inspect capacity arithmetic, charging costs and park scenarios, with units, constraints and limits.')}</p><a class="btn" href="#/tools">${tx('打开容量与费用工具','Open capacity & charges')}${icon('arrow-up-right')}</a></div><div class="tool-shelf">${[['#/tools','calculator',tx('容量与费用','Capacity & charges'),tx('看折算、费用与声明退减','Inspect arithmetic and declared charges')],['#/rev','chart-line',tx('收益情景测算','Revenue scenario'),tx('合成输入，解释收入与成本','Synthetic inputs, revenue and cost components')],['#/park-demo','building-factory-2',tx('园区合成演示','Park scenarios'),tx('固定场景、逐时调度与复现','Fixed cases, hourly dispatch and reproduction')]].map(x=>`<a href="${x[0]}">${icon(x[1])}<div><h4>${x[2]}</h4><p>${x[3]}</p></div>${icon('arrow-up-right')}</a>`).join('')}</div></div></section>
    <section class="studio-advisory" data-home-section="services"><div class="advisory-graphic">${icon('messages')}<span>05 / ADVISORY</span></div><div><h2>${tx('让研究，服务具体的问题。','Research for a specific question.')}</h2><p>${tx('政策研究、模型与证据包、采购研究支持、专属站点。也欢迎围绕研究与工程作品交流岗位或项目合作。','Policy research, models and evidence packs, procurement research support and dedicated sites. Agree the question, deliverable and acceptance before an engagement.')}</p></div><a class="btn" href="#/services">${tx('咨询与定制','Discuss a scope')}${icon('arrow-up-right')}</a></section>`;
    $('#home-search').onsubmit=e=>{e.preventDefault();location.hash='#/lib?q='+encodeURIComponent($('#home-query').value.trim());};
  }
  function workEvidence(n) {
    const item=workItems().find(x=>x.n===n);
    const topic=(D.topics||[]).find(t=>t.名==='绿电直连');
    const sourceLinks=topic?[...topic.md.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g)].map(m=>({label:m[1],url:m[2]})):[];
    const doc=D.docs.ZCJX29;
    const steps=n==='01'?[
      tx('按地区、关键词和文件状态检索，打开一条政策详情。','Search by region, keyword and document status; open one record.'),
      tx('分别核对成文、公开与生效日期，缺失日期不推定。','Check issue, publication and effective dates separately; do not infer missing dates.'),
      tx('打开原发布链接，将简述与原文的对象和条件逐项对照。','Open the original source and compare the summary with its scope and conditions.')
    ]:n==='02'?[
      tx('先读绿电直连研究示例，确认地区、用户、电源与接网类型。','Read the worked example and identify region, users, generation and grid connection.'),
      tx('分别核每个比例的分子、分母、期间与限定词。','Check each ratio’s numerator, denominator, period and qualifications.'),
      tx('沿文末来源查对应条款；规划方向与具体项目条件分开判断。','Follow the cited clauses; distinguish planning direction from project eligibility.')
    ]:[
      tx('选择固定场景，检查负荷、发电、储能和价格假设。','Choose a fixed case and inspect load, generation, storage and price assumptions.'),
      tx('查看逐时调度、能量核对及费用构成，再比较另一组输入。','Inspect hourly dispatch, energy balance and cost components, then compare another case.'),
      tx('下载合成数据与标准库脚本，在本机重建八例并核对结果。','Download the synthetic data and standard-library script; rebuild and compare all eight cases.')
    ];
    const limit=n==='01'?tx('目录与简述帮助定位；收录不代表全库本轮重新审定，也不代表项目已获资格。来源的实时可达性须使用时再核。','Records help locate evidence; inclusion is not a fresh review of the entire library or a project eligibility decision. Source availability can change.'):
      n==='02'?tx('研究按正文标注的截至日与地域使用；公开删减文本不能证明未公开部分没有规定。','Use the research date and regional scope stated in the article. An abridged public text cannot establish what omitted sections contain.'):
      tx('全部为固定合成场景；不是任意输入在线优化、实际项目报价、利润或政策自用率。逐时调度可能不唯一。','Fixed synthetic cases only: not unrestricted online optimisation, actual quotes, profits or a policy self-use ratio. Hourly schedules may not be unique.');
    const sources=n==='01'?(doc&&/^https:\/\//.test(doc.url)?[{label:doc.title,url:doc.url}]:[]):n==='02'?sourceLinks:[
      {label:tx('合成输入与结果','Synthetic inputs & results'),url:'examples/park-scenarios.json'},
      {label:tx('复现脚本','Reproduction script'),url:'tools/park_examples.py'}
    ];
    return {item,steps,limit,sources};
  }
  function workEvidenceMarkdown(n) {
    const e=workEvidence(n);
    const lines=['# '+e.item.title,'',tx('数据版本','Data version')+': '+D.meta.version,
      tx('快照时间','Snapshot time')+': '+D.meta.exported,'',
      '## '+tx('问题与方法','Question & method'),e.item.problem,e.item.method,'',
      '## '+tx('核验步骤','Verification steps'),...e.steps.map((s,i)=>(i+1)+'. '+s),'',
      '## '+tx('来源与材料','Sources & materials'),...e.sources.map(s=>'- ['+s.label+']('+(s.url.startsWith('https:')?s.url:'https://github.com/xuqinnn/energy-storage-policy/blob/main/'+s.url)+')'),''];
    if(n==='02')lines.push('## '+tx('研究正文（保留原文语言）','Research text (original language)'),((D.topics||[]).find(t=>t.名==='绿电直连')?.md||'').replace(/【(ZC[A-Z]*\d+)】/g,(_,code)=>D.docs[code]?.title||tx('来源见正文链接','See source links'))||tx('当前快照未收录此示例。','Not included in this snapshot.'),'');
    if(n==='03')lines.push('## '+tx('复现','Reproduction'),'`python tools/park_examples.py`',tx('使用同一快照中的数据与脚本，保留完整精度核对。','Use data and code from the same snapshot; compare at full precision.'),'');
    lines.push('## '+tx('边界','Limits'),e.limit,'',tx('公开仓库','Public repository')+': https://github.com/xuqinnn/energy-storage-policy',
      tx('数据和第三方材料的许可分别见仓库 LICENSE-DATA.md 与 ASSETS.json。此文件不附原件或内部资料。','See LICENSE-DATA.md and ASSETS.json for data and third-party scope. Originals and internal files are not attached.'));
    return lines.join('\n')+'\n';
  }
  function workEvidenceHTML(n) {
    const e=workEvidence(n);
    return `<details class="work-evidence"><summary>${tx('核验清单与边界','Verification checklist & limits')}</summary><ol>${e.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p class="note">${esc(e.limit)}</p><ul class="evidence-sources">${e.sources.map(s=>`<li><a href="${esc(s.url)}"${s.url.startsWith('https:')?' target="_blank" rel="noopener noreferrer"':''}>${esc(s.label)} ↗</a></li>`).join('')}</ul></details>`;
  }
  function workPage() {
    $('#app').innerHTML=`<section class="hero demo-page-head"><div><div class="eyebrow">${tx('项目作品 / 研究 / 数据 / 工程','WORK SAMPLES / METHODS / EVIDENCE')}</div><h1>${tx('从可检查的作品，<br>看研究与工程能力。','Inspect the work.<br>Then define your question.')}</h1><p class="lede">${tx('选择一个案例，沿着问题、方法、依据与运行结果检查。这里展示项目成果；个人履历、任职经历和客户案例以另行确认的信息为准。','Follow each example from its question to methods, sources and runnable outputs. These are public project samples, including synthetic scenarios.')}</p></div></section><section class="work-cases">${workItems().map(x=>`<article class="work-case"><header><span class="work-number">${x.n}</span><div><div class="eyebrow">${x.tag}</div><h2>${x.title}</h2></div></header><dl><div><dt>${tx('问题','QUESTION')}</dt><dd>${x.problem}</dd></div><div><dt>${tx('方法','METHOD')}</dt><dd>${x.method}</dd></div><div><dt>${tx('怎么检查','HOW TO VERIFY')}</dt><dd>${x.proof}</dd></div></dl>${workEvidenceHTML(x.n)}<div class="work-evidence-actions"><a class="btn" href="${x.url}">${x.label} ↗</a><button type="button" class="btn" data-work-download="${x.n}">${tx('下载证据清单 · Markdown','Download evidence notes · Markdown')}</button></div></article>`).join('')}</section><section class="work-provenance"><div><h2>${tx('从来源，到可复用的成果。','From sources to reusable work.')}</h2><p>${tx('公开内容保留依据与边界；计算样例标明合成输入；开源范围与许可见仓库和来源说明。','Public work retains sources and limits. Worked scenarios identify synthetic inputs. See the repository and source notes for release scope and licensing.')}</p></div><a href="https://github.com/xuqinnn/energy-storage-policy" target="_blank" rel="noopener noreferrer">${tx('检查公开仓库','Inspect the public repository')} ↗</a><a href="#/about">${tx('来源与公开范围','Sources & public scope')} ↗</a></section><section class="editorial-closing"><div><h2>${tx('围绕具体问题，交流合作。','Have a specific question?')}</h2><p>${tx('研究、数据或产品工程相关的岗位与项目，可以从这三份作品开始交流。','Bring a market, region or procurement question. We can discuss a small, clearly scoped first deliverable.')}</p></div><a class="btn pri" href="#/services">${tx('岗位与项目合作','Discuss a scope')} ↗</a></section>`;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-work-download]');
    if(!button||!D)return;
    const n=button.dataset.workDownload;
    if(!workItems().some(x=>x.n===n))return;
    const blob=new Blob([workEvidenceMarkdown(n)],{type:'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='energy-research-work-'+n+'-'+(en()?'en':'zh')+'.md';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function toolHubPage(){
    const tools=[['#/tools',tx('容量与充电费用','Capacity & charging costs'),tx('一个参考折算值，或一笔费用如何组成。','Understand a reference calculation or a charging bill.'),tx('输入时长、标准或费用项，展开公式和边界。适合核对计算口径。','Enter durations, reference standards or fee items. Inspect the formula and its limits.'),tx('可修改输入','Editable inputs')],['#/park-demo',tx('园区储能演示','Park storage scenarios'),tx('削峰、套利、消纳，储能分别改变了什么？','What changes with peak shaving, arbitrage or renewable use?'),tx('切换8组合成案例，查看逐时调度、能量与费用；不是任意输入的在线求解器。','Switch between eight synthetic cases. Inspect hourly flows, energy and cost; this is not an unrestricted online solver.'),tx('固定案例 · 可复现','Fixed cases · Reproducible')],['#/rev',tx('运营差额试算','Operating-margin example'),tx('先改变假设，再看结果。','Change the assumptions, then inspect the result.'),tx('用合成教学输入理解收入与成本的关系。未计投资、融资、税费和折旧，不是投资回报率。','Explore revenue and costs with synthetic inputs. Excludes investment, finance, tax and depreciation; not an investment return.'),tx('合成教学示例','Synthetic worked example')]];
    $('#app').innerHTML=`<section class="hero demo-page-head"><div class="eyebrow">${tx('收益测算 / 算例与方法','RETURNS TOOLS / SCENARIOS & METHODS')}</div><h1>${tx('收益测算工具','Returns & scenario tools')}</h1><p class="lede">${tx('先选择你要回答的问题。输入、单位、假设和适用边界随结果一起展示。','Choose the question you need to answer. Inputs, units, assumptions and limits stay visible alongside the result.')}</p></section><div class="service-offers">${tools.map(x=>`<article class="service-offer"><span class="service-tag">${x[4]}</span><h2>${x[1]}</h2><h3>${x[2]}</h3><p>${x[3]}</p><a class="btn" href="${x[0]}">${tx('打开工具','Open the tool')} ↗</a></article>`).join('')}</div><section class="proof-band product-section"><div><div class="eyebrow">${tx('从结果回到证据','FROM THE RESULT TO THE EVIDENCE')}</div><h2>${tx('计算正确，还要核适用条件。','Correct arithmetic still needs applicability.')}</h2><p>${tx('公开工具帮助解释方法。实际项目的地区、日期、资格和结算规则仍须独立确认。','The tools explain methods. Region, dates, eligibility and settlement rules still need independent review for a real project.')}</p></div><div class="proof-links"><a href="#/methods/capacity-cost">${tx('容量与费用研究方法','Capacity & cost methodology')} ↗</a><a href="#/services">${tx('需要实际情景模型？','Need a model for your situation?')} ↗</a></div></section>`;
  }
  function startPage(){
    const paths=[['#/policy','01',tx('找到适用的政策','Find the relevant policy'),tx('输入地区或主题，先确认文件状态与执行安排，再打开来源。','Search by region or topic. Check the status and timing, then open the primary source.'),tx('从政策检索开始','Search policies')],['#/topic/绿电直连','02',tx('看一次完整研究路径','Follow a research example'),tx('用绿电直连示例，区分政策条件、项目假设与尚未确认的事。','Use a direct-supply example to separate policy conditions, project assumptions and unknowns.'),tx('阅读研究示例','Read the example')],['#/tools','03',tx('亲手试一次计算','Try a calculation'),tx('试将放电时长设为4小时、高峰时长设为8小时，观察参考折算部分。所有示例数字均为合成。','Try four hours of discharge and an eight-hour peak period. Inspect the reference value; the example inputs are synthetic.'),tx('打开工具','Open the tools')]];
    $('#app').innerHTML=`<section class="hero demo-page-head"><div class="eyebrow">${tx('免费体验','FREE EXPLORATION')}</div><h1>${tx('第一次来，从这里开始。','Start with one useful question.')}</h1><p class="lede">${tx('不用注册。先完成一个动作，再判断本站是否对你有帮助。','No account required. Complete one task and decide whether this helps your work.')}</p></section><div class="path-grid">${paths.map(x=>`<article class="path-card"><span class="path-index">${x[1]} /</span><h2>${x[2]}</h2><p>${x[3]}</p><a class="btn" href="${x[0]}">${x[4]} ↗</a></article>`).join('')}</div><section class="card demo-after"><h2>${tx('何时需要定制服务？','When is commissioned work useful?')}</h2><p>${tx('当问题需要结合特定地区、时点或获授权的项目输入，并交付可核查的判断与模型时。','When your question needs a specific region, time frame or authorised project inputs, with an agreed deliverable.')}</p><a href="#/services">${tx('看看交付范围','See the deliverables')} ↗</a></section>`;
  }
  function servicesPage(){
    const offerings=[['policy',tx('政策诊断与定制研究','Policy research & diagnosis'),tx('把“适不适用”，变成可回源的判断。','A sourced answer to “does this apply?”'),tx('给出地区、场景与具体问题。交付适用判断、依据、条件与未知项。','Bring a region, a scenario and a question. Receive a sourced assessment, conditions and open issues.'),tx('带来源的判断与对照','Sourced assessment & comparison')],['model',tx('场景模型与证据包','Scenario models & evidence'),tx('把项目假设展开，让结果可以复核。','Make assumptions explicit and results reproducible.'),tx('使用公开、合成或明确授权的数据。交付输入契约、计算、敏感性与证据说明。','Use public, synthetic or explicitly authorised data. Receive input specifications, calculations, sensitivities and evidence.'),tx('可复算，核关键恒等式','Reproducible model & checks')],['site',tx('专属研究站搭建与维护','Dedicated research sites'),tx('把团队的研究，变成可持续使用的工具。','Turn a team’s research into a usable resource.'),tx('按约定交付代码、配置、样例与维护手册，明确部署、安全、许可和维护责任。','Agree a scope for code, configuration, examples and a maintenance guide, including deployment, security and licensing responsibilities.'),tx('可交接的站点与维护说明','A transferable site & maintenance guide')]];
    if(en()) offerings.push(['procurement','Procurement research support','Turn a sourcing question into a comparison brief.','Define requirements, compare public product specifications and prepare a source-backed shortlist for review. Supplier engagement and purchases are scoped separately.','Requirements, comparison & evidence']);
    const scope=(D.public_guides||[]).find(g=>g.id==='services');
    $('#app').innerHTML=`<section class="hero demo-page-head"><div class="eyebrow">${tx('研究 / 数据 / 产品工程合作','RESEARCH / PROCUREMENT SUPPORT / DEDICATED SITES')}</div><h1>${tx('从作品开始，交流岗位与项目合作。','China research. Clearly scoped deliverables.')}</h1><p class="lede">${tx('公共研究与工具始终免费。需要结合实际情景时，再约定独立服务；先讨论范围，不要求先提交机密材料。','Public research and tools remain free. Commissioned work is scoped separately. You do not need to send confidential information to start a conversation.')}</p></section><section class="service-offers">${offerings.map(x=>`<article class="service-offer"><span class="service-tag">${x[4]}</span><h2>${x[1]}</h2><h3>${x[2]}</h3><p>${x[3]}</p><a href="#inquiry" class="text-link" data-service-choice="${x[0]}">${tx('讨论这个问题','Discuss this scope')} ↗</a></article>`).join('')}</section><section class="engagement-steps"><h2>${tx('从问题到交付，先把范围讲清。','A clear scope before an engagement.')}</h2><div>${[tx('01 描述问题','01 Describe the question'),tx('02 确认输入与交付','02 Define inputs & deliverables'),tx('03 约定费用与验收','03 Agree fees & acceptance')].map(x=>`<span>${x}</span>`).join('')}</div><p>${tx('费用与周期按实际范围约定，不承诺审批、准入、收益或投资结果。','Fees and timing depend on scope. No approval, access, revenue or investment outcome is guaranteed.')}</p></section>${inquiryHTML(false)}${scope?`<details class="scope-reference"><summary>${tx('查看完整服务范围与验收边界','Detailed service scope (Chinese)')}</summary><div class="prose-topic">${mdHTML(scope.md)}</div></details>`:''}`;
    wireInquiry(false);
    document.querySelectorAll('[data-service-choice]').forEach(a=>a.onclick=e=>{e.preventDefault();$('#inquiry-kind').value=a.dataset.serviceChoice;$('#inquiry').scrollIntoView({behavior:'smooth',block:'start'});$('#inquiry-question').focus({preventScroll:true});});
  }
  function inquiryHTML(updates){return `<section class="inquiry-panel" id="inquiry"><div><div class="eyebrow">${tx('下一步','THE NEXT STEP')}</div><h2>${updates?tx('关注你关心的主题。','Follow the topics that matter to you.'):tx('先说清楚，你想解决什么。','Tell us what you need to work out.')}</h2><p>${updates?tx('可通过邮件登记关注主题；目前人工确认与回复。这里不会自动开通订阅或收取费用。','Register your interests by email. Requests are handled manually; this does not start an automatic or paid subscription.'):tx('先生成一份简短需求，再选择复制或通过邮箱发送。不必提供企业机密或真实项目数据。','Prepare a short brief, then copy it or open it in your email app. No confidential or project data is required.')}</p></div><form id="inquiry-form"><label>${tx('关注方向','Interest')}<select id="inquiry-kind" name="kind">${en()?'':'<option value="collaboration">岗位或项目合作</option>'}<option value="policy">${tx('政策研究','Policy research')}</option><option value="procurement">${tx('产品采购研究支持','Procurement research support')}</option><option value="model">${tx('场景与模型','Scenarios & models')}</option><option value="site">${tx('专属研究站','Dedicated research site')}</option></select></label><label>${tx('地区 / 场景（可选）','Region / scenario (optional)')}<input name="region" maxlength="120" placeholder="${tx('例如：陕西 · 园区储能','e.g. Shaanxi · park storage')}"></label><label>${updates?tx('希望关注什么更新？','What updates would you like?'):tx('你希望回答的问题','Your question')}<textarea id="inquiry-question" name="question" rows="3" maxlength="1500" required placeholder="${tx('一句话描述即可','A short description is enough')}"></textarea></label><button class="btn pri" type="submit">${tx('生成邮件草稿','Prepare an email draft')} ↗</button><div id="inquiry-output" aria-live="polite"></div></form></section>`;}
  function wireInquiry(updates){$('#inquiry-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;const kind=form.elements.kind.selectedOptions[0].textContent;const body=`${tx('方向','Interest')}: ${kind}
${tx('地区/场景','Region/scenario')}: ${form.elements.region.value.trim()}
${tx('问题','Question')}: ${form.elements.question.value.trim()}`;const subject=tx(updates?'研究更新关注意向':'研究咨询需求',updates?'Research update interest':'Research enquiry');$('#inquiry-output').innerHTML=`<p>${tx('草稿已生成，尚未发送。','Draft ready. Nothing has been sent.')}</p><textarea readonly rows="5" aria-label="${tx('邮件草稿','Email draft')}">${esc(body)}</textarea><div class="hero-actions"><button type="button" class="btn" id="copy-inquiry">${tx('复制草稿','Copy draft')}</button><a class="btn pri" id="send-inquiry" href="mailto:xuqinnn@163.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">${tx('在邮箱中打开','Open in email')} ↗</a></div>`;$('#copy-inquiry').onclick=async()=>{try{await navigator.clipboard.writeText(body);$('#copy-inquiry').textContent=tx('已复制','Copied');}catch(_){$('#inquiry-output textarea').select();$('#copy-inquiry').textContent=tx('已选中，请复制','Selected — copy the text');}};};}
  function subscribePage(){$('#app').innerHTML=`<section class="hero demo-page-head"><div class="eyebrow">${tx('研究更新','RESEARCH UPDATES')}</div><h1>${tx('保持关注，不被信息淹没。','Keep up with the questions that matter.')}</h1><p class="lede">${tx('中国能源政策、重点专题与新工具的更新意向登记。英文简报仍在筹备，不预售尚未交付的服务。','Register interest in China energy policy, research and tools. An English briefing is being explored; no unlaunched service is sold here.')}</p></section>${inquiryHTML(true)}`;wireInquiry(true);}

  function front() { productHome(); }
  // ---------- 专题页（研究线对外版正文＋自动拼：分省对照表、相关政策）：【编号】开简析卡，「方法卡 Mxx」链方法库 ----------
  function inlineMD(t) {
    return citeHTML(t).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\[([^\[\]\n]+)\]\((https:\/\/[^\s<>()]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>').replace(/\[([^\[\]\n]+)\]\((#\/[A-Za-z0-9_/%\u3400-\u9fff-]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/方法卡\s*(M\d{2})/g, (m, id) => PUB() ? '' : `<a href="#/methods/${id}">方法卡 ${id}</a>`);
  }
  function mdHTML(md) {
    const out = []; let list = null, para = [], tbl = [];
    const flush = () => { if (para.length) { out.push(`<p>${inlineMD(para.join(''))}</p>`); para = []; } if (list) { out.push(`<${list.t}>${list.items.map(x => `<li>${inlineMD(x)}</li>`).join('')}</${list.t}>`); list = null; }
      if (tbl.length) { const rows = tbl.filter(r => !/^\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        out.push(`<div class="tbl"><table><thead><tr>${rows[0].map(c => `<th>${inlineMD(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${inlineMD(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); tbl = []; } };
    md.split('\n').forEach(l => {
      if (/^#\s/.test(l)) return;
      let m;
      if ((m = l.match(/^(#{2,4})\s+(.*)/))) { flush(); out.push(`<h${m[1].length + 1}>${inlineMD(m[2])}</h${m[1].length + 1}>`); }
      else if (/^\s*\|/.test(l)) { if (para.length || list) { const t = tbl; tbl = []; flush(); tbl = t; } tbl.push(l.trim()); }
      else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (tbl.length || para.length || (list && list.t !== 'ul')) flush(); list = list || { t: 'ul', items: [] }; list.items.push(m[1]); }
      else if ((m = l.match(/^\s*\d+[.、]\s+(.*)/))) { if (tbl.length || para.length || (list && list.t !== 'ol')) flush(); list = list || { t: 'ol', items: [] }; list.items.push(m[1]); }
      else if (!l.trim()) flush();
      else { if (list || tbl.length) flush(); para.push(l.trim()); }
    });
    flush(); return out.join('');
  }
  function topicIndex() {
    const art={储能:'vpp',绿电直连:'direct',零碳园区:'park',零碳工厂:'park',虚拟电厂:'vpp'};
    const intro={储能:tx('区分容量机制、现货与辅助服务，核查收入条件与重复计取。','Distinguish capacity mechanisms, spot markets and ancillary services; inspect revenue conditions.'),绿电直连:tx('研究接入模式、电量比例、费用与项目适用边界。','Inspect connection arrangements, energy ratios, charges and project scope.'),零碳园区:tx('从政策目标进入园区条件、能源方案与合成算例。','Connect policy goals to park conditions, energy planning and synthetic scenarios.'),零碳工厂:tx('看认定对象、指标体系与资料准备，分清政策和标准。','Review eligibility, indicator frameworks and evidence requirements.'),虚拟电厂:tx('梳理聚合资源、市场准入、交易与结算四个层次。','Research aggregation, market eligibility, trading and settlement separately.')};
    const names={储能:'Grid-side standalone storage',绿电直连:'Direct green power',零碳园区:'Zero-carbon parks',零碳工厂:'Zero-carbon factories',虚拟电厂:'Virtual power plants'};
    $('#app').innerHTML=`<section class="hero demo-page-head"><div><div class="eyebrow">${tx('专题 / 资料 / 方法','TOPICS / SOURCES / METHODS')}</div><h1>${tx('重点专题研究','Research themes')}</h1><p class="lede">${tx('从一个完整问题出发，连接国家框架、地方实施、研究资料与判断方法。每项结论保留依据和适用边界。','Explore a complete question across national instruments, regional implementation, source material and methods. Original studies remain in Chinese.')}</p></div></section><div class="studio-topics topic-library">${(D.topics||[]).map((t,i)=>{const text=(t.md.split(/##\s*一句话/)[1]||'').split('\n').find(x=>x.trim())||'';return `<a class="studio-topic topic-${art[t.名]||'park'}" href="#/topic/${encodeURIComponent(t.名)}"><div class="topic-art">${topicDrawing(art[t.名]||'park')}<span>RESEARCH / 0${i+1}</span></div><div class="topic-copy"><h3>${esc(tx(t.题||t.名,names[t.名]||t.名))}${icon('arrow-up-right')}</h3><p>${intro[t.名]||tx('查看完整研究、政策条件与来源。','Inspect the study, conditions and sources.')}</p></div></a>`;}).join('')}</div>${researchContinuations()}`;
  }
  function topicPage(arg) {
    const [name, focus] = String(arg || '').split('/'), t = (D.topics || []).find(x => x.名 === name); if (!t) return topicIndex();
    const hasMap = Object.keys((D.topicmap || {})[name] || {}).length > 0;
    const base = p => p.split(/[·(（]/)[0], rank = p => /^(国家|全国)/.test(p) ? 0 : PROVS.includes(base(p)) || base(p) === '内蒙古' ? 1 : 2;
    const subs = Object.keys(t.rows).filter(p => !/^研究参考/.test(p)).sort((a, b) => rank(a) - rank(b) || base(a).localeCompare(base(b), 'zh') || a.localeCompare(b, 'zh'));   /* 研究参考行不进对照表 */
    const v = { 主: [...new Set(TOPIC_TAGS(name).flatMap(k => ((D.tagdocs || {})[k] || { 主: [] }).主))] }, rel = v.主.slice().sort((a, b) => String((D.docs[b] || {}).date || '').localeCompare(String((D.docs[a] || {}).date || ''))).slice(0, 40);
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow"><a href="#/topics">专题</a></div><h1>${esc(t.题 || name)}</h1></div></section>
      ${hasMap ? '<section class="card mapcard" style="margin-bottom:18px"><div id="tmap"></div></section>' : ''}
      <article class="card prose-topic">${mdHTML(t.md)}${name==='零碳园区'?'<p><a href="#/park-demo">查看园区储能合成演示 →</a></p>':''}</article>
      <section class="card" style="margin-top:18px"><h2>分省对照 <small class="note" style="display:inline">${subs.length} 行 · 按政策更新</small></h2>
        <div class="sub">每格只给结论句；点圆点看依据文件。「—」为本站未采集，不等于该省无规定。</div>
        <div class="tbl topic-tbl"><table><thead><tr><th>省份</th>${t.cols.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${subs.map(p => `<tr><th>${PROVS.includes(base(p)) ? `<a href="#/p/${encodeURIComponent(base(p))}">${esc(p)}</a>` : esc(p)}</th>${t.cols.map(([m]) => `<td>${t.rows[p][m] ? citeHTML(clean(t.rows[p][m]).replace(/^【结论】\s*/, '')) : '<span class="note">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      ${rel.length ? `<section class="card" style="margin-top:18px"><h2>相关政策 <small class="note" style="display:inline">${v.主.length} 件，显示最近 ${rel.length} 件</small></h2><ul class="evl">${rel.map(c => docRow(c)).join('')}</ul>${TOPIC_TAGS(name).length === 1 ? `<p class="sub"><a href="#/lib?tag=${encodeURIComponent(name)}">在政策库里筛选全部 →</a></p>` : ''}</section>` : ''}`;
    if (hasMap) {
      wireTopicMap(name, 'comp');
      if (name === '储能') $('#tmap').closest('section').insertAdjacentHTML('afterend', landingHTML('ZCGJ03'));
    }
    if (focus && TILES[focus]) openPanel(provTopicCard(name, focus));
  }
  // ---------- 信息架构 v2（研究线 10-16，用户定）：「政策」板块（最新政策看板＋四入口＋列表）、专题地图三图层、省份页反向链接 ----------
  const LIBX = () => D._lx || (D._lx = Object.fromEntries((D.lib || []).map(r => [r[0], r])));
  const days = d => (Date.parse(today()) - Date.parse(d)) / 864e5;
  const isYMD = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const actDate = r => isYMD(r[4]) && !r[4].endsWith('-01') ? r[4] : (isYMD(r[8]) ? r[8] : '');          /* 日为 1 号的占位日期改用收录日 */
  const midDate = r => isYMD(r[4]) ? (r[4].endsWith('-01') ? r[4].slice(0, 8) + '15' : r[4]) : '';     /* 更新状态：占位日期按月中计 */
  const tilesOf = r => r[5] === '内蒙古' ? ['蒙西', '蒙东'] : r[5] === '跨省区域' ? (r[9] || []) : TILES[r[5]] ? [r[5]] : [];
  const libProv = p => (p === '蒙西' || p === '蒙东') ? '内蒙古' : p;
  const GRAY = '#ECEDEF', BLUES = ['#D3DCF0', '#AFBFE3', '#8299CF', '#5B78BD', '#2F4B8A'];   /* 最浅档须与「无／未采集」灰色分得开 */
  function tileMapHTML(cell, id) {
    return `<div class="tilemap" id="${id}">${PROVS.map(p => { const [x, y] = TILES[p], c = cell(p); return `<button type="button" class="tile${DARK.includes(c.bg) ? ' dark' : ''}${c.dim ? ' faded' : ''}" style="grid-column:${x + 1};grid-row:${y + 1};background:${c.bg}" data-tp="${esc(p)}" title="${esc(c.tip || '')}"><span class="nm">${esc(p)}</span><span class="val">${esc(c.val || '')}</span></button>`; }).join('')}</div>`;
  }
  const legendHTML = items => `<div class="legend">${items.map(([bg, t]) => `<span><span class="sw" style="background:${bg}"></span>${esc(t)}</span>`).join('')}</div>`;
  const quint = vals => { const v = vals.filter(x => x > 0).sort((a, b) => a - b); return x => !(x > 0) ? -1 : Math.min(4, Math.floor(v.filter(y => y <= x).length / v.length * 5 - 1e-9)); };
  const impDots = n => n ? `<span class="imp" title="重要性 ${n}／5">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>` : '';
  function policyPage(arg) {
    const L = D.lib || [], recent = L.filter(r => { const d = actDate(r),record=contentModel.records.get(r[0]); return d && days(d) >= 0 && days(d) <= 30 && !/参考|已替代|重复作废|废止/.test(r[3])&&!record?.review_hold&&(record?.content_type!=='notice'||record.importance>=4); });
    const act = {}, cnt = {}, hi = {}, last = {}; let nat = 0;
    recent.forEach(r => { const d = actDate(r), importance=contentModel.records.get(r[0])?.importance??r[7]??1, w = importance * Math.pow(0.5, days(d) / 10);
      if (r[5] === '全国') { nat++; return; }
      tilesOf(r).forEach(p => { act[p] = (act[p] || 0) + w * (r[5] === '跨省区域' ? 0.5 : 1); cnt[p] = (cnt[p] || 0) + 1; if (importance >= 4) hi[p] = (hi[p] || 0) + 1; if (!last[p] || d > actDate(last[p])) last[p] = r; }); });
    const q = quint(Object.values(act)), sel = arg && TILES[arg] ? arg : '';
    const listed=recent.filter(r=>!sel||tilesOf(r).includes(sel)).map(r=>({...contentModel.records.get(r[0]),sortDate:actDate(r)}));
    const notices=EnergyContent.query(contentModel,{type:'notice'}).filter(r=>r.importance>=4&&r.sortDate&&days(r.sortDate)>=0&&days(r.sortDate)<=30&&(!sel||r.verified_region_codes?.includes(sel)||r.province===sel));
    const list=[...new Map([...listed,...notices].map(r=>[r.id,r])).values()].sort((a,b)=>String(b.sortDate).localeCompare(String(a.sortDate)));
    const card=r=>`<li><button type="button" class="prow" aria-controls="analysis-workspace" ${r.kind==='notice'?`data-notice-id="${esc(r.id)}"`:`data-code="${esc(r.id)}"`}><span class="pv">${esc(r.province||'区域')}</span><span class="st">${esc(contentTypeLabel(r))}</span><span class="pt">${esc(r.title)}</span><span class="mono pd">${esc(r.sortDate.slice(5))}</span></button></li>`;
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">旧资料索引 ${L.length} 条 · 分类持续完善</div><h1>最新政策分析</h1>
        <p class="lede">左图按已有关联展示近30天资料活跃度；右侧合并近期资料和4、5级重要通知。类型尚未全量审定，点条目查看摘要、分析与来源。</p></div></section>
      ${contentCountsHTML()}${analysisWorkspaceHTML()}<section class="card pboard"><div class="pmap"><div class="sub">国家层面近 30 天 <b class="mono">${nat}</b> 件 · <a href="#/lib?prov=全国">看国家文件 →</a></div>
          ${tileMapHTML(p => { const k = q(act[p]); return { bg: k < 0 ? GRAY : BLUES[k], val: cnt[p] ? cnt[p] + ' 件' : '', dim: sel && sel !== p, tip: cnt[p] ? `${p}：近 30 天 ${cnt[p]} 件，其中重要性 4 级以上 ${hi[p] || 0} 件；最近一件《${last[p][1].replace(/^\d{6}/, '').slice(0, 40)}》` : `${p}：近 30 天无新件` }; }, 'pTiles')}
          ${legendHTML([[GRAY, '无'], ...BLUES.map((c, i) => [c, ['低', '较低', '中', '较高', '高'][i]])])}
          <p class="note">近 30 天资料活跃度＝重要性按时间衰减加总（每 10 天减半）；区域文件计入所覆盖各省、权重减半；国家文件单列。</p></div>
        <div class="plist"><div class="sub">${sel ? `${esc(sel)} · ${list.length} 件 · <a href="#/policy">看全部</a> · <a href="#/p/${encodeURIComponent(sel)}">进入${esc(sel)}看板 →</a>` : `近 30 天 ${list.length} 件，按索引／事件日期倒序`}</div><ul class="prl">${list.map(card).join('') || '<li class="note">无</li>'}</ul></div></section>
      <section style="margin-top:20px"><h2 style="margin-bottom:12px">找政策</h2><div class="mech entries">
        <a class="mc" href="#/policy/prov"><div class="mh"><b>按省份</b></div><p>31 省网格，看每省件数和最近更新。</p></a>
        <a class="mc" href="#/topics"><div class="mh"><b>按专题</b></div><p>${(D.topics || []).map(t => esc(t.名)).join('、')}。</p></a>
        <a class="mc" href="#/policy/time"><div class="mh"><b>按时间</b></div><p>近 24 个月每月发文件数，点月份看当月政策。</p></a>
        <form class="mc" id="psearch"><div class="mh"><b>直接搜索</b></div><input name="q" placeholder="政策名称或文号" aria-label="搜索政策"><button class="dim on" type="submit">搜索</button></form></div></section>`;
    $('#pTiles').onclick = e => { const t = e.target.closest('[data-tp]'); if (t) location.hash = '#/policy/' + (sel === t.dataset.tp ? '' : encodeURIComponent(t.dataset.tp)); };
    $('#psearch').onsubmit = ev => { ev.preventDefault(); const v = ev.target.q.value.trim(); location.hash = '#/lib' + (v ? '?q=' + encodeURIComponent(v) : ''); };
  }
  function policyProv() {
    const L = D.lib || [], n = {}, last = {};
    L.forEach(r => { [r[5] === '内蒙古' ? '内蒙古' : r[5]].forEach(p => { n[p] = (n[p] || 0) + 1; if (isYMD(r[4]) && (!last[p] || r[4] > last[p])) last[p] = r[4]; }); });
    const names = ['全国'].concat(PROVS.filter(p => p !== '蒙东').map(libProv)), uniq = [...new Set(names)].concat(['跨省区域']);
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow"><a href="#/policy">政策</a> · 按省份</div><h1>按省份找政策</h1></div></section>
      <div class="pgrid">${uniq.map(p => `<a class="tagbox" href="#/lib?prov=${encodeURIComponent(p)}"><b>${esc(p)}</b><span>${n[p] || 0} 件 · 最近 ${esc(last[p] || '—')}</span></a>`).join('')}</div>`;
  }
  function policyTime() {
    const L = D.lib || [], m = {}; L.forEach(r => { if (isYMD(r[4])) m[r[4].slice(0, 7)] = (m[r[4].slice(0, 7)] || 0) + 1; });
    const now = new Date(today()), ms = []; for (let i = 23; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); ms.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    const max = Math.max(1, ...ms.map(k => m[k] || 0));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow"><a href="#/policy">政策</a> · 按时间</div><h1>近 24 个月每月发文</h1><p class="lede">柱高为当月发文件数（按成文日）。点柱子看当月政策。</p></div></section>
      <section class="card"><div class="tbars">${ms.map(k => `<a href="#/lib?yr=${k}" title="${k}：${m[k] || 0} 件"><span class="bar" style="height:${((m[k] || 0) / max * 100).toFixed(1)}%"></span><small class="mono">${k.slice(2).replace('-', '.')}</small><em class="mono">${m[k] || 0}</em></a>`).join('')}</div></section>`;
  }
  /* 专题地图：完整度（参数表关键格一手依据占比）、更新状态（本专题主标签下本省最近一件省级文件）、现行状态 */
  const TOPIC_TAGS = n => n === '储能' ? (D.tags || []).filter(t => ['容量', '现货', '辅助服务', '成本', '准入'].includes(t.类)).map(t => t.标签) : [n];
  function topicDocs(n, p) {
    const X = LIBX(), set = new Set(); TOPIC_TAGS(n).forEach(k => ((D.tagdocs || {})[k] || { 主: [] }).主.forEach(c => set.add(c)));
    return [...set].map(c => X[c]).filter(r => r && tilesOf(r).includes(p) && r[5] !== '跨省区域').sort((a, b) => midDate(b).localeCompare(midDate(a)));
  }
  function topicLayer(n, p) {
    const tm = ((D.topicmap || {})[n] || {})[p], docs = topicDocs(n, p), lastD = docs.length ? midDate(docs[0]) : '';
    let st = tm && n === '储能' ? tm.st : docs.some(r => STG(r[3]) === '施行中') ? '施行中' : docs.some(r => STG(r[3]) === '征求稿') ? '征求稿' : '未见';
    return { comp: tm ? tm.comp : null, st, last: lastD, age: lastD ? days(lastD) : null, docs };
  }
  const ST_C = { 施行中: '#2F4B8A', 已印发待施行: '#5B78BD', 征求稿: '#E7B567', 未见: GRAY };
  const AGE = a => a == null ? ['无', GRAY] : a <= 30 ? ['30 天内', '#2F4B8A'] : a <= 90 ? ['90 天内', '#5B78BD'] : a <= 180 ? ['180 天内', '#97AAD7'] : ['更早', '#CBD5EC'];
  const COMP = c => c == null ? ['未采集', GRAY] : [['<20%', BLUES[0]], ['20—40%', BLUES[1]], ['40—60%', BLUES[2]], ['60—80%', BLUES[3]], ['≥80%', BLUES[4]]][Math.min(4, Math.floor(c * 5))];
  const TL = { comp: '政策完整度', age: '更新状态', st: '现行状态' };
  function topicMapHTML(n, layer) {
    const cell = p => { const v = topicLayer(n, p);
      if (layer === 'comp') { const [t, bg] = COMP(v.comp); return { bg, val: v.comp == null ? '' : Math.round(v.comp * 100) + '%', tip: `${p}：完整度 ${v.comp == null ? '未采集' : Math.round(v.comp * 100) + '%'}` }; }
      if (layer === 'age') { const [t, bg] = AGE(v.age); return { bg, val: t === '无' ? '' : t, tip: `${p}：最近一件 ${v.last || '无'}` }; }
      return { bg: ST_C[v.st], val: v.st === '未见' ? '' : v.st, tip: `${p}：${v.st}` }; };
    const leg = layer === 'comp' ? [[GRAY, '未采集'], ...['<20%', '20—40%', '40—60%', '60—80%', '≥80%'].map((t, i) => [BLUES[i], t])] : layer === 'age' ? [['#2F4B8A', '30 天内'], ['#5B78BD', '90 天内'], ['#97AAD7', '180 天内'], ['#CBD5EC', '更早'], [GRAY, '无']] : Object.entries(ST_C).map(([k, c]) => [c, k]);
    const note = layer === 'comp' ? '衡量本站收录完整程度，不代表政策多少：参数表关键格中有一手依据的占比，「未见」不计、征求稿计一半。' : layer === 'age' ? '本专题相关的本省最近一件省级文件，发文日距今多久。' : (n === '储能' ? '与首页容量电价卡同口径（容量机制，⑧c8；无则看清单制②c17）。' : '按本省本专题政策文件的状态统计，不代表机制已全面落地：有施行中的记施行中，只有征求稿的记征求稿。');
    return `<div class="seg" id="tLayer">${Object.entries(TL).map(([k, t]) => `<button type="button" class="${k === layer ? 'on' : ''}" data-l="${k}">${t}</button>`).join('')}</div>${tileMapHTML(cell, 'tTiles')}${legendHTML(leg)}<p class="note">${esc(note)}点省份看「本省在本专题」。</p>`;
  }
  function provTopicCard(n, p) {
    const v = topicLayer(n, p), t = (D.topics || []).find(x => x.名 === n), X = LIBX();
    const rows = t ? Object.entries(t.rows).filter(([k]) => (k.split(/[·(（]/)[0] === libProv(p)) || k === p) : [];
    const codes = new Set(v.docs.map(r => r[0])), rel = (D.links || []).filter(l => codes.has(l.从) || codes.has(l.到)).slice(0, 8);
    return `<div class="shead"><button type="button" class="close" id="bsClose" aria-label="关闭">×</button><div class="chips"><span class="chip tier">${esc(n)}</span><span class="st ${v.st === '施行中' ? 'ok' : v.st === '征求稿' ? 'draft' : 'none'}">${esc(v.st)}</span></div>
      <h2 id="bsH">${esc(p)} · 在本专题</h2><div class="dates"><span>完整度 <b>${v.comp == null ? '未采集' : Math.round(v.comp * 100) + '%'}</b></span><span>最近更新 <b>${esc(v.last || '—')}</b></span></div></div>
      <div class="sbody">${rows.map(([k, r]) => `<div class="block"><h4>${esc(k)} · 关键结论</h4>${t.cols.slice(0, 6).filter(([m]) => r[m]).map(([m, h]) => `<p><b>${esc(h)}</b>：${citeHTML(clean(r[m]).replace(/^【结论】\s*/, ''))}</p>`).join('')}</div>`).join('') || '<p class="cap">本专题参数表未采集本省。</p>'}
        <div class="block"><h4>本省本专题最近政策</h4><ul class="evl">${v.docs.slice(0, 5).map(r => docRow(r[0])).join('') || '<li class="note">无</li>'}</ul></div>
        ${rel.length ? `<div class="block"><h4>本省脉络</h4><ul class="plain">${rel.map(l => `<li>${D.docs[l.从] || X[l.从] ? `<button type="button" class="cite" data-code="${esc(l.从)}">${esc(l.从)}</button>` : esc(l.从)} ${esc(l.关系)} <button type="button" class="cite" data-code="${esc(l.到)}">${esc(l.到)}</button></li>`).join('')}</ul></div>` : ''}
        <p><a href="#/p/${encodeURIComponent(p)}">${esc(p)}全部 →</a>　<a href="#/lib?prov=${encodeURIComponent(libProv(p))}&tag=${encodeURIComponent(TOPIC_TAGS(n)[0] || '')}">在政策库里看 →</a></p></div>`;
  }
  /* 央地落地时间轴（研究线中观枢纽框架第 2 步）：国家件发文日为起点，各省落实件按发文日排开，标时滞天数；地方标准高于／等于／低于国家基准三色。
     日为 1 号的占位日期时滞作废（不画），故先只画 114 号（2026-01-27）；650／1192／688 号等①表日期补齐后再开 */
  function landingHTML(up) {
    const X = LIBX(), u = D.docs[up] || {}, E = (D.links || []).filter(l => l.从 === up && l.关系 === '上位依据' && X[l.到] && X[l.到][5] !== '全国');
    if (!E.length) return '';
    const C = { 高于: '#2F4B8A', 等于: '#8299CF', 低于: '#C9553F' }, rows = E.map(l => ({ l, r: X[l.到] })).sort((a, b) => (a.l.时滞天数 ?? 1e9) - (b.l.时滞天数 ?? 1e9) || a.r[4].localeCompare(b.r[4]));
    const max = Math.max(1, ...rows.map(x => x.l.时滞天数 || 0));
    return `<section class="card" style="margin-bottom:18px"><h2>各省怎么落地 · 国家 114 号文 <small class="note" style="display:inline">${esc(u.date || '')} 发文 · ${rows.length} 件省级落实件</small></h2>
      <div class="sub">条长＝本省落实件发文日距国家文件的天数；颜色＝本省标准相对国家基准。日期只到月份的件不画时滞，只列在下方。</div>
      <div class="lgrid">${rows.filter(x => x.l.时滞天数 != null).map(({ l, r }) => `<div class="lrow"><span class="pv">${esc(r[5])}</span><div class="ltrack"><div class="lfill" style="width:${(l.时滞天数 / max * 100).toFixed(1)}%;background:${C[l.对比] || '#B8BCC4'}"></div></div><span class="mono">${l.时滞天数} 天</span><button type="button" class="cite ${statusClass(r[3])}" data-code="${esc(r[0])}">${esc(r[0])}</button><span class="lt">${esc(r[1].replace(/^\d{6}/, '').slice(0, 34))}</span></div>`).join('')}</div>
      ${rows.some(x => x.l.时滞天数 == null) ? `<p class="sub" style="margin-top:10px">日期只到月份：${rows.filter(x => x.l.时滞天数 == null).map(({ r }) => `${esc(r[5])} <button type="button" class="cite ${statusClass(r[3])}" data-code="${esc(r[0])}">${esc(r[0])}</button>`).join('　')}</p>` : ''}
      ${legendHTML([[C.高于, '高于国家基准'], [C.等于, '等于'], [C.低于, '低于'], ['#B8BCC4', '不适用／未比较']])}</section>`;
  }
  function openPanel(html) {
    const dlg = $('#bsheet'); bsOpener = bsOpener || document.activeElement; tip.hidden = true;
    $('#bsInner').innerHTML = html; $('#bsClose').onclick = () => dlg.close(); if (!dlg.open) dlg.showModal(); const b = $('#bsInner .sbody'); if (b) b.scrollTop = 0;
  }
  function wireTopicMap(n, layer) {
    const box = $('#tmap'); box.innerHTML = topicMapHTML(n, layer);
    $('#tLayer').onclick = e => { const b = e.target.closest('[data-l]'); if (b) wireTopicMap(n, b.dataset.l); };
    $('#tTiles').onclick = e => { const t = e.target.closest('[data-tp]'); if (t) openPanel(provTopicCard(n, t.dataset.tp)); };
  }
  function provTopicsHTML(p) {
    if (!(D.topics || []).length) return '';
    return `<section class="card" style="margin-top:18px"><h2>本省各专题</h2><div class="tbl"><table class="ptopics"><thead><tr><th>专题</th><th>现行状态</th><th>政策完整度</th><th>最近更新</th></tr></thead><tbody>${(D.topics || []).map(t => { const v = topicLayer(t.名, p);
      return `<tr><td><a href="#/topic/${encodeURIComponent(t.名)}/${encodeURIComponent(p)}">${esc(t.名)} →</a></td><td>${esc(v.st)}</td><td class="mono">${v.comp == null ? '未采集' : Math.round(v.comp * 100) + '%'}</td><td class="mono">${esc(v.last || '—')}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  }
  function drawTiles() {
    const m = METRICS[S.metric], wrap = $('#tiles');
    $('#mapTitle').textContent = m.label;
    $('#mapSub').textContent = m.note;
    wrap.innerHTML = PROVS.map(p => {
      const [x, y] = TILES[p], c = m.cat(p), bg = colorOf(m, c);
      const dim = S.pick && S.pick !== c ? ' faded' : '';
      return `<button type="button" class="tile${DARK.includes(bg) ? ' dark' : ''}${dim}" style="grid-column:${x + 1};grid-row:${y + 1};background:${bg}" data-go="${esc(p)}" aria-label="${esc(p)}：${esc(c)}">
        <span class="nm">${esc(p)}</span><span class="val">${esc(short(c))}</span></button>`;
    }).join('');
    wrap.onclick = e => { const t = e.target.closest('[data-go]'); if (t) location.hash = '#/p/' + encodeURIComponent(t.dataset.go); };
    wrap.onmouseover = e => { const t = e.target.closest('[data-go]'); if (t) peek(t.dataset.go); };
    const cats = m.order.filter(c => PROVS.some(p => m.cat(p) === c)).concat([...new Set(PROVS.map(m.cat))].filter(c => !m.order.includes(c)));
    $('#legend').innerHTML = cats.map(c => `<button type="button" class="lg${S.pick === c ? ' on' : ''}${S.pick && S.pick !== c ? ' off' : ''}" data-c="${esc(c)}"><span class="sw" style="background:${colorOf(m, c)}"></span>${esc(c)}<b>${PROVS.filter(p => m.cat(p) === c).length}</b></button>`).join('');
    $('#legend').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; S.pick = S.pick === b.dataset.c ? null : b.dataset.c; drawTiles(); drawTable(); };
  }

  function peek(p) {
    const rows = Object.entries(MET()).map(([, m]) => `<div><span>${m.label}</span><b>${esc(m.cat(p))}</b></div>`).join('');
    $('#peek').innerHTML = `<div class="pk-h">${esc(p)} <a href="#/p/${encodeURIComponent(p)}">看板 →</a></div>${rows}<div><span>容量机制</span><b>${esc(capLine(p))}</b></div>`;
  }

  const COLS = [
    ['省份', p => p],
    ['公开分级', p => { const x = ((D.score || {}).rows || []).find(r => r.主体 === p); return x ? `${x.档位}·${x.总分}` : '—'; }],
    ['投资分级', gradeOf],
    ['容量机制', capLine],
    ['政策状态', p => first1(p, '⑧c8') || '—'],
    ['清单制', listOf],
    ['现货阶段', stageOf],
    ['充电费用', chargeOf],
    ['退坡风险', rampOf],
    ['收益确定性', p => (first1(p, '⑧c3').split(/[（(〔]/)[0]) || '未评']
  ];
  const ORDER = { '优先开发': 0, '储备开发': 1, '谨慎开发': 2, '未评': 3 };
  let sortK = 1, sortDir = 1;
  function drawTable() {
    const m = METRICS[S.metric];
    const cols = (PUB() ? COLS.filter(c => c[0] !== '投资分级') : COLS).filter(c => c[0] !== '公开分级' || D.score);
    if (sortK >= cols.length) sortK = 0;
    const isGrade = cols[sortK][0] === '投资分级';
    const key = (p, i) => cols[i][0] === '投资分级' ? ORDER[gradeOf(p)] : cols[i][1](p);
    const rows = PROVS.filter(p => !S.pick || m.cat(p) === S.pick).sort((a, b) => {
      const x = key(a, sortK), y = key(b, sortK);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir || a.localeCompare(b, 'zh');
      return String(x).localeCompare(String(y), 'zh') * sortDir || a.localeCompare(b, 'zh');
    });
    $('#tblSub').textContent = (S.pick ? `已筛选：${m.label}＝${S.pick}（${rows.length} 省）。` : '') + (PUB() ? '' : '默认按投资分级分组；') + '点表头排序，点省名进入看板。「—」「未采集」表示库里还没有，不等于无规定。';
    let last = null;
    $('#tbl').innerHTML = `<thead><tr>${cols.map((c, i) => `<th data-i="${i}" aria-sort="${i === sortK ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}">${c[0]}${i === sortK ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(p => {
        const g = gradeOf(p);
        const head = isGrade && g !== last ? (last = g, `<tr class="grp"><td colspan="${cols.length}"><span class="sw" style="background:${colorOf(METRICS.grade, g)}"></span>${g}<small>${rows.filter(q => gradeOf(q) === g).length} 省</small></td></tr>`) : '';
        return head + `<tr>${cols.map((c, i) => {
          const v = c[1](p);
          if (i === 0) return `<td><a href="#/p/${encodeURIComponent(p)}">${esc(v)}</a></td>`;
          if (c[0] === '政策状态') return `<td><span class="st ${statusClass(v)}">${esc(String(v).slice(0, 16))}</span></td>`;
          return `<td>${esc(v)}</td>`;
        }).join('')}</tr>`; }).join('')}</tbody>`;
    $('#tbl thead').onclick = e => { const th = e.target.closest('th'); if (!th) return; const i = +th.dataset.i; sortDir = i === sortK ? -sortDir : 1; sortK = i; drawTable(); };
  }

  // ---------- 收益来源全景（对外版：只讲政策，不出测算金额） ----------
  function sources() {
    const one = (p, m) => { const f = F(p, m); return isMissing(f) ? '<span class="note" style="display:inline">未采集</span>' : citeHTML(firstSentence(f.v, 70)); };
    const rows = PROVS.filter(p => D.provinces[p]).sort((a, b) => a.localeCompare(b, 'zh'));
    $('#app').innerHTML = `
      <section class="hero"><div><div class="eyebrow">电网侧独立储能 · 收益来源全景</div>
        <h1>一座独立储能电站，政策上能从哪几处拿收益</h1>
        <p class="lede">逐省列出容量电价（补偿）、容量租赁、现货与调频四类收益来源的政策规定，以及充电要承担哪些费用。只讲文件怎么规定、是否生效，不做收益测算。<b>容量电价与容量租赁是同一块容量，只能二选一</b>（多省明文；其余省测算也按此处理）。</p></div></section>
      <section class="card"><h2>逐省政策一览</h2><div class="sub">悬停圆点看依据文件与当前状态；点省名看完整看板。「未采集」不等于该省没有规定。</div>
        <div class="tablewrap"><table class="t rev"><thead><tr><th>省份</th><th>容量电价／补偿</th><th>4h 按政策折算<br><small>元/kW·年</small></th><th>清单制</th><th>容量租赁</th><th>现货市场</th><th>调频</th><th>充电费用</th></tr></thead>
        <tbody>${rows.map(p => `<tr><td><a href="#/p/${encodeURIComponent(p)}">${esc(p)}</a></td>
          <td>${esc(capLine(p))} <span class="st ${statusClass(first1(p, '⑧c8'))}">${esc(capPolicy(p) === '征求意见稿' ? '征求稿' : capPolicy(p) === '已出台' ? (effDate(p) ? effDate(p) + ' 起' : '现行') : '—')}</span>${/^格内无编号/.test(sourcesOf(p, '⑧c4')) ? '' : `<div>${citeHTML(sourcesOf(p, '⑧c4'))}</div>`}</td>
          <td class="mono">${isKW(p) && N(p, '⑧c11') != null ? Math.round(N(p, '⑧c11')) : '—'}</td>
          <td>${esc(listOf(p))}</td>
          <td style="max-width:260px">${one(p, '②c10')}</td>
          <td>${esc(stageOf(p))}</td>
          <td style="max-width:260px">${one(p, '②c4')}</td>
          <td>${esc(chargeOf(p))}</td></tr>`).join('')}</tbody></table></div>
        <ul class="rules" style="margin-top:14px;font-size:13.5px;color:var(--ink2)">
          <li><b>4h 按政策折算</b>＝本省容量电价基数 × min(1, 4 ÷ 本省折算基准时长)，是文件公式的换算，不是项目收益测算；按放电量补偿的省（山东、内蒙古）口径不同，不折算。</li>
          <li><b>充电费用</b>：A0 四项全免 · A1 只担线损 · A2 免输配与基金、仍缴系统运行费 · B 视同电力用户，按单一制承担（部分省放电对应电量退减）。</li>
          <li><b>征求稿</b>尚未生效；<b>未来起执行</b>的（如安徽 2027-01-01）执行前没有这块收入。</li>
        </ul></section>`;
  }

  // ---------- 收益构成全景 ----------
  function revOf(p) {
    const spot = N(p, '⑧c18'), cap = N(p, '⑧c19'), lease = N(p, '⑧c20'), cost = N(p, '⑧c50');
    const useLease = lease != null && lease > (cap || 0);
    const capV = useLease ? lease : (cap || 0);
    const pol = capPolicy(p);
    let capTag = useLease ? '可算·租赁' : pol === '已出台' ? (effDate(p) ? effDate(p).slice(0, 4) + ' 起' : '可算') : pol === '征求意见稿' ? '征求稿·未生效' : capV ? '可算' : '无';
    if (/放电量|市场化/.test(capUnit(p)) && capV) capTag = '按放电量';
    const fm = clean(V(p, '⑧c17')).split('\n')[0];
    const fmTag = /^\d/.test(fm) ? `单价 ${fm} 元/MW，未测年收益` : '未采集';
    return { spot, cap, lease, capV, useLease, capTag, cost, fm, fmTag, total: N(p, '⑧c21') };
  }
  const TAGCLS = t => /征求/.test(t) ? 'draft' : /^20\d\d/.test(t) ? 'trial' : /^可算|放电量/.test(t) ? 'ok' : 'none';


  // ---------- 分层分组条形图（收益构成全景、示例测算共用；10-14 用户：重点和层次不突出 → 答案先行、分三组、少颜色、直接标数） ----------
  const C_SURE = '#2F4B8A', C_MKT = '#B7C5E6', C_MKT_X = '#D9DCE2';
  function hatchFill() { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#E3E9F6'; g.fillRect(0, 0, 8, 8); g.strokeStyle = '#5B78BD'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke(); return { image: c, repeat: 'repeat' }; }
  // groups: [{id, t, d, rows:[{n, sure, pend, mkt, lo, hi, tot, net, tip, href, gray}]}]；o: {rng, net}
  function layerGroups(host, groups, o) {
    const gs = groups.filter(g => g.rows.length);
    const ends = gs.flatMap(g => g.rows.map(r => Math.max(r.sure + r.pend + r.mkt, r.tot || 0, o.rng && r.hi != null ? r.hi : 0)));
    const xmax = Math.ceil(Math.max(...ends, 1) * 1.08 / 100) * 100;
    const xmin = o.net ? Math.min(0, Math.floor(Math.min(...gs.flatMap(g => g.rows.map(r => r.net == null ? 0 : r.net))) / 100) * 100) : 0;
    host.innerHTML = gs.map((g, i) => `<div class="lgp" id="grp-${g.id}"><div class="lgh"><h3><i class="gk gk-${g.id}"></i>${g.t}<small>${g.rows.length} 省区</small></h3><p>${g.d}</p></div>
      <div class="lgc" style="height:${g.rows.length * 28 + (i === gs.length - 1 ? 34 : 8)}px"></div></div>`).join('');
    const hatch = hatchFill();
    host.querySelectorAll('.lgc').forEach((el, i) => {
      const g = gs[i], R = g.rows, last = i === gs.length - 1;
      const ch = echarts.init(el, null, { renderer: 'svg' }); new ResizeObserver(() => ch.resize()).observe(el);
      ch.setOption({
        animation: false,
        grid: { left: 70, right: 64, top: 4, bottom: last ? 28 : 4 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(47,75,138,.06)' } }, formatter: qs => R[qs[0].dataIndex].tip },
        xAxis: { type: 'value', min: xmin, max: xmax, axisLabel: { show: last, color: '#5F6670', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#F0EEE8' } },
          name: last ? '元/千瓦·年' : '', nameLocation: 'end', nameGap: 8, nameTextStyle: { color: '#5F6670', fontSize: 11, padding: [22, 0, 0, 0] } },
        yAxis: { type: 'category', inverse: true, data: R.map(r => r.n), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#1B1F24', fontSize: 13 } },
        series: [
          { type: 'bar', stack: 's', barWidth: 14, data: R.map(r => Math.round(r.sure)), itemStyle: { color: C_SURE } },
          { type: 'bar', stack: 's', data: R.map(r => Math.round(r.pend)), itemStyle: { color: hatch } },
          { type: 'bar', stack: 's', data: R.map(r => ({ value: Math.round(r.mkt), itemStyle: { color: r.gray ? C_MKT_X : C_MKT } })) },
          { type: 'custom', z: 5, silent: true, data: o.rng ? R.map((r, j) => r.lo != null ? [j, r.lo, r.hi] : [j, null, null]) : [],
            renderItem: (p, api) => { if (api.value(1) == null) return null; const a = api.coord([api.value(1), api.value(0)]), b = api.coord([api.value(2), api.value(0)]);
              return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#5F6670', lineWidth: 1 } }, { type: 'line', shape: { x1: b[0], y1: b[1] - 4, x2: b[0], y2: b[1] + 4 }, style: { stroke: '#5F6670', lineWidth: 1 } }] }; } },
          { type: 'scatter', z: 6, symbolSize: 9, data: o.net ? R.map((r, j) => r.net != null ? [Math.round(r.net), j] : null).filter(Boolean) : [], encode: { x: 0, y: 1 }, itemStyle: { color: '#fff', borderColor: '#A8251B', borderWidth: 2 } },
          { type: 'scatter', z: 7, symbolSize: 0, silent: true, encode: { x: 0, y: 1 },
            data: R.map((r, j) => [Math.max(r.sure + r.pend + r.mkt, o.rng && r.hi != null ? r.hi : 0, o.net && r.net != null ? r.net : 0), j, r.tot, o.net ? r.net : null]),
            label: { show: true, position: 'right', distance: 6, fontFamily: 'IBM Plex Mono, Menlo, monospace', fontSize: 12,
              formatter: q => (q.value[2] == null ? '' : `{a|${Math.round(q.value[2]).toLocaleString()}}`) + (q.value[3] == null ? '' : `{b| → ${Math.round(q.value[3]).toLocaleString()}}`),
              rich: { a: { color: '#1B1F24', fontWeight: 600, fontFamily: 'IBM Plex Mono, Menlo, monospace', fontSize: 12 }, b: { color: '#A8251B', fontFamily: 'IBM Plex Mono, Menlo, monospace', fontSize: 12 } } } }
        ] });
      ch.on('click', q => { const r = R[q.dataIndex]; if (r && r.href) location.hash = r.href; });
    });
  }
  function sumCards(cards) {        // 答案先行：三张摘要卡，点击跳到对应分组
    return `<div class="sumcards">${cards.map(c => `<button class="sc sc-${c.id}" data-go="grp-${c.id}"><div class="sc-k"><i class="gk gk-${c.id}"></i>${c.k}</div>
      <div class="sc-v">${c.v}<small> 省区</small></div><div class="sc-n">${c.n}</div>${c.x ? `<div class="sc-x">${c.x}</div>` : ''}</button>`).join('')}</div>`;
  }
  function wireCards() { document.querySelectorAll('.sc[data-go]').forEach(b => b.onclick = () => { const t = document.getElementById(b.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
  const nameList = (xs, n = 6) => esc(xs.slice(0, n).join('、')) + (xs.length > n ? ` 等` : '');
  const rangeOf = (vs, unit = '') => { vs = vs.filter(v => v > 0); if (!vs.length) return ''; const a = Math.round(Math.min(...vs)), b = Math.round(Math.max(...vs)); return (a === b ? `${a}` : `${a}—${b}`) + unit; };

  function revenue() {
    if (D.synthetic_example) return syntheticRevenue();
    if (PUB() && !(D.example && D.example.n >= 2)) return sources();
    // 研究线 10-14：两页统一一个数据源——有示例测算 v2 就全部读它的 4 小时档（容量、租赁、现货、过网成本），⑧只作内部底稿
    if (D.example && D.example.n >= 2) return examplePage({ rev: true });
    // v2（10-14 用户：可读性不强，借鉴头部机构）：单位元/千瓦·年；按确定性分层（政策确定→政策待定→市场）；
    // 现货按实现率 70% 画、须线 60%—80%（JL57：研报价差为理论上限）；过网成本不画反向条，用「扣过网后」点标出；按确定层排序
    const K = 20;                                   // 200MW 标杆：万元/年 ÷ 20 ＝ 元/千瓦·年
    const RZ = [0.6, 0.7, 0.8];
    const NONSAME = ['浙江', '福建', '江西', '重庆', '上海'];   // ⑧c13 非 YJ61 同源（v381 列头注），价差不可横比
    const EXV2 = Object.fromEntries(((D.example || {}).n >= 2 ? D.example.rows : []).filter(r => r.配置 === '200MW/800MWh').map(r => [r.主体, r]));
    const ps = PROVS.filter(p => D.provinces[p] && F(p, '⑧c21')).map(p => {
      const r = revOf(p), pol = capPolicy(p), fut = !!effDate(p), stock = /仅限|存量/.test(first1(p, '⑧c8'));   // 只适用存量项目的（如浙江仅限 2024-06-30 前并网），新项目拿不到
      const capk = (r.capV || 0) / K;
      const mktLease = r.useLease && ['宁夏'].includes(p);   // 研究线 10-14：宁夏 88.54 元/千瓦·年为 2025 年市场成交价（中电联【ZCGJ84】p52，二手），不是政策价
      const approx = ['山东'].includes(p);   // 研究线 10-14：0.0705 元/kWh 是用户侧收取标准，补偿池按发电侧可用容量占比分配（【ZCSD08】p1），本站放电量估算只示量级 → 政策待定
      const unsrc = r.useLease && ['云南'].includes(p);   // 研究线 10-14：参考价出处待查（《实施方案》未采集）→ 政策待定，核实后回政策确定
      const sure = r.capV && !mktLease && !unsrc && !approx && (r.useLease || (!fut && !stock && pol !== '征求意见稿')) ? capk : 0;
      const pend = r.capV && !mktLease && (unsrc || approx || (!r.useLease && (fut || stock || pol === '征求意见稿'))) ? capk : 0;
      const spot = r.spot != null ? r.spot / K + (mktLease ? capk / 0.7 : 0) : null;   // 市场成交租赁并入市场层（图上按 0.7 画，抵消回原值）
      const ev = EXV2[p];                                           // 过网成本取研究线示例测算 v2（按 114 号与 ⑧c43 新归类算）；⑧c50 尚按旧口径，不用
      const cost = ev && ev.过网成本 != null ? ev.过网成本 / K : null;
      return { p, r, sure, pend, spot, cost, mktLease, leaseK: mktLease ? capk : 0, pendWhy: approx ? '市场化容量补偿（已生效），金额为估算、口径近似，不作政策确定值' : unsrc ? '调节容量市场参考价（政策机制），数值出处待查' : pol === '征求意见稿' ? '征求稿·未生效' : stock ? '仅存量项目' : fut ? effDate(p) + ' 起执行' : '', tier: pgradeOf(p) };
    }).sort((a, b) => (b.sure - a.sure) || (b.pend - a.pend) || a.p.localeCompare(b.p, 'zh'));
    const f0 = v => v == null ? '—' : Math.round(v).toLocaleString();
    const top = ps.filter(x => x.sure > 0);
    const onlyMkt = ps.filter(x => !x.sure && !x.pend && x.spot);
    // 研究线 10-14：山东为市场化容量补偿，已生效但金额无法折算（画在政策待定），标题另列；未来执行的另列
    const MKTCAP = ['山东'], EXPIRE = { 河北: '2026-12-31', 湖北: '2027-02-01' };   // 容量电价窗口剩余不足 1 年
    const top9 = top.filter(x => !MKTCAP.includes(x.p)), futs = ps.filter(x => !x.sure && x.pend && effDate(x.p) && capPolicy(x.p) === '已出台');   // 征求稿（如河南）不算
    const head = `${top9.length} 个省区有已生效、新项目可拿的容量收入，${esc(top9.slice(0, 3).map(x => x.p).join('、'))} 最高`
      + (futs.length ? `；另有${esc(futs.map(x => x.p + ' ' + effDate(x.p).slice(0, 4)).join('、'))} 年起执行` : '')
      + (ps.some(x => MKTCAP.includes(x.p)) ? `，${MKTCAP.join('、')}为市场化容量补偿、无法折算` : '') + `；${onlyMkt.length} 个省只有市场收入。`;
    const OPT = { rng: false, net: Object.keys(EXV2).length > 0 };
    const tipOf = x => { const r = x.r; return `<b>${x.p}</b>　公开分级 ${esc(x.tier || '—')}<br>政策确定 ${f0(x.sure)}${x.r.useLease ? '（租赁）' : ''}${EXPIRE[x.p] ? '<br>　容量电价窗口到 ' + EXPIRE[x.p] + '（剩余不足 1 年）' : ''}${x.pend ? '<br>政策待定 ' + f0(x.pend) + '　' + esc(x.pendWhy) : ''}<br>市场 ${x.spot != null ? f0(x.spot * RZ[1]) + '（区间 ' + f0(x.spot * RZ[0]) + '—' + f0(x.spot * RZ[2]) + '）' : '—'}${x.mktLease ? '<br>　其中租赁 ' + f0(x.leaseK) + '：2025 年市场成交价（中电联报告，二手），非政策价' : ''}${NONSAME.includes(x.p) ? '<br>　* 价差口径与多数省不同源，不宜横比' : ''}<br>过网成本 ${f0(x.cost)}${EXV2[x.p] && EXV2[x.p].过网成本口径 ? '（' + esc(EXV2[x.p].过网成本口径.split('（')[0]) + '）' : ''}${x.cost != null ? '<br><b>扣过网成本后 ' + f0(x.sure + x.pend + (x.spot || 0) * RZ[1] - x.cost) + '</b>' : ''}<br><span style="color:#B9BEC7">元/千瓦·年｜项目口径 ${f0(r.total)} 万元/年｜点击看省份</span>`; };
    const rowOf = x => { const base = x.sure + x.pend, m = x.spot != null ? x.spot * RZ[1] : 0, tot = base + m;
      return { n: x.p + (NONSAME.includes(x.p) ? ' *' : ''), sure: x.sure, pend: x.pend, mkt: m, lo: x.spot != null ? base + x.spot * RZ[0] : null, hi: x.spot != null ? base + x.spot * RZ[2] : null,
        tot, net: x.cost != null ? tot - x.cost : null, gray: NONSAME.includes(x.p), tip: tipOf(x), href: '#/p/' + encodeURIComponent(x.p) }; };
    const G1 = ps.filter(x => x.sure > 0).sort((a, b) => b.sure - a.sure);
    const G2 = ps.filter(x => !x.sure && x.pend > 0).sort((a, b) => b.pend - a.pend);
    const G3 = ps.filter(x => !x.sure && !x.pend).sort((a, b) => (b.spot || 0) - (a.spot || 0));
    const why2 = [...new Set(G2.map(x => /征求/.test(x.pendWhy) ? '征求稿' : /起执行/.test(x.pendWhy) ? '未来起执行' : /存量/.test(x.pendWhy) ? '仅存量项目' : /出处待查/.test(x.pendWhy) ? '参考价出处待查' : '金额仅能估算'))];
    const groups = [
      { id: 'a', t: '有现行容量收入', d: '容量机制已生效、新建项目可拿。<b>深色</b>＝容量收入，<b>浅色</b>＝现货套利（按七折估）；条末数字＝合计。', rows: G1.map(rowOf) },
      { id: 'b', t: '容量收入待定', d: `有容量机制但还不能算稳：${esc(why2.join('、'))}。<b>斜纹段</b>＝待定的容量收入，悬停看原因。`, rows: G2.map(rowOf) },
      { id: 'c', t: '只有市场收入', d: '暂无容量机制，收入只有现货套利；现货价差是研报理论值，打七折后只示量级。<b>*</b> 价差口径与多数省不同源，不宜横比。', rows: G3.map(rowOf) }
    ];
    const sub = [futs.length ? `另有${esc(futs.map(x => x.p).join('、'))} ${esc(futs.map(x => effDate(x.p).slice(0, 4))[0])} 年起执行` : '', ps.some(x => MKTCAP.includes(x.p)) ? `${MKTCAP.join('、')}为市场化容量补偿、无法折算` : ''].filter(Boolean).join('，');
    $('#app').innerHTML = `
      <section class="hero"><div><div class="eyebrow">电网侧独立储能 · 收益构成全景 · 4 小时项目</div>
        <h1>${top9.length} 个省区有已生效、新项目可拿的容量收入；${onlyMkt.length} 个省只有市场收入</h1>
        <p class="lede">${sub ? sub + '。' : ''}按「收入稳不稳」把各省分成三组：先看有没有政策给的容量收入，再看市场能补多少。</p></div></section>
      ${sumCards([
        { id: 'a', k: '有现行容量收入', v: G1.length, n: nameList(G1.map(x => x.p)), x: '容量 ' + rangeOf(G1.map(x => x.sure), ' 元/千瓦·年') },
        { id: 'b', k: '容量收入待定', v: G2.length, n: nameList(G2.map(x => x.p)), x: esc(why2.join('、')) },
        { id: 'c', k: '只有市场收入', v: G3.length, n: nameList(G3.map(x => x.p)), x: '现货（七折）' + rangeOf(G3.map(x => (x.spot || 0) * RZ[1]), ' 元/千瓦·年') }])}
      <section class="card lgcard">
        <div class="lgbar"><div class="revlegend"><span><i style="background:${C_SURE}"></i>容量收入·已生效</span><span><i class="hatch"></i>容量收入·待定</span><span><i style="background:${C_MKT}"></i>现货套利（七折）</span></div>
          <div class="lgopts"><label><input type="checkbox" id="optRng"> 现货区间（六折—八折）</label><label><input type="checkbox" id="optNet" ${Object.keys(EXV2).length ? 'checked' : ''}> 扣过网成本后<span class="note" style="display:inline">（红色箭头后的数）</span></label></div></div>
        <div id="lghost"></div></section>
      <details class="fold"><summary>怎么读、为什么这样算</summary><ul class="rules">
          <li><b>为什么现货打七折</b>：⑧表现货价差来自研报的「全知视角最优策略」，是理论上限；实际能拿到的按 60%—80% 估（库内判据 JL57）。现货只示量级，不用于跨省排序。</li>
          <li><b>过网成本</b>：按国家 114 号文（充电视作用户、缴系统运行费和线损、单一电量制、放电对应电量退减输配电费）与 ⑧c43 各省归类计算，取研究线示例测算 v2 的数；本省旧优惠在 114 号后未见本省口径的，按国标保守计（旧优惠若继续执行，成本更低）。线损购电价按 0.30 元/千瓦时量级假设。</li>
          <li><b>没画的</b>：调频等辅助服务尚未测算年收益。</li>
          <li><b>标杆项目</b>：200MW／800MWh；乘以 20 万千瓦即得项目年收入（万元），悬停可见。</li></ul></details>
      <details class="fold"><summary>逐省明细表（${ps.length} 省区，含公开分级、过网成本、调频）</summary>
        <div class="tablewrap"><table class="t rev"><thead><tr><th>省份</th><th>公开分级</th><th>政策确定</th><th>政策待定</th><th>现货（70%）</th><th>过网成本</th><th>扣过网后</th><th>调频</th></tr></thead>
        <tbody>${[...G1, ...G2, ...G3].map(x => `<tr><td><a href="#/p/${encodeURIComponent(x.p)}">${esc(x.p)}</a></td><td>${esc(x.tier)}</td>
          <td class="mono">${x.sure ? f0(x.sure) + ' ' + citeHTML(sourcesOf(x.p, '⑧c4')) + (x.r.useLease ? ' <span class="st ok">租赁</span>' : '') : '—'}</td>
          <td class="mono">${x.pend ? f0(x.pend) + ` <span class="st ${/征求/.test(x.pendWhy) ? 'draft' : 'trial'}">${esc(x.pendWhy)}</span>` : '—'}</td>
          <td class="mono">${x.spot != null ? f0(x.spot * RZ[1]) + `<span class="note" style="display:inline">（${f0(x.spot * RZ[0])}—${f0(x.spot * RZ[2])}）</span>` : '—'}</td>
          <td class="mono">${f0(x.cost)}</td>
          <td class="mono"><b>${f0(x.sure + x.pend + (x.spot || 0) * RZ[1] - (x.cost || 0))}</b></td>
          <td style="font-size:12.5px;color:var(--ink2)">${esc(x.r.fmTag)}</td></tr>`).join('')}</tbody></table></div></details>`;
    const draw = () => layerGroups($('#lghost'), groups, OPT);
    draw(); wireCards();
    $('#optRng').onchange = e => { OPT.rng = e.target.checked; draw(); };
    $('#optNet').onchange = e => { OPT.net = e.target.checked; draw(); };
  }

  // ---------- 省份看板：政策 － 开发 － 问题 ----------
  function item(p, m, title) {
    const f = F(p, m), meta = D.metrics[m] || {};
    const h = title || meta.short || m, tg = tagsOfMetric(m).map(tagLink).join('');
    if (isMissing(f)) return `<div class="item"><div class="h"><span>${esc(h)}</span>${tg}</div><div class="b" style="color:var(--mute)">未采集——不等于该省「无规定」</div></div>`;
    const stale = (f.staleCites || []).length ? `<span class="st stale">依据含失效件</span>` : '';
    const full = clean(f.v);
    const one = firstSentence(f.v);
    return `<div class="item"><div class="h"><span>${esc(h)}</span>${tg}${stale}</div>
      <div class="b">${citeHTML(one)}</div>
      ${PUB() ? ((f.cites || []).length ? `<details><summary>依据文件与页码</summary>${pagesLine(f)}</details>` : '')      /* 用户 10-15：对外只给结论与依据，原文摘录与过程留本地 */
        : full.length > one.length + 4 || (f.cites || []).length ? `<details><summary>展开原文摘录与依据</summary><div class="full">${citeHTML(full)}</div>${pagesLine(f)}</details>` : ''}</div>`;
  }
  function pagesLine(f) {     // 依据页码：格内已标／自动定位（溯源/引用页码.jsonl）
    const seen = new Set(), parts = [];
    (f.cites || []).forEach(c => { const k = c.code + '|' + c.page; if (seen.has(k)) return; seen.add(k);
      parts.push(`<button type="button" class="cite ${D.docs[c.code] ? statusClass(D.docs[c.code].status) : 'none'}" data-code="${c.code}">${c.code}</button>` +
        (c.page != null ? `<span class="mono"> p${c.page}</span>${!PUB() && c.how && c.how !== '格内已标' ? '<span class="note" style="display:inline"> ·' + esc(c.how) + '</span>' : ''}` : '<span class="note" style="display:inline"> 页码待定位</span>')); });
    return parts.length ? `<div class="pages"><b>依据页码</b>　${parts.join('　')}</div>` : '';
  }
  function cardHTML(p) {      // 研究线结论卡（研究站2.0/结论卡/）：结论句＋要点依据链＋可证伪点；内部研判只在内部版出现
    const k = (D.cards || {})[p];
    if (!k) return `<section class="card concl pending"><h2>研究结论</h2><div class="sub">本省结论正在核验中（研究线结论核验系列），核验后在此展示。下方为研究库原始参数。</div></section>`;
    const ev = e => `<button type="button" class="cite ${D.docs[e.编号] ? statusClass(D.docs[e.编号].status) : 'none'}" data-code="${esc(e.编号)}">${esc(e.编号)}</button>${e.页 ? `<span class="mono"> p${e.页}</span>` : ''}`;
    const pts = (k.要点 || []).map(x => `<li><span class="ty">${esc(x.类型 || '')}</span><span class="tx">${esc(x.句)}</span>
        <span class="evs">${(x.依据 || []).map(e => `<span class="ev" title="${esc(e.原句 || '')}">${ev(e)}</span>`).join('')}<span class="lk">${esc(x.链路 || '')}${x.时点 ? ' · ' + esc(x.时点) : ''}</span></span></li>`).join('');
    const warn = (k._warn || []).length ? `<div class="warn"><span>⚠</span><span>本卡判定后，依据状态有变化：${k._warn.map(w => `${esc(w.code)} ${esc(w.then)}→${esc(w.now || '库内已无')}`).join('；')}。结论待研究线重判。</span></div>` : '';
    const inner = k.内部研判 ? `<div class="inner"><span class="st none">内部</span> 投资分级 <b>${esc(k.内部研判.投资分级 || '—')}</b> · 收益确定性 <b>${esc(k.内部研判.收益确定性 || '—')}</b>${k.内部研判.与对外结论关系 ? ' · ' + esc(k.内部研判.与对外结论关系) : ''}</div>` : '';
    const v = k.核验 || {};
    return `<section class="card concl"><h2>研究结论 <small>核验 ${esc(v.批次 || '')} · ${esc(v.日期 || '')} · 库 ${esc(k.库版本 || '')}</small></h2>
      ${warn}<p class="cc">${esc(k.结论)}</p>${inner}
      <ul class="pts">${pts}</ul>
      <details><summary>什么情况下这个结论会错 · 风险与待核 · 方法</summary>
        <div class="cgrid"><div><b>可证伪点</b><ul>${(k.可证伪点 || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><b>风险与待核</b><ul>${(k.风险与待核 || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><b>方法</b><ul>${(k.方法 || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div></details></section>`;
  }
  function kpi(label, val, note) { return `<div class="kpi"><div class="k">${label}</div><div class="v">${val}</div><div class="n">${note || ''}</div></div>`; }

  async function loadContentLayer() {
    if(!contentLoad)contentLoad=(async()=>{
      try{
        let payload=window.__CONTENT_LAYER__;
        if(!payload){const response=await fetch('content/content-layer.json',{cache:'no-store'});if(!response.ok)throw Error('通知内容未取得');payload=await response.json();}
        contentLayer=EnergyContent.validate(payload);contentLoadError=false;
      }catch(error){contentLoadError=true;contentLayer={schema:1,notices:[],classifications:[],source_links:[],source_gaps:[]};}
    })();
    return contentLoad;
  }
  function contentTypeLabel(record) {
    return (EnergyContent.TYPES[record?.content_type]||'待分类资料')+(record?.subtype?' · '+record.subtype:'');
  }
  function contentCountsHTML() {
    if(contentLoadError)return '<p class="note" role="status" data-content-load-error>通知与分类暂未加载，旧资料索引仍可使用。<button type="button" data-content-retry>重试加载</button></p>';
    const c=EnergyContent.stats(contentModel);
    return `<p class="note" data-classification-stats data-notices="${c.notices}" data-important="${c.important}">已审分类范围：政策 ${c.policy} 件 · 通知共 ${c.notices} 件，其中重要通知 ${c.important} 件、未评分 ${c.unscored} 件。${replyLoadError?'答复样例暂未加载。':''}文章研报尚未逐件分类，其余 ${c.classification_pending} 条旧资料保留待分类；不代表全站分类已完成。</p>`;
  }
  function contentCardHTML(r) {
    if(r.kind==='reply')return replyCardHTML(r);
    const b=r.kind==='policy'&&!r.review_hold&&r.id!=='ZCGJ110'&&briefOf(r.id);if(b)return briefCard(b);
    const attrs=r.kind==='notice'?`data-notice-id="${esc(r.id)}"`:`data-code="${esc(r.id)}"`;
    return `<button type="button" class="bcard" ${attrs} aria-controls="analysis-workspace"><span class="meta">${esc(contentTypeLabel(r))}${r.issuer?' · '+esc(r.issuer):''}</span><span class="ttl">${esc(r.title)}</span><span class="chips">${r.status?stChip(r.review_hold?'来源待核':r.status):''}${r.importance!==null?`<span class="chip">编辑重要性 ${r.importance}级</span>`:''}</span><span class="sum">${esc(r.summary||'摘要待补；可查看现有文件索引。')}</span><span class="note">${esc(r.dateLabel)} ${esc(r.sortDate||'未确认')}</span></button>`;
  }
  function contentSourcesHTML(id) {
    const sources=contentLayer.source_links.filter(s=>s.policy_id===id),legacy=D.docs[id]?.url;
    if(!sources.length&&/^https:\/\//.test(legacy||''))return `<div class="block"><a class="btn" href="${esc(legacy)}" target="_blank" rel="noopener noreferrer" data-source-link>查看官方发布页 ↗</a></div>`;
    return sources.map(s=>`<div class="block"><a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-source-link data-source-role="${esc(s.role)}">${esc(EnergyContent.SOURCE_LABELS[s.role])} ↗</a>${!s.role.startsWith('ORIGINAL_')?'<p class="note">关联来源，不替代原文件发布页；未据此扩展政策参数核验。</p>':''}</div>`).join('');
  }
  function shareContentHTML(id) {
    const record=contentModel?.records.get(id),route=record?.content_type==='notice'?'#/notice/':'#/brief/';
    const url=new URL(location.href);url.hash=route+encodeURIComponent(id);
    return `<div class="block"><a data-share-link href="${esc(url.href)}">分享直达链接</a> · <button type="button" class="dim" data-copy-content="${esc(url.href)}">复制链接</button><span data-share-status role="status"></span></div>`;
  }
  function noticeAnalysisHTML(n) {
    return `<div class="shead"><span class="reply-type">通知 · ${esc(n.subtype)}</span><h2 id="analysis-title" tabindex="-1">${esc(n.title)}</h2><p>${esc(n.issuer)} · 编辑重要性 ${n.importance}级</p><p class="note">${esc(n.importance_reason)}</p><div class="dates"><span>事件：<b>${esc(n.event_at)}</b></span><span>署名日期：${esc(n.issued_at)}</span><span>该页公开：${esc(n.published_at)}</span><span>最早首发：${esc(n.first_publication_date||'未确认')}</span></div><p class="note">${esc(n.publication_date_basis)}</p><p class="summary">${esc(n.summary)}</p></div>
      <div class="sbody"><section class="block"><h3>我们的分析</h3><p>${esc(n.our_analysis)}</p><p class="analysis-boundary">${esc(n.boundary)}</p><p>${esc(n.region_scope)}</p></section><section class="block"><h3>依据原文</h3><blockquote>${esc(n.quote)}</blockquote><a class="btn" data-notice-source href="${esc(n.source_url)}" target="_blank" rel="noopener noreferrer">交易中心署名公告原页 ↗</a><p class="note">${esc(n.source_access_note)}</p><a data-notice-corroboration href="${esc(n.corroborating_url)}" target="_blank" rel="noopener noreferrer">能源局事件佐证 ↗</a></section><section class="block"><h3>公告所引文件</h3><p>${esc(n.cited_document_number)}：${esc(n.cited_document_verification)}</p><p>没有已审的正式参数或省网区映射，不据此广播到各省或收益工具。</p></section>${shareContentHTML(n.id)}</div>`;
  }
  function noticePage(id) {
    libPage('type=notice');const r=contentModel.records.get(id);
    if(r?.review_hold){showInlineAnalysis('policy',id,{scroll:true,push:false});return;}
    if(!r||r.content_type!=='notice'){$('#analysis-workspace').hidden=false;$('#analysis-workspace').innerHTML=`<p role="status">${contentLoadError?'通知内容暂未加载，请使用上方重试。':'当前没有可公开直达的该通知。'}</p>`;return;}
    showInlineAnalysis(r.kind,id,{scroll:true,push:false});
  }
  function loadReplyInsights() {
    if(!replyLoad)replyLoad=(async()=>{
      try{
        const payload=window.__REPLY_INSIGHTS__||await(await fetch('content/reply-insights.json')).json();
        if(payload.schema!==1||!Array.isArray(payload.items))throw Error('答复清单格式不符');
        replyItems=payload.items;
      }catch(error){replyLoadError=true;replyItems=[];}
    })();
    return replyLoad;
  }
  function relatedReplyBlock(code){const rows=replyItems.filter(r=>r.policy_ids.includes(code));return rows.length?`<section class="block related-replies"><h3>相关答复与官方解释</h3>${rows.map(replyCardHTML).join('')}</section>`:'';}
  function replyCardHTML(r) {
    return `<button type="button" class="reply-card" aria-controls="analysis-workspace" data-reply-id="${esc(r.id)}"><span class="reply-type">${esc(r.source_kind)} · ${esc(r.issuer)}</span><h3>${esc(r.title)}</h3><span class="reply-date">答复落款 ${esc(r.reply_issued_at)}</span><p>${esc(r.summary)}</p><span class="note">${esc(r.boundary)}</span><span class="reply-action">${tx('在本页阅读答复','Read in this workspace')} →</span></button>`;
  }
  function replyAnalysisHTML(r) {
    const flags=[['source_verified','答复原文'],['cited_policies_verified','援引政策'],['project_applicability_verified','项目适用']];
    return `<div class="shead"><span class="reply-type">${esc(r.source_kind)} · 官方答复与研究解释</span><h2 id="analysis-title" tabindex="-1">${esc(r.title)}</h2><p>${esc(r.reply_title)} · ${esc(r.reply_number)}</p><div class="dates"><span>答复落款 <b>${esc(r.reply_issued_at)}</b></span><span>官网当前标注 ${esc(r.official_page_publishdate||'未确认')}</span><span>最早公开日 ${esc(r.first_publication_date||'未确认')}</span></div><p class="summary">${esc(r.summary)}</p></div><div class="sbody"><section class="block"><h3>我们的分析</h3><p>${esc(r.our_analysis)}</p><p class="analysis-boundary">${esc(r.boundary)}</p><p>${esc(r.region_scope)}</p></section><section class="block"><h3>依据原文</h3><blockquote>${esc(r.quote)}</blockquote><p>${esc(r.source_anchor)}</p><a class="btn" data-reply-source href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">查看官方原网页 ↗</a></section><section class="block"><h3>分别核验</h3><div class="reply-checks">${flags.map(([key,label])=>`<span>${label}：${r.evidence_checks[key]?'已核':'未核'}</span>`).join('')}</div><p class="note">${esc(r.evidence_check_scope)}</p></section><section class="block"><h3>关联政策分析</h3>${r.policy_ids.length?r.policy_ids.map(code=>`<button type="button" class="analysis-policy-link" data-code="${esc(code)}">${esc(D.docs[code]?.title||'查看关联政策分析')} →</button>`).join(''):'<p class="note">暂无已审定的具体政策映射；不能据此判断不存在相关规则。</p>'}</section></div>`;
  }
  function analysisWorkspaceHTML(province='') {
    return `<section id="analysis-workspace" class="inline-analysis" data-province="${esc(province)}" role="region" aria-label="${tx('本页分析工作区','Analysis workspace')}" hidden></section>`;
  }
  function renderInlineAnalysis() {
    const panel=document.querySelector('#analysis-workspace'),current=inlineAnalysis.current;
    if(!panel||!current)return;
    tip.hidden=true; // Replacing the hovered source node does not dispatch mouseout.
    let content;
    if(current.kind==='notice'){
      const n=contentLayer.notices.find(n=>n.id===current.id);if(!n)return;content=noticeAnalysisHTML(n);
    }else if(current.kind==='reply'){
      const r=replyItems.find(r=>r.id===current.id);if(!r)return;
      content=replyAnalysisHTML(r)+shareContentHTML(r.id);
    }else{
      if(!D.docs[current.id])return;
      const wrap=document.createElement('div');wrap.innerHTML=sheetHTML(current.id,current.hitAt);
      wrap.querySelector('#bsClose')?.remove();const heading=wrap.querySelector('#bsH');heading.id='analysis-title';heading.tabIndex=-1;
      content=wrap.innerHTML;
    }
    const province=panel.dataset.province;
    panel.hidden=false;panel.dataset.kind=current.kind;panel.dataset.selected=current.id;
    panel.innerHTML=`<div class="analysis-toolbar"><span>${esc(province||tx('研究分析','Research analysis'))} · ${esc(contentTypeLabel(contentModel?.records.get(current.id)))}</span><div><button type="button" data-analysis-back>${inlineAnalysis.history.length?tx('返回上一项','Previous item'):tx('返回列表','Return to list')}</button><button type="button" data-analysis-close>${tx('收起分析','Collapse')}</button></div></div>${content}`;
  }
  function refreshInlineAnalysis(){if(inlineAnalysis.route===decodeURIComponent(location.hash||'#/')&&document.querySelector('#analysis-workspace'))renderInlineAnalysis();}
  function showInlineAnalysis(kind,id,options={}) {
    if((kind==='policy'&&!D.docs[id])||(kind==='reply'&&!replyItems.some(r=>r.id===id))||(kind==='notice'&&!contentLayer.notices.some(n=>n.id===id)))return;
    let panel=document.querySelector('#analysis-workspace');
    if(!panel){
      const hero=document.querySelector('#app>.hero,#app>.studio-hero');
      if(hero)hero.insertAdjacentHTML('afterend',analysisWorkspaceHTML());else $('#app').insertAdjacentHTML('afterbegin',analysisWorkspaceHTML());
      panel=document.querySelector('#analysis-workspace');
    }
    if(!panel)return;
    const route=decodeURIComponent(location.hash||'#/');
    if(inlineAnalysis.route!==route){Object.assign(inlineAnalysis,{route,current:null,history:[],origin:null});}
    const opener=options.opener||document.activeElement,inside=opener?.closest?.('#analysis-workspace'),dialog=document.querySelector('#bsheet');
    if(opener?.closest?.('#bsheet')&&dialog?.open&&D.docs[dialog.dataset.policyCode]){inlineAnalysis.history=[{kind:'policy',id:dialog.dataset.policyCode,y:scrollY}];inlineAnalysis.origin={y:scrollY,opener:bsOpener};}
    else if(options.opener&&!inside){inlineAnalysis.history=[];inlineAnalysis.origin={y:scrollY,opener};}
    else if(inlineAnalysis.current&&options.push!==false)inlineAnalysis.history.push({...inlineAnalysis.current,y:scrollY});
    inlineAnalysis.current={kind,id,hitAt:options.hitAt||null};
    document.querySelector('#bsheet')?.close();renderInlineAnalysis();
    if(options.scroll!==false){panel.style.scrollMarginTop=((document.querySelector('.top')?.getBoundingClientRect().height||74)+16)+'px';panel.scrollIntoView({block:'start',behavior:'instant'});panel.querySelector('#analysis-title')?.focus({preventScroll:true});}
  }
  function panelFocus(){document.querySelector('#analysis-workspace #analysis-title')?.focus({preventScroll:true});}
  function closeInlineAnalysis(back=false) {
    tip.hidden=true;
    if(back&&inlineAnalysis.history.length){const previous=inlineAnalysis.history.pop();inlineAnalysis.current=previous;renderInlineAnalysis();panelFocus();scrollTo(0,previous.y);return;}
    const panel=document.querySelector('#analysis-workspace'),origin=inlineAnalysis.origin;
    if(panel)panel.hidden=true;inlineAnalysis.current=null;inlineAnalysis.history=[];
    if(origin){scrollTo(0,origin.y);if(origin.opener?.isConnected)origin.opener.focus({preventScroll:true});}
  }
  document.addEventListener('click',event=>{
    const notice=event.target.closest('[data-notice-id]');if(notice){event.preventDefault();showInlineAnalysis('notice',notice.dataset.noticeId,{opener:notice});return;}
    const retry=event.target.closest('[data-content-retry]');if(retry){contentLoad=null;loadContentLayer().then(()=>{contentModel=EnergyContent.create(D,contentLayer,replyItems);route();});return;}
    const copy=event.target.closest('[data-copy-content]');if(copy){const status=copy.parentElement.querySelector('[data-share-status]');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(copy.dataset.copyContent).then(()=>status.textContent=' 已复制').catch(()=>status.textContent=' 无法自动复制，请复制上方链接地址。');else status.textContent=' 请复制上方链接地址。';return;}
    const reply=event.target.closest('[data-reply-id]');
    if(reply){event.preventDefault();showInlineAnalysis('reply',reply.dataset.replyId,{opener:reply});return;}
    if(event.target.closest('[data-analysis-back]'))closeInlineAnalysis(true);
    else if(event.target.closest('[data-analysis-close]'))closeInlineAnalysis();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.closest('#analysis-workspace')){event.preventDefault();closeInlineAnalysis(true);}});
  function provincePolicyRows(p) {
    return (D.lib||[]).filter(row=>row[5]===p).sort((a,b)=>String(D.docs[b[0]]?.published||b[4]||'').localeCompare(String(D.docs[a[0]]?.published||a[4]||'')));
  }
  function provincePolicyIndexHTML(p) {
    const rows=provincePolicyRows(p);
    return `<div class="province-policy-index"><h3>${tx('本省政策分析','Policy analysis')}</h3><label>${tx('在本省政策中查找','Find a policy in this region')}<input id="province-policy-query" type="search" placeholder="${tx('政策名称、文号或关键词','Title, document number or keyword')}"></label><div id="province-policy-results"></div></div>`;
  }
  function wireProvincePolicyIndex(p) {
    const input=document.querySelector('#province-policy-query');if(!input)return;
    const render=()=>{const q=input.value.trim().toLowerCase(),rows=provincePolicyRows(p).filter(row=>JSON.stringify(row).toLowerCase().includes(q));
      document.querySelector('#province-policy-results').innerHTML=`<p class="note">${rows.length} ${tx('项，显示前8项','results; showing up to 8')}</p>${rows.slice(0,8).map(row=>`<button type="button" data-code="${esc(row[0])}" aria-controls="analysis-workspace" class="analysis-policy-link">${esc(D.docs[row[0]]?.title||row[1])}<small>${esc(D.docs[row[0]]?.status||row[3])} · ${esc(D.docs[row[0]]?.date||row[4]||'')}</small></button>`).join('')||'<p class="note">当前筛选未找到条目，不代表没有规定。</p>'}`;};
    input.addEventListener('input',render);render();
  }
  async function populateProvinceReplies(p) {
    await loadReplyInsights();
    const box=document.querySelector('[data-province-replies]');if(!box||box.dataset.provinceReplies!==p)return;
    const rows=EnergyContent.query(contentModel,{type:'notice'}).filter(r=>r.verified_region_codes?.includes(p)||r.province===p);
    box.innerHTML=rows.map(contentCardHTML).join('')||`<p class="note">${replyLoadError||contentLoadError?'通知或答复暂未加载，请稍后重试。':'当前暂无已审定的本省通知；全国或区域背景材料不广播到全部省份。'}</p>`;
    refreshInlineAnalysis();
  }
  function province(p) {
    const app = $('#app');
    if (!D.provinces[p]) { app.innerHTML = `<p>未找到「${esc(p)}」。</p>`; return; }
    const kw = isKW(p), cap = N(p, '⑧c4'), hrs = N(p, '⑧c6');
    const c2 = gradeOf(p);
    const pg = ((D.score || {}).rows || []).find(x => x.主体 === p);
    const chips = [...(pg ? [['投资分级（公开方法）', `${pg.档位} · ${pg.总分} 分`]] : []), ...(PUB() ? [] : [['内部综合分级', c2]]), ['收益确定性', (clean(V(p, '⑧c3')) || '未评').split(/[（(〔]/)[0]], ['现货阶段', stageOf(p)], ['清单制', listOf(p)], ['充电费用', chargeOf(p)],
      ['退坡风险', (V(p, '⑧c35').match(/^[^｜|（(\s]+/) || ['—'])[0]], ['容量政策', V(p, '⑧c8') || '—']];
    const stales = [...new Set(Object.values(D.provinces[p]).flatMap(f => f.staleCites || []))];
    const jibei = D.provinces['河北·冀北'];
    app.innerHTML = `
      <div class="crumb"><a href="#/map">${PUB() ? '政策地图' : '投资分级地图'}</a> / 省份看板</div>
      <section class="hero"><div><div class="eyebrow">电网侧独立储能 · 省份看板</div><h1>${esc(p)}</h1>
        <div class="chips">${chips.map(([k, v]) => `<span class="chip">${k}　<b>${esc(v)}</b></span>`).join('')}</div></div></section>
      <section class="kpis">
        ${kpi('容量机制', cap != null && cap !== 0 ? `${cap}` : '—', esc(capUnit(p) || '无省级容量补偿或未采集'))}
        ${kpi('折算基准时长', hrs ? hrs + ' h' : '—', '本省最长净负荷高峰持续时长')}
        ${kpi('4 小时实得单价', kw && N(p, '⑧c11') != null ? Math.round(N(p, '⑧c11')) : '—', kw ? `保守口径 ${N(p, '⑧c56') != null ? Math.round(N(p, '⑧c56')) : '—'}（扣厂用电）· 元/kW·年` : '不按千瓦·年计，见下方说明')}
        ${PUB() ? kpi('容量政策状态', esc(capPolicy(p) === '已出台' ? '已出台' : capPolicy(p) === '征求意见稿' ? '征求稿' : '—'), esc(first1(p, '⑧c8').slice(0, 40))) : kpi('标杆项目容量收益', N(p, '⑧c12') != null ? Math.round(N(p, '⑧c12')).toLocaleString() : '—', `万元/年（200MW/800MWh）· 保守 ${N(p, '⑧c57') != null ? Math.round(N(p, '⑧c57')).toLocaleString() : '—'}`)}
      </section>
      ${cardHTML(p)}
      <section class="card"><h2>容量收益计算器</h2><div class="sub">拖动储能时长，看折算后能拿到多少；容量电价与容量租赁只能二选一${PUB() ? '' : '（JL444）'}。</div>
        <div class="calc" style="margin-top:14px" id="calc"></div></section>
      ${stales.length ? `<div class="warn"><span>⚠</span><span>本省有 ${stales.length} 份依据文件已失效，相关格待跟改：${stales.map(c => `<button type="button" class="cite stale" data-code="${c}">${c}</button>`).join(' ')}</span></div>` : ''}
      <section class="board province-board">
        <div class="card col" data-province-module="policy"><h2>${tx('政策','Policy')} <small>${tx('现在怎么规定','Applicable rules')}</small></h2>
          ${item(p, '②c6', '容量补偿')}${item(p, '②c3', '电力现货')}${item(p, '②c4', '调频补偿')}${item(p, '②c9', '充电电费减免')}${item(p, '②c10', '容量租赁')}${item(p, '②c12', '容量电价考核')}
          ${provincePolicyIndexHTML(p)}
          ${jibei && p === '河北' ? `<div class="todo">河北分冀南、冀北两张网。上面为冀南；冀北容量补偿：${citeHTML(firstSentence((jibei['②c6'] || {}).v || '未采集'))}</div>` : ''}</div>
        <div class="card col" data-province-module="development"><h2>${tx('开发','Development')} <small>${tx('能不能做、怎么进','Eligibility & entry')}</small></h2>
          ${(D.dev || {})[p] ? devHTML(p) : `${item(p, '②c17', '清单制')}${item(p, '②c16', '现货报价方式')}${item(p, '⑧c31', '现行标准生效／到期')}${item(p, '⑧c34', '下次调整窗口')}${item(p, '⑧c32', '调整机制')}${item(p, '⑧c33', '历史退坡轨迹')}
          <div class="todo">申报窗口、门槛与股权锁定期：专题汇编中${PUB() ? '' : '（T623）'}，完成后在此显示。</div>`}</div>
        <div class="card col" data-province-module="questions"><h2>${tx('问题','Questions')} <small>${tx('风险与待核','Risks & open questions')}</small></h2>
          ${PUB() ? riskFromCard(p) + item(p, '⑧c35', '退坡·并轨风险') + item(p, '⑧c53', '节点价差')
                  : item(p, '⑧c26', '风险与注意事项') + item(p, '⑧c24', '校核结论') + item(p, '⑧c30', '测算局限') + item(p, '⑧c53', '节点价差')}
          ${missingList(p)}</div>
        <div class="card col" data-province-module="notices"><h2>${tx('通知（含答复）','Notices & replies')} <small>${tx('官方信息与研究线索','Official information & context')}</small></h2><div data-province-replies="${esc(p)}"><p class="note">正在读取已审通知。</p></div></div>
      </section>${analysisWorkspaceHTML(p)}`;
    drawCalc(p);wireProvincePolicyIndex(p);
    const first=provincePolicyRows(p)[0];if(first)showInlineAnalysis('policy',first[0],{scroll:false,push:false});
    populateProvinceReplies(p);
  }
  const DEVK = [['K1', '清单制'], ['K2', '申报窗口'], ['K3', '准入门槛'], ['K4', '建设时限'], ['K5', '股权与投资主体锁定'], ['K6', '调出清单情形'], ['K7', '建设规模指标']];
  function devHTML(p) {       // 开发栏「怎么进」（补厚计划 B1；研究线取证 收件箱/开发栏取证/开发栏取证.jsonl）
    const x = D.dev[p];
    return DEVK.map(([k, t]) => { const e = x[k];
      if (!e || !e.值) return `<div class="item"><div class="h"><span>${t}</span></div><div class="b" style="color:var(--mute)">未采集——不等于该省「无规定」</div></div>`;
      if (e.核验中 || e.待补) return `<div class="item"><div class="h"><span>${t}</span><span class="st draft">核验中</span></div><div class="b" style="color:var(--mute)">${PUB() ? '依据正在补核，核实后显示' : esc(e.值)}</div></div>`;
      const ev = (e.依据 || []).map(d => `<button type="button" class="cite ${D.docs[d.编号] ? statusClass(D.docs[d.编号].status) : 'none'}" data-code="${esc(d.编号)}" title="${esc(d.原句 || '')}">${esc(d.编号)}</button>${d.页 ? `<span class="mono"> p${d.页}</span>` : ''}`).join(' ');
      return `<div class="item"><div class="h"><span>${t}</span></div><div class="b">${esc(e.值)}</div>
        ${(e.例外 || []).length ? `<div class="note">例外通道：${e.例外.map(esc).join('；')}</div>` : ''}${ev ? `<div class="pages">${ev}</div>` : ''}</div>`; }).join('')
      + (!PUB() && (x.线索 || x.备注) ? `<details class="item"><summary>线索与备注（内部）</summary><div class="full">${esc(JSON.stringify(x.线索 || '', null, 1)).slice(0, 2000)}${x.备注 ? '<br>' + esc(typeof x.备注 === 'string' ? x.备注 : JSON.stringify(x.备注)) : ''}</div></details>` : '');
  }
  function riskFromCard(p) {   // 对外版「问题」栏读研究线结论卡的风险与待核、可证伪点
    const k = (D.cards || {})[p];
    if (!k) return `<div class="item"><div class="h"><span>风险与待核</span></div><div class="b" style="color:var(--mute)">本省结论正在核验中，核验后在此显示。</div></div>`;
    const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
    return `<div class="item"><div class="h"><span>风险与待核</span></div><ul class="b" style="padding-left:18px;margin:4px 0">${li(k.风险与待核)}</ul></div>
      <div class="item"><div class="h"><span>什么情况下结论会变</span></div><ul class="b" style="padding-left:18px;margin:4px 0">${li(k.可证伪点)}</ul></div>`;
  }
  function missingList(p) {
    const miss = ['⑧c7', '⑧c13', '⑧c16', '⑧c17', '⑧c36', '⑧c38', '⑧c44'].filter(m => !PUB() || !['⑧c36', '⑧c38'].includes(m)).filter(m => isMissing(F(p, m)) || (m === '⑧c7' && N(p, m) === 0));
    if (!miss.length) return '';
    if(PUB())return `<div class="item"><div class="h"><span>适用条件提醒</span></div><p>用于实际项目之前，仍须另核资格、执行期间、计量与完整费用口径。</p></div>`;
    return `<div class="item"><div class="h"><span>尚未采集的参数</span></div><div class="b" style="color:var(--ink2)">${miss.map(m => esc((D.metrics[m] || {}).short || m)).join('、')}</div>
      <div class="note">未采集＝库里还没有这项数据，不代表政策没有规定。</div></div>`;
  }

  function drawCalc(p) {
    const box = $('#calc'), kw = isKW(p), cap = N(p, '⑧c4'), base = N(p, '⑧c6');
    const own = N(p, '⑧c7');
    const C = { h: 4, cons: false, mode: 'cap' };
    const render = () => {
      const r = C.cons ? (own && own > 0 ? own : 0.05) : 0;
      const lease = N(p, '⑧c16');
      let main, formula;
      if (C.mode === 'lease') {
        main = lease != null ? `${Math.round(lease)}` : '—';
        formula = lease != null ? `容量租赁参考单价 ${lease} 元/kW·年（${citeHTML(sourcesOf(p, '⑧c16'))}）。选租赁则不得再拿容量电价。` : '本省容量租赁单价未采集——不等于没有租赁收益。';
      } else if (!kw || cap == null || !cap) {
        main = '—';
        formula = cap ? `本省按 <b>${esc(capUnit(p))}</b> 补偿，不按时长折算，计算器不适用。依据：${citeHTML(sourcesOf(p, '⑧c4'))}` : '本省暂无省级容量电价或尚未采集。';
      } else if (!base) {
        main = `≤ ${Math.round(cap * (1 - r))}`;
        formula = `本省折算基准时长未明确，按全额计为<b>上限</b>：${cap} × (1 − ${(r * 100).toFixed(1)}%)。依据：${citeHTML(sourcesOf(p, '⑧c4'))}`;
      } else {
        const k = Math.min(1, C.h / base);
        main = `${Math.round(cap * k * (1 - r))}`;
        formula = `${cap}（基数）× min(1, ${C.h} ÷ ${base}) = ${cap} × ${(k * 100).toFixed(0)}%` + (r ? ` × (1 − ${(r * 100).toFixed(1)}% 厂用电)` : '') +
          `<br>基数与时长依据：${citeHTML(sourcesOf(p, '⑧c4'))}　状态：<span class="st ${statusClass(V(p, '⑧c8'))}">${esc(V(p, '⑧c8') || '—')}</span>`;
      }
      box.innerHTML = `<div>
          <label for="hr" style="font-size:13px;color:var(--mute)">储能时长：<b class="mono" style="color:var(--ink)">${C.h} 小时</b></label>
          <input id="hr" class="range" type="range" min="1" max="10" step="1" value="${C.h}">
          <div style="margin-top:12px"><span class="seg" id="mode"><button data-v="cap" class="${C.mode === 'cap' ? 'on' : ''}">容量电价</button><button data-v="lease" class="${C.mode === 'lease' ? 'on' : ''}">容量租赁</button></span>
          <label style="margin-left:14px;font-size:13px;color:var(--ink2)"><input type="checkbox" id="cons" ${C.cons ? 'checked' : ''}> 保守口径（扣厂用电${own && own > 0 ? ' ' + (own * 100).toFixed(2) + '%' : '，本省未采集按 5%'}）</label></div>
          <div class="note">二选一：享受容量电价的项目不得再出租容量（${PUB() ? '' : 'JL444；'}如安徽、吉林、湖北有明文）。</div></div>
        <div><div style="font-size:13px;color:var(--mute)">${C.mode === 'lease' ? '容量租赁单价' : '实得容量单价'}（元/kW·年）</div>
          <div class="out">${main}</div><div class="formula">${formula}</div></div>`;
      $('#hr').oninput = e => { C.h = +e.target.value; render(); };
      $('#cons').onchange = e => { C.cons = e.target.checked; render(); };
      $('#mode').onclick = e => { const b = e.target.closest('button'); if (b) { C.mode = b.dataset.v; render(); } };
    };
    render();
  }
  function sourcesOf(p, m) {
    const f = F(p, m) || {}, codes = [...new Set((f.cites || []).map(c => c.code))];
    const v9 = V(p, '⑧c9');
    const extra = (v9.match(/【[^】]+】/g) || []);
    return codes.length ? codes.map(c => `【${c}】`).join('') : (extra.join('') || '格内无编号引用');
  }

  // ---------- 示例测算（补厚计划 C2；研究线 示例测算/示例_v1.jsonl，数字原样读取、不另算） ----------
  const EX = { cfg: '200MW/800MWh' };
  function examplePage(o = {}) {
    const REV = !!o.rev, CFG = EX.cfg;   // 用户 10-15：收益构成全景与示例测算合并为一页，全景页也可切 2h/4h
    const all = D.example.rows || [];
    const rows = all.filter(r => r.配置 === CFG);
    const capacityMW = Number((CFG.match(/^(\d+(?:\.\d+)?)MW\//) || [])[1]);
    const energyMWh = Number((CFG.match(/\/(\d+(?:\.\d+)?)MWh$/) || [])[1]);
    const hours = capacityMW > 0 ? energyMWh / capacityMW : null;
    const K = capacityMW / 10, f0 = v => Number.isFinite(v) ? Math.round(v).toLocaleString() : '—', k = v => Number.isFinite(v) && K > 0 ? v / K : null;
    const rTot = r => r.收入小计 !== undefined ? r.收入小计 : r.政策收益合计;      // v2 起合计拆成「收入小计」和「扣过网成本后」
    const V2 = (D.example.n || 1) >= 2;
    const SHOW_NET = V2 && hours <= 4;
    const layer = r => {                          // 政策确定／政策待定（征求稿、未来执行、仅存量）／市场
      const useLease = r.二选一采用 === '容量租赁', mktLease = useLease && /市场成交/.test(r.容量租赁标注 || '');   // 宁夏租赁价为市场成交价（二手）→ 市场层
      const capv = useLease ? (mktLease ? null : r.容量租赁) : r.容量收益;
      const fut = !useLease && /起执行/.test(r.机制 || ''), draft = !useLease && /征求/.test(r.容量收益标注 || '');
      const unsrc = useLease && /出处待查/.test(r.容量租赁标注 || '');   // 研究线 10-14：云南调节容量参考价——政策机制托底（【ZCYN08】p2），数值出处待查 → 政策待定
      const sure = capv != null && !fut && !draft && !unsrc ? capv : 0;
      const pend = capv != null && (fut || draft || unsrc) ? capv : 0;
      const why = unsrc ? '调节容量市场参考价（政策机制），数值出处待查' : draft ? (r.容量收益标注 || '征求稿') : fut ? (r.机制 || '').replace('已出台·', '') : /仅存量/.test(r.容量收益标注 || '') ? '仅存量项目适用·新建项目不计' : '';
      return { sure, pend, why, capv, spot: (r.现货套利 || 0) + (mktLease ? r.容量租赁 : 0) || null, rng: r.现货区间 && mktLease ? [r.现货区间[0] + r.容量租赁, r.现货区间[1] + r.容量租赁] : r.现货区间, mktLease };
    };
    const L = rows.map(r => ({ r, ...layer(r) })).sort((a, b) => (b.sure - a.sure) || (b.pend - a.pend) || ((rTot(b.r) || 0) - (rTot(a.r) || 0)));
    const md = (D.example.method || '').split('\n').map(l => /^## /.test(l) ? `<h3>${esc(l.slice(3))}</h3>` : /^# /.test(l) ? '' : /^\|\s*-/.test(l) ? '' : /^\|/.test(l) ? `<div class="mdrow">${l.split('|').slice(1, -1).map(c => `<span>${esc(c.trim()).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</span>`).join('')}</div>` : /^\d+\. /.test(l) ? `<li>${esc(l.replace(/^\d+\. /, '')).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</li>` : l.trim() ? `<p>${esc(l).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</p>` : '').join('');
    const EXPIRE = { 河北: '2026-12-31', 湖北: '2027-02-01' };       // 研究线 10-14：容量电价窗口剩余不足 1 年
    const tipOf = x => { const r = x.r; return `<b>${esc(r.主体)}</b>　${esc(r.机制 || '')}${REV && pgradeOf(r.主体) && pgradeOf(r.主体) !== '未评' ? '　公开分级 ' + esc(pgradeOf(r.主体)) : ''}${EXPIRE[r.主体] ? '<br>　容量电价窗口到 ' + EXPIRE[r.主体] + '（剩余不足 1 年）' : ''}<br>政策确定 ${f0(k(x.sure))}${x.pend ? '<br>政策待定 ' + f0(k(x.pend)) + '　' + esc(x.why) : ''}<br>现货 ${f0(k(r.现货套利))}（${esc(r.现货标注 || '')}）${x.mktLease ? '<br>　含容量租赁 ' + f0(k(r.容量租赁)) + '：' + esc(r.容量租赁标注 || '') : ''}<br><b>${V2 ? '收入小计' : '政策收益合计'} ${f0(k(rTot(r)))}</b> 元/千瓦·年${V2 && r.过网成本 != null ? '<br>过网成本 −' + f0(k(r.过网成本)) + '：' + Object.entries(r.过网成本构成 || {}).filter(e => e[1]).map(e => e[0] + ' ' + f0(k(e[1]))).join('、') + '<br>　' + esc((r.过网成本口径 || '').split('（')[0]) + (r.过网成本备注 ? '<br>　' + esc(r.过网成本备注) : '') + '<br><b style="color:#FFB4AC">扣过网成本后 ' + f0(k(r.扣过网成本后)) + '</b>' : ''}<br><span style="color:#B9BEC7">项目 ${f0(rTot(r))} 万元/年｜点击看省份</span>`; };
    const rowOf = x => { const base = k(x.sure + x.pend), m = k(x.spot || 0);
      return { n: x.r.主体, sure: k(x.sure), pend: k(x.pend), mkt: m, lo: x.rng ? base + k(x.rng[0]) : null, hi: x.rng ? base + k(x.rng[1]) : null,
        tot: rTot(x.r) != null ? k(rTot(x.r)) : null, net: V2 && !x.r.合计说明 && x.r.过网成本 != null && x.r.扣过网成本后 != null ? k(x.r.扣过网成本后) : null,   /* 6、8 小时不含现货：充电成本对应的套利收入未计，不画扣后 */ /* 过网成本未算的（如蒙东）不画扣后 */ tip: tipOf(x), href: '#/p/' + encodeURIComponent(x.r.主体) }; };
    const G1 = L.filter(x => x.sure > 0), G2 = L.filter(x => !x.sure && x.pend > 0), G3 = L.filter(x => !x.sure && !x.pend && x.spot), G4 = L.filter(x => !x.sure && !x.pend && !x.spot);
    const groups = [
      { id: 'a', t: '有现行容量收入', d: '<b>深色</b>＝容量收益或容量租赁（二选一取采用项），<b>浅色</b>＝现货套利（实现率 0.70）；条末数字＝' + (V2 ? '收入小计，红色箭头后＝扣过网成本后。' : '政策收益合计。'), rows: G1.map(rowOf) },
      { id: 'b', t: '容量收入待定', d: '斜纹段＝未来起执行或参考价出处待查的容量收入，悬停看原因。', rows: G2.map(rowOf) },
      { id: 'c', t: '只有市场收入', d: '容量项未出台、征求稿未照算或无法折算，只算现货；现货为量级参考。' + (G3.some(x => x.mktLease) ? `${esc(G3.filter(x => x.mktLease).map(x => x.r.主体).join('、'))}含容量租赁的市场成交价（非政策价）。` : ''), rows: G3.map(rowOf) }
    ];
    const tot = xs => rangeOf(xs.map(x => k(rTot(x.r))), ' 元/千瓦·年');
    // v2 发现（研究线 口径_v2 第四节）：系统运行费是过网成本最大项；扣完为负的省份——从数据算，不手写
    const neg = L.filter(x => !x.r.合计说明 && x.r.过网成本 != null && x.r.扣过网成本后 != null && x.r.扣过网成本后 < 0).sort((a, b) => a.r.扣过网成本后 - b.r.扣过网成本后).map(x => x.r.主体);
    const big = L.filter(x => x.r.过网成本构成 && x.r.过网成本).map(x => x.r.过网成本构成.系统运行费 / x.r.过网成本).filter(v => v > 0);   // 系统运行费为 0 的（北京，待研究线核）不计
    const insight = SHOW_NET && big.length ? `<div class="insight"><b>过网成本：</b>114 号文后，<b>系统运行费</b>是储能充电侧最大的成本项（${big.length} 省占过网成本 ${Math.round(Math.min(...big) * 100)}%—${Math.round(Math.max(...big) * 100)}%）；${neg.length ? `<b>${esc(neg.join('、'))}</b> 扣完过网成本后为负——单靠现货套利覆盖不了充电侧成本。` : ''}</div>` : '';
    const drafts = L.filter(x => /征求/.test(x.r.容量收益标注 || '') && !x.mktLease).map(x => x.r.主体);   // 宁夏补偿为征求稿但示例采用市场租赁价，另写（研究线 10-14）
    const mktL = L.filter(x => x.mktLease).map(x => x.r.主体);
    const futs = G2.filter(x => /起执行/.test(x.why)).map(x => x.r.主体 + ' ' + ((x.why.match(/20\d\d/) || [''])[0]));
    const hero = REV ? `<section class="hero"><div><div class="eyebrow">电网侧独立储能 · 收益构成全景 · ${hours ?? '—'} 小时项目 · 示例测算口径 v${D.example.n}</div>
        <h1>${G1.length} 个省区有已生效、新项目可拿的容量收入；${G3.length} 个省区只有市场收入</h1>
        <p class="lede">${futs.length ? '另有' + esc(futs.join('、')) + ' 年起执行；' : ''}${drafts.length ? esc(drafts.join('、')) + ' 的容量补偿只有征求稿、未照算；' : ''}${mktL.length ? esc(mktL.join('、')) + ' 容量补偿为征求稿，示例采用 2025 年市场租赁价；' : ''}${L.some(x => /未能折算/.test(x.r.容量收益标注 || '')) ? esc(L.filter(x => /未能折算/.test(x.r.容量收益标注 || '')).map(x => x.r.主体).join('、')) + ' 为市场化容量补偿、无法折算；' : ''}按「收入稳不稳」分三组，红色箭头后是扣掉充电过网成本后的数。<b>示例测算·不构成投资建议</b>；线损购电价按 0.30 元/千瓦时量级假设。</p></div>
        <div class="controls"><span class="seg" id="cfgseg"><button data-v="200MW/400MWh">2 小时</button><button data-v="200MW/800MWh">4 小时</button><button data-v="200MW/1200MWh">6 小时</button><button data-v="200MW/1600MWh">8 小时</button></span></div></section>`
      : `<section class="hero"><div><div class="eyebrow">示例测算 · 口径 v${D.example.n || 1} · <span class="st draft">待用户过目，未对外</span></div>
        <h1>一座 ${CFG} 储能，按现行政策一年能拿多少</h1>
        <p class="lede"><b>示例测算·不构成投资建议。</b>只算政策收益与现货量级，不算投资回报率。${V2 ? '过网成本按 114 号文口径逐省计算（线损购电价按 0.30 元/千瓦时量级<b>假设</b>）。' : '过网成本待按 114 号文复核，本版不计入。'}</p></div>
        <div class="controls"><span class="seg" id="cfgseg"><button data-v="200MW/400MWh">2 小时</button><button data-v="200MW/800MWh">4 小时</button><button data-v="200MW/1200MWh">6 小时</button><button data-v="200MW/1600MWh">8 小时</button></span></div></section>`;
    $('#app').innerHTML = `${hero}
      ${sumCards([
        { id: 'a', k: '有现行容量收入', v: G1.length, n: nameList(G1.map(x => x.r.主体)), x: (V2 ? '收入 ' : '合计 ') + tot(G1) },
        { id: 'b', k: '容量收入待定', v: G2.length, n: nameList(G2.map(x => x.r.主体)), x: esc([...new Set(G2.map(x => /出处待查/.test(x.why) ? '参考价出处待查' : /起执行/.test(x.why) ? '未来起执行' : /征求/.test(x.why) ? '征求稿' : '待定'))].join('、')) },
        { id: 'c', k: '只有市场收入', v: G3.length, n: nameList(G3.map(x => x.r.主体)), x: (V2 ? '收入 ' : '合计 ') + tot(G3) }])}
      ${/1200|1600/.test(CFG) ? '<div class="insight"><b>6、8 小时档：</b>容量收入照各省折算公式算，折算比例封顶为 1——超过折算分母的时长不再增加容量收入（如陕西 6、8 小时都是 3135 万元）。现货套利不计：—（本站价差为 4 小时系统口径，不外推），合计只含可算项、<b>不含现货</b>；过网成本对应的套利收入未计，故不给扣过网成本后的值。</div>' : ''}
      ${insight}
      <section class="card lgcard">
        <div class="lgbar"><div class="revlegend"><span><i style="background:${C_SURE}"></i>容量收入·已生效</span><span><i class="hatch"></i>容量收入·待定</span><span><i style="background:${C_MKT}"></i>现货套利（量级参考）</span></div>
          <div class="lgopts"><label><input type="checkbox" id="optRng"> 现货区间（0.60—0.80）</label>${SHOW_NET ? '<label><input type="checkbox" id="optNet" checked> 扣过网成本后</label>' : ''}</div></div>
        <div id="lghost"></div>
        ${G4.length ? `<p class="note" style="margin-top:12px">无可算项（${G4.length}）：${esc(G4.map(x => x.r.主体).join('、'))}——原因见明细表。</p>` : ''}</section>
      <details class="fold"><summary>逐省明细表（容量收益、租赁、二选一、现货区间、调频）</summary>
        <div class="tablewrap"><table class="t rev"><thead><tr><th>省份</th><th>机制</th><th>容量收益</th><th>容量租赁</th><th>二选一采用</th><th>现货（区间）</th><th>调频</th><th>${V2 ? '收入小计' : '政策收益合计'}</th>${V2 ? '<th>过网成本（系统运行／线损／输配／基金）</th><th>扣过网成本后</th>' : ''}</tr></thead>
        <tbody>${[...G1, ...G2, ...G3, ...G4].map(x => { const r = x.r; return `<tr><td><a href="#/p/${encodeURIComponent(r.主体)}">${esc(r.主体)}</a></td><td style="font-size:13px">${esc(r.机制 || '')}</td>
          <td class="mono">${r.容量收益 != null ? f0(k(r.容量收益)) + `<span class="note" style="display:inline">（${f0(r.容量收益)}）</span>` : '—'} <span class="st ${/可算/.test(r.容量收益标注 || '') ? 'ok' : /征求/.test(r.容量收益标注 || '') ? 'draft' : 'none'}">${esc(r.容量收益标注 || '')}</span></td>
          <td class="mono">${r.容量租赁 != null ? f0(k(r.容量租赁)) + `<span class="note" style="display:inline">（${f0(r.容量租赁)}）</span>` : '—'} ${r.容量租赁标注 ? `<span class="st none">${esc(r.容量租赁标注)}</span>` : ''}</td>
          <td>${esc(r.二选一采用 || '—')}</td>
          <td class="mono">${r.现货套利 != null ? f0(k(r.现货套利)) + `<span class="note" style="display:inline">（${f0(k((r.现货区间 || [])[0]))}—${f0(k((r.现货区间 || [])[1]))}）</span>` : '—'} <span class="st none">${esc(r.现货标注 || '')}</span></td>
          <td style="font-size:12.5px">${esc(r.调频辅助服务 || '')}</td>
          <td class="mono"><b>${f0(k(rTot(r)))}</b><span class="note" style="display:inline">（${f0(rTot(r))}）</span></td>${V2 ? `<td class="mono">${r.过网成本 != null ? f0(k(r.过网成本)) + `<span class="note" style="display:inline">（${['系统运行费', '线损费', '输配电费', '政府性基金'].map(n => f0(k((r.过网成本构成 || {})[n]))).join('／')}）</span><div class="note" style="margin-top:2px">${esc((r.过网成本口径 || '').split('（')[0])}</div>` : '—'}</td><td class="mono"><b style="color:${(r.扣过网成本后 || 0) < 0 ? 'var(--bad)' : 'inherit'}">${r.过网成本 != null ? f0(k(r.扣过网成本后)) : '—'}</b></td>` : ''}</tr>`; }).join('')}</tbody></table></div></details>
      <details class="fold"><summary>测算口径（研究线 口径_v${D.example.n || 1}）</summary><div class="method">${md}</div></details>`;
    $('#cfgseg').querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === EX.cfg); b.onclick = () => { EX.cfg = b.dataset.v; examplePage(o); }; });
    const OPT = { rng: false, net: SHOW_NET };
    const draw = () => layerGroups($('#lghost'), groups, OPT);
    draw(); wireCards();
    $('#optRng').onchange = e => { OPT.rng = e.target.checked; draw(); };
    if ($('#optNet')) $('#optNet').onchange = e => { OPT.net = e.target.checked; draw(); };
  }

  // ---------- 与公开汇编版本的差异（补厚计划 C3；研究线 结论卡/对照_全国调研报告.jsonl） ----------
  function diffPage() {
    const M = D.diff.meta || {}, R = D.diff.rows || [];
    const ev = e => `<button type="button" class="cite ${D.docs[e.编号] ? statusClass(D.docs[e.编号].status) : 'none'}" data-code="${esc(e.编号)}" title="${esc(e.原句 || '')}">${esc(e.编号)}</button>${e.页 ? `<span class="mono"> p${e.页}</span>` : ''}`;
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">可信度 · 对照</div><h1>${esc(M.标题 || '与公开汇编版本的差异')}</h1>
        <p class="lede">对照对象：${esc(M.对照对象 || '')}。${esc(M.说明 || '')}</p></div></section>
      <section class="card"><div class="sub">共 ${R.length} 处：事实 ${R.filter(r => r.类别 === '事实').length}、测算方法 ${R.filter(r => r.类别 !== '事实').length}。判定：${esc((M.核验 || {}).判定 || '')} · ${esc((M.核验 || {}).日期 || '')} · 库 ${esc(M.库版本 || '')}</div>
        <div class="tablewrap"><table class="t rev"><thead><tr><th>#</th><th>类别</th><th>省份</th><th>公开汇编说</th><th>我们核实的结论</th><th>依据</th><th>为什么不一致</th></tr></thead>
        <tbody>${R.map(r => `<tr><td class="mono">${r.序}</td><td><span class="st ${r.类别 === '事实' ? 'draft' : 'ref'}">${esc(r.类别)}</span></td><td>${esc(r.主体)}</td>
          <td style="max-width:240px">${esc(r.报告说法)}<div class="note">${esc(r.报告位置 || '')}</div></td>
          <td style="max-width:280px"><b>${esc(r.我们的结论)}</b></td><td>${(r.依据 || []).map(ev).join('<br>')}</td><td style="max-width:240px;font-size:13px">${esc(r.为什么)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  // ---------- 对外分级试算（补厚计划 C1，研究线方法 v1 草案；用户定前只在内部版） ----------
  function scorePage() {
    const R = (D.score.rows || []).slice().sort((a, b) => b.总分 - a.总分);
    const tier = v => v >= 70 ? '第一档' : v >= 50 ? '第二档' : '第三档';
    const mdh = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const md = (D.score.method || '').split('\n').map(l => /^## /.test(l) ? `<h3>${mdh(l.slice(3))}</h3>` : /^# /.test(l) ? '' : /^\|\s*-/.test(l) ? '' : /^\|/.test(l) ? `<div class="mdrow">${l.split('|').slice(1, -1).map(c => `<span>${mdh(c.trim())}</span>`).join('')}</div>` : /^\s*[-*] /.test(l) ? `<li>${mdh(l.replace(/^\s*[-*] /, ''))}</li>` : l.trim() ? `<p>${mdh(l)}</p>` : '').join('');
    const bar = (v, max) => v == null ? '<span class="note">不评</span>' : `<span class="mono">${v}</span><span class="sbar"><i style="width:${Math.round(100 * v / max)}%"></i></span>`;
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">投资分级 · 公开方法 v1</div><h1>按现行政策，哪里的政策收益条件更好</h1>
        <p class="lede">五个维度：容量收益机制 30、容量收益水平 20、现货阶段 20、现货价差 15、退坡与到期风险 15；不评的维度按其余权重折算。分档：≥70 第一档、50—69 第二档、<50 第三档。每项得分都写明依据；只反映政策收益条件，<b>不构成投资建议</b>。</p></div></section>
      <section class="card"><div class="tablewrap"><table class="t rev"><thead><tr><th>#</th><th>省份</th><th>容量机制</th><th>D1 机制/30</th><th>D2 水平/20</th><th>D3 现货/20</th><th>D4 价差/15</th><th>D5 风险/15</th><th>总分</th><th>档位</th><th>收益确定性</th></tr></thead>
      <tbody>${R.map((r, i) => `<tr><td class="mono">${i + 1}</td><td><a href="#/p/${encodeURIComponent(r.主体)}">${esc(r.主体)}</a></td><td style="font-size:13px">${esc(r.机制 || String(((r.依据 || {}).D1) || '').replace(/（见结论卡[^）]*）/, ''))}</td>
        <td>${bar(r.D1, 30)}</td><td>${bar(r.D2, 20)}</td><td>${bar(r.D3, 20)}</td><td>${bar(r.D4, 15)}</td><td>${bar(r.D5, 15)}</td>
        <td class="mono"><b>${r.总分}</b></td><td><span class="st ${r.总分 >= 70 ? 'ok' : r.总分 >= 50 ? 'trial' : 'none'}">${tier(r.总分)}</span></td><td>${esc(r.收益确定性 || '')}</td></tr>`).join('')}</tbody></table></div>
        <div class="note" style="margin-top:10px">分数只反映政策收益条件，不构成投资建议。点省名看逐项依据。</div></section>
      <section class="card method" style="margin-top:20px"><h2>方法说明</h2>${md}</section>`;
  }

  // ---------- 口径与来源 ----------
  function about() {
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">口径与来源</div><h1>这些数从哪里来、怎么读</h1></div></section>
      <div class="card"><ul class="rules">
        <li><b>来源：</b>本机政策研究库（库 ${esc(D.meta.version)}，快照 ${esc(D.meta.exported)}）的${PUB() ? '储能政策参数表与研究线结论卡' : '⑧储能收益测算、②储能参数对照表'}；每个数可悬停查看依据文件、文号、日期与当前状态。</li>
        <li><b>状态必显：</b>依据标签颜色＝文件当前状态（绿 现行／正式，琥珀 征求意见稿，灰色删除线 已替代或已过期，红 已废止）。征求意见稿尚未生效。</li>
        <li><b>「未采集」不等于「无规定」：</b>表中「—」或「未采集」只说明库里还没有这项数据。</li>
        ${PUB() ? '' : `<li><b>投资分级：</b>优先／储备／谨慎三档，综合容量电价（补偿）是否出台、现货市场成熟度、收益确定性与退坡风险，由研究库逐省校核。</li>`}
        <li><b>容量收益：</b>＝ 本省容量电价基数 × min(1, 储能时长 ÷ 本省最长净负荷高峰持续时长)；山东、蒙西、蒙东按放电量或市场化补偿。省份看板的计算器可调时长与保守口径。</li>
        <li><b>二选一：</b>容量电价与容量租赁不能叠加；多省现货与调频也是二选一或分时段互斥。本站不把互斥收益相加。</li>
        ${PUB() ? '<li><b>不做收益测算：</b>本站只讲政策规定与是否生效；项目收益因选址、时长、运营策略而异，须单独测算。</li>' : `<li><b>标杆项目：</b>200MW/800MWh（4 小时）。现货套利来自单季价差外推，只作量级参考，不用于跨省排序；调频等辅助服务尚未测算年收益。</li>`}
        <li><b>数据核验：</b>研究库每晚入库后跑结论自检（政策状态与依据、结论是否过时、互斥收益是否相加等），疑点回原件核后再改。</li>
      </ul></div>`;
  }

  // ---------- 路由 ----------
  function route() {
    const h = decodeURIComponent(location.hash || '#/');
    $('.nav').classList.remove('mobile-open'); $('.menu-toggle').setAttribute('aria-expanded','false'); const more=document.querySelector('.nav-more');if(more)more.open=false;
    applyLanguage();
    $('#language-notice')?.remove();
    if(en()&&!['#/','#/work','#/start','#/services','#/subscribe','#/explore'].includes(h)){const note=document.createElement('div');note.id='language-notice';note.className='language-notice';note.textContent='Chinese source content · English navigation is available. Policy documents retain their original wording.';$('#app').before(note);}

    if (h.startsWith('#/analysis/')) { location.hash = '#/' + h.slice(11); return; }
    const sec = (h.match(/^#\/([a-z]+)/) || [, 'home'])[1];
    setActiveSection(h);
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === sec || (a.dataset.nav==='tools'&&['explore','park-demo','rev'].includes(sec)) || (a.dataset.nav === 'tags' && sec === 'tag') || (a.dataset.nav === 'topics' && sec === 'topic') || (a.dataset.nav === 'policy' && ['lib', 'brief'].includes(sec)) || (a.dataset.nav === 'home' && (h === '#/' || h === ''))));
    setActiveSection(h);
    const m = h.match(/^#\/p\/(.+)$/);
    const dev = h.match(/^#\/dev\/(.+)$/);
    if (dev) { province(dev[1]); return; }
    if (/^#\/research/.test(h)) { researchPage(h.split('?')[1]); return; }
    if (h === '#/learning') { learningPage(); return; }
    if(h.startsWith('#/notice/')){noticePage(h.slice(9));return;}
    $('#provSelect').value = m ? m[1] : '';
    if(h==='#/map/method'){location.replace('#/methods/capacity-cost');return;}
    if(h==='#/map/indicators'){location.replace('#/map');return;}
    if (h === '#/work') { workPage(); scrollTo(0,0); return; }
    if (h === '#/explore') { toolHubPage(); scrollTo(0,0); return; }
    if (h === '#/start') { startPage(); scrollTo(0,0); return; }
    if (h === '#/subscribe') { subscribePage(); scrollTo(0,0); return; }
    if (m) { province(m[1]); $('#app').insertAdjacentHTML('beforeend', provTopicsHTML(m[1])); } else if (h === '#/about') publicAbout(); else if (h === '#/tools') arithmeticPage(); else if (h === '#/park-demo') parkDemoPage(); else if (h === '#/services') servicesPage(); else if (h === '#/score' && !D.score) home(); else if (h === '#/rev') revenue(); else if (/^#\/brief/.test(h)) { briefPage(h.split('/')[2]); return; } else if (h === '#/tags') tagIndex(); else if (h === '#/topics') topicIndex(); else if (/^#\/topic\//.test(h)) topicPage(h.slice(8)); else if (h === '#/policy/prov') policyProv(); else if (h === '#/policy/time') policyTime(); else if (/^#\/policy/.test(h)) policyPage(h.split('/')[2]); else if (/^#\/m\//.test(h)) { front(); const el = document.getElementById('mc-' + h.slice(4)); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } return; } else if (/^#\/lib/.test(h)) libPage(h.split('?')[1]); else if (h === '#/map') home(); else if (/^#\/methods/.test(h)) { if (PUB()) publicGuidesPage(h.split('/')[2]); else methodsPage(h.split('/')[2]); } else if (/^#\/tag\//.test(h)) tagPage(h.slice(6)); else if (h === '#/ex') { location.replace('#/rev'); return; } /* 用户 10-15 合并：旧链接落到全景页 */ else if (h === '#/score' && D.score) scorePage(); else front();
    if(h==='#/policy')$('#app').insertAdjacentHTML('beforeend',learningContinuation());
    scrollTo(0, 0);
  }
  function syntheticRevenue() {
    const defaults = D.synthetic_example.inputs;
    const labels = {hours:'储能时长（小时）',cycles:'年循环次数',efficiency:'往返效率（0—1）',buy:'购电价（元/kWh）',sell:'售电价（元/kWh）',chargeFee:'充电附加费（元/kWh）',capacity:'容量收入（元/kW·年）',rent:'租赁收入（元/kW·年）',fixed:'其他运营成本（元/kW·年）'};
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">免费收益工具 · 合成示例</div><h1>先看假设，再看收益</h1><p class="lede">所有默认值均为虚构教学参数，不代表任何省份、企业或真实项目。结果为每千瓦每年的运营差额，未计投资、融资、税费与折旧。</p></div></section><section class="card"><form id="synthetic-form" class="synthetic-grid">${Object.entries(labels).map(([k,label])=>`<label>${label}<input name="${k}" type="number" step="any" min="0" value="${defaults[k]}" required></label>`).join('')}<label>示例收入选择<select name="mode"><option value="capacity">采用容量收入</option><option value="rent">采用租赁收入</option><option value="none">均不采用</option></select></label><button class="btn pri" type="submit">重新计算</button></form><output id="synthetic-result" aria-live="polite"></output><p class="sub">公式：容量或租赁收入＋[售电价−（购电价＋充电附加费）÷往返效率]×时长×循环−其他运营成本。时长按额定放电能量/功率；购电量按效率回推。本合成场景假设同一容量的容量收入与租赁收入二选一；实际能否并存须核当地规则与合同，避免重复计算同一权益。</p><a href="examples/synthetic.json">下载合成样例</a> · <a href="#/services">有实际问题，可自愿联系咨询</a></section>`;
    const form=$('#synthetic-form');
    form.onsubmit=event=>{ event.preventDefault(); const x=Object.fromEntries(new FormData(form)), n=Object.fromEntries(Object.keys(defaults).map(k=>[k,Number(x[k])])), out=$('#synthetic-result');
      if (!Object.values(n).every(Number.isFinite)||n.efficiency<=0||n.efficiency>1||n.hours<=0||Object.values(n).some(v=>v<0)) {out.textContent='请输入有效非负数，时长大于0、效率大于0且不超过1。';return;}
      const ancillary=x.mode==='capacity'?n.capacity:x.mode==='rent'?n.rent:0, energy=(n.sell-(n.buy+n.chargeFee)/n.efficiency)*n.hours*n.cycles, net=ancillary+energy-n.fixed;
      out.dataset.net=net.toFixed(6);out.innerHTML=`<p class="kpi"><b>${net.toFixed(2)} 元/kW·年</b><span>运营差额 · 合成情景</span></p><p>电能量差额 ${energy.toFixed(2)} ＋ 互斥收入 ${ancillary.toFixed(2)} − 其他运营成本 ${n.fixed.toFixed(2)}。</p>`;
    }; form.requestSubmit();
  }
  let readingNotes;
  async function mountReadingNotes(group) {
    const expected=location.hash;
    try {
      readingNotes=readingNotes||window.__READING_NOTES__||await(await fetch('content/reading-notes.json')).json();
      if(location.hash!==expected||document.querySelector('[data-reading-notes]'))return;
      const ids=group==='arithmetic'?['capacity-rate','reference-component','actual-receipt','grid-agent-purchase','market-purchase']:
        ['billing-demand','transformer-capacity','grid-capacity','one-way-efficiency','roundtrip-efficiency','renewable-utilization','policy-self-use'];
      const terms=readingNotes.terms.filter(t=>ids.includes(t.id));
      const html=`<details class="reading-notes work-evidence" data-reading-notes="${group}"><summary>${tx('读工具前，先分清这些量','Reading notes · Chinese explanations')}</summary><p class="note">${esc(readingNotes.notice)}</p><div class="reading-note-grid">${terms.map(t=>`<details class="reading-term" data-term="${esc(t.id)}"><summary>${esc(t.term)}</summary><p>${esc(t.definition)}</p><p class="note">${esc(t.common_confusion)}</p><p>${esc(t.example)}</p><p class="note">${esc(t.scope)}</p><a href="${esc(t.next_route)}">${tx('继续核对方法与条件','Review method & conditions')} ↗</a></details>`).join('')}</div></details>`;
      document.querySelector('#app>.hero')?.insertAdjacentHTML('afterend',html);
    } catch(error) {
      if(location.hash===expected){const note=document.createElement('p');note.className='note';note.textContent=tx('阅读提示暂未加载，可在方法页核对单位和适用条件。','Reading notes are unavailable. Check units and conditions on the methods page.');document.querySelector('#app>.hero')?.after(note);}
    }
  }
  async function parkDemoPage() {
    try {
      const demo=window.__PARK_EXAMPLES__||await(await fetch('examples/park-scenarios.json')).json();
      if(location.hash!=='#/park-demo')return;
      if(demo.kind!=='synthetic_fixed_examples'||demo.cases.length!==8)throw Error('合成样例格式不符');
      const num=x=>Number(x).toLocaleString('zh-CN',{maximumFractionDigits:3});
      const notes={削峰:'20小时负荷10 MW、4小时30 MW。效率为1；充电也占接网容量。容量权重100万元/MW·本24小时时段仅为构造目标权重，不是日价。',套利:'全天负荷10 MW，低价200元/MWh、高价800或240元/MWh各12小时；单程效率均为0.9，往返效率0.81，放电损耗费10元/MWh。价差须覆盖损耗与费用。',消纳:'全天负荷10 MW，4小时绿电20 MW；电价500元/MWh、效率为1，放电损耗费10元/MWh。绿电利用率包含储能损耗，不追踪电源归属，不能当作政策自用比例。'};
      const row=c=>{const r=c.result;return `<tr><td>${esc(c.label)}</td><td>${num(c.input.storage_energy_mwh)}</td><td>${num(r.grid_capacity_mw)}</td><td>${num(r.grid_import_mwh)}</td><td>${num(r.curtailment_mwh)}</td><td>${num(r.energy_cost_yuan)}</td></tr>`;};
      $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">免费园区演示 · 全部为构造场景</div><h1>储能如何改变接网、用电与弃电</h1><p class="lede">${esc(demo.notice)}循环日允许电网充电、禁止反送电。未含投资、融资、税费等，不代表项目利润或准入结论。</p></div></section><section class="card"><h2>选择一个固定场景</h2><div class="synthetic-grid"><label>查看输入与结果<select id="park-case">${['削峰','套利','消纳'].map(group=>`<optgroup label="${group}">${demo.cases.filter(c=>c.group===group).map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</optgroup>`).join('')}</select></label></div><p id="park-explanation"></p><div id="park-selected" aria-live="polite"></div></section><section class="card" style="margin-top:20px"><h2>8个场景对照</h2><p>${esc(demo.schedule_notice)}</p><div class="tbl park-comparison"><table><thead><tr><th>场景</th><th>储能 MWh</th><th>该调度峰值 MW</th><th>下网 MWh</th><th>弃电 MWh</th><th>电量费 元</th></tr></thead><tbody>${demo.cases.map(row).join('')}</tbody></table></div></section><section class="card" style="margin-top:20px"><h2>复现与实际应用</h2><p><a href="examples/park-scenarios.json" download>下载完整合成输入与结果</a> · <a href="tools/park_examples.py" download>下载复现脚本（Python标准库）</a></p><p>运行 python tools/park_examples.py 可重建8例。逐时调度可能不唯一；显示值经过舍入，复验使用JSON完整精度。这里没有对任意输入运行优化求解器。</p><p><a href="#/topic/零碳园区">阅读园区规划与项目条件</a> · <a href="#/tools">容量及充电费用算术</a> · <a href="#/services">实际问题可自愿咨询</a></p></section>`;
      const select=$('#park-case');
      const render=()=>{const c=demo.cases.find(c=>c.id===select.value),x=c.input,r=c.result,d=c.dispatch;
        $('#park-explanation').textContent=notes[c.group];
        const utilization=r.renewable_utilization_fraction===null?'不适用（无发电）':num(r.renewable_utilization_fraction*100)+'%';
        const feeRows=[['电量费',r.energy_cost_yuan],['构造容量权重项',r.capacity_cost_yuan],['放电损耗费',r.wear_cost_yuan],[c.group==='削峰'?'构造目标合计（非实际电费）':'本24小时时段运行费合计',r.total_operating_cost_yuan]];
        const selected=$('#park-selected');selected.dataset.case=c.id;selected.dataset.utilization=r.renewable_utilization_fraction===null?'not-applicable':String(r.renewable_utilization_fraction);
        selected.innerHTML=`<div class="kpis">${[['该调度峰值',num(r.grid_capacity_mw)+' MW'],['下网电量',num(r.grid_import_mwh)+' MWh'],['弃电量',num(r.curtailment_mwh)+' MWh'],['绿电利用率',utilization]].map(([k,v])=>`<div class="kpi"><div class="k">${k}</div><div class="v park-value">${v}</div></div>`).join('')}</div><p>储能 ${num(x.storage_energy_mwh)} MWh / ${num(x.storage_power_mw)} MW；步长1小时，共24小时。充/放电效率 ${num(x.charge_efficiency)} / ${num(x.discharge_efficiency)}；往返效率 ${num(x.charge_efficiency*x.discharge_efficiency)}。</p><div class="park-detail-grid"><div class="tbl park-fees"><table><thead><tr><th>费用分项（元/本24小时时段）</th><th>金额</th></tr></thead><tbody>${feeRows.map(([k,v])=>`<tr><td>${k}</td><td>${num(v)}</td></tr>`).join('')}</tbody></table></div><p>能量核对：下网 ${num(r.grid_import_mwh)} ＋可用绿电 ${num(r.renewable_mwh)} −弃电 ${num(r.curtailment_mwh)} ＝负荷 ${num(r.load_mwh)} ＋储能损耗 ${num(r.storage_loss_mwh)} MWh；残差 ${num(r.energy_balance_residual_mwh)} MWh。循环首末SOC为0。</p></div><details><summary>展开24小时输入与调度</summary><div class="tbl park-hourly"><table><thead><tr><th>小时</th><th>负荷 MW</th><th>绿电 MW</th><th>购电价 元/MWh</th><th>下网 MW</th><th>充电 MW</th><th>放电 MW</th><th>弃电 MW</th><th>期末SOC MWh</th></tr></thead><tbody>${x.load_mw.map((_,h)=>`<tr><td>${h}—${h+1}</td>${[x.load_mw[h],x.renewable_mw[h],x.import_price_yuan_per_mwh[h],d.grid_import_mw[h],d.charge_mw[h],d.discharge_mw[h],d.curtailment_mw[h],d.soc_end_mwh[h]].map(v=>`<td>${num(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
      };select.addEventListener('change',render);render();
      mountReadingNotes('park');
    } catch(error) {if(location.hash==='#/park-demo')$('#app').innerHTML=`<section class="card"><h1>园区样例暂未加载</h1><p>${esc(error.message)}</p><a href="#/tools">返回算术工具</a></section>`;}
  }

  async function arithmeticPage() {
    try {
      const samples=window.__METHOD_EXAMPLES__||await(await fetch('examples/method-arithmetic.json')).json();
      if(location.hash!=='#/tools')return;
      const cap=samples.cases.find(c=>c.id==='capacity_half').input,charge=samples.cases.find(c=>c.id==='charging_refund_1500').input;
      const capLabels={base_yuan_per_kw_year:'输入基准（元/kW·年）',full_power_discharge_hours:'满功率连续放电时长（小时）',peak_duration_hours:'高峰持续时长（小时）'};
      const feeLabels={charge_mwh:'本账期充电量（MWh）',energy_yuan_per_mwh:'电能量单价（元/MWh）',line_loss_yuan_per_mwh:'线损单价（元/MWh）',system_yuan_per_mwh:'系统运行费单价（元/MWh）',transmission_yuan_per_mwh:'输配单价（元/MWh）',declared_transmission_refund_yuan:'声明的本账期输配退减（元）'};
      const fields=(labels,defaults)=>Object.entries(labels).map(([k,label])=>`<label>${label}<input type="number" name="${k}" step="any" value="${defaults[k]}" required></label>`).join('');
      $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">免费算术工具 · 全部默认值为合成输入</div><h1>把参考折算和充电费用分开算</h1><p class="lede">默认数字不对应实际地区、企业或项目。计算仅解释分母、单位和费用项；项目资格、最终标准、结算与实际收入须另核。</p></div></section>
      <section class="card"><h2>容量时长参考部分</h2><p>公式：输入基准 × min（满功率连续放电时长 ÷ 高峰持续时长，1）。分母须大于0；这里只展示时长折算部分，不能据此直接确认最终核价。</p><form id="capacity-form" class="synthetic-grid" novalidate>${fields(capLabels,cap)}<button class="btn pri">计算参考部分</button></form><output id="capacity-result" aria-live="polite"></output><p><a href="#/park-demo">园区合成演示：削峰、套利与绿电消纳 →</a></p></section>
      <section class="card" style="margin-top:20px"><h2>充电费用与声明退减</h2><p>只计算下列四个声明费项。退减金额由使用者声明，不从放电量自动确认，也不表示其他充电费用退减。</p><form id="charging-form" class="synthetic-grid" novalidate>${fields(feeLabels,charge)}<button class="btn pri">计算费用分项</button></form><output id="charging-result" aria-live="polite"></output><p class="sub">不支持负电价、跨期超当期输配金额的退减。单位为元/MWh与元；未列的基金、税费等不在四项算术内，结果不是完整项目电费账单。</p></section>
      <section class="card" style="margin-top:20px"><h2>复核与下一步</h2><p><a href="#/methods/capacity-cost">先读方法、政策来源与适用边界</a> · <a href="examples/method-arithmetic.json" download>下载8组合成输入及结果</a></p><p>浏览器本地计算，无需提交联系方式。方法页讨论电网侧独立新型储能；园区用户侧等其他对象须另核适用性。用于实际项目之前，分别核当地规则、资格清单、执行时点、计量和收费期间；不要将参考值或声明退减当作已核实收入。</p></section>`;
      const number=v=>Number(v).toLocaleString('zh-CN',{maximumFractionDigits:6});
      const wire=(id,resultId,calculate,render)=>{const form=document.getElementById(id),output=document.getElementById(resultId);form.addEventListener('submit',event=>{event.preventDefault();try{const input=Object.fromEntries([...form.querySelectorAll('input[name]')].map(e=>[e.name,e.value.trim()===''?NaN:Number(e.value)]));const result=calculate(input);output.dataset.result=JSON.stringify(result);delete output.dataset.error;output.innerHTML=render(result);}catch(error){delete output.dataset.result;output.dataset.error='true';output.innerHTML=`<p role="alert">${esc(error.message)}</p>`;}});form.requestSubmit();};
      wire('capacity-form','capacity-result',StorageMath.capacity,r=>`<p class="kpi"><strong>${number(r.reference_component_yuan_per_kw_year)} 元/kW·年</strong> · 参考折算部分</p><p>折算比例 ${number(r.duration_fraction*100)}%。最终容量标准：未核定；年度实收：未确认。资格与结算未验证。</p>`);
      const feeNames={energy:'电能量',line_loss:'线损',system:'系统运行费',transmission:'输配'};
      wire('charging-form','charging-result',StorageMath.charging,r=>`<div class="tbl"><table><thead><tr><th>本账期声明费项</th><th>金额（元）</th></tr></thead><tbody>${r.fee_lines.map(f=>`<tr><td>${feeNames[f.item]}</td><td>${number(f.amount_yuan)}</td></tr>`).join('')}<tr><td>四项合计（退减前）</td><td>${number(r.gross_charge_yuan)}</td></tr><tr><td>声明输配退减</td><td>−${number(r.declared_transmission_refund_yuan)}</td></tr><tr><td>算术净额</td><td><strong>${number(r.arithmetic_net_yuan)}</strong></td></tr></tbody></table></div><p>输配项退减后 ${number(r.transmission_after_declared_refund_yuan)} 元；其他三项保留。结算未验证。</p>`);
      mountReadingNotes('arithmetic');
    } catch(error) { $('#app').innerHTML=`<section class="card"><h1>算术工具暂未加载</h1><p>${esc(error.message)}</p><a href="#/methods/capacity-cost">阅读方法</a></section>`; }
  }

  function publicGuidesPage(id) {
    const guides=(D.public_guides||[]).filter(g=>g.id!=='services'), selected=guides.find(g=>g.id===id);
    $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">研究方法 · 免费阅读</div><h1>${esc(selected?.title||'先核条件，再做判断')}</h1><p class="lede">把文件状态、比较口径与收入条件分开；涉及数值时回到一手来源和具体适用范围。</p></div></section>${selected?`<article class="card prose-topic">${mdHTML(selected.md)}<p><a href="#/tools">容量与费用算术工具</a> · <a href="#/rev">运营差额合成试算</a> · <a href="#/methods">所有方法</a></p></article>`:`<section class="mech">${guides.map(g=>`<a class="card" href="#/methods/${esc(g.id)}"><h2>${esc(g.title)}</h2><p>查看方法、适用边界与下一步。</p></a>`).join('')}</section>`}`;
  }
  function legacyServicesPage() {
    if(en()) offerings.push(['procurement','Procurement research support','Turn a sourcing question into a comparison brief.','Define requirements, compare public product specifications and prepare a source-backed shortlist for review. Supplier engagement and purchases are scoped separately.','Requirements, comparison & evidence']);
    const scope=(D.public_guides||[]).find(g=>g.id==='services');
    if(scope){
      const lines=scope.md.split('\n'),rows=lines.filter(l=>/^\|/.test(l)&&!/^\|[- :|]+\|$/.test(l)).map(l=>l.replace(/^\||\|$/g,'').split('|').map(v=>v.trim())),headers=rows.shift();
      const cards=rows.map(row=>`<article class="card"><h2>${esc(row[0])}</h2>${row.slice(1).map((v,i)=>`<h3>${esc(headers[i+1])}</h3><p>${inlineMD(v)}</p>`).join('')}</article>`).join('');
      $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">自愿联系 · 公共功能始终免费</div><h1>咨询与定制服务</h1><p class="lede">阅读、检索和公共工具无需注册或提交联系方式。</p></div></section><section class="mech service-scope">${cards}</section><section class="card prose-topic">${mdHTML(lines.filter(l=>!/^\|/.test(l)).join('\n'))}<p>有明确问题可自愿联系 <a href="mailto:xuqinnn@163.com">xuqinnn@163.com</a>。</p><a href="https://github.com/xuqinnn/energy-storage-policy/issues">反馈问题</a></section>`;return;}

    $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">自愿联系 · 公共功能始终免费</div><h1>咨询与定制服务</h1><p class="lede">独立开展研究，不代表原任职企业。阅读、检索和公共工具无需注册或提交联系方式。</p></div></section><section class="mech">${[['诊断与定制研究','围绕跨省选址、规则变化或项目适用条件，约定问题范围，交付带来源的判断、未知项和讲解。'],['专属研究站搭建','按团队地域、主题和品牌配置资料组织、部署、培训与维护；客户资料独立保管。'],['场景模型与证据包','根据获授权数据整理假设、敏感性、输入输出与政策依据，明确验收范围；实际项目资料不回流公共站。']].map(([t,p])=>`<article class="card"><h2>${t}</h2><p>${p}</p></article>`).join('')}</section><section class="card"><p>有明确问题可自愿联系 <a href="mailto:xuqinnn@163.com">xuqinnn@163.com</a>。根据实际范围约定交付、周期和费用，不承诺审批或投资收益。</p><a href="https://github.com/xuqinnn/energy-storage-policy/issues">反馈问题</a></section>`;
  }
  function publicAbout() {
    $('#app').innerHTML=`<section class="hero"><div><div class="eyebrow">开放研究 · 可复现</div><h1>来源、方法与源码</h1><p class="lede">独立能源研究站面向储能、园区能源负责人及独立顾问。公共资料与工具免费无口令；资料状态、适用条件和截至日期以条目为准。</p></div></section><section class="card"><h2>如何复核</h2><p>先看政策简述与状态，再核引用的原件物理页及适用条件。带“官方发布页”的条目可直接打开一手来源。研究资料只提供元数据和独立摘要，不再分发第三方报告或标准全文。</p><p>收益工具采用合成参数，提供输入与公式，不作为实际项目收益预测。旧项目测算与未完成公开审定的内容不进入当前公共包；页面不以口令或收费解锁。</p><h2>复现与许可</h2><p>前台沿用HTML、CSS、JavaScript与本地ECharts。源码、标准库构建脚本、合成样例和许可范围均在公开仓库；复现无需私有工作簿、个人路径或钥匙串。</p><a href="https://github.com/xuqinnn/energy-storage-policy">查看源码与构建说明 ↗</a> · <a href="ASSETS.json">公开资产清单</a> · <a href="#/services">自愿咨询</a></section>`;
  }
  async function start(d) {
    if (d?.meta?.access !== 'public-free') throw new Error('数据尚未完成公共资产审定');
    D = d;
    if (d.meta.dataset === 'synthetic') document.querySelector('main').insertAdjacentHTML('beforebegin', '<aside class="card" role="note">纯合成样例：文档、地区和参数均为虚构，无政策效力。</aside>');
    $('#ver').textContent = `更新 ${d.meta.exported.slice(0,10)}`;
    setupShell();await Promise.all([loadReplyInsights(),loadContentLayer()]);
    if(d.meta.dataset==='synthetic'){contentLayer={schema:1,notices:[],classifications:[],source_links:[],source_gaps:[]};replyItems=[];}
    contentModel=EnergyContent.create(D,contentLayer,replyItems);
    const sel = $('#provSelect');
    sel.innerHTML += PROVS.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    sel.onchange = () => { if (sel.value) location.hash = '#/p/' + encodeURIComponent(sel.value); };
    addEventListener('hashchange', route); route();
  }
  if (window.__YC_DATA__) { start(window.__YC_DATA__); return; }   // 内部预览单文件：数据已内嵌，双击即开
  if (/^#k=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/');
  fetch('data/storage.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('公开快照未取得'); return r.json(); }).then(start)
    .catch(() => { $('#app').innerHTML = '<p>公开资料暂时无法读取，请稍后刷新。</p>'; });
})();
