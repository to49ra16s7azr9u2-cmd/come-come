// 料理判別AIの学習と評価。
// 土台は公開モデル CLIP(画像と文章を同じ空間の数値ベクトルにするAI)。スマホと同じ量子化モデルを使う。
//  1. ゼロショット: 料理の説明文のベクトルとだけ比べる(学習データなし)
//  2. 学習あり: 目視確認した写真で「料理ごとの代表ベクトル」を作り、説明文のベクトルと混ぜる
// 精度は 5 分割交差検証(学習に使っていない写真で当てる)で測る。
// 最後に全写真で学習し、スマホで使う分類ヘッドを public/models/dish-head.json に書き出す。
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, RawImage } from "@huggingface/transformers";
import { DISHES, DISH_KEYS, NON_FOOD_PROMPTS, dishPrompts } from "../public/dishes.js";
import { FOOD_DB } from "../public/foods.js";

// 料理1皿の標準カロリー(材料表 × 成分表)
const dishKcal = DISH_KEYS.map((k) => DISHES[k].recipe.reduce((s, r) => s + (FOOD_DB[r.db_key].per100g.energy_kcal * r.grams) / 100, 0));

const MODEL = process.env.CLIP_MODEL || "Xenova/clip-vit-base-patch32";
const DTYPE = process.env.CLIP_DTYPE || "q8";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(ROOT, "data");
const CACHE = path.join(ROOT, "cache");
const MIN_EVAL = 8; // これより写真が少ない料理は精度を報告しない

const review = JSON.parse(await readFile(path.join(ROOT, "review.json"), "utf8"));

// ---- 目視確認済みの写真の一覧 ----
async function listImages() {
  const items = [];
  for (const key of DISH_KEYS) {
    const dir = path.join(DATA, key);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    const idx = (f) => Number.parseInt(f, 10);
    const keep = review.include_only?.[key]
      ? files.filter((f) => review.include_only[key].includes(idx(f)))
      : files.filter((f) => !(review.exclude?.[key] ?? []).includes(idx(f)));
    for (const f of keep) items.push({ key, file: path.join(dir, f) });
  }
  return items;
}

// ---- ベクトル化(結果はキャッシュ) ----
const norm = (v) => {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
};
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const mean = (vs) => vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length);

async function embedImages(items) {
  const cacheFile = path.join(CACHE, `img-${MODEL.replace("/", "_")}-${DTYPE}.json`);
  const cache = existsSync(cacheFile) ? JSON.parse(await readFile(cacheFile, "utf8")) : {};
  const todo = items.filter((it) => !cache[it.file]);
  if (todo.length) {
    const processor = await AutoProcessor.from_pretrained(MODEL);
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
    let n = 0;
    for (const it of todo) {
      const image = await RawImage.read(it.file);
      const { image_embeds } = await vision(await processor(image));
      cache[it.file] = Array.from(image_embeds.data);
      if (++n % 100 === 0) console.error(`  embedded ${n}/${todo.length}`);
    }
    await mkdir(CACHE, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache));
  }
  return items.map((it) => norm(cache[it.file]));
}

async function embedTexts(texts) {
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
  const { text_embeds } = await textModel(tokenizer(texts, { padding: true, truncation: true }));
  const dim = text_embeds.dims[1];
  return texts.map((_, i) => norm(Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim))));
}

// ---- 分類 ----
function classify(emb, protos) {
  return protos.map((p, i) => [i, dot(emb, p)]).sort((a, b) => b[1] - a[1]);
}

function buildProtos(textProtos, trainEmbs, trainLabels, alpha) {
  return textProtos.map((tp, c) => {
    const mine = trainEmbs.filter((_, i) => trainLabels[i] === c);
    if (!mine.length || alpha >= 1) return tp;
    const ip = norm(mean(mine));
    return norm(tp.map((x, i) => alpha * x + (1 - alpha) * ip[i]));
  });
}

function score(embs, labels, protos, evalClasses) {
  let top1 = 0, top3 = 0, n = 0;
  const perClass = {};
  const kcalErr = [];
  for (let i = 0; i < embs.length; i++) {
    if (!evalClasses.has(labels[i])) continue;
    const ranked = classify(embs[i], protos).map(([c]) => c);
    const ok1 = ranked[0] === labels[i];
    kcalErr.push(Math.abs(dishKcal[ranked[0]] - dishKcal[labels[i]]) / dishKcal[labels[i]]);
    top1 += ok1;
    top3 += ranked.slice(0, 3).includes(labels[i]);
    n++;
    const pc = (perClass[labels[i]] ??= { ok: 0, n: 0, confusedWith: {} });
    pc.ok += ok1;
    pc.n++;
    if (!ok1) pc.confusedWith[ranked[0]] = (pc.confusedWith[ranked[0]] ?? 0) + 1;
  }
  return { top1: top1 / n, top3: top3 / n, n, perClass, kcalErr };
}

// 料理ごとに写真を5つに分け、4つで学習・1つで評価を5回繰り返す
function folds(labels, k = 5) {
  const byClass = {};
  labels.forEach((c, i) => (byClass[c] ??= []).push(i));
  const fold = new Array(labels.length);
  for (const idxs of Object.values(byClass)) {
    // 決まった順番で振り分ける(毎回同じ結果になるように)
    idxs.forEach((i, j) => (fold[i] = j % k));
  }
  return fold;
}

// ---- 実行 ----
const items = await listImages();
const labels = items.map((it) => DISH_KEYS.indexOf(it.key));
console.error(`images: ${items.length}, model: ${MODEL} (${DTYPE})`);
const embs = await embedImages(items);

const promptSets = DISH_KEYS.map(dishPrompts);
const flat = await embedTexts(promptSets.flat());
const textProtos = [];
let o = 0;
for (const ps of promptSets) {
  textProtos.push(norm(mean(flat.slice(o, o + ps.length))));
  o += ps.length;
}
const nonFood = await embedTexts(NON_FOOD_PROMPTS);

const counts = {};
labels.forEach((c) => (counts[c] = (counts[c] ?? 0) + 1));
const evalClasses = new Set(Object.entries(counts).filter(([, n]) => n >= MIN_EVAL).map(([c]) => Number(c)));

const zero = score(embs, labels, textProtos, evalClasses);

const fold = folds(labels);
const results = {};
for (const alpha of [0, 0.25, 0.5, 0.75]) {
  let agg = { top1: 0, top3: 0, n: 0, perClass: {}, kcalErr: [] };
  for (let f = 0; f < 5; f++) {
    const trE = embs.filter((_, i) => fold[i] !== f), trL = labels.filter((_, i) => fold[i] !== f);
    const teE = embs.filter((_, i) => fold[i] === f), teL = labels.filter((_, i) => fold[i] === f);
    const s = score(teE, teL, buildProtos(textProtos, trE, trL, alpha), evalClasses);
    agg.top1 += s.top1 * s.n;
    agg.top3 += s.top3 * s.n;
    agg.n += s.n;
    agg.kcalErr.push(...s.kcalErr);
    for (const [c, pc] of Object.entries(s.perClass)) {
      const a = (agg.perClass[c] ??= { ok: 0, n: 0, confusedWith: {} });
      a.ok += pc.ok;
      a.n += pc.n;
      for (const [w, k] of Object.entries(pc.confusedWith)) a.confusedWith[w] = (a.confusedWith[w] ?? 0) + k;
    }
  }
  results[alpha] = { top1: agg.top1 / agg.n, top3: agg.top3 / agg.n, n: agg.n, perClass: agg.perClass, kcalErr: agg.kcalErr };
}
const best = Object.entries(results).sort((a, b) => b[1].top1 - a[1].top1)[0];
const bestAlpha = Number(best[0]);

// 料理名の取り違えによるカロリーのずれ(量は標準の1皿と仮定)
const kcalStats = (errs) => {
  const s = [...errs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], within20: s.filter((e) => e <= 0.2).length / s.length };
};

// ---- 報告 ----
const pct = (x) => (x * 100).toFixed(1) + "%";
const lines = [];
lines.push(`# 料理判別AI 評価結果`, "");
lines.push(`- モデル: ${MODEL}(${DTYPE}、スマホと同じ量子化)`);
lines.push(`- 評価写真: ${zero.n} 枚 / ${evalClasses.size} 品目(Wikimedia Commons の自由ライセンス写真を目視確認したもの)`);
lines.push(`- 候補: 全 ${DISH_KEYS.length} 品目から1つを選ぶ(写真が${MIN_EVAL}枚未満の ${DISH_KEYS.length - evalClasses.size} 品目は候補には入るが評価しない)`, "");
lines.push(`| 方式 | 1位正解率 | 上位3位以内 | カロリーのずれ(中央値) | ずれ20%以内 |`, `|---|---|---|---|---|`);
const row = (name, r) => {
  const k = kcalStats(r.kcalErr);
  return `| ${name} | ${pct(r.top1)} | ${pct(r.top3)} | ${pct(k.median)} | ${pct(k.within20)} |`;
};
lines.push(row("ゼロショット(説明文のみ、学習なし)", zero));
for (const [a, r] of Object.entries(results)) lines.push(row(`学習あり(説明文の重み ${a}、5分割交差検証)`, r));
lines.push("", "カロリーのずれ: 判別した料理の標準1皿のカロリーと、正解の料理の標準1皿のカロリーの差。料理名の取り違えだけによるずれで、量の推定の誤差は含まない。");
lines.push("", `## 料理ごとの1位正解率(学習あり、説明文の重み ${bestAlpha})`, "", `| 料理 | 正解率 | 枚数 | よく間違える相手 |`, `|---|---|---|---|`);
const pcs = Object.entries(best[1].perClass).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
for (const [c, pc] of pcs) {
  const conf = Object.entries(pc.confusedWith).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, k]) => `${DISHES[DISH_KEYS[w]].names.ja}(${k})`).join("、");
  lines.push(`| ${DISHES[DISH_KEYS[c]].names.ja} | ${pct(pc.ok / pc.n)} | ${pc.n} | ${conf || "—"} |`);
}
const report = lines.join("\n") + "\n";
await writeFile(path.join(ROOT, "REPORT.md"), report);
console.log(report);

// ---- スマホ用の分類ヘッドを書き出す(全写真で学習) ----
const finalProtos = buildProtos(textProtos, embs, labels, bestAlpha);
const round = (v) => v.map((x) => Math.round(x * 1e4) / 1e4);
await mkdir(path.join(ROOT, "..", "public", "models"), { recursive: true });
await writeFile(
  path.join(ROOT, "..", "public", "models", "dish-head.json"),
  JSON.stringify({
    model: MODEL,
    dtype: DTYPE,
    keys: DISH_KEYS,
    prototypes: finalProtos.map(round),
    nonFood: nonFood.map(round),
    alpha: bestAlpha,
    eval: { top1: best[1].top1, top3: best[1].top3, n: best[1].n, zeroShotTop1: zero.top1 },
  }),
);
console.error("wrote public/models/dish-head.json");
