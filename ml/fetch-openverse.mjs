// 料理判別AIの学習・評価用に、Openverse(Flickr などの自由ライセンス画像の索引)から料理写真を集める。
// 商用利用と改変が認められるライセンス(CC0・パブリックドメイン・CC BY・CC BY-SA)だけを使う。
// 画像は ml/data-openverse/<料理キー>/ に保存し(git には含めない)、出典を attribution.json に記録する。
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DISHES } from "../public/dishes.js";

const OUT = new URL("./data-openverse/", import.meta.url).pathname;
const PER_CLASS = Number(process.env.PER_CLASS) || 40;
const LICENSES = "cc0,pdm,by,by-sa";

export const QUERIES = {
  tacos_pastor: ["tacos al pastor"],
  tacos_asada: ["tacos de asada", "carne asada tacos"],
  tacos_carnitas: ["carnitas tacos", "tacos de carnitas"],
  quesadilla: ["quesadillas mexico", "quesadilla"],
  enchiladas: ["enchiladas"],
  chilaquiles: ["chilaquiles"],
  pozole: ["pozole"],
  tamales: ["tamales"],
  burrito: ["burrito"],
  torta: ["torta mexicana", "torta ahogada", "mexican torta sandwich"],
  tostadas: ["tostadas mexican", "tostada de tinga", "tostadas de pollo"],
  huevos_rancheros: ["huevos rancheros"],
  huevos_mexicana: ["huevos a la mexicana", "mexican scrambled eggs"],
  molletes: ["molletes mexicanos", "molletes"],
  mole: ["mole poblano", "chicken mole"],
  sopa_fideo: ["sopa de fideo"],
  guacamole: ["guacamole chips", "guacamole"],
  elote: ["elote corn", "mexican street corn"],
  nachos: ["nachos"],
  flautas: ["flautas", "taquitos dorados"],
  sopes: ["sopes mexican", "sopes"],
  tlayuda: ["tlayuda"],
  ceviche: ["ceviche"],
  coctel_camaron: ["coctel de camaron", "mexican shrimp cocktail"],
  frijoles: ["frijoles de la olla", "frijoles charros", "pinto beans bowl"],
  arroz_rojo: ["arroz rojo mexicano", "mexican rice"],
  concha: ["conchas pan dulce", "concha bread"],
  fruta: ["fruit cup mexican", "fruta picada"],
  horchata: ["horchata"],
  refresco: ["glass of cola", "coca cola bottle"],
  cerveza: ["glass of beer", "beer bottle glass"],
  ensalada: ["green salad"],
  pasta: ["spaghetti tomato sauce"],
  ramen: ["ramen"],
  arroz_blanco: ["bowl of white rice", "steamed white rice"],
  chiles_rellenos: ["chiles rellenos", "chile relleno"],
  caldo_pollo: ["caldo de pollo", "mexican chicken soup"],
  birria: ["birria", "birria consome"],
  esquites: ["esquites", "corn in a cup mexican"],
  churros: ["churros"],
  hotcakes: ["pancakes stack", "hotcakes"],
  pizza: ["pizza slice", "pizza"],
  hamburguesa: ["hamburger", "cheeseburger"],
  hot_dog: ["hot dog bun", "hot dog"],
  papas_fritas: ["french fries"],
  pollo_frito: ["fried chicken"],
  sushi: ["sushi"],
  huevos_estrellados: ["fried eggs", "sunny side up eggs"],
  sandwich: ["ham and cheese sandwich", "sandwich"],
  cereal: ["bowl of cereal milk", "cereal breakfast"],
  cafe: ["cup of coffee", "coffee cup"],
  agua: ["glass of water"],
  pastel: ["slice of cake", "cake"],
  helado: ["ice cream", "ice cream cone"],
  galletas: ["cookies plate", "chocolate chip cookies"],
};

async function search(q, page) {
  const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q, license: LICENSES, page_size: "20", page: String(page), mature: "false" })}`;
  const res = await fetch(url, { headers: { "user-agent": "come-come-dataset/0.1" } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 30_000));
    return search(q, page);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()).results ?? [];
}

const attrFile = OUT + "attribution.json";
const attribution = existsSync(attrFile) ? JSON.parse(await readFile(attrFile, "utf8")) : {};
const only = process.argv.slice(2);
// 検索語が決めていない料理(州の郷土料理など)は、スペイン語名と英語名で探す
const ALL = Object.fromEntries(Object.entries(DISHES).map(([k, d]) => [k, QUERIES[k] ?? [d.names.es, d.names.en]]));
for (const [key, queries] of Object.entries(ALL)) {
  if (only.length && !only.includes(key)) continue;
  // 引数なしで実行したときは、すでに集めた料理は取り直さない
  if (!only.length && existsSync(path.join(OUT, key))) continue;
  const dir = path.join(OUT, key);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const k of Object.keys(attribution)) if (k.startsWith(key + "/")) delete attribution[k];
  const picked = new Map();
  for (const q of queries) {
    for (let page = 1; page <= 4 && picked.size < PER_CLASS; page++) {
      try {
        for (const r of await search(q, page)) if (picked.size < PER_CLASS && !picked.has(r.id)) picked.set(r.id, r);
      } catch (e) {
        console.warn(key, q, e.message);
        break;
      }
      await new Promise((r) => setTimeout(r, 1500)); // 公開APIに負荷をかけないよう間隔をあける
    }
  }
  let n = 0;
  for (const r of picked.values()) {
    const file = `${String(n).padStart(3, "0")}.jpg`;
    try {
      const res = await fetch(r.thumbnail, { headers: { "user-agent": "come-come-dataset/0.1" } });
      if (!res.ok || !/image\//.test(res.headers.get("content-type") ?? "")) continue;
      await writeFile(path.join(dir, file), Buffer.from(await res.arrayBuffer()));
      attribution[`${key}/${file}`] = { title: r.title, page: r.foreign_landing_url, license: `${r.license} ${r.license_version}`, artist: r.creator, source: r.source };
      n++;
    } catch {}
  }
  console.log(`${key}: ${n}`);
  await writeFile(attrFile, JSON.stringify(attribution, null, 1));
}
