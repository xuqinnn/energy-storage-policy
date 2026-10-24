"""Rebuild eight fixed, synthetic 24-hour examples; Python standard library only.

This is a closed-form construction for these examples, not a general LP solver.
Run: python tools/park_examples.py > /tmp/park-scenarios.json
No actual project data, regional tariffs or policy eligibility are used.
"""
import hashlib
import json


def construct(case_id, group, label, load, renewable, price, energy, power,
              charge, discharge, curtailed, eta=1.0, capacity_price=0.0, wear=0.0):
    inputs = dict(load_mw=load, renewable_mw=renewable, import_price_yuan_per_mwh=price,
                  storage_energy_mwh=energy, storage_power_mw=power,
                  charge_efficiency=eta, discharge_efficiency=eta,
                  timestep_hours=1, capacity_cost_yuan_per_mw_per_horizon=capacity_price,
                  discharge_wear_yuan_per_mwh=wear)
    grid = [l - r + c + q - d for l, r, c, q, d in zip(load, renewable, curtailed, charge, discharge)]
    soc = []; stored = 0.0
    for c, d in zip(charge, discharge):
        stored += c * eta - d / eta
        soc.append(stored)
    lost = sum(charge) - sum(discharge)
    capacity = max(grid)
    energy_cost = sum(g * p for g, p in zip(grid, price))
    capacity_cost = capacity * capacity_price
    wear_cost = sum(discharge) * wear
    available = sum(renewable)
    result = dict(horizon_hours=24, load_mwh=sum(load), renewable_mwh=available,
                  grid_capacity_mw=capacity, grid_import_mwh=sum(grid),
                  curtailment_mwh=sum(curtailed), charge_mwh=sum(charge),
                  discharge_mwh=sum(discharge), storage_loss_mwh=lost,
                  renewable_utilization_fraction=(available - sum(curtailed)) / available if available else None,
                  renewable_utilization_status='defined' if available else 'undefined_no_generation',
                  energy_cost_yuan=energy_cost, capacity_cost_yuan=capacity_cost,
                  wear_cost_yuan=wear_cost, total_operating_cost_yuan=energy_cost + capacity_cost + wear_cost,
                  initial_soc_mwh=0, final_soc_mwh=stored,
                  energy_balance_residual_mwh=sum(grid) + available - sum(curtailed) - sum(load) - lost)
    return dict(id=case_id, group=group, label=label, input=inputs,
                input_sha256=hashlib.sha256(json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                result=result, dispatch=dict(grid_import_mw=grid, charge_mw=charge,
                                            discharge_mw=discharge, curtailment_mw=curtailed, soc_end_mwh=soc))


def build_examples():
    cases = []
    # Lower bound: max(energy balance / 24, peak - energy / 4).
    # A flat charge over 20 low-load hours and flat discharge over 4 high-load hours attains it.
    for energy in [0, 20, 40, 80]:
        capacity = max(320 / 24, 30 - energy / 4)
        discharged = (30 - capacity) * 4
        cases.append(construct(f'T1_E{energy}', '削峰', f'削峰 · 储能{energy} MWh',
                     [10] * 20 + [30] * 4, [0] * 24, [500] * 24, energy, energy / 2,
                     [discharged / 20] * 20 + [0] * 4, [0] * 20 + [discharged / 4] * 4,
                     [0] * 24, capacity_price=1000000))
    # A discharged MWh costs low_price / roundtrip_efficiency + wear.
    for high in [800, 240]:
        discharge = 18 if high > 200 / 0.81 + 10 else 0
        charge = discharge / 0.81
        cases.append(construct(f'T2_high{high}', '套利', f'套利 · 高价{high}元/MWh',
                     [10] * 24, [0] * 24, [200] * 12 + [high] * 12, 20, 10,
                     [charge / 12] * 12 + [0] * 12, [0] * 12 + [discharge / 12] * 12,
                     [0] * 24, eta=0.9, wear=10))
    # 4 hours with 10 MW surplus: store up to E, then discharge after the solar period.
    for energy in [0, 20]:
        cases.append(construct(f'T3_E{energy}', '消纳', f'消纳 · 储能{energy} MWh',
                     [10] * 24, [0] * 10 + [20] * 4 + [0] * 10, [500] * 24, energy, energy / 2,
                     [0] * 10 + [energy / 4] * 4 + [0] * 10,
                     [0] * 14 + [energy / 10] * 10,
                     [0] * 10 + [10 - energy / 4] * 4 + [0] * 10, wear=10))
    return dict(schema_version=1, kind='synthetic_fixed_examples',
                notice='构造的24小时循环日；8个固定场景，不支持任意输入在线求解；无实际项目或地方电价。',
                schedule_notice='各组展示一组可行的最优费用调度，逐时调度可能不唯一；套利与消纳组的最大下网功率不代表接网容量最小值。',
                qualified_project=False, cases=cases)


if __name__ == '__main__':
    print(json.dumps(build_examples(), ensure_ascii=False, indent=2, allow_nan=False))
