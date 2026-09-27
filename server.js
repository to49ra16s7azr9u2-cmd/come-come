import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
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
// 公開するときの保護: アクセスコード、端末ごとの回数制限、1日の上限(APIの使いすぎ防止)
const ACCESS_CODE = process.env.APP_ACCESS_CODE || "";
const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;
const DAILY_LIMIT = Number(process.env.DAILY_ANALYSIS_LIMIT) || 1500;

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
    throw new HttpError(422, "refused", "この画像は解析できませんでした");
  }
  if (!response.parsed_output) {
    throw new HttpError(502, "upstream", "解析結果を読み取れませんでした");
  }
  return normalizeAnalysis(response.parsed_output);
}

class HttpError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function checkAccessCode(req) {
  if (!ACCESS_CODE) return;
  const given = String(req.headers["x-access-code"] ?? "");
  const hash = (v) => createHash("sha256").update(v).digest();
  if (!timingSafeEqual(hash(given), hash(ACCESS_CODE))) throw new HttpError(401, "access_code", "アクセスコードが違います");
}

// 端末(IP)ごとに1分あたりの回数を数える。Render などのプロキシの後ろでは X-Forwarded-For の先頭が端末のIP
const hits = new Map();
let daily = { date: "", count: 0 };
function checkRateLimit(req) {
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) throw new HttpError(429, "rate_limited", "回数が多すぎます");
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  const today = new Date().toISOString().slice(0, 10);
  if (daily.date !== today) daily = { date: today, count: 0 };
  if (daily.count >= DAILY_LIMIT) throw new HttpError(429, "daily_limit", "今日の解析回数の上限に達しました");
  daily.count++;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "bad_request", "画像が大きすぎます");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "bad_request", "JSONが不正です");
  }
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(self), microphone=(), geolocation=()",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
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
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream", "cache-control": "no-cache", ...SECURITY_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && req.url === "/api/config") {
      sendJson(res, 200, { accessCodeRequired: Boolean(ACCESS_CODE) });
      return;
    }
    if (req.method === "POST" && req.url === "/api/analyze") {
      checkAccessCode(req);
      checkRateLimit(req);
      const body = await readJson(req);
      const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.image ?? "");
      if (!match) throw new HttpError(400, "bad_request", "image には data URL(jpeg/png/webp)を指定してください");
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
      sendJson(res, err.status, { error: err.message, code: err.code });
    } else if (err instanceof Anthropic.RateLimitError) {
      sendJson(res, 429, { error: "APIのレート制限に達しました", code: "rate_limited" });
    } else if (err instanceof Anthropic.AuthenticationError) {
      sendJson(res, 500, { error: "ANTHROPIC_API_KEY が正しく設定されていません", code: "api_key" });
    } else if (err instanceof Anthropic.APIError) {
      console.error(err);
      sendJson(res, 502, { error: `Claude API エラー (${err.status ?? "network"})`, code: "upstream" });
    } else {
      console.error(err);
      sendJson(res, 500, { error: "サーバーエラー", code: "server" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`come-come: http://localhost:${PORT}  (model: ${MODEL}, effort: ${EFFORT}, access code: ${ACCESS_CODE ? "on" : "off"})`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("warning: ANTHROPIC_API_KEY is not set");
});
