/* Independently implemented teaching arithmetic. MIT; no policy or project inputs. */
(function(root){
  'use strict';
  const capacityKeys=['base_yuan_per_kw_year','full_power_discharge_hours','peak_duration_hours'];
  const chargeKeys=['charge_mwh','energy_yuan_per_mwh','line_loss_yuan_per_mwh','system_yuan_per_mwh','transmission_yuan_per_mwh','declared_transmission_refund_yuan'];
  const labels={base_yuan_per_kw_year:'输入基准',full_power_discharge_hours:'满功率放电时长',peak_duration_hours:'高峰持续时长',charge_mwh:'充电量',energy_yuan_per_mwh:'电能量单价',line_loss_yuan_per_mwh:'线损单价',system_yuan_per_mwh:'系统运行费单价',transmission_yuan_per_mwh:'输配单价',declared_transmission_refund_yuan:'声明的本账期输配退减'};
  function input(x,keys){
    if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==keys.length||Object.keys(x).some(k=>!keys.includes(k)))throw Error('请完整填写本工具的输入项。');
    keys.forEach(k=>{if(typeof x[k]!=='number'||!Number.isFinite(x[k])||x[k]<0)throw Error(labels[k]+'须为有限非负数。');});
  }
  function finite(values){if(values.some(v=>!Number.isFinite(v)))throw Error('数值过大，请核对单位和数量。');}
  function capacity(x){
    input(x,capacityKeys);if(x.peak_duration_hours<=0)throw Error('高峰持续时长须大于0。');
    const ratio=Math.min(x.full_power_discharge_hours/x.peak_duration_hours,1),reference=x.base_yuan_per_kw_year*ratio;finite([ratio,reference]);
    return {duration_fraction:ratio,reference_component_yuan_per_kw_year:reference,final_capacity_rate_yuan_per_kw_year:null,annual_receipt_yuan:null,meaning:'duration-scaled reference component only',eligibility_verified:false,settlement_verified:false};
  }
  function charging(x){
    input(x,chargeKeys);
    const fee_lines=['energy','line_loss','system','transmission'].map(item=>({item,quantity_mwh:x.charge_mwh,rate_yuan_per_mwh:x[item+'_yuan_per_mwh'],amount_yuan:x.charge_mwh*x[item+'_yuan_per_mwh']}));finite(fee_lines.map(f=>f.amount_yuan));
    const transmission=fee_lines[3].amount_yuan,refund=x.declared_transmission_refund_yuan;
    if(refund>transmission)throw Error('本简化工具不支持超过当期输配计费金额的退减；跨期情况须核完整台账。');
    const gross=fee_lines.reduce((s,f)=>s+f.amount_yuan,0),net=gross-refund;finite([gross,net]);
    return {fee_lines,gross_charge_yuan:gross,declared_transmission_refund_yuan:refund,transmission_after_declared_refund_yuan:transmission-refund,arithmetic_net_yuan:net,refund_basis:'caller-declared, not inferred from discharge or approved here',settlement_verified:false,scope:'four declared items only; not an exhaustive project bill'};
  }
  const api=Object.freeze({capacity,charging});root.StorageMath=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
