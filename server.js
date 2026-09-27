import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.COMECOME_MODEL || "claude-opus-5";
const EFFORT = process.env.COMECOME_EFFORT || "low";
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const client = new Anthropic();

const Nutrients = z.object({
  energy_kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  fiber_g: z.number(),
  salt_g: z.number(),
  calcium_mg: z.number(),
  iron_mg: z.number(),
  vitamin_a_ug: z.number(),
  vitamin_b1_mg: z.number(),
  vitamin_b2_mg: z.number(),
  vitamin_c_mg: z.number(),
  vitamin_d_ug: z.number(),
});

const Analysis = z.object({
  eating: z.boolean().describe("人が食事中(食べ物を口に運んでいる/噛んでいる)ように見えるか"),
  scene_note: z.string().describe("画面の状況を日本語で一言"),
  dishes: z.array(
    z.object({
      id: z.string().describe("既知の料理ならそのID。新しい料理なら空文字"),
      name: z.string().describe("料理名(日本語)"),
      serving_description: z.string().describe("1人前として想定した量。例: 茶碗1杯 約150g"),
      portion_nutrients: Nutrients.describe("最初に映った時点の1人前(100%)全体の栄養素量"),
      remaining_percent: z.number().describe("1人前に対する現在の残量 0〜100"),
      visible: z.boolean().describe("この画像に映っているか"),
    }),
  ),
});

const SYSTEM_PROMPT = `あなたは管理栄養士として、食事中の人を映したカメラ画像から摂取量を推定します。

画像には食卓・料理・食べている人が映っています。以下を行ってください。
- 映っている料理・飲み物をすべて特定し、1人前全体(最初に配膳された量)の栄養素量を日本食品標準成分表の感覚で推定する。
- 各料理の現在の残量を、配膳時を100%とした割合で推定する。食べ進めて減った分が「食べた量」になる。
- 「既知の料理」リストに同じ料理がある場合は、そのIDを使い、残量だけを更新する(栄養素量は既知の値をそのまま返してよい)。
- 既知の料理が画像に映っていなければ visible=false とする(残量は既知の値のまま)。
- 新しい料理は id を空文字にする。
- 食べ物が映っていなければ dishes は既知の料理を visible=false で返すだけでよい。
- 箸やスプーンで持ち上げているだけの分は、口に入るまで残量から引かない。
数値は現実的な範囲で、不確かな場合も最も妥当な推定値を返してください。`;

async function analyzeFrame({ image, mediaType, knownDishes }) {
  const known = (knownDishes ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    serving_description: d.serving_description,
    remaining_percent: d.remaining_percent,
  }));

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: betaZodOutputFormat(Analysis) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: `既知の料理:\n${known.length ? JSON.stringify(known, null, 2) : "(なし)"}` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "この画像は解析できませんでした");
  }
  if (!response.parsed_output) {
    throw new HttpError(502, "解析結果を読み取れませんでした");
  }
  return response.parsed_output;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "画像が大きすぎます");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSONが不正です");
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/analyze") {
      const body = await readJson(req);
      const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.image ?? "");
      if (!match) throw new HttpError(400, "image には data URL(jpeg/png/webp)を指定してください");
      const result = await analyzeFrame({
        mediaType: match[1],
        image: match[2],
        knownDishes: Array.isArray(body.knownDishes) ? body.knownDishes : [],
      });
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }
    res.writeHead(405).end();
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
    } else if (err instanceof Anthropic.RateLimitError) {
      sendJson(res, 429, { error: "APIのレート制限に達しました。少し待ってから再試行します" });
    } else if (err instanceof Anthropic.AuthenticationError) {
      sendJson(res, 500, { error: "ANTHROPIC_API_KEY が正しく設定されていません" });
    } else if (err instanceof Anthropic.APIError) {
      console.error(err);
      sendJson(res, 502, { error: `Claude API エラー (${err.status ?? "network"})` });
    } else {
      console.error(err);
      sendJson(res, 500, { error: "サーバーエラー" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`come-come: http://localhost:${PORT}  (model: ${MODEL}, effort: ${EFFORT})`);
});
