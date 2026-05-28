(function () {
  "use strict";

  const STAGES = [
  {
    goal: 100,
    labels: ["가난", "야근", "불행", "한숨", "빚", "스트레스", "우울", "실패"],
    mission: "두려움을 깨고 주말 아침, 집 근처 낮은 산 정상에 오른다.",
    unlock: "첫 등산 성공",
    message:
      "방금 당신은 터치 100번으로 정해진 운명을 박살 냈습니다. 거봐요, 사주 따윈 믿을 게 못 된다니까요?",
  },
  {
    goal: 200,
    labels: ["외로움", "실패", "후회", "배신", "낙오", "한계", "의심", "포기"],
    mission: "외로움을 깨고 동네 수영장에 등록해 물에 뜨는 법을 배운다.",
    unlock: "수영 첫 25m 완주",
    message:
      "두 번째 운명도 산산조각! 당신의 의지는 이미 사주판을 뛰어넘었습니다. 계속 나아가세요.",
  },
  {
    goal: 400,
    labels: ["절망", "패배", "고립", "무기력", "두려움", "침체", "막다른길", "운명"],
    mission: "실패 공포를 깨고 미뤄둔 지원서/포트폴리오를 끝내 제출한다.",
    unlock: "도전 실행 완료",
    message:
      "세 번째 바위까지 부숴버렸군요. 이제 운명은 당신을 따라오는 존재가 되었습니다.",
  },
];

  const UPGRADES = {
    action: { name: "실행력 강화", cost: 50, dps: 1 },
    ai: { name: "AI 활용 능력", cost: 200, dps: 5 },
  };

  // Balance tuning table: tweak only these values.
  const BALANCE = {
    normalTapPoint: 1,
    feverGaugeMax: 100,
    feverGaugeGainPerTap: 8,
    feverDurationSec: 5,
    feverBaseTapPoint: 10,
    feverJackpotTapPoint: 100,
    feverJackpotChance: 0.2,
  };
  const BALANCE_DEFAULTS = { ...BALANCE };
  const BALANCE_STORAGE_KEY = "sajugame.balance.v1";
  const UNLOCKS_STORAGE_KEY = "sajugame.unlocks.v1";

  const BALANCE_META = {
    normalTapPoint: { label: "평상시 터치 점수", min: 1, max: 999, step: 1 },
    feverGaugeMax: { label: "피버 게이지 최대치", min: 10, max: 999, step: 1 },
    feverGaugeGainPerTap: { label: "터치당 게이지 증가", min: 1, max: 100, step: 1 },
    feverDurationSec: { label: "피버 지속시간(초)", min: 1, max: 30, step: 0.1 },
    feverBaseTapPoint: { label: "피버 기본 터치 점수", min: 1, max: 9999, step: 1 },
    feverJackpotTapPoint: { label: "피버 잭팟 점수", min: 1, max: 99999, step: 1 },
    feverJackpotChance: { label: "피버 잭팟 확률(0~1)", min: 0, max: 1, step: 0.01 },
  };

  const state = {
    willpower: 0,
    stageIndex: 0,
    stageStartWillpower: 0,
    highestWillpower: 0,
    dps: 0,
    owned: { action: 0, ai: 0 },
    clearing: false,
    autoTick: 0,
    lastTick: 0,
    feverGauge: 0,
    feverActive: false,
    feverEndAt: 0,
    completedUnlocks: [],
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    willpower: $("willpower-display"),
    dps: $("dps-display"),
    goal: $("goal-display"),
    rockWrapper: $("rock-wrapper"),
    rockLabels: $("rock-labels"),
    rockContainer: $("rock-container"),
    shatterLayer: $("shatter-layer"),
    popupOverlay: $("popup-overlay"),
    popupText: $("popup-text"),
    popupNext: $("popup-next"),
    upgradeAction: $("upgrade-action"),
    upgradeAi: $("upgrade-ai"),
    ownedAction: $("owned-action"),
    ownedAi: $("owned-ai"),
    feverFill: $("fever-fill"),
    feverPercent: $("fever-percent"),
    feverBanner: $("fever-banner"),
    feverTimer: $("fever-timer"),
    feverFlash: $("fever-flash"),
    devToggle: $("dev-toggle"),
    devPanel: $("dev-panel"),
    devGrid: $("dev-grid"),
    devResetBtn: $("dev-reset-btn"),
    devClearBtn: $("dev-clear-btn"),
    missionText: $("mission-text"),
    missionLog: $("mission-log"),
  };

  let audioCtx = null;
  let bgmTimer = 0;

  function currentStage() {
    if (state.stageIndex < STAGES.length) {
      return STAGES[state.stageIndex];
    }

    const base = STAGES[STAGES.length - 1];
    const extraIndex = state.stageIndex - (STAGES.length - 1);
    return {
      goal: base.goal + extraIndex * 200,
      labels: base.labels,
      mission: "새로운 두려움을 깨고, 오늘 미룬 한 가지 행동을 즉시 실행한다.",
      unlock: `실행 배지 ${state.stageIndex + 1}`,
      message: `${state.stageIndex + 1}번째 운명까지 파괴했습니다. 이제 당신이 운명을 설계하는 단계입니다.`,
    };
  }

  function stageGoal() {
    return currentStage().goal;
  }

  function formatNum(n) {
    return Math.floor(n).toLocaleString("ko-KR");
  }

  function updateHUD() {
    els.willpower.textContent = formatNum(state.willpower);
    els.dps.textContent = formatNum(state.dps);
    els.goal.textContent = formatNum(stageGoal());
    const gaugePct = Math.max(0, Math.min(100, (state.feverGauge / BALANCE.feverGaugeMax) * 100));
    els.feverFill.style.width = `${gaugePct}%`;
    els.feverPercent.textContent = Math.floor(gaugePct);
    if (state.feverActive) {
      const remain = Math.max(0, (state.feverEndAt - performance.now()) / 1000);
      els.feverTimer.textContent = remain.toFixed(1);
    }
    const stage = currentStage();
    els.missionText.textContent = stage.mission;
    updateStoreButtons();
  }

  function renderMissionLog() {
    els.missionLog.innerHTML = "";
    if (state.completedUnlocks.length === 0) {
      const empty = document.createElement("span");
      empty.className = "dev-label";
      empty.textContent = "아직 해방 기록이 없습니다.";
      els.missionLog.appendChild(empty);
      return;
    }
    for (const item of state.completedUnlocks) {
      const chip = document.createElement("span");
      chip.className = "mission-chip";
      chip.textContent = item;
      els.missionLog.appendChild(chip);
    }
  }

  function updateStoreButtons() {
    for (const [key, cfg] of Object.entries(UPGRADES)) {
      const btn = key === "action" ? els.upgradeAction : els.upgradeAi;
      const canAfford = state.willpower >= cfg.cost;
      btn.disabled = !canAfford;
      btn.classList.toggle("can-afford", canAfford);
    }
    els.ownedAction.textContent = `보유 ${state.owned.action}`;
    els.ownedAi.textContent = `보유 ${state.owned.ai}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sanitizeBalanceValue(key, rawValue) {
    const meta = BALANCE_META[key];
    if (!meta) return null;
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) return null;
    const clamped = clamp(parsed, meta.min, meta.max);
    return meta.step < 1 ? Number(clamped.toFixed(2)) : Math.round(clamped);
  }

  function saveBalanceToStorage() {
    try {
      window.localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(BALANCE));
    } catch (_) {
      // Ignore storage failures (private mode / quota issues).
    }
  }

  function clearBalanceStorage() {
    try {
      window.localStorage.removeItem(BALANCE_STORAGE_KEY);
    } catch (_) {
      // Ignore storage failures.
    }
  }

  function saveUnlocksToStorage() {
    try {
      window.localStorage.setItem(UNLOCKS_STORAGE_KEY, JSON.stringify(state.completedUnlocks));
    } catch (_) {
      // Ignore storage failures.
    }
  }

  function loadUnlocksFromStorage() {
    try {
      const raw = window.localStorage.getItem(UNLOCKS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      state.completedUnlocks = parsed.filter((item) => typeof item === "string");
    } catch (_) {
      // Ignore malformed JSON or localStorage errors.
    }
  }

  function loadBalanceFromStorage() {
    try {
      const raw = window.localStorage.getItem(BALANCE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      for (const key of Object.keys(BALANCE_META)) {
        if (!(key in parsed)) continue;
        const sanitized = sanitizeBalanceValue(key, parsed[key]);
        if (sanitized != null) {
          BALANCE[key] = sanitized;
        }
      }
    } catch (_) {
      // Ignore malformed JSON or localStorage errors.
    }
  }

  function renderDevPanel() {
    els.devGrid.innerHTML = "";
    for (const [key, meta] of Object.entries(BALANCE_META)) {
      const label = document.createElement("label");
      label.className = "dev-label";
      label.setAttribute("for", `balance-${key}`);
      label.textContent = meta.label;

      const input = document.createElement("input");
      input.className = "dev-input";
      input.id = `balance-${key}`;
      input.type = "number";
      input.min = String(meta.min);
      input.max = String(meta.max);
      input.step = String(meta.step);
      input.value = String(BALANCE[key]);
      input.dataset.key = key;
      input.addEventListener("input", onBalanceInput);

      els.devGrid.appendChild(label);
      els.devGrid.appendChild(input);
    }
  }

  function syncDevPanelValues() {
    const inputs = els.devGrid.querySelectorAll("input[data-key]");
    for (const input of inputs) {
      const key = input.dataset.key;
      input.value = String(BALANCE[key]);
    }
  }

  function onBalanceInput(e) {
    const input = e.target;
    const key = input.dataset.key;
    const meta = BALANCE_META[key];
    if (!meta) return;

    const sanitized = sanitizeBalanceValue(key, input.value);
    if (sanitized == null) return;
    BALANCE[key] = sanitized;

    if (key === "feverGaugeMax") {
      state.feverGauge = Math.min(state.feverGauge, BALANCE.feverGaugeMax);
    }
    if (key === "feverDurationSec" && state.feverActive) {
      const remain = Math.max(0, state.feverEndAt - performance.now());
      state.feverEndAt = performance.now() + Math.min(remain, BALANCE.feverDurationSec * 1000);
    }

    syncDevPanelValues();
    saveBalanceToStorage();
    updateHUD();
  }

  function toggleDevPanel() {
    const isHidden = els.devPanel.classList.toggle("hidden");
    els.devToggle.setAttribute("aria-expanded", String(!isHidden));
    els.devToggle.textContent = isHidden ? "개발자 밸런스" : "패널 닫기";
  }

  function resetBalanceDefaults() {
    Object.assign(BALANCE, BALANCE_DEFAULTS);
    state.feverGauge = Math.min(state.feverGauge, BALANCE.feverGaugeMax);
    if (state.feverActive) {
      state.feverEndAt = performance.now() + BALANCE.feverDurationSec * 1000;
    }
    syncDevPanelValues();
    saveBalanceToStorage();
    updateHUD();
  }

  function clearSavedBalanceAndReset() {
    clearBalanceStorage();
    Object.assign(BALANCE, BALANCE_DEFAULTS);
    state.feverGauge = Math.min(state.feverGauge, BALANCE.feverGaugeMax);
    if (state.feverActive) {
      state.feverEndAt = performance.now() + BALANCE.feverDurationSec * 1000;
    }
    syncDevPanelValues();
    updateHUD();
  }

  function randomLabelPositions(labels) {
    els.rockLabels.innerHTML = "";
    const count = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.className = "rock-label";
      span.textContent = labels[Math.floor(Math.random() * labels.length)];
      span.style.left = `${8 + Math.random() * 72}%`;
      span.style.top = `${10 + Math.random() * 70}%`;
      span.style.transform = `rotate(${-18 + Math.random() * 36}deg)`;
      span.style.fontSize = `${0.65 + Math.random() * 0.35}rem`;
      els.rockLabels.appendChild(span);
    }
  }

  function spawnFloatText(x, y, text) {
    const el = document.createElement("div");
    el.className = "float-text";
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function bumpHUD() {
    els.willpower.classList.remove("bump");
    void els.willpower.offsetWidth;
    els.willpower.classList.add("bump");
  }

  function playHitAnimation() {
    const w = els.rockWrapper;
    w.classList.remove("pulse", "shake", "hit");
    void w.offsetWidth;
    w.classList.add("hit", "pulse", "shake");
    setTimeout(() => w.classList.remove("hit"), 150);
    setTimeout(() => w.classList.remove("pulse", "shake"), 280);
    if (state.feverActive) {
      w.classList.remove("fever-shake");
      void w.offsetWidth;
      w.classList.add("fever-shake");
      setTimeout(() => w.classList.remove("fever-shake"), 180);
    }
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function playTone(freq, duration, type, volume) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function triggerScreenFlash() {
    els.feverFlash.classList.remove("hidden");
    void els.feverFlash.offsetWidth;
    setTimeout(() => {
      els.feverFlash.classList.add("hidden");
    }, 420);
  }

  function spawnSparks(x, y) {
    const count = state.feverActive ? 14 : 6;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("div");
      s.className = "spark";
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      const dist = (state.feverActive ? 100 : 55) * Math.random();
      const angle = Math.random() * Math.PI * 2;
      s.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
      s.style.setProperty("--sy", `${Math.sin(angle) * dist}px`);
      document.body.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }

  function startFeverMode() {
    state.feverActive = true;
    state.feverGauge = 0;
    state.feverEndAt = performance.now() + BALANCE.feverDurationSec * 1000;
    document.body.classList.add("fever-mode");
    els.feverBanner.classList.remove("hidden");
    triggerScreenFlash();
    ensureAudioContext();
    playTone(880, 0.24, "sawtooth", 0.08);
    playTone(1174, 0.2, "triangle", 0.07);
    updateHUD();
  }

  function endFeverMode() {
    state.feverActive = false;
    state.feverEndAt = 0;
    document.body.classList.remove("fever-mode");
    els.feverBanner.classList.add("hidden");
    updateHUD();
  }

  function checkStageClear() {
    if (state.clearing) return;
    const gainedThisStage = state.highestWillpower - state.stageStartWillpower;
    if (gainedThisStage >= stageGoal()) {
      triggerStageClear();
    }
  }

  function addWillpower(amount, x, y) {
    if (state.clearing) return;

    state.willpower += amount;
    state.highestWillpower = Math.max(state.highestWillpower, state.willpower);
    bumpHUD();
    updateHUD();

    if (x != null && y != null) {
      spawnFloatText(x, y, `+${amount}`);
    }

    checkStageClear();
  }

  function onRockPointer(e) {
    if (state.clearing) return;
    e.preventDefault();

    const point = e.touches ? e.touches[0] : e;
    ensureAudioContext();
    playHitAnimation();
    const tapAmount = state.feverActive
      ? (
          Math.random() < BALANCE.feverJackpotChance
            ? BALANCE.feverJackpotTapPoint
            : BALANCE.feverBaseTapPoint
        )
      : BALANCE.normalTapPoint;
    addWillpower(tapAmount, point.clientX, point.clientY);
    spawnSparks(point.clientX, point.clientY);
    if (state.feverActive) {
      playTone(420 + Math.random() * 180, 0.08, "square", 0.03);
    } else {
      playTone(220 + Math.random() * 60, 0.06, "triangle", 0.018);
      state.feverGauge = Math.min(BALANCE.feverGaugeMax, state.feverGauge + BALANCE.feverGaugeGainPerTap);
      if (state.feverGauge >= BALANCE.feverGaugeMax) {
        startFeverMode();
      } else {
        updateHUD();
      }
    }
  }

  function createShatterEffect() {
    const layer = els.shatterLayer;
    layer.innerHTML = "";

    const ring = document.createElement("div");
    ring.className = "burst-ring";
    layer.appendChild(ring);

    const cx = 50;
    const cy = 50;
    const pieces = 14;

    for (let i = 0; i < pieces; i++) {
      const piece = document.createElement("div");
      piece.className = "shatter-piece";
      const angle = (i / pieces) * Math.PI * 2;
      const dist = 80 + Math.random() * 60;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;
      const size = 18 + Math.random() * 22;
      const left = cx + Math.cos(angle) * 25 - size / 2;
      const top = cy + Math.sin(angle) * 20 - size / 2;

      piece.style.width = `${size}px`;
      piece.style.height = `${size * (0.6 + Math.random() * 0.5)}px`;
      piece.style.left = `${left}%`;
      piece.style.top = `${top}%`;
      piece.style.setProperty("--tx", `${tx}px`);
      piece.style.setProperty("--ty", `${ty}px`);
      piece.style.setProperty("--rot", `${-90 + Math.random() * 180}deg`);
      piece.style.borderRadius = `${20 + Math.random() * 40}%`;
      layer.appendChild(piece);
    }

    setTimeout(() => {
      layer.innerHTML = "";
    }, 1000);
  }

  function typeMessage(text, el, onDone) {
    el.innerHTML = "";
    let i = 0;
    const cursor = document.createElement("span");
    cursor.className = "cursor";

    function tick() {
      if (i < text.length) {
        el.textContent = text.slice(0, i + 1);
        el.appendChild(cursor);
        i++;
        setTimeout(tick, 38);
      } else {
        el.textContent = text;
        if (onDone) onDone();
      }
    }
    tick();
  }

  function showPopup(message) {
    els.popupOverlay.classList.remove("hidden");
    typeMessage(message, els.popupText);
  }

  function hidePopup() {
    els.popupOverlay.classList.add("hidden");
    els.popupText.innerHTML = "";
  }

  function triggerStageClear() {
    state.clearing = true;
    if (state.feverActive) endFeverMode();
    const unlock = currentStage().unlock;
    if (unlock) {
      state.completedUnlocks.push(unlock);
      saveUnlocksToStorage();
      renderMissionLog();
    }
    els.rockWrapper.classList.add("hidden");
    createShatterEffect();
    const clearMessage = `${currentStage().message}\n\n해방 결과: ${currentStage().mission}`;
    showPopup(clearMessage);
  }

  function startNextStage() {
    hidePopup();
    state.stageIndex++;
    state.stageStartWillpower = state.highestWillpower;
    state.clearing = false;

    const stage = currentStage();
    randomLabelPositions(stage.labels);
    els.rockWrapper.classList.remove("hidden");
    updateHUD();
  }

  function buyUpgrade(key) {
    const cfg = UPGRADES[key];
    if (state.willpower < cfg.cost) return;

    state.willpower -= cfg.cost;
    state.owned[key]++;
    state.dps += cfg.dps;
    bumpHUD();
    updateHUD();
    spawnFloatText(
      window.innerWidth / 2,
      window.innerHeight * 0.7,
      `+${cfg.dps}/초`
    );
  }

  function gameLoop(timestamp) {
    if (!state.lastTick) state.lastTick = timestamp;
    const delta = (timestamp - state.lastTick) / 1000;
    state.lastTick = timestamp;

    if (state.feverActive && timestamp >= state.feverEndAt) {
      endFeverMode();
    }

    if (audioCtx) {
      bgmTimer += delta;
      const bpm = state.feverActive ? 170 : 110;
      const step = 60 / bpm;
      if (bgmTimer >= step) {
        bgmTimer -= step;
        if (state.feverActive) {
          playTone(220, 0.08, "sawtooth", 0.018);
          playTone(330, 0.06, "triangle", 0.012);
        } else {
          playTone(165, 0.07, "sine", 0.008);
        }
      }
    }

    if (state.dps > 0 && !state.clearing) {
      state.autoTick += delta * state.dps;
      const whole = Math.floor(state.autoTick);
      if (whole > 0) {
        state.autoTick -= whole;
        state.willpower += whole;
        state.highestWillpower = Math.max(state.highestWillpower, state.willpower);
        updateHUD();
        checkStageClear();
      }
    }

    requestAnimationFrame(gameLoop);
  }

  function init() {
    loadBalanceFromStorage();
    loadUnlocksFromStorage();
    randomLabelPositions(STAGES[0].labels);
    renderDevPanel();
    renderMissionLog();
    updateHUD();

    els.rockWrapper.addEventListener("pointerdown", onRockPointer);
    els.popupNext.addEventListener("click", startNextStage);

    els.upgradeAction.addEventListener("click", () => buyUpgrade("action"));
    els.upgradeAi.addEventListener("click", () => buyUpgrade("ai"));
    els.devToggle.addEventListener("click", toggleDevPanel);
    els.devResetBtn.addEventListener("click", resetBalanceDefaults);
    els.devClearBtn.addEventListener("click", clearSavedBalanceAndReset);

    requestAnimationFrame(gameLoop);
  }

  init();
})();
