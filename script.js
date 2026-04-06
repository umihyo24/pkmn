// Tunable values are centralized here.
const CONFIG = {
  canvas: { width: 640, height: 448 },
  tileSize: 32,
  mapCols: 20,
  mapRows: 14,
  moveCooldownMs: 90,
  encounter: {
    chanceOnGrassMove: 0.18,
    cooldownMoves: 4,
  },
  battle: {
    runSuccessRate: 0.45,
    guardMultiplier: 0.45,
    captureBaseChance: 0.2,
    captureLowHpBonus: 0.6,
    captureGoalUnique: 2,
  },
  moves: {
    strike: { name: "Strike", power: 1, accuracy: 0.95, guard: false },
    heavy: { name: "Heavy Hit", power: 1.45, accuracy: 0.68, guard: false },
    guard: { name: "Guard", power: 0, accuracy: 1, guard: true },
  },
  monsters: {
    starter: "emberfin",
    entries: {
      emberfin: {
        key: "emberfin",
        name: "Emberfin",
        maxHp: 34,
        attack: 11,
        defense: 8,
        sprite: "monster_emberfin",
        moves: ["strike", "heavy", "guard"],
      },
      mossbite: {
        key: "mossbite",
        name: "Mossbite",
        maxHp: 32,
        attack: 10,
        defense: 9,
        sprite: "monster_mossbite",
        moves: ["strike", "guard"],
      },
      voltwig: {
        key: "voltwig",
        name: "Voltwig",
        maxHp: 28,
        attack: 12,
        defense: 7,
        sprite: "monster_voltwig",
        moves: ["strike", "heavy"],
      },
      pebloop: {
        key: "pebloop",
        name: "Pebloop",
        maxHp: 36,
        attack: 9,
        defense: 10,
        sprite: "monster_pebloop",
        moves: ["strike", "guard"],
      },
    },
    wildPool: ["mossbite", "voltwig", "pebloop"],
  },
};

// Asset references are centralized; game works even if files are missing.
const ASSETS = {
  images: {
    player: "assets/player.png",
    grass: "assets/grass.png",
    ground: "assets/ground.png",
    rock: "assets/rock.png",
    monster_emberfin: "assets/monster_emberfin.png",
    monster_mossbite: "assets/monster_mossbite.png",
    monster_voltwig: "assets/monster_voltwig.png",
    monster_pebloop: "assets/monster_pebloop.png",
  },
};

const TILE = {
  GROUND: 0,
  GRASS: 1,
  ROCK: 2,
};

const DOM = {
  canvas: document.getElementById("game-canvas"),
  startScreen: document.getElementById("start-screen"),
  hud: document.getElementById("hud"),
  battlePanel: document.getElementById("battle-panel"),
  endScreen: document.getElementById("end-screen"),
  startBtn: document.getElementById("start-btn"),
  restartBtn: document.getElementById("restart-btn"),
  moveStrikeBtn: document.getElementById("move-strike-btn"),
  moveHeavyBtn: document.getElementById("move-heavy-btn"),
  moveGuardBtn: document.getElementById("move-guard-btn"),
  captureBtn: document.getElementById("capture-btn"),
  runBtn: document.getElementById("run-btn"),
  hudHp: document.getElementById("hud-hp"),
  hudMaxHp: document.getElementById("hud-max-hp"),
  hudCaptured: document.getElementById("hud-captured"),
  hudMonsterName: document.getElementById("hud-monster-name"),
  enemyName: document.getElementById("enemy-name"),
  enemyHp: document.getElementById("enemy-hp"),
  enemyMaxHp: document.getElementById("enemy-max-hp"),
  playerName: document.getElementById("player-name"),
  playerHp: document.getElementById("player-hp"),
  playerMaxHp: document.getElementById("player-max-hp"),
  battleLog: document.getElementById("battle-log"),
  endTitle: document.getElementById("end-title"),
  endMessage: document.getElementById("end-message"),
};

const ctx = DOM.canvas.getContext("2d");
DOM.canvas.width = CONFIG.canvas.width;
DOM.canvas.height = CONFIG.canvas.height;

// Single source of truth for all mutable state.
const gameState = {
  phase: "start",
  keysDown: {},
  moveTimer: 0,
  encounterCooldown: 0,
  map: createMap(),
  player: {
    x: 2,
    y: 2,
  },
  playerMonster: createMonsterInstance(CONFIG.monsters.starter),
  collection: [],
  battle: {
    enemy: null,
    log: [],
    guardActive: false,
    actionLocked: false,
  },
  assets: {
    images: {},
  },
};

function createImageAsset(src) {
  const img = new Image();
  const asset = { img, loaded: false, failed: false };
  img.onload = () => {
    asset.loaded = true;
  };
  img.onerror = () => {
    asset.failed = true;
  };
  img.src = src;
  return asset;
}

function loadAssets() {
  Object.entries(ASSETS.images).forEach(([key, src]) => {
    gameState.assets.images[key] = createImageAsset(src);
  });
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
  return items[randInt(0, items.length - 1)];
}

function createMap() {
  const rows = [];
  for (let y = 0; y < CONFIG.mapRows; y += 1) {
    const row = [];
    for (let x = 0; x < CONFIG.mapCols; x += 1) {
      if (x === 0 || y === 0 || x === CONFIG.mapCols - 1 || y === CONFIG.mapRows - 1) {
        row.push(TILE.ROCK);
      } else if ((x > 4 && x < 11 && y > 2 && y < 6) || (x > 10 && x < 18 && y > 8 && y < 12)) {
        row.push(TILE.GRASS);
      } else {
        row.push(TILE.GROUND);
      }
    }
    rows.push(row);
  }
  return rows;
}

function createMonsterInstance(monsterKey) {
  const base = CONFIG.monsters.entries[monsterKey];
  return {
    key: base.key,
    name: base.name,
    sprite: base.sprite,
    maxHp: base.maxHp,
    hp: base.maxHp,
    attack: base.attack,
    defense: base.defense,
    moves: [...base.moves],
  };
}

function createWildMonster() {
  return createMonsterInstance(randomChoice(CONFIG.monsters.wildPool));
}

function getTileAt(x, y) {
  return gameState.map[y]?.[x] ?? TILE.ROCK;
}

function isWalkable(x, y) {
  return getTileAt(x, y) !== TILE.ROCK;
}

function uniqueCaptureCount() {
  const keys = new Set(gameState.collection.map((m) => m.key));
  return keys.size;
}

function pushBattleLog(message) {
  gameState.battle.log.push(message);
  if (gameState.battle.log.length > 7) {
    gameState.battle.log.shift();
  }
}

function startBattle() {
  gameState.battle.enemy = createWildMonster();
  gameState.battle.log = [];
  gameState.battle.guardActive = false;
  gameState.battle.actionLocked = false;
  pushBattleLog(`野生の ${gameState.battle.enemy.name} が現れた！`);
  gameState.phase = "battle";
}

function leaveBattle() {
  gameState.phase = "playing";
  gameState.battle.enemy = null;
  gameState.battle.log = [];
  gameState.battle.guardActive = false;
  gameState.battle.actionLocked = false;
}

function startGame() {
  gameState.phase = "playing";
  gameState.player.x = 2;
  gameState.player.y = 2;
  gameState.encounterCooldown = 0;
  gameState.playerMonster = createMonsterInstance(CONFIG.monsters.starter);
  gameState.collection = [];
  leaveBattle();
}

function endGame(cleared) {
  gameState.phase = "gameover";
  DOM.endTitle.textContent = cleared ? "Clear!" : "Game Over";
  DOM.endMessage.textContent = cleared
    ? `捕獲成功！ ${uniqueCaptureCount()} 種類を集めた。`
    : "アクティブモンスターが戦闘不能になった。再挑戦しよう。";
}

function tryMovePlayer(dx, dy) {
  const nx = gameState.player.x + dx;
  const ny = gameState.player.y + dy;
  if (!isWalkable(nx, ny)) return false;
  gameState.player.x = nx;
  gameState.player.y = ny;
  return true;
}

function tryEncounterAfterMove() {
  if (getTileAt(gameState.player.x, gameState.player.y) !== TILE.GRASS) return;

  if (gameState.encounterCooldown > 0) {
    gameState.encounterCooldown -= 1;
    return;
  }

  if (Math.random() < CONFIG.encounter.chanceOnGrassMove) {
    gameState.encounterCooldown = CONFIG.encounter.cooldownMoves;
    startBattle();
  }
}

function doesMoveHit(moveKey) {
  const move = CONFIG.moves[moveKey];
  return Math.random() <= move.accuracy;
}

function computeDamage(attacker, defender, moveKey, guarded) {
  const move = CONFIG.moves[moveKey];
  const variance = randInt(85, 100) / 100;
  const raw = Math.max(1, Math.floor((attacker.attack * move.power - defender.defense * 0.45) * variance));
  return guarded ? Math.max(1, Math.floor(raw * CONFIG.battle.guardMultiplier)) : raw;
}

function computeCaptureChance(enemy) {
  const missingRatio = (enemy.maxHp - enemy.hp) / enemy.maxHp;
  return Math.min(0.95, CONFIG.battle.captureBaseChance + missingRatio * CONFIG.battle.captureLowHpBonus);
}

function collectMonster(monster) {
  const exists = gameState.collection.some((m) => m.key === monster.key);
  if (!exists) {
    gameState.collection.push({ key: monster.key, name: monster.name });
    return true;
  }
  return false;
}

function afterBattleWinCheck() {
  if (uniqueCaptureCount() >= CONFIG.battle.captureGoalUnique) {
    endGame(true);
  } else {
    leaveBattle();
  }
}

function processEnemyTurn() {
  const enemy = gameState.battle.enemy;
  if (!enemy || gameState.phase !== "battle") return;

  const moveKey = randomChoice(enemy.moves);
  const move = CONFIG.moves[moveKey];

  if (move.guard) {
    pushBattleLog(`${enemy.name} は身構えている…`);
    return;
  }

  if (!doesMoveHit(moveKey)) {
    pushBattleLog(`${enemy.name} の ${move.name} は外れた！`);
    return;
  }

  const damage = computeDamage(enemy, gameState.playerMonster, moveKey, gameState.battle.guardActive);
  gameState.playerMonster.hp = Math.max(0, gameState.playerMonster.hp - damage);
  pushBattleLog(`${enemy.name} の ${move.name}！ ${damage} ダメージ。`);

  if (gameState.playerMonster.hp <= 0) {
    endGame(false);
  }
}

function useMove(moveKey) {
  if (gameState.phase !== "battle" || gameState.battle.actionLocked) return;

  const enemy = gameState.battle.enemy;
  const move = CONFIG.moves[moveKey];
  gameState.battle.guardActive = false;

  if (move.guard) {
    gameState.battle.guardActive = true;
    pushBattleLog(`${gameState.playerMonster.name} はガード態勢！`);
    processEnemyTurn();
    gameState.battle.guardActive = false;
    return;
  }

  if (!doesMoveHit(moveKey)) {
    pushBattleLog(`${gameState.playerMonster.name} の ${move.name} は外れた！`);
    processEnemyTurn();
    return;
  }

  const damage = computeDamage(gameState.playerMonster, enemy, moveKey, false);
  enemy.hp = Math.max(0, enemy.hp - damage);
  pushBattleLog(`${gameState.playerMonster.name} の ${move.name}！ ${damage} ダメージ。`);

  if (enemy.hp <= 0) {
    pushBattleLog(`${enemy.name} を倒した。`);
    leaveBattle();
    return;
  }

  processEnemyTurn();
}

function tryCapture() {
  if (gameState.phase !== "battle" || gameState.battle.actionLocked) return;

  const enemy = gameState.battle.enemy;
  const chance = computeCaptureChance(enemy);
  const success = Math.random() < chance;

  if (success) {
    const isNew = collectMonster(enemy);
    pushBattleLog(`Capture Orb 成功！ ${enemy.name} を捕獲した。`);
    if (!isNew) {
      pushBattleLog("既に図鑑登録済みのモンスターだった。");
    }
    afterBattleWinCheck();
    return;
  }

  pushBattleLog("Capture Orb は弾かれた！");
  processEnemyTurn();
}

function tryRun() {
  if (gameState.phase !== "battle" || gameState.battle.actionLocked) return;

  if (Math.random() < CONFIG.battle.runSuccessRate) {
    pushBattleLog("無事に離脱した。\n");
    leaveBattle();
    return;
  }

  pushBattleLog("離脱失敗！");
  processEnemyTurn();
}

// Pure logic update step.
function update(deltaMs) {
  if (gameState.phase !== "playing") return;

  gameState.moveTimer += deltaMs;
  if (gameState.moveTimer < CONFIG.moveCooldownMs) {
    return;
  }
  gameState.moveTimer = 0;

  const up = gameState.keysDown.ArrowUp || gameState.keysDown.KeyW;
  const down = gameState.keysDown.ArrowDown || gameState.keysDown.KeyS;
  const left = gameState.keysDown.ArrowLeft || gameState.keysDown.KeyA;
  const right = gameState.keysDown.ArrowRight || gameState.keysDown.KeyD;

  let moved = false;
  if (up) moved = tryMovePlayer(0, -1);
  else if (down) moved = tryMovePlayer(0, 1);
  else if (left) moved = tryMovePlayer(-1, 0);
  else if (right) moved = tryMovePlayer(1, 0);

  if (moved) {
    tryEncounterAfterMove();
  }
}

function drawFallbackTile(type, x, y, size) {
  if (type === TILE.GROUND) {
    ctx.fillStyle = "#4ea66b";
    ctx.fillRect(x, y, size, size);
  } else if (type === TILE.GRASS) {
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#57b65f";
    ctx.fillRect(x + 4, y + 4, 5, 5);
    ctx.fillRect(x + 17, y + 10, 4, 8);
    ctx.fillRect(x + 10, y + 20, 6, 6);
  } else {
    ctx.fillStyle = "#616161";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#757575";
    ctx.fillRect(x + 5, y + 5, 8, 8);
  }
}

function drawImageWithFallback(assetKey, x, y, width, height, fallbackFn) {
  const asset = gameState.assets.images[assetKey];
  if (asset && asset.loaded && !asset.failed) {
    ctx.drawImage(asset.img, x, y, width, height);
  } else {
    fallbackFn();
  }
}

function drawPlayer(x, y, size) {
  drawImageWithFallback("player", x, y, size, size, () => {
    ctx.fillStyle = "#ffcf56";
    ctx.fillRect(x + 8, y + 4, 16, 24);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(x + 10, y + 8, 3, 3);
    ctx.fillRect(x + 19, y + 8, 3, 3);
  });
}

function drawMonsterFallback(monsterKey, x, y, width, height, facingLeft) {
  const styles = {
    emberfin: { body: "#f3722c", accent: "#ffe066" },
    mossbite: { body: "#43aa8b", accent: "#90be6d" },
    voltwig: { body: "#577590", accent: "#f9c74f" },
    pebloop: { body: "#7d8597", accent: "#adb5bd" },
  };
  const style = styles[monsterKey] || { body: "#888", accent: "#ddd" };
  const dir = facingLeft ? -1 : 1;

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.scale(dir, 1);
  ctx.translate(-(x + width / 2), -(y + height / 2));

  ctx.fillStyle = style.body;
  ctx.fillRect(x + 16, y + 20, width - 32, height - 30);
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  ctx.arc(x + width / 2, y + 18, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(x + width / 2 + 4, y + 14, 5, 5);

  ctx.restore();
}

function drawMonsterSprite(monster, x, y, width, height, facingLeft = false) {
  drawImageWithFallback(monster.sprite, x, y, width, height, () => {
    drawMonsterFallback(monster.key, x, y, width, height, facingLeft);
  });
}

function drawFieldMap() {
  const ts = CONFIG.tileSize;
  for (let y = 0; y < CONFIG.mapRows; y += 1) {
    for (let x = 0; x < CONFIG.mapCols; x += 1) {
      const tile = gameState.map[y][x];
      const px = x * ts;
      const py = y * ts;
      if (tile === TILE.GROUND) {
        drawImageWithFallback("ground", px, py, ts, ts, () => drawFallbackTile(TILE.GROUND, px, py, ts));
      } else if (tile === TILE.GRASS) {
        drawImageWithFallback("grass", px, py, ts, ts, () => drawFallbackTile(TILE.GRASS, px, py, ts));
      } else {
        drawImageWithFallback("rock", px, py, ts, ts, () => drawFallbackTile(TILE.ROCK, px, py, ts));
      }
    }
  }
}

function drawBattleBackdrop() {
  ctx.fillStyle = "rgba(3, 13, 23, 0.65)";
  ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

  ctx.fillStyle = "#2a9d8f";
  ctx.beginPath();
  ctx.ellipse(150, 294, 110, 40, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6d6875";
  ctx.beginPath();
  ctx.ellipse(470, 166, 110, 40, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBattleMonsters() {
  const enemy = gameState.battle.enemy;
  if (!enemy) return;

  drawMonsterSprite(enemy, 390, 80, 160, 140, true);
  drawMonsterSprite(gameState.playerMonster, 60, 210, 180, 160, false);
}

// Rendering step: visual updates only.
function render() {
  ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
  drawFieldMap();
  drawPlayer(gameState.player.x * CONFIG.tileSize, gameState.player.y * CONFIG.tileSize, CONFIG.tileSize);

  if (gameState.phase === "battle") {
    drawBattleBackdrop();
    drawBattleMonsters();
  }

  DOM.hudMonsterName.textContent = gameState.playerMonster.name;
  DOM.hudHp.textContent = gameState.playerMonster.hp;
  DOM.hudMaxHp.textContent = gameState.playerMonster.maxHp;
  DOM.hudCaptured.textContent = uniqueCaptureCount();

  const isStart = gameState.phase === "start";
  const isPlaying = gameState.phase === "playing";
  const isBattle = gameState.phase === "battle";
  const isGameOver = gameState.phase === "gameover";

  DOM.startScreen.classList.toggle("hidden", !isStart);
  DOM.startScreen.classList.toggle("active", isStart);
  DOM.hud.classList.toggle("hidden", !(isPlaying || isBattle));
  DOM.battlePanel.classList.toggle("hidden", !isBattle);
  DOM.endScreen.classList.toggle("hidden", !isGameOver);

  const actionsEnabled = isBattle && !gameState.battle.actionLocked;
  DOM.moveStrikeBtn.disabled = !actionsEnabled;
  DOM.moveHeavyBtn.disabled = !actionsEnabled;
  DOM.moveGuardBtn.disabled = !actionsEnabled;
  DOM.captureBtn.disabled = !actionsEnabled;
  DOM.runBtn.disabled = !actionsEnabled;

  if (isBattle && gameState.battle.enemy) {
    DOM.enemyName.textContent = gameState.battle.enemy.name;
    DOM.enemyHp.textContent = gameState.battle.enemy.hp;
    DOM.enemyMaxHp.textContent = gameState.battle.enemy.maxHp;
    DOM.playerName.textContent = gameState.playerMonster.name;
    DOM.playerHp.textContent = gameState.playerMonster.hp;
    DOM.playerMaxHp.textContent = gameState.playerMonster.maxHp;
    DOM.battleLog.textContent = gameState.battle.log.join("\n");
  }
}

let lastTs = 0;
function loop(ts) {
  const deltaMs = ts - lastTs;
  lastTs = ts;

  update(deltaMs);
  render();

  requestAnimationFrame(loop);
}

function onKeyDown(event) {
  gameState.keysDown[event.code] = true;

  if (event.code === "Enter") {
    if (gameState.phase === "start" || gameState.phase === "gameover") {
      startGame();
    }
  }
}

function onKeyUp(event) {
  delete gameState.keysDown[event.code];
}

function bindEvents() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  DOM.startBtn.addEventListener("click", startGame);
  DOM.restartBtn.addEventListener("click", startGame);
  DOM.moveStrikeBtn.addEventListener("click", () => useMove("strike"));
  DOM.moveHeavyBtn.addEventListener("click", () => useMove("heavy"));
  DOM.moveGuardBtn.addEventListener("click", () => useMove("guard"));
  DOM.captureBtn.addEventListener("click", tryCapture);
  DOM.runBtn.addEventListener("click", tryRun);
}

function init() {
  loadAssets();
  bindEvents();
  requestAnimationFrame(loop);
}

init();
