// Carl's Jr. México の各メニューのページから、公式に掲載されている栄養成分を集めて carls-mx.json に保存する。
// 公開サイトに負荷をかけないよう、1ページごとに間隔をあける。
import { writeFile } from "node:fs/promises";

const BASE = "https://carlsjr.com.mx";
const UA = { "user-agent": "Mozilla/5.0 (come-come nutrition import)" };
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
const num = (lines, label) => {
  const l = lines.find((x) => x.startsWith(label + ":"));
  const m = l && /([\d.]+)/.exec(l.slice(label.length + 1));
  return m ? Number(m[1]) : null;
};

const index = await (await fetch(`${BASE}/menu-y-nutricion`, { headers: UA })).text();
const paths = [...new Set([...index.matchAll(/href="(\/menu\/[^"]+)"/g)].map((m) => m[1]))];
const items = [];
for (const p of paths) {
  const html = await (await fetch(BASE + p, { headers: UA })).text();
  const lines = text(html);
  const i = lines.indexOf("Información Nutricional");
  if (i < 2) {
    console.warn("no nutrition:", p);
    continue;
  }
  const item = {
    name: lines[i - 2],
    description: lines[i - 1],
    url: BASE + p,
    serving_g: num(lines, "Tamaño de la porción"),
    kcal: num(lines, "Calorías"),
    fat_g: num(lines, "Fat"),
    sodium_mg: num(lines, "Sodio"),
    carbs_g: num(lines, "Carbohidratos"),
    fiber_g: num(lines, "Fibra Dietética"),
    protein_g: num(lines, "Proteína"),
  };
  items.push(item);
  console.log(`${item.name}: ${item.kcal} kcal`);
  await new Promise((r) => setTimeout(r, 1500));
}
await writeFile(new URL("./carls-mx.json", import.meta.url), JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), items }, null, 1));
