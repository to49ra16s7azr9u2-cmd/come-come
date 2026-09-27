// 画像解析のプロンプトと結果の正規化。サーバー(Claude API)とプレビュー(claude.ai上)で共有する。
import { foodKeyList } from "./foods.js";
import { NUTRIENT_KEYS } from "./nutrition.js";

export const SYSTEM_PROMPT = `あなたは管理栄養士です。食事中の人を映したカメラ画像から、料理とその量を推定します。

## 手順
1. 映っている料理・飲み物をすべて見つける。
2. 新しい料理は、食材ごとに分解する(例: 鮭定食 → ごはん・焼き鮭・味噌汁・漬物)。
   各食材について、配膳時(手をつける前)の重さ grams を推定する。
   量は画像内の基準物で見積もる: 茶碗の口径 約12cm / ごはん1杯 約150g、箸 約23cm、
   スプーン 約18cm、大人の手のひら 約8cm幅、一般的な平皿 約24cm、汁椀1杯 約150ml。
3. 食材が「食材キー一覧」にあれば db_key にそのキーを入れる(栄養素は表から計算される)。
   一覧に無い食材は db_key を空文字にし、per100g に100gあたりの栄養素量を推定して入れる。
   一覧にある食材も per100g は埋めてよい(使われない)。
4. 各料理の現在の残量を、配膳時を100%とした割合 remaining_percent で推定する。
   箸やスプーンで持ち上げているだけの分は、まだ残量に含める。
5. confidence には、料理の特定と量の推定にどれくらい自信があるかを 0〜1 で入れる。

## 既知の料理(前の画像までに見つけたもの)
- 同じ料理が映っていれば、その id を使い remaining_percent だけ更新する。ingredients は空配列でよい。
- 映っていなければ visible=false にする。
- 新しい料理は id を空文字にする。

## 食材キー一覧
${foodKeyList()}`;

export const OUTPUT_FORMAT_HINT = `次のJSONだけを返してください:
{"eating": boolean, "scene_note": "状況を日本語で一言",
 "dishes": [{"id": "既知ならID/新規は空文字", "name": "料理名", "serving_description": "例: 茶碗1杯 約150g",
   "confidence": 0.0〜1.0, "remaining_percent": 0〜100, "visible": boolean,
   "ingredients": [{"name": "食材名", "db_key": "キーまたは空文字", "grams": 数値,
     "per100g": {${NUTRIENT_KEYS.map((k) => `"${k}": 数値`).join(", ")}}}]}]}`;

export function buildUserText(knownDishes) {
  const known = (knownDishes ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    serving_description: d.serving_description,
    remaining_percent: d.remaining_percent,
  }));
  return `既知の料理:\n${known.length ? JSON.stringify(known, null, 2) : "(なし)"}`;
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
        name: str(d.name) || "不明な料理",
        serving_description: str(d.serving_description),
        confidence: Math.min(1, Math.max(0, num(d.confidence, 0.5))),
        remaining_percent: num(d.remaining_percent, 100),
        visible: d.visible !== false,
        ingredients: (Array.isArray(d.ingredients) ? d.ingredients : []).map((i) => ({
          name: str(i?.name),
          db_key: str(i?.db_key),
          grams: Math.max(0, num(i?.grams)),
          per100g: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, Math.max(0, num(i?.per100g?.[k]))])),
        })),
      })),
  };
}
