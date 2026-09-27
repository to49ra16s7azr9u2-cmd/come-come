// claude.ai で開けるプレビュー(1ファイルのHTML)を dist/preview.html に書き出す。
// claude.ai 上ではカメラが使えないため、プレビューはサンプルと手入力で画面を試すためのもの。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f) => readFile(path.join(root, "public", f), "utf8");

// 依存順に並べ、import 文と export キーワードを外して1つのモジュールにまとめる
const modules = ["foods.js", "i18n.js", "nutrition.js", "analysis.js", "detector.js", "app.js"];
const script = (await Promise.all(modules.map(pub)))
  .map((src, i) => `// ---- ${modules[i]} ----\n` + src.replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "").replace(/^export\s+/gm, ""))
  .join("\n");

const html = await pub("index.html");
const css = await pub("style.css");
const body = /<body>([\s\S]*)<\/body>/.exec(html)[1].replace(/<script[^>]*src="app\.js"[^>]*><\/script>/, "");
const fonts = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)"/.exec(html)[1];

// claude.ai が <!doctype>/<head>/<body> を付けるので、中身だけを書く
const out = `<title>come-come</title>
<link rel="stylesheet" href="${fonts}" />
<style>
${css}
</style>
${body.trim()}
<script type="module">
${script}
</script>
`;

await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(path.join(root, "dist", "preview.html"), out);
console.log("wrote dist/preview.html", `${(out.length / 1024).toFixed(1)} KB`);
