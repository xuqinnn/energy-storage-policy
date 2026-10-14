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
      : `<b>${esc(c.dataset.code)}</b><br>库内未登记或非①⑦表件`;
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
    if (!s || /无省级容量补偿/.test(s)) return '库内未见省级容量补偿';
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
  const METRICS = {
    grade: { group: '研判', label: '投资分级', cat: gradeOf, order: ['优先开发', '储备开发', '谨慎开发', '未评'], note: '综合容量电价是否出台、现货成熟度、收益确定性与退坡风险' },
    cap: { group: '政策', label: '容量电价／补偿', cat: capPolicy, order: ['已出台', '征求意见稿', '其他补偿形式', '已过期', '库内未见省级容量补偿', '待核'], note: '「库内未见」＝本库尚未收到该省正式文件，不等于没有规定' },
    list: { group: '政策', label: '清单制管理', cat: listOf, order: ['清单制', '清单制·征求稿', '非清单制', '未采集', '待核'], note: '只有纳入省级清单的项目才享受容量电价（补偿）' },
    charge: { group: '政策', label: '充电费用承担', cat: chargeOf, order: ['A0', 'A1', 'A2', 'B', 'A2（待证实）', '待查'], note: 'A0 四项全免 · A1 只担线损 · A2 免输配与基金、仍缴系统运行费 · B 视同用户全额缴纳' },
    stage: { group: '市场', label: '现货市场阶段', cat: stageOf, order: ['正式运行', '连续结算试运行', '结算试运行', '启动模拟试运行', '模拟试运行', '未开展', '待核'], note: '现货价差是储能电能量收益的来源' },
    ramp: { group: '风险', label: '补偿退坡风险', cat: rampOf, order: ['高', '中高', '中', '中低', '低', '待定', '无补偿·不适用', '未采集', '待核'], note: '现行容量补偿标准下调或并轨的风险' }
  };
  const PUB = () => !!(D && D.meta && D.meta.public);     // 对外版：不含投资分级、收益测算金额与内部信息（用户 10-14）
  const MET = () => PUB() ? Object.fromEntries(Object.entries(METRICS).filter(([k]) => k !== 'grade')) : METRICS;
  const PAL = ['#2F4B8A', '#5B78BD', '#97AAD7', '#CBD5EC', '#E9C46A', '#EFE3CF', '#CBCED4', '#EFEDE6', '#EFEDE6'];
  const FIXED = { '征求意见稿': '#E9C46A', '清单制·征求稿': '#E9C46A', '谨慎开发': '#EFE3CF', '高': '#C9553F', '中高': '#E39A7E', '中': '#EFC9A8', '中低': '#CBD5EC', '低': '#97AAD7' };
  const colorOf = (m, c) => FIXED[c] || (/未采集|待核|待查|未评|库内未见|不适用|未开展/.test(c) ? '#EFEDE6' : PAL[Math.max(0, m.order.indexOf(c))] || '#EFEDE6');
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
    if (PUB() && S.metric === 'grade') S.metric = 'cap';
    const groups = [...new Set(Object.values(MET()).map(m => m.group))];
    app.innerHTML = `
      <section class="hero">
        <div><div class="eyebrow">电网侧独立储能 · ${PUB() ? '政策地图' : '投资分级地图'}</div>
          <h1>${PUB() ? '各省储能政策走到了哪一步' : '哪些省优先做、哪些省先储备'}</h1>
          <p class="lede">${PUB() ? '看各省容量电价（补偿）是否出台、清单制、充电费用规则、现货市场阶段与退坡风险。' : '分级综合看容量电价（补偿）是否出台、现货市场成熟度、收益确定性与退坡风险。'}地图可切换着色维度、点图例筛选；点任一省进入它的「政策－开发－问题」看板。每个结论都能回到红头文件与页码。</p></div>
      </section>
      <section class="kpis">
        ${PUB() ? `<div class="kpi"><div class="k">实行清单制管理</div><div class="v">${PROVS.filter(p => /^清单制/.test(listOf(p))).length}</div><div class="n">只有入清单的项目才享受容量电价（补偿）</div></div>`
          : `<div class="kpi"><div class="k">优先开发</div><div class="v">${cnt('优先开发')}</div><div class="n">储备开发 ${cnt('储备开发')} 省 · 谨慎开发 ${cnt('谨慎开发')} 省</div></div>`}
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
      <section class="card" style="margin-top:20px"><h2>分级清单与各省速览</h2><div class="sub" id="tblSub"></div>
        <div class="tablewrap"><table class="t" id="tbl"></table></div></section>`;
    app.querySelectorAll('[data-dim]').forEach(b => b.onclick = () => { S.metric = b.dataset.dim; S.pick = null; home(); });
    drawTiles(); drawTable();
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
    ['投资分级', gradeOf],
    ['容量机制', capLine],
    ['政策状态', p => first1(p, '⑧c8') || '—'],
    ['清单制', listOf],
    ['现货阶段', stageOf],
    ['充电费用', chargeOf],
    ['退坡风险', rampOf],
    ['收益确定性', p => (first1(p, '⑧c3').split(/[（(]/)[0]) || '未评']
  ];
  const ORDER = { '优先开发': 0, '储备开发': 1, '谨慎开发': 2, '未评': 3 };
  let sortK = 1, sortDir = 1;
  function drawTable() {
    const m = METRICS[S.metric];
    const cols = PUB() ? COLS.filter(c => !['投资分级', '收益确定性'].includes(c[0])) : COLS;
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

  function revenue() {
    if (PUB()) return sources();
    const ps = PROVS.filter(p => D.provinces[p] && F(p, '⑧c21'))
      .sort((a, b) => (ORDER[gradeOf(a)] - ORDER[gradeOf(b)]) || a.localeCompare(b, 'zh'));
    const R = Object.fromEntries(ps.map(p => [p, revOf(p)]));
    $('#app').innerHTML = `
      <section class="hero"><div><div class="eyebrow">电网侧独立储能 · 收益构成全景</div>
        <h1>一座标杆电站一年能挣哪几块钱</h1>
        <p class="lede">标杆项目 200MW／800MWh（4 小时）。每省拆成现货套利、容量收益、调频与过网成本四层，每层标明能不能算、依据是否生效。<b>互斥的不相加</b>：容量电价（补偿）与容量租赁是同一块容量，只能二选一，取较高者。</p></div></section>
      <div class="legend" style="margin:0 0 14px">
        <span><span class="sw" style="background:#97AAD7"></span>现货套利（量级参考）</span>
        <span><span class="sw" style="background:#2F4B8A"></span>容量收益·已出台</span>
        <span><span class="sw" style="background:#E9C46A"></span>容量收益·征求稿未生效</span>
        <span><span class="sw" style="background:#5BA08A"></span>容量收益·未来起执行</span>
        <span><span class="sw" style="background:#D8A39D"></span>过网成本（另列，未从合计扣除）</span>
      </div>
      <section class="card"><h2>各省收益构成（万元/年）</h2>
        <div class="sub">按投资分级分组。现货套利来自单季价差外推，<b>只作量级参考，不用于跨省排序</b>；调频、辅助服务尚未测算年收益。</div>
        <div class="chart" id="revchart" style="height:${Math.max(420, ps.length * 26 + 60)}px"></div></section>
      <section class="card" style="margin-top:20px"><h2>逐层明细</h2><div class="sub">悬停编号看依据文件与当前状态。「未采集」不等于没有这项收益。</div>
        <div class="tablewrap"><table class="t rev"><thead><tr><th>省份</th><th>分级</th><th>现货套利</th><th>容量电价／补偿</th><th>容量租赁</th><th>计入的容量收益</th><th>调频</th><th>过网成本</th><th>可点算合计</th></tr></thead>
        <tbody>${ps.map(p => { const r = R[p]; const f = v => v != null ? Math.round(v).toLocaleString() : '—';
          return `<tr><td><a href="#/p/${encodeURIComponent(p)}">${esc(p)}</a></td><td>${esc(gradeOf(p))}</td>
            <td class="mono">${f(r.spot)} <span class="st none">量级参考</span></td>
            <td class="mono">${r.cap ? f(r.cap) + ' ' + citeHTML(sourcesOf(p, '⑧c4')) : '<span style="color:var(--mute)">' + esc(capPolicy(p) === '库内未见省级容量补偿' ? '库内未见' : capPolicy(p)) + '</span>'}</td>
            <td class="mono">${r.lease != null ? f(r.lease) : '<span style="color:var(--mute)">未采集</span>'}</td>
            <td class="mono">${f(r.capV)} <span class="st ${TAGCLS(r.capTag)}">${esc(r.capTag)}</span>${r.lease != null && r.cap ? '<div class="note">补偿与租赁二选一，取' + (r.useLease ? '租赁' : '补偿') + '</div>' : ''}</td>
            <td style="font-size:13px;color:var(--ink2)">${esc(r.fmTag)}</td>
            <td class="mono">${f(r.cost)}</td>
            <td class="mono"><b>${f(r.total)}</b></td></tr>`; }).join('')}</tbody></table></div>
        <ul class="rules" style="margin-top:14px;font-size:13.5px;color:var(--ink2)">
          <li><b>可点算合计</b>＝现货套利＋容量收益（补偿与租赁二选一取高）。调频、顶峰等辅助服务与过网成本未计入。</li>
          <li><b>未来起执行</b>（如安徽 2027-01-01）：执行前没有这块现金流，合计里的容量收益是执行后的年化值。</li>
          <li><b>征求稿</b>：尚未生效，数值可能变；正式稿出台后本页随库更新。</li>
          <li><b>过网成本</b>＝年充电量 × 储能实际承担的过网单价（输配电费、系统运行费、政府性基金按本省规则折减，线损未计）。甘肃、重庆、河南、北京、山西等省充电时全额承担，所以偏高——这些省的现货套利要先扣掉这块再看。</li>
        </ul></section>`;
    const el = $('#revchart');
    const ch = echarts.init(el, null, { renderer: 'svg' });
    new ResizeObserver(() => ch.resize()).observe(el);
    const capColor = t => /征求/.test(t) ? '#E9C46A' : /^20\d\d/.test(t) ? '#5BA08A' : '#2F4B8A';
    const names = ps.map(p => `${p}（${gradeOf(p).slice(0, 2)}）`);
    ch.setOption({
      grid: { left: 110, right: 40, top: 10, bottom: 30 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: qs => { const p = ps[qs[0].dataIndex], r = R[p];
        return `<b>${p}</b>（${gradeOf(p)}）<br>现货套利 ${r.spot != null ? Math.round(r.spot) : '—'}（量级参考）<br>容量收益 ${Math.round(r.capV)}（${r.capTag}）<br>调频：${r.fmTag}<br>过网成本 ${r.cost != null ? Math.round(r.cost) : '—'}（另列）`; } },
      xAxis: { type: 'value', axisLabel: { color: '#5F6670' }, splitLine: { lineStyle: { color: '#EFEDE6' } } },
      yAxis: { type: 'category', inverse: true, data: names, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#1B1F24', fontSize: 12.5 } },
      series: [
        { name: '现货套利', type: 'bar', stack: 'r', barWidth: 13, data: ps.map(p => R[p].spot || 0), itemStyle: { color: '#97AAD7' } },
        { name: '容量收益', type: 'bar', stack: 'r', data: ps.map(p => ({ value: Math.round(R[p].capV), itemStyle: { color: capColor(R[p].capTag) } })) },
        { name: '过网成本', type: 'bar', stack: 'c', barWidth: 13, data: ps.map(p => R[p].cost ? -Math.round(R[p].cost) : 0), itemStyle: { color: '#D8A39D' } }
      ]
    });
    ch.on('click', q => { location.hash = '#/p/' + encodeURIComponent(ps[q.dataIndex]); });
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
      ${full.length > one.length + 4 || (f.cites || []).length ? `<details><summary>展开原文摘录与依据</summary><div class="full">${citeHTML(full)}</div>${pagesLine(f)}</details>` : ''}</div>`;
  }
  function pagesLine(f) {     // 依据页码：格内已标／自动定位（溯源/引用页码.jsonl）
    const seen = new Set(), parts = [];
    (f.cites || []).forEach(c => { const k = c.code + '|' + c.page; if (seen.has(k)) return; seen.add(k);
      parts.push(`<button type="button" class="cite ${D.docs[c.code] ? statusClass(D.docs[c.code].status) : 'none'}" data-code="${c.code}">${c.code}</button>` +
        (c.page != null ? `<span class="mono"> p${c.page}</span>${c.how && c.how !== '格内已标' ? '<span class="note" style="display:inline"> ·' + esc(c.how) + '</span>' : ''}` : '<span class="note" style="display:inline"> 页码待定位</span>')); });
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
    const chips = [...(PUB() ? [] : [['投资分级', c2], ['收益确定性', (V(p, '⑧c3') || '未评').split(/[（(]/)[0]]]), ['现货阶段', stageOf(p)], ['清单制', listOf(p)], ['充电费用', chargeOf(p)],
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
          ${item(p, '②c17', '清单制')}${item(p, '②c16', '现货报价方式')}${item(p, '⑧c31', '现行标准生效／到期')}${item(p, '⑧c34', '下次调整窗口')}${item(p, '⑧c32', '调整机制')}${item(p, '⑧c33', '历史退坡轨迹')}
          <div class="todo">申报窗口、门槛与股权锁定期：专题汇编中${PUB() ? '' : '（T623）'}，完成后在此显示。</div></div>
        <div class="card col"><h2>问题 <small>风险与待核</small></h2>
          ${PUB() ? riskFromCard(p) + item(p, '⑧c35', '退坡·并轨风险') + item(p, '⑧c53', '节点价差')
                  : item(p, '⑧c26', '风险与注意事项') + item(p, '⑧c24', '校核结论') + item(p, '⑧c30', '测算局限') + item(p, '⑧c53', '节点价差')}
          ${missingList(p)}</div>
      </section>`;
    drawCalc(p);
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
    if (m) province(m[1]); else if (h === '#/about') about(); else if (h === '#/rev') revenue(); else home();
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
    if (d.meta.public) { const h = document.querySelector('[data-nav="home"]'), r = document.querySelector('[data-nav="rev"]'); if (h) h.textContent = '政策地图'; if (r) r.textContent = '收益来源全景'; document.title = '储能政策地图'; }
    const sel = $('#provSelect');
    sel.innerHTML += PROVS.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    sel.onchange = () => { if (sel.value) location.hash = '#/p/' + encodeURIComponent(sel.value); };
    addEventListener('hashchange', route); route();
  }
  fetch('data/storage.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(start).catch(() =>
    fetch('data.enc.json').then(r => r.json()).then(env => {
      const m = location.hash.match(/^#k=([^&/]+)/);
      if (m) { store.set('yc_k', decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search + '#/'); }   // 口令不留在地址栏
      const pass = store.get('yc_k');
      pass ? openWith(env, pass) : askPass(env);
    })).catch(e => { $('#app').innerHTML = `<p>数据读取失败：${esc(e)}。</p>`; });
})();
