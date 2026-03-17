const DEFAULT_GAME_LIBRARY = [
  { title: "Super Mario Bros", studio: "Nintendo", year: 1985 },
  { title: "The Legend of Zelda", studio: "Nintendo", year: 1986 },
  { title: "Mega Man 2", studio: "Capcom", year: 1988 },
  { title: "Final Fantasy VII", studio: "Square", year: 1997 },
  { title: "Half-Life", studio: "Valve", year: 1998 },
  { title: "The Sims", studio: "Maxis", year: 2000 },
  { title: "Halo: Combat Evolved", studio: "Bungie", year: 2001 },
  { title: "The Elder Scrolls III: Morrowind", studio: "Bethesda", year: 2002 },
  { title: "The Orange Box", studio: "Valve", year: 2007 },
  { title: "Portal", studio: "Valve", year: 2007 },
  { title: "Grand Theft Auto IV", studio: "Rockstar", year: 2008 },
  { title: "Red Dead Redemption", studio: "Rockstar", year: 2010 },
  { title: "Minecraft", studio: "Mojang", year: 2011 },
  { title: "Dark Souls", studio: "FromSoftware", year: 2011 },
  { title: "The Elder Scrolls V: Skyrim", studio: "Bethesda", year: 2011 },
  { title: "Hollow Knight", studio: "Team Cherry", year: 2017 },
  { title: "Overwatch", studio: "Blizzard", year: 2016 },
  { title: "Hades", studio: "Supergiant Games", year: 2020 },
  { title: "Horizon Zero Dawn", studio: "Guerrilla", year: 2017 },
  { title: "Cyberpunk 2077", studio: "CD Projekt", year: 2020 },
  { title: "Doom Eternal", studio: "id Software", year: 2020 },
  { title: "Terraria", studio: "Re-Logic", year: 2011 },
  { title: "God of War", studio: "Santa Monica Studio", year: 2018 },
  { title: "The Last of Us Part II", studio: "Naughty Dog", year: 2020 },
  { title: "Stardew Valley", studio: "ConcernedApe", year: 2016 },
  { title: "Pokemon Gold", studio: "Game Freak", year: 1999 },
  { title: "Civilization VI", studio: "Firaxis", year: 2016 }
].map((card, index) => ({
  id: `timeline-card-${index + 1}`,
  title: card.title,
  studio: card.studio,
  year: card.year,
  image: `https://picsum.photos/seed/${encodeURIComponent(`${card.title}-${card.year}`)}/640/360`
}));

const STARTING_TOKENS = 2;
const MAX_TOKENS = 5;
const USERNAME_STORAGE_KEY = "pixelTimelineUsername";
const GAME_LIBRARY_FILE = "games.json";
const GAME_IMAGE_LIBRARY_FILE = "game-images.json";
const PEER_SERVER_CONFIGS = [
  {},
  {
    host: "0.peerjs.com",
    port: 443,
    path: "/peerjs",
    secure: true,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
      ]
    }
  },
  {
    host: "0.peerjs.com",
    port: 443,
    path: "/peerjs",
    secure: true
  }
];

let GAME_CARDS = [];
const $ = (id) => document.getElementById(id);

const ui = {
  username: $("username"),
  settingsPanel: $("settingsPanel"),
  lobbySection: $("lobbySection"),
  createLobby: $("createLobby"),
  joinLobby: $("joinLobby"),
  roomCodeInput: $("roomCode"),
  roomCodeLabel: $("roomCodeLabel"),
  roomInfo: $("roomInfo"),
  roomStatus: $("status"),
  currentPlayerInfo: $("currentPlayerInfo"),
  currentRoomState: $("currentRoomState"),
  hostBadge: $("hostBadge"),
  copyRoom: $("copyRoom"),
  playerList: $("playerList"),
  startGame: $("startGame"),
  leaveLobby: $("leaveLobby"),
  gameSection: $("gameSection"),
  turnInfo: $("turnInfo"),
  deckInfo: $("deckInfo"),
  roundMessage: $("roundMessage"),
  promptWrap: $("promptCardWrap"),
  promptImage: $("promptImage"),
  promptMeta: $("promptMeta"),
  positionSelect: $("positionSelect"),
  placeBtn: $("placeCardBtn"),
  guessTitle: $("guessTitleInput"),
  guessStudio: $("guessStudioInput"),
  titleSuggestions: $("titleSuggestions"),
  studioSuggestions: $("studioSuggestions"),
  guessStatus: $("guessStatus"),
  rerollBtn: $("rerollBtn"),
  autoPlaceBtn: $("autoPlaceBtn"),
  challengeWrap: $("challengeWrap"),
  glitchSelect: $("glitchPosition"),
  glitchBtn: $("glitchBtn"),
  challengeHint: $("challengeHint"),
  rowsArea: $("rowsArea"),
  log: $("log")
};

let peer = null;
let isHost = false;
let roomCode = "";
let peerId = "";
let playerId = "";
let hostConnection = null;
let gameState = {
  roomCode: "",
  players: [],
  started: false,
  phase: "lobby",
  turnPlayerId: "",
  currentCard: null,
  deckRemaining: 0,
  challenges: [],
  roundMessage: "",
  roundPulse: "none",
  revealCurrent: false
};

let hostState = null;
let hostConnections = {};
let lobbyMode = "idle";
let suggestionTitles = [];
let suggestionStudios = [];
let lastRoundPulseKey = "";

function log(msg, type = "ok") {
  const row = document.createElement("div");
  row.textContent = `[${now()}] ${msg}`;
  row.className = type;
  ui.log.prepend(row);
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeText(text, fallback = "—") {
  return text ? String(text) : fallback;
}

function levenshtein(a, b) {
  const source = String(a || "");
  const target = String(b || "");
  const m = source.length;
  const n = target.length;
  if (!m) return n;
  if (!n) return m;
  const matrix = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= n; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[m][n];
}

function showStatus(message, className = "") {
  ui.roomStatus.textContent = message;
  ui.roomStatus.className = className;
}

function shuffle(items) {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanName(value) {
  return (value || "").trim().slice(0, 18) || "Player";
}

function getStoredUsername() {
  try {
    return window.localStorage.getItem(USERNAME_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveUsername(value) {
  try {
    window.localStorage.setItem(USERNAME_STORAGE_KEY, cleanName(value));
  } catch {
    // localStorage unavailable in some environments
  }
}

function normalizeGameLibrary(cards) {
  const withIds = [];
  const ids = new Set();

  cards.forEach((raw, index) => {
    const year = Number.parseInt(raw.year, 10);
    const title = String(raw.title || "").trim();
    const studio = String(raw.studio || "").trim();
    if (!title || !studio || !Number.isFinite(year)) return;

    const base = {
      title,
      studio,
      year,
      image: String(raw.image || "").trim(),
      imageId: String(raw.imageId || "").trim()
    };
    if (!base.image && !base.imageId) {
      base.image = `https://picsum.photos/seed/${encodeURIComponent(`${title}-${year}`)}/640/360`;
    }

    let id = String(raw.id || `timeline-card-${index + 1}`).trim();
    if (!id || ids.has(id)) {
      let suffix = 1;
      const baseId = `${id || "timeline-card"}`;
      id = `${baseId}-${suffix++}`;
      while (ids.has(id)) id = `${baseId}-${suffix++}`;
    }
    ids.add(id);

    withIds.push({
      id,
      ...base
    });
  });

  return withIds;
}

async function loadGameImageManifest() {
  try {
    const response = await fetch(GAME_IMAGE_LIBRARY_FILE, { cache: "no-store" });
    if (!response.ok) return {};
    const manifest = await response.json();
    if (!manifest || typeof manifest !== "object") return {};
    return manifest;
  } catch {
    return {};
  }
}

function applyImageManifest(cards, manifest = {}) {
  return cards.map((card) => {
    if (card.image || !card.imageId) return card;
    const fromManifest = manifest[card.imageId];
    if (!fromManifest) return card;
    return { ...card, image: String(fromManifest) };
  });
}

function dedupeGames(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    const key = normalizeText(`${card.title}-${card.studio}-${card.year}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadGameLibrary() {
  const imageManifest = await loadGameImageManifest();
  try {
    const response = await fetch(GAME_LIBRARY_FILE, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload) && payload.length) {
        GAME_CARDS = dedupeGames(applyImageManifest(normalizeGameLibrary(payload), imageManifest));
      }
    }
  } catch {
    // ignore
  }
  if (!GAME_CARDS.length) {
    const fallback = loadFallbackLibraryImageIds();
    GAME_CARDS = dedupeGames(applyImageManifest(fallback, imageManifest));
  }
  refreshSearchIndex();
}

function loadFallbackLibraryImageIds() {
  return DEFAULT_GAME_LIBRARY.map((card) => ({ ...card }));
}

function refreshSearchIndex() {
  const titleSet = new Map();
  const studioSet = new Map();
  GAME_CARDS.forEach((card) => {
    titleSet.set(card.title.toLowerCase(), card.title);
    studioSet.set(card.studio.toLowerCase(), card.studio);
  });

  suggestionTitles = Array.from(titleSet.values()).sort((a, b) => a.localeCompare(b));
  suggestionStudios = Array.from(studioSet.values()).sort((a, b) => a.localeCompare(b));
}

function updateSuggestions(raw = "", source = [], datalist) {
  const query = normalizeText(raw);
  let options = [...source];

  if (query) {
    options = options
      .map((value) => ({ value, score: guessScore(normalizeText(value), query) }))
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.value.localeCompare(b.value);
      })
      .map((entry) => entry.value)
      .slice(0, 12);
  }

  datalist.innerHTML = "";
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    datalist.appendChild(option);
  });
}

function guessScore(available, query) {
  if (!query) return 0;
  if (available === query) return 0;
  if (available.startsWith(query)) return 1;
  if (available.includes(query)) return 2;
  return Math.min(4, levenshtein(available, query));
}

function canonicalGuess(raw, source) {
  const normalized = normalizeText(raw);
  if (!normalized) return raw ? raw.trim() : "";
  const direct = source.find((value) => normalizeText(value) === normalized);
  if (direct) return direct;

  const scored = source
    .map((value) => ({ value, score: guessScore(normalizeText(value), normalized) }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.value.localeCompare(b.value);
    });

  if (scored.length && scored[0].score <= 4) return scored[0].value;
  return raw.trim();
}

function canonicalGuessTitle(raw) {
  return canonicalGuess(raw, suggestionTitles);
}

function canonicalGuessStudio(raw) {
  return canonicalGuess(raw, suggestionStudios);
}

function isConnectedToLobby() {
  const hostReady = isHost && peer && peer.open;
  const clientReady = !isHost && hostConnection && hostConnection.open;
  return Boolean(hostReady || clientReady);
}

function isLobbySessionActive() {
  return lobbyMode !== "idle";
}

function setLobbyMode(mode) {
  lobbyMode = mode || "idle";
  setLobbyActionVisibility();
}

function setLobbyActionVisibility() {
  const connected = isConnectedToLobby();
  const inSession = isLobbySessionActive();
  const hasRoom = Boolean(gameState.roomCode);
  const canStart = isHost && !gameState.started && gameState.players.length >= 2;

  ui.createLobby.classList.toggle("hidden", inSession);
  ui.joinLobby.classList.toggle("hidden", inSession);
  ui.roomCodeInput.classList.toggle("hidden", inSession);
  ui.leaveLobby.classList.toggle("hidden", !inSession);
  ui.copyRoom.classList.toggle("hidden", !connected || !hasRoom);
  ui.startGame.classList.toggle("hidden", !connected || !isHost || gameState.started);
  ui.startGame.disabled = !canStart;
  ui.roomInfo.classList.toggle("hidden", !connected || !hasRoom);
  ui.hostBadge.classList.toggle("hidden", !isHost || !connected);
  ui.username.disabled = inSession;

  if (!inSession) {
    ui.currentPlayerInfo.textContent = "Not connected.";
    ui.currentRoomState.textContent = "Lobby not initialized.";
    return;
  }

  if (!connected) {
    ui.currentPlayerInfo.textContent = "Connecting...";
    ui.currentRoomState.textContent = "Awaiting room sync.";
    return;
  }

  const current = gameState.players?.find((player) => player.id === playerId) || {};
  const playerLabel = current.name || cleanName(ui.username.value);
  ui.currentPlayerInfo.textContent = `You: ${playerLabel}${isHost ? " (host)" : ""}`;
  ui.currentRoomState.textContent = `Room: ${gameState.roomCode || roomCode || "—"}${gameState.started ? " | Game active" : " | Waiting"}`;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getInsertIndex(rowCards, year) {
  if (!rowCards || !rowCards.length) return 0;
  let index = 0;
  while (index < rowCards.length && rowCards[index].year < year) index += 1;
  return index;
}

function describeSlot(rowCards, index, preposition = "before") {
  const cards = Array.isArray(rowCards) ? rowCards : [];
  const clamped = Math.max(0, Math.min(cards.length, Number.parseInt(index, 10) || 0));
  if (!cards.length) return `${preposition} as the first card`;
  if (clamped <= 0) {
    return `${preposition} before ${cardLabel(cards[0])}`;
  }
  if (clamped >= cards.length) {
    return `${preposition} after ${cardLabel(cards[cards.length - 1])}`;
  }
  return `${preposition} between ${cardLabel(cards[clamped - 1])} and ${cardLabel(cards[clamped])}`;
}

function isActiveTurn() {
  return gameState.started && gameState.turnPlayerId === playerId;
}

function activePlayer() {
  return gameState.players.find((player) => player.id === gameState.turnPlayerId) || null;
}

function isBonusCorrect(guessTitle, guessStudio, card) {
  return (
    normalizeText(guessTitle) === normalizeText(card.title) &&
    normalizeText(guessStudio) === normalizeText(card.studio)
  );
}

function cardLabel(card) {
  return `${card.title} (${card.year})`;
}

function option(selectEl, value, text) {
  const opt = document.createElement("option");
  opt.value = String(value);
  opt.textContent = text;
  selectEl.appendChild(opt);
}

function fillPositionOptions(selectEl, rowCards, labelPrefix = "Place") {
  selectEl.innerHTML = "";
  const cards = Array.isArray(rowCards) ? rowCards : [];

  if (!cards.length) {
    option(selectEl, 0, `${labelPrefix} as the first card`);
    selectEl.value = "0";
    return;
  }

  cards.forEach((card, index) => {
    option(selectEl, index, `${labelPrefix} before ${cardLabel(card)}`);
    option(selectEl, index + 1, `${labelPrefix} after ${cardLabel(card)}`);
  });
  if (!selectEl.value) selectEl.value = "0";
}

function updatePlayerList(players) {
  ui.playerList.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    li.textContent = `${player.name} — score ${player.score} — tokens ${player.tokens} — cards ${player.row.length}`;
    if (player.id === gameState.turnPlayerId && gameState.started) {
      li.textContent = `▶ ${li.textContent}`;
    }
    if (player.id === playerId && isHost) {
      li.textContent += " (you, host)";
    } else if (player.id === playerId) {
      li.textContent += " (you)";
    }
    ui.playerList.appendChild(li);
  });
}

function renderCard(card, showDetails = false) {
  const tile = document.createElement("article");
  tile.className = "card";

  const image = document.createElement("img");
  image.src = card.image;
  image.alt = "Video game screenshot";

  const titleLine = document.createElement("p");
  const detailLine = document.createElement("p");
  titleLine.textContent = card.title;
  detailLine.textContent = showDetails
    ? `${card.year} • ${card.studio}`
    : `${card.studio} / ${card.year}`;

  tile.appendChild(image);
  tile.appendChild(titleLine);
  tile.appendChild(detailLine);
  return tile;
}

function renderRows() {
  ui.rowsArea.innerHTML = "";
  gameState.players.forEach((player) => {
    const section = document.createElement("section");
    section.className = "playerRow";

    const heading = document.createElement("h4");
    const active = player.id === gameState.turnPlayerId ? " (turn)" : "";
    heading.textContent = `${player.name}${active} — score ${player.score} — tokens ${player.tokens}`;
    section.appendChild(heading);

    const row = document.createElement("div");
    row.className = "cardRow";
    player.row.forEach((card) => row.appendChild(renderCard(card, true)));
    section.appendChild(row);
    ui.rowsArea.appendChild(section);
  });
}

function isActiveOpponentTurn() {
  return gameState.started && gameState.phase === "place" && gameState.turnPlayerId && gameState.turnPlayerId !== playerId;
}

function renderChallengePositions(activePlayerRow) {
  const challenger = playerId && playerId !== gameState.turnPlayerId;
  if (!gameState.started || !isActiveOpponentTurn() || !challenger) {
    ui.challengeWrap.classList.add("hidden");
    return;
  }

  ui.challengeWrap.classList.remove("hidden");
  fillPositionOptions(ui.glitchSelect, activePlayerRow, "Card is");

  const me = gameState.players.find((p) => p.id === playerId);
  const alreadyChallenged = (gameState.challenges || []).some((entry) => entry.playerId === playerId);
  const canChallenge = (me?.tokens || 0) > 0 && !alreadyChallenged;
  ui.glitchBtn.disabled = !canChallenge;
  ui.challengeHint.textContent = alreadyChallenged
    ? "You already spent a token this round to challenge."
    : canChallenge
      ? "Pick a position and spend 1 token to GLITCH!"
      : "No token available.";
}

function updateTurnControls() {
  ui.roundMessage.textContent = gameState.roundMessage || "Waiting...";

  const turnPlayer = activePlayer();
  const activeRowCount = turnPlayer ? turnPlayer.row.length : 0;
  const turnCard = gameState.currentCard;
  const isTurn = isActiveTurn();
  const phasePlace = gameState.started && gameState.phase === "place" && !!turnCard;

  if (gameState.started) {
    ui.turnInfo.textContent = `Current turn: ${turnPlayer ? turnPlayer.name : "—"}`;
    ui.deckInfo.textContent = `Cards left in deck: ${gameState.deckRemaining}`;
  } else {
    ui.turnInfo.textContent = "";
    ui.deckInfo.textContent = "";
  }

  if (phasePlace) {
    ui.promptWrap.classList.remove("hidden");
    ui.promptImage.src = turnCard.image;
    ui.promptImage.alt = "Mystery screenshot";
    ui.promptMeta.textContent = gameState.revealCurrent
      ? `${turnCard.title} — ${turnCard.year} — ${turnCard.studio}`
      : "Card concealed. Place first, then flip.";
  } else {
    ui.promptWrap.classList.add("hidden");
    ui.promptMeta.textContent = "";
  }

  fillPositionOptions(ui.positionSelect, turnPlayer ? turnPlayer.row : [], "Place");

  ui.positionSelect.disabled = !isTurn || !phasePlace || gameState.revealCurrent;
  ui.placeBtn.disabled = !isTurn || !phasePlace || gameState.revealCurrent;

  if (turnPlayer) {
    const myTokenCount = turnPlayer.tokens || 0;
    ui.rerollBtn.disabled = !(isTurn && phasePlace && !gameState.revealCurrent && myTokenCount >= 1 && gameState.deckRemaining > 0);
    ui.autoPlaceBtn.disabled = !(isTurn && phasePlace && !gameState.revealCurrent && myTokenCount >= 3);
  } else {
    ui.rerollBtn.disabled = true;
    ui.autoPlaceBtn.disabled = true;
  }

  ui.guessTitle.disabled = !isTurn || !phasePlace || gameState.revealCurrent;
  ui.guessStudio.disabled = !isTurn || !phasePlace || gameState.revealCurrent;

  renderChallengePositions((activePlayer() || {}).row || []);
}

function flashRoundMessage(pulse = "none") {
  const mapping = {
    success: "turn-success",
    fail: "turn-fail",
    warn: "turn-warn",
    info: "turn-info",
    glitch: "turn-glitch",
    win: "turn-win"
  };
  const className = mapping[pulse] || "turn-info";
  if (className === "turn-info" && !mapping[pulse]) return;

  ui.roundMessage.classList.remove("turn-success", "turn-fail", "turn-warn", "turn-info", "turn-glitch", "turn-win");
  ui.promptWrap.classList.remove("turn-success", "turn-fail", "turn-warn", "turn-info", "turn-glitch", "turn-win");
  void ui.roundMessage.offsetWidth;
  void ui.promptWrap.offsetWidth;
  ui.roundMessage.classList.add(className);
  ui.promptWrap.classList.add(className);
  setTimeout(() => {
    ui.roundMessage.classList.remove(className);
    ui.promptWrap.classList.remove(className);
  }, 1200);
}

function applyState(state, myId = "") {
  gameState = clone(state);
  if (myId) playerId = myId;
  const pulse = gameState.roundPulse || "none";
  const pulseKey = `${gameState.roundMessage}|${pulse}`;
  if (pulse !== "none" && pulseKey !== lastRoundPulseKey) {
    flashRoundMessage(pulse);
  }
  lastRoundPulseKey = pulseKey;

  if (isLobbySessionActive()) {
    setLobbyMode(isConnectedToLobby() ? "connected" : "connecting");
  }

  ui.roomCodeLabel.textContent = gameState.roomCode || "";
  ui.gameSection.classList.toggle("hidden", !gameState.started);

  updatePlayerList(gameState.players);
  renderRows();
  updateTurnControls();

  const label = gameState.started ? "Game in progress." : "In lobby.";
  showStatus(
    `${label} ${gameState.started ? `Turn: ${activePlayer()?.name || "—"}` : "Waiting for host."}`,
    gameState.started ? "success" : "ok"
  );
}

function hostBuildState(revealCurrent) {
  const visibleCard = gameStateForCard(hostState.currentCard, revealCurrent || hostState.revealCurrent);
  return {
    roomCode: hostState.roomCode,
    players: clone(hostState.players),
    started: hostState.started,
    phase: hostState.phase,
    turnPlayerId: hostState.turnPlayerId,
    currentCard: visibleCard,
    deckRemaining: hostState.deck.length,
    challenges: clone(hostState.challenges),
    roundMessage: hostState.roundMessage,
    roundPulse: hostState.roundPulse,
    revealCurrent: hostState.revealCurrent
  };
}

function gameStateForCard(card, reveal) {
  if (!card) return null;
  if (reveal) return clone(card);
  return {
    id: card.id,
    image: card.image,
    title: "",
    studio: "",
    year: 0
  };
}

function hostBroadcastState(revealCurrent = hostState.revealCurrent) {
  const publicState = hostBuildState(revealCurrent);
  Object.values(hostConnections).forEach((conn) => {
    if (conn.open) {
      conn.send({
        type: "lobby-state",
        myPlayerId: conn.peer,
        state: {
          ...publicState,
          currentCard: gameStateForCard(hostState.currentCard, publicState.revealCurrent)
        }
      });
    }
  });

  if (isHost) {
    applyState(
      {
        ...publicState,
        currentCard: gameStateForCard(hostState.currentCard, true)
      },
      peerId
    );
  }
}

function hostSystem(message, type = "ok", pulse = "none") {
  hostState.roundMessage = message;
  hostState.roundPulse = pulse;
  Object.values(hostConnections).forEach((conn) => {
    if (conn.open) conn.send({ type: "system", message, kind: type, pulse });
  });
  if (isHost) log(message, type);
}

function hostAddPlayer(name, id) {
  hostState.players.push({
    id,
    name,
    score: 0,
    tokens: STARTING_TOKENS,
    row: []
  });
}

function hostGetPlayer(id) {
  return hostState.players.find((player) => player.id === id) || null;
}

function hostBuildUniqueName(rawName) {
  const base = cleanName(rawName);
  let candidate = base;
  let suffix = 1;
  while (hostState.players.some((player) => player.name.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  return candidate;
}

function hostStartLobby() {
  const name = cleanName(ui.username.value);
  if (!name) {
    showStatus("Enter username first.", "warn");
    return;
  }
  saveUsername(name);
  setLobbyMode("hosting");

  roomCode = generateRoomCode();
  isHost = true;

  openPeer(roomCode, (id) => {
    peerId = id;
    hostState = {
      roomCode,
      players: [],
      deck: [],
      discard: [],
      started: false,
      phase: "lobby",
      turnPlayerId: "",
      turnIndex: 0,
      currentCard: null,
      revealCurrent: false,
      roundPulse: "none",
      challenges: [],
      roundMessage: "Lobby created. Invite players."
    };
    hostConnections = {};

    const hostPlayer = {
      id: peerId,
      name,
      isHost: true,
      score: 0,
      tokens: STARTING_TOKENS,
      row: []
    };
    hostState.players.push(hostPlayer);

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        hostConnections[conn.peer] = conn;
        if (hostState.players.length >= 8) {
          conn.send({ type: "error", message: "Lobby full." });
          conn.close();
          return;
        }

        const metadataName = conn.metadata && typeof conn.metadata.username === "string" ? conn.metadata.username : "";
        if (metadataName && !hostGetPlayer(conn.peer)) {
          const uniqueName = hostBuildUniqueName(metadataName);
          hostAddPlayer(uniqueName, conn.peer);
          hostSystem(`${uniqueName} joined.`);
          hostBroadcastState();
        }

        conn.send({ type: "system", message: `Connected to lobby ${roomCode}.` });
      });

      conn.on("data", (payload) => {
        if (!payload || typeof payload.type !== "string") return;

        if (payload.type === "join-request") {
          handleHostJoinRequest(conn, payload.username);
          return;
        }

        if (payload.type === "start-game") {
          if (isHost) hostHandleStartGame();
          return;
        }

        if (!hostState.started && payload.type !== "start-game") return;

        if (payload.type === "place") {
          hostHandlePlace(conn.peer, payload.position, payload.guessTitle, payload.guessStudio);
          return;
        }

        if (payload.type === "reroll") {
          hostHandleReroll(conn.peer);
          return;
        }

        if (payload.type === "auto-place") {
          hostHandleAutoPlace(conn.peer);
          return;
        }

        if (payload.type === "challenge") {
          hostHandleChallenge(conn.peer, payload.position);
        }
      });

      conn.on("close", () => {
        delete hostConnections[conn.peer];
        hostState.players = hostState.players.filter((p) => p.id !== conn.peer);
        hostBroadcastState();
        if (!hostState.players.length) {
          resetForQuit();
        }
      });

      conn.on("error", () => {
        delete hostConnections[conn.peer];
      });
    });

    hostBroadcastState();
    playerId = peerId;
    showStatus(`Lobby ${roomCode} ready to accept players.`);
    log(`Lobby ${roomCode} created.`);
    roomCode = hostState.roomCode;
    setLobbyMode("connected");
  }, (error) => {
    showStatus(`Peer error: ${error.message}`, "error");
    log(`Peer error: ${error.message}`, "error");
    setLobbyMode("idle");
  });
}

function handleHostJoinRequest(conn, usernameRaw) {
  if (hostState.started) {
    conn.send({ type: "error", message: "Game already started." });
    return;
  }

  if (hostGetPlayer(conn.peer)) {
    conn.send({ type: "system", message: "Welcome back to lobby." });
    conn.send({
      type: "lobby-state",
      myPlayerId: conn.peer,
      state: {
        ...hostBuildState(hostState.revealCurrent),
        currentCard: gameStateForCard(hostState.currentCard, hostState.revealCurrent)
      }
    });
    return;
  }

  const requestedName = hostBuildUniqueName(usernameRaw || "Player");
  hostAddPlayer(requestedName, conn.peer);
  conn.send({ type: "system", message: `Welcome to lobby, ${requestedName}.` });
  hostSystem(`${requestedName} joined.`);
  hostBroadcastState();
}

function hostHandleStartGame() {
  if (!isHost || hostState.started) return;
  if (hostState.players.length < 2) {
    showStatus("Need at least two players.", "warn");
    return;
  }
  if (!GAME_CARDS.length) {
    showStatus("Game library is empty.", "warn");
    return;
  }

  hostState.deck = shuffle([...GAME_CARDS]);
  hostState.discard = [];
  hostState.currentCard = null;
  hostState.started = true;
  hostState.phase = "place";
  hostState.turnIndex = 0;
  hostState.challenges = [];
  hostState.roundMessage = "Game started. Build your timeline!";
  hostState.roundPulse = "none";
  hostState.revealCurrent = false;

  hostState.players.forEach((player) => {
    player.score = 0;
    player.tokens = STARTING_TOKENS;
    player.row = [];
    const anchor = hostState.deck.pop();
    if (anchor) player.row.push(anchor);
    if (player.row.length > 1) {
      player.row.sort((a, b) => a.year - b.year);
    }
  });

  hostStartNextTurn();
}

function hostStartNextTurn() {
  if (!hostState.started) return;
  if (!hostState.deck.length) {
    hostEndGame();
    return;
  }
  if (hostState.turnIndex >= hostState.players.length) {
    hostState.turnIndex = 0;
  }

  hostState.turnPlayerId = hostState.players[hostState.turnIndex].id;
  hostState.currentCard = hostState.deck.pop();
  hostState.roundMessage = `Turn for ${hostGetPlayer(hostState.turnPlayerId)?.name || "player"}. Place this screenshot.`;
  hostState.roundPulse = "none";
  hostState.phase = "place";
  hostState.revealCurrent = false;
  hostState.challenges = [];
  hostBroadcastState();
}

function hostHandlePlace(playerIdForAction, positionRaw, guessTitle, guessStudio) {
  if (!hostState.started || hostState.phase !== "place" || hostState.revealCurrent) return;
  if (playerIdForAction !== hostState.turnPlayerId) return;

  const player = hostGetPlayer(playerIdForAction);
  const activeCard = hostState.currentCard;
  if (!player || !activeCard) return;

  const rowBefore = [...player.row];
  const maxPosition = rowBefore.length;
  const parsed = Number.parseInt(positionRaw, 10);
  const position = Number.isInteger(parsed) ? Math.max(0, Math.min(maxPosition, parsed)) : Math.floor(maxPosition / 2);
  const correctIndex = getInsertIndex(rowBefore, activeCard.year);
  const isCorrect = position === correctIndex;
  const isTitleCorrect = normalizeText(guessTitle) === normalizeText(activeCard.title);
  const isStudioCorrect = normalizeText(guessStudio) === normalizeText(activeCard.studio);
  const gotBonus = isTitleCorrect && isStudioCorrect;

  let stealTo = null;
  let challengerName = null;
  if (isCorrect) {
    player.row.splice(position, 0, activeCard);
    player.score += 1;
  } else {
    const challenger = hostState.challenges.find((entry) => entry.position === correctIndex);
    if (challenger) {
      stealTo = hostGetPlayer(challenger.playerId);
      challengerName = hostGetPlayer(challenger.playerId)?.name || challenger.playerId;
    }
  }

  if (stealTo) {
    stealTo.row.splice(correctIndex, 0, activeCard);
    stealTo.score += 1;
  } else if (!isCorrect) {
    hostState.discard.push(activeCard);
  }

  hostState.revealCurrent = true;
  if (gotBonus) {
    player.tokens = Math.min(MAX_TOKENS, player.tokens + 1);
  }
  const selectedSlot = describeSlot(rowBefore, position, "as");
  const correctSlot = describeSlot(rowBefore, correctIndex, "as");
  const bonusText = gotBonus
    ? "Bonus token gained: +1 (exact title + studio)."
    : guessTitle || guessStudio
      ? `Bonus miss: ${isTitleCorrect ? "title correct" : "title mismatch"} and ${isStudioCorrect ? "studio correct" : "studio mismatch"}.`
      : "No title/studio guess submitted.";
  const outcomeText = isCorrect
    ? "placed correctly"
    : stealTo
      ? `was wrong, GLITCH stolen by ${challengerName || "an opponent"}`
      : "was wrong and goes to discard";

  hostState.phase = "resolution";
  hostSystem(
    `${player.name} ${outcomeText}.`
      + ` They placed ${selectedSlot}; correct slot was ${correctSlot}.`
      + ` Revealed: ${activeCard.title} (${activeCard.year}) — ${activeCard.studio}.`
      + ` ${bonusText}`,
    isCorrect ? "success" : "warn",
    isCorrect ? "success" : stealTo ? "glitch" : "fail"
  );
  hostState.challenges = [];
  hostBroadcastState();

  const wasSteal = Boolean(stealTo);
  setTimeout(() => {
    hostState.currentCard = null;
    hostState.revealCurrent = false;
    hostState.phase = "place";
    hostState.turnIndex = (hostState.turnIndex + 1) % hostState.players.length;
    if (!hostState.deck.length) {
      hostEndGame();
      return;
    }

    hostStartNextTurn();
  }, 1400);
}

function hostHandleReroll(playerIdForAction) {
  if (!hostState.started || hostState.phase !== "place" || !hostState.currentCard) return;
  if (playerIdForAction !== hostState.turnPlayerId) return;
  if (!hostState.deck.length) {
    hostSystem("No extra screenshot to reroll.");
    return;
  }

  const player = hostGetPlayer(playerIdForAction);
  if (!player || player.tokens < 1) {
    hostSystem("Not enough tokens to reroll.");
    return;
  }

  player.tokens -= 1;
  hostState.discard.push(hostState.currentCard);
  hostState.currentCard = hostState.deck.pop();
  if (!hostState.currentCard) {
    hostEndGame();
    return;
  }

  hostSystem(`${player.name} spent 1 token and rerolled the card.`, "warn", "warn");
  hostState.challenges = [];
  hostBroadcastState();
}

function hostHandleAutoPlace(playerIdForAction) {
  if (!hostState.started || hostState.phase !== "place" || !hostState.currentCard) return;
  if (playerIdForAction !== hostState.turnPlayerId) return;

  const player = hostGetPlayer(playerIdForAction);
  if (!player || player.tokens < 3) {
    hostSystem("Not enough tokens for auto-place.");
    return;
  }

  const activeCard = hostState.currentCard;
  const insertIndex = getInsertIndex(player.row, activeCard.year);
  player.tokens -= 3;
  player.row.splice(insertIndex, 0, activeCard);
  player.score += 1;
  const placement = describeSlot(player.row, insertIndex, "as");

  hostState.currentCard = null;
  hostSystem(
    `${player.name} auto-added "${activeCard.title}" (${activeCard.year}) ${placement} for 3 tokens.`
      + " This was an automatic placement and grants one point.",
    "success",
    "success"
  );
  hostBroadcastState();

  hostState.turnIndex = (hostState.turnIndex + 1) % hostState.players.length;
  if (!hostState.deck.length) {
    hostEndGame();
  } else {
    hostStartNextTurn();
  }
}

function hostHandleChallenge(playerIdForAction, positionRaw) {
  if (!hostState.started || hostState.phase !== "place" || !hostState.currentCard) return;
  if (playerIdForAction === hostState.turnPlayerId) return;

  const player = hostGetPlayer(playerIdForAction);
  if (!player || player.tokens < 1) return;

  const activePlayer = hostGetPlayer(hostState.turnPlayerId);
  const rowLen = activePlayer ? activePlayer.row.length : 0;
  const parsed = Number.parseInt(positionRaw, 10);
  const position = Number.isInteger(parsed) ? Math.max(0, Math.min(rowLen, parsed)) : 0;

  const already = hostState.challenges.find((entry) => entry.playerId === playerIdForAction);
  if (already) return;

  player.tokens -= 1;
  const rowBefore = activePlayer ? activePlayer.row : [];
  const target = describeSlot(rowBefore, position, "as");
  hostState.challenges.push({
    playerId: playerIdForAction,
    position,
    at: Date.now()
  });
  hostSystem(`${player.name} challenged opponent: suspects ${target}.`, "warn", "glitch");
  hostBroadcastState();
}

function hostEndGame() {
  hostState.started = false;
  hostState.phase = "lobby";
  hostState.currentCard = null;
  hostState.revealCurrent = false;
  hostState.roundMessage = "Deck exhausted. Game ended.";
  hostState.roundPulse = "win";

  const sorted = [...hostState.players].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const winnerText = top ? `Winner: ${top.name} (${top.score})` : "No winner";
  hostSystem(`Game over. ${winnerText}`, "success", "win");

  for (const conn of Object.values(hostConnections)) {
    if (conn.open) {
      conn.send({
        type: "game-over",
        winner: top ? top.name : "No one",
        score: top ? top.score : 0
      });
    }
  }

  hostBroadcastState();
  ui.startGame.disabled = true;
}

function joinLobby() {
  const name = cleanName(ui.username.value);
  if (!name) {
    showStatus("Enter username first.", "warn");
    return;
  }
  saveUsername(name);
  setLobbyMode("join_pending");

  roomCode = ui.roomCodeInput.value.trim().toUpperCase();
  if (!roomCode || roomCode.length !== 6) {
    showStatus("Room code must be 6 characters.", "warn");
    setLobbyMode("idle");
    return;
  }

  isHost = false;
  openPeer(null, (id) => {
    peerId = id;
    connectToHost(roomCode, name);
  }, (error) => {
    showStatus(`Peer error: ${error.message}`, "error");
    log(`Peer error: ${error.message}`, "error");
    setLobbyMode("idle");
  });
}

function connectToHost(code, username, attempt = 0) {
  const maxAttempts = 3;
  if (!peer || !peer.open) {
    showStatus("Peer service not ready. Try again.", "error");
    setLobbyMode("idle");
    return;
  }

  setLobbyMode("connecting");

  if (hostConnection) {
    try {
      hostConnection.close();
    } catch {
      // ignore
    }
    hostConnection = null;
  }

  hostConnection = peer.connect(code, {
    reliable: true,
    serialization: "json",
    metadata: { username, version: "pixel-timeline-2" }
  });

  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      if (hostConnection && hostConnection.open === false) {
        if (attempt + 1 < maxAttempts) {
          connectToHost(code, username, attempt + 1);
          return;
        }
        showStatus("Could not establish join connection. Try again on a different network.", "error");
        setLobbyMode("idle");
      }
    }
  }, 6000);

  hostConnection.on("open", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    setLobbyMode("connected");
    hostConnection.send({ type: "join-request", username });
    showStatus(`Connecting to ${code}...`);
    ui.roomCodeLabel.textContent = code;
    log(`Connected to ${code}.`);
  });

  hostConnection.on("data", (message) => {
    if (!message || !message.type) return;

    if (message.type === "lobby-state") {
      applyState(message.state, message.myPlayerId);
      return;
    }
    if (message.type === "system") {
      showStatus(message.message, message.kind || "warn");
      log(message.message, message.kind || "warn");
      if (message.pulse && message.pulse !== "none") {
        flashRoundMessage(message.pulse);
      }
      return;
    }
    if (message.type === "error") {
      showStatus(message.message, "error");
      log(message.message, "error");
      return;
    }
    if (message.type === "game-over") {
      log(`Game over. Winner ${message.winner} (${message.score})`, "success");
    }
  });

  hostConnection.on("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (attempt + 1 < maxAttempts) {
      connectToHost(code, username, attempt + 1);
      return;
    }
    showStatus(`Host connection error: ${error.message}`, "error");
    log(`Host connection error: ${error.message}`, "error");
    setLobbyMode("idle");
  });

  hostConnection.on("close", () => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
    }
    if (!isHost) leaveLobby();
    showStatus("Disconnected from host.", "warn");
    log("Disconnected from host.", "warn");
  });
}

function openPeer(id, onOpen, onError, attempt = 0) {
  const cfg = PEER_SERVER_CONFIGS[Math.min(attempt, PEER_SERVER_CONFIGS.length - 1)];
  peer = new Peer(id || undefined, cfg);
  let resolved = false;

  peer.on("open", (assignedId) => {
    if (resolved) return;
    resolved = true;
    onOpen(assignedId);
  });

  peer.on("error", (err) => {
    if (resolved) return;
    const canRetry = attempt + 1 < PEER_SERVER_CONFIGS.length;
    if (canRetry) {
      peer.destroy();
      setTimeout(() => openPeer(id, onOpen, onError, attempt + 1), 250);
      return;
    }
    resolved = true;
    onError(err);
  });

  peer.on("disconnected", () => {
    showStatus("Peer service disconnected.");
    log("Peer service disconnected.");
    setLobbyMode("idle");
  });
}

function resetUI() {
  gameState = {
    roomCode: "",
    players: [],
    started: false,
    phase: "lobby",
    turnPlayerId: "",
    currentCard: null,
    deckRemaining: 0,
    challenges: [],
    roundMessage: "",
    roundPulse: "none",
    revealCurrent: false
  };
  lastRoundPulseKey = "";

  ui.gameSection.classList.add("hidden");
  ui.startGame.disabled = true;
  ui.playerList.innerHTML = "";
  ui.turnInfo.textContent = "";
  ui.deckInfo.textContent = "";
  ui.roundMessage.textContent = "";
  ui.promptWrap.classList.add("hidden");
  ui.promptMeta.textContent = "";
  ui.positionSelect.innerHTML = "";
  ui.glitchSelect.innerHTML = "";
  ui.rowsArea.innerHTML = "";
  ui.roomInfo.classList.add("hidden");
  ui.hostBadge.classList.add("hidden");
  ui.guessTitle.value = "";
  ui.guessStudio.value = "";
  ui.positionSelect.value = "0";
  ui.glitchSelect.value = "0";
  ui.challengeWrap.classList.add("hidden");
}

function leaveLobby() {
  if (peer) peer.destroy();
  peer = null;
  hostConnection = null;
  isHost = false;
  peerId = "";
  playerId = "";
  hostState = null;
  hostConnections = {};

  resetUI();
  showStatus("No active lobby.");
  log("You left the lobby.");
  setLobbyMode("idle");
}

function hostSendAction(type, payload = {}) {
  if (!hostConnection || !hostConnection.open) return;
  hostConnection.send({ type, ...payload });
}

function bindEvents() {
  ui.createLobby.addEventListener("click", hostStartLobby);
  ui.joinLobby.addEventListener("click", joinLobby);
  ui.copyRoom.addEventListener("click", async () => {
    if (!gameState.roomCode) return;
    await navigator.clipboard.writeText(gameState.roomCode);
    log("Room code copied.");
  });

  ui.leaveLobby.addEventListener("click", leaveLobby);

  ui.startGame.addEventListener("click", () => {
    if (isHost) {
      hostHandleStartGame();
    } else {
      hostSendAction("start-game");
    }
  });

  ui.placeBtn.addEventListener("click", () => {
    const position = Number(ui.positionSelect.value);
    const normalizedTitle = canonicalGuessTitle(ui.guessTitle.value);
    const normalizedStudio = canonicalGuessStudio(ui.guessStudio.value);
    ui.guessTitle.value = normalizedTitle;
    ui.guessStudio.value = normalizedStudio;

    if (isHost) {
      hostHandlePlace(playerId, position, normalizedTitle, normalizedStudio);
    } else {
      hostSendAction("place", {
        position,
        guessTitle: normalizedTitle,
        guessStudio: normalizedStudio
      });
    }

    ui.guessTitle.value = "";
    ui.guessStudio.value = "";
  });

  ui.rerollBtn.addEventListener("click", () => {
    if (isHost) {
      hostHandleReroll(playerId);
    } else {
      hostSendAction("reroll");
    }
  });

  ui.autoPlaceBtn.addEventListener("click", () => {
    if (isHost) {
      hostHandleAutoPlace(playerId);
    } else {
      hostSendAction("auto-place");
    }
  });

  ui.glitchBtn.addEventListener("click", () => {
    const position = Number(ui.glitchSelect.value);
    if (isHost) {
      hostHandleChallenge(playerId, position);
    } else {
      hostSendAction("challenge", { position });
    }
  });

  ui.guessTitle.addEventListener("input", () => {
    updateSuggestions(ui.guessTitle.value, suggestionTitles, ui.titleSuggestions);
  });
  ui.guessStudio.addEventListener("input", () => {
    updateSuggestions(ui.guessStudio.value, suggestionStudios, ui.studioSuggestions);
  });
  ui.guessTitle.addEventListener("focus", () => updateSuggestions(ui.guessTitle.value, suggestionTitles, ui.titleSuggestions));
  ui.guessStudio.addEventListener("focus", () => updateSuggestions(ui.guessStudio.value, suggestionStudios, ui.studioSuggestions));

  ui.username.addEventListener("input", () => {
    saveUsername(ui.username.value);
  });
}

function resetForQuit() {
  hostState = null;
  resetUI();
}

async function initialize() {
  await loadGameLibrary();
  bindEvents();
  resetUI();
  setLobbyMode("idle");

  const persistedName = getStoredUsername();
  if (persistedName) ui.username.value = persistedName;

  updateSuggestions("", suggestionTitles, ui.titleSuggestions);
  updateSuggestions("", suggestionStudios, ui.studioSuggestions);
}

initialize();
