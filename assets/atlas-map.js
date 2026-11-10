/* Map classifiers, tile layout and palette reused from the existing public site. */
window.EnergyPolicyMap={build(D){
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
  const isMissing = f => !f || f.kind === '未采集' || f.v == null || String(f.v).trim() === '' || /^[—-]$/.test(String(f.v).trim());

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

return {tiles:TILES,metrics:Object.entries(MET()).map(([key,m])=>({key,label:m.label,note:m.note,order:m.order,provinces:PROVS.map(p=>({name:p,position:TILES[p],category:m.cat(p),color:colorOf(m,m.cat(p))}))}))};
}};
