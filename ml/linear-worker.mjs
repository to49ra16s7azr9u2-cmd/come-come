import { parentPort } from "node:worker_threads";
import { fitLinear } from "./linear.mjs";

parentPort.on("message", ({ id, job }) => {
  const { W, b } = fitLinear(job);
  parentPort.postMessage({ id, W, b }, [W.buffer, b.buffer]);
});
