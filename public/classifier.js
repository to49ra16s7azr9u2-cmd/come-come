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

/**
 * 画像ベクトルを料理ごとの確率にする。
 * 1) 料理か、料理ではないもの(空の皿・顔・部屋など)かを、説明文のベクトルとの近さで判定する
 * 2) 料理なら、学習した分類ヘッド(W·x + b)で料理ごとの確率を出す
 * 返り値は確率の高い順。料理ではない確率は key: null として含める。
 */
export function scoreEmbedding(embedding, head) {
  const n = Math.hypot(...embedding) || 1;
  const e = embedding.map((x) => x / n);
  const dot = (p) => p.reduce((s, x, i) => s + x * e[i], 0);
  const softmax = (logits) => {
    const max = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((x) => x / total);
  };
  // 料理かどうか(CLIP の温度 100 で2択にする)
  const foodSim = Math.max(...(head.textPrototypes ?? head.prototypes).map(dot));
  const nonFoodSim = Math.max(...head.nonFood.map(dot));
  const [pFood, pNonFood] = softmax([foodSim * 100, nonFoodSim * 100]);
  // 料理ごとの確率
  const logits = head.W ? head.W.map((w, c) => dot(w) + head.b[c]) : head.prototypes.map((p) => dot(p) * 100);
  const probs = softmax(logits);
  return [...probs.map((p, i) => ({ key: head.keys[i], prob: p * pFood })), { key: null, prob: pNonFood }].sort((a, b) => b.prob - a.prob);
}

/** 直近のフレームの多数決で料理を確定させる。候補(上位3つ)は直近のフレームの確率の平均で決める */
export class DishVote {
  constructor({ window = 5, minVotes = 3, minProb = 0.35 } = {}) {
    Object.assign(this, { window, minVotes, minProb, history: [] });
  }
  /** 1フレーム分の判別結果(確率の高い順の配列、または1位だけ)を渡す。料理が確定したら { key, prob } */
  push(ranked) {
    const list = Array.isArray(ranked) ? ranked : [ranked];
    this.history = [...this.history, list].slice(-this.window);
    const counts = {};
    for (const [top] of this.history) if (top?.key && top.prob >= this.minProb) (counts[top.key] ??= []).push(top.prob);
    const [key, probs] = Object.entries(counts).sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    if (!key || probs.length < this.minVotes) return null;
    return { key, prob: probs.reduce((a, b) => a + b, 0) / probs.length };
  }
  /** 直近のフレームで確率の平均が高い料理を k 個(料理ではないものは除く) */
  candidates(k = 3) {
    const sum = {};
    for (const list of this.history) for (const { key, prob } of list) if (key) sum[key] = (sum[key] ?? 0) + prob / this.history.length;
    return Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, k).map(([key, prob]) => ({ key, prob }));
  }
}
