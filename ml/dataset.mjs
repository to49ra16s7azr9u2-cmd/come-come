// 料理判別AIの学習用データ(目視確認済みの写真とその画像ベクトル、料理の説明文のベクトル)を読み込む。
// train.mjs(学習と評価)と simulate.mjs(アプリの使い方を想定した評価)で共有する。
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, RawImage } from "@huggingface/transformers";
import { DISH_KEYS, NON_FOOD_PROMPTS, dishPrompts } from "../public/dishes.js";

export const MODEL = process.env.CLIP_MODEL || "Xenova/clip-vit-base-patch16";
export const DTYPE = process.env.CLIP_DTYPE || "q8";
export const ROOT = path.dirname(new URL(import.meta.url).pathname);
// 写真の出典ごとのフォルダと、目視確認の結果。確認結果のファイルが無い出典は使わない(確認していない写真で学習しない)
export const SOURCES = [
  { name: "Wikimedia Commons", dir: path.join(ROOT, "data"), review: path.join(ROOT, "review.json") },
  { name: "Openverse (Flickr ほか)", dir: path.join(ROOT, "data-openverse"), review: path.join(ROOT, "review-openverse.json") },
  // 利用者が同意して送った写真(サーバーの CONTRIB_DIR を ml/data-contrib にコピーして使う)。
  // ファイル名は「時刻-乱数.jpg」なので、除外は review-contrib.json の exclude に時刻の数字で書く
  { name: "利用者の写真", dir: path.join(ROOT, "data-contrib"), review: path.join(ROOT, "review-contrib.json") },
];
export const DUP_THRESHOLD = 0.95; // 画像ベクトルがこれ以上近い写真は同じ写真とみなす
export const CACHE = path.join(ROOT, "cache");



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

export async function listImages() {
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
export function dedupe(items, X) {
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
export const norm = (v) => {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
};
export const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
export const mean = (vs) => vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length);

/** 左右反転した画像(学習用の水増し) */
function mirror(image) {
  const { width, height, channels, data } = image;
  const out = new data.constructor(data.length);
  for (let yy = 0; yy < height; yy++)
    for (let xx = 0; xx < width; xx++)
      for (let c = 0; c < channels; c++) out[(yy * width + xx) * channels + c] = data[(yy * width + (width - 1 - xx)) * channels + c];
  return new RawImage(out, width, height, channels);
}

export async function embedImages(items, { flip = false } = {}) {
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

export async function embedTexts(texts) {
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: DTYPE });
  const { text_embeds } = await textModel(tokenizer(texts, { padding: true, truncation: true }));
  const dim = text_embeds.dims[1];
  return texts.map((_, i) => norm(Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim))));
}

/** 重複を除いた写真・ラベル・画像ベクトル(反転を含む)・説明文のベクトルをまとめて読み込む */
export async function loadDataset() {
  const allItems = await listImages();
  const allX = await embedImages(allItems);
  const { keep, removed, conflicts } = dedupe(allItems, allX);
  const items = keep.map((i) => allItems[i]);
  const X = keep.map((i) => allX[i]);
  const Xflip = await embedImages(items, { flip: true });
  const y = items.map((it) => DISH_KEYS.indexOf(it.key));
  const promptSets = DISH_KEYS.map(dishPrompts);
  const flat = await embedTexts(promptSets.flat());
  const textProtos = [];
  let o = 0;
  for (const ps of promptSets) {
    textProtos.push(norm(mean(flat.slice(o, o + ps.length))));
    o += ps.length;
  }
  const nonFood = await embedTexts(NON_FOOD_PROMPTS);
  return { items, X, Xflip, y, textProtos, nonFood, removed, conflicts };
}
