// 栄養素の定義・1日の目標量・摂取量の集計ロジック。
// ブラウザとNode(テスト)の両方から読み込めるよう、DOMに依存しない純粋な関数だけを置く。

export const NUTRIENTS = [
  { key: "energy_kcal", label: "エネルギー", unit: "kcal", kind: "target" },
  { key: "protein_g", label: "たんぱく質", unit: "g", kind: "min" },
  { key: "fat_g", label: "脂質", unit: "g", kind: "range" },
  { key: "carbs_g", label: "炭水化物", unit: "g", kind: "range" },
  { key: "fiber_g", label: "食物繊維", unit: "g", kind: "min" },
  { key: "salt_g", label: "食塩相当量", unit: "g", kind: "max" },
  { key: "calcium_mg", label: "カルシウム", unit: "mg", kind: "min" },
  { key: "iron_mg", label: "鉄", unit: "mg", kind: "min" },
  { key: "vitamin_a_ug", label: "ビタミンA", unit: "µgRAE", kind: "min" },
  { key: "vitamin_b1_mg", label: "ビタミンB1", unit: "mg", kind: "min" },
  { key: "vitamin_b2_mg", label: "ビタミンB2", unit: "mg", kind: "min" },
  { key: "vitamin_c_mg", label: "ビタミンC", unit: "mg", kind: "min" },
  { key: "vitamin_d_ug", label: "ビタミンD", unit: "µg", kind: "min" },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

// 不足しているときに勧める食品の例
export const FOOD_HINTS = {
  energy_kcal: "ごはん・パン・麺類などの主食",
  protein_g: "肉・魚・卵・大豆製品",
  fat_g: "ナッツ・青魚・オリーブオイル",
  carbs_g: "ごはん・パン・いも類・果物",
  fiber_g: "野菜・きのこ・海藻・玄米",
  calcium_mg: "牛乳・ヨーグルト・小魚・小松菜",
  iron_mg: "レバー・赤身肉・あさり・ほうれん草",
  vitamin_a_ug: "にんじん・かぼちゃ・レバー",
  vitamin_b1_mg: "豚肉・玄米・大豆",
  vitamin_b2_mg: "卵・納豆・乳製品",
  vitamin_c_mg: "果物・ブロッコリー・ピーマン",
  vitamin_d_ug: "鮭・さんま・きのこ類",
};

// 推定エネルギー必要量(kcal/日)。日本人の食事摂取基準(2020年版)を簡略化。
// [身体活動レベル 低い, ふつう, 高い]
const ENERGY_TABLE = {
  male: { "18-29": [2300, 2650, 3050], "30-49": [2300, 2700, 3050], "50-64": [2200, 2600, 2950], "65-74": [2050, 2400, 2750], "75+": [1800, 2100, 2100] },
  female: { "18-29": [1700, 2000, 2300], "30-49": [1750, 2050, 2350], "50-64": [1650, 1950, 2250], "65-74": [1550, 1850, 2100], "75+": [1400, 1650, 1650] },
};

// 成人の推奨量・目安量・目標量(簡略化した代表値)
const MICRO_TABLE = {
  male: { protein_g: 65, fiber_g: 21, salt_g: 7.5, calcium_mg: 750, iron_mg: 7.5, vitamin_a_ug: 900, vitamin_b1_mg: 1.4, vitamin_b2_mg: 1.6, vitamin_c_mg: 100, vitamin_d_ug: 8.5 },
  female: { protein_g: 50, fiber_g: 18, salt_g: 6.5, calcium_mg: 650, iron_mg: 10.5, vitamin_a_ug: 700, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.2, vitamin_c_mg: 100, vitamin_d_ug: 8.5 },
};

export const AGE_GROUPS = Object.keys(ENERGY_TABLE.male);
export const ACTIVITY_LEVELS = ["低い", "ふつう", "高い"];

export const DEFAULT_PROFILE = { sex: "female", age: "30-49", activity: 1 };

/**
 * 1日の目標量を返す。min/max を持つ範囲型(脂質・炭水化物)はエネルギー比率から算出する。
 * 返り値: { [key]: { value, min?, max? } }
 */
export function dailyTargets(profile = DEFAULT_PROFILE) {
  const sex = profile.sex === "male" ? "male" : "female";
  const energy = ENERGY_TABLE[sex][profile.age]?.[profile.activity] ?? ENERGY_TABLE[sex]["30-49"][1];
  const micro = MICRO_TABLE[sex];
  const targets = { energy_kcal: { value: energy } };
  // 脂質 20〜30%エネルギー(9kcal/g)、炭水化物 50〜65%エネルギー(4kcal/g)
  targets.fat_g = { value: round1((energy * 0.25) / 9), min: round1((energy * 0.2) / 9), max: round1((energy * 0.3) / 9) };
  targets.carbs_g = { value: round1((energy * 0.575) / 4), min: round1((energy * 0.5) / 4), max: round1((energy * 0.65) / 4) };
  for (const [k, v] of Object.entries(micro)) targets[k] = { value: v };
  return targets;
}

// 追跡のパラメータ(車両追跡システムの「検出→確定→平滑化」と同じ考え方)
export const TRACKING = {
  confirmHits: 2, // この回数映ったら確定(誤検出を記録しない)
  confirmConfidence: 0.75, // 1回目でもこの信頼度以上なら即確定
  smoothWindow: 3, // 残量は直近この回数の中央値で平滑化
};

/** 食材リストから1人前の栄養素量を計算する。表にある食材は表の値を優先する。 */
export function nutrientsFromIngredients(ingredients = [], db = {}) {
  const total = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  for (const ing of ingredients) {
    const per100g = db[ing.db_key]?.per100g ?? ing.per100g ?? {};
    const factor = Math.max(0, Number(ing.grams) || 0) / 100;
    for (const k of NUTRIENT_KEYS) total[k] += Math.max(0, Number(per100g[k]) || 0) * factor;
  }
  return total;
}

/** 料理1品について、これまでに食べた分の栄養素量。未確定の料理は数えない。 */
export function consumedOf(dish) {
  const out = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  if (dish.confirmed === false) return out;
  const eatenRatio = clamp((100 - dish.remaining_percent) / 100, 0, 1) * (dish.scale ?? 1);
  for (const k of NUTRIENT_KEYS) out[k] = (dish.portion_nutrients?.[k] ?? 0) * eatenRatio;
  return out;
}

export function sumConsumed(dishes) {
  const total = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
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
 * 映像解析の結果を、追跡中の料理リストにマージする。
 * - 既知の料理は最初に推定した1人前の栄養素を維持する。
 * - 残量は直近の観測の中央値で平滑化し、さらに減る方向にしか更新しない。
 *   1枚だけ推定が外れても(箸で隠れた・角度が変わった等)食べた量が跳ねず、二重計上もしない。
 * - 新しい料理は「未確定」で追加し、複数回映るか信頼度が高ければ確定する(誤検出対策)。
 */
export function mergeAnalysis(dishes, analysis, { now = Date.now(), makeId = defaultId, db = {} } = {}) {
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
        ingredients: ingredients.map((i) => ({ name: i.name, db_key: db[i.db_key] ? i.db_key : "", grams: i.grams })),
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
