// 利用者が同意して送った料理の写真を保存する(料理判別AIの学習用)。
// - CONTRIB_DIR が設定されているときだけ有効(Render の無料プランのディスクは更新のたびに消えるため、永続ディスクを指定する)
// - 保存するのは中央を切り出した小さな JPEG と、料理キー・確認方法・州・端末ごとのランダムな ID だけ
// - 端末の ID ごとにまとめて削除できる(設定画面の「送った写真を削除」)
// 保存先: <CONTRIB_DIR>/<料理キー>/<時刻>-<乱数>.jpg と、<CONTRIB_DIR>/contributions.jsonl(1行1件)
import { mkdir, writeFile, appendFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export const LABEL_SOURCES = ["user_corrected", "user_confirmed", "cloud"];
const MAX_IMAGE_BYTES = 200 * 1024;
const ID_RE = /^[a-f0-9]{32}$/;

export function contributionsDir(env = process.env) {
  return env.CONTRIB_DIR ? path.resolve(env.CONTRIB_DIR) : null;
}

export class ContributionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * 1件保存する。body: { image: "data:image/jpeg;base64,...", dish_key, source, state, contributor }
 * validDishes: 保存してよい料理キーの集合(料理一覧にないキーは受け付けない)
 */
export async function saveContribution(dir, body, validDishes, now = Date.now()) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body?.image ?? "");
  if (!match) throw new ContributionError("bad_request", "image must be a JPEG data URL");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ContributionError("bad_request", "image too large");
  // JPEG の先頭(SOI)を確認する
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ContributionError("bad_request", "not a JPEG");
  const dish = String(body.dish_key ?? "");
  if (!validDishes.has(dish)) throw new ContributionError("bad_request", "unknown dish");
  const source = LABEL_SOURCES.includes(body.source) ? body.source : null;
  if (!source) throw new ContributionError("bad_request", "unknown label source");
  const contributor = String(body.contributor ?? "");
  if (!ID_RE.test(contributor)) throw new ContributionError("bad_request", "bad contributor id");
  const state = typeof body.state === "string" && /^[A-Z]{2,5}$/.test(body.state) ? body.state : "";

  const file = `${now}-${randomBytes(4).toString("hex")}.jpg`;
  await mkdir(path.join(dir, dish), { recursive: true });
  await writeFile(path.join(dir, dish, file), bytes);
  const record = { file: `${dish}/${file}`, dish, source, state, contributor, at: new Date(now).toISOString() };
  await appendFile(path.join(dir, "contributions.jsonl"), JSON.stringify(record) + "\n");
  return record;
}

/** その端末が送った写真をすべて削除し、削除した件数を返す */
export async function deleteContributions(dir, contributor) {
  if (!ID_RE.test(String(contributor ?? ""))) throw new ContributionError("bad_request", "bad contributor id");
  const log = path.join(dir, "contributions.jsonl");
  if (!existsSync(log)) return 0;
  const lines = (await readFile(log, "utf8")).split("\n").filter(Boolean);
  const keep = [];
  let removed = 0;
  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      keep.push(line);
      continue;
    }
    if (rec.contributor === contributor) {
      await rm(path.join(dir, rec.file), { force: true });
      removed++;
    } else keep.push(line);
  }
  await writeFile(log, keep.length ? keep.join("\n") + "\n" : "");
  return removed;
}
