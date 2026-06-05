/* ===== 台灣軌道拉霸機 app.js ===== */
(function () {
  "use strict";

  // ---- 趣味任務池(內容請改 data/tasks.js,不用動這裡)----
  // 解析 window.GAME_TASKS:一行一個任務;空行/# 開頭=註解;
  // 行尾 [台鐵]/[捷運] 限定系統(tra/metro),沒寫就是全部(all)。
  function parseTasks(raw) {
    const out = [];
    String(raw || "").split("\n").forEach((line) => {
      let s = line.trim();
      if (!s || s.charAt(0) === "#") return;
      let sys = "all";
      const m = s.match(/\[\s*(台鐵|捷運|tra|metro)\s*\]$/i);
      if (m) {
        const tag = m[1].toLowerCase();
        sys = (tag === "台鐵" || tag === "tra") ? "tra" : "metro";
        s = s.slice(0, m.index).trim();
      }
      if (s) out.push({ t: s, sys: sys });
    });
    if (!out.length) out.push({ t: "出站走走,隨意逛一圈", sys: "all" }); // 清單空了的保底
    return out;
  }
  const TASKS = parseTasks(window.GAME_TASKS);

  const HISTORY_KEY = "twslot_history_v1";
  const MUTE_KEY = "twslot_muted_v1";
  const MAX_HISTORY = 30;

  // ---- 取得資料 ----
  const DATA = (window.STATION_DATA && window.STATION_DATA.systems) ? window.STATION_DATA : { systems: [] };

  // ---- DOM ----
  const $ = (s) => document.querySelector(s);
  const screenSelect = $("#screen-select");
  const screenMachine = $("#screen-machine");
  const systemGrid = $("#system-grid");
  const statFoot = $("#stat-foot");
  const sysIcon = $("#sys-icon");
  const sysName = $("#sys-name");
  const lineSelect = $("#line-select");
  const cabinet = $(".cabinet");
  const reelLine = $("#reel-line");
  const reelStation = $("#reel-station");
  const reelTask = $("#reel-task");
  const lever = $("#lever");
  const btnSpin = $("#btn-spin");
  const resultBox = $("#result");
  const resultBanner = $("#result-banner");
  const historyList = $("#history-list");
  const historyEmpty = $("#history-empty");

  // ---- 狀態 ----
  let currentSystem = null;
  let lockedLineId = "";      // "" = 隨機路線
  let spinning = false;
  let muted = localStorage.getItem(MUTE_KEY) === "1";
  let history = loadHistory();
  let lastStationKey = "";    // 無重複保護

  // ---------- 工具 ----------
  const randInt = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[randInt(arr.length)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function countStations(sys) {
    return sys.lines.reduce((a, l) => a + l.stations.length, 0);
  }

  // 依背景色算對比文字色
  function textOn(hex) {
    const h = (hex || "#333").replace("#", "");
    const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const r = parseInt(f.slice(0, 2), 16) || 0;
    const g = parseInt(f.slice(2, 4), 16) || 0;
    const b = parseInt(f.slice(4, 6), 16) || 0;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#1a1a1a" : "#ffffff";
  }

  // ---------- 音效 (Web Audio,即時合成,柔和版) ----------
  // 全部走 sine/triangle 波 + 低通濾波,削掉刺耳高頻;音量也壓低。
  let actx = null;
  let masterOut = null; // 接到這裡,訊號會先經過低通再出去
  function ensureAudio() {
    if (muted) return;
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        const lp = actx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2000; // 2kHz 以上的尖銳泛音削掉
        lp.Q.value = 0.6;
        const mg = actx.createGain();
        mg.gain.value = 0.85;
        lp.connect(mg).connect(actx.destination);
        masterOut = lp;
      } catch (e) { actx = null; masterOut = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function tone(freq, dur, type, gainPeak, when) {
    if (muted || !actx || !masterOut) return;
    const t0 = (when || actx.currentTime);
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak || 0.12, t0 + 0.02); // 起音放慢,不會「啪」
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(masterOut);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }
  function clunk() { ensureAudio(); tone(180, 0.14, "sine", 0.16); tone(90, 0.18, "sine", 0.12); }
  function leverSound() { ensureAudio(); tone(300, 0.12, "triangle", 0.09); tone(200, 0.16, "sine", 0.07); }
  function winJingle() {
    if (muted || !actx) return;
    const base = actx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, "triangle", 0.13, base + i * 0.1));
  }
  let whirTimer = null;
  function startWhir() {
    stopWhir();
    if (muted || !actx) return;
    // 低沉、輕柔的轉動聲(原本是 880Hz 方波,太尖)
    whirTimer = setInterval(() => tone(170 + randInt(70), 0.05, "triangle", 0.028), 95);
  }
  function stopWhir() { if (whirTimer) { clearInterval(whirTimer); whirTimer = null; } }

  // ---------- 畫面:選擇 ----------
  function renderSystemCards() {
    systemGrid.innerHTML = "";
    DATA.systems.forEach((sys) => {
      const card = document.createElement("div");
      card.className = "sys-card";
      card.setAttribute("role", "listitem");
      card.innerHTML =
        '<span class="ic">' + esc(sys.icon || "🚉") + "</span>" +
        '<span class="nm">' + esc(sys.name) + "</span>" +
        '<span class="meta">' + sys.lines.length + " 條線 · " + countStations(sys) + " 站</span>";
      card.addEventListener("click", () => openSystem(sys));
      systemGrid.appendChild(card);
    });
    const totalSys = DATA.systems.length;
    const totalSt = DATA.systems.reduce((a, s) => a + countStations(s), 0);
    statFoot.textContent = totalSys + " 系統 / " + totalSt + " 站";
    if (totalSys === 0) {
      statFoot.textContent = "⚠ 找不到站點資料(data/stations.js)";
    }
  }

  // ---------- 畫面切換 ----------
  function openSystem(sys) {
    currentSystem = sys;
    lockedLineId = "";
    sysIcon.textContent = sys.icon || "🚉";
    sysName.textContent = sys.name;

    // 路線下拉
    lineSelect.innerHTML = '<option value="">🎲 隨機路線(全系統)</option>';
    sys.lines.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name + "(" + l.stations.length + " 站)";
      lineSelect.appendChild(opt);
    });

    hideResult();
    primeReels();
    screenSelect.classList.add("hidden");
    screenMachine.classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  function backToSelect() {
    if (spinning) return;
    screenMachine.classList.add("hidden");
    screenSelect.classList.remove("hidden");
    currentSystem = null;
    window.scrollTo(0, 0);
  }

  // ---------- 滾輪 ----------
  function reelItemHTML(kind, item) {
    if (kind === "line") {
      return '<div class="reel-item line-item" style="--c:' + esc(item.color) + '">' +
        '<span class="main"><span class="dot"></span>' + esc(item.name) + "</span></div>";
    }
    if (kind === "station") {
      return '<div class="reel-item station-item">' +
        '<span class="main">' + esc(item.zh) + "</span>" +
        (item.en ? '<span class="sub">' + esc(item.en) + "</span>" : "") + "</div>";
    }
    return '<div class="reel-item task-item"><span class="main">' + esc(item.t) + "</span></div>";
  }

  // 靜態鋪上幾格(待機畫面)
  function primeReels() {
    const line = pick(currentSystem.lines);
    fillStrip(reelLine, "line", currentSystem.lines, 0);
    fillStrip(reelStation, "station", line.stations, 0);
    fillStrip(reelTask, "task", tasksFor(currentSystem), 0);
  }
  function fillStrip(reelEl, kind, items, centerIndex) {
    const strip = reelEl.querySelector(".reel-strip");
    // 用前後各補一格,讓 centerIndex 落在中列
    const list = items.length ? items : [""];
    const a = (centerIndex - 1 + list.length) % list.length;
    const c = centerIndex % list.length;
    const b = (centerIndex + 1) % list.length;
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    strip.innerHTML = [a, c, b].map((i) => reelItemHTML(kind, list[i])).join("");
  }

  // 旋轉某一輪並停在 targetIndex,回傳 Promise
  function spinReel(reelEl, kind, items, targetIndex, loops, duration) {
    return new Promise((resolve) => {
      const strip = reelEl.querySelector(".reel-strip");
      const n = items.length;
      const copies = loops + 2;
      let html = "";
      for (let c = 0; c < copies; c++) {
        for (let i = 0; i < n; i++) html += reelItemHTML(kind, items[i]);
      }
      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      strip.innerHTML = html;

      const itemH = strip.firstElementChild.offsetHeight || 58;
      const finalIndex = loops * n + targetIndex;     // 在長條中的目標格
      const offset = (finalIndex - 1) * itemH;        // 讓目標落在中列
      // 強制 reflow 再啟動過渡
      void strip.offsetHeight;
      strip.style.transition = "transform " + duration + "ms cubic-bezier(.12,.66,.24,1)";
      strip.style.transform = "translateY(" + (-offset) + "px)";

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        strip.removeEventListener("transitionend", finish);
        // 收斂成 3 格靜態,避免長條殘留
        fillStrip(reelEl, kind, items, targetIndex);
        resolve();
      };
      strip.addEventListener("transitionend", finish);
      setTimeout(finish, duration + 160);
    });
  }

  // ---------- 抽選 ----------
  function tasksFor(sys) {
    const type = sys.id === "tra" ? "tra" : "metro";
    return TASKS.filter((x) => x.sys === "all" || x.sys === type);
  }
  function chooseLine() {
    if (lockedLineId) {
      const l = currentSystem.lines.find((x) => x.id === lockedLineId);
      if (l) return l;
    }
    return pick(currentSystem.lines);
  }
  function chooseStation(line) {
    if (line.stations.length <= 1) return line.stations[0];
    let s, key, tries = 0;
    do {
      s = pick(line.stations);
      key = line.id + "|" + s.zh;
      tries++;
    } while (key === lastStationKey && tries < 8);
    lastStationKey = key;
    return s;
  }

  async function doSpin() {
    if (spinning || !currentSystem) return;
    spinning = true;
    btnSpin.disabled = true;
    cabinet.classList.remove("win");
    hideResult();

    ensureAudio();
    leverSound();
    lever.classList.add("pulled");
    setTimeout(() => lever.classList.remove("pulled"), 320);
    startWhir();

    const line = chooseLine();
    const lineIdx = currentSystem.lines.indexOf(line);
    const station = chooseStation(line);
    const stationIdx = line.stations.indexOf(station);
    const taskPool = tasksFor(currentSystem);
    const taskIdx = randInt(taskPool.length);
    const task = taskPool[taskIdx];

    const p1 = spinReel(reelLine, "line", currentSystem.lines, lineIdx, 5, 1400).then(clunk);
    const p2 = spinReel(reelStation, "station", line.stations, stationIdx, 7, 2100).then(clunk);
    const p3 = spinReel(reelTask, "task", taskPool, taskIdx, 9, 2800).then(clunk);

    await Promise.all([p1, p2, p3]);
    stopWhir();
    winJingle();
    cabinet.classList.add("win");
    showResult(currentSystem, line, station, task);
    addHistory(currentSystem, line, station, task);

    spinning = false;
    btnSpin.disabled = false;
  }

  // ---------- 結果 ----------
  function showResult(sys, line, station, task) {
    resultBanner.style.setProperty("--bcolor", line.color);
    resultBanner.style.setProperty("--btext", textOn(line.color));
    resultBox.querySelector(".r-station-zh").textContent = station.zh;
    resultBox.querySelector(".r-station-en").textContent = station.en || "";

    const chip = resultBox.querySelector(".r-line");
    chip.textContent = sys.name + " · " + line.name;
    chip.style.background = line.color;
    chip.style.color = textOn(line.color);

    resultBox.querySelector(".r-code").textContent = station.code ? "站號 " + station.code : "";

    const map = resultBox.querySelector(".r-map");
    const q = station.mapQuery || (station.zh + "車站");
    map.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

    resultBox.querySelector(".r-task span").textContent = task.t;
    resultBox.classList.remove("hidden");
    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function hideResult() {
    resultBox.classList.add("hidden");
    cabinet.classList.remove("win");
  }

  // ---------- 歷史 ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
  }
  function nowHM() {
    const d = new Date();
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function addHistory(sys, line, station, task) {
    history.unshift({
      sys: sys.name, line: line.name, color: line.color,
      zh: station.zh, code: station.code || "", task: task.t, time: nowHM(),
    });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    saveHistory();
    renderHistory();
  }
  function renderHistory() {
    historyList.innerHTML = "";
    if (!history.length) { historyEmpty.style.display = "block"; return; }
    historyEmpty.style.display = "none";
    history.forEach((h) => {
      const li = document.createElement("li");
      li.innerHTML =
        '<span class="h-bar" style="background:' + esc(h.color) + '"></span>' +
        '<span class="h-main">' +
        '<span class="h-st">' + esc(h.zh) + (h.code ? ' <span class="h-line">' + esc(h.code) + "</span>" : "") + "</span>" +
        '<div class="h-line">' + esc(h.sys) + " · " + esc(h.line) + "</div>" +
        '<div class="h-task">🎯 ' + esc(h.task) + "</div>" +
        "</span>" +
        '<span class="h-time">' + esc(h.time) + "</span>";
      historyList.appendChild(li);
    });
  }
  function clearHistory() {
    history = [];
    saveHistory();
    renderHistory();
  }

  // ---------- 音效開關 ----------
  function updateMuteBtn() {
    const b = $("#btn-mute");
    b.textContent = muted ? "🔇" : "🔊";
    b.setAttribute("aria-pressed", muted ? "true" : "false");
  }
  function toggleMute() {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (muted) stopWhir();
    else ensureAudio();
    updateMuteBtn();
  }

  // ---------- 事件 ----------
  function bind() {
    $("#btn-back").addEventListener("click", backToSelect);
    $("#btn-back2").addEventListener("click", backToSelect);
    $("#btn-mute").addEventListener("click", toggleMute);
    $("#btn-clear").addEventListener("click", clearHistory);
    $("#btn-spin").addEventListener("click", doSpin);
    $("#btn-again").addEventListener("click", doSpin);
    lever.addEventListener("click", doSpin);
    lever.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doSpin(); } });
    lineSelect.addEventListener("change", () => { lockedLineId = lineSelect.value; });
  }

  // ---------- 啟動 ----------
  renderSystemCards();
  renderHistory();
  updateMuteBtn();
  bind();
})();
