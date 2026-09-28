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

test("料理名もスペイン語・英語・日本語で検索でき、1皿の重さが分かる", async () => {
  const { searchDishes, dishGrams } = await import("../public/dishes.js");
  assert.equal(searchDishes("chilaquil")[0].key, "chilaquiles");
  assert.equal(searchDishes("エンチラーダ", "ja")[0].key, "enchiladas");
  assert.equal(searchDishes("pozole", "en")[0].name, "Pozole");
  assert.equal(dishGrams("pozole"), 400);
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

test("料理一覧の材料はすべて成分表にあり、端末内AIの分類ヘッドと一致する", async () => {
  const { DISHES, DISH_KEYS, bitesPerServing, dishPrompts } = await import("../public/dishes.js");
  for (const [key, d] of Object.entries(DISHES)) {
    assert.ok(d.recipe.length > 0, key);
    for (const r of d.recipe) assert.ok(FOOD_DB[r.db_key], `${key}: ${r.db_key}`);
    assert.ok(bitesPerServing(key) > 0);
    assert.equal(dishPrompts(key).length, 4);
  }
  const { readFile } = await import("node:fs/promises");
  const head = JSON.parse(await readFile(new URL("../public/models/dish-head.json", import.meta.url), "utf8"));
  // 分類ヘッドが知っている料理は、すべて料理一覧にある必要がある(一覧に料理を追加しただけの段階では、ヘッドの方が少なくてよい)
  for (const k of head.keys) assert.ok(DISHES[k], `分類ヘッドの料理 ${k} が料理一覧にない。ml/train.mjs で作り直す`);
  assert.equal((head.W ?? head.prototypes).length, head.keys.length);
  if (head.W) assert.equal(head.b.length, head.keys.length);
});

test("端末内AIの確率計算と多数決", async () => {
  const { scoreEmbedding, DishVote } = await import("../public/classifier.js");
  const head = { keys: ["a", "b"], prototypes: [[1, 0, 0], [0, 1, 0]], nonFood: [[0, 0, 1]] };
  const r = scoreEmbedding([2, 0.1, 0], head);
  assert.equal(r[0].key, "a");
  assert.ok(Math.abs(r.reduce((s, x) => s + x.prob, 0) - 1) < 1e-9);
  assert.equal(scoreEmbedding([0, 0, 5], head)[0].key, null, "料理ではないもの");
  const v = new DishVote({ window: 5, minVotes: 3, minProb: 0.35 });
  assert.equal(v.push({ key: "a", prob: 0.9 }), null);
  assert.equal(v.push({ key: "b", prob: 0.9 }), null);
  assert.equal(v.push({ key: "a", prob: 0.2 }), null, "確率の低いフレームは数えない");
  assert.equal(v.push({ key: "a", prob: 0.6 }), null);
  const out = v.push({ key: "a", prob: 0.6 });
  assert.equal(out.key, "a");
  assert.ok(Math.abs(out.prob - 0.7) < 1e-9, "確率は投票したフレームの平均");

  // 候補は直近フレームの確率の平均で上位から(料理ではないものは除く)
  const w = new DishVote({ window: 3 });
  w.push([{ key: "a", prob: 0.5 }, { key: "b", prob: 0.3 }, { key: null, prob: 0.2 }]);
  w.push([{ key: "b", prob: 0.6 }, { key: "a", prob: 0.3 }, { key: "c", prob: 0.1 }]);
  assert.deepEqual(w.candidates(2).map((c) => c.key), ["b", "a"]);

  // 学習した分類ヘッド(W·x + b)と「料理ではない」判定
  const lin = { keys: ["a", "b"], W: [[0, 50, 0], [50, 0, 0]], b: [0, 0], textPrototypes: [[1, 0, 0], [0, 1, 0]], nonFood: [[0, 0, 1]] };
  assert.equal(scoreEmbedding([1, 0.2, 0], lin)[0].key, "b", "W の重みで判別する");
  assert.equal(scoreEmbedding([0, 0, 1], lin)[0].key, null);
});

test("クラウドの解析結果から料理キーと候補を受け取り、知らないキーは捨てる", () => {
  const a = normalizeAnalysis({
    dishes: [{ name: "Tacos", dish_key: "tacos_asada", alternatives: ["tacos_pastor", "no_such_dish", "tacos_carnitas", "tostadas"], remaining_percent: 100, ingredients: [] }],
  });
  assert.equal(a.dishes[0].dish_key, "tacos_asada");
  assert.deepEqual(a.dishes[0].alternatives, ["tacos_pastor", "tacos_carnitas"]);
  const [d] = mergeAnalysis([], { dishes: [{ ...a.dishes[0], id: "", visible: true, confidence: 0.9 }] }, { makeId: () => "c1" });
  assert.equal(d.dishKey, "tacos_asada");
  assert.deepEqual(d.candidates, ["tacos_asada", "tacos_pastor", "tacos_carnitas"]);
  assert.equal(normalizeAnalysis({ dishes: [{ dish_key: "made_up" }] }).dishes[0].dish_key, "");
});

test("州の郷土料理を少しだけ優先し、確率の合計は1のまま", async () => {
  const { applyStatePrior } = await import("../public/classifier.js");
  const ranked = [{ key: "a", prob: 0.5 }, { key: "b", prob: 0.4 }, { key: null, prob: 0.1 }];
  const r = applyStatePrior(ranked, ["b"]);
  assert.equal(r[0].key, "b", "0.4×1.5=0.6 > 0.5");
  assert.ok(Math.abs(r.reduce((s, x) => s + x.prob, 0) - 1) < 1e-9);
  assert.equal(applyStatePrior([{ key: "a", prob: 0.9 }, { key: "b", prob: 0.1 }], ["b"])[0].key, "a", "画像の判断が強ければ覆さない");
  assert.deepEqual(applyStatePrior(ranked, []), ranked);
});

test("32州すべてに郷土料理があり、料理一覧に存在する", async () => {
  const { STATES, DISHES, dishStates } = await import("../public/dishes.js");
  assert.equal(Object.keys(STATES).length, 32);
  for (const [code, st] of Object.entries(STATES)) {
    assert.ok(st.dishes.length >= 5, code);
    for (const k of st.dishes) assert.ok(DISHES[k], `${code}: ${k}`);
  }
  assert.ok(dishStates("cochinita_pibil").includes("YUC"));
  const { normalizeProfile } = await import("../public/nutrition.js");
  assert.equal(normalizeProfile({ state: "YUC" }).state, "YUC");
  assert.equal(normalizeProfile({ state: "<script>" }).state, "");
});

test("チェーン店のメニューを検索でき、公式にない栄養素は不明として扱う", async () => {
  const { searchChainItems, CHAINS } = await import("../public/chains.js");
  const { unknownNutrients } = await import("../public/nutrition.js");
  const [pollo] = searchChainItems("subway pollo 15");
  assert.equal(pollo.name, "Pollo 15 cm");
  assert.equal(pollo.nutrients.energy_kcal, 290);
  assert.equal(pollo.nutrients.salt_g, 1.12, "ナトリウム440mg → 食塩1.12g");
  assert.equal(pollo.nutrients.calcium_mg, null);
  for (const chain of Object.values(CHAINS)) for (const row of chain.items) {
    assert.ok(row.length === 9 || row.length === 10, row[0]);
    assert.ok(row[2] > 0 || row[9]?.serving, `${row[0]}: g か量の表記が必要`);
    for (const v of row.slice(3, 9)) assert.ok(v === null || (typeof v === "number" && v >= 0), row[0]);
    assert.ok(typeof row[3] === "number", "エネルギーは必ずある");
  }
  const [dona] = searchChainItems("dunkin boston kreme");
  assert.equal(dona.serving, "1 dona");
  assert.equal(dona.nutrients.calcium_mg, 33, "Dunkin' はカルシウムを公開している");
  assert.equal(dona.nutrients.vitamin_c_mg, null);
  const eaten = { portion_nutrients: pollo.nutrients, remaining_percent: 0 };
  assert.equal(sumConsumed([eaten]).calcium_mg, 0);
  assert.ok(unknownNutrients([eaten]).has("calcium_mg"));
  assert.ok(!unknownNutrients([eaten]).has("energy_kcal"));
  assert.ok(!unknownNutrients([{ ...eaten, remaining_percent: 100 }]).has("calcium_mg"), "食べていなければ関係ない");
});

test("チェーン店の公式値でも、つじつまの合わない値は除外・不明にする", async () => {
  const { validateChainRow, CHAINS, CHAIN_ISSUES } = await import("../public/chains.js");
  // エネルギーが三大栄養素と合わない → 品目ごと除外
  assert.equal(validateChainRow(["x", "Pollo", null, 190, 25.4, 400, 49.1, null, 16.7, {}]).row, null);
  // エネルギーは合うがナトリウムがありえない → ナトリウムだけ不明
  const r = validateChainRow(["Ke-Tira", "Pollo", null, 165, 9.6, 3866, 7.2, null, 12.9, { kcal_per_100g: 256.5 }]);
  assert.equal(r.row[2], 64, "1品と100gのエネルギーから g を計算");
  assert.equal(r.row[5], null);
  // ソース類は 100 g あたりの上限をゆるめる
  assert.equal(validateChainRow(["Salsa", "Salsa", 85, 166, 1, 2882, 34.6, null, 6.4, {}]).row[5], 2882);
  // 飲み物は ml 表記なので g を計算しない
  assert.equal(validateChainRow(["Fanta", "Bebida", null, 68.4, 0, 71, 17.1, null, 0, { kcal_per_100g: 21.8 }]).row[2], null);
  // 公式の表で問題のないチェーンはすべて残る
  assert.equal(CHAINS.subway.items.length, 54);
  assert.equal(CHAINS.dunkin.items.length, 86);
  assert.equal(CHAINS.carls.items.length, 29);
  assert.ok(CHAIN_ISSUES.every((i) => i.chain === "kfc"));
});
