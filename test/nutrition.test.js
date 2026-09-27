import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyTargets, consumedOf, sumConsumed, evaluate, mergeAnalysis, NUTRIENT_KEYS } from "../public/nutrition.js";

const rice = { energy_kcal: 234, protein_g: 3.8, carbs_g: 55.7, fat_g: 0.5 };

test("新しい料理を追加し、既知の料理の残量は減る方向にだけ更新する", () => {
  let ids = 0;
  const makeId = () => `id${++ids}`;
  let dishes = mergeAnalysis([], { dishes: [{ id: "", name: "ごはん", serving_description: "茶碗1杯", portion_nutrients: rice, remaining_percent: 100, visible: true }] }, { makeId, now: 1 });
  assert.equal(dishes.length, 1);
  assert.equal(dishes[0].id, "id1");

  dishes = mergeAnalysis(dishes, { dishes: [{ id: "id1", name: "ごはん", portion_nutrients: { energy_kcal: 999 }, remaining_percent: 40, visible: true }] }, { makeId });
  assert.equal(dishes[0].remaining_percent, 40);
  assert.equal(dishes[0].portion_nutrients.energy_kcal, 234, "最初の推定値を維持する");

  // 推定が揺れて残量が増えても戻さない(二重計上防止)
  dishes = mergeAnalysis(dishes, { dishes: [{ id: "id1", remaining_percent: 70, visible: true }] }, { makeId });
  assert.equal(dishes[0].remaining_percent, 40);

  // 映っていないときは残量を更新しない
  dishes = mergeAnalysis(dishes, { dishes: [{ id: "id1", remaining_percent: 0, visible: false }] }, { makeId });
  assert.equal(dishes[0].remaining_percent, 40);
});

test("食べた割合に応じて栄養素を計算する", () => {
  const dish = { portion_nutrients: rice, remaining_percent: 25 };
  const c = consumedOf(dish);
  assert.equal(c.energy_kcal, 234 * 0.75);
  assert.equal(c.fiber_g, 0);
  const total = sumConsumed([dish, dish]);
  assert.equal(total.energy_kcal, 234 * 1.5);
  assert.deepEqual(Object.keys(total), NUTRIENT_KEYS);
});

test("目標と比較して不足・適量・過剰を判定する", () => {
  const targets = dailyTargets({ sex: "male", age: "30-49", activity: 1 });
  assert.equal(targets.energy_kcal.value, 2700);
  const total = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  total.energy_kcal = 2700;
  total.protein_g = 80;
  total.salt_g = 9;
  total.fat_g = targets.fat_g.max + 1;
  const byKey = Object.fromEntries(evaluate(total, targets).map((r) => [r.key, r.status]));
  assert.equal(byKey.energy_kcal, "ok");
  assert.equal(byKey.protein_g, "ok");
  assert.equal(byKey.salt_g, "high");
  assert.equal(byKey.fat_g, "high");
  assert.equal(byKey.vitamin_c_mg, "low");
});
