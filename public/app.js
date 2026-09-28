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
  nutrientsFromIngredients,
} from "./nutrition.js";
import { FOOD_DB, foodName, searchFoods } from "./foods.js";
import { normalizeAnalysis } from "./analysis.js";
import { LANGS, t, setLang, getLang, detectLang, applyI18n } from "./i18n.js";
import { loadDetector, BiteTracker, FOOD_CLASSES } from "./detector.js";
import { loadDishClassifier, DishVote } from "./classifier.js";
import { DISHES, bitesPerServing, searchDishes, dishGrams } from "./dishes.js";

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
let detectEvery = 150; // 次の物体検出までの間隔(ms)。端末の速さに合わせて伸ばす
let slowDetections = 0;
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

// 料理の判別: 「端末内」(無料・APIなし)か「クラウド」(Claude・高精度)か
let cloudAvailable = !PREVIEW;
let dishClassifier = null;
let dishClassifierLoading = null;
let classifying = false;
let lastClassifyAt = 0;
let dishVote = new DishVote();
let liveDish = null;
const useCloud = () => cloudAvailable && settings.analysis !== "device";

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
  dishVote = new DishVote();
  liveDish = null;
  if (!useCloud() && !dishClassifier) {
    // 初回だけ約 88 MB のモデルをダウンロードする(以降はブラウザに保存される)
    setStatus(t("status.loadingDishModel", { pct: 0 }), "busy");
    dishClassifierLoading ??= loadDishClassifier({
      onProgress: (p) => setStatus(t("status.loadingDishModel", { pct: Math.round(p * 100) }), "busy"),
    })
      .then((c) => (dishClassifier = c))
      .catch((err) => {
        dishClassifierLoading = null;
        setStatus(t("status.failed", { error: err.message }), "error");
      });
    await dishClassifierLoading;
    if (!stream) return false;
  }
  setStatus(t(useCloud() ? "status.watching" : "status.watchingDevice"));
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
  liveDish = null;
  drawOverlay();
  $("liveDish").hidden = true;
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
  if (detector && !detecting && now - lastDetectAt > detectEvery) {
    lastDetectAt = now;
    detecting = true;
    detector
      .detect(video)
      .then((d) => {
        // 検出は画面の処理と同じスレッドで動くため、時間がかかる端末では間隔をあけて操作が固まらないようにする。
        // 1回に 500ms 以上かかる端末では、ひと口の検出をあきらめて止める(料理の判別は別スレッドなので続く)
        const took = performance.now() - now;
        detectEvery = Math.max(150, took * 4);
        slowDetections = took > 500 ? slowDetections + 1 : 0;
        if (slowDetections >= 2) {
          detector = null;
          detections = [];
          setStatus(t("status.detectorSlow"));
        }
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
  if (!useCloud() && dishClassifier && !classifying && now - lastClassifyAt > 1000) {
    lastClassifyAt = now;
    classifying = true;
    dishClassifier
      .classify(video)
      .then((ranked) => {
        liveDish = ranked[0];
        const stable = dishVote.push(ranked);
        if (stable) onDeviceDish(stable);
        updateLive();
      })
      .catch(() => {})
      .finally(() => (classifying = false));
  }
  if (now - lastScheduleAt > 500) {
    lastScheduleAt = now;
    if (useCloud()) maybeAnalyze();
    else if (pendingBites > 0) applyDeviceBites();
  }
}

// ---- 端末内モード: 料理名は端末内AI、量は標準の1皿、食べた量はひと口の回数から見積もる ----
function onDeviceDish({ key, prob }) {
  const lang = getLang();
  const active = activeDishes();
  // 同じ皿かどうか: 同じ料理名、その皿の候補に入っている料理、利用者が修正する前の料理名なら同じ皿とみなす
  // (車両追跡で、同じ車を別の車種と一瞬見間違えても新しい車として数えないのと同じ)
  const existing =
    active.find((d) => d.dishKey === key) ??
    active.find((d) => d.correctedFrom?.includes(key) || (d.source === "camera" && d.candidates?.includes(key)));
  const dish = DISHES[key];
  const analysis = {
    dishes: [
      existing
        ? { id: existing.id, remaining_percent: existing.remaining_percent, visible: true }
        : {
            id: "",
            name: dish.names[lang] ?? dish.names.en,
            serving_description: t("dish.standardServing"),
            reference: t("dish.onDevice"),
            confidence: prob,
            remaining_percent: 100,
            visible: true,
            ingredients: dish.recipe.map((r) => ({ name: foodName(r.db_key, lang), db_key: r.db_key, grams: r.grams })),
          },
    ],
  };
  // 同じ料理が続けて確定しても、確認の回数を増やすだけにする(数秒に1回まで)
  if (existing && Date.now() - (existing.updated_at ?? 0) < 5000) return;
  const merged = mergeAnalysis(active, analysis, { db: FOOD_DB, meal: active[0]?.meal });
  // 1タップで選び直せるよう、候補の上位3つを料理に残す
  const candidates = dishVote.candidates(3).map((c) => c.key);
  for (const d of merged) {
    if (!d.dishKey && !active.some((a) => a.id === d.id)) d.dishKey = key;
    // 利用者が修正した皿の料理名と候補は、AIの判断で上書きしない
    if (d.dishKey === key && !d.corrected) d.candidates = [key, ...candidates.filter((c) => c !== key)].slice(0, 3);
  }
  const others = day.dishes.filter((d) => !day.activeIds.includes(d.id));
  day.dishes = [...others, ...merged];
  day.activeIds = merged.map((d) => d.id);
  saveDay();
  render();
  const name = dish.names[lang] ?? dish.names.en;
  setStatus(t("status.deviceDish", { name, pct: Math.round(prob * 100) }));
}

function applyDeviceBites() {
  const active = activeDishes().filter((d) => d.confirmed !== false && d.remaining_percent > 0);
  if (!active.length) return;
  // いま映っている料理を優先し、なければ最後に見つけた料理から減らす
  const target = active.find((d) => d.dishKey && d.dishKey === liveDish?.key) ?? active[active.length - 1];
  const share = (100 / bitesPerServing(target.dishKey)) * pendingBites;
  pendingBites = 0;
  const remaining = Math.max(0, target.remaining_percent - share);
  updateDish(target.id, { remaining_percent: remaining, observations: [remaining], updated_at: Date.now() });
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
  for (const d of merged) if (!active.some((a) => a.id === d.id)) d.measured = true; // クラウドは量(g)を測っている
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
  for (const d of detections) {
    const isFood = FOOD_CLASSES.has(d.label);
    if (!isFood && d.label !== "person") continue;
    let [x, y, w, h] = d.box.map((v) => v * scale);
    x += dx;
    y += dy;
    if (mirror) x = W - x - w;
    ctx.strokeStyle = isFood ? "rgba(142,168,255,.8)" : "rgba(255,255,255,.35)";
    ctx.lineWidth = isFood ? 2 : 1;
    ctx.strokeRect(x, y, w, h);
  }
}

function updateLive() {
  $("liveBites").textContent = bites.bites;
  const chip = $("liveDish");
  const show = !useCloud() && liveDish?.key && liveDish.prob >= 0.2;
  chip.hidden = !show;
  if (show) {
    const d = DISHES[liveDish.key];
    chip.textContent = `${d.names[getLang()] ?? d.names.en} · ${Math.round(liveDish.prob * 100)}%`;
  }
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

// 表示に関わる内容が変わったときだけ作り直す(カメラ中に数秒ごとに作り直すと、
// ボタンを押す瞬間に消えたり、開いた内訳が閉じたり、スライダー操作が戻ったりするため)
let mealsSignature = "";
function renderMeals() {
  const active = new Set(day.activeIds);
  const signature = JSON.stringify([
    getLang(),
    day.activeIds,
    day.dishes.map((d) => [d.id, d.name, d.meal, Math.round(d.remaining_percent), d.scale, d.confirmed, d.candidates, d.dishKey, d.serving_description, d.reference]),
  ]);
  if (signature === mealsSignature) return;
  mealsSignature = signature;
  const openIds = new Set([...$("meals").querySelectorAll("details[open]")].map((el) => el.closest("li")?.dataset.id));
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
      for (const d of dishes) {
        const item = dishItem(d, active.has(d.id));
        if (openIds.has(d.id)) item.querySelector("details").open = true;
        list.append(item);
      }
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
  li.dataset.id = d.id;
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
    <div class="alternatives" hidden>
      <span class="muted small alt-label"></span>
      <span class="alt-buttons"></span>
    </div>
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
  // 端末内AIが迷った候補: 1タップで料理を選び直せる
  const alts = (d.candidates ?? []).filter((k) => k !== d.dishKey && DISHES[k]);
  if (alts.length) {
    const box = li.querySelector(".alternatives");
    box.hidden = false;
    box.querySelector(".alt-label").textContent = t("dish.notThis");
    box.querySelector(".alt-buttons").replaceChildren(
      ...alts.map((k) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = DISHES[k].names[getLang()] ?? DISHES[k].names.en;
        b.onclick = () => replaceDish(d.id, k);
        return b;
      }),
      (() => {
        const b = document.createElement("button");
        b.className = "chip ghost";
        b.textContent = t("dish.searchOther");
        b.onclick = () => openAddDialog(d.meal, d.id);
        return b;
      })(),
    );
  }
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

/** 料理を別の料理に差し替える(食べた割合・量の補正・食事区分はそのまま) */
function replaceDish(id, key) {
  const dish = DISHES[key];
  const lang = getLang();
  const before = day.dishes.find((d) => d.id === id);
  // クラウドで量を測った皿は、測った重さを保ったまま料理だけを入れ替える。端末内の皿は標準の1皿にする
  const measuredGrams = before?.measured ? (before.ingredients ?? []).reduce((s, i) => s + (Number(i.grams) || 0), 0) : 0;
  const factor = measuredGrams > 0 ? measuredGrams / dishGrams(key) : 1;
  const ingredients = dish.recipe.map((r) => ({ name: foodName(r.db_key, lang), db_key: r.db_key, grams: r.grams * factor }));
  logCorrection(before?.dishKey ?? null, key);
  updateDish(id, {
    correctedFrom: [...new Set([...(before?.correctedFrom ?? []), before?.dishKey].filter(Boolean))],
    name: dish.names[lang] ?? dish.names.en,
    dishKey: key,
    ingredients,
    portion_nutrients: nutrientsFromIngredients(ingredients, FOOD_DB),
    confirmed: true,
    corrected: true,
  });
}

/** 利用者による修正の記録(端末内だけに保存)。どの料理を取り違えやすいかの把握に使う */
function logCorrection(from, to) {
  const log = store.get("come-come:corrections", []);
  log.push({ from, to, at: Date.now() });
  store.set("come-come:corrections", log.slice(-500));
}

function removeDish(id) {
  day.dishes = day.dishes.filter((d) => d.id !== id);
  day.activeIds = day.activeIds.filter((x) => x !== id);
  saveDay();
  render();
}

// ---- 料理・食品の検索と追加(料理の差し替えにも使う) ----
let addSelection = null; // { type: "dish" | "food", key }
let replaceTarget = null; // 差し替える料理の id(新しく追加するときは null)

function openAddDialog(meal, replaceId = null) {
  addSelection = null;
  replaceTarget = replaceId;
  $("addTitle").textContent = t(replaceId ? "add.replaceTitle" : "add.title");
  $("addSearch").value = "";
  $("addGrams").value = "";
  $("addGramsLabel").hidden = Boolean(replaceId);
  $("addMeal").innerHTML = MEALS.map((m) => `<option value="${m}"></option>`).join("");
  $("addMeal").querySelectorAll("option").forEach((o) => (o.textContent = t("meal." + o.value)));
  $("addMeal").value = meal;
  $("addSubmit").textContent = t(replaceId ? "btn.replace" : "btn.add");
  $("addSubmit").disabled = true;
  renderSearch();
  $("addDialog").showModal();
  $("addSearch").focus();
}

function renderSearch() {
  const q = $("addSearch").value;
  const lang = getLang();
  const dishes = searchDishes(q, lang, 15).map((d) => {
    const n = nutrientsFromIngredients(DISHES[d.key].recipe, FOOD_DB);
    return { type: "dish", key: d.key, name: d.name, grams: d.grams, detail: `${Math.round(n.energy_kcal)} kcal · ${t("dish.standardServing")}` };
  });
  const foods = searchFoods(q, lang, 20).map((f) => ({
    type: "food",
    key: f.key,
    name: f.name,
    grams: f.portion_g,
    detail: `${Math.round(f.per100g.energy_kcal)} kcal/100 g · ${t("add.portion", { g: f.portion_g })}`,
  }));
  $("addResults").replaceChildren(
    ...[...dishes, ...foods].map((r) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const selected = addSelection?.type === r.type && addSelection.key === r.key;
      b.className = "result" + (selected ? " selected" : "");
      b.innerHTML = `<span></span><span class="muted small"></span>`;
      b.children[0].textContent = r.name;
      b.children[1].textContent = r.detail;
      b.onclick = () => {
        addSelection = { type: r.type, key: r.key };
        $("addGrams").value = r.grams;
        $("addSubmit").disabled = false;
        renderSearch();
      };
      li.append(b);
      return li;
    }),
  );
}

/** 選んだ料理・食品の材料(g を指定すると、その重さに合わせて全体を増減する) */
function selectionIngredients(sel, grams) {
  const lang = getLang();
  if (sel.type === "food") return [{ name: foodName(sel.key, lang), db_key: sel.key, grams: grams || FOOD_DB[sel.key].portion_g }];
  const factor = grams ? grams / dishGrams(sel.key) : 1;
  return DISHES[sel.key].recipe.map((r) => ({ name: foodName(r.db_key, lang), db_key: r.db_key, grams: r.grams * factor }));
}

$("addSearch").oninput = renderSearch;
$("addDialog").addEventListener("close", () => {
  const action = $("addDialog").returnValue;
  if (!["add", "replace"].includes(action) || !addSelection) return;
  const sel = addSelection;
  const name = sel.type === "dish" ? DISHES[sel.key].names[getLang()] ?? DISHES[sel.key].names.en : foodName(sel.key, getLang());
  if (replaceTarget) {
    if (sel.type === "dish") return replaceDish(replaceTarget, sel.key);
    const before = day.dishes.find((d) => d.id === replaceTarget);
    logCorrection(before?.dishKey ?? null, "food:" + sel.key);
    const ingredients = selectionIngredients(sel);
    return updateDish(replaceTarget, { correctedFrom: [...new Set([...(before?.correctedFrom ?? []), before?.dishKey].filter(Boolean))], name, dishKey: null, ingredients, portion_nutrients: nutrientsFromIngredients(ingredients, FOOD_DB), confirmed: true, corrected: true });
  }
  const grams = Number($("addGrams").value) || 0;
  const ingredients = selectionIngredients(sel, grams);
  const dish = manualDish({ key: null, name, grams: 0, meal: $("addMeal").value, db: FOOD_DB });
  dish.ingredients = ingredients;
  dish.portion_nutrients = nutrientsFromIngredients(ingredients, FOOD_DB);
  dish.serving_description = `${Math.round(ingredients.reduce((s, i) => s + i.grams, 0))} g`;
  if (sel.type === "dish") dish.dishKey = sel.key;
  clearSample();
  day.dishes.push(dish);
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
  $("pfAnalysis").innerHTML = ["device", "cloud"].map((m) => `<option value="${m}" ${m === "cloud" && !cloudAvailable ? "disabled" : ""}>${t("analysis." + m)}</option>`).join("");
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
    analysis: useCloud() ? "cloud" : "device",
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
  const { lang, plan, analysis, ...f } = Object.fromEntries(new FormData($("profileForm")));
  profile = { ...normalizeProfile({ ...profile, ...f }), onboarded: true };
  const modeChanged = (analysis ?? settings.analysis) !== settings.analysis;
  settings = { ...settings, lang, plan, analysis: analysis ?? settings.analysis };
  if (modeChanged && stream) startCamera();
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
    .then((c) => {
      accessRequired = Boolean(c.accessCodeRequired);
      cloudAvailable = c.cloudAvailable !== false;
    })
    .catch(() => {});
}
