// 端末内のリアルタイム物体検出と「ひと口」検出。
// 車種判別アプリと同じく、軽いモデル(COCO-SSD)をブラウザ内で1秒に数回動かし、
// 重い解析(Claude)は「ひと口食べた」「料理が現れた」といった出来事のときだけ呼ぶ。

// 食事に関係する COCO のクラス
export const FOOD_CLASSES = new Set([
  "bowl", "cup", "wine glass", "bottle", "fork", "knife", "spoon",
  "sandwich", "pizza", "hot dog", "donut", "cake", "banana", "apple", "orange", "broccoli", "carrot",
]);
// 口に運ばれるもの(食器・手で持つ食べ物・飲み物)
const TO_MOUTH = new Set(["fork", "spoon", "knife", "cup", "wine glass", "bottle", "sandwich", "pizza", "hot dog", "donut", "banana", "apple"]);

const SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js",
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("failed to load " + src));
    document.head.append(s);
  });
}

/** COCO-SSD を読み込む。読み込めない環境では null を返し、アプリは画面の変化量だけで動く */
export async function loadDetector() {
  try {
    for (const src of SCRIPTS) await loadScript(src);
    const model = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
    return {
      async detect(video) {
        const preds = await model.detect(video, 20, 0.35);
        return preds.map((p) => ({ label: p.class, score: p.score, box: p.bbox }));
      },
    };
  } catch (err) {
    console.warn("detector unavailable:", err);
    return null;
  }
}

/**
 * 検出結果の列から「ひと口」を数える。
 * 人の顔の位置(人物枠の上部)に、食器や手で持つ食べ物が入って出ていったら1口とする。
 */
export class BiteTracker {
  constructor({ minDwellMs = 250, cooldownMs = 1200 } = {}) {
    this.minDwellMs = minDwellMs;
    this.cooldownMs = cooldownMs;
    this.nearSince = null;
    this.lastBiteAt = -Infinity;
    this.bites = 0;
  }

  /** 1フレーム分の検出結果を渡す。ひと口が完了したフレームで true を返す */
  update(detections, now) {
    const person = detections.filter((d) => d.label === "person").sort((a, b) => area(b.box) - area(a.box))[0];
    if (!person) {
      this.nearSince = null;
      return false;
    }
    const [px, py, pw, ph] = person.box;
    // 顔〜口のあたり: 人物枠の上35%、横は中央60%
    const mouth = [px + pw * 0.2, py, pw * 0.6, ph * 0.35];
    const near = detections.some((d) => TO_MOUTH.has(d.label) && overlaps(d.box, mouth));
    if (near) {
      if (this.nearSince === null) this.nearSince = now;
      return false;
    }
    const wasNear = this.nearSince !== null && now - this.nearSince >= this.minDwellMs;
    this.nearSince = null;
    if (wasNear && now - this.lastBiteAt >= this.cooldownMs) {
      this.lastBiteAt = now;
      this.bites++;
      return true;
    }
    return false;
  }
}

function area([, , w, h]) {
  return w * h;
}

function overlaps([ax, ay, aw, ah], [bx, by, bw, bh]) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
