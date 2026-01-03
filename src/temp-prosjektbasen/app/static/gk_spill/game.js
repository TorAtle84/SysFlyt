const STATES = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  GAME_OVER: "gameover",
};

const STORAGE_KEYS = {
  avatar: "gkSpillAvatar",
  bestScore: "gkSpillBestScore",
  mute: "gkSpillMute",
};

const HIGHSCORE_LIMIT = 5;

const AVATARS = [
  {
    id: "frost",
    label: "Snøkrystall",
    icon: "❄️",
    colors: { primary: "#5dade2", accent: "#ffffff" },
  },
  {
    id: "tech",
    label: "Datamaskin",
    icon: "💻",
    colors: { primary: "#6f42c1", accent: "#d4c3ff" },
  },
  {
    id: "vent",
    label: "Vifte",
    icon: "🌀",
    colors: { primary: "#20c997", accent: "#b8f2e6" },
  },
  {
    id: "pipes",
    label: "Rør",
    icon: "🧱",
    colors: { primary: "#ff7f50", accent: "#ffd8c2" },
  },
  {
    id: "bolt",
    label: "Lyn",
    icon: "⚡",
    colors: { primary: "#f1c40f", accent: "#fff3bf" },
  },
];

const OBSTACLE_TYPES = [
  {
    id: "trash",
    label: "Søppel",
    color: "#6c757d",
    width: [48, 86],
    height: [54, 120],
    minDifficulty: 0,
  },
  {
    id: "pit",
    label: "Hull i bakken",
    color: "#2f3542",
    width: [90, 150],
    height: [28, 40],
    minDifficulty: 0.15,
    isPit: true,
  },
  {
    id: "hospital",
    label: "Sykehus-merke",
    color: "#ff6b6b",
    width: [56, 80],
    height: [76, 124],
    minDifficulty: 0.25,
  },
  {
    id: "explosion",
    label: "Eksplosjon",
    color: "#ffa502",
    width: [66, 112],
    height: [84, 140],
    minDifficulty: 0.4,
  },
  {
    id: "delay",
    label: "Forsinkelse",
    color: "#1e90ff",
    width: [58, 90],
    height: [70, 110],
    minDifficulty: 0.55,
  },
  {
    id: "budget",
    label: "Budsjett-lekkasje",
    color: "#ff9ff3",
    width: [52, 82],
    height: [74, 128],
    minDifficulty: 0.7,
  },
  {
    id: "warning",
    label: "Advarseltrekant",
    color: "#f39c12",
    width: [64, 92],
    height: [90, 138],
    minDifficulty: 0.85,
  },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function difficultyAt(seconds) {
  if (seconds <= 5) {
    return 0;
  }
  if (seconds >= 125) {
    return 1;
  }
  return (seconds - 5) / 120;
}

function formatScore(value) {
  const rounded = Math.max(0, Math.floor(value));
  return rounded.toLocaleString("nb-NO");
}

const NAME_PATTERN = /^[A-ZÅÆØa-zåæø0-9 _-]{1,12}$/u;
const DATE_FORMATTER = new Intl.DateTimeFormat("nb-NO", { dateStyle: "short" });

class HighscoreClient {
  constructor(baseUrl = "/spill/api") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async list() {
    const response = await fetch(`${this.baseUrl}/highscores`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("Kunne ikke hente highscore-listen");
    }
    const data = await response.json();
    return Array.isArray(data?.highscores) ? data.highscores : [];
  }

  async submit(name, score) {
    const response = await fetch(`${this.baseUrl}/highscores`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name, score }),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data?.error || "Kunne ikke lagre poengsum");
      error.detail = data;
      throw error;
    }
    return data;
  }
}

class GKSpillUI {
  constructor(container, wrapper) {
    this.container = container;
    this.wrapper = wrapper;
    this.overlay = this.#createOverlay();
    this.hud = this.#createHud();
    this.game = null;
  }

  attachGame(game) {
    this.game = game;
  }

  getStoredAvatarId() {
    return localStorage.getItem(STORAGE_KEYS.avatar);
  }

  persistAvatar(id) {
    localStorage.setItem(STORAGE_KEYS.avatar, id);
  }

  updateScore(score, bestScore, avatar) {
    this.scoreValue.textContent = formatScore(score);
    this.bestValue.textContent = formatScore(bestScore);
    this.avatarValue.textContent = avatar ? `${avatar.icon} ${avatar.label}` : "–";
  }

  updatePause(isPaused) {
    this.pauseButton.textContent = isPaused ? "Fortsett (P)" : "Pause (P)";
    this.pauseButton.setAttribute("aria-pressed", isPaused ? "true" : "false");
  }

  updateMute(isMuted) {
    this.muteButton.textContent = isMuted ? "Lyd av (M)" : "Lyd på (M)";
    this.muteButton.setAttribute("aria-pressed", isMuted ? "true" : "false");
  }

  showStartScreen(avatars, selectedId, onSelect, onStart) {
    const panel = document.createElement("div");
    panel.className = "gk-spill-panel";
    panel.innerHTML = `
      <h2 class="gk-spill-panel__title">Velkommen til GK-Spillet</h2>
      <p class="gk-spill-panel__text">Velg din avatar og trykk Start for å løpe. Bruk Space for å hoppe over hindringene.</p>
    `;

    const avatarGroup = document.createElement("div");
    avatarGroup.className = "gk-spill-avatar-group";
    avatarGroup.setAttribute("role", "radiogroup");

    avatars.forEach((avatar) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gk-avatar-option";
      button.dataset.avatarId = avatar.id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", avatar.id === selectedId ? "true" : "false");
      button.innerHTML = `
        <span class="gk-avatar-option__icon">${avatar.icon}</span>
        <span class="gk-avatar-option__label">${avatar.label}</span>
      `;
      if (avatar.id === selectedId) {
        button.classList.add("selected");
      }
      button.addEventListener("click", () => {
        this.#selectAvatar(button, avatarGroup);
        onSelect(avatar.id);
      });
      avatarGroup.appendChild(button);
    });

    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = "gk-spill-primary";
    startButton.textContent = "Start";
    startButton.disabled = !selectedId;
    startButton.addEventListener("click", () => {
      onStart();
      this.hideOverlay();
    });

    const tipsList = document.createElement("ul");
    tipsList.className = "gk-spill-panel__tips";
    tipsList.innerHTML = `
      <li>Space eller trykk på skjermen for å hoppe.</li>
      <li>P for pause. M for lyd av/på.</li>
      <li>Tempoet øker gradvis – hold fokuset!</li>
    `;

    panel.appendChild(avatarGroup);
    panel.appendChild(startButton);
    panel.appendChild(tipsList);
    this.showOverlay(panel);

    const enableStart = () => {
      const selected = avatarGroup.querySelector(".gk-avatar-option.selected");
      startButton.disabled = !selected;
    };

    avatarGroup.addEventListener("click", enableStart);
    enableStart();
  }

  showGameOver({
    score,
    bestScore,
    scoreboard,
    qualifies,
    onRestart,
    onSubmit,
    errorMessage,
    highlightId,
  }) {
    const panel = document.createElement("div");
    panel.className = "gk-spill-panel";
    panel.innerHTML = `
      <h2 class="gk-spill-panel__title">Spillet er over</h2>
      <p class="gk-spill-panel__summary">Du oppnådde <strong>${formatScore(score)}</strong> poeng.</p>
      <p class="gk-spill-panel__summary">Topp (lokal) poengsum: <strong>${formatScore(bestScore)}</strong></p>
    `;

    if (errorMessage) {
      const errorNode = document.createElement("p");
      errorNode.className = "gk-spill-message gk-spill-message--error";
      errorNode.textContent = errorMessage;
      panel.appendChild(errorNode);
    }

    const highscoresSection = document.createElement("section");
    highscoresSection.className = "gk-spill-highscore-section";

    const highscoresTitle = document.createElement("h3");
    highscoresTitle.className = "gk-spill-highscore-title";
    highscoresTitle.textContent = "Topp 5";

    const list = document.createElement("ol");
    list.className = "gk-spill-highscores";
    list.setAttribute("aria-live", "polite");
    list.setAttribute("aria-label", "Topp 5 poengsummer");

    const renderList = (entries, currentId) => {
      list.innerHTML = "";
      if (!entries?.length) {
        const placeholder = document.createElement("li");
        placeholder.className = "gk-spill-highscore-item is-empty";
        placeholder.textContent = "Ingen registrerte poengsummer ennå.";
        list.appendChild(placeholder);
        return;
      }

      entries.forEach((entry, index) => {
        const item = document.createElement("li");
        item.className = "gk-spill-highscore-item";
        if (currentId && entry.id === currentId) {
          item.classList.add("is-current");
        }

        const rank = document.createElement("span");
        rank.className = "gk-highscore__rank";
        rank.textContent = String(index + 1).padStart(2, "0");

        const name = document.createElement("span");
        name.className = "gk-highscore__name";
        name.textContent = entry.name;

        const scoreValue = document.createElement("span");
        scoreValue.className = "gk-highscore__score";
        scoreValue.textContent = formatScore(entry.score);

        const dateLabel = document.createElement("span");
        dateLabel.className = "gk-highscore__date";
        if (entry.created_at) {
          const parsed = new Date(entry.created_at);
          if (!Number.isNaN(parsed.valueOf())) {
            dateLabel.textContent = DATE_FORMATTER.format(parsed);
          }
        }

        item.append(rank, name, scoreValue, dateLabel);
        list.appendChild(item);
      });
    };

    renderList(scoreboard, highlightId);

    highscoresSection.append(highscoresTitle, list);
    panel.appendChild(highscoresSection);

    if (qualifies && typeof onSubmit === "function") {
      const info = document.createElement("p");
      info.className = "gk-spill-panel__text";
      info.textContent = "Gratulerer! Din poengsum kvalifiserer til topp 5. Legg inn navnet ditt:";

      const form = document.createElement("form");
      form.className = "gk-spill-highscore-form";

      const inputId = `gk-highscore-${Math.random().toString(36).slice(2, 8)}`;
      const label = document.createElement("label");
      label.className = "gk-spill-highscore-label";
      label.setAttribute("for", inputId);
      label.textContent = "Navn (1–12 tegn)";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "gk-spill-input";
      input.name = "name";
      input.maxLength = 12;
      input.autocomplete = "off";
      input.placeholder = "Navn (maks 12 tegn)";
      input.required = true;
      input.pattern = "[A-ZÅÆØa-zåæø0-9 _-]{1,12}";
      input.title = "1–12 tegn. Tillatte tegn: bokstaver, tall, mellomrom, - og _.";
      input.id = inputId;

      const submitButton = document.createElement("button");
      submitButton.type = "submit";
      submitButton.className = "gk-spill-primary";
      submitButton.textContent = "Lagre";

      const feedback = document.createElement("p");
      feedback.className = "gk-spill-message";
      const feedbackId = `${inputId}-feedback`;
      feedback.id = feedbackId;
      input.setAttribute("aria-describedby", feedbackId);

      form.append(label, input, submitButton, feedback);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const enteredName = input.value.trim();
        if (!NAME_PATTERN.test(enteredName)) {
          feedback.textContent = "Navnet må være 1–12 tegn og kan bruke bokstaver, tall, mellomrom, - eller _.";
          feedback.classList.remove("gk-spill-message--success");
          feedback.classList.add("gk-spill-message--error");
          input.focus();
          return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Lagrer...";
        feedback.textContent = "";
        feedback.classList.remove("gk-spill-message--success", "gk-spill-message--error");

        try {
          const result = await onSubmit(enteredName);
          renderList(result?.highscores ?? [], result?.entry?.id);

          if (result?.inserted) {
            feedback.textContent = "Poengsummen er lagret!";
            feedback.classList.add("gk-spill-message--success");
            feedback.classList.remove("gk-spill-message--error");
            input.disabled = true;
            submitButton.disabled = true;
            submitButton.textContent = "Lagret";
          } else if (result?.qualifies) {
            feedback.textContent = "Topplisten endret seg – prøv gjerne igjen.";
            feedback.classList.add("gk-spill-message--error");
            submitButton.disabled = false;
            submitButton.textContent = "Lagre";
          } else {
            feedback.textContent = "Poengsummen nådde ikke topp 5 denne gangen.";
            feedback.classList.add("gk-spill-message--error");
            submitButton.disabled = false;
            submitButton.textContent = "Lagre";
          }
        } catch (error) {
          const detail = error?.detail?.error;
          if (detail === "ugyldig_navn") {
            feedback.textContent = "Navnet må være 1–12 tegn og kan bruke bokstaver, tall, mellomrom, - eller _.";
          } else if (detail === "ugyldig_score") {
            feedback.textContent = "Poengsummen var ikke gyldig.";
          } else {
            feedback.textContent = error?.message || "Ukjent feil ved lagring.";
          }
          feedback.classList.remove("gk-spill-message--success");
          feedback.classList.add("gk-spill-message--error");
          submitButton.disabled = false;
          submitButton.textContent = "Lagre";
        }
      });

      panel.append(info, form);
      setTimeout(() => input.focus(), 150);
    } else {
      const info = document.createElement("p");
      info.className = "gk-spill-panel__text";
      info.textContent = scoreboard?.length
        ? "Poengsummen nådde ikke topp 5 denne gangen – prøv igjen for å klatre!"
        : "Løp en ny runde for å legge inn den første poengsummen.";
      panel.appendChild(info);
    }

    const restart = document.createElement("button");
    restart.type = "button";
    restart.className = "gk-spill-primary";
    restart.textContent = "Prøv igjen";
    restart.addEventListener("click", () => {
      onRestart();
      this.hideOverlay();
    });

    const tip = document.createElement("p");
    tip.className = "gk-spill-panel__text";
    tip.textContent = "Tips: Jo lengre du holder ut, desto raskere og tettere kommer hindringene!";

    panel.append(restart, tip);
    this.showOverlay(panel);
  }

  showOverlay(content) {
    this.overlay.innerHTML = "";
    this.overlay.appendChild(content);
    this.overlay.classList.add("visible");
  }

  hideOverlay() {
    this.overlay.classList.remove("visible");
  }

  #createOverlay() {
    const overlay = document.createElement("section");
    overlay.id = "gk-spill-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    this.wrapper.appendChild(overlay);
    return overlay;
  }

  #createHud() {
    const hud = document.createElement("div");
    hud.id = "gk-spill-hud";

    const metricGroup = document.createElement("div");
    metricGroup.className = "gk-spill-metrics";

    const scoreMetric = this.#createMetric("Poeng", "0");
    this.scoreValue = scoreMetric.querySelector(".gk-metric__value");

    const bestMetric = this.#createMetric("Topp", "0");
    this.bestValue = bestMetric.querySelector(".gk-metric__value");

    const avatarMetric = this.#createMetric("Avatar", "–");
    this.avatarValue = avatarMetric.querySelector(".gk-metric__value");

    metricGroup.append(scoreMetric, bestMetric, avatarMetric);

    const actions = document.createElement("div");
    actions.id = "gk-spill-actions";

    this.pauseButton = document.createElement("button");
    this.pauseButton.type = "button";
    this.pauseButton.className = "gk-spill-chip";
    this.pauseButton.textContent = "Pause (P)";
    this.pauseButton.setAttribute("aria-label", "Pause eller fortsett spillet");
    this.pauseButton.setAttribute("aria-pressed", "false");
    this.pauseButton.addEventListener("click", () => {
      this.game?.togglePause();
    });

    this.muteButton = document.createElement("button");
    this.muteButton.type = "button";
    this.muteButton.className = "gk-spill-chip";
    this.muteButton.textContent = "Lyd på (M)";
    this.muteButton.setAttribute("aria-label", "Slå lyd av eller på");
    this.muteButton.setAttribute("aria-pressed", "false");
    this.muteButton.addEventListener("click", () => {
      this.game?.toggleMute();
    });

    actions.append(this.pauseButton, this.muteButton);

    hud.append(metricGroup, actions);
    this.wrapper.appendChild(hud);
    return hud;
  }

  #createMetric(label, value) {
    const metric = document.createElement("div");
    metric.className = "gk-metric";
    metric.innerHTML = `
      <span class="gk-metric__label">${label}</span>
      <span class="gk-metric__value">${value}</span>
    `;
    return metric;
  }

  #selectAvatar(button, group) {
    group.querySelectorAll(".gk-avatar-option").forEach((el) => {
      el.classList.remove("selected");
      el.setAttribute("aria-checked", "false");
    });
    button.classList.add("selected");
    button.setAttribute("aria-checked", "true");
  }
}

class GKGame {
  constructor(canvas, ui, highscoreClient) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.width = 960;
    this.height = 540;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.ui = ui;
    this.highscores = highscoreClient || null;
    this.state = STATES.IDLE;
    this.selectedAvatar = null;

    this.pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.lastJumpAt = 0;
    this.jumpCooldownMs = 130;
    this.lastPointerAt = 0;
    this.pointerCooldownMs = 160;

    this.gravity = 2800;
    this.jumpVelocity = -1200;
    this.baseSpeed = 360;
    this.extraSpeed = 280;
    this.spawnIntervalBase = 1.4;
    this.spawnIntervalMin = 0.55;
    this.spawnTimer = 0;

    this.runner = this.#createRunner();
    this.obstacles = [];
    this.obstaclePool = [];
    this.parallaxLayers = [
      { speedFactor: 0.25, height: this.height * 0.42, color: "#d4e7ff", offset: 0 },
      { speedFactor: 0.4, height: this.height * 0.32, color: "#b4d2f7", offset: 0 },
      { speedFactor: 0.65, height: this.height * 0.18, color: "#8fb3dd", offset: 0 },
    ];

    this.elapsed = 0;
    this.score = 0;
    this.bestScore = Number(localStorage.getItem(STORAGE_KEYS.bestScore) || 0);
    this.muted = localStorage.getItem(STORAGE_KEYS.mute) === "true";

    this.scaleX = 1;
    this.scaleY = 1;

    this.lastTimestamp = undefined;
    this.boundLoop = this.#loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.boundLoop);

    this.keyHandler = this.#handleKeydown.bind(this);
    this.pointerHandler = this.#handlePointer.bind(this);
    document.addEventListener("keydown", this.keyHandler);
    this.canvas.addEventListener("pointerdown", this.pointerHandler);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrameId);
    document.removeEventListener("keydown", this.keyHandler);
    this.canvas.removeEventListener("pointerdown", this.pointerHandler);
  }

  setAvatar(avatar) {
    this.selectedAvatar = avatar;
    this.runner.avatar = avatar;
    this.ui.updateScore(this.score, this.bestScore, avatar);
    this.ui.persistAvatar(avatar.id);
  }

  start() {
    if (!this.selectedAvatar) {
      return;
    }
    this.#resetRun();
    this.state = STATES.RUNNING;
    this.ui.updatePause(false);
    this.ui.updateMute(this.muted);
  }

  restart() {
    this.start();
  }

  togglePause() {
    if (this.state === STATES.RUNNING) {
      this.state = STATES.PAUSED;
      this.ui.updatePause(true);
    } else if (this.state === STATES.PAUSED) {
      this.state = STATES.RUNNING;
      this.ui.updatePause(false);
      this.lastTimestamp = undefined;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEYS.mute, this.muted ? "true" : "false");
    this.ui.updateMute(this.muted);
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetWidth = rect.width || this.canvas.clientWidth || this.width;
    const targetHeight = rect.height || (targetWidth * (this.height / this.width));

    this.canvas.width = Math.max(1, Math.round(targetWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(targetHeight * dpr));

    this.pixelRatio = dpr;
    this.scaleX = targetWidth / this.width;
    this.scaleY = targetHeight / this.height;
  }

  jump() {
    if (this.state !== STATES.RUNNING) {
      return;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastJumpAt < this.jumpCooldownMs) {
      return;
    }
    if (!this.runner.isGrounded) {
      return;
    }
    this.lastJumpAt = now;
    this.runner.velocityY = this.jumpVelocity;
    this.runner.isGrounded = false;
  }

  #resetRun() {
    if (this.obstacles.length) {
      this.obstacles.forEach((obstacle) => this.#releaseObstacle(obstacle));
      this.obstacles.length = 0;
    }

    this.runner = this.#createRunner();
    this.runner.avatar = this.selectedAvatar;
    this.parallaxLayers.forEach((layer) => {
      layer.offset = 0;
    });
    this.elapsed = 0;
    this.score = 0;
    this.spawnTimer = 0.8;
    this.lastTimestamp = undefined;
    this.lastJumpAt = 0;
    this.lastPointerAt = 0;
    this.ui.updateScore(0, this.bestScore, this.selectedAvatar);
  }

  #createRunner() {
    const height = 88;
    const width = 64;
    const groundLine = this.height - 78;
    return {
      x: this.width * 0.18,
      y: groundLine - height,
      width,
      height,
      velocityY: 0,
      isGrounded: true,
      avatar: null,
      groundLine,
    };
  }

  #loop(timestamp) {
    this.animationFrameId = requestAnimationFrame(this.boundLoop);
    if (this.state === STATES.PAUSED || this.state === STATES.IDLE) {
      this.#render();
      this.lastTimestamp = timestamp;
      return;
    }

    if (this.lastTimestamp === undefined) {
      this.lastTimestamp = timestamp;
      this.#render();
      return;
    }

    const delta = clamp((timestamp - this.lastTimestamp) / 1000, 0, 0.08);
    this.lastTimestamp = timestamp;

    if (this.state === STATES.RUNNING) {
      this.#update(delta);
    }

    this.#render();
  }

  #update(delta) {
    this.elapsed += delta;
    const difficulty = difficultyAt(this.elapsed);
    const speed = this.baseSpeed + this.extraSpeed * difficulty;

    this.#updateRunner(delta);
    this.#updateParallax(delta, speed);
    this.#updateObstacles(delta, speed, difficulty);

    this.score += speed * delta * 0.12;
    this.ui.updateScore(this.score, this.bestScore, this.selectedAvatar);

    if (this.#checkCollisions()) {
      this.#handleGameOver();
    }
  }

  #updateRunner(delta) {
    const runner = this.runner;
    runner.velocityY += this.gravity * delta;
    runner.y += runner.velocityY * delta;
    if (runner.y >= runner.groundLine - runner.height) {
      runner.y = runner.groundLine - runner.height;
      runner.velocityY = 0;
      runner.isGrounded = true;
    }
  }

  #updateParallax(delta, speed) {
    this.parallaxLayers.forEach((layer, index) => {
      const layerSpeed = speed * layer.speedFactor;
      layer.offset = (layer.offset + layerSpeed * delta) % this.width;
      if (layer.offset < 0) {
        layer.offset += this.width;
      }
      // Variere høyde litt for visuell variasjon
      const wave = Math.sin((this.elapsed + index) * 0.5) * 4;
      layer.dynamicHeight = layer.height + wave;
    });
  }

  #updateObstacles(delta, speed, difficulty) {
    this.spawnTimer -= delta * (1 + difficulty * 0.45);
    if (this.spawnTimer <= 0) {
      this.#spawnObstacle(difficulty, speed);
    }

    let writeIndex = 0;
    for (let i = 0; i < this.obstacles.length; i += 1) {
      const obstacle = this.obstacles[i];
      const speedFactor = obstacle.speedFactor ?? 1;
      obstacle.x -= speed * speedFactor * delta;
      if (obstacle.isPit) {
        obstacle.depth = lerp(obstacle.depth ?? 14, 18 + difficulty * 14, 0.1);
      }

      if (obstacle.x + obstacle.width > -120) {
        this.obstacles[writeIndex++] = obstacle;
      } else {
        this.#releaseObstacle(obstacle);
      }
    }
    this.obstacles.length = writeIndex;
  }

  #acquireObstacle() {
    if (this.obstaclePool.length > 0) {
      return this.obstaclePool.pop();
    }
    return {
      type: null,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      color: "#000",
      label: "",
      isPit: false,
      speedFactor: 1,
      depth: 0,
    };
  }

  #releaseObstacle(obstacle) {
    obstacle.type = null;
    obstacle.width = 0;
    obstacle.height = 0;
    obstacle.x = 0;
    obstacle.y = 0;
    obstacle.color = "#000";
    obstacle.label = "";
    obstacle.isPit = false;
    obstacle.speedFactor = 1;
    obstacle.depth = 0;
    this.obstaclePool.push(obstacle);
  }

  #spawnObstacle(difficulty, speed) {
    const eligible = OBSTACLE_TYPES.filter((type) => difficulty >= type.minDifficulty - 0.001);
    const pool = eligible.length ? eligible : OBSTACLE_TYPES;
    const type = pool[Math.floor(Math.random() * pool.length)];

    const width = randomRange(type.width[0], type.width[1]);
    const height = randomRange(type.height[0], type.height[1]);
    const obstacle = this.#acquireObstacle();
    obstacle.type = type;
    obstacle.width = width;
    obstacle.height = height;
    obstacle.x = this.width + randomRange(60, 200);
    obstacle.y = this.runner.groundLine - height;
    obstacle.color = type.color;
    obstacle.label = type.label;
    obstacle.isPit = Boolean(type.isPit);
    obstacle.speedFactor = lerp(1, 1.25, difficulty);

    if (obstacle.isPit) {
      obstacle.y = this.runner.groundLine - 16;
      obstacle.height = randomRange(12, 22);
      obstacle.depth = randomRange(18, 32);
    } else {
      obstacle.depth = 0;
    }

    this.obstacles.push(obstacle);

    const intervalBase = this.spawnIntervalBase - (this.spawnIntervalBase - this.spawnIntervalMin) * difficulty;
    const randomOffset = randomRange(-0.25, 0.45);
    this.spawnTimer = clamp(intervalBase + randomOffset, this.spawnIntervalMin * 0.5, this.spawnIntervalBase + 0.6);
  }

  #checkCollisions() {
    const runner = this.runner;
    return this.obstacles.some((obstacle) => {
      if (obstacle.isPit) {
        const pitLeft = obstacle.x;
        const pitRight = obstacle.x + obstacle.width;
        const runnerFeet = runner.y + runner.height;
        const runnerFront = runner.x + runner.width;
        const runnerBack = runner.x;
        if (runnerFeet >= runner.groundLine - obstacle.depth) {
          const overlapX = runnerFront > pitLeft && runnerBack < pitRight;
          if (overlapX && runnerFeet >= runner.groundLine - 6) {
            return true;
          }
        }
        return false;
      }

      const runnerLeft = runner.x + 14;
      const runnerRight = runner.x + runner.width - 12;
      const runnerTop = runner.y + 6;
      const runnerBottom = runner.y + runner.height;

      const obstacleLeft = obstacle.x;
      const obstacleRight = obstacle.x + obstacle.width;
      const obstacleTop = obstacle.y;
      const obstacleBottom = obstacle.y + obstacle.height;

      const horizontalOverlap = runnerLeft < obstacleRight && runnerRight > obstacleLeft;
      const verticalOverlap = runnerBottom > obstacleTop + 6 && runnerTop < obstacleBottom;
      return horizontalOverlap && verticalOverlap;
    });
  }

  #handleGameOver() {
    this.state = STATES.GAME_OVER;
    this.#updateBestScore();
    this.ui.updateScore(this.score, this.bestScore, this.selectedAvatar);
    const scoreInt = Math.max(0, Math.floor(this.score));
    this.#presentGameOver(scoreInt);
  }

  #presentGameOver(scoreInt) {
    if (!this.ui) {
      return;
    }

    if (!this.highscores) {
      this.ui.showGameOver({
        score: this.score,
        bestScore: this.bestScore,
        scoreboard: [],
        qualifies: false,
        onRestart: () => this.restart(),
        onSubmit: null,
        errorMessage: "Topplisten er ikke tilgjengelig i denne økten.",
        highlightId: null,
      });
      return;
    }

    this.highscores
      .list()
      .then((entries) => {
        const qualifies = this.#doesQualify(entries, scoreInt);
        this.ui.showGameOver({
          score: this.score,
          bestScore: this.bestScore,
          scoreboard: entries,
          qualifies,
          onRestart: () => this.restart(),
          onSubmit: qualifies
            ? async (name) => {
                const response = await this.highscores.submit(name, scoreInt);
                return response;
              }
            : null,
          errorMessage: null,
          highlightId: null,
        });
      })
      .catch((error) => {
        console.warn("GK-Spillet: klarte ikke å hente highscore-listen", error);
        this.ui.showGameOver({
          score: this.score,
          bestScore: this.bestScore,
          scoreboard: [],
          qualifies: false,
          onRestart: () => this.restart(),
          onSubmit: null,
          errorMessage: "Kunne ikke hente topplisten akkurat nå.",
          highlightId: null,
        });
      });
  }

  #doesQualify(entries, scoreInt) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return true;
    }
    if (entries.length < HIGHSCORE_LIMIT) {
      return true;
    }
    const last = entries[entries.length - 1];
    if (!last || typeof last.score !== "number") {
      return true;
    }
    return scoreInt >= last.score;
  }

  #updateBestScore() {
    const scoreInt = Math.max(0, Math.floor(this.score));
    if (scoreInt > this.bestScore) {
      this.bestScore = scoreInt;
      localStorage.setItem(STORAGE_KEYS.bestScore, String(this.bestScore));
    }
  }

  #render() {
    this.#prepareCanvas();
    this.#drawBackground();
    this.#drawParallax();
    this.#drawGround();
    this.#drawObstacles();
    this.#drawRunner();
  }

  #prepareCanvas() {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(this.scaleX * this.pixelRatio, 0, 0, this.scaleY * this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  #drawBackground() {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(this.scaleX * this.pixelRatio, 0, 0, this.scaleY * this.pixelRatio, 0, 0);
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#cce6ff");
    gradient.addColorStop(1, "#f5fbff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  #drawParallax() {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(this.scaleX * this.pixelRatio, 0, 0, this.scaleY * this.pixelRatio, 0, 0);
    this.parallaxLayers.forEach((layer) => {
      ctx.fillStyle = layer.color;
      const height = layer.dynamicHeight ?? layer.height;
      const y = this.runner.groundLine - height - 32;
      const width = this.width;

      ctx.beginPath();
      ctx.moveTo(-layer.offset, y + height);
      ctx.lineTo(-layer.offset, y + height * 0.35);
      ctx.bezierCurveTo(
        width * 0.15 - layer.offset,
        y + height * 0.05,
        width * 0.35 - layer.offset,
        y + height * 0.4,
        width * 0.5 - layer.offset,
        y + height * 0.25,
      );
      ctx.bezierCurveTo(
        width * 0.7 - layer.offset,
        y + height * 0.05,
        width * 0.88 - layer.offset,
        y + height * 0.3,
        width - layer.offset,
        y + height * 0.12,
      );
      ctx.lineTo(width - layer.offset, y + height);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(width - layer.offset, y + height);
      ctx.lineTo(width * 2 - layer.offset, y + height * 0.4);
      ctx.lineTo(width * 2 - layer.offset, y + height);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  #drawGround() {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(this.scaleX * this.pixelRatio, 0, 0, this.scaleY * this.pixelRatio, 0, 0);
    const horizon = this.runner.groundLine + 8;
    ctx.fillStyle = "#9ec3a8";
    ctx.fillRect(0, horizon, this.width, this.height - horizon);

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    const segmentWidth = 48;
    let offset = (this.elapsed * 120) % segmentWidth;
    for (let x = -offset; x < this.width + segmentWidth; x += segmentWidth) {
      ctx.beginPath();
      ctx.moveTo(x, horizon);
      ctx.lineTo(x + segmentWidth / 2, horizon + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawObstacles() {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(this.scaleX * this.pixelRatio, 0, 0, this.scaleY * this.pixelRatio, 0, 0);
    this.obstacles.forEach((obstacle) => {
      if (obstacle.isPit) {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height + 4);
        const gradient = ctx.createLinearGradient(0, obstacle.y, 0, obstacle.y + obstacle.depth);
        gradient.addColorStop(0, "rgba(0,0,0,0.55)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.depth);
        return;
      }
      ctx.fillStyle = obstacle.color;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(obstacle.x + 8, obstacle.y + 8, Math.max(12, obstacle.width * 0.25), obstacle.height - 16);
    });
    ctx.restore();
  }

  #drawRunner() {
    const ctx = this.context;
    ctx.save();
    ctx.setTransform(this.scaleX * this.pixelRatio, 0, 0, this.scaleY * this.pixelRatio, 0, 0);

    const runner = this.runner;
    const avatar = runner.avatar;
    const baseColor = avatar?.colors.primary ?? "#1f7a8c";
    const accentColor = avatar?.colors.accent ?? "#a9def9";

    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.roundRect(runner.x, runner.y, runner.width, runner.height, 16);
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(runner.x + 14, runner.y + 18, runner.width - 28, runner.height * 0.45, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.roundRect(runner.x + 6, runner.y + runner.height - 20, runner.width - 12, 18, 8);
    ctx.fill();

    const bounce = runner.isGrounded ? 0 : Math.sin(this.elapsed * 12) * 4;
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(runner.x + runner.width / 2, runner.y - 14 + bounce, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  #handleKeydown(event) {
    if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      if (this.state === STATES.IDLE) {
        this.start();
      } else if (this.state === STATES.GAME_OVER) {
        this.restart();
      } else {
        this.jump();
      }
      return;
    }

    if (event.code === "KeyP") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      this.togglePause();
      return;
    }

    if (event.code === "KeyM") {
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      this.toggleMute();
      return;
    }

    if (event.code === "Enter" && this.state === STATES.GAME_OVER) {
      event.preventDefault();
      this.restart();
    }
  }

  #handlePointer(event) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.state === STATES.RUNNING && now - this.lastPointerAt < this.pointerCooldownMs) {
      return;
    }
    this.lastPointerAt = now;
    if (this.state === STATES.GAME_OVER) {
      this.restart();
      return;
    }
    if (this.state === STATES.IDLE) {
      this.start();
      return;
    }
    this.jump();
  }
}

function initializeGame() {
  const canvas = document.getElementById("gk-spill-canvas");
  const container = document.getElementById("gk-spill-container");
  const wrapper = document.getElementById("gk-spill-canvas-wrapper");

  if (!canvas || !container || !wrapper) {
    console.warn("GK-Spillet: fant ikke nødvendig DOM");
    return;
  }

  const ui = new GKSpillUI(container, wrapper);
  const highscoreClient = new HighscoreClient("/spill/api");
  const game = new GKGame(canvas, ui, highscoreClient);
  ui.attachGame(game);

  const storedAvatarId = ui.getStoredAvatarId();
  const defaultAvatar = AVATARS.find((avatar) => avatar.id === storedAvatarId) || AVATARS[0];
  game.setAvatar(defaultAvatar);
  ui.updateMute(game.muted);
  ui.updatePause(false);

  ui.showStartScreen(
    AVATARS,
    defaultAvatar?.id,
    (selectedId) => {
      const avatar = AVATARS.find((item) => item.id === selectedId);
      if (avatar) {
        game.setAvatar(avatar);
      }
    },
    () => {
      game.start();
    }
  );

  window.addEventListener("resize", () => game.resizeCanvas());
  window.addEventListener("orientationchange", () => game.resizeCanvas());
  game.resizeCanvas();
}

document.addEventListener("DOMContentLoaded", initializeGame);
