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
  player: {
    maxHp: 30,
    startX: 2,
    startY: 2,
    damageMin: 4,
    damageMax: 8,
  },
  enemy: {
    hpMin: 14,
    hpMax: 24,
    damageMin: 3,
    damageMax: 7,
    names: ["Mossling", "Nibfox", "Pebblit", "Gloamoth"],
  },
  runSuccessRate: 0.55,
  winsToClear: 3,
};

// Asset references are centralized; game works even if files are missing.
const ASSETS = {
  images: {
    player: "assets/player.png",
    grass: "assets/grass.png",
    ground: "assets/ground.png",
    rock: "assets/rock.png",
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
  fightBtn: document.getElementById("fight-btn"),
  runBtn: document.getElementById("run-btn"),
  hudHp: document.getElementById("hud-hp"),
  hudMaxHp: document.getElementById("hud-max-hp"),
  hudWins: document.getElementById("hud-wins"),
  enemyName: document.getElementById("enemy-name"),
  enemyHp: document.getElementById("enemy-hp"),
  enemyMaxHp: document.getElementById("enemy-max-hp"),
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
  wins: 0,
  encounterCooldown: 0,
  map: createMap(),
  player: {
    x: CONFIG.player.startX,
    y: CONFIG.player.startY,
    hp: CONFIG.player.maxHp,
    maxHp: CONFIG.player.maxHp,
  },
  battle: {
    enemy: null,
    log: [],
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

function getTileAt(x, y) {
  return gameState.map[y]?.[x] ?? TILE.ROCK;
}

function isWalkable(x, y) {
  return getTileAt(x, y) !== TILE.ROCK;
}

function pushBattleLog(message) {
  gameState.battle.log.push(message);
  if (gameState.battle.log.length > 6) {
    gameState.battle.log.shift();
  }
}

function beginBattle() {
  const enemyHp = randInt(CONFIG.enemy.hpMin, CONFIG.enemy.hpMax);
  const enemyName = CONFIG.enemy.names[randInt(0, CONFIG.enemy.names.length - 1)];
  gameState.battle.enemy = {
    name: enemyName,
    hp: enemyHp,
    maxHp: enemyHp,
  };
  gameState.battle.log = [];
  pushBattleLog(`${enemyName} があらわれた！`);
  gameState.phase = "battle";
}

function resetRun() {
  gameState.phase = "playing";
  gameState.battle.enemy = null;
  gameState.battle.log = [];
}

function startGame() {
  gameState.phase = "playing";
  gameState.wins = 0;
  gameState.encounterCooldown = 0;
  gameState.player.x = CONFIG.player.startX;
  gameState.player.y = CONFIG.player.startY;
  gameState.player.hp = gameState.player.maxHp;
  resetRun();
}

function endGame(cleared) {
  gameState.phase = "gameover";
  DOM.endTitle.textContent = cleared ? "Clear!" : "Game Over";
  DOM.endMessage.textContent = cleared
    ? `あなたは ${gameState.wins} 勝して草原を制した！`
    : "力尽きてしまった… もう一度挑戦しよう。";
}

function tryMovePlayer(dx, dy) {
  const nx = gameState.player.x + dx;
  const ny = gameState.player.y + dy;
  if (!isWalkable(nx, ny)) {
    return false;
  }
  gameState.player.x = nx;
  gameState.player.y = ny;
  return true;
}

function tryEncounterAfterMove() {
  const onGrass = getTileAt(gameState.player.x, gameState.player.y) === TILE.GRASS;
  if (!onGrass) return;

  if (gameState.encounterCooldown > 0) {
    gameState.encounterCooldown -= 1;
    return;
  }

  if (Math.random() < CONFIG.encounter.chanceOnGrassMove) {
    gameState.encounterCooldown = CONFIG.encounter.cooldownMoves;
    beginBattle();
  }
}

function resolvePlayerFight() {
  const enemy = gameState.battle.enemy;
  if (!enemy) return;

  const playerDmg = randInt(CONFIG.player.damageMin, CONFIG.player.damageMax);
  enemy.hp = Math.max(0, enemy.hp - playerDmg);
  pushBattleLog(`あなたの攻撃！ ${playerDmg} ダメージ。`);

  if (enemy.hp <= 0) {
    gameState.wins += 1;
    pushBattleLog(`${enemy.name} を倒した！`);
    if (gameState.wins >= CONFIG.winsToClear) {
      endGame(true);
      return;
    }
    resetRun();
    return;
  }

  const enemyDmg = randInt(CONFIG.enemy.damageMin, CONFIG.enemy.damageMax);
  gameState.player.hp = Math.max(0, gameState.player.hp - enemyDmg);
  pushBattleLog(`${enemy.name} の反撃！ ${enemyDmg} ダメージ。`);

  if (gameState.player.hp <= 0) {
    endGame(false);
  }
}

function resolveRunAttempt() {
  const enemy = gameState.battle.enemy;
  if (!enemy) return;

  if (Math.random() < CONFIG.runSuccessRate) {
    pushBattleLog("うまく逃げ切った！");
    resetRun();
    return;
  }

  pushBattleLog("逃走失敗！");
  const enemyDmg = randInt(CONFIG.enemy.damageMin, CONFIG.enemy.damageMax);
  gameState.player.hp = Math.max(0, gameState.player.hp - enemyDmg);
  pushBattleLog(`${enemy.name} の攻撃！ ${enemyDmg} ダメージ。`);
  if (gameState.player.hp <= 0) {
    endGame(false);
  }
}

// Pure-ish update step: logic only.
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

function drawImageWithFallback(assetKey, x, y, size, fallbackFn) {
  const asset = gameState.assets.images[assetKey];
  if (asset && asset.loaded && !asset.failed) {
    ctx.drawImage(asset.img, x, y, size, size);
  } else {
    fallbackFn();
  }
}

function drawPlayer(px, py, size) {
  drawImageWithFallback("player", px, py, size, () => {
    ctx.fillStyle = "#ffcf56";
    ctx.fillRect(px + 8, py + 4, 16, 24);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(px + 10, py + 8, 3, 3);
    ctx.fillRect(px + 19, py + 8, 3, 3);
  });
}

function renderMap() {
  const ts = CONFIG.tileSize;
  for (let y = 0; y < CONFIG.mapRows; y += 1) {
    for (let x = 0; x < CONFIG.mapCols; x += 1) {
      const tile = gameState.map[y][x];
      const px = x * ts;
      const py = y * ts;

      if (tile === TILE.GROUND) {
        drawImageWithFallback("ground", px, py, ts, () => drawFallbackTile(TILE.GROUND, px, py, ts));
      } else if (tile === TILE.GRASS) {
        drawImageWithFallback("grass", px, py, ts, () => drawFallbackTile(TILE.GRASS, px, py, ts));
      } else {
        drawImageWithFallback("rock", px, py, ts, () => drawFallbackTile(TILE.ROCK, px, py, ts));
      }
    }
  }
}

// Rendering step: visual updates only.
function render() {
  ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
  renderMap();
  drawPlayer(gameState.player.x * CONFIG.tileSize, gameState.player.y * CONFIG.tileSize, CONFIG.tileSize);

  DOM.hudHp.textContent = gameState.player.hp;
  DOM.hudMaxHp.textContent = gameState.player.maxHp;
  DOM.hudWins.textContent = gameState.wins;

  const isStart = gameState.phase === "start";
  const isPlaying = gameState.phase === "playing";
  const isBattle = gameState.phase === "battle";
  const isGameOver = gameState.phase === "gameover";

  DOM.startScreen.classList.toggle("hidden", !isStart);
  DOM.startScreen.classList.toggle("active", isStart);
  DOM.hud.classList.toggle("hidden", !(isPlaying || isBattle));
  DOM.battlePanel.classList.toggle("hidden", !isBattle);
  DOM.endScreen.classList.toggle("hidden", !isGameOver);

  if (isBattle && gameState.battle.enemy) {
    DOM.enemyName.textContent = gameState.battle.enemy.name;
    DOM.enemyHp.textContent = gameState.battle.enemy.hp;
    DOM.enemyMaxHp.textContent = gameState.battle.enemy.maxHp;
    DOM.playerHp.textContent = gameState.player.hp;
    DOM.playerMaxHp.textContent = gameState.player.maxHp;
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

function onKeyDown(e) {
  gameState.keysDown[e.code] = true;

  if (e.code === "Enter") {
    if (gameState.phase === "start") {
      startGame();
    } else if (gameState.phase === "gameover") {
      startGame();
    }
  }
}

function onKeyUp(e) {
  delete gameState.keysDown[e.code];
}

function bindEvents() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  DOM.startBtn.addEventListener("click", startGame);
  DOM.restartBtn.addEventListener("click", startGame);
  DOM.fightBtn.addEventListener("click", resolvePlayerFight);
  DOM.runBtn.addEventListener("click", resolveRunAttempt);
}

function init() {
  loadAssets();
  bindEvents();
  requestAnimationFrame(loop);
}

init();
