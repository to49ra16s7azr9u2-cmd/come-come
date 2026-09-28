// 栄養素の定義・1日の目標量・摂取量の集計・料理の追跡ロジック。
// ブラウザとNode(テスト)の両方から読み込めるよう、DOMに依存しない純粋な関数だけを置く。

export const NUTRIENTS = [
  { key: "energy_kcal", unit: "kcal", kind: "target" },
  { key: "protein_g", unit: "g", kind: "min" },
  { key: "fat_g", unit: "g", kind: "range" },
  { key: "carbs_g", unit: "g", kind: "range" },
  { key: "fiber_g", unit: "g", kind: "min" },
  { key: "salt_g", unit: "g", kind: "max" },
  { key: "calcium_mg", unit: "mg", kind: "min" },
  { key: "iron_mg", unit: "mg", kind: "min" },
  { key: "vitamin_a_ug", unit: "µgRAE", kind: "min" },
  { key: "vitamin_b1_mg", unit: "mg", kind: "min" },
  { key: "vitamin_b2_mg", unit: "mg", kind: "min" },
  { key: "vitamin_c_mg", unit: "mg", kind: "min" },
  { key: "vitamin_d_ug", unit: "µg", kind: "min" },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

export const MEALS = ["breakfast", "lunch", "dinner", "snack"];

/** 時刻から食事区分を決める(メキシコの食習慣: 昼食 comida は14〜16時ごろ) */
export function mealForTime(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 11.5) return "breakfast";
  if (h >= 12.5 && h < 17.5) return "lunch";
  if (h >= 19 || h < 2) return "dinner";
  return "snack";
}

export const ACTIVITY_FACTORS = [1.2, 1.375, 1.55, 1.725];
export const GOALS = ["lose", "maintain", "gain"];
export const COUNTRIES = ["MX", "US", "JP"];

export const DEFAULT_PROFILE = {
  sex: "female",
  age: 30,
  height_cm: 160,
  weight_kg: 65,
  target_weight_kg: 60,
  activity: 1,
  goal: "maintain",
  country: "MX",
  plate_cm: 0,
};

/** 古い形式(年齢が "30-49" など)のプロフィールも読めるようにする */
export function normalizeProfile(p = {}) {
  const num = (v, d) => (Number.isFinite(Number.parseFloat(v)) ? Number.parseFloat(v) : d);
  const out = { ...DEFAULT_PROFILE, ...p };
  out.sex = out.sex === "male" ? "male" : "female";
  out.age = Math.round(num(out.age, DEFAULT_PROFILE.age));
  out.height_cm = num(out.height_cm, DEFAULT_PROFILE.height_cm);
  out.weight_kg = num(out.weight_kg, DEFAULT_PROFILE.weight_kg);
  out.target_weight_kg = num(out.target_weight_kg, out.weight_kg);
  out.activity = Math.min(3, Math.max(0, Math.round(num(out.activity, 1))));
  out.goal = GOALS.includes(out.goal) ? out.goal : "maintain";
  out.country = COUNTRIES.includes(out.country) ? out.country : "MX";
  out.plate_cm = Math.max(0, num(out.plate_cm, 0));
  return out;
}

/** 基礎代謝(Mifflin-St Jeor式) */
export function bmr({ sex, age, height_cm, weight_kg }) {
  return 10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === "male" ? 5 : -161);
}

export function bmi({ height_cm, weight_kg }) {
  const m = height_cm / 100;
  return m > 0 ? weight_kg / (m * m) : 0;
}

// 米国・カナダの食事摂取基準(DRI)。メキシコの推奨摂取量(IDR)もおおむねこれに準じる。
function driMicros(sex, age) {
  const male = sex === "male";
  return {
    fiber_g: male ? (age <= 50 ? 38 : 30) : age <= 50 ? 25 : 21,
    calcium_mg: male ? (age <= 70 ? 1000 : 1200) : age <= 50 ? 1000 : 1200,
    iron_mg: male ? 8 : age <= 50 ? 18 : 8,
    vitamin_a_ug: male ? 900 : 700,
    vitamin_b1_mg: male ? 1.2 : 1.1,
    vitamin_b2_mg: male ? 1.3 : 1.1,
    vitamin_c_mg: male ? 90 : 75,
    vitamin_d_ug: age <= 70 ? 15 : 20,
    salt_g: 5, // WHO: ナトリウム2,000mg/日未満 = 食塩5g
  };
}

// 日本人の食事摂取基準(2020年版)を簡略化した成人の値
function jpMicros(sex) {
  return sex === "male"
    ? { protein_g: 65, fiber_g: 21, salt_g: 7.5, calcium_mg: 750, iron_mg: 7.5, vitamin_a_ug: 900, vitamin_b1_mg: 1.4, vitamin_b2_mg: 1.6, vitamin_c_mg: 100, vitamin_d_ug: 8.5 }
    : { protein_g: 50, fiber_g: 18, salt_g: 6.5, calcium_mg: 650, iron_mg: 10.5, vitamin_a_ug: 700, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.2, vitamin_c_mg: 100, vitamin_d_ug: 8.5 };
}

/**
 * 1日の目標量。エネルギーは身長・体重・年齢・性別・活動量と目的(減量/維持/増量)から計算する。
 * 返り値: { [key]: { value, min?, max? } }
 */
export function dailyTargets(profileIn = DEFAULT_PROFILE) {
  const p = normalizeProfile(profileIn);
  const tdee = bmr(p) * ACTIVITY_FACTORS[p.activity];
  const floor = p.sex === "male" ? 1500 : 1200;
  let energy = tdee;
  if (p.goal === "lose") energy = Math.max(Math.min(floor, tdee), tdee - 500);
  if (p.goal === "gain") energy = tdee + 300;
  energy = Math.round(energy / 10) * 10;

  const jp = p.country === "JP";
  const micro = jp ? jpMicros(p.sex) : driMicros(p.sex, p.age);
  const fatPct = jp ? [0.2, 0.3] : [0.2, 0.35];
  const carbPct = jp ? [0.5, 0.65] : [0.45, 0.65];
  const targets = { energy_kcal: { value: energy } };
  targets.protein_g = { value: round1(jp ? micro.protein_g : 0.8 * p.weight_kg) };
  targets.fat_g = range((energy * fatPct[0]) / 9, (energy * fatPct[1]) / 9);
  targets.carbs_g = range((energy * carbPct[0]) / 4, (energy * carbPct[1]) / 4);
  for (const [k, v] of Object.entries(micro)) if (k !== "protein_g") targets[k] = { value: v };
  return targets;
}

function range(min, max) {
  return { value: round1((min + max) / 2), min: round1(min), max: round1(max) };
}

// 追跡のパラメータ(車両追跡システムの「検出→確定→平滑化」と同じ考え方)
export const TRACKING = {
  confirmHits: 2, // この回数映ったら確定(誤検出を記録しない)
  confirmConfidence: 0.75, // 1回目でもこの信頼度以上なら即確定
  smoothWindow: 3, // 残量は直近この回数の中央値で平滑化
};

/** 食材リストから1人前の栄養素量を計算する。表にある食材は表の値を優先する。 */
export function nutrientsFromIngredients(ingredients = [], db = {}) {
  const total = zeros();
  for (const ing of ingredients) {
    const per100g = db[ing.db_key]?.per100g ?? ing.per100g ?? {};
    const factor = Math.max(0, Number(ing.grams) || 0) / 100;
    for (const k of NUTRIENT_KEYS) total[k] += Math.max(0, Number(per100g[k]) || 0) * factor;
  }
  return total;
}

/** 料理1品について、これまでに食べた分の栄養素量。未確定の料理は数えない。 */
export function consumedOf(dish) {
  const out = zeros();
  if (dish.confirmed === false) return out;
  const eatenRatio = clamp((100 - dish.remaining_percent) / 100, 0, 1) * (dish.scale ?? 1);
  for (const k of NUTRIENT_KEYS) out[k] = (dish.portion_nutrients?.[k] ?? 0) * eatenRatio;
  return out;
}

export function sumConsumed(dishes) {
  const total = zeros();
  for (const d of dishes) {
    const c = consumedOf(d);
    for (const k of NUTRIENT_KEYS) total[k] += c[k];
  }
  return total;
}

/**
 * 摂取量を目標と比べて判定する。
 * status: "low"(不足) | "ok"(適量) | "high"(過剰)
 */
export function evaluate(total, targets) {
  return NUTRIENTS.map((n) => {
    const t = targets[n.key];
    const amount = total[n.key] ?? 0;
    const ratio = t.value > 0 ? amount / t.value : 0;
    let status;
    if (n.kind === "max") status = amount > t.value ? "high" : "ok";
    else if (n.kind === "range") status = amount < t.min ? "low" : amount > t.max ? "high" : "ok";
    else if (n.kind === "target") status = ratio < 0.9 ? "low" : ratio > 1.1 ? "high" : "ok";
    else status = ratio < 1 ? "low" : "ok";
    return { ...n, amount, target: t, ratio, status };
  });
}

/**
 * 1日の栄養バランスを100点満点で採点する。
 * 各栄養素を0〜1で評価(不足は達成率、過剰は超過分を減点)し、エネルギーは2倍の重みで平均する。
 */
export function balanceScore(results) {
  let sum = 0;
  let weight = 0;
  for (const r of results) {
    const t = r.target;
    let s;
    if (r.kind === "max") s = r.amount <= t.value ? 1 : Math.max(0, 2 - r.amount / t.value);
    else if (r.kind === "range") s = r.amount < t.min ? r.amount / t.min : r.amount > t.max ? Math.max(0, 2 - r.amount / t.max) : 1;
    else if (r.kind === "target") s = Math.max(0, 1 - Math.abs(r.ratio - 1));
    else s = Math.min(1, r.ratio);
    const w = r.key === "energy_kcal" ? 2 : 1;
    sum += clamp(s, 0, 1) * w;
    weight += w;
  }
  return Math.round((100 * sum) / weight);
}

/**
 * 映像解析の結果を、追跡中の料理リストにマージする。
 * - 既知の料理は最初に推定した1人前の栄養素を維持する。
 * - 残量は直近の観測の中央値で平滑化し、さらに減る方向にしか更新しない。
 *   1枚だけ推定が外れても(箸で隠れた・角度が変わった等)食べた量が跳ねず、二重計上もしない。
 * - 新しい料理は「未確定」で追加し、複数回映るか信頼度が高ければ確定する(誤検出対策)。
 */
export function mergeAnalysis(dishes, analysis, { now = Date.now(), makeId = defaultId, db = {}, meal } = {}) {
  const byId = new Map(dishes.map((d) => [d.id, { ...d }]));
  for (const a of analysis.dishes ?? []) {
    const existing = a.id && byId.get(a.id);
    const observed = clamp(Number(a.remaining_percent) || 0, 0, 100);
    if (existing) {
      if (!a.visible) continue;
      const obs = [...(existing.observations ?? []), observed].slice(-TRACKING.smoothWindow);
      existing.observations = obs;
      existing.hits = (existing.hits ?? 1) + 1;
      existing.confirmed = existing.confirmed || existing.hits >= TRACKING.confirmHits;
      // 観測が揃うまでは最新値、揃ったら中央値で外れ値を除く
      const smoothed = obs.length >= TRACKING.smoothWindow ? median(obs) : observed;
      existing.remaining_percent = Math.min(existing.remaining_percent, smoothed);
      existing.updated_at = now;
    } else if (a.visible) {
      const id = makeId();
      const ingredients = a.ingredients ?? [];
      byId.set(id, {
        id,
        name: a.name,
        serving_description: a.serving_description,
        reference: a.reference ?? "",
        dishKey: a.dish_key || undefined,
        candidates: a.dish_key ? [a.dish_key, ...(a.alternatives ?? [])] : a.alternatives?.length ? [...a.alternatives] : undefined,
        meal: meal ?? mealForTime(new Date(now)),
        source: "camera",
        ingredients: ingredients.map((i) => ({
          name: i.name,
          db_key: db[i.db_key] ? i.db_key : "",
          grams: i.grams,
          dimensions_cm: i.dimensions_cm,
        })),
        portion_nutrients: ingredients.length ? nutrientsFromIngredients(ingredients, db) : sanitizeNutrients(a.portion_nutrients),
        remaining_percent: observed,
        observations: [observed],
        hits: 1,
        confidence: a.confidence ?? 1,
        confirmed: (a.confidence ?? 1) >= TRACKING.confirmConfidence,
        scale: 1,
        created_at: now,
        updated_at: now,
      });
    }
  }
  return [...byId.values()];
}

/** 食品検索から手入力した1品を、食べ終わった料理として作る */
export function manualDish({ key, name, grams, meal, db, now = Date.now(), makeId = defaultId }) {
  const ingredients = [{ name, db_key: key, grams }];
  return {
    id: makeId(),
    name,
    serving_description: `${Math.round(grams)} g`,
    meal,
    source: "manual",
    ingredients,
    portion_nutrients: nutrientsFromIngredients(ingredients, db),
    remaining_percent: 0,
    observations: [0],
    hits: 1,
    confidence: 1,
    confirmed: true,
    scale: 1,
    created_at: now,
    updated_at: now,
  };
}

function zeros() {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function sanitizeNutrients(n = {}) {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, Math.max(0, Number(n[k]) || 0)]));
}

function defaultId() {
  return "d" + Math.random().toString(36).slice(2, 9);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
