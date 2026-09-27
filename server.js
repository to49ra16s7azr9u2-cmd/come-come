import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SYSTEM_PROMPT, buildUserText, normalizeAnalysis } from "./public/analysis.js";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.COMECOME_MODEL || "claude-opus-5";
const EFFORT = process.env.COMECOME_EFFORT || "low";
const INITIAL_EFFORT = process.env.COMECOME_INITIAL_EFFORT || "high";
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
  eating: z.boolean(),
  scene_note: z.string(),
  dishes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      serving_description: z.string(),
      confidence: z.number(),
      remaining_percent: z.number(),
      visible: z.boolean(),
      reference: z.string(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          db_key: z.string(),
          grams: z.number(),
          dimensions_cm: z.object({ length: z.number(), width: z.number(), height: z.number() }),
          per100g: Nutrients,
        }),
      ),
    }),
  ),
});

async function analyzeFrame({ image, mediaType, knownDishes, options }) {
  // 新しい食事の最初の1枚は料理の特定と量の見積もりが重要なので深く考えさせ、
  // 以降の残量の更新は軽く・速くする
  const effort = knownDishes.length ? EFFORT : INITIAL_EFFORT;
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort, format: betaZodOutputFormat(Analysis) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: buildUserText(knownDishes, options) },
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
  return normalizeAnalysis(response.parsed_output);
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
        knownDishes: Array.isArray(body.knownDishes) ? body.knownDishes.slice(0, 20) : [],
        options: {
          lang: ["es", "en", "ja"].includes(body.lang) ? body.lang : "es",
          plateCm: Math.min(60, Math.max(0, Number(body.plateCm) || 0)),
          bites: Math.min(50, Math.max(0, Math.round(Number(body.bites) || 0))),
        },
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
