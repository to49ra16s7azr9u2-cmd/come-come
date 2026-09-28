// スマホの料理判別AIが使うモデルを、Hugging Face から public/models/ にダウンロードする。
// アプリのサーバーから配信することで、外部サービスに頼らず速く・安定して読み込める。
// 使い方: npm run fetch-model (Render ではビルド時に自動で実行)
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const head = JSON.parse(await readFile(path.join(root, "public/models/dish-head.json"), "utf8"));
const suffix = head.dtype === "q8" ? "_quantized" : head.dtype === "fp32" ? "" : `_${head.dtype}`;
const files = ["config.json", "preprocessor_config.json", `onnx/vision_model${suffix}.onnx`];

for (const file of files) {
  const dest = path.join(root, "public/models", head.model, file);
  const url = `https://huggingface.co/${head.model}/resolve/main/${file}`;
  const size = await stat(dest).then((s) => s.size).catch(() => 0);
  if (size > 0) {
    console.log(`skip ${file} (${(size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`saved ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
