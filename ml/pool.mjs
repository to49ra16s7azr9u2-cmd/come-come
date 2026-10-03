// 線形分類器の学習(ml/linear.mjs)を、ワーカースレッドで CPU のコア数だけ並列に動かす
import os from "node:os";
import { Worker } from "node:worker_threads";

// 線形分類器の学習は重いので、CPU のコア数だけ並列に動かす(ml/linear.mjs、ml/linear-worker.mjs)
const POOL_SIZE = Math.max(1, Math.min(os.availableParallelism?.() ?? os.cpus().length, 8));
const pool = [];
const queue = [];
let jobSeq = 0;
export function runLinear(job) {
  return new Promise((resolve, reject) => {
    queue.push({ id: ++jobSeq, job, resolve, reject });
    pump();
  });
}
function pump() {
  while (queue.length) {
    let w = pool.find((x) => !x.busy);
    if (!w && pool.length < POOL_SIZE) {
      w = { worker: new Worker(new URL("./linear-worker.mjs", import.meta.url)), busy: false };
      w.worker.on("message", ({ id, W, b }) => {
        const task = w.task;
        w.busy = false;
        w.task = null;
        if (task?.id === id) task.resolve({ W, b });
        pump();
      });
      w.worker.on("error", (err) => w.task?.reject(err));
      pool.push(w);
    }
    if (!w) return;
    const task = queue.shift();
    w.busy = true;
    w.task = task;
    w.worker.postMessage({ id: task.id, job: task.job }, [task.job.X.buffer, task.job.y.buffer, task.job.W0.buffer]);
  }
}


export function closePool() {
  for (const w of pool) w.worker.terminate();
  pool.length = 0;
}
