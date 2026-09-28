// 端末内の料理判別AI(API不要)。
// CLIP の画像部分だけをスマホで動かし、ml/train.mjs で作った「料理ごとの代表ベクトル」と比べて料理名を当てる。
// 車種判別アプリと同じく、1フレームの結果ではなく直近数フレームの多数決で確定させる。


export async function loadDishClassifier({ headUrl = "models/dish-head.json", onProgress } = {}) {
  // ライブラリとモデルはアプリのサーバーから配信する(server.js の /vendor/transformers/ と public/models/)
  const VENDOR = new URL("vendor/transformers/", document.baseURI).href;
  const MODELS = new URL("models/", document.baseURI).href;
  const head = await (await fetch(headUrl)).json();
  const { AutoImageProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import(VENDOR + "transformers.min.js");
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = MODELS;
  env.backends.onnx.wasm.wasmPaths = VENDOR;
  const progress = (p) => {
    if (p.status === "progress" && p.total > 5e6) onProgress?.(p.loaded / p.total);
  };
  // 画像の前処理だけを読み込む(文章側のトークナイザーは不要)
  const processor = await AutoImageProcessor.from_pretrained(head.model);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(head.model, { dtype: head.dtype, progress_callback: progress });
  const canvas = document.createElement("canvas");

  return {
    keys: head.keys,
    /** 映像の1フレームを判別し、確率の高い順に [{key, prob}] を返す。料理が映っていなければ key は null */
    async classify(video) {
      // 中央の正方形を切り出す(CLIP は正方形で見る)
      const s = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = canvas.height = 224;
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 224, 224);
      const { image_embeds } = await vision(await processor(RawImage.fromCanvas(canvas)));
      return scoreEmbedding(Array.from(image_embeds.data), head);
    },
  };
}

/** 画像ベクトルを料理ごとの確率にする(料理ではないもの=null も候補に含める) */
export function scoreEmbedding(embedding, head) {
  const n = Math.hypot(...embedding) || 1;
  const e = embedding.map((x) => x / n);
  const sim = (p) => p.reduce((s, x, i) => s + x * e[i], 0);
  const logits = [...head.prototypes.map(sim), Math.max(...head.nonFood.map(sim))].map((x) => x * 100); // CLIP の温度
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps
    .map((x, i) => ({ key: i < head.keys.length ? head.keys[i] : null, prob: x / total }))
    .sort((a, b) => b.prob - a.prob);
}

/** 直近のフレームの多数決で料理を確定させる */
export class DishVote {
  constructor({ window = 5, minVotes = 3, minProb = 0.35 } = {}) {
    Object.assign(this, { window, minVotes, minProb, history: [] });
  }
  push(top) {
    this.history = [...this.history, top].slice(-this.window);
    const counts = {};
    for (const h of this.history) if (h.key && h.prob >= this.minProb) (counts[h.key] ??= []).push(h.prob);
    const [key, probs] = Object.entries(counts).sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    if (!key || probs.length < this.minVotes) return null;
    return { key, prob: probs.reduce((a, b) => a + b, 0) / probs.length };
  }
}
