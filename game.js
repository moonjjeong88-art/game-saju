(function () {
  "use strict";

  const STAGES = [
  {
    goal: 100,
    labels: ["가난", "야근", "불행", "한숨", "빚", "스트레스", "우울", "실패"],
    message:
      "방금 당신은 터치 100번으로 정해진 운명을 박살 냈습니다. 거봐요, 사주 따윈 믿을 게 못 된다니까요?",
  },
  {
    goal: 200,
    labels: ["외로움", "실패", "후회", "배신", "낙오", "한계", "의심", "포기"],
    message:
      "두 번째 운명도 산산조각! 당신의 의지는 이미 사주판을 뛰어넘었습니다. 계속 나아가세요.",
  },
  {
    goal: 400,
    labels: ["절망", "패배", "고립", "무기력", "두려움", "침체", "막다른길", "운명"],
    message:
      "세 번째 바위까지 부숴버렸군요. 이제 운명은 당신을 따라오는 존재가 되었습니다.",
  },
];

  const UPGRADES = {
    action: { name: "실행력 강화", cost: 50, dps: 1 },
    ai: { name: "AI 활용 능력", cost: 200, dps: 5 },
  };

  const state = {
    willpower: 0,
    stageIndex: 0,
    highestWillpower: 0,
    dps: 0,
    owned: { action: 0, ai: 0 },
    clearing: false,
    autoTick: 0,
    lastTick: 0,
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
  };

  function currentStage() {
    return STAGES[Math.min(state.stageIndex, STAGES.length - 1)];
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
    updateStoreButtons();
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
  }

  function checkStageClear() {
    if (state.clearing) return;
    if (state.highestWillpower >= stageGoal()) {
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
    playHitAnimation();
    addWillpower(1, point.clientX, point.clientY);
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
    els.rockWrapper.classList.add("hidden");
    createShatterEffect();
    showPopup(currentStage().message);
  }

  function startNextStage() {
    hidePopup();
    state.stageIndex++;
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
    randomLabelPositions(STAGES[0].labels);
    updateHUD();

    els.rockWrapper.addEventListener("pointerdown", onRockPointer);
    els.popupNext.addEventListener("click", startNextStage);

    els.upgradeAction.addEventListener("click", () => buyUpgrade("action"));
    els.upgradeAi.addEventListener("click", () => buyUpgrade("ai"));

    requestAnimationFrame(gameLoop);
  }

  init();
})();
