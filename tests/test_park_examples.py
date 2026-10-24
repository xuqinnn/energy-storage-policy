"""Conservation, physical bounds and independent closed-form expectations."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('park_examples', ROOT / 'tools/park_examples.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class ParkExamplesTest(unittest.TestCase):
    def cases(self):
        return module.build_examples()['cases']

    def test_frozen_examples_reproduce(self):
        frozen = json.loads((ROOT / 'examples/park-scenarios.json').read_text())
        self.assertEqual(frozen, module.build_examples())
        self.assertFalse(frozen['qualified_project'])
        self.assertEqual(len(frozen['cases']), 8)

    def test_hourly_energy_soc_and_bounds(self):
        for case in self.cases():
            with self.subTest(case=case['id']):
                x, d, r = case['input'], case['dispatch'], case['result']; previous = 0
                for hour in range(24):
                    g, c, q, b, soc = [d[k][hour] for k in ['grid_import_mw', 'charge_mw', 'curtailment_mw', 'discharge_mw', 'soc_end_mwh']]
                    self.assertAlmostEqual(g + x['renewable_mw'][hour] - c + b - q, x['load_mw'][hour], places=8)
                    self.assertAlmostEqual(soc, previous + c * x['charge_efficiency'] - b / x['discharge_efficiency'], places=8)
                    self.assertGreaterEqual(min(g, c, q, b, soc), -1e-8)
                    self.assertLessEqual(soc, x['storage_energy_mwh'] + 1e-8)
                    self.assertLessEqual(max(c, b), x['storage_power_mw'] + 1e-8)
                    self.assertLessEqual(q, x['renewable_mw'][hour] + 1e-8)
                    self.assertLessEqual(g, r['grid_capacity_mw'] + 1e-8)
                    self.assertAlmostEqual(c * b, 0)
                    previous = soc
                self.assertAlmostEqual(previous, 0, places=8)
                self.assertAlmostEqual(r['energy_balance_residual_mwh'], 0, places=8)
                self.assertAlmostEqual(r['energy_cost_yuan'], sum(g * p for g, p in zip(d['grid_import_mw'], x['import_price_yuan_per_mwh'])))
                self.assertAlmostEqual(r['total_operating_cost_yuan'], r['energy_cost_yuan'] + r['capacity_cost_yuan'] + r['wear_cost_yuan'])

    def test_peak_lower_bounds_are_attained(self):
        for c, peak in zip(self.cases()[:4], [30, 25, 20, 320 / 24]):
            self.assertAlmostEqual(c['result']['grid_capacity_mw'], peak)
            self.assertAlmostEqual(c['result']['grid_import_mwh'], 320)
            self.assertAlmostEqual(c['result']['energy_cost_yuan'], 160000)
            self.assertIsNone(c['result']['renewable_utilization_fraction'])

    def test_arbitrage_break_even_and_efficiency(self):
        high, low = [c['result'] for c in self.cases()[4:6]]
        self.assertAlmostEqual(high['discharge_mwh'], 18)
        self.assertAlmostEqual(high['discharge_mwh'] / high['charge_mwh'], 0.81)
        self.assertAlmostEqual(high['energy_cost_yuan'], 110044.44444444444)
        self.assertAlmostEqual(high['wear_cost_yuan'], 180)
        self.assertAlmostEqual(low['discharge_mwh'], 0)
        self.assertAlmostEqual(low['energy_cost_yuan'], 52800)

    def test_curtailment_denominator_and_fees(self):
        for c, curtailed, grid, fraction, cost in zip(self.cases()[6:], [40, 20], [200, 180], [0.5, 0.75], [100000, 90200]):
            r = c['result']; self.assertAlmostEqual(r['curtailment_mwh'], curtailed)
            self.assertAlmostEqual(r['grid_import_mwh'], grid)
            self.assertAlmostEqual(r['renewable_utilization_fraction'], fraction)
            self.assertAlmostEqual(r['total_operating_cost_yuan'], cost)


if __name__ == '__main__':
    unittest.main()
