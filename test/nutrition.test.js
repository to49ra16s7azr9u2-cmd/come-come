import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyTargets, consumedOf, sumConsumed, evaluate, mergeAnalysis, NUTRIENT_KEYS } from "../public/nutrition.js";
import { FOOD_DB } from "../public/foods.js";
import { SYSTEM_PROMPT, normalizeAnalysis } from "../public/analysis.js";

const rice = { energy_kcal: 234, protein_g: 3.8, carbs_g: 55.7, fat_g: 0.5 };

test("新しい料理を追加し、残量は中央値で平滑化して減る方向にだけ更新する", () => {
  let ids = 0;
  const makeId = () => `id${++ids}`;
  const seen = (remaining_percent, visible = true) => ({ dishes: [{ id: "id1", remaining_percent, visible }] });
  let dishes = mergeAnalysis([], { dishes: [{ id: "", name: "ごはん", serving_description: "茶碗1杯", confidence: 0.9, remaining_percent: 100, visible: true, ingredients: [{ name: "ごはん", db_key: "rice", grams: 150, per100g: {} }] }] }, { makeId, now: 1, db: FOOD_DB });
  assert.equal(dishes.length, 1);
  assert.equal(dishes[0].id, "id1");
  assert.equal(dishes[0].confirmed, true);
  assert.equal(dishes[0].portion_nutrients.energy_kcal, 156 * 1.5, "成分表の値から計算する");

  dishes = mergeAnalysis(dishes, seen(40), { makeId });
  assert.equal(dishes[0].remaining_percent, 40);
  dishes = mergeAnalysis(dishes, seen(40), { makeId });
  assert.equal(dishes[0].remaining_percent, 40);

  // 推定が揺れて残量が増えても戻さない(二重計上防止)
  dishes = mergeAnalysis(dishes, seen(90), { makeId });
  assert.equal(dishes[0].remaining_percent, 40);

  // 一瞬だけ0%と誤推定しても、中央値で弾く
  dishes = mergeAnalysis(dishes, seen(0), { makeId });
  assert.equal(dishes[0].remaining_percent, 40);

  // 映っていないときは更新しない
  dishes = mergeAnalysis(dishes, seen(0, false), { makeId });
  assert.equal(dishes[0].remaining_percent, 40);
});

test("信頼度の低い新規検出は、もう一度映るまで摂取量に数えない", () => {
  const makeId = () => "x";
  const det = { id: "", name: "謎の皿", confidence: 0.4, remaining_percent: 0, visible: true, ingredients: [{ name: "何か", db_key: "", grams: 100, per100g: { energy_kcal: 300 } }] };
  let dishes = mergeAnalysis([], { dishes: [det] }, { makeId, db: FOOD_DB });
  assert.equal(dishes[0].confirmed, false);
  assert.equal(sumConsumed(dishes).energy_kcal, 0);
  dishes = mergeAnalysis(dishes, { dishes: [{ id: "x", remaining_percent: 0, visible: true }] }, { makeId });
  assert.equal(dishes[0].confirmed, true);
  assert.equal(sumConsumed(dishes).energy_kcal, 300, "表に無い食材はAIの推定値を使う");
});

test("量の補正(scale)が摂取量に反映される", () => {
  const dish = { portion_nutrients: { energy_kcal: 200 }, remaining_percent: 0, scale: 1.5 };
  assert.equal(consumedOf(dish).energy_kcal, 300);
});

test("正規化で壊れた解析結果を安全な形にする", () => {
  const a = normalizeAnalysis({ dishes: [{ name: 1, remaining_percent: "abc", ingredients: [{ grams: -5 }] }, null] });
  assert.equal(a.dishes.length, 1);
  assert.equal(a.dishes[0].name, "不明な料理");
  assert.equal(a.dishes[0].remaining_percent, 100);
  assert.equal(a.dishes[0].ingredients[0].grams, 0);
  assert.ok(SYSTEM_PROMPT.includes("rice: ごはん(精白米)"));
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
