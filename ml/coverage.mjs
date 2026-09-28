// 州ごと・料理ごとに、目視確認済みの写真が何枚あるかを数えて ml/COVERAGE.md に書き出す。
// 目標は料理ごと 500 枚(実際の食卓の写真を利用者から集める段階で到達を目指す)。
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DISHES, STATES } from "../public/dishes.js";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TARGET = 500;
const SOURCES = [
  { dir: "data", review: "review.json" },
  { dir: "data-openverse", review: "review-openverse.json" },
];

const counts = Object.fromEntries(Object.keys(DISHES).map((k) => [k, { reviewed: 0, unreviewed: 0 }]));
for (const src of SOURCES) {
  const reviewPath = path.join(ROOT, src.review);
  const review = existsSync(reviewPath) ? JSON.parse(await readFile(reviewPath, "utf8")) : { exclude: {}, include_only: {} };
  for (const key of Object.keys(DISHES)) {
    const dir = path.join(ROOT, src.dir, key);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg"));
    const idx = (f) => Number.parseInt(f, 10);
    const inc = review.include_only?.[key];
    const exc = review.exclude?.[key];
    if (inc) counts[key].reviewed += files.filter((f) => inc.includes(idx(f))).length;
    else if (exc) counts[key].reviewed += files.filter((f) => !exc.includes(idx(f))).length;
    else counts[key].unreviewed += files.length;
  }
}

const lines = ["# 写真の集まり具合(州ごと)", "", `目標: 料理ごとに実際の食卓の写真 ${TARGET} 枚。「確認済み」は目視で料理が合っていると確認した自由ライセンスの写真。`, ""];
lines.push("| 州 | 料理数 | 確認済みの写真 | 未確認 | 目標に対する割合 | 写真が20枚未満の料理 |", "|---|---|---|---|---|---|");
for (const [code, st] of Object.entries(STATES)) {
  const r = st.dishes.reduce((s, k) => s + counts[k].reviewed, 0);
  const u = st.dishes.reduce((s, k) => s + counts[k].unreviewed, 0);
  const weak = st.dishes.filter((k) => counts[k].reviewed < 20).map((k) => DISHES[k].names.es);
  lines.push(`| ${st.name} (${code}) | ${st.dishes.length} | ${r} | ${u} | ${((100 * r) / (st.dishes.length * TARGET)).toFixed(1)}% | ${weak.join("、") || "—"} |`);
}
const total = Object.values(counts).reduce((s, c) => s + c.reviewed, 0);
lines.push("", `全 ${Object.keys(DISHES).length} 品目、確認済みの写真 ${total} 枚。`);
await writeFile(path.join(ROOT, "COVERAGE.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
