// 料理判別AIの学習と評価。
// 土台は公開モデル CLIP(画像と文章を同じ空間の数値ベクトルにするAI)。スマホと同じ量子化モデルを使う。
//
// 比べる方式(どれも「CLIP の画像ベクトル → 料理の順位」を作る部分だけを学習する):
//  - ゼロショット: 料理の説明文のベクトルとだけ比べる(学習データなし)
//  - 代表ベクトル: 写真の平均ベクトルと説明文のベクトルを混ぜる
//  - 線形分類器: 料理ごとの重みを学習する(多クラスのロジスティック回帰)。説明文のベクトルから学習を始め、そこから離れすぎないようにする
//
// 評価は入れ子の交差検証: 外側 5 分割で「学習に使っていない写真」の正解率を測り、
// 各方式の設定(混ぜる割合・正則化の強さ)は外側の学習用写真だけを使った内側 3 分割で選ぶ。
// 目標の指標は「上位3位以内」(アプリで候補を3つ出して1タップで選べるため)。
//
// 最後に全写真で学習し、スマホで使う分類ヘッドを public/models/dish-head.json に書き出す。
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, RawImage } from "@huggingface/transformers";
import { DISHES, DISH_KEYS, NON_FOOD_PROMPTS, dishPrompts } from "../public/dishes.js";
import { FOOD_DB } from "../public/foods.js";

const MODEL = process.env.CLIP_MODEL || "Xenova/clip-vit-base-patch16";
const DTYPE = process.env.CLIP_DTYPE || "q8";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
// 写真の出典ごとのフォルダと、目視確認の結果。確認結果のファイルが無い出典は使わない(確認していない写真で学習しない)
const SOURCES = [
  { name: "Wikimedia Commons", dir: path.join(ROOT, "data"), review: path.join(ROOT, "review.json") },
  { name: "Openverse (Flickr ほか)", dir: path.join(ROOT, "data-openverse"), review: path.join(ROOT, "review-openverse.json") },
];
const DUP_THRESHOLD = 0.95; // 画像ベクトルがこれ以上近い写真は同じ写真とみなす
const CACHE = path.join(ROOT, "cache");
const MIN_EVAL = 8; // これより写真が少ない料理は精度を報告しない
const OUTER = 5;
const INNER = 3;


// 料理1皿の標準カロリー(材料表 × 成分表)
const dishKcal = DISH_KEYS.map((k) => DISHES[k].recipe.reduce((s, r) => s + (FOOD_DB[r.db_key].per100g.energy_kcal * r.grams) / 100, 0));

// ---- 目視確認済みの写真の一覧 ----
async function listDir(dir, key, review) {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  const idx = (f) => Number.parseInt(f, 10);
  const keep = review.include_only?.[key]
    ? files.filter((f) => review.include_only[key].includes(idx(f)))
    : files.filter((f) => !(review.exclude?.[key] ?? []).includes(idx(f)));
  return keep.map((f) => ({ key, file: path.join(dir, f) }));
}

async function listImages() {
  const items = [];
  for (const src of SOURCES) {
    if (!existsSync(src.review)) {
      console.error(`skip ${src.name}: 目視確認の結果(${path.basename(src.review)})がありません`);
      continue;
    }
    const review = JSON.parse(await readFile(src.review, "utf8"));
    for (const key of DISH_KEYS) for (const it of await listDir(path.join(src.dir, key), key, review)) items.push({ ...it, source: src.name });
  }
  return items;
}

/**
 * ほぼ同じ写真(別サイトの同じ写真、連写、トリミング違いなど)を除く。学習用と評価用に同じ写真が入ると精度が高く出てしまうため。
 * 同じ写真が別の料理として登録されていた場合は、どちらが正しいか決められないので両方とも除く。
 */
function dedupe(items, X) {
  const keep = [];
  const removed = [];
  const conflicts = new Set();
  for (let i = 0; i < X.length; i++) {
    const dup = keep.find((j) => dot(X[i], X[j]) >= DUP_THRESHOLD);
    if (dup === undefined) keep.push(i);
    else {
      removed.push([items[i].file, items[dup].file]);
      if (items[i].key !== items[dup].key) conflicts.add(dup);
    }
  }
  return { keep: keep.filter((i) => !conflicts.has(i)), removed, conflicts: conflicts.size };
}

// ---- ベクトル計算 ----
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

/** 左右反転した画像(学習用の水増し) */
function mirror(image) {
  const { width, height, channels, data } = image;
  const out = new data.constructor(data.length);
  for (let yy = 0; yy < height; yy++)
    for (let xx = 0; xx < width; xx++)
      for (let c = 0; c < channels; c++) out[(yy * width + xx) * channels + c] = data[(yy * width + (width - 1 - xx)) * channels + c];
  return new RawImage(out, width, height, channels);
}

async function embedImages(items, { flip = false } = {}) {
  const cacheFile = path.join(CACHE, `img-${MODEL.replace("/", "_")}-${DTYPE}${flip ? "-flip" : ""}.json`);
  const cache = existsSync(cacheFile) ? JSON.parse(await readFile(cacheFile, "utf8")) : {};
  const todo = items.filter((it) => !cache[it.file]);
  if (todo.length) {
    const processor = await AutoProcessor.from_pretrained(MODEL);
    const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
    let n = 0;
    for (const it of todo) {
      const raw = await RawImage.read(it.file);
      const image = flip ? mirror(raw.rgb()) : raw;
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

// ---- 方式 ----
// どの方式も fit(学習用ベクトル, 学習用ラベル, 設定) → { W: 料理数×次元, b: 料理数 } を返し、
// 料理の点数は W·x + b で計算する(スマホ側も同じ式)。

const C = DISH_KEYS.length;

function zeroShot(textProtos) {
  return () => ({ W: textProtos.map((p) => p.map((x) => x * 100)), b: new Array(C).fill(0) });
}

function protoBlend(textProtos) {
  return (X, y, alpha) => ({
    W: textProtos.map((tp, c) => {
      const mine = X.filter((_, i) => y[i] === c);
      if (!mine.length) return tp.map((x) => x * 100);
      const ip = norm(mean(mine));
      return norm(tp.map((x, i) => alpha * x + (1 - alpha) * ip[i])).map((x) => x * 100);
    }),
    b: new Array(C).fill(0),
  });
}

// 線形分類器の学習は重いので、CPU のコア数だけ並列に動かす(ml/linear.mjs、ml/linear-worker.mjs)
const POOL_SIZE = Math.max(1, Math.min(os.availableParallelism?.() ?? os.cpus().length, 8));
const pool = [];
const queue = [];
let jobSeq = 0;
function runLinear(job) {
  return new Promise((resolve, reject) => {
    queue.push({ id: ++jobSeq, job, resolve, reject });
    pump();
  });
}
function pump() {
  while (queue.length) {
    let w = pool.find((x) => !x.busy);
    if (!w && pool.length < POOL_SIZE) {
      w = { worker: new Worker(new URL("./linear-worker.mjs", import.meta.url)), busy: false };
      w.worker.on("message", ({ id, W, b }) => {
        const task = w.task;
        w.busy = false;
        w.task = null;
        if (task?.id === id) task.resolve({ W, b });
        pump();
      });
      w.worker.on("error", (err) => w.task?.reject(err));
      pool.push(w);
    }
    if (!w) return;
    const task = queue.shift();
    w.busy = true;
    w.task = task;
    w.worker.postMessage({ id: task.id, job: task.job }, [task.job.X.buffer, task.job.y.buffer, task.job.W0.buffer]);
  }
}

function linear(textProtos, opts = {}) {
  return async (X, y, lambda) => {
    const n = X.length, d = X[0].length;
    const Xf = new Float64Array(n * d);
    X.forEach((v, i) => Xf.set(v, i * d));
    const W0 = new Float64Array(C * d);
    textProtos.forEach((v, c) => W0.set(v, c * d));
    const { W, b } = await runLinear({ X: Xf, y: Int32Array.from(y), n, d, C, W0, lambda, ...opts });
    return { W: Array.from({ length: C }, (_, c) => Array.from(W.subarray(c * d, (c + 1) * d))), b: Array.from(b) };
  };
}

// ---- 評価 ----
function rank(head, x) {
  return head.W.map((w, c) => [c, dot(w, x) + head.b[c]]).sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

function evaluate(head, X, y, evalClasses) {
  const out = [];
  for (let i = 0; i < X.length; i++) {
    if (!evalClasses.has(y[i])) continue;
    const r = rank(head, X[i]);
    out.push({ label: y[i], pred: r[0], top3: r.slice(0, 3).includes(y[i]), top5: r.slice(0, 5).includes(y[i]), kcalErr: Math.abs(dishKcal[r[0]] - dishKcal[y[i]]) / dishKcal[y[i]] });
  }
  return out;
}

const summarize = (rows) => {
  const n = rows.length;
  const errs = rows.map((r) => r.kcalErr).sort((a, b) => a - b);
  return {
    n,
    top1: rows.filter((r) => r.pred === r.label).length / n,
    top3: rows.filter((r) => r.top3).length / n,
    top5: rows.filter((r) => r.top5).length / n,
    kcal20: errs.filter((e) => e <= 0.2).length / n,
  };
};

// 料理ごとに順番に k 個へ振り分ける(毎回同じ結果になる)
function splitFolds(y, k) {
  const byClass = {};
  y.forEach((c, i) => (byClass[c] ??= []).push(i));
  const fold = new Array(y.length);
  for (const idxs of Object.values(byClass)) idxs.forEach((i, j) => (fold[i] = j % k));
  return fold;
}

const subset = (arr, idx) => idx.map((i) => arr[i]);

// 学習用の写真の集合を作る。augment があれば、同じ写真の反転版も学習だけに加える(評価には使わない)
function trainSet(X, y, idx, augment) {
  const Xs = subset(X, idx), ys = subset(y, idx);
  if (!augment) return [Xs, ys];
  return [[...Xs, ...subset(augment, idx)], [...ys, ...ys]];
}

/** 学習用の写真だけで、内側の交差検証により設定を選ぶ(上位3位以内→1位の順で比較) */
async function selectParam(fit, grid, X, y, evalClasses, augment = null) {
  if (grid.length === 1) return grid[0];
  const fold = splitFolds(y, INNER);
  // 設定×分割のすべての学習を同時に投げ、並列に処理させる
  const scored = await Promise.all(
    grid.map(async (p) => {
      const parts = await Promise.all(
        Array.from({ length: INNER }, async (_, f) => {
          const tr = y.map((_, i) => i).filter((i) => fold[i] !== f);
          const te = y.map((_, i) => i).filter((i) => fold[i] === f);
          return evaluate(await fit(...trainSet(X, y, tr, augment), p), subset(X, te), subset(y, te), evalClasses);
        }),
      );
      return { p, s: summarize(parts.flat()) };
    }),
  );
  let best = null;
  for (const c of scored) if (!best || c.s.top3 > best.s.top3 || (c.s.top3 === best.s.top3 && c.s.top1 > best.s.top1)) best = c;
  return best.p;
}

/** 外側の交差検証。各分割で設定を選び直し、学習に使っていない写真で測る */
async function nestedCV(fit, grid, X, y, evalClasses, augment = null) {
  const fold = splitFolds(y, OUTER);
  const outs = await Promise.all(
    Array.from({ length: OUTER }, async (_, f) => {
      const tr = y.map((_, i) => i).filter((i) => fold[i] !== f);
      const te = y.map((_, i) => i).filter((i) => fold[i] === f);
      const p = await selectParam(fit, grid, subset(X, tr), subset(y, tr), evalClasses, augment && subset(augment, tr));
      return { p, rows: evaluate(await fit(...trainSet(X, y, tr, augment), p), subset(X, te), subset(y, te), evalClasses) };
    }),
  );
  const rows = outs.flatMap((o) => o.rows);
  return { ...summarize(rows), rows, chosen: outs.map((o) => o.p) };
}

// ---- 実行 ----
const t0 = Date.now();
const allItems = await listImages();
const allX = await embedImages(allItems);
const { keep, removed, conflicts } = dedupe(allItems, allX);
const items = keep.map((i) => allItems[i]);
const X = keep.map((i) => allX[i]);
const Xflip = await embedImages(items, { flip: true });
const y = items.map((it) => DISH_KEYS.indexOf(it.key));
console.error(`images: ${items.length} (removed ${removed.length} near-duplicates, ${conflicts} with conflicting labels), model: ${MODEL} (${DTYPE})`);

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
y.forEach((c) => (counts[c] = (counts[c] ?? 0) + 1));
const evalClasses = new Set(Object.entries(counts).filter(([, n]) => n >= MIN_EVAL).map(([c]) => Number(c)));

const METHODS = [
  { name: "ゼロショット(説明文のみ、学習なし)", fit: zeroShot(textProtos), grid: [null] },
  { name: "代表ベクトル(写真の平均と説明文を混ぜる)", fit: protoBlend(textProtos), grid: [0, 0.25, 0.5, 0.75] },
  { name: "線形分類器(説明文から学習を始める)", fit: linear(textProtos), grid: [0.3, 0.1, 0.03, 0.01] },
  { name: "線形分類器 + 左右反転で水増し", fit: linear(textProtos), grid: [0.3, 0.1, 0.03, 0.01], augment: true },
];
const results = [];
for (const m of METHODS) {
  const t = Date.now();
  const r = await nestedCV(m.fit, m.grid, X, y, evalClasses, m.augment ? Xflip : null);
  results.push({ ...m, ...r });
  console.error(`${m.name}: top1 ${(r.top1 * 100).toFixed(1)}% top3 ${(r.top3 * 100).toFixed(1)}% (${((Date.now() - t) / 1000).toFixed(0)}s, chosen ${JSON.stringify(r.chosen)})`);
}
const best = [...results].sort((a, b) => b.top3 - a.top3 || b.top1 - a.top1)[0];

// ---- 報告 ----
const pct = (x) => (x * 100).toFixed(1) + "%";
const lines = [];
lines.push(`# 料理判別AI 評価結果`, "");
lines.push(`- モデル: ${MODEL}(${DTYPE}、スマホと同じ量子化)`);
const bySource = {};
for (const it of items) bySource[it.source] = (bySource[it.source] ?? 0) + 1;
lines.push(`- 評価写真: ${best.n} 枚 / ${evalClasses.size} 品目。自由ライセンスの写真を1枚ずつ目視確認したもの(${Object.entries(bySource).map(([k, v]) => `${k} ${v} 枚`).join("、")})`);
lines.push(`- 重複の除去: 画像ベクトルの類似度 ${DUP_THRESHOLD} 以上の ${removed.length} 枚を同じ写真とみなして除外。そのうち別の料理として登録されていた ${conflicts} 組は、正解が決められないため両方とも除外`);
lines.push(`- 候補: 全 ${C} 品目から選ぶ(写真が${MIN_EVAL}枚未満の ${C - evalClasses.size} 品目は候補には入るが評価しない)`);
lines.push(`- 評価方法: 入れ子の交差検証(外側 ${OUTER} 分割で測定、設定は学習用写真だけの内側 ${INNER} 分割で選択)`, "");
lines.push(`| 方式 | 1位正解率 | 上位3位以内(目標 95%) | 上位5位以内 | カロリーのずれ20%以内 | 選ばれた設定 |`, `|---|---|---|---|---|---|`);
for (const r of results) lines.push(`| ${r.name} | ${pct(r.top1)} | ${pct(r.top3)} | ${pct(r.top5)} | ${pct(r.kcal20)} | ${[...new Set(r.chosen)].join(", ")} |`);
lines.push("", "- 上位3位以内: アプリが候補を3つ出したとき、その中に正解がある割合(=1タップ以内で正しく記録できる割合)。");
lines.push("- カロリーのずれ20%以内: 1位の料理の標準1皿のカロリーが、正解の料理の標準1皿の ±20% 以内に入る割合。量の推定の誤差は含まない。");

const per = {};
for (const r of best.rows) {
  const p = (per[r.label] ??= { ok: 0, top3: 0, n: 0, confused: {} });
  p.n++;
  p.ok += r.pred === r.label;
  p.top3 += r.top3;
  if (r.pred !== r.label) p.confused[r.pred] = (p.confused[r.pred] ?? 0) + 1;
}
lines.push("", `## 料理ごとの正解率(${best.name})`, "", `| 料理 | 1位 | 上位3位以内 | 枚数 | よく間違える相手 |`, `|---|---|---|---|---|`);
for (const [c, p] of Object.entries(per).sort((a, b) => a[1].top3 / a[1].n - b[1].top3 / b[1].n || a[1].ok / a[1].n - b[1].ok / b[1].n)) {
  const conf = Object.entries(p.confused).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, k]) => `${DISHES[DISH_KEYS[w]].names.ja}(${k})`).join("、");
  lines.push(`| ${DISHES[DISH_KEYS[c]].names.ja} | ${pct(p.ok / p.n)} | ${pct(p.top3 / p.n)} | ${p.n} | ${conf || "—"} |`);
}
const report = lines.join("\n") + "\n";
await writeFile(path.join(ROOT, "REPORT.md"), report);
console.log(report);

// ---- 学習に使った写真の出典(作者・ライセンス・元のページ)を記録する ----
// 写真そのものは公開しないが、CC BY / CC BY-SA の写真を使っているため、使った写真の一覧と作者を残す
const credits = [];
for (const src of SOURCES) {
  const attrFile = path.join(src.dir, "attribution.json");
  if (!existsSync(attrFile)) continue;
  const attr = JSON.parse(await readFile(attrFile, "utf8"));
  for (const it of items.filter((x) => x.source === src.name)) {
    const rel = path.relative(src.dir, it.file);
    const a = attr[rel];
    if (a) credits.push({ dish: it.key, source: src.name, title: a.title, author: a.artist, license: a.license, page: a.page });
  }
}
await writeFile(path.join(ROOT, "ATTRIBUTION.json"), JSON.stringify(credits, null, 1));

// ---- スマホ用の分類ヘッドを書き出す(全写真で学習。設定は全写真の交差検証で選ぶ) ----
const finalAug = best.augment ? Xflip : null;
const finalParam = await selectParam(best.fit, best.grid, X, y, evalClasses, finalAug);
const head = await best.fit(...trainSet(X, y, X.map((_, i) => i), finalAug), finalParam);
const round = (v) => v.map((x) => Math.round(x * 1e4) / 1e4);
await mkdir(path.join(ROOT, "..", "public", "models"), { recursive: true });
await writeFile(
  path.join(ROOT, "..", "public", "models", "dish-head.json"),
  JSON.stringify({
    model: MODEL,
    dtype: DTYPE,
    method: best.name,
    param: finalParam,
    keys: DISH_KEYS,
    W: head.W.map(round),
    b: round(head.b),
    textPrototypes: textProtos.map(round),
    nonFood: nonFood.map(round),
    eval: { top1: best.top1, top3: best.top3, top5: best.top5, n: best.n },
  }),
);
for (const w of pool) w.worker.terminate();
console.error(`wrote public/models/dish-head.json (${best.name}, param ${finalParam}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
