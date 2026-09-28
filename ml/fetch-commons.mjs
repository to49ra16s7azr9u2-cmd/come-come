// 料理判別AIの評価・学習用に、Wikimedia Commons から自由ライセンスの料理写真を集める。
// 画像は ml/data/<料理キー>/ に保存し(git には含めない)、出典とライセンスを ml/data/attribution.json に記録する。
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const OUT = new URL("./data/", import.meta.url).pathname;
const PER_CLASS = Number(process.env.PER_CLASS) || 40;
const API = "https://commons.wikimedia.org/w/api.php";
const OK_LICENSE = /^(cc0|cc[- ]by(-sa)?[- ]?\d|public domain|pd)/i;

// 料理ごとの検索語(Commons のカテゴリ名を優先し、足りなければ全文検索)
export const QUERIES = {
  tacos_pastor: ["Tacos al pastor", "taco al pastor"],
  tacos_asada: ["Carne asada tacos", "tacos de asada"],
  tacos_carnitas: ["Carnitas", "tacos de carnitas"],
  quesadilla: ["Quesadillas", "quesadilla"],
  enchiladas: ["Enchiladas", "enchiladas"],
  chilaquiles: ["Chilaquiles", "chilaquiles"],
  pozole: ["Pozole", "pozole"],
  tamales: ["Tamales of Mexico", "Tamales", "tamal"],
  burrito: ["Burritos", "burrito"],
  torta: ["Tortas (sandwiches)", "torta ahogada", "torta mexicana"],
  tostadas: ["tostada de tinga", "tostadas de pollo", "tostadas mexicanas", "tostada de pata"],
  huevos_rancheros: ["Huevos rancheros", "huevos rancheros"],
  huevos_mexicana: ["huevos a la mexicana", "huevo a la mexicana", "scrambled eggs with tomato onion chile"],
  molletes: ["molletes con frijoles", "mollete mexicano", "molletes pan bolillo"],
  mole: ["Mole poblano", "mole con pollo"],
  sopa_fideo: ["Sopa de fideo", "sopa de fideo"],
  guacamole: ["Guacamole", "guacamole totopos"],
  elote: ["Elote", "elote"],
  nachos: ["Nachos", "nachos"],
  flautas: ["Flautas", "flautas tacos dorados"],
  sopes: ["Sopes", "sopes"],
  tlayuda: ["Tlayudas", "tlayuda"],
  ceviche: ["Ceviche", "ceviche tostada"],
  coctel_camaron: ["Shrimp cocktails", "coctel de camarón"],
  frijoles: ["frijoles de la olla", "frijoles charros", "bowl of pinto beans", "frijoles negros plato"],
  arroz_rojo: ["arroz a la mexicana", "arroz rojo mexicano", "Mexican rice side dish"],
  concha: ["Conchas (bread)", "concha pan dulce"],
  fruta: ["Fruit cups", "fruta picada"],
  horchata: ["Horchata", "agua de horchata"],
  refresco: ["Coca-Cola bottles", "glass of cola"],
  cerveza: ["Glasses of beer", "beer glass"],
  ensalada: ["Green salads", "green salad"],
  pasta: ["Spaghetti with tomato sauce", "spaghetti tomato sauce"],
  ramen: ["Ramen", "ramen"],
  arroz_blanco: ["Cooked white rice", "bowl of white rice"],
};

async function api(params) {
  const url = API + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  const res = await fetch(url, { headers: { "user-agent": "come-come-dataset/0.1 (research; contact via GitHub)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function search(query, byCategory) {
  const gsrsearch = byCategory ? `incategory:"${query}" filetype:bitmap` : `${query} filetype:bitmap`;
  const data = await api({
    action: "query", generator: "search", gsrnamespace: "6", gsrsearch, gsrlimit: "50",
    prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "384",
  });
  return Object.values(data.query?.pages ?? {})
    .map((p) => {
      const ii = p.imageinfo?.[0];
      const m = ii?.extmetadata ?? {};
      return {
        title: p.title,
        thumb: ii?.thumburl,
        page: ii?.descriptionurl,
        mime: ii?.mime,
        license: m.LicenseShortName?.value ?? "",
        artist: (m.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim(),
      };
    })
    .filter((x) => x.thumb && /jpeg|png|webp/.test(x.mime) && OK_LICENSE.test(x.license));
}

const attribution = existsSync(OUT + "attribution.json") ? JSON.parse(await readFile(OUT + "attribution.json", "utf8")) : {};
const only = process.argv.slice(2);
for (const [key, queries] of Object.entries(QUERIES)) {
  if (only.length && !only.includes(key)) continue;
  const dir = path.join(OUT, key);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const k of Object.keys(attribution)) if (k.startsWith(key + "/")) delete attribution[k];
  const picked = new Map();
  for (const [i, q] of queries.entries()) {
    for (const byCategory of i === 0 ? [true, false] : [false]) {
      if (picked.size >= PER_CLASS) break;
      try {
        for (const img of await search(q, byCategory)) if (picked.size < PER_CLASS) picked.set(img.title, img);
      } catch (e) {
        console.warn(key, q, e.message);
      }
    }
  }
  let n = 0;
  for (const img of picked.values()) {
    const file = `${String(n).padStart(3, "0")}.jpg`;
    try {
      const res = await fetch(img.thumb, { headers: { "user-agent": "come-come-dataset/0.1" } });
      if (!res.ok) continue;
      await writeFile(path.join(dir, file), Buffer.from(await res.arrayBuffer()));
      attribution[`${key}/${file}`] = { title: img.title, page: img.page, license: img.license, artist: img.artist };
      n++;
    } catch {}
  }
  console.log(`${key}: ${n}`);
}
await writeFile(OUT + "attribution.json", JSON.stringify(attribution, null, 1));
