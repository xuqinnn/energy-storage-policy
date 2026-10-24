/* MIT. Independent constructed fixtures and boundary regressions. Node standard library only. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),math=require(path.join(root,'assets/storage-math.js'));
const examples=JSON.parse(fs.readFileSync(path.join(root,'examples/method-arithmetic.json'),'utf8'));
let count=0;
for(const c of examples.cases){assert.deepEqual(math[c.kind](c.input),c.expected,c.id);count++;}
const capacity={base_yuan_per_kw_year:100,full_power_discharge_hours:4,peak_duration_hours:8};
for(const patch of [{peak_duration_hours:0},{peak_duration_hours:-1},{base_yuan_per_kw_year:Infinity},{full_power_discharge_hours:NaN},{base_yuan_per_kw_year:true},{extra:1}]){assert.throws(()=>math.capacity({...capacity,...patch}));count++;}
const charge={charge_mwh:100,energy_yuan_per_mwh:200,line_loss_yuan_per_mwh:10,system_yuan_per_mwh:20,transmission_yuan_per_mwh:30,declared_transmission_refund_yuan:0};
for(const patch of [{declared_transmission_refund_yuan:3001},{energy_yuan_per_mwh:-1},{charge_mwh:Infinity},{charge_mwh:1e308,energy_yuan_per_mwh:1e308}]){assert.throws(()=>math.charging({...charge,...patch}));count++;}
assert.throws(()=>math.charging({charge_mwh:100}));count++;
console.log(`${count} arithmetic fixture/boundary cases passed; no policy eligibility or settlement asserted.`);
