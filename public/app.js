import {
  NUTRIENTS,
  FOOD_HINTS,
  AGE_GROUPS,
  ACTIVITY_LEVELS,
  DEFAULT_PROFILE,
  dailyTargets,
  consumedOf,
  sumConsumed,
  evaluate,
  mergeAnalysis,
} from "./nutrition.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");

// ---- 永続化(日付ごとの記録とプロフィール) ----
const todayKey = () => "come-come:" + new Date().toLocaleDateString("sv-SE");
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

// day = { dishes: [...], activeIds: [...] }
let currentKey = todayKey();
let day = store.get(currentKey, { dishes: [], activeIds: [] });
let profile = store.get("come-come:profile", DEFAULT_PROFILE);

function saveDay() {
  store.set(currentKey, day);
}

// ---- カメラ ----
let stream = null;
let facingMode = "environment";
let timer = null;
let busy = false;
let lastSignature = null;
let lastSentAt = 0;

async function startCamera() {
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    setStatus("カメラを使えません: " + err.message, "error");
    return;
  }
  video.srcObject = stream;
  await video.play();
  $("placeholder").hidden = true;
  $("startBtn").textContent = "カメラ停止";
  $("flipBtn").disabled = false;
  $("snapBtn").disabled = false;
  video.classList.toggle("mirror", facingMode === "user");
  setStatus("撮影中。定期的に食事を解析します");
  scheduleLoop();
}

function stopCamera() {
  clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  $("placeholder").hidden = false;
  $("startBtn").textContent = "カメラ開始";
  $("flipBtn").disabled = true;
  $("snapBtn").disabled = true;
  $("badge").hidden = true;
}

function scheduleLoop() {
  clearInterval(timer);
  const sec = Number($("interval").value);
  timer = setInterval(() => analyze(false), sec * 1000);
  analyze(true);
}

// 小さなグレースケール画像で前回との差分を測り、変化がなければ解析を省略してAPI呼び出しを節約する
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

function captureJpeg() {
  const maxW = 1024;
  const scale = Math.min(1, maxW / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function analyze(force) {
  if (!stream || busy || !video.videoWidth) return;
  const sig = frameSignature();
  const idleMs = Date.now() - lastSentAt;
  if (!force && signatureDiff(sig, lastSignature) < 4 && idleMs < 60_000) {
    setStatus("変化がないため解析をスキップしました");
    return;
  }
  busy = true;
  setStatus("解析中…", "busy");
  try {
    const knownDishes = activeDishes();
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: captureJpeg(), knownDishes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    lastSignature = sig;
    lastSentAt = Date.now();
    applyAnalysis(data);
    setStatus(`${new Date().toLocaleTimeString("ja-JP")} 解析: ${data.scene_note}`);
    showBadge(data.eating);
  } catch (err) {
    setStatus("解析に失敗しました: " + err.message, "error");
  } finally {
    busy = false;
  }
}

function activeDishes() {
  const ids = new Set(day.activeIds);
  return day.dishes.filter((d) => ids.has(d.id));
}

function applyAnalysis(analysis) {
  const active = activeDishes();
  const merged = mergeAnalysis(active, analysis);
  const others = day.dishes.filter((d) => !day.activeIds.includes(d.id));
  day.dishes = [...others, ...merged];
  day.activeIds = merged.map((d) => d.id);
  saveDay();
  render();
}

function showBadge(eating) {
  const b = $("badge");
  b.hidden = false;
  b.textContent = eating ? "食事中" : "待機";
  b.classList.toggle("on", eating);
}

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.dataset.kind = kind;
}

// ---- 描画 ----
const fmt = (v, unit) => {
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)}${unit === "kcal" ? "" : " "}${unit}`;
};

function render() {
  renderDishes();
  renderLog();
  renderTotals();
}

function renderDishes() {
  const list = $("dishes");
  const active = activeDishes();
  list.replaceChildren(
    ...active.map((d) => {
      const li = document.createElement("li");
      const eaten = 100 - d.remaining_percent;
      const kcal = consumedOf(d).energy_kcal;
      li.innerHTML = `
        <div class="dish-row">
          <div>
            <strong></strong>
            <div class="muted small"></div>
          </div>
          <div class="dish-kcal">${Math.round(kcal)}<small> kcal</small></div>
        </div>
        <div class="meter thin"><div class="meter-fill" style="width:${eaten}%"></div></div>
        <div class="dish-actions">
          <span class="muted small">食べた量 ${Math.round(eaten)}%</span>
          <span>
            <button data-act="done" class="ghost small">完食</button>
            <button data-act="remove" class="ghost small danger">削除</button>
          </span>
        </div>`;
      li.querySelector("strong").textContent = d.name;
      li.querySelector(".muted.small").textContent = d.serving_description;
      li.querySelector('[data-act="done"]').onclick = () => updateDish(d.id, { remaining_percent: 0 });
      li.querySelector('[data-act="remove"]').onclick = () => removeDish(d.id);
      return li;
    }),
  );
  $("noDishes").hidden = active.length > 0;
}

function renderLog() {
  const list = $("log");
  const eaten = day.dishes.filter((d) => d.remaining_percent < 100);
  if (!eaten.length) {
    list.innerHTML = '<li class="muted">記録はまだありません</li>';
    return;
  }
  list.replaceChildren(
    ...eaten
      .slice()
      .sort((a, b) => b.created_at - a.created_at)
      .map((d) => {
        const li = document.createElement("li");
        const time = new Date(d.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
        li.innerHTML = `<span class="muted small"></span><span class="log-name"></span><span class="log-kcal"></span>`;
        li.children[0].textContent = time;
        li.children[1].textContent = `${d.name}(${Math.round(100 - d.remaining_percent)}%)`;
        li.children[2].textContent = `${Math.round(consumedOf(d).energy_kcal)} kcal`;
        return li;
      }),
  );
}

function renderTotals() {
  const targets = dailyTargets(profile);
  const results = evaluate(sumConsumed(day.dishes), targets);
  const energy = results[0];
  $("kcal").textContent = Math.round(energy.amount);
  $("kcalTarget").textContent = targets.energy_kcal.value;
  $("kcalBar").style.width = Math.min(100, energy.ratio * 100) + "%";
  $("kcalBar").dataset.status = energy.status;

  const statusLabel = { low: "不足", ok: "適量", high: "過剰" };
  $("nutrients").replaceChildren(
    ...results.slice(1).map((r) => {
      const li = document.createElement("li");
      const targetText = r.target.min != null ? `${r.target.min}〜${r.target.max}` : `${r.kind === "max" ? "<" : ""}${r.target.value}`;
      li.innerHTML = `
        <div class="n-head">
          <span class="n-label">${r.label}</span>
          <span class="pill" data-status="${r.status}">${statusLabel[r.status]}</span>
        </div>
        <div class="meter thin"><div class="meter-fill" data-status="${r.status}" style="width:${Math.min(100, r.ratio * 100)}%"></div></div>
        <div class="n-nums muted small">${fmt(r.amount, r.unit)} / ${targetText} ${r.unit}</div>`;
      return li;
    }),
  );

  const lacking = results.filter((r) => r.status === "low" && r.kind !== "max").sort((a, b) => a.ratio - b.ratio);
  const excess = results.filter((r) => r.status === "high");
  const advice = [
    ...lacking.map((r) => `<li><strong>${r.label}</strong> があと ${fmt(Math.max(0, (r.target.min ?? r.target.value) - r.amount), r.unit)} 足りません → ${FOOD_HINTS[r.key]}</li>`),
    ...excess.map((r) => `<li class="warn"><strong>${r.label}</strong> が目安を超えています(${Math.round(r.ratio * 100)}%)</li>`),
  ];
  $("advice").innerHTML = advice.length ? advice.join("") : '<li class="good">今日の目標はすべて満たしています</li>';
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

// ---- プロフィール ----
function setupProfileDialog() {
  const dialog = $("profileDialog");
  const form = dialog.querySelector("form");
  form.age.innerHTML = AGE_GROUPS.map((a) => `<option value="${a}">${a}歳</option>`).join("");
  form.activity.innerHTML = ACTIVITY_LEVELS.map((a, i) => `<option value="${i}">${a}</option>`).join("");
  $("profileBtn").onclick = () => {
    form.sex.value = profile.sex;
    form.age.value = profile.age;
    form.activity.value = String(profile.activity);
    dialog.showModal();
  };
  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "save") return;
    profile = { sex: form.sex.value, age: form.age.value, activity: Number(form.activity.value) };
    store.set("come-come:profile", profile);
    renderTotals();
  });
}

// ---- イベント ----
$("startBtn").onclick = () => (stream ? (stopCamera(), setStatus("停止中")) : startCamera());
$("flipBtn").onclick = () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  startCamera();
};
$("snapBtn").onclick = () => analyze(true);
$("interval").onchange = () => stream && scheduleLoop();
$("newMealBtn").onclick = () => {
  day.activeIds = [];
  saveDay();
  render();
  setStatus("食事を区切りました。次に映った料理は新しい食事として記録します");
};
$("resetBtn").onclick = () => {
  if (!confirm("今日の記録をすべて消去しますか?")) return;
  day = { dishes: [], activeIds: [] };
  saveDay();
  render();
};

// 日付が変わったら新しい日の記録に切り替える
setInterval(() => {
  if (todayKey() !== currentKey) {
    currentKey = todayKey();
    day = store.get(currentKey, { dishes: [], activeIds: [] });
    render();
  }
}, 60_000);

if (!navigator.mediaDevices?.getUserMedia) {
  setStatus("このブラウザではカメラを使えません(HTTPS または localhost で開いてください)", "error");
  $("startBtn").disabled = true;
}

setupProfileDialog();
render();
