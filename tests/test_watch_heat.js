const assert = require('node:assert/strict');
global.window = {};
global.document = {documentElement: {lang: 'zh-CN'}};
require('../assets/watch-channels.js');

const watch = window.EnergyWatchChannels;
const tiles = watch.provinceTiles({蒙东:[8,0], 蒙西:[6,1], 辽宁:[9,2], 河北:[7,2]});
const policy = {kind:'policy', date:'2026-11-10', topics:['储能','电力市场']};
const records = [
  {...policy, region:'辽宁', importance:5},
  {...policy, region:'辽宁', importance:3, topics:['储能']},
  {...policy, region:'辽宁', importance:null},
  {...policy, region:'辽宁', importance:6},
  {...policy, region:'辽宁', importance:5, kind:'notice'},
  {...policy, region:'辽宁', importance:5, date:''},
  {...policy, region:'全国', importance:5},
  {...policy, region:'蒙东', importance:4},
  {...policy, region:'内蒙古', importance:2},
  {...policy, region:'河北·冀北', importance:3},
];
const heat = watch.provinceHeat(records, tiles);
assert.deepEqual(Object.keys(tiles), ['内蒙古','辽宁','河北']);
assert.equal(heat.get('辽宁').score, 8);
assert.equal(heat.get('辽宁').rows.length, 4);
assert.equal(heat.get('辽宁').unrated, 2);
assert.equal(heat.get('内蒙古').score, 6);
assert.equal(heat.get('河北').score, 3);
assert.equal(heat.has('全国'), false);
const topic = watch.provinceHeat(records, tiles, '电力市场');
assert.equal(topic.get('辽宁').score, 5);
assert.equal(topic.get('辽宁').unrated, 2);
assert.match(watch.map(topic, tiles, '辽宁', 8), /data-heat-score="5"/);
assert.match(watch.map(topic, tiles, '辽宁', 8), /--heat:67%/);
assert.equal(watch.provinceHeat(records, tiles, '绿电直连').size, 0);
console.log('Policy heat sums individual ratings with topic, province, and source-type boundaries.');

const raw = {
  docs:{ZCLN01:{kind:'政策'},ZCLN02:{kind:'政策'},ZCLN03:{kind:'政策'},ZCGJ01:{kind:'政策'},ZCHB01:{kind:'政策'}},
  topics:[{名:'储能',rows:{辽宁:{'②c9':'【ZCLN01】【ZCLN02】【ZCLN03】【ZCGJ01】【ZCHB01】'}}}],
};
const documents = new Map([
  ['ZCLN01',{status:'已替代',region:'辽宁'}],
  ['ZCLN02',{status:'现行有效',effective:'2027-01-01',region:'辽宁'}],
  ['ZCLN03',{status:'现行有效',region:'辽宁',kind:'notice'}],
  ['ZCGJ01',{status:'现行有效',region:'全国'}],
  ['ZCHB01',{status:'现行有效',region:'河北'}],
]);
const evidence = watch.investmentEvidence(raw,documents,tiles,'储能','②c9','2026-11-12');
assert.equal(evidence.get('辽宁').band, 'pending');
assert.equal(evidence.get('辽宁').items.length, 2);
assert.equal(evidence.has('河北'), false);
assert.equal(watch.investmentEvidence(raw,documents,tiles,'储能','②c17','2026-11-12').size, 0);
console.log('Topic investment tiers are criterion-bound, region-bound, and effective-date aware.');
