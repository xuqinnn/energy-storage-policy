/* 储能政策研究站 · 前台（只读快照 data/storage.json）
   页面：#/ 投资分级地图 ｜ #/rev 收益构成全景 ｜ #/p/<省> 省份看板（政策-开发-问题）｜ #/about 口径与来源
   口径硬约束：状态位必显；「未采集」≠「无规定」；每个数可回到依据编号与页码。 */
(function () {
  'use strict';
  let D = null;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    const d = D.docs[c.dataset.code];
    tip.innerHTML = d ? `<b>${esc(c.dataset.code)}</b>　<span class="st ${statusClass(d.status)}">${esc(d.status)}</span><br>${esc(d.title)}<br>${esc(d.no || '')}　${esc(d.date || '')}${d.yjc ? '<br>研究库编号：' + esc(d.yjc.join('、')) : ''}`
      : `<b>${esc(c.dataset.code)}</b><br>非本站收录的政策文件`;
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
          <h1>${PUB() ? '各省储能政策走到了哪一步' : '哪些省优先做、哪些省先储备'}</h1>
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
        <div class="mapmain"><h2 id="mapTitle"></h2><div class="sub" id="mapSub"></div><div class="tilemap" id="tiles"></div></div>
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
  }

  function eventsHTML() {      // 本月要事（补厚计划 B2）：即将执行、到期／复查、近 30 天新发布
    const ev = D.events || []; if (!ev.length) return '';
    const t0 = new Date().toISOString().slice(0, 10);
    const li = e => `<li><span class="mono">${esc((e.date || '').slice(5))}</span><span class="pv">${esc(e.prov || '')}</span><span>${e.kind !== '新发布' ? `<span class="st ${e.kind === '征求截止' ? 'draft' : e.kind === '即将执行' ? 'ok' : 'none'}">${esc(e.kind)}</span> ` : ''}${e.code ? `<button type="button" class="cite ${statusClass(e.status)}" data-code="${esc(e.code)}">${esc(e.code)}</button> ` : ''}${esc(String(e.title || '').replace(/^\d{6}/, '').slice(0, 42))}${e.code && briefOf(e.code) ? ` <a class="blink" href="#/brief/${esc(e.code)}">简析</a>` : ''}</span></li>`;
    const up = ev.filter(e => e.kind !== '新发布' && e.date >= t0).slice(0, 10);
    const nw = ev.filter(e => e.kind === '新发布').sort((a, b) => ((b.landed || b.date) || '').localeCompare((a.landed || a.date) || '') || (b.date || '').localeCompare(a.date || ''));
    const cats = [...new Set(nw.map(e => e.cat).filter(Boolean))];
    const newList = (items, n) => `<ul class="evl" style="margin-top:10px">${items.slice(0, n).map(li).join('') || '<li class="note">暂无</li>'}</ul>${items.length > n ? `<details class="more"><summary>展开全部 ${items.length} 件</summary><ul class="evl">${items.slice(n).map(li).join('')}</ul></details>` : ''}`;
    // 用户 10-16：全部分类、近 60 天发布或近 30 天新收录，按分类筛；有简析的带链接
    if (PUB() || !up.length) {
      setTimeout(() => document.querySelectorAll('#newcats button').forEach(b => b.onclick = () => {
        document.querySelectorAll('#newcats button').forEach(x => x.classList.toggle('on', x === b));
        const k = b.dataset.cat, items = k ? nw.filter(e => e.cat === k) : nw;
        document.getElementById('newlist').innerHTML = newList(items, 15);
      }), 0);
      return `<section class="card" style="margin-top:20px"><h2>近期新发布的政策 <small class="note" style="display:inline">${nw.length} 件 · ${nw.filter(e => briefOf(e.code)).length} 件有简析</small></h2><div class="sub">近 60 天发布或近 30 天新收录，按收录时间排；点「简析」看要点与变化，悬停编号看文件与状态。<a href="#/brief" style="margin-left:8px">全部简析 →</a></div>
        <div class="seg" id="newcats" style="margin-top:10px;flex-wrap:wrap"><button class="on" data-cat="">全部</button>${cats.map(k => `<button data-cat="${esc(k)}">${esc(k)} ${nw.filter(e => e.cat === k).length}</button>`).join('')}</div>
        <div id="newlist">${newList(nw, 15)}</div></section>`;
    }
    return `<section class="card" style="margin-top:20px"><h2>本月要事</h2><div class="sub">储能、电价、市场、辅助服务四类；悬停编号看文件与状态。</div>
      <div class="evgrid"><div><h3>接下来：即将执行 · 征求截止 · 到期或复查</h3><ul class="evl">${up.map(li).join('') || '<li class="note">半年内暂无</li>'}</ul></div>
      <div><h3>近期新发布 <a href="#/brief" style="font-size:12.5px;font-weight:400">全部简析 →</a></h3>${newList(nw, 15)}</div></div></section>`;
  }
  // ---------- 政策简析（补厚计划 D5，用户 10-15）：新政策与重要政策一件一卡——一句话／改了什么／纵向／横向／何时会变 ----------
  const BRIEF_F = [['一句话', '一句话'], ['对比结论', '新旧对比'], ['改了什么', '改了什么'], ['纵向', '纵向 · 本省前后'], ['横向', '横向 · 与他省'], ['何时会变', '何时会变'],
                   ['谁受影响', '谁受影响 · 内部'], ['冲突或印证', '冲突或印证 · 内部'], ['落点', '对我们的影响 · 内部']];
  const briefOf = code => (D.briefs || []).find(b => b.编号 === code);
  function briefCard(b) {
    const d = b.编号 && D.docs[b.编号];
    return `<article class="card brief" id="b-${esc(b.编号 || '')}"><div class="bh"><span class="st ${b.级别 === '重点' ? 'ref' : 'none'}">${esc(b.级别 || '')}件</span>
        ${b.编号 ? `<button type="button" class="cite ${d ? statusClass(d.status) : 'none'}" data-code="${esc(b.编号)}">${esc(b.编号)}</button>` : '<span class="st draft">待入库</span>'}
        <span class="pv">${esc(b.省份 || '')}</span>${b.状态 ? `<span class="st ${statusClass(b.状态)}">${esc(b.状态)}</span>` : ''}</div>
      <h3>${esc(b.标题 || '')}</h3>
      ${BRIEF_F.filter(([k]) => b[k]).map(([k, t]) => `<div class="bf"><span class="bk">${esc(t)}</span><div>${citeHTML(b[k])}</div></div>`).join('')}
      ${PUB() ? '' : `<div class="note">出自学习站日报 ${esc(b.日报日期 || '')}${b.草稿 ? ' · <span class="st draft">草稿·待研究线审定，未对外</span>' : ''}</div>`}</article>`;
  }
  function briefPage(code) {
    const bs = (D.briefs || []).slice().sort((a, b) => (b.日报日期 || '').localeCompare(a.日报日期 || '') || (a.级别 === '重点' ? -1 : 1));
    $('#app').innerHTML = `<section class="hero"><div><div class="eyebrow">政策简析 · 新政策与重要政策</div>
        <h1>新出的政策改了什么、和以前比、和别省比</h1>
        <p class="lede">一件一卡：一句话说清是什么，再看改了什么、本省前后（纵向）、与他省（横向）、何时会变。依据编号可悬停看原件状态。${PUB() ? '' : '内部版另显示「谁受影响」「对我们的影响」。'}</p></div></section>
      ${bs.length ? bs.map(briefCard).join('') : '<div class="card note">暂无简析。</div>'}`;
    if (code) { const el = document.getElementById('b-' + code); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); } }
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
      <section class="card"><h2>逐省政策一览</h2><div class="sub">悬停编号看依据文件与当前状态；点省名看完整看板。「未采集」不等于该省没有规定。</div>
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
    const h = title || meta.short || m;
    if (isMissing(f)) return `<div class="item"><div class="h"><span>${esc(h)}</span></div><div class="b" style="color:var(--mute)">未采集——不等于该省「无规定」</div></div>`;
    const stale = (f.staleCites || []).length ? `<span class="st stale">依据含失效件</span>` : '';
    const full = clean(f.v);
    const one = firstSentence(f.v);
    return `<div class="item"><div class="h"><span>${esc(h)}</span>${stale}</div>
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
      <div class="crumb"><a href="#/">${PUB() ? '政策地图' : '投资分级地图'}</a> / 省份看板</div>
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
      <section class="board">
        <div class="card col"><h2>政策 <small>现在怎么规定</small></h2>
          ${item(p, '②c6', '容量补偿')}${item(p, '②c3', '电力现货')}${item(p, '②c4', '调频补偿')}${item(p, '②c9', '充电电费减免')}${item(p, '②c10', '容量租赁')}${item(p, '②c12', '容量电价考核')}
          ${jibei && p === '河北' ? `<div class="todo">河北分冀南、冀北两张网。上面为冀南；冀北容量补偿：${citeHTML(firstSentence((jibei['②c6'] || {}).v || '未采集'))}</div>` : ''}</div>
        <div class="card col"><h2>开发 <small>能不能做、怎么进</small></h2>
          ${(D.dev || {})[p] ? devHTML(p) : `${item(p, '②c17', '清单制')}${item(p, '②c16', '现货报价方式')}${item(p, '⑧c31', '现行标准生效／到期')}${item(p, '⑧c34', '下次调整窗口')}${item(p, '⑧c32', '调整机制')}${item(p, '⑧c33', '历史退坡轨迹')}
          <div class="todo">申报窗口、门槛与股权锁定期：专题汇编中${PUB() ? '' : '（T623）'}，完成后在此显示。</div>`}</div>
        <div class="card col"><h2>问题 <small>风险与待核</small></h2>
          ${PUB() ? riskFromCard(p) + item(p, '⑧c35', '退坡·并轨风险') + item(p, '⑧c53', '节点价差')
                  : item(p, '⑧c26', '风险与注意事项') + item(p, '⑧c24', '校核结论') + item(p, '⑧c30', '测算局限') + item(p, '⑧c53', '节点价差')}
          ${missingList(p)}</div>
      </section>`;
    drawCalc(p);
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
    const K = 20, f0 = v => v == null ? '—' : Math.round(v).toLocaleString(), k = v => v == null ? null : v / K;
    const rTot = r => r.收入小计 !== undefined ? r.收入小计 : r.政策收益合计;      // v2 起合计拆成「收入小计」和「扣过网成本后」
    const V2 = (D.example.n || 1) >= 2;
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
        tot: rTot(x.r) != null ? k(rTot(x.r)) : null, net: V2 && x.r.过网成本 != null && x.r.扣过网成本后 != null ? k(x.r.扣过网成本后) : null, /* 过网成本未算的（如蒙东）不画扣后 */ tip: tipOf(x), href: '#/p/' + encodeURIComponent(x.r.主体) }; };
    const G1 = L.filter(x => x.sure > 0), G2 = L.filter(x => !x.sure && x.pend > 0), G3 = L.filter(x => !x.sure && !x.pend && x.spot), G4 = L.filter(x => !x.sure && !x.pend && !x.spot);
    const groups = [
      { id: 'a', t: '有现行容量收入', d: '<b>深色</b>＝容量收益或容量租赁（二选一取采用项），<b>浅色</b>＝现货套利（实现率 0.70）；条末数字＝' + (V2 ? '收入小计，红色箭头后＝扣过网成本后。' : '政策收益合计。'), rows: G1.map(rowOf) },
      { id: 'b', t: '容量收入待定', d: '斜纹段＝未来起执行或参考价出处待查的容量收入，悬停看原因。', rows: G2.map(rowOf) },
      { id: 'c', t: '只有市场收入', d: '容量项未出台、征求稿未照算或无法折算，只算现货；现货为量级参考。' + (G3.some(x => x.mktLease) ? `${esc(G3.filter(x => x.mktLease).map(x => x.r.主体).join('、'))}含容量租赁的市场成交价（非政策价）。` : ''), rows: G3.map(rowOf) }
    ];
    const tot = xs => rangeOf(xs.map(x => k(rTot(x.r))), ' 元/千瓦·年');
    // v2 发现（研究线 口径_v2 第四节）：系统运行费是过网成本最大项；扣完为负的省份——从数据算，不手写
    const neg = L.filter(x => x.r.过网成本 != null && x.r.扣过网成本后 != null && x.r.扣过网成本后 < 0).sort((a, b) => a.r.扣过网成本后 - b.r.扣过网成本后).map(x => x.r.主体);
    const big = L.filter(x => x.r.过网成本构成 && x.r.过网成本).map(x => x.r.过网成本构成.系统运行费 / x.r.过网成本).filter(v => v > 0);   // 系统运行费为 0 的（北京，待研究线核）不计
    const insight = V2 && big.length ? `<div class="insight"><b>过网成本：</b>114 号文后，<b>系统运行费</b>是储能充电侧最大的成本项（${big.length} 省占过网成本 ${Math.round(Math.min(...big) * 100)}%—${Math.round(Math.max(...big) * 100)}%）；${neg.length ? `<b>${esc(neg.join('、'))}</b> 扣完过网成本后为负——单靠现货套利覆盖不了充电侧成本。` : ''}</div>` : '';
    const drafts = L.filter(x => /征求/.test(x.r.容量收益标注 || '') && !x.mktLease).map(x => x.r.主体);   // 宁夏补偿为征求稿但示例采用市场租赁价，另写（研究线 10-14）
    const mktL = L.filter(x => x.mktLease).map(x => x.r.主体);
    const futs = G2.filter(x => /起执行/.test(x.why)).map(x => x.r.主体 + ' ' + ((x.why.match(/20\d\d/) || [''])[0]));
    const hero = REV ? `<section class="hero"><div><div class="eyebrow">电网侧独立储能 · 收益构成全景 · ${CFG === '200MW/400MWh' ? '2' : '4'} 小时项目 · 示例测算口径 v${D.example.n}</div>
        <h1>${G1.length} 个省区有已生效、新项目可拿的容量收入；${G3.length} 个省区只有市场收入</h1>
        <p class="lede">${futs.length ? '另有' + esc(futs.join('、')) + ' 年起执行；' : ''}${drafts.length ? esc(drafts.join('、')) + ' 的容量补偿只有征求稿、未照算；' : ''}${mktL.length ? esc(mktL.join('、')) + ' 容量补偿为征求稿，示例采用 2025 年市场租赁价；' : ''}${L.some(x => /未能折算/.test(x.r.容量收益标注 || '')) ? esc(L.filter(x => /未能折算/.test(x.r.容量收益标注 || '')).map(x => x.r.主体).join('、')) + ' 为市场化容量补偿、无法折算；' : ''}按「收入稳不稳」分三组，红色箭头后是扣掉充电过网成本后的数。<b>示例测算·不构成投资建议</b>；线损购电价按 0.30 元/千瓦时量级假设。</p></div>
        <div class="controls"><span class="seg" id="cfgseg"><button data-v="200MW/400MWh">2 小时</button><button data-v="200MW/800MWh">4 小时</button></span></div></section>`
      : `<section class="hero"><div><div class="eyebrow">示例测算 · 口径 v${D.example.n || 1} · <span class="st draft">待用户过目，未对外</span></div>
        <h1>一座 ${CFG} 储能，按现行政策一年能拿多少</h1>
        <p class="lede"><b>示例测算·不构成投资建议。</b>只算政策收益与现货量级，不算投资回报率。${V2 ? '过网成本按 114 号文口径逐省计算（线损购电价按 0.30 元/千瓦时量级<b>假设</b>）。' : '过网成本待按 114 号文复核，本版不计入。'}</p></div>
        <div class="controls"><span class="seg" id="cfgseg"><button data-v="200MW/400MWh">2 小时</button><button data-v="200MW/800MWh">4 小时</button></span></div></section>`;
    $('#app').innerHTML = `${hero}
      ${sumCards([
        { id: 'a', k: '有现行容量收入', v: G1.length, n: nameList(G1.map(x => x.r.主体)), x: (V2 ? '收入 ' : '合计 ') + tot(G1) },
        { id: 'b', k: '容量收入待定', v: G2.length, n: nameList(G2.map(x => x.r.主体)), x: esc([...new Set(G2.map(x => /出处待查/.test(x.why) ? '参考价出处待查' : /起执行/.test(x.why) ? '未来起执行' : /征求/.test(x.why) ? '征求稿' : '待定'))].join('、')) },
        { id: 'c', k: '只有市场收入', v: G3.length, n: nameList(G3.map(x => x.r.主体)), x: (V2 ? '收入 ' : '合计 ') + tot(G3) }])}
      ${insight}
      <section class="card lgcard">
        <div class="lgbar"><div class="revlegend"><span><i style="background:${C_SURE}"></i>容量收入·已生效</span><span><i class="hatch"></i>容量收入·待定</span><span><i style="background:${C_MKT}"></i>现货套利（量级参考）</span></div>
          <div class="lgopts"><label><input type="checkbox" id="optRng"> 现货区间（0.60—0.80）</label>${V2 ? '<label><input type="checkbox" id="optNet" checked> 扣过网成本后</label>' : ''}</div></div>
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
    const OPT = { rng: false, net: V2 };
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
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', (a.dataset.nav === 'home' && (h === '#/' || h === '')) || (a.dataset.nav === 'about' && h === '#/about') || (a.dataset.nav === 'rev' && h === '#/rev')));
    const m = h.match(/^#\/p\/(.+)$/);
    $('#provSelect').value = m ? m[1] : '';
    if (m) province(m[1]); else if (h === '#/about') about(); else if (h === '#/rev') revenue(); else if (/^#\/brief/.test(h)) { briefPage(h.split('/')[2]); return; } else if (h === '#/ex') { location.replace('#/rev'); return; } /* 用户 10-15 合并：旧链接落到全景页 */ else if (h === '#/score' && D.score) scorePage(); else home();
    scrollTo(0, 0);
  }
  // ---------- 数据加载：本机预览读明文快照；发布版只有 data.enc.json，用链接 #k=口令 在浏览器里解密 ----------
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decryptEnc(env, pass) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    for (const k of env.keys) {
      const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: ub64(k.salt), iterations: env.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      let dk;
      try { dk = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(k.iv) }, kek, ub64(k.wk)); } catch (e) { continue; }   // 不是这把钥匙
      const key = await crypto.subtle.importKey('raw', dk, 'AES-GCM', false, ['decrypt']);
      const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(env.iv) }, key, ub64(env.ct));
      const txt = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      return JSON.parse(txt);
    }
    throw new Error('口令不对或已失效');
  }
  function askPass(env, msg) {
    $('#app').innerHTML = `<section class="card" style="max-width:460px;margin:40px auto"><h2>请输入访问口令</h2>
      <div class="sub">${msg || '本站内容仅限受邀访问。请使用分享给您的完整链接打开，或在下面输入口令。'}</div>
      <form id="pf" style="margin-top:14px;display:flex;gap:8px"><input id="pw" type="password" autocomplete="off" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit" aria-label="访问口令"><button class="dim on" type="submit">进入</button></form></section>`;
    $('#pf').onsubmit = ev => { ev.preventDefault(); const v = $('#pw').value.trim(); if (v) openWith(env, v); };
  }
  async function openWith(env, pass) {
    try { const d = await decryptEnc(env, pass); store.set('yc_k', pass); start(d); }
    catch (e) { store.del('yc_k'); askPass(env, '口令不对或已失效，请向分享人索取新链接。'); }
  }
  function start(d) {
    D = d;
    $('#ver').textContent = `数据：库 ${d.meta.version} · ${d.meta.exported}`;
    if (!d.meta.public) { const nav = document.querySelector('.nav');  }
    if (d.score) document.querySelector('.nav').insertAdjacentHTML('beforeend', '<a href="#/score" data-nav="score">投资分级</a>');
    if ((d.briefs || []).length) document.querySelector('.nav').insertAdjacentHTML('beforeend', '<a href="#/brief" data-nav="brief">政策简析</a>');
    if (d.meta.public) { const h = document.querySelector('[data-nav="home"]'), r = document.querySelector('[data-nav="rev"]'); if (h) h.textContent = '政策地图'; if (r) r.textContent = '收益来源全景'; document.title = '储能政策地图'; }
    const sel = $('#provSelect');
    sel.innerHTML += PROVS.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    sel.onchange = () => { if (sel.value) location.hash = '#/p/' + encodeURIComponent(sel.value); };
    addEventListener('hashchange', route); route();
  }
  if (window.__YC_DATA__) { start(window.__YC_DATA__); return; }   // 内部预览单文件：数据已内嵌，双击即开
  fetch('data/storage.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(start).catch(() =>
    fetch('data.enc.json').then(r => r.json()).then(env => {
      const m = location.hash.match(/^#k=([^&/]+)/);
      if (m) { store.set('yc_k', decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search + '#/'); }   // 口令不留在地址栏
      const pass = store.get('yc_k');
      pass ? openWith(env, pass) : askPass(env);
    })).catch(e => { $('#app').innerHTML = `<p>数据读取失败：${esc(e)}。</p>`; });
})();
