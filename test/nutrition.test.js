import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyTargets, consumedOf, sumConsumed, evaluate, mergeAnalysis, manualDish, balanceScore, normalizeProfile, NUTRIENT_KEYS } from "../public/nutrition.js";
import { FOOD_DB, searchFoods } from "../public/foods.js";
import { BiteTracker } from "../public/detector.js";
import { t, setLang, detectLang, DICTIONARY } from "../public/i18n.js";
import { SYSTEM_PROMPT, normalizeAnalysis } from "../public/analysis.js";

const rice = { energy_kcal: 234, protein_g: 3.8, carbs_g: 55.7, fat_g: 0.5 };

test("新しい料理を追加し、残量は中央値で平滑化して減る方向にだけ更新する", () => {
  let ids = 0;
  const makeId = () => `id${++ids}`;
  const seen = (remaining_percent, visible = true) => ({ dishes: [{ id: "id1", remaining_percent, visible }] });
  let dishes = mergeAnalysis([], { dishes: [{ id: "", name: "ごはん", serving_description: "茶碗1杯", confidence: 0.9, remaining_percent: 100, visible: true, ingredients: [{ name: "ごはん", db_key: "japanese_rice", grams: 150, per100g: {} }] }] }, { makeId, now: 1, db: FOOD_DB });
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
  assert.equal(a.dishes[0].name, "?");
  assert.equal(a.dishes[0].remaining_percent, 100);
  assert.equal(a.dishes[0].ingredients[0].grams, 0);
  assert.ok(SYSTEM_PROMPT.includes("corn_tortilla: Corn tortilla / Tortilla de maíz"));
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

test("身長・体重・年齢・性別・活動量から目標エネルギーを計算する", () => {
  // Mifflin-St Jeor: 10*70 + 6.25*175 - 5*30 + 5 = 1648.75、活動「ふつう」1.55 → 2555.6 → 2560
  const p = { sex: "male", age: 30, height_cm: 175, weight_kg: 70, activity: 2, goal: "maintain", country: "MX" };
  const tg = dailyTargets(p);
  assert.equal(tg.energy_kcal.value, 2560);
  assert.equal(tg.protein_g.value, 56, "メキシコ/国際基準はたんぱく質 0.8 g/kg");
  assert.equal(tg.salt_g.value, 5, "WHO の食塩 5 g");
  assert.equal(tg.iron_mg.value, 8);
  assert.equal(dailyTargets({ ...p, goal: "lose" }).energy_kcal.value, 2060);
  assert.equal(dailyTargets({ ...p, sex: "female", age: 40 }).iron_mg.value, 18);
  assert.equal(dailyTargets({ ...p, country: "JP" }).salt_g.value, 7.5);
  // 旧形式のプロフィールも読める
  assert.equal(normalizeProfile({ age: "30-49" }).age, 30);
});

test("目標と比較して不足・適量・過剰を判定し、100点満点で採点する", () => {
  const targets = dailyTargets({ sex: "male", age: 30, height_cm: 175, weight_kg: 70, activity: 2 });
  const total = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  total.energy_kcal = targets.energy_kcal.value;
  total.protein_g = 80;
  total.salt_g = 9;
  total.fat_g = targets.fat_g.max + 1;
  const results = evaluate(total, targets);
  const byKey = Object.fromEntries(results.map((r) => [r.key, r.status]));
  assert.equal(byKey.energy_kcal, "ok");
  assert.equal(byKey.protein_g, "ok");
  assert.equal(byKey.salt_g, "high");
  assert.equal(byKey.fat_g, "high");
  assert.equal(byKey.vitamin_c_mg, "low");

  const perfect = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, targets[k].value]));
  assert.equal(balanceScore(evaluate(perfect, targets)), 100);
  assert.ok(balanceScore(results) < 60);
  assert.equal(balanceScore(evaluate(Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])), targets)), 7, "何も食べていなければ食塩の分だけ");
});

test("食品検索はスペイン語・英語・日本語とアクセント無しで引ける", () => {
  assert.equal(searchFoods("platano")[0].key, "banana");
  assert.equal(searchFoods("tortilla", "ja")[0].name, "コーントルティーヤ");
  assert.equal(searchFoods("ごはん")[0].key, "japanese_rice");
  assert.equal(searchFoods("beans")[0].key, "beans_boiled");
  const dish = manualDish({ key: "corn_tortilla", name: "Tortilla", grams: 60, meal: "lunch", db: FOOD_DB, makeId: () => "m" });
  assert.equal(Math.round(consumedOf(dish).energy_kcal), 131);
});

test("食器が口元に入って出ると1口と数え、連続判定はしない", () => {
  const person = { label: "person", box: [100, 0, 200, 400] };
  const fork = (y) => ({ label: "fork", box: [180, y, 30, 60] });
  const b = new BiteTracker({ minDwellMs: 200, cooldownMs: 1000 });
  assert.equal(b.update([person, fork(300)], 0), false);
  assert.equal(b.update([person, fork(40)], 100), false);
  assert.equal(b.update([person, fork(40)], 400), false);
  assert.equal(b.update([person, fork(300)], 500), true);
  // すぐに次の出入りがあってもクールダウン中は数えない
  b.update([person, fork(40)], 600);
  assert.equal(b.update([person, fork(300)], 900), false);
  assert.equal(b.bites, 1);
  // 人が映っていなければ数えない
  assert.equal(b.update([fork(40)], 3000), false);
});

test("文言は既定でスペイン語、ブラウザの言語に合わせて切り替わる", () => {
  assert.equal(detectLang(["fr-FR", "de"]), "es");
  assert.equal(detectLang(["ja-JP"]), "ja");
  setLang("es");
  assert.equal(t("meal.lunch"), "Comida");
  assert.equal(t("today.remaining", { kcal: 300 }), "Te quedan 300 kcal");
  setLang("ja");
  assert.equal(t("n.salt_g"), "食塩相当量");
  // 全言語で同じキーが揃っている
  const keys = Object.keys(DICTIONARY.es).sort();
  assert.deepEqual(Object.keys(DICTIONARY.en).sort(), keys);
  assert.deepEqual(Object.keys(DICTIONARY.ja).sort(), keys);
  setLang("es");
});
