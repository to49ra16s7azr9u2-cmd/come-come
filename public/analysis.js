// 画像解析のプロンプトと結果の正規化。サーバー(Claude API)とプレビュー(claude.ai上)で共有する。
import { foodKeyList } from "./foods.js";
import { DISHES } from "./dishes.js";
import { NUTRIENT_KEYS } from "./nutrition.js";

const LANG_NAMES = { es: "Mexican Spanish", en: "English", ja: "Japanese" };

export const SYSTEM_PROMPT = `You are a registered dietitian watching a live camera feed of someone eating. The default context is Mexico: expect Mexican home cooking, street food and drinks (tacos, quesadillas, enchiladas, chilaquiles, pozole, tamales, frijoles, arroz rojo, tortillas, aguas frescas, refrescos), but recognise any cuisine.

## Measure portions like a ruler app
1. Find reference objects of known size in the frame and use them as a ruler (pixels per cm):
   - Mexican coins: $10 peso 28 mm, $5 peso 25.5 mm, $1 peso 21 mm. Credit/debit card 85.6 × 54 mm.
   - Corn tortilla about 14 cm across (taquería tortillas about 11 cm). Dinner plate about 26 cm, side plate about 20 cm.
   - Fork about 19 cm, tablespoon about 17 cm, 355 ml can 12.2 cm tall and 6.6 cm wide, adult hand about 8.5 cm wide.
   - If the user's plate diameter is given below, trust it over the defaults.
2. Measure each food's visible dimensions in cm (length, width, height or depth; use the plate or bowl rim and the food's shadow to judge height).
3. Convert to volume, then to grams with a realistic density (rice and beans about 0.8–0.9 g/ml, soups and drinks about 1.0 g/ml, meats about 1.0 g/ml, leafy vegetables about 0.2–0.4 g/ml). Count countable items (tortillas, tacos, pieces) directly.

## What to return
- Every dish or drink, split into ingredients. For each ingredient give grams as served (before eating) and its measured dimensions_cm (0 when not measurable).
- If an ingredient matches the food key list, set db_key to that key (its nutrients come from a table). Otherwise set db_key to "" and estimate per100g. You may fill per100g either way.
- remaining_percent: how much of the served portion is still there (100 = untouched). Food lifted on a fork or tortilla but not yet in the mouth still counts as remaining.
- reference: which reference object you used for scale (or "estimated" if none).
- confidence 0–1 for identification and portion size together.
- eating: whether the person appears to be eating right now.
- dish_key: the matching key from the dish list below, or "" if none fits. alternatives: up to 2 other dish keys it could plausibly be (the user can switch with one tap).

## Known dishes from earlier frames
- If a known dish is visible, reuse its id and only update remaining_percent; ingredients may be an empty array.
- If a known dish is not visible, return it with visible=false.
- New dishes get id "".

## Food key list
${foodKeyList()}

## Dish list
${Object.entries(DISHES).map(([k, d]) => `${k}: ${d.names.en}`).join("\n")}`;

export function outputFormatHint(lang = "es") {
  return `Reply with only this JSON. Write name, serving_description, scene_note and ingredient names in ${LANG_NAMES[lang] ?? "Mexican Spanish"}.
{"eating": boolean, "scene_note": "one short sentence about the scene",
 "dishes": [{"id": "known id or empty", "name": "dish name", "serving_description": "e.g. 3 tacos",
   "reference": "reference object used", "confidence": 0.0-1.0, "remaining_percent": 0-100, "visible": boolean,
   "dish_key": "key from the dish list or empty", "alternatives": ["up to 2 dish keys"],
   "ingredients": [{"name": "ingredient", "db_key": "key or empty", "grams": number,
     "dimensions_cm": {"length": number, "width": number, "height": number},
     "per100g": {${NUTRIENT_KEYS.map((k) => `"${k}": number`).join(", ")}}}]}]}`;
}

/** リクエストごとに変わる部分(既知の料理・言語・皿の大きさ・直前のひと口数) */
export function buildUserText(knownDishes, { lang = "es", plateCm = 0, bites = 0 } = {}) {
  const known = (knownDishes ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    serving_description: d.serving_description,
    remaining_percent: d.remaining_percent,
  }));
  const lines = [
    `Output language: ${LANG_NAMES[lang] ?? "Mexican Spanish"}.`,
    plateCm > 0 ? `The user's usual plate is ${plateCm} cm in diameter.` : "",
    bites > 0 ? `The on-device detector counted ${bites} bite(s) since the previous frame.` : "",
    `Known dishes:\n${known.length ? JSON.stringify(known, null, 2) : "(none)"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** 形の崩れたJSONでもアプリが壊れないよう、解析結果を正規化する */
export function normalizeAnalysis(raw) {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const str = (v) => (typeof v === "string" ? v : "");
  const dishes = Array.isArray(raw?.dishes) ? raw.dishes : [];
  return {
    eating: Boolean(raw?.eating),
    scene_note: str(raw?.scene_note),
    dishes: dishes
      .filter((d) => d && typeof d === "object")
      .map((d) => ({
        id: str(d.id),
        name: str(d.name) || "?",
        serving_description: str(d.serving_description),
        reference: str(d.reference),
        dish_key: DISHES[d.dish_key] ? d.dish_key : "",
        alternatives: (Array.isArray(d.alternatives) ? d.alternatives : []).filter((k) => DISHES[k]).slice(0, 2),
        confidence: Math.min(1, Math.max(0, num(d.confidence, 0.5))),
        remaining_percent: num(d.remaining_percent, 100),
        visible: d.visible !== false,
        ingredients: (Array.isArray(d.ingredients) ? d.ingredients : []).map((i) => ({
          name: str(i?.name),
          db_key: str(i?.db_key),
          grams: Math.max(0, num(i?.grams)),
          dimensions_cm: {
            length: Math.max(0, num(i?.dimensions_cm?.length)),
            width: Math.max(0, num(i?.dimensions_cm?.width)),
            height: Math.max(0, num(i?.dimensions_cm?.height)),
          },
          per100g: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, Math.max(0, num(i?.per100g?.[k]))])),
        })),
      })),
  };
}
