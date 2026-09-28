// 線形分類器(多クラスのロジスティック回帰)の学習。train.mjs と、並列実行用の linear-worker.mjs から使う。
// 重みは説明文のベクトル W0(×SCALE)から始め、lambda の強さでそこに引き戻す。料理ごとの枚数の偏りは重みで補正する。
export const SCALE = 30;

/**
 * X: 画像ベクトルを並べた Float64Array(n×d)、y: 料理番号の Int32Array、W0: 説明文のベクトル(C×d)
 * 返り値: { W: Float64Array(C×d、SCALE を掛けた後), b: Float64Array(C) }
 */
export function fitLinear({ X, y, n, d, C, W0, lambda, epochs = 250, lr = 0.02 }) {
  const W = Float64Array.from(W0);
  const b = new Float64Array(C);
  const counts = new Float64Array(C);
  for (const c of y) counts[c]++;
  const present = counts.filter((k) => k > 0).length;
  const sw = Float64Array.from(y, (c) => n / (present * counts[c]));
  const totalW = sw.reduce((a, v) => a + v, 0);
  const mW = new Float64Array(C * d), vW = new Float64Array(C * d), mB = new Float64Array(C), vB = new Float64Array(C);
  const gW = new Float64Array(C * d), gB = new Float64Array(C), logits = new Float64Array(C);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  for (let t = 1; t <= epochs; t++) {
    gW.fill(0);
    gB.fill(0);
    for (let i = 0; i < n; i++) {
      const xo = i * d;
      let max = -Infinity;
      for (let c = 0; c < C; c++) {
        let s = b[c];
        const wo = c * d;
        for (let k = 0; k < d; k++) s += W[wo + k] * X[xo + k];
        logits[c] = SCALE * s;
        if (logits[c] > max) max = logits[c];
      }
      let z = 0;
      for (let c = 0; c < C; c++) z += (logits[c] = Math.exp(logits[c] - max));
      const w = sw[i] / totalW;
      for (let c = 0; c < C; c++) {
        const g = w * SCALE * (logits[c] / z - (c === y[i] ? 1 : 0));
        if (g === 0) continue;
        gB[c] += g;
        const wo = c * d;
        for (let k = 0; k < d; k++) gW[wo + k] += g * X[xo + k];
      }
    }
    const c1 = 1 - b1 ** t, c2 = 1 - b2 ** t;
    for (let j = 0; j < C * d; j++) {
      const g = gW[j] + lambda * (W[j] - W0[j]);
      mW[j] = b1 * mW[j] + (1 - b1) * g;
      vW[j] = b2 * vW[j] + (1 - b2) * g * g;
      W[j] -= (lr * (mW[j] / c1)) / (Math.sqrt(vW[j] / c2) + eps);
    }
    for (let c = 0; c < C; c++) {
      mB[c] = b1 * mB[c] + (1 - b1) * gB[c];
      vB[c] = b2 * vB[c] + (1 - b2) * gB[c] * gB[c];
      b[c] -= (lr * (mB[c] / c1)) / (Math.sqrt(vB[c] / c2) + eps);
    }
  }
  for (let j = 0; j < W.length; j++) W[j] *= SCALE;
  for (let c = 0; c < C; c++) b[c] *= SCALE;
  return { W, b };
}
