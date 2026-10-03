// アプリでの使い方を想定した評価。学習に使っていない写真(5分割交差検証)で、次の2つの効果を測る。
//  1. 州の料理を優先する: 利用者が料理の州に住んでいるとき(得をする場合)と、別の州に住んでいるとき(損をする場合)
//  2. 自信がないときだけクラウドに聞く: 1位の確率がしきい値未満の写真をクラウドに回したとき、
//     スマホだけで決める写真の割合と、その写真での上位3位以内の正解率
// 学習方式と設定は ml/train.mjs の入れ子の交差検証で最良だったもの(線形分類器 + 左右反転、正則化 0.01)に固定する。
// 結果は ml/SIMULATION.md に書き出す。クラウド(Claude)の正解率はここでは測れない(API を呼ばない)。
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DISH_KEYS, STATES, DISHES } from "../public/dishes.js";
import { applyStatePrior, preferCandidates } from "../public/classifier.js";
import { ROOT, loadDataset } from "./dataset.mjs";
import { runLinear, closePool } from "./pool.mjs";

const LAMBDA = Number(process.env.LAMBDA) || 0.01;
const FOLDS = 5;
const MIN_EVAL = 8;
const C = DISH_KEYS.length;

const { X, Xflip, y, textProtos } = await loadDataset();
const n = X.length, d = X[0].length;

// 料理ごとに順番に振り分ける(train.mjs と同じ)
const byClass = {};
y.forEach((c, i) => (byClass[c] ??= []).push(i));
const fold = new Array(n);
for (const idxs of Object.values(byClass)) idxs.forEach((i, j) => (fold[i] = j % FOLDS));
const counts = {};
y.forEach((c) => (counts[c] = (counts[c] ?? 0) + 1));

// 各分割で学習し、評価用の写真の確率(料理ごと)を集める
const probs = new Array(n);
await Promise.all(
  Array.from({ length: FOLDS }, async (_, f) => {
    const tr = [...Array(n).keys()].filter((i) => fold[i] !== f);
    const rows = [...tr.map((i) => X[i]), ...tr.map((i) => Xflip[i])];
    const ys = [...tr.map((i) => y[i]), ...tr.map((i) => y[i])];
    const Xf = new Float64Array(rows.length * d);
    rows.forEach((v, i) => Xf.set(v, i * d));
    const W0 = new Float64Array(C * d);
    textProtos.forEach((v, c) => W0.set(v, c * d));
    const { W, b } = await runLinear({ X: Xf, y: Int32Array.from(ys), n: rows.length, d, C, W0, lambda: LAMBDA });
    for (let i = 0; i < n; i++) {
      if (fold[i] !== f) continue;
      const logits = new Float64Array(C);
      let max = -Infinity;
      for (let c = 0; c < C; c++) {
        let s = b[c];
        for (let k = 0; k < d; k++) s += W[c * d + k] * X[i][k];
        logits[c] = s;
        if (s > max) max = s;
      }
      let z = 0;
      for (let c = 0; c < C; c++) z += (logits[c] = Math.exp(logits[c] - max));
      probs[i] = DISH_KEYS.map((key, c) => ({ key, prob: logits[c] / z })).sort((a, b) => b.prob - a.prob);
    }
  }),
);
closePool();

const evalIdx = [...Array(n).keys()].filter((i) => counts[y[i]] >= MIN_EVAL);
const pct = (x) => (x * 100).toFixed(1) + "%";
const top3 = (ranked, i, stateDishes = []) => preferCandidates(ranked, 3, stateDishes).some((c) => c.key === DISH_KEYS[y[i]]);
const statesOf = (key) => Object.entries(STATES).filter(([, st]) => st.dishes.includes(key)).map(([c]) => c);

// ---- 1. 州の料理を優先する ----
const regional = evalIdx.filter((i) => statesOf(DISH_KEYS[y[i]]).length);
const stateCodes = Object.keys(STATES);
let base = 0, home = 0, away = 0;
for (const i of regional) {
  const key = DISH_KEYS[y[i]];
  const mine = statesOf(key);
  const homeState = mine[i % mine.length]; // 料理の州に住む利用者(複数あれば順番に)
  const awayState = stateCodes.filter((c) => !mine.includes(c))[i % (stateCodes.length - mine.length)]; // 別の州の利用者
  base += top3(probs[i], i);
  const hd = STATES[homeState].dishes;
  home += top3(preferCandidates(applyStatePrior(probs[i], hd), 3, hd), i, hd);
  const ad = STATES[awayState].dishes;
  away += top3(preferCandidates(applyStatePrior(probs[i], ad), 3, ad), i, ad);
}

// ---- 2. 自信がないときだけクラウドに聞く ----
const thresholds = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const hybrid = thresholds.map((tau) => {
  const kept = evalIdx.filter((i) => probs[i][0].prob >= tau);
  const ok = kept.filter((i) => top3(probs[i], i)).length;
  const ok1 = kept.filter((i) => probs[i][0].key === DISH_KEYS[y[i]]).length;
  return { tau, kept: kept.length / evalIdx.length, top3: kept.length ? ok / kept.length : 1, top1: kept.length ? ok1 / kept.length : 1 };
});
const chosen = hybrid.find((h) => h.top3 >= 0.95) ?? hybrid[hybrid.length - 1];

const lines = [
  "# アプリでの使い方を想定した評価",
  "",
  `- 学習に使っていない写真 ${evalIdx.length} 枚(5分割交差検証、線形分類器 + 左右反転、正則化 ${LAMBDA})。写真1枚ずつの判別で、アプリの5フレーム多数決は含まない`,
  "",
  "## 1. 住んでいる州の料理を優先する",
  "",
  `州の郷土料理として登録されている料理の写真 ${regional.length} 枚で、上位3位以内に正解が入る割合。`,
  "",
  "| 利用者 | 上位3位以内 |",
  "|---|---|",
  `| 州を設定していない | ${pct(base / regional.length)} |`,
  `| その料理の州に住んでいる(得をする場合) | ${pct(home / regional.length)} |`,
  `| 別の州に住んでいる(損をする場合) | ${pct(away / regional.length)} |`,
  "",
  "## 2. 自信がないときだけクラウドに聞く",
  "",
  "1位の確率がしきい値より低い写真をクラウドに回したとき。「スマホで決める割合」以外の写真はクラウドが判別する(その正解率はここでは測っていない)。",
  "",
  "| しきい値 | スマホで決める割合 | そのうち上位3位以内 | そのうち1位 |",
  "|---|---|---|---|",
  ...hybrid.map((h) => `| ${h.tau} | ${pct(h.kept)} | ${pct(h.top3)} | ${pct(h.top1)} |`),
  "",
  `アプリでは、スマホで決めた分の上位3位以内が 95% 以上になる最小のしきい値 **${chosen.tau}** を使う(スマホで決める割合 ${pct(chosen.kept)})。`,
];
await writeFile(path.join(ROOT, "SIMULATION.md"), lines.join("\n") + "\n");
await writeFile(path.join(ROOT, "..", "public", "models", "hybrid.json"), JSON.stringify({ threshold: chosen.tau, phoneShare: chosen.kept, phoneTop3: chosen.top3 }));
console.log(lines.join("\n"));
