import {
  MEALS,
  ACTIVITY_FACTORS,
  GOALS,
  COUNTRIES,
  DEFAULT_PROFILE,
  normalizeProfile,
  dailyTargets,
  consumedOf,
  sumConsumed,
  evaluate,
  balanceScore,
  mergeAnalysis,
  manualDish,
  mealForTime,
  bmi,
} from "./nutrition.js";
import { FOOD_DB, foodName, searchFoods } from "./foods.js";
import { normalizeAnalysis } from "./analysis.js";
import { LANGS, t, setLang, getLang, detectLang, applyI18n } from "./i18n.js";
import { loadDetector, BiteTracker, FOOD_CLASSES } from "./detector.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const overlay = $("overlay");

// claude.ai 上のプレビューではカメラが使えないため、サンプルと手入力だけで画面を試せるようにする
const PREVIEW = typeof window.claude?.use === "function";

// ---- 保存 ----
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できない環境でも動作は続ける */
    }
  },
};

const dateKey = (d = new Date()) => d.toLocaleDateString("sv-SE");
const dayStoreKey = (date) => "come-come:day:" + date;
function loadDay(date) {
  // 旧形式のキー(come-come:YYYY-MM-DD)も読む
  return store.get(dayStoreKey(date), null) ?? store.get("come-come:" + date, null) ?? { dishes: [], activeIds: [] };
}

let currentDate = dateKey();
let day = loadDay(currentDate);
let profile = normalizeProfile(store.get("come-come:profile", DEFAULT_PROFILE));
let settings = store.get("come-come:settings", { lang: detectLang(navigator.languages ?? [navigator.language]), plan: "free" });
let weights = store.get("come-come:weights", {});

function saveDay() {
  if (!day.dishes.some((d) => d.sample)) store.set(dayStoreKey(currentDate), day);
}
const isPremium = () => settings.plan === "premium";

// ---- アクセスコード(公開サーバーで APP_ACCESS_CODE が設定されているとき) ----
let accessCode = store.get("come-come:accessCode", "");
let accessRequired = false;
let accessWaiter = null;

/** アクセスコードを入力してもらう。入力されたら true */
function askAccessCode(wrong = false) {
  $("accessBody").textContent = wrong ? t("access.wrong") : t("access.body");
  $("accessInput").value = "";
  if (!$("accessDialog").open) $("accessDialog").showModal();
  return new Promise((resolve) => (accessWaiter = resolve));
}

$("accessDialog").addEventListener("close", () => {
  const ok = $("accessDialog").returnValue === "save" && $("accessInput").value.trim() !== "";
  if (ok) {
    accessCode = $("accessInput").value.trim();
    store.set("come-come:accessCode", accessCode);
    pausedUntil = 0;
  }
  accessWaiter?.(ok);
  accessWaiter = null;
});

// ---- カメラとリアルタイム解析 ----
let stream = null;
let facingMode = "user";
let detector = null;
let detectorLoading = null;
let bites = new BiteTracker();
let loopHandle = null;
let lastDetectAt = 0;
let detecting = false;
let lastScheduleAt = 0;
let detections = [];
let busy = false;
let lastAnalysisAt = 0;
let pausedUntil = 0;
let pendingBites = 0;
let lastBiteAt = 0;
let lastSignature = null;
let eatingNow = false;

async function startCamera() {
  stopCamera();
  if (accessRequired && !accessCode && !(await askAccessCode())) return false;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(t("status.cameraUnsupported"), "error");
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    setStatus(t("status.noCamera", { error: err.message }), "error");
    return false;
  }
  video.srcObject = stream;
  await video.play();
  clearSample();
  $("placeholder").hidden = true;
  $("live").hidden = false;
  $("startBtn").textContent = t("btn.stop");
  $("flipBtn").disabled = false;
  $("handsFreeBtn").disabled = false;
  video.classList.toggle("mirror", facingMode === "user");
  bites = new BiteTracker();
  pendingBites = 0;
  lastAnalysisAt = 0;
  render();
  if (!detector) {
    setStatus(t("status.loadingModel"), "busy");
    detectorLoading ??= loadDetector().then((d) => (detector = d));
    await detectorLoading;
  }
  setStatus(t("status.watching"));
  loop();
  return true;
}

function stopCamera() {
  cancelAnimationFrame(loopHandle);
  loopHandle = null;
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
  video.srcObject = null;
  detections = [];
  drawOverlay();
  $("placeholder").hidden = false;
  $("live").hidden = true;
  $("startBtn").textContent = t("btn.start");
  $("flipBtn").disabled = true;
  $("handsFreeBtn").disabled = true;
  exitHandsFree();
}

// 1フレームごとの処理: 端末内検出(軽い)→ ひと口判定 → 必要なときだけClaudeで解析(重い)
function loop() {
  loopHandle = requestAnimationFrame(loop);
  if (!stream || !video.videoWidth || document.hidden) return;
  const now = performance.now();
  if (detector && !detecting && now - lastDetectAt > 150) {
    lastDetectAt = now;
    detecting = true;
    detector
      .detect(video)
      .then((d) => {
        detections = d;
        if (bites.update(d, performance.now())) {
          pendingBites++;
          lastBiteAt = Date.now();
        }
        drawOverlay();
        updateLive();
      })
      .catch(() => {})
      .finally(() => (detecting = false));
  }
  if (now - lastScheduleAt > 500) {
    lastScheduleAt = now;
    maybeAnalyze();
  }
}

function foodVisible() {
  return !detector || detections.some((d) => FOOD_CLASSES.has(d.label));
}

/** Claudeで解析するタイミングを決める */
function maybeAnalyze() {
  if (busy) return;
  const now = Date.now();
  if (now < pausedUntil) return;
  const since = now - lastAnalysisAt;
  const minGap = isPremium() ? 4000 : 8000;
  const hasDishes = activeDishes().length > 0;
  const sig = frameSignature();
  const changed = signatureDiff(sig, lastSignature) > 4;

  // 料理が映った。COCOには「タコス」などのクラスが無いので、検出器が食べ物を見つけられなくても10秒ごとに確認する
  const firstLook = !hasDishes && since > (foodVisible() ? 3000 : 10000);
  const afterBite = pendingBites > 0 && now - lastBiteAt > 1500 && since >= minGap; // ひと口食べた
  const sceneChanged = changed && since >= (detector ? 20000 : minGap); // 検出器が無いときは画面の変化で判断
  const keepAlive = hasDishes && since >= 60000; // 念のための定期確認
  if (firstLook || afterBite || sceneChanged || keepAlive) {
    lastSignature = sig;
    analyzeFrame();
  }
}

// 小さなグレースケール画像で前回との差分を測る
function frameSignature() {
  const w = 32, h = 18;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const sig = new Uint8Array(w * h);
  for (let i = 0; i < sig.length; i++) sig[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
  return sig;
}

function signatureDiff(a, b) {
  if (!a || !b) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

function captureFrame() {
  // リアルタイム性を優先して解像度は控えめにする(料理の判別には十分)
  const maxW = 768;
  const scale = Math.min(1, maxW / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function analyzeFrame() {
  busy = true;
  lastAnalysisAt = Date.now();
  const bitesNow = pendingBites;
  pendingBites = 0;
  setStatus(t("status.analyzing"), "busy");
  try {
    let res;
    try {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": accessCode },
        body: JSON.stringify({
          image: captureFrame(),
          knownDishes: activeDishes(),
          lang: getLang(),
          plateCm: profile.plate_cm,
          bites: bitesNow,
        }),
      });
    } catch {
      throw new Error(t("err.network"));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === "access_code") {
        // コードが違う(または変わった)ときは、入力されるまで解析を止める
        pausedUntil = Infinity;
        askAccessCode(Boolean(accessCode));
      }
      if (data.code === "rate_limited") pausedUntil = Date.now() + 20_000;
      if (data.code === "daily_limit") pausedUntil = Date.now() + 10 * 60_000;
      if (data.code === "upstream") pausedUntil = Date.now() + 5_000;
      throw new Error(data.code ? t("err." + data.code) : data.error || res.statusText);
    }
    const analysis = normalizeAnalysis(data);
    applyAnalysis(analysis);
    eatingNow = analysis.eating;
    const time = new Date().toLocaleTimeString(getLang(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setStatus(t("status.analyzed", { time, note: analysis.scene_note }));
  } catch (err) {
    pendingBites += bitesNow;
    setStatus(t("status.failed", { error: err.message }), "error");
  } finally {
    busy = false;
    updateLive();
  }
}

function activeDishes() {
  const ids = new Set(day.activeIds);
  return day.dishes.filter((d) => ids.has(d.id));
}

function applyAnalysis(analysis) {
  const active = activeDishes();
  const merged = mergeAnalysis(active, analysis, { db: FOOD_DB, meal: active[0]?.meal });
  const others = day.dishes.filter((d) => !day.activeIds.includes(d.id));
  day.dishes = [...others, ...merged];
  day.activeIds = merged.map((d) => d.id);
  saveDay();
  render();
}

// 検出枠を映像の上に描く(object-fit: cover の拡大と、前面カメラの左右反転に合わせる)
function drawOverlay() {
  const W = overlay.clientWidth;
  const H = overlay.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  overlay.width = W * dpr;
  overlay.height = H * dpr;
  const ctx = overlay.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!video.videoWidth) return;
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
  const dx = (W - video.videoWidth * scale) / 2;
  const dy = (H - video.videoHeight * scale) / 2;
  const mirror = video.classList.contains("mirror");
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.lineWidth = 2;
  for (const d of detections) {
    const isFood = FOOD_CLASSES.has(d.label);
    if (!isFood && d.label !== "person") continue;
    let [x, y, w, h] = d.box.map((v) => v * scale);
    x += dx;
    y += dy;
    if (mirror) x = W - x - w;
    const color = isFood ? "#8ea8ff" : "rgba(255,255,255,.55)";
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);
    const label = `${d.label} ${Math.round(d.score * 100)}%`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 18), tw, 18);
    ctx.fillStyle = "#12151c";
    ctx.fillText(label, x + 4, Math.max(13, y - 5));
  }
}

function updateLive() {
  $("liveBites").textContent = bites.bites;
  const state = $("liveState");
  const eating = eatingNow || Date.now() - lastBiteAt < 5000;
  state.textContent = eating ? t("live.eating") : t("live.waiting");
  state.classList.toggle("on", eating);
}

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.dataset.kind = kind;
  $("hfStatus").textContent = text;
}

// ---- ながら記録モード(プレミアム): 画面を暗くしてスリープさせずに記録を続ける ----
let wakeLock = null;

async function enterHandsFree() {
  if (!isPremium()) {
    $("premiumDialog").showModal();
    return;
  }
  if (!stream && !(await startCamera())) return;
  $("handsFree").hidden = false;
  await requestWakeLock();
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    setStatus(t("handsfree.noWakeLock"), "error");
  }
}

function exitHandsFree() {
  $("handsFree").hidden = true;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener("visibilitychange", async () => {
  if (!stream) return;
  if (document.hidden) {
    // ブラウザはバックグラウンドのタブのカメラを止めるため、一時停止として扱う
    setStatus(t("status.paused"));
    return;
  }
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState === "ended") await startCamera();
  else setStatus(t("status.watching"));
  if (!$("handsFree").hidden) await requestWakeLock();
});

// ---- 描画 ----
const fmt = (v, unit) => {
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${unit}`;
};

function render() {
  $("sampleBanner").hidden = !day.dishes.some((d) => d.sample);
  const targets = dailyTargets(profile);
  const results = evaluate(sumConsumed(day.dishes), targets);
  renderToday(results, targets);
  renderMeals();
  renderNutrients(results);
  renderAdvice(results);
  renderWeight();
  renderHistory(targets);
}

function renderToday(results, targets) {
  const energy = results[0];
  const kcal = Math.round(energy.amount);
  const goal = targets.energy_kcal.value;
  $("kcal").textContent = kcal;
  $("hfKcal").textContent = kcal;
  $("kcalTarget").textContent = goal;
  $("kcalBar").style.width = Math.min(100, energy.ratio * 100) + "%";
  $("kcalBar").dataset.status = energy.status;
  $("kcalLeft").textContent = kcal <= goal ? t("today.remaining", { kcal: goal - kcal }) : t("today.over", { kcal: kcal - goal });
  const score = balanceScore(results);
  $("score").textContent = score;
  $("scoreRing").style.setProperty("--p", score);
}

function renderMeals() {
  const active = new Set(day.activeIds);
  $("meals").replaceChildren(
    ...MEALS.map((meal) => {
      const dishes = day.dishes.filter((d) => (d.meal ?? mealForTime(new Date(d.created_at))) === meal);
      const kcal = dishes.reduce((s, d) => s + consumedOf(d).energy_kcal, 0);
      const group = document.createElement("section");
      group.className = "meal";
      group.innerHTML = `
        <div class="meal-head">
          <h3></h3>
          <span class="meal-kcal">${Math.round(kcal)} kcal</span>
          <button class="ghost small add-btn">+ <span></span></button>
        </div>
        <ul class="dishes"></ul>`;
      group.querySelector("h3").textContent = t("meal." + meal);
      group.querySelector(".add-btn span").textContent = t("btn.add");
      group.querySelector(".add-btn").onclick = () => openAddDialog(meal);
      const list = group.querySelector(".dishes");
      if (!dishes.length) {
        const li = document.createElement("li");
        li.className = "muted small empty";
        li.textContent = t("meals.empty");
        list.append(li);
      }
      for (const d of dishes) list.append(dishItem(d, active.has(d.id)));
      return group;
    }),
  );
}

function dishItem(d, tracking) {
  const li = document.createElement("li");
  const eaten = 100 - d.remaining_percent;
  const kcal = consumedOf(d).energy_kcal;
  const scales = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const tentative = d.confirmed === false;
  li.className = tracking ? "tracking" : "";
  li.innerHTML = `
    <div class="dish-row">
      <div>
        <strong class="dish-name"></strong>
        <span class="pill tentative" ${tentative ? "" : "hidden"}></span>
        <div class="muted small dish-serving"></div>
      </div>
      <div class="dish-kcal">${Math.round(kcal)}<small> kcal</small></div>
    </div>
    <label class="slider muted small"><span class="eaten-label"></span> <output>${Math.round(eaten)}%</output>
      <input type="range" min="0" max="100" step="5" value="${Math.round(eaten)}" />
    </label>
    <details class="ingredients"><summary class="muted small"></summary>
      <ul></ul>
      <div class="detail-row">
        <label class="muted small"><span class="portion-label"></span>
          <select class="scale">${scales.map((x) => `<option value="${x}" ${x === (d.scale ?? 1) ? "selected" : ""}>×${x}</option>`).join("")}</select>
        </label>
        <select class="meal-select">${MEALS.map((m) => `<option value="${m}" ${m === d.meal ? "selected" : ""}></option>`).join("")}</select>
      </div>
    </details>
    <div class="dish-actions">
      <span class="muted small hint"></span>
      <span>
        <button data-act="confirm" class="ghost small" ${tentative ? "" : "hidden"}></button>
        <button data-act="done" class="ghost small"></button>
        <button data-act="remove" class="ghost small danger"></button>
      </span>
    </div>`;
  li.querySelector(".dish-name").textContent = d.name;
  li.querySelector(".dish-serving").textContent = [d.serving_description, d.reference && `(${d.reference})`].filter(Boolean).join(" · ");
  li.querySelector(".tentative").textContent = t("dish.tentative");
  li.querySelector(".hint").textContent = tentative ? t("dish.tentativeHint") : "";
  li.querySelector(".eaten-label").textContent = t("dish.eaten");
  li.querySelector("summary").textContent = t("dish.details");
  li.querySelector(".portion-label").textContent = t("dish.portion") + " ";
  li.querySelectorAll(".meal-select option").forEach((o) => (o.textContent = t("meal." + o.value)));
  li.querySelector('[data-act="confirm"]').textContent = t("btn.confirm");
  li.querySelector('[data-act="done"]').textContent = t("btn.done");
  li.querySelector('[data-act="remove"]').textContent = t("btn.remove");
  li.querySelector(".ingredients ul").replaceChildren(
    ...(d.ingredients ?? []).map((i) => {
      const row = document.createElement("li");
      row.className = "muted small";
      const dimsList = [i.dimensions_cm?.length, i.dimensions_cm?.width, i.dimensions_cm?.height].filter((v) => v > 0);
      const dims = dimsList.length ? ` · ${dimsList.map((v) => Math.round(v * 10) / 10).join("×")} cm` : "";
      row.textContent = `${i.name} ${Math.round(i.grams)} g${dims} (${i.db_key ? t("dish.fromTable") : t("dish.fromAI")})`;
      return row;
    }),
  );
  const range = li.querySelector('input[type="range"]');
  range.oninput = () => (li.querySelector("output").textContent = range.value + "%");
  range.onchange = () => updateDish(d.id, { remaining_percent: 100 - Number(range.value), observations: [] });
  li.querySelector(".scale").onchange = (e) => updateDish(d.id, { scale: Number(e.target.value) });
  li.querySelector(".meal-select").onchange = (e) => updateDish(d.id, { meal: e.target.value });
  li.querySelector('[data-act="confirm"]').onclick = () => updateDish(d.id, { confirmed: true });
  li.querySelector('[data-act="done"]').onclick = () => updateDish(d.id, { remaining_percent: 0 });
  li.querySelector('[data-act="remove"]').onclick = () => removeDish(d.id);
  return li;
}

function renderNutrients(results) {
  $("nutrients").replaceChildren(
    ...results.slice(1).map((r) => {
      const li = document.createElement("li");
      const targetText = r.target.min != null ? `${r.target.min}–${r.target.max}` : `${r.kind === "max" ? "<" : ""}${r.target.value}`;
      li.innerHTML = `
        <div class="n-head">
          <span class="n-label"></span>
          <span class="pill" data-status="${r.status}"></span>
        </div>
        <div class="meter thin"><div class="meter-fill" data-status="${r.status}" style="width:${Math.min(100, r.ratio * 100)}%"></div></div>
        <div class="n-nums muted small">${fmt(r.amount, r.unit)} / ${targetText} ${r.unit}</div>`;
      li.querySelector(".n-label").textContent = t("n." + r.key);
      li.querySelector(".pill").textContent = t("status." + r.status);
      return li;
    }),
  );
}

function renderAdvice(results) {
  const lacking = results.filter((r) => r.status === "low" && r.kind !== "max").sort((a, b) => a.ratio - b.ratio);
  const excess = results.filter((r) => r.status === "high");
  const items = [
    ...lacking.map((r) => {
      const amount = fmt(Math.max(0, (r.target.min ?? r.target.value) - r.amount), r.unit);
      return ["", t("advice.low", { amount, label: t("n." + r.key), foods: t("hint." + r.key) })];
    }),
    ...excess.map((r) => ["warn", t("advice.high", { label: t("n." + r.key), pct: Math.round(r.ratio * 100) })]),
  ];
  if (!items.length) items.push(["good", t("advice.allGood")]);
  $("advice").replaceChildren(
    ...items.map(([cls, text]) => {
      const li = document.createElement("li");
      li.className = cls;
      li.textContent = text;
      return li;
    }),
  );
}

function renderWeight() {
  const entries = Object.entries(weights).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  $("bmi").textContent = t("weight.bmi", { bmi: bmi(profile).toFixed(1), target: profile.target_weight_kg });
  const chart = $("weightChart");
  if (entries.length < 2) {
    chart.innerHTML = `<p class="muted small"></p>`;
    chart.firstChild.textContent = t("weight.empty");
    return;
  }
  const W = 600, H = 160, pad = 28;
  const values = entries.map(([, v]) => v).concat(profile.target_weight_kg);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const x = (i) => pad + (i * (W - pad * 2)) / (entries.length - 1);
  const y = (v) => H - pad - ((v - lo) * (H - pad * 2)) / (hi - lo);
  const points = entries.map(([, v], i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = entries[entries.length - 1];
  const fmtDate = (d) => new Date(d + "T00:00").toLocaleDateString(getLang(), { month: "short", day: "numeric" });
  chart.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img">
      <line class="grid" x1="${pad}" x2="${W - pad}" y1="${y(profile.target_weight_kg)}" y2="${y(profile.target_weight_kg)}" stroke-dasharray="4 4" />
      <text class="axis" x="${W - pad}" y="${y(profile.target_weight_kg) - 6}" text-anchor="end">${profile.target_weight_kg} kg</text>
      <polyline class="line" points="${points}" />
      <circle class="dot" cx="${x(entries.length - 1)}" cy="${y(last[1])}" r="4" />
      <text class="axis" x="${pad}" y="${H - 6}">${fmtDate(entries[0][0])}</text>
      <text class="axis" x="${W - pad}" y="${H - 6}" text-anchor="end">${fmtDate(last[0])} · ${last[1]} kg</text>
    </svg>`;
  chart.querySelector("svg").setAttribute("aria-label", t("weight.title"));
}

function renderHistory(targets) {
  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const dishes = key === currentDate ? day.dishes : loadDay(key).dishes;
    const results = evaluate(sumConsumed(dishes), targets);
    rows.push({ d, kcal: Math.round(results[0].amount), score: dishes.length ? balanceScore(results) : null });
  }
  const max = Math.max(targets.energy_kcal.value, ...rows.map((r) => r.kcal));
  $("history").replaceChildren(
    ...rows.map((r) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="h-date"></span><span class="h-bar"><span style="width:${(r.kcal / max) * 100}%"></span></span><span class="h-kcal">${r.kcal} kcal</span><span class="h-score muted"></span>`;
      li.querySelector(".h-date").textContent = r.d.toLocaleDateString(getLang(), { weekday: "short", day: "numeric" });
      li.querySelector(".h-score").textContent = r.score == null ? "—" : t("history.points", { score: r.score });
      return li;
    }),
  );
}

function updateDish(id, patch) {
  day.dishes = day.dishes.map((d) => (d.id === id ? { ...d, ...patch } : d));
  saveDay();
  render();
}

function removeDish(id) {
  day.dishes = day.dishes.filter((d) => d.id !== id);
  day.activeIds = day.activeIds.filter((x) => x !== id);
  saveDay();
  render();
}

// ---- 食品の検索と追加 ----
let addSelection = null;

function openAddDialog(meal) {
  addSelection = null;
  $("addSearch").value = "";
  $("addGrams").value = "";
  $("addMeal").innerHTML = MEALS.map((m) => `<option value="${m}"></option>`).join("");
  $("addMeal").querySelectorAll("option").forEach((o) => (o.textContent = t("meal." + o.value)));
  $("addMeal").value = meal;
  $("addSubmit").disabled = true;
  renderSearch();
  $("addDialog").showModal();
  $("addSearch").focus();
}

function renderSearch() {
  const results = searchFoods($("addSearch").value, getLang(), 30);
  $("addResults").replaceChildren(
    ...results.map((f) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "result" + (addSelection === f.key ? " selected" : "");
      b.innerHTML = `<span></span><span class="muted small"></span>`;
      b.children[0].textContent = f.name;
      b.children[1].textContent = `${Math.round(f.per100g.energy_kcal)} kcal/100 g · ${t("add.portion", { g: f.portion_g })}`;
      b.onclick = () => {
        addSelection = f.key;
        $("addGrams").value = f.portion_g;
        $("addSubmit").disabled = false;
        renderSearch();
      };
      li.append(b);
      return li;
    }),
  );
}

$("addSearch").oninput = renderSearch;
$("addDialog").addEventListener("close", () => {
  if ($("addDialog").returnValue !== "add" || !addSelection) return;
  const grams = Number($("addGrams").value) || FOOD_DB[addSelection].portion_g;
  clearSample();
  day.dishes.push(manualDish({ key: addSelection, name: foodName(addSelection, getLang()), grams, meal: $("addMeal").value, db: FOOD_DB }));
  saveDay();
  render();
});

// ---- プロフィール(初回は必ず入力してもらう) ----
function fillProfileForm(onboarding, values = null) {
  $("profileTitle").textContent = onboarding ? t("profile.welcome") : t("profile.title");
  $("profileIntro").hidden = !onboarding;
  $("profileCancel").hidden = onboarding;
  $("pfLang").innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("pfActivity").innerHTML = ACTIVITY_FACTORS.map((_, i) => `<option value="${i}">${t("activity." + i)}</option>`).join("");
  $("pfGoal").innerHTML = GOALS.map((g) => `<option value="${g}">${t("goal." + g)}</option>`).join("");
  $("pfCountry").innerHTML = COUNTRIES.map((c) => `<option value="${c}">${t("country." + c)}</option>`).join("");
  $("pfPlan").innerHTML = ["free", "premium"].map((p) => `<option value="${p}">${t("plan." + p)}</option>`).join("");
  const v = values ?? {
    lang: getLang(),
    sex: profile.sex,
    age: profile.age,
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    target_weight_kg: profile.target_weight_kg,
    activity: String(profile.activity),
    goal: profile.goal,
    country: profile.country,
    plate_cm: profile.plate_cm || "",
    plan: settings.plan,
  };
  const form = $("profileForm");
  for (const [k, val] of Object.entries(v)) if (form.elements[k]) form.elements[k].value = val;
}

function openProfile(onboarding = false) {
  fillProfileForm(onboarding);
  $("profileDialog").showModal();
}

// 言語を変えたらフォームの文言もすぐ切り替える
$("pfLang").onchange = () => {
  const values = Object.fromEntries(new FormData($("profileForm")));
  setLang(values.lang);
  applyI18n(document);
  fillProfileForm(!profile.onboarded, values);
  render();
};

$("profileDialog").addEventListener("cancel", (e) => {
  if (!profile.onboarded) e.preventDefault();
});
$("profileDialog").addEventListener("close", () => {
  if ($("profileDialog").returnValue !== "save") {
    setLang(settings.lang);
    applyI18n(document);
    render();
    return;
  }
  const { lang, plan, ...f } = Object.fromEntries(new FormData($("profileForm")));
  profile = { ...normalizeProfile({ ...profile, ...f }), onboarded: true };
  settings = { ...settings, lang, plan };
  store.set("come-come:profile", profile);
  store.set("come-come:settings", settings);
  if (!weights[currentDate]) {
    weights[currentDate] = profile.weight_kg;
    store.set("come-come:weights", weights);
  }
  setLang(settings.lang);
  applyI18n(document);
  render();
});

// ---- 体重 ----
$("weightForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const kg = Number($("weightInput").value);
  if (!(kg >= 20 && kg <= 300)) return;
  weights[currentDate] = kg;
  profile = { ...normalizeProfile({ ...profile, weight_kg: kg }), onboarded: profile.onboarded };
  store.set("come-come:weights", weights);
  store.set("come-come:profile", profile);
  $("weightInput").value = "";
  render();
});

// ---- サンプル(プレビュー用。実データではない) ----
function loadSample() {
  const suffix = " " + t("sample.suffix");
  const ing = (key, grams, dimensions_cm) => ({ name: foodName(key, getLang()), db_key: key, grams, dimensions_cm });
  const analysis = {
    dishes: [
      { id: "", name: "Tacos al pastor" + suffix, serving_description: "3 tacos", reference: "tortilla 11 cm", confidence: 1, remaining_percent: 35, visible: true,
        ingredients: [ing("corn_tortilla", 60, { length: 11, width: 11, height: 0.3 }), ing("al_pastor", 120, { length: 9, width: 3, height: 1.5 }), ing("onion", 15), ing("salsa", 30)] },
      { id: "", name: foodName("beans_boiled", getLang()) + suffix, serving_description: "1 plato hondo", reference: "plato 20 cm", confidence: 1, remaining_percent: 0, visible: true,
        ingredients: [ing("beans_boiled", 150)] },
      { id: "", name: foodName("horchata", getLang()) + suffix, serving_description: "1 vaso", reference: "vaso 355 ml", confidence: 1, remaining_percent: 50, visible: true,
        ingredients: [ing("horchata", 300)] },
    ],
  };
  const dishes = mergeAnalysis([], analysis, { db: FOOD_DB, meal: "lunch" }).map((d) => ({ ...d, sample: true }));
  day = { dishes, activeIds: dishes.map((d) => d.id) };
}

function clearSample() {
  if (!day.dishes.some((d) => d.sample)) return;
  day = loadDay(currentDate);
}

// ---- イベント ----
$("startBtn").onclick = () => (stream ? (stopCamera(), setStatus(t("status.stopped"))) : startCamera());
$("flipBtn").onclick = () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  startCamera();
};
$("handsFreeBtn").onclick = enterHandsFree;
$("handsFree").onclick = exitHandsFree;
$("premiumDialog").addEventListener("close", () => {
  if ($("premiumDialog").returnValue !== "trial") return;
  settings = { ...settings, plan: "premium" };
  store.set("come-come:settings", settings);
  enterHandsFree();
});
$("settingsBtn").onclick = () => openProfile(false);
$("newMealBtn").onclick = () => {
  day.activeIds = [];
  saveDay();
  render();
  setStatus(t("status.split"));
};
$("clearSampleBtn").onclick = () => {
  clearSample();
  store.set("come-come:sampleDismissed", true);
  render();
};

// confirm() が使えない環境(claude.ai上など)もあるので、2回押しで確定する
let resetArmed = null;
$("resetBtn").onclick = () => {
  const btn = $("resetBtn");
  if (!resetArmed) {
    btn.textContent = t("btn.resetConfirm");
    resetArmed = setTimeout(() => {
      resetArmed = null;
      btn.textContent = t("btn.reset");
    }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  btn.textContent = t("btn.reset");
  day = { dishes: [], activeIds: [] };
  saveDay();
  render();
};

// 日付が変わったら新しい日の記録に切り替える
setInterval(() => {
  if (dateKey() !== currentDate) {
    currentDate = dateKey();
    day = loadDay(currentDate);
    render();
  }
}, 60_000);

window.addEventListener("resize", drawOverlay);

// ---- 起動 ----
setLang(settings.lang);
applyI18n(document);
setStatus(t("status.idle"));
if (PREVIEW) {
  $("startBtn").disabled = true;
  setStatus(t("status.previewNoCamera"));
  if (!day.dishes.length && !store.get("come-come:sampleDismissed", false)) loadSample();
}
render();
if (!profile.onboarded) openProfile(true);
if (!PREVIEW) {
  fetch("/api/config")
    .then((r) => r.json())
    .then((c) => (accessRequired = Boolean(c.accessCodeRequired)))
    .catch(() => {});
}
