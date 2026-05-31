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
const RESULTS_NORMAL_MS = 5000;
const RESULTS_SWING_MS = 7000;
const RECONNECT_GRACE_SECONDS = 20;
const TIMER_PRESETS = {
  short: { label: "Short", seconds: 15 },
  normal: { label: "Normal", seconds: 25 },
  long: { label: "Long", seconds: 40 }
};
const DEFAULT_RULES = {
  pointsToWin: 10,
  guessTimerPreset: "normal",
  guessWindowSeconds: TIMER_PRESETS.normal.seconds,
  guessMode: "either",
  imageMode: "full"
};
const USERNAME_STORAGE_KEY = "pixelTimelineUsername";
const SESSION_STORAGE_KEY = "pixelTimelineSession";
const GUIDE_STORAGE_KEY = "pixelTimelineGuideState";
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  // TURN relay — needed for mobile/CGNAT networks where direct P2P fails
  { urls: "turn:openrelay.metered.ca:80",       username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443",      username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
];

const PEER_SERVER_CONFIGS = [
  { config: { iceServers: ICE_SERVERS } },
  {
    host: "0.peerjs.com",
    port: 443,
    path: "/peerjs",
    secure: true,
    config: { iceServers: ICE_SERVERS }
  },
  {
    host: "0.peerjs.com",
    port: 443,
    path: "/peerjs",
    secure: true
  }
];
const GAME_LIBRARY_FILES = getAssetCandidates("games.json");
const GAME_IMAGE_LIBRARY_FILES = getAssetCandidates("game-images.json");

let GAME_CARDS = [];
let peer = null;
let hostConnection = null;
let hostConnections = {};
let hostState = null;
let isHost = false;
let roomCode = "";
let peerId = "";
let playerId = "";
let lobbyMode = "idle";
let hostGuessWindowTimer = null;
let hostResultsTimer = null;
let hostPauseTimer = null;
let clientCountdownTimer = null;
let clientConnectionGen = 0;
let clientHeartbeatTimer = null;
let clientLastPongAt = 0;
let phaseEntryKey = "";
let suggestionTitles = [];
let suggestionStudios = [];
let gameCardById = new Map();
let gameCardByImageId = new Map();
let localLibraryHash = "";
const sessionId = getOrCreateSessionId();
let guideState = loadGuideState();

function buildEmptyState() {
  return {
    roomCode: "",
    players: [],
    rules: { ...DEFAULT_RULES },
    started: false,
    phase: "lobby",
    turnPlayerId: "",
    currentCard: null,
    deckRemaining: 0,
    revealCurrent: false,
    guessWindow: null,
    pausedState: null,
    roundResult: null,
    roundMessage: "",
    roundPulse: "none",
    rulesNotice: ""
  };
}

let gameState = buildEmptyState();

const $ = (id) => document.getElementById(id);
const ui = {
  sidebarShell: $("sidebarShell"),
  welcomeScreen: $("welcomeScreen"),
  lobbyScreen: $("lobbyScreen"),
  gameSection: $("gameSection"),
  username: $("username"),
  choicePanel: $("choicePanel"),
  showHostBtn: $("showHostBtn"),
  showJoinBtn: $("showJoinBtn"),
  hostSetupPanel: $("hostSetupPanel"),
  hostBackBtn: $("hostBackBtn"),
  joinSetupPanel: $("joinSetupPanel"),
  joinBackBtn: $("joinBackBtn"),
  roomInfoPanel: $("roomInfoPanel"),
  createLobby: $("createLobby"),
  joinLobby: $("joinLobby"),
  roomCodeInput: $("roomCode"),
  roomCodeLabel: $("roomCodeLabel"),
  roomInfo: $("roomInfo"),
  roomStatus: $("status"),
  copyRoom: $("copyRoom"),
  leaveLobby: $("leaveLobby"),
  hostBadge: $("hostBadge"),
  libraryStatus: $("libraryStatus"),
  gameLibraryFile: $("gameLibraryFile"),
  gameImageLibraryFile: $("gameImageLibraryFile"),
  uploadPanel: $("uploadPanel"),
  connDiag: $("connDiag"),
  loadLibraryFilesBtn: $("loadLibraryFilesBtn"),
  libraryMismatchPanel: $("libraryMismatchPanel"),
  mismatchGamesFile: $("mismatchGamesFile"),
  mismatchImagesFile: $("mismatchImagesFile"),
  mismatchLoadBtn: $("mismatchLoadBtn"),
  mismatchStatus: $("mismatchStatus"),
  matchStatusSection: $("matchStatusSection"),
  matchPhaseSummary: $("matchPhaseSummary"),
  matchRuleSummary: $("matchRuleSummary"),
  matchStatusSummary: $("matchStatusSummary"),
  currentPlayerInfo: $("currentPlayerInfo"),
  currentRoomState: $("currentRoomState"),
  currentPlayerSection: $("currentPlayerSection"),
  playerList: $("playerList"),
  rulesSection: $("rulesSection"),
  pointsToWinInput: $("pointsToWinInput"),
  guessTimerPresetInput: $("guessTimerPresetInput"),
  guessModeInput: $("guessModeInput"),
  imageModeInput: $("imageModeInput"),
  rulesHelp: $("rulesHelp"),
  lobbyReadySummary: $("lobbyReadySummary"),
  readyToggleBtn: $("readyToggleBtn"),
  openGuideBtn: $("openGuideBtn"),
  skipGuideBtn: $("skipGuideBtn"),
  guideStatus: $("guideStatus"),
  guidePanel: $("guidePanel"),
  guideStepLabel: $("guideStepLabel"),
  guideTitle: $("guideTitle"),
  guideBody: $("guideBody"),
  guideExample: $("guideExample"),
  guidePrevBtn: $("guidePrevBtn"),
  guideNextBtn: $("guideNextBtn"),
  guideCompleteBtn: $("guideCompleteBtn"),
  matchSummaryText: $("matchSummaryText"),
  lobbyPlayersList: $("lobbyPlayersList"),
  rulesChangedNotice: $("rulesChangedNotice"),
  startGame: $("startGame"),
  firstMatchHelper: $("firstMatchHelper"),
  helperTitle: $("helperTitle"),
  helperBody: $("helperBody"),
  reopenGuideBtn: $("reopenGuideBtn"),
  phaseInfo: $("phaseInfo"),
  turnInfo: $("turnInfo"),
  deckInfo: $("deckInfo"),
  counterBanner: $("counterBanner"),
  counterBannerTitle: $("counterBannerTitle"),
  counterBannerText: $("counterBannerText"),
  countdownInfo: $("countdownInfo"),
  countdownBar: $("countdownBar"),
  counterActionStates: $("counterActionStates"),
  pauseBanner: $("pauseBanner"),
  pauseTitle: $("pauseTitle"),
  pauseText: $("pauseText"),
  pauseCountdown: $("pauseCountdown"),
  promptWrap: $("promptCardWrap"),
  promptTitle: $("promptTitle"),
  promptImageFrame: $("promptImageFrame"),
  promptImage: $("promptImage"),
  promptMeta: $("promptMeta"),
  localCountdown: $("localCountdown"),
  resultsView: $("resultsView"),
  resultsHeadline: $("resultsHeadline"),
  resultsImage: $("resultsImage"),
  resultsCardMeta: $("resultsCardMeta"),
  resultsTimelineSlice: $("resultsTimelineSlice"),
  resultsPlacementSummary: $("resultsPlacementSummary"),
  resultsGuessSummary: $("resultsGuessSummary"),
  resultsCounterSummary: $("resultsCounterSummary"),
  resultsReplaySummary: $("resultsReplaySummary"),
  resultsRaceSummary: $("resultsRaceSummary"),
  resultsPayoutList: $("resultsPayoutList"),
  whyGuessPanel: $("whyGuessPanel"),
  whyGuessSummary: $("whyGuessSummary"),
  whyGuessAll: $("whyGuessAll"),
  skipResultsBtn: $("skipResultsBtn"),
  activeTurnPanel: $("activeTurnPanel"),
  positionSelect: $("positionSelect"),
  placeBtn: $("placeCardBtn"),
  guessTitleRow: $("guessTitleRow"),
  guessStudioRow: $("guessStudioRow"),
  guessTitleLabel: $("guessTitleLabel"),
  guessStudioLabel: $("guessStudioLabel"),
  guessTitle: $("guessTitleInput"),
  guessStudio: $("guessStudioInput"),
  guessStatus: $("guessStatus"),
  rerollBtn: $("rerollBtn"),
  autoPlaceBtn: $("autoPlaceBtn"),
  placementHint: $("placementHint"),
  opponentGuessPanel: $("opponentGuessPanel"),
  counterPlacementCard: $("counterPlacementCard"),
  counterGuessCard: $("counterGuessCard"),
  placementActionState: $("placementActionState"),
  guessActionState: $("guessActionState"),
  opponentPlacementSelect: $("opponentPlacementSelect"),
  opponentPlacementBtn: $("opponentPlacementBtn"),
  opponentPlacementHint: $("opponentPlacementHint"),
  opponentGuessTitleLabel: $("opponentGuessTitleLabel"),
  opponentGuessStudioLabel: $("opponentGuessStudioLabel"),
  opponentGuessTitle: $("opponentGuessTitleInput"),
  opponentGuessStudio: $("opponentGuessStudioInput"),
  opponentGuessStudioRow: $("opponentGuessStudioRow"),
  opponentGuessBtn: $("opponentGuessBtn"),
  opponentGuessHint: $("opponentGuessHint"),
  counterGuessRiskText: $("counterGuessRiskText"),
  waitingPanel: $("waitingPanel"),
  waitingHint: $("waitingHint"),
  rowsArea: $("rowsArea"),
  titleSuggestions: $("titleSuggestions"),
  studioSuggestions: $("studioSuggestions"),
  log: $("log")
};

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function log(message, type = "ok") {
  const row = document.createElement("div");
  row.className = type;
  row.textContent = `[${now()}] ${message}`;
  ui.log.prepend(row);
}

function getAssetCandidates(fileName) {
  const values = [
    new URL(fileName, new URL(location.href)).toString(),
    fileName,
    `./${fileName}`
  ];
  const scriptElement = Array.from(document.scripts).find((script) => {
    const src = script.getAttribute("src") || "";
    return /(?:^|\/)script\.js(?:$|\?)/.test(src);
  });
  if (scriptElement?.src) {
    values.push(new URL(fileName, new URL(scriptElement.src)).toString());
  }
  return values.filter((value, index, array) => value && array.indexOf(value) === index);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeText(value, fallback = "—") {
  return value ? String(value) : fallback;
}

function cleanName(value) {
  return (value || "").trim().slice(0, 18) || "Player";
}

function generateId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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
    // ignore
  }
}

function getOrCreateSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = generateId("session");
    window.localStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return generateId("session");
  }
}

function loadGuideState() {
  const fallback = {
    completed: false,
    skipped: false,
    walkthroughSeen: false,
    currentSlide: 0,
    seenPhases: {
      place: false,
      "guess-window": false,
      resolution: false
    }
  };
  try {
    const raw = window.localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      seenPhases: {
        ...fallback.seenPhases,
        ...(parsed?.seenPhases || {})
      }
    };
  } catch {
    return fallback;
  }
}

function persistGuideState() {
  try {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(guideState));
  } catch {
    // ignore
  }
}

function markGuideComplete() {
  guideState.completed = true;
  guideState.skipped = false;
  guideState.walkthroughSeen = true;
  persistGuideState();
}

function markGuideSkipped() {
  guideState.skipped = true;
  guideState.walkthroughSeen = true;
  persistGuideState();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

async function readJsonFromFile(file) {
  return JSON.parse(await readFileAsText(file));
}

function shuffle(items) {
  const deck = [...items];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function getInsertIndex(rowCards, year) {
  if (!rowCards?.length) return 0;
  let index = 0;
  while (index < rowCards.length && rowCards[index].year < year) index += 1;
  return index;
}

function cardLabel(card) {
  return `${card.title} (${card.year})`;
}

function describeSlot(rowCards, index, preposition = "before") {
  const cards = Array.isArray(rowCards) ? rowCards : [];
  const clamped = Math.max(0, Math.min(cards.length, Number.parseInt(index, 10) || 0));
  if (!cards.length) return `${preposition} as the first card`;
  if (clamped <= 0) return `${preposition} before ${cardLabel(cards[0])}`;
  if (clamped >= cards.length) return `${preposition} after ${cardLabel(cards[cards.length - 1])}`;
  return `${preposition} between ${cardLabel(cards[clamped - 1])} and ${cardLabel(cards[clamped])}`;
}

function rowGapContext(rowCards, index) {
  const cards = Array.isArray(rowCards) ? rowCards : [];
  const clamped = Math.max(0, Math.min(cards.length, Number.parseInt(index, 10) || 0));
  return {
    before: clamped > 0 ? cards[clamped - 1] : null,
    after: clamped < cards.length ? cards[clamped] : null
  };
}

function normalizeRules(raw = {}) {
  const points = Number.parseInt(raw.pointsToWin, 10);
  const preset = raw.guessTimerPreset && TIMER_PRESETS[raw.guessTimerPreset] ? raw.guessTimerPreset : DEFAULT_RULES.guessTimerPreset;
  const seconds = TIMER_PRESETS[preset].seconds;
  const guessMode = raw.guessMode === "both" ? "both" : "either";
  const imageMode = raw.imageMode === "cutout" ? "cutout" : "full";
  return {
    pointsToWin: Number.isFinite(points) ? Math.max(1, Math.min(25, points)) : DEFAULT_RULES.pointsToWin,
    guessTimerPreset: preset,
    guessWindowSeconds: seconds,
    guessMode,
    imageMode
  };
}

function ruleSummaryText(rules = DEFAULT_RULES) {
  const preset = TIMER_PRESETS[rules.guessTimerPreset] || TIMER_PRESETS.normal;
  const mode = rules.guessMode === "both" ? "Title and studio" : "Title or studio";
  const image = rules.imageMode === "cutout" ? "Cutout reveal" : "Full screenshot";
  return `First to ${rules.pointsToWin} points • Counter timer ${preset.label} (${rules.guessWindowSeconds}s) • Guess mode ${mode} • ${image}`;
}

function presetLabel(presetKey) {
  return TIMER_PRESETS[presetKey]?.label || TIMER_PRESETS.normal.label;
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

function normalizeGameLibrary(cards) {
  const seen = new Set();
  return cards.map((raw, index) => {
    const title = String(raw.title || "").trim();
    const studio = String(raw.studio || "").trim();
    const year = Number.parseInt(raw.year, 10);
    if (!title || !studio || !Number.isFinite(year)) return null;
    let id = String(raw.id || `timeline-card-${index + 1}`).trim() || `timeline-card-${index + 1}`;
    while (seen.has(id)) id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(id);
    return {
      id,
      title,
      studio,
      year,
      image: String(raw.image || "").trim(),
      imageId: String(raw.imageId || "").trim()
    };
  }).filter(Boolean);
}

function normalizeImageManifestValue(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.trim());
}

function pickStableImage(entries, seedSource = "") {
  const safe = Array.isArray(entries) ? entries : [];
  if (!safe.length) return "";
  if (safe.length === 1) return safe[0];
  let hash = 0;
  for (const char of String(seedSource || "")) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) >>> 0;
  }
  return safe[hash % safe.length];
}

function steamHeaderFromImageId(imageId) {
  const match = String(imageId || "").match(/^steam-(\d+)-/i);
  if (!match) return "";
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${match[1]}/header.jpg`;
}

function applyImageManifest(cards, manifest = {}) {
  return cards.map((card) => {
    if (card.image) return card;
    if (!card.imageId) {
      return { ...card, image: `https://picsum.photos/seed/${encodeURIComponent(`${card.title}-${card.year}`)}/640/360` };
    }
    const fromManifest = normalizeImageManifestValue(manifest[card.imageId]);
    if (!fromManifest.length) {
      return { ...card, image: steamHeaderFromImageId(card.imageId) || `https://picsum.photos/seed/${encodeURIComponent(`${card.title}-${card.year}`)}/640/360` };
    }
    return { ...card, image: pickStableImage(fromManifest, card.id || card.imageId) };
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

function fallbackLibraryCards() {
  return DEFAULT_GAME_LIBRARY.map((card) => ({ ...card }));
}

function computeLibraryHash(cards = GAME_CARDS) {
  const sorted = [...cards].sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
  let h = 5381;
  const feed = (value) => {
    const s = String(value);
    for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  };
  feed(`${cards.length}|`);
  for (const card of sorted) feed(`${card.id}|${card.title}|${card.studio}|${card.year}|${card.image || ""}\n`);
  return h.toString(16);
}

function refreshLocalLibraryHash() {
  localLibraryHash = computeLibraryHash();
  return localLibraryHash;
}

function reindexGameCards() {
  gameCardById = new Map();
  gameCardByImageId = new Map();
  for (const card of GAME_CARDS) {
    if (card.id) gameCardById.set(card.id, card);
    if (card.imageId) gameCardByImageId.set(card.imageId, card);
  }
}

function refreshSearchIndex() {
  const titleSet = new Map();
  const studioSet = new Map();
  for (const card of GAME_CARDS) {
    titleSet.set(card.title.toLowerCase(), card.title);
    studioSet.set(card.studio.toLowerCase(), card.studio);
  }
  suggestionTitles = Array.from(titleSet.values()).sort((a, b) => a.localeCompare(b));
  suggestionStudios = Array.from(studioSet.values()).sort((a, b) => a.localeCompare(b));
}

function resolveLocalCardImage(card = {}) {
  const byId = card.id ? gameCardById.get(card.id) : null;
  if (byId?.image) return byId.image;
  const byImage = card.imageId ? gameCardByImageId.get(card.imageId) : null;
  if (byImage?.image) return byImage.image;
  if (card.image) return card.image;
  return `https://picsum.photos/seed/${encodeURIComponent(`${card.title}-${card.year}`)}/640/360`;
}

function hydrateSyncedCard(card = {}) {
  if (!card || typeof card !== "object") return card;
  return { ...card, image: resolveLocalCardImage(card) };
}

function hydrateSyncedState(state = {}) {
  return {
    ...state,
    players: Array.isArray(state.players)
      ? state.players.map((player) => ({
          ...player,
          row: Array.isArray(player.row) ? player.row.map((card) => hydrateSyncedCard(card)) : []
        }))
      : [],
    currentCard: state.currentCard ? hydrateSyncedCard(state.currentCard) : null,
    roundResult: state.roundResult
      ? {
          ...state.roundResult,
          card: state.roundResult.card ? hydrateSyncedCard(state.roundResult.card) : null
        }
      : null
  };
}

function syncCardForPeer(card = {}) {
  if (!card || typeof card !== "object") return card;
  return { ...card, image: "" };
}

// Recursively blank every `image` string so large base64 data URLs never
// travel over the data channel. Clients rehydrate images locally by card id.
function stripImagesDeep(value) {
  if (Array.isArray(value)) {
    value.forEach(stripImagesDeep);
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (key === "image" && typeof value[key] === "string") value[key] = "";
      else stripImagesDeep(value[key]);
    }
  }
  return value;
}

function setLibraryStatus(message, type = "") {
  ui.libraryStatus.textContent = message;
  ui.libraryStatus.className = `muted ${type}`.trim();
}

async function loadJsonByCandidates(candidates, label) {
  const attempts = [];
  for (const file of candidates) {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) {
        attempts.push(`${file} -> ${response.status}`);
        continue;
      }
      const payload = await response.json();
      return { file, payload };
    } catch (error) {
      attempts.push(`${file} -> ${error?.message || "error"}`);
    }
  }
  console.warn(`Unable to load ${label}`, attempts);
  return { file: "", payload: null, attempts };
}

async function loadGameImageManifest() {
  for (const file of GAME_IMAGE_LIBRARY_FILES) {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) continue;
      const manifest = await response.json();
      if (manifest && typeof manifest === "object") return manifest;
    } catch {
      // ignore
    }
  }
  return {};
}

function applyUploadedLibrary(gamesPayload, imageManifest = {}) {
  const normalized = dedupeGames(applyImageManifest(normalizeGameLibrary(gamesPayload), imageManifest));
  if (!normalized.length) throw new Error("Uploaded games JSON does not contain valid cards.");
  GAME_CARDS = normalized;
  reindexGameCards();
  refreshSearchIndex();
  refreshLocalLibraryHash();
  updateSuggestions("", suggestionTitles, ui.titleSuggestions);
  updateSuggestions("", suggestionStudios, ui.studioSuggestions);
}

async function handleLibraryUpload() {
  if (gameState.started) {
    setLibraryStatus("Cannot replace library while a match is active.", "error");
    return;
  }
  const gamesFile = ui.gameLibraryFile?.files?.[0];
  if (!gamesFile) {
    setLibraryStatus("Select games.json before loading.", "error");
    return;
  }
  const imageFile = ui.gameImageLibraryFile?.files?.[0];
  try {
    setLibraryStatus("Reading uploaded library...", "ok");
    const gamesPayload = await readJsonFromFile(gamesFile);
    const imageManifest = imageFile ? await readJsonFromFile(imageFile) : {};
    applyUploadedLibrary(gamesPayload, imageManifest);
    setLibraryStatus(`Loaded ${GAME_CARDS.length} cards from uploaded files.`, "ok");
    log(`Library loaded from uploaded files: ${GAME_CARDS.length} cards.`);
    propagateLibraryHash();
  } catch (error) {
    setLibraryStatus(`Failed to load uploaded files: ${error.message}`, "error");
  }
}

async function handleMismatchUpload() {
  const gamesFile = ui.mismatchGamesFile?.files?.[0];
  if (!gamesFile) {
    ui.mismatchStatus.textContent = "Select the host's games.json first.";
    ui.mismatchStatus.className = "muted error";
    return;
  }
  const imageFile = ui.mismatchImagesFile?.files?.[0];
  try {
    ui.mismatchStatus.textContent = "Reading library...";
    ui.mismatchStatus.className = "muted";
    const gamesPayload = await readJsonFromFile(gamesFile);
    const imageManifest = imageFile ? await readJsonFromFile(imageFile) : {};
    applyUploadedLibrary(gamesPayload, imageManifest);
    propagateLibraryHash();
    if (isLibraryMismatched()) {
      ui.mismatchStatus.textContent = "Loaded, but still doesn't match the host. Make sure you're using the exact same files (including game-images.json).";
      ui.mismatchStatus.className = "muted error";
    } else {
      ui.mismatchStatus.textContent = "Matched! You can ready up now.";
      ui.mismatchStatus.className = "muted ok";
    }
    renderLibraryMismatch();
    updateReadyUI();
  } catch (error) {
    ui.mismatchStatus.textContent = `Failed to load: ${error.message}`;
    ui.mismatchStatus.className = "muted error";
  }
}

function propagateLibraryHash() {
  if (isHost && hostState) {
    hostState.libraryHash = localLibraryHash;
    const me = hostGetPlayer(playerId);
    if (me) me.libraryHash = localLibraryHash;
    hostBroadcastState(hostState.revealCurrent);
  } else if (hostConnection && hostConnection.open) {
    hostConnection.send({ type: "library-hash", hash: localLibraryHash });
  }
}

async function loadGameLibrary() {
  setLibraryStatus("Loading library from games.json...");
  const imageManifest = await loadGameImageManifest();
  const loaded = await loadJsonByCandidates(GAME_LIBRARY_FILES, "games.json");
  if (Array.isArray(loaded.payload) && loaded.payload.length) {
    const cards = dedupeGames(applyImageManifest(normalizeGameLibrary(loaded.payload), imageManifest));
    if (cards.length) {
      GAME_CARDS = cards;
      setLibraryStatus(`Loaded ${GAME_CARDS.length} cards from ${loaded.file}.`, "ok");
    } else {
      GAME_CARDS = dedupeGames(applyImageManifest(fallbackLibraryCards(), imageManifest));
      setLibraryStatus("games.json had no usable cards; fallback library active.", "error");
    }
  } else {
    GAME_CARDS = dedupeGames(applyImageManifest(fallbackLibraryCards(), imageManifest));
    setLibraryStatus("No valid games.json found. Using built-in fallback cards.", "error");
  }
  reindexGameCards();
  refreshSearchIndex();
  refreshLocalLibraryHash();
}

function levenshtein(a, b) {
  const source = String(a || "");
  const target = String(b || "");
  const matrix = Array.from({ length: source.length + 1 }, (_, rowIndex) => (
    Array.from({ length: target.length + 1 }, (_, colIndex) => {
      if (rowIndex === 0) return colIndex;
      if (colIndex === 0) return rowIndex;
      return 0;
    })
  ));
  for (let row = 1; row <= source.length; row += 1) {
    for (let col = 1; col <= target.length; col += 1) {
      const cost = source[row - 1] === target[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }
  return matrix[source.length][target.length];
}

function guessScore(available, query) {
  if (!query) return 0;
  if (available === query) return 0;
  if (available.startsWith(query)) return 1;
  if (available.includes(query)) return 2;
  return Math.min(4, levenshtein(available, query));
}

function updateSuggestions(raw = "", source = [], datalist) {
  const query = normalizeText(raw);
  let options = [...source];
  if (query) {
    options = options
      .map((value) => ({ value, score: guessScore(normalizeText(value), query) }))
      .sort((a, b) => a.score - b.score || a.value.localeCompare(b.value))
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

function canonicalGuess(raw, source) {
  const normalized = normalizeText(raw);
  if (!normalized) return raw ? raw.trim() : "";
  const direct = source.find((value) => normalizeText(value) === normalized);
  if (direct) return direct;
  const scored = source
    .map((value) => ({ value, score: guessScore(normalizeText(value), normalized) }))
    .sort((a, b) => a.score - b.score || a.value.localeCompare(b.value));
  return scored.length && scored[0].score <= 4 ? scored[0].value : raw.trim();
}

function canonicalGuessTitle(raw) {
  return canonicalGuess(raw, suggestionTitles);
}

function canonicalGuessStudio(raw) {
  return canonicalGuess(raw, suggestionStudios);
}

function currentPlayerState() {
  return gameState.players.find((player) => player.id === playerId) || null;
}

function activePlayerState() {
  return gameState.players.find((player) => player.id === gameState.turnPlayerId) || null;
}

function isConnectedToLobby() {
  const hostReady = isHost && peer && peer.open;
  const clientReady = !isHost && hostConnection && hostConnection.open;
  return Boolean(hostReady || clientReady);
}

function setLobbyMode(mode) {
  lobbyMode = mode || "idle";
  updateLobbyActionVisibility();
}

function currentStage() {
  if (gameState.started) return "game";
  if (lobbyMode !== "idle") return "lobby";
  return "welcome";
}

function phaseLabel() {
  if (!gameState.started) return "Lobby";
  if (gameState.phase === "place") return gameState.turnPlayerId === playerId ? "Your spotlight" : "Watch closely";
  if (gameState.phase === "guess-window") return "Open Season";
  if (gameState.phase === "resolution") return "The Verdict";
  if (gameState.phase === "paused") return "Hold on...";
  return "Live";
}

function guideSlidesForRules(rules = DEFAULT_RULES) {
  const sample = {
    before: { title: "Portal", year: 2007, studio: "Valve" },
    after: { title: "Hades", year: 2020, studio: "Supergiant Games" },
    active: { title: "Skyrim", year: 2011, studio: "Bethesda" },
    wrongClaim: { player: "Alex", label: "after Hades" },
    rightClaim: { player: "Mila", label: "between Portal and Hades" }
  };
  const either = rules.guessMode === "either";
  return [
    {
      title: "Timeline placement",
      body: `Your row already has ${sample.before.title} (${sample.before.year}) and ${sample.after.title} (${sample.after.year}). The mystery card is ${sample.active.title}. It released in ${sample.active.year} — so it slots between them. Lock that gap, keep the card, gain a point.`,
      example: {
        type: "placement",
        sample
      }
    },
    {
      title: either ? "Gap challenges and secret bids" : "Strict secret bids",
      body: either
        ? `${sample.player || "Sam"} locks first — that gap's off the table. ${sample.wrongClaim.player} can challenge a different gap, and ${sample.rightClaim.player} can race to the true one. Secret bids stay hidden. Ranking: both fields beat title only, title only beats studio only.`
        : `${sample.player || "Sam"} locks first — that gap's off the table. Gap challenges are still first-come. Secret bids stay hidden. This match is strict: a bid only counts if you nail both the title and the studio.`,
      example: {
        type: "counter",
        sample,
        either
      }
    },
    {
      title: "Round payout and winning",
      body: `After the reveal, you'll see whether ${sample.active.title} stayed, got stolen, or was binned. Tokens move around, and someone might be one card away from the win.`,
      example: {
        type: "results",
        sample
      }
    }
  ];
}

function renderGuideExample(example) {
  ui.guideExample.innerHTML = "";
  if (!example?.sample) return;
  const { sample } = example;
  const row = document.createElement("div");
  row.className = "guideExampleRow";

  const before = document.createElement("div");
  before.className = "guideExampleCard";
  before.innerHTML = `<strong>${sample.before.title}</strong><span>${sample.before.year} • ${sample.before.studio}</span>`;

  const gap = document.createElement("div");
  gap.className = "guideExampleGap is-focus";

  const after = document.createElement("div");
  after.className = "guideExampleCard";
  after.innerHTML = `<strong>${sample.after.title}</strong><span>${sample.after.year} • ${sample.after.studio}</span>`;

  const note = document.createElement("div");
  note.className = "guideExampleNote";

  if (example.type === "placement") {
    gap.textContent = `→ ${sample.active.title} fits here`;
    note.textContent = `${sample.before.year} → ${sample.active.year} → ${sample.after.year} — that's the order`;
  } else if (example.type === "counter") {
    gap.textContent = `${sample.active.title} — locked`;
    note.textContent = example.either
      ? `${sample.rightClaim.player} can only win this gap by getting here first. Secret bids can still pay out for multiple players.`
      : `${sample.rightClaim.player} can still steal the card. But sealed bids only count if you nail both fields.`;
  } else {
    gap.textContent = `${sample.active.title} (${sample.active.year}) — revealed`;
    note.textContent = `If ${sample.rightClaim.player} called the right gap, they take the card. Miss with no challenger? Card's gone.`;
  }

  row.append(before, gap, after);
  ui.guideExample.append(row, note);
}

function renderGuide() {
  const slides = guideSlidesForRules(gameState.rules || DEFAULT_RULES);
  const index = Math.max(0, Math.min(slides.length - 1, guideState.currentSlide || 0));
  guideState.currentSlide = index;
  const slide = slides[index];
  ui.guideStepLabel.textContent = `Guide ${index + 1} / ${slides.length}`;
  ui.guideTitle.textContent = slide.title;
  ui.guideBody.textContent = slide.body;
  renderGuideExample(slide.example);
  ui.guidePrevBtn.disabled = index === 0;
  ui.guideNextBtn.classList.toggle("hidden", index >= slides.length - 1);
  ui.guideCompleteBtn.classList.toggle("hidden", index < slides.length - 1);
  ui.guideStatus.textContent = guideState.completed
    ? "You know the drill."
    : guideState.skipped
      ? "Skipped for now."
      : "Read the guide or skip it — your call.";
}

function renderLobbyPlayers() {
  ui.lobbyPlayersList.innerHTML = "";
  for (const player of gameState.players) {
    const row = document.createElement("div");
    row.className = "lobbyPlayerRow";
    const meta = document.createElement("div");
    meta.className = "lobbyPlayerMeta";
    const name = document.createElement("strong");
    name.textContent = `${player.name}${player.id === playerId ? " (you)" : ""}${player.isHost ? " • host" : ""}`;
    const status = document.createElement("span");
    status.className = "muted";
    status.textContent = player.connected ? "Online" : "Away";
    meta.append(name, status);

    const state = document.createElement("div");
    state.className = "lobbyPlayerState";
    const readyChip = document.createElement("span");
    readyChip.className = `statusChip ${player.ready ? "is-live" : ""}`;
    readyChip.textContent = player.ready ? "Ready" : "Not ready";
    state.appendChild(readyChip);
    if (!player.connected) {
      const disconnectedChip = document.createElement("span");
      disconnectedChip.className = "statusChip";
      disconnectedChip.textContent = "Offline";
      state.appendChild(disconnectedChip);
    }
    row.append(meta, state);
    ui.lobbyPlayersList.appendChild(row);
  }
}

function renderPlayerList(players) {
  ui.playerList.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    const turnTag = gameState.started && player.id === gameState.turnPlayerId ? " ▶" : "";
    li.textContent = `${player.name}${turnTag} — ${player.score} pts — ${player.tokens} tokens${player.connected === false ? " · offline" : ""}`;
    ui.playerList.appendChild(li);
  });
}

function readyCounts() {
  const eligible = gameState.players.filter((player) => player.connected !== false);
  return {
    connected: eligible.length,
    ready: eligible.filter((player) => player.ready).length
  };
}

function updateLobbyActionVisibility() {
  const connected = isConnectedToLobby();
  const hasRoom = Boolean(gameState.roomCode);
  const inSession = lobbyMode !== "idle" && lobbyMode !== "host_setup" && lobbyMode !== "join_setup";

  // Welcome-screen panels — mutually exclusive
  ui.choicePanel.classList.toggle("hidden", lobbyMode !== "idle");
  ui.hostSetupPanel.classList.toggle("hidden", lobbyMode !== "host_setup");
  ui.joinSetupPanel.classList.toggle("hidden", lobbyMode !== "join_setup");
  ui.roomInfoPanel.classList.toggle("hidden", !inSession || !hasRoom);

  // Lobby / game controls
  ui.hostBadge.classList.toggle("hidden", !isHost || !connected);
  ui.startGame.classList.toggle("hidden", !inSession || !isHost || gameState.started);
  ui.rulesSection.classList.toggle("hidden", !inSession || !isHost || gameState.started);
}

function updateRuleControls() {
  const rules = normalizeRules(gameState.rules || DEFAULT_RULES);
  ui.pointsToWinInput.value = String(rules.pointsToWin);
  ui.guessTimerPresetInput.value = rules.guessTimerPreset;
  ui.guessModeInput.value = rules.guessMode;
  if (ui.imageModeInput) ui.imageModeInput.value = rules.imageMode;
  ui.rulesHelp.textContent = rules.guessMode === "either"
    ? "Title or studio is enough. Ranking is both correct > title correct > studio correct. Active player wins exact ties."
    : "Title and studio requires both fields to be correct for any guess to win.";
}

function isLibraryMismatched() {
  if (isHost) return false;
  const hostHash = gameState.libraryHash || "";
  if (!hostHash) return false; // host's hash not known yet
  return hostHash !== localLibraryHash;
}

function renderLibraryMismatch() {
  const mismatch = isLibraryMismatched();
  ui.libraryMismatchPanel.classList.toggle("hidden", !mismatch || !gameState.roomCode);
}

function updateReadyUI() {
  const me = currentPlayerState();
  const mismatch = isLibraryMismatched();
  const canReady = lobbyMode !== "idle" && !gameState.started && !!me && !mismatch;
  ui.readyToggleBtn.disabled = !canReady;
  ui.readyToggleBtn.textContent = mismatch ? "Library mismatch" : me?.ready ? "Not yet" : "I'm ready";
  const counts = readyCounts();
  ui.lobbyReadySummary.textContent = gameState.started
    ? "Match is live."
    : mismatch
      ? "Your library doesn't match the host's — upload the host's files to ready up."
      : `${counts.ready} of ${counts.connected} players locked in. Everyone needs to be ready before the match starts.`;
  const guideSoftState = guideState.completed ? "Guide completed." : guideState.skipped ? "Guide skipped." : "Haven't seen the guide yet.";
  ui.rulesChangedNotice.textContent = gameState.rulesNotice || guideSoftState;
}

function updateSidebarStatus() {
  const stage = currentStage();
  ui.sidebarShell.classList.toggle("hidden", stage === "welcome");
  ui.matchStatusSection.classList.toggle("hidden", stage === "welcome");
  ui.currentPlayerInfo.textContent = playerId
    ? `You: ${currentPlayerState()?.name || cleanName(ui.username.value)}${isHost ? " (host)" : ""}`
    : "Not in a room.";
  ui.currentRoomState.textContent = gameState.roomCode
    ? `Room ${gameState.roomCode}${gameState.started ? " · live" : " · lobby"}`
    : "No room yet.";
  ui.matchPhaseSummary.textContent = `Phase: ${phaseLabel()}`;
  ui.matchRuleSummary.textContent = `Rules: ${ruleSummaryText(gameState.rules || DEFAULT_RULES)}`;
  ui.matchStatusSummary.textContent = gameState.started
    ? `${gameState.deckRemaining} cards remaining`
    : "No match yet.";
}

function lobbyLibraryMismatchNames() {
  return gameState.players
    .filter((player) => player.connected !== false && player.libraryMatches === false)
    .map((player) => player.name);
}

function renderLobbySummary() {
  const rules = normalizeRules(gameState.rules || DEFAULT_RULES);
  ui.matchSummaryText.textContent = ruleSummaryText(rules);
  const mismatchNames = lobbyLibraryMismatchNames();
  const canStart = Boolean(
    isHost && !gameState.started && gameState.players.length >= 2 &&
    gameState.players.every((player) => player.connected !== false && player.ready) &&
    mismatchNames.length === 0
  );
  ui.startGame.disabled = !canStart;
  if (isHost && !gameState.started && !canStart) {
    const counts = readyCounts();
    if (mismatchNames.length) {
      ui.startGame.textContent = `Library mismatch: ${mismatchNames.join(", ")}`;
    } else {
      ui.startGame.textContent = counts.connected < 2 ? "Need 2 players" : "Waiting on everyone";
    }
  } else {
    ui.startGame.textContent = "Launch match";
  }
}

function currentCounterWindow() {
  if (gameState.phase !== "guess-window") return null;
  return gameState.guessWindow || null;
}

function getCounterWindowRemainingSeconds() {
  const deadline = currentCounterWindow()?.deadlineAt || 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function getPauseRemainingSeconds() {
  const deadline = gameState.pausedState?.deadlineAt || 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function updateCountdownPresentation(labelEl, barEl, secondsLeft, totalSeconds) {
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  labelEl.textContent = secondsLeft > 0 ? `${secondsLeft}s` : "0s";
  if (barEl) barEl.style.transform = `scaleX(${progress})`;
  labelEl.classList.remove("countdown-warning", "countdown-danger", "countdown-pulse");
  if (secondsLeft <= 5) {
    labelEl.classList.add("countdown-danger", "countdown-pulse");
    if (barEl) barEl.parentElement?.classList.add("countdown-danger");
  } else if (secondsLeft <= Math.ceil(totalSeconds * 0.4)) {
    labelEl.classList.add("countdown-warning");
    if (barEl) barEl.parentElement?.classList.add("countdown-warning");
  } else if (barEl) {
    barEl.parentElement?.classList.remove("countdown-warning", "countdown-danger");
  }
}

function renderCounterBanner() {
  const windowState = currentCounterWindow();
  const activePlayer = activePlayerState();
  const me = currentPlayerState();
  const shouldShow = Boolean(windowState && activePlayer);
  ui.counterBanner.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    ui.localCountdown.classList.add("hidden");
    return;
  }
  const remaining = getCounterWindowRemainingSeconds();
  const total = Math.max(1, gameState.rules?.guessWindowSeconds || DEFAULT_RULES.guessWindowSeconds);
  const amActive = gameState.turnPlayerId === playerId;
  ui.counterBannerTitle.textContent = "Rivals are in play";
  ui.counterBannerText.textContent = amActive
    ? "You're locked in. Let them scramble."
    : "Quick — steal a gap or seal a secret bid.";
  updateCountdownPresentation(ui.countdownInfo, ui.countdownBar, remaining, total);
  ui.localCountdown.classList.remove("hidden");
  updateCountdownPresentation(ui.localCountdown, null, remaining, total);

  ui.counterActionStates.innerHTML = "";
  for (const player of gameState.players) {
    const card = document.createElement("div");
    card.className = "actionStateCard";
    const state = windowState.actionStates?.find((entry) => entry.playerId === player.id) || { slotClaimed: false, guessSubmitted: false, actionsUsed: 0 };
    const title = document.createElement("strong");
    title.textContent = `${player.name} • ${player.tokens} token${player.tokens === 1 ? "" : "s"}`;
    const detail = document.createElement("span");
    detail.className = "muted";
    if (player.id === gameState.turnPlayerId) {
      detail.textContent = state.slotClaimed ? "Gap called" : "Waiting on reveal";
    } else if (state.slotClaimed && state.guessSubmitted) {
      detail.textContent = "All in";
    } else if (state.slotClaimed) {
      detail.textContent = "Gap stolen";
    } else if (state.guessSubmitted) {
      detail.textContent = "Bid sealed";
    } else {
      detail.textContent = player.tokens > 0 ? "Still in play" : "Out of tokens";
    }
    if (player.id !== gameState.turnPlayerId && player.tokens > 0 && !(state.slotClaimed && state.guessSubmitted) && remaining <= 5) {
      card.classList.add("can-act", "can-act-pulse");
    }
    card.append(title, detail);
    ui.counterActionStates.appendChild(card);
  }
}

function renderPauseBanner() {
  const pause = gameState.pausedState;
  const show = Boolean(gameState.phase === "paused" && pause);
  ui.pauseBanner.classList.toggle("hidden", !show);
  if (!show) return;
  const activePlayer = gameState.players.find((player) => player.id === pause.playerId);
  ui.pauseTitle.textContent = "Hold on...";
  ui.pauseText.textContent = `${activePlayer?.name || "Active player"} dropped out. Waiting for them to come back. If they don't, this round gets skipped and the card goes back in the pile.`;
  ui.pauseCountdown.textContent = `${getPauseRemainingSeconds()}s`;
}

function cutoutForCard(cardId) {
  let hash = 2166136261;
  const s = String(cardId || "");
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // Two independent values in [15, 85] so the crop avoids the very edges,
  // plus a zoom factor that varies a little per card.
  const px = 15 + (hash % 71);
  const py = 15 + ((hash >>> 8) % 71);
  const zoom = 280 + ((hash >>> 16) % 120); // 280%–400%
  return { px, py, zoom };
}

function applyPromptCutout(card, on) {
  const frame = ui.promptImageFrame;
  if (!frame) return;
  if (on) {
    const { px, py, zoom } = cutoutForCard(card.id);
    frame.classList.add("is-cutout");
    frame.style.backgroundImage = `url("${card.image}")`;
    frame.style.backgroundSize = `${zoom}%`;
    frame.style.backgroundPosition = `${px}% ${py}%`;
  } else {
    frame.classList.remove("is-cutout");
    frame.style.backgroundImage = "";
  }
}

function renderPrompt() {
  const card = gameState.currentCard;
  const show = Boolean(gameState.started && card);
  ui.promptWrap.classList.toggle("hidden", !show);
  if (!show) {
    applyPromptCutout(null, false);
    return;
  }
  const isReveal = Boolean(gameState.revealCurrent || gameState.phase === "resolution");
  const cutout = (gameState.rules?.imageMode === "cutout") && !isReveal;
  ui.promptTitle.textContent = gameState.phase === "resolution" ? "Unmasked" : "Now Showing";
  ui.promptImage.src = card.image;
  ui.promptImage.alt = isReveal ? safeText(card.title, "Revealed card") : "Mystery screenshot";
  applyPromptCutout(card, cutout);
  ui.promptMeta.textContent = isReveal
    ? `${card.title} — ${card.year} — ${card.studio}`
    : cutout
      ? "Just a sliver of the screenshot. Name the game from the detail before time's up."
      : "Screenshot locked in. Title, studio, and year drop when time's up.";
}

function fillPositionOptions(selectEl, rowCards, reserved = new Set(), labelPrefix = "Place") {
  selectEl.innerHTML = "";
  for (let index = 0; index <= rowCards.length; index += 1) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${labelPrefix} ${describeSlot(rowCards, index, "as")}`;
    if (reserved.has(index)) option.disabled = true;
    selectEl.appendChild(option);
  }
}

function renderActiveTurnPanel() {
  const activePlayer = activePlayerState();
  const me = currentPlayerState();
  const card = gameState.currentCard;
  const isMyTurn = Boolean(activePlayer && activePlayer.id === playerId && gameState.phase === "place" && card);
  const rules = gameState.rules || DEFAULT_RULES;
  ui.activeTurnPanel.classList.toggle("hidden", !isMyTurn);
  if (!isMyTurn || !activePlayer) return;
  fillPositionOptions(ui.positionSelect, activePlayer.row || []);
  ui.positionSelect.disabled = false;
  ui.placeBtn.disabled = false;
  ui.guessTitle.disabled = false;
  ui.guessStudio.disabled = false;
  ui.guessStudioRow.classList.toggle("hidden", false);
  if (rules.guessMode === "both") {
    ui.guessTitleLabel.textContent = "Title (required)";
    ui.guessStudioLabel.textContent = "Studio (required)";
    ui.guessStatus.textContent = "This match needs both. Lock in your title and studio, then opponents get their window.";
  } else {
    ui.guessTitleLabel.textContent = "Guess title";
    ui.guessStudioLabel.textContent = "Guess studio";
    ui.guessStatus.textContent = "Title, studio, or both — your call. Ranking: both > title > studio. Ties go to the active player.";
  }
  const myTokens = me?.tokens || 0;
  ui.rerollBtn.disabled = !(myTokens >= 1 && gameState.deckRemaining > 0);
  ui.autoPlaceBtn.disabled = !(myTokens >= 3);
}

function renderOpponentPanel() {
  const windowState = currentCounterWindow();
  const activePlayer = activePlayerState();
  const me = currentPlayerState();
  const rules = gameState.rules || DEFAULT_RULES;
  const isOpponent = Boolean(windowState && activePlayer && playerId && playerId !== activePlayer.id);
  ui.opponentGuessPanel.classList.toggle("hidden", !isOpponent);
  if (!isOpponent || !activePlayer || !me) return;

  const myState = windowState.actionStates?.find((entry) => entry.playerId === playerId) || { slotClaimed: false, guessSubmitted: false };
  const myClaim = windowState.placementClaims?.find((entry) => entry.playerId === playerId) || null;
  const myGuess = windowState.guessSubmissions?.find((entry) => entry.playerId === playerId) || null;
  const reserved = new Set([
    windowState.activePlacement?.position,
    ...(windowState.placementClaims || []).map((entry) => entry.position)
  ].filter((value) => Number.isInteger(value)));
  fillPositionOptions(ui.opponentPlacementSelect, activePlayer.row || [], reserved, "Claim");

  const canClaim = me.tokens > 0 && !myState.slotClaimed;
  const canGuess = me.tokens > 0 && !myState.guessSubmitted;
  ui.opponentPlacementSelect.disabled = !canClaim;
  ui.opponentPlacementBtn.disabled = !canClaim;
  ui.opponentGuessTitle.disabled = !canGuess;
  ui.opponentGuessStudio.disabled = !canGuess;
  ui.opponentGuessBtn.disabled = !canGuess;

  ui.placementActionState.textContent = myState.slotClaimed ? "Locked" : "Open";
  ui.guessActionState.textContent = myState.guessSubmitted ? "Locked" : "Open";
  ui.counterPlacementCard.classList.toggle("is-dimmed", myState.slotClaimed && myState.guessSubmitted);
  ui.counterGuessCard.classList.toggle("is-dimmed", myState.slotClaimed && myState.guessSubmitted);

  if (rules.guessMode === "both") {
    ui.opponentGuessTitleLabel.textContent = "Title (required)";
    ui.opponentGuessStudioLabel.textContent = "Studio (required)";
    ui.counterGuessRiskText.textContent = "Spend 1 token. Both fields required this match.";
  } else {
    ui.opponentGuessTitleLabel.textContent = "Your title guess";
    ui.opponentGuessStudioLabel.textContent = "Your studio guess";
    ui.counterGuessRiskText.textContent = "Spend 1 token. Title, studio, or both — ranked wins decide.";
  }

  ui.opponentPlacementHint.textContent = myClaim
    ? `Gap called ${describeSlot(activePlayer.row || [], myClaim.position, "as")}.`
    : me.tokens < 1
      ? "Need 1 token to steal a gap."
      : "Spend 1 token to call a gap before someone else does.";

  ui.opponentGuessHint.textContent = myGuess
    ? "Your sealed bid is in."
    : me.tokens < 1
      ? "Need 1 token to seal a bid."
      : rules.guessMode === "both"
        ? "Both fields required this match."
        : "Title or studio alone is fine this match.";

  if (myState.slotClaimed && !myState.guessSubmitted) {
    ui.counterPlacementCard.classList.remove("is-dimmed");
    ui.counterGuessCard.classList.remove("is-dimmed");
  }
  if (!myState.slotClaimed && myState.guessSubmitted) {
    ui.counterPlacementCard.classList.remove("is-dimmed");
    ui.counterGuessCard.classList.remove("is-dimmed");
  }
}

function renderWaitingPanel() {
  const show = Boolean(gameState.started && !gameState.currentCard && gameState.phase !== "resolution");
  const revealWaiting = gameState.phase === "guess-window" && gameState.turnPlayerId === playerId;
  ui.waitingPanel.classList.toggle("hidden", !show && !revealWaiting);
  if (ui.waitingPanel.classList.contains("hidden")) return;
  ui.waitingHint.textContent = revealWaiting
    ? "You're locked in. Opponents are still circling."
    : gameState.phase === "resolution"
      ? "The tape is rolling..."
      : "Not your turn. Eyes on the board.";
}

function renderHelperPanel() {
  if (!gameState.started) {
    ui.firstMatchHelper.classList.add("hidden");
    return;
  }
  const currentPhase = gameState.phase === "place" ? "place" : gameState.phase === "guess-window" ? "guess-window" : gameState.phase === "resolution" ? "resolution" : "";
  if (currentPhase && !guideState.seenPhases[currentPhase]) {
    guideState.seenPhases[currentPhase] = true;
    persistGuideState();
  }
  const show = !Object.values(guideState.seenPhases).every(Boolean);
  ui.firstMatchHelper.classList.toggle("hidden", !show);
  if (!show) return;
  const compactTone = guideState.completed;
  if (gameState.phase === "place") {
    ui.helperTitle.textContent = compactTone ? "Your spotlight" : "Place the card";
    ui.helperBody.textContent = "Find where this screenshot fits on the timeline, then drop it before the window opens.";
  } else if (gameState.phase === "guess-window") {
    ui.helperTitle.textContent = compactTone ? "Open Season" : "Open Season";
    ui.helperBody.textContent = "Steal a gap or seal a secret bid before the clock runs out.";
  } else {
    ui.helperTitle.textContent = compactTone ? "The Verdict" : "The Verdict";
    ui.helperBody.textContent = "See who kept it, who stole it, and who's closing in on the win.";
  }
}

function renderPayoutList(entries = []) {
  ui.resultsPayoutList.innerHTML = "";
  for (const entry of entries) {
    const item = document.createElement("article");
    item.className = `payoutItem ${entry.highlight ? "is-highlight" : ""}`.trim();
    const header = document.createElement("strong");
    header.textContent = entry.name;
    const outcome = document.createElement("span");
    outcome.className = "muted";
    outcome.textContent = entry.outcome;
    const meta = document.createElement("div");
    meta.className = "payoutMeta";
    for (const chip of entry.deltaChips) {
      const el = document.createElement("span");
      el.className = `deltaChip ${chip.kind}`.trim();
      el.textContent = chip.label;
      meta.appendChild(el);
    }
    item.append(header, outcome, meta);
    ui.resultsPayoutList.appendChild(item);
  }
}

function renderTimelineSlice(slice = {}) {
  ui.resultsTimelineSlice.innerHTML = "";
  const local = document.createElement("div");
  local.className = "timelineSliceRow";
  if (slice.before) {
    const before = document.createElement("span");
    before.className = "timelineCardChip";
    before.textContent = cardLabel(slice.before);
    local.appendChild(before);
  }
  if (slice.chosen && slice.chosen.index !== slice.correct?.index) {
    const miss = document.createElement("span");
    miss.className = "timelineGapChip is-miss";
    miss.textContent = `Chosen gap ${slice.chosen.label}`;
    local.appendChild(miss);
  }
  if (slice.correct) {
    const correct = document.createElement("span");
    correct.className = `timelineGapChip is-correct ${slice.correct.spotlight ? "is-winning" : ""}`.trim();
    correct.textContent = `Correct gap ${slice.correct.label}`;
    local.appendChild(correct);
  }
  if (slice.after) {
    const after = document.createElement("span");
    after.className = "timelineCardChip";
    after.textContent = cardLabel(slice.after);
    local.appendChild(after);
  }
  ui.resultsTimelineSlice.appendChild(local);
}

function renderResults() {
  const result = gameState.roundResult;
  const show = Boolean(gameState.phase === "resolution" && result);
  ui.resultsView.classList.toggle("hidden", !show);
  if (!show || !result) return;
  ui.resultsHeadline.textContent = result.headline;
  ui.resultsImage.src = result.card?.image || "";
  ui.resultsCardMeta.textContent = `${result.card?.title || ""} — ${result.card?.year || ""} — ${result.card?.studio || ""}`;
  ui.resultsPlacementSummary.textContent = result.placementSummary;
  ui.resultsGuessSummary.textContent = result.guessSummary;
  ui.resultsCounterSummary.textContent = result.counterSummary;
  ui.resultsReplaySummary.textContent = result.replaySummary;
  ui.resultsRaceSummary.textContent = result.raceSummary;
  renderTimelineSlice(result.timelineSlice);
  renderPayoutList(result.payouts);
  ui.whyGuessPanel.open = false;
  ui.whyGuessSummary.textContent = result.guessWhySummary || "No guess comparison was needed this round.";
  ui.whyGuessAll.textContent = result.guessWhyAll || "";
  ui.skipResultsBtn.classList.toggle("hidden", !isHost);
}

function renderRows() {
  ui.rowsArea.innerHTML = "";
  const windowState = currentCounterWindow();
  const result = gameState.roundResult;
  const activePlayer = activePlayerState();
  for (const player of gameState.players) {
    const section = document.createElement("section");
    section.className = "playerRow";
    const heading = document.createElement("div");
    heading.className = "playerRowHeader";
    const title = document.createElement("h4");
    title.textContent = `${player.name}${player.id === gameState.turnPlayerId && gameState.started ? " — up now" : ""}`;
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = `${player.score} pts · ${player.tokens} tokens${player.connected === false ? " · offline" : ""}`;
    heading.append(title, meta);

    const track = document.createElement("div");
    track.className = "rowTrack";
    const showCounterMarkers = Boolean(windowState && player.id === activePlayer?.id);
    const rowCards = player.row || [];
    for (let index = 0; index <= rowCards.length; index += 1) {
      if (showCounterMarkers) {
        const gap = document.createElement("div");
        gap.className = "gapMarker";
        const isActiveLock = windowState.activePlacement?.position === index;
        const claim = (windowState.placementClaims || []).find((entry) => entry.position === index);
        if (isActiveLock) {
          gap.classList.add("is-active-lock");
          gap.textContent = `↓ ${activePlayer?.name || "active player"}'s pick`;
        } else if (claim) {
          gap.classList.add("is-claim");
          gap.textContent = `↑ ${claim.name}'s call`;
        } else {
          gap.textContent = describeSlot(rowCards, index, "as");
        }
        track.appendChild(gap);
      }

      if (index < rowCards.length) {
        const card = renderCard(rowCards[index], true);
        track.appendChild(card);
      }
    }

    if (result && player.id === result.activePlayerId && result.highlightedCorrectGap && !currentCounterWindow()) {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = result.highlightedCorrectGap;
      section.appendChild(note);
    }
    section.append(heading, track);
    ui.rowsArea.appendChild(section);
  }
}

function renderCard(card, showDetails = false) {
  const tile = document.createElement("article");
  tile.className = "card";
  const image = document.createElement("img");
  image.src = card.image;
  image.alt = "Video game screenshot";
  const titleLine = document.createElement("p");
  titleLine.textContent = card.title;
  const detailLine = document.createElement("p");
  detailLine.className = "muted";
  detailLine.textContent = showDetails ? `${card.year} • ${card.studio}` : `${card.studio} / ${card.year}`;
  tile.append(image, titleLine, detailLine);
  return tile;
}

function renderMainSections() {
  const stage = currentStage();
  ui.welcomeScreen.classList.toggle("hidden", stage !== "welcome");
  ui.lobbyScreen.classList.toggle("hidden", stage !== "lobby");
  ui.gameSection.classList.toggle("hidden", stage !== "game");
}

function syncPhaseAnimations() {
  const key = `${currentStage()}-${gameState.phase}-${gameState.turnPlayerId}-${Boolean(gameState.roundResult)}`;
  if (key === phaseEntryKey) return;
  phaseEntryKey = key;
  [ui.counterBanner, ui.resultsView, ui.pauseBanner].forEach((element) => {
    element.classList.remove("phase-enter");
    void element.offsetWidth;
    element.classList.add("phase-enter");
  });
}

function renderStatusText() {
  const activePlayer = activePlayerState();
  ui.phaseInfo.textContent = `Phase: ${phaseLabel()}`;
  ui.turnInfo.textContent = gameState.started ? `Up: ${activePlayer?.name || "—"}` : "";
  ui.deckInfo.textContent = gameState.started ? `${gameState.deckRemaining} cards left` : "";
  ui.roomStatus.textContent = gameState.roundMessage || (gameState.started ? "Match live." : "No room open yet.");
}

function renderGuideAndReadyControls() {
  renderGuide();
  renderLobbyPlayers();
  updateReadyUI();
  renderLobbySummary();
}

function applyState(state, myStablePlayerId = "") {
  gameState = hydrateSyncedState(clone(state));
  gameState.rules = normalizeRules(gameState.rules || DEFAULT_RULES);
  if (myStablePlayerId) playerId = myStablePlayerId;
  renderMainSections();
  updateLobbyActionVisibility();
  updateRuleControls();
  renderGuideAndReadyControls();
  renderLibraryMismatch();
  renderPlayerList(gameState.players || []);
  renderStatusText();
  updateSidebarStatus();
  renderCounterBanner();
  renderPauseBanner();
  renderPrompt();
  renderActiveTurnPanel();
  renderOpponentPanel();
  renderWaitingPanel();
  renderResults();
  renderRows();
  renderHelperPanel();
  syncPhaseAnimations();
  syncClientTicker();
}

function buildActionStates(players, guessWindow) {
  return players.map((player) => {
    const slotClaimed = player.id === guessWindow?.activePlacement?.playerId || (guessWindow?.placementClaims || []).some((entry) => entry.playerId === player.id);
    const guessSubmitted = (guessWindow?.guessSubmissions || []).some((entry) => entry.playerId === player.id);
    return {
      playerId: player.id,
      slotClaimed,
      guessSubmitted,
      actionsUsed: Number(slotClaimed) + Number(guessSubmitted)
    };
  });
}

function hostBuildStateForViewer(viewerPeerId, revealCurrent = hostState?.revealCurrent) {
  const viewerPlayer = hostState.players.find((player) => player.peerId === viewerPeerId) || null;
  const viewerId = viewerPlayer?.id || hostState.players.find((player) => player.isHost)?.id || "";
  const shouldReveal = Boolean(revealCurrent);
  const visibleCard = gameStateForCard(hostState.currentCard, shouldReveal);
  const guessWindow = hostState.guessWindow
    ? {
        ...clone(hostState.guessWindow),
        actionStates: buildActionStates(hostState.players, hostState.guessWindow)
      }
    : null;
  return {
    roomCode: hostState.roomCode,
    rules: clone(hostState.rules || DEFAULT_RULES),
    players: clone(hostState.players).map((player) => ({
      id: player.id,
      name: player.name,
      isHost: Boolean(player.isHost),
      score: player.score,
      tokens: player.tokens,
      ready: Boolean(player.ready),
      connected: player.connected !== false,
      libraryMatches: (player.libraryHash || "") === (hostState.libraryHash || ""),
      row: Array.isArray(player.row) ? player.row.map(syncCardForPeer) : []
    })),
    started: hostState.started,
    phase: hostState.phase,
    turnPlayerId: hostState.turnPlayerId,
    currentCard: visibleCard ? syncCardForPeer(visibleCard) : null,
    deckRemaining: hostState.deck.length,
    revealCurrent: shouldReveal,
    guessWindow,
    pausedState: clone(hostState.pausedState),
    roundResult: hostState.roundResult ? stripImagesDeep(clone(hostState.roundResult)) : null,
    roundMessage: hostState.roundMessage,
    roundPulse: hostState.roundPulse,
    rulesNotice: hostState.rulesNotice,
    libraryHash: hostState.libraryHash || "",
    myPlayerId: viewerId
  };
}

function hostBroadcastState(revealCurrent = hostState?.revealCurrent) {
  for (const conn of Object.values(hostConnections)) {
    if (conn.open) {
      const state = hostBuildStateForViewer(conn.peer, revealCurrent);
      conn.send({ type: "lobby-state", state, myPlayerId: state.myPlayerId });
    }
  }
  if (isHost && hostState) {
    const state = hostBuildStateForViewer(peerId, revealCurrent);
    applyState(state, state.myPlayerId);
  }
}

function hostSystem(message, type = "ok") {
  hostState.roundMessage = message;
  for (const conn of Object.values(hostConnections)) {
    if (conn.open) conn.send({ type: "system", message, kind: type });
  }
  if (isHost) log(message, type);
}

function hostGetPlayer(id) {
  return hostState.players.find((player) => player.id === id) || null;
}

function hostFindPlayerBySession(playerSessionId) {
  return hostState.players.find((player) => player.sessionId === playerSessionId) || null;
}

function hostBuildUniqueName(rawName, exceptPlayerId = "") {
  const base = cleanName(rawName);
  let candidate = base;
  let suffix = 1;
  while (hostState.players.some((player) => player.id !== exceptPlayerId && player.name.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  return candidate;
}

function hostResetReadyStates(message = "") {
  hostState.players.forEach((player) => {
    player.ready = false;
  });
  hostState.rulesNotice = message;
}

function hostUpdateGuideState(player, update = {}) {
  if (!player) return;
  if (update.completed === true) {
    player.guideCompleted = true;
    player.guideSkipped = false;
  }
  if (update.skipped === true) {
    player.guideSkipped = true;
  }
}

function hostAddPlayer(payload, peerKey) {
  const name = hostBuildUniqueName(payload.username || "Player");
  const player = {
    id: generateId("player"),
    sessionId: payload.sessionId || generateId("session"),
    peerId: peerKey,
    name,
    isHost: false,
    score: 0,
    tokens: STARTING_TOKENS,
    row: [],
    ready: false,
    connected: true,
    libraryHash: payload.libraryHash || "",
    guideCompleted: Boolean(payload.guideCompleted),
    guideSkipped: Boolean(payload.guideSkipped)
  };
  hostState.players.push(player);
  return player;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
  peer.on("error", (error) => {
    if (resolved) return;
    if (attempt + 1 < PEER_SERVER_CONFIGS.length) {
      peer.destroy();
      setTimeout(() => openPeer(id, onOpen, onError, attempt + 1), 250);
      return;
    }
    resolved = true;
    onError(error);
  });
  peer.on("disconnected", () => {
    showStatus("Peer service disconnected.", "warn");
    log("Peer service disconnected.", "warn");
  });
}

function showStatus(message, className = "") {
  ui.roomStatus.textContent = message;
  ui.roomStatus.className = className;
}

function showHostSetup() {
  const name = cleanName(ui.username.value);
  if (!name) { showStatus("Pick a name first.", "warn"); return; }
  saveUsername(name);
  setLobbyMode("host_setup");
}

function showJoinSetup() {
  const name = cleanName(ui.username.value);
  if (!name) { showStatus("Pick a name first.", "warn"); return; }
  saveUsername(name);
  setLobbyMode("join_setup");
}

function hostStartLobby() {
  const name = cleanName(ui.username.value);
  if (!name) {
    showStatus("Pick a name first.", "warn");
    return;
  }
  saveUsername(name);
  setLobbyMode("hosting");
  roomCode = generateRoomCode();
  isHost = true;
  openPeer(roomCode, (assignedId) => {
    peerId = assignedId;
    const hostPlayer = {
      id: generateId("player"),
      sessionId,
      peerId: assignedId,
      name,
      isHost: true,
      score: 0,
      tokens: STARTING_TOKENS,
      row: [],
      ready: false,
      connected: true,
      libraryHash: localLibraryHash,
      guideCompleted: guideState.completed,
      guideSkipped: guideState.skipped
    };
    hostState = {
      roomCode,
      rules: clone(DEFAULT_RULES),
      players: [hostPlayer],
      deck: [],
      discard: [],
      started: false,
      phase: "lobby",
      turnPlayerId: "",
      turnIndex: 0,
      currentCard: null,
      revealCurrent: false,
      guessWindow: null,
      pausedState: null,
      roundResult: null,
      roundMessage: "Room open. Share the code.",
      roundPulse: "none",
      rulesNotice: "",
      libraryHash: localLibraryHash
    };
    hostConnections = {};
    playerId = hostPlayer.id;

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        // A newer connection from the same peer supersedes any older one.
        const existing = hostConnections[conn.peer];
        if (existing && existing !== conn) {
          try { existing.close(); } catch { /* ignore */ }
        }
        hostConnections[conn.peer] = conn;
      });
      conn.on("data", (payload) => {
        if (!payload || typeof payload.type !== "string") return;
        handleHostPayload(conn, payload);
      });
      conn.on("close", () => {
        // Ignore a stale/zombie connection's close — only the currently
        // registered connection for this peer should trigger a disconnect.
        if (hostConnections[conn.peer] === conn) handleHostDisconnect(conn.peer);
      });
      conn.on("error", () => {
        if (hostConnections[conn.peer] === conn) handleHostDisconnect(conn.peer);
      });
    });

    hostBroadcastState();
    showStatus(`Room ${roomCode} is live. Invite your crew.`, "ok");
    log(`Room ${roomCode} created.`);
    setLobbyMode("connected");
  }, (error) => {
    setLobbyMode("host_setup");
    showStatus(`Peer error: ${error.message}`, "error");
    log(`Peer error: ${error.message}`, "error");
  });
}

function handleHostPayload(conn, payload) {
  if (payload.type === "ping") {
    try { conn.send({ type: "pong", t: payload.t }); } catch { /* ignore */ }
    return;
  }
  if (payload.type === "join-request") {
    handleHostJoinRequest(conn, payload);
    return;
  }
  const actor = hostState.players.find((player) => player.peerId === conn.peer);
  if (!actor) return;

  if (payload.type === "guide-state") {
    hostUpdateGuideState(actor, payload);
    hostBroadcastState();
    return;
  }

  if (payload.type === "library-hash") {
    actor.libraryHash = payload.hash || "";
    hostBroadcastState(hostState.revealCurrent);
    return;
  }

  if (payload.type === "toggle-ready") {
    if (hostState.started) return;
    actor.ready = !actor.ready;
    hostState.rulesNotice = "";
    hostBroadcastState();
    return;
  }

  if (payload.type === "skip-results") {
    if (hostState.phase === "resolution") hostAdvanceAfterResults();
    return;
  }

  if (payload.type === "start-game") {
    hostHandleStartGame();
    return;
  }

  if (!hostState.started) return;

  if (payload.type === "place") {
    hostHandlePlace(actor.id, payload.position, payload.guessTitle, payload.guessStudio);
    return;
  }
  if (payload.type === "reroll") {
    hostHandleReroll(actor.id);
    return;
  }
  if (payload.type === "auto-place") {
    hostHandleAutoPlace(actor.id);
    return;
  }
  if (payload.type === "placement-claim") {
    hostHandleCounterPlacementClaim(actor.id, payload.position);
    return;
  }
  if (payload.type === "opponent-guess") {
    hostHandleOpponentGuess(actor.id, payload.guessTitle, payload.guessStudio);
  }
}

function handleHostJoinRequest(conn, payload) {
  const existing = hostFindPlayerBySession(payload.sessionId);
  if (existing) {
    existing.peerId = conn.peer;
    existing.connected = true;
    existing.name = hostBuildUniqueName(payload.username || existing.name, existing.id);
    existing.libraryHash = payload.libraryHash || "";
    hostUpdateGuideState(existing, payload);
    if (!hostState.started && hostState.rulesNotice === `${existing.name} dropped out.`) {
      hostState.rulesNotice = "";
    }
    conn.send({ type: "system", message: `Welcome back, ${existing.name}. You're in.`, kind: "ok" });
    if (hostState.phase === "paused" && hostState.pausedState?.playerId === existing.id) {
      clearTimeout(hostPauseTimer);
      hostPauseTimer = null;
      hostState.pausedState = null;
      hostState.phase = "place";
      hostState.roundMessage = `${existing.name} is back. Turn resumes.`;
    }
    hostBroadcastState(hostState.revealCurrent);
    return;
  }

  if (hostState.started) {
    conn.send({ type: "error", message: "Match already started. Only reconnecting players can rejoin.", kind: "error" });
    return;
  }

  if (hostState.players.length >= 8) {
    conn.send({ type: "error", message: "Room's full.", kind: "error" });
    return;
  }

  const player = hostAddPlayer(payload, conn.peer);
  conn.send({ type: "system", message: `You're in, ${player.name}. Get ready.`, kind: "ok" });
  hostSystem(`${player.name} joined the room.`, "ok");
  hostBroadcastState();
}

function handleHostDisconnect(peerKey) {
  delete hostConnections[peerKey];
  if (!hostState) return;
  const player = hostState.players.find((entry) => entry.peerId === peerKey);
  if (!player) return;
  player.connected = false;
  player.peerId = "";
  hostState.rulesNotice = hostState.started ? hostState.rulesNotice : `${player.name} dropped out.`;

  if (hostState.started && player.id === hostState.turnPlayerId) {
    if (hostState.phase === "place") {
      startActiveReconnectPause(player);
    } else if (hostState.phase === "guess-window" && hostState.guessWindow) {
      hostState.guessWindow.activePlayerDisconnected = true;
      hostState.guessWindow.disconnectNotedAt = Date.now();
    }
  }
  hostBroadcastState(hostState.revealCurrent);
}

function buildJoinPayload(username) {
  return {
    type: "join-request",
    username,
    sessionId,
    libraryHash: localLibraryHash,
    guideCompleted: guideState.completed,
    guideSkipped: guideState.skipped
  };
}

function joinLobby() {
  const name = cleanName(ui.username.value);
  if (!name) {
    showStatus("Pick a name first.", "warn");
    return;
  }
  saveUsername(name);
  roomCode = ui.roomCodeInput.value.trim().toUpperCase();
  if (!roomCode || roomCode.length !== 6) {
    showStatus("Room codes are 6 characters.", "warn");
    return;
  }
  isHost = false;
  setLobbyMode("join_pending");
  openPeer(null, (assignedId) => {
    peerId = assignedId;
    connectToHost(roomCode, name);
  }, (error) => {
    setLobbyMode("join_setup");
    showStatus(`Peer error: ${error.message}`, "error");
    log(`Peer error: ${error.message}`, "error");
  });
}

let connTrace = [];

function setConnDiag(message, kind = "") {
  if (!ui.connDiag) return;
  if (!message) {
    ui.connDiag.classList.add("hidden");
    return;
  }
  ui.connDiag.textContent = message;
  ui.connDiag.className = `connDiag ${kind ? `is-${kind}` : ""}`.trim();
}

function connTraceEvent(event, kind = "warn") {
  connTrace.push(event);
  if (connTrace.length > 8) connTrace = connTrace.slice(-8);
  setConnDiag(connTrace.join(" → "), kind);
}

function monitorIceConnection(conn, myGen) {
  const pc = conn?.peerConnection;
  if (!pc) {
    log("No RTCPeerConnection available to monitor.", "warn");
    return;
  }
  // Log ICE state to the debug log only — the banner is reserved for the
  // message trace so we can see the host->client flow.
  log(`ICE state: ${pc.iceConnectionState} (initial).`);
  const onChange = () => {
    if (clientConnectionGen !== myGen) return;
    const state = pc.iceConnectionState;
    log(`ICE state changed: ${state}.`, state === "failed" || state === "disconnected" ? "warn" : "ok");
    if (state === "failed") connTraceEvent("ICE-FAILED", "error");
  };
  pc.addEventListener("iceconnectionstatechange", onChange);
}

function stopClientHeartbeat() {
  if (clientHeartbeatTimer) {
    clearInterval(clientHeartbeatTimer);
    clientHeartbeatTimer = null;
  }
}

function startClientHeartbeat(code, username, myGen) {
  stopClientHeartbeat();
  clientLastPongAt = Date.now();
  clientHeartbeatTimer = setInterval(() => {
    if (clientConnectionGen !== myGen || isHost) {
      stopClientHeartbeat();
      return;
    }
    // No reply for too long → the connection is silently dead (half-open). Reconnect.
    if (Date.now() - clientLastPongAt > 12000) {
      log("Heartbeat timeout — connection dead, reconnecting.", "warn");
      setConnDiag("✕ Connection lost (no heartbeat) — reconnecting...", "error");
      stopClientHeartbeat();
      try { hostConnection && hostConnection.close(); } catch { /* ignore */ }
      connectToHost(code, username, 0); // fresh gen supersedes the dead one
      return;
    }
    if (hostConnection && hostConnection.open) {
      try { hostConnection.send({ type: "ping", t: Date.now() }); } catch { /* ignore */ }
    }
  }, 4000);
}

function connectToHost(code, username, attempt = 0) {
  const maxAttempts = 3;
  const myGen = ++clientConnectionGen;

  if (!peer || !peer.open) {
    showStatus("Peer service not ready. Try again.", "error");
    setLobbyMode("idle");
    return;
  }
  if (hostConnection) {
    try { hostConnection.close(); } catch { /* ignore */ }
    hostConnection = null;
  }
  setLobbyMode("connecting");
  connTraceEvent(`try#${attempt + 1}`);
  hostConnection = peer.connect(code, {
    reliable: true,
    serialization: "json",
    metadata: { username, sessionId, version: "pixel-timeline-3" }
  });
  let settled = false;
  const timeout = setTimeout(() => {
    if (clientConnectionGen !== myGen) return;
    if (settled) return;
    settled = true;
    if (attempt + 1 < maxAttempts) {
      connectToHost(code, username, attempt + 1);
      return;
    }
    setLobbyMode("join_setup");
    showStatus("Couldn't connect. Check the room code and try again.", "error");
    setConnDiag("Connection timed out — check the room code and try again.", "error");
  }, 15000);

  hostConnection.on("open", () => {
    if (clientConnectionGen !== myGen || settled) return;
    settled = true;
    clearTimeout(timeout);
    hostConnection.send(buildJoinPayload(username));
    setLobbyMode("connected");
    renderMainSections();
    ui.roomCodeLabel.textContent = code;
    showStatus(`Connecting to ${code}...`, "ok");
    log(`Connected to ${code}.`);
    connTraceEvent("open;join-sent");
    monitorIceConnection(hostConnection, myGen);
    startClientHeartbeat(code, username, myGen);
  });

  hostConnection.on("data", (message) => {
    if (clientConnectionGen !== myGen) return;
    if (!message || !message.type) return;
    clientLastPongAt = Date.now(); // any inbound traffic proves the link is alive
    if (message.type === "pong") return;
    if (message.type === "lobby-state") {
      connTrace = [];
      setConnDiag("● Connected to host", "ok"); // persistent health indicator
      applyState(message.state, message.myPlayerId);
      return;
    }
    if (message.type === "system") {
      showStatus(message.message, message.kind || "ok");
      log(message.message, message.kind || "ok");
      return;
    }
    if (message.type === "error") {
      showStatus(message.message, "error");
      log(message.message, "error");
    }
  });

  hostConnection.on("error", (error) => {
    if (clientConnectionGen !== myGen) return;
    clearTimeout(timeout);
    connTraceEvent(`ERR:${error?.type || error?.message || "?"}`, "error");
    if (attempt + 1 < maxAttempts) {
      connectToHost(code, username, attempt + 1);
      return;
    }
    setLobbyMode("join_setup");
    showStatus(`Couldn't connect to room ${code}. Check the code and try again.`, "error");
    log(`Host connection error: ${error.message}`, "error");
  });

  const MAX_RECONNECT_ATTEMPTS = 5;
  hostConnection.on("close", () => {
    if (clientConnectionGen !== myGen) return;
    clearTimeout(timeout);
    connTraceEvent("CLOSED", "error");
    if (isHost) return;
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      log("Connection dropped, retrying...", "warn");
      setTimeout(() => {
        if (clientConnectionGen !== myGen) return;
        if (!peer || !peer.open) {
          openPeer(null, (assignedId) => {
            peerId = assignedId;
            connectToHost(code, username, attempt + 1);
          }, () => setLobbyMode("join_setup"));
        } else {
          connectToHost(code, username, attempt + 1);
        }
      }, 1500);
    } else {
      showStatus("Lost connection to the room.", "warn");
      setConnDiag("Lost connection after retries — direct P2P likely blocked, relay required", "error");
      log("Disconnected from host after retries.", "warn");
      setLobbyMode("join_setup");
    }
  });
}

function hostSendAction(type, payload = {}) {
  if (!hostConnection || !hostConnection.open) {
    setConnDiag("✕ Not connected — action didn't send. Reconnecting...", "error");
    log(`Action "${type}" dropped: connection not open.`, "warn");
    return;
  }
  try {
    hostConnection.send({ type, ...payload });
  } catch (error) {
    setConnDiag(`✕ Send failed: ${error?.message || error}`, "error");
    log(`Send "${type}" failed: ${error?.message || error}`, "error");
  }
}

function hostUpdateRules(nextRules) {
  if (!isHost || !hostState || hostState.started) return;
  const before = normalizeRules(hostState.rules || DEFAULT_RULES);
  const next = normalizeRules({ ...before, ...nextRules });
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  hostState.rules = next;
  const changedLabel = [];
  if (before.pointsToWin !== next.pointsToWin) changedLabel.push(`points ${before.pointsToWin} -> ${next.pointsToWin}`);
  if (before.guessTimerPreset !== next.guessTimerPreset) changedLabel.push(`counter timer ${presetLabel(before.guessTimerPreset)} (${before.guessWindowSeconds}s) -> ${presetLabel(next.guessTimerPreset)} (${next.guessWindowSeconds}s)`);
  if (before.guessMode !== next.guessMode) {
    changedLabel.push(`guess mode ${before.guessMode === "both" ? "Title and studio" : "Title or studio"} -> ${next.guessMode === "both" ? "Title and studio" : "Title or studio"}`);
  }
  if (before.imageMode !== next.imageMode) {
    changedLabel.push(`reveal ${before.imageMode === "cutout" ? "Cutout" : "Full"} -> ${next.imageMode === "cutout" ? "Cutout" : "Full"}`);
  }
  hostResetReadyStates(changedLabel.length ? `Rules changed. Please ready again. ${changedLabel.join(" • ")}` : "Rules changed. Please ready again.");
  hostBroadcastState();
}

function hostHandleReadyToggle(localPlayerId) {
  if (!hostState || hostState.started) return;
  const player = hostGetPlayer(localPlayerId);
  if (!player) return;
  player.ready = !player.ready;
  hostState.rulesNotice = "";
  hostBroadcastState();
}

function hostHandleStartGame() {
  if (!hostState || hostState.started) return;
  const everyoneReady = hostState.players.length >= 2 && hostState.players.every((player) => player.connected !== false && player.ready);
  if (!everyoneReady) {
    showStatus("Not everyone's ready. Wait for all players.", "warn");
    return;
  }
  const mismatched = hostState.players.filter((player) => player.connected !== false && (player.libraryHash || "") !== (hostState.libraryHash || ""));
  if (mismatched.length) {
    hostSystem(`Can't start — library mismatch: ${mismatched.map((player) => player.name).join(", ")}.`, "warn");
    return;
  }
  if (!GAME_CARDS.length) {
    showStatus("No cards loaded. Check the library.", "warn");
    return;
  }
  clearTimeout(hostResultsTimer);
  hostState.deck = shuffle([...GAME_CARDS]);
  hostState.discard = [];
  hostState.currentCard = null;
  hostState.started = true;
  hostState.phase = "place";
  hostState.turnIndex = 0;
  hostState.turnPlayerId = "";
  hostState.revealCurrent = false;
  hostState.guessWindow = null;
  hostState.pausedState = null;
  hostState.roundResult = null;
  hostState.roundMessage = "Decks shuffled. Let's settle this.";
  hostState.rulesNotice = "";
  hostState.players.forEach((player) => {
    player.score = 0;
    player.tokens = STARTING_TOKENS;
    player.row = [];
    player.ready = false;
    const anchor = hostState.deck.pop();
    if (anchor) player.row.push(anchor);
  });
  hostStartNextTurn();
}

function hostStartNextTurn() {
  if (!hostState?.started) return;
  clearTimeout(hostResultsTimer);
  clearTimeout(hostPauseTimer);
  hostPauseTimer = null;
  hostState.pausedState = null;
  hostState.roundResult = null;
  hostState.revealCurrent = false;
  hostState.guessWindow = null;
  if (!hostState.deck.length) {
    hostEndGame();
    return;
  }
  if (hostState.turnIndex >= hostState.players.length) hostState.turnIndex = 0;
  hostState.turnPlayerId = hostState.players[hostState.turnIndex].id;
  hostState.currentCard = hostState.deck.pop();
  hostState.phase = "place";
  hostState.roundMessage = `${hostGetPlayer(hostState.turnPlayerId)?.name || "Player"} is up. Where does this one live?`;
  hostBroadcastState(false);
}

function snapshotPlayers() {
  return new Map(hostState.players.map((player) => [player.id, {
    score: player.score,
    tokens: player.tokens,
    rowLength: player.row.length
  }]));
}

function guessRankLabel(result, guessMode) {
  if (!result || !result.rank) return "missed";
  if (guessMode === "both") return "both right";
  if (result.rank === 3) return "both right";
  if (result.rank === 2) return "title right";
  if (result.rank === 1) return "studio right";
  return "missed";
}

function evaluateGuessResult(card, guessTitle, guessStudio, guessMode) {
  const titleValue = normalizeText(guessTitle);
  const studioValue = normalizeText(guessStudio);
  const titleCorrect = Boolean(titleValue) && titleValue === normalizeText(card?.title);
  const studioCorrect = Boolean(studioValue) && studioValue === normalizeText(card?.studio);
  if (guessMode === "both") {
    const success = titleCorrect && studioCorrect;
    return { titleCorrect, studioCorrect, rank: success ? 3 : 0, success };
  }
  let rank = 0;
  if (studioCorrect) rank = 1;
  if (titleCorrect) rank = 2;
  if (titleCorrect && studioCorrect) rank = 3;
  return { titleCorrect, studioCorrect, rank, success: rank > 0 };
}

function resolvePlacementOutcome(activePlayer, card) {
  const rowBefore = [...activePlayer.row];
  const correctIndex = getInsertIndex(rowBefore, card.year);
  const chosenIndex = hostState.guessWindow.activePlacement.position;
  const claims = hostState.guessWindow.placementClaims || [];
  const winnerClaim = claims.find((entry) => entry.position === correctIndex) || null;
  if (chosenIndex === correctIndex) {
    activePlayer.row.splice(correctIndex, 0, card);
    activePlayer.score += 1;
    return {
      activeCorrect: true,
      rowBefore,
      correctIndex,
      chosenIndex,
      winnerClaim: null,
      summary: `${activePlayer.name} read it right — landed ${describeSlot(rowBefore, correctIndex, "as")}.`,
      outcome: `${activePlayer.name} keeps the card. +1 point.`
    };
  }
  if (winnerClaim) {
    const winner = hostGetPlayer(winnerClaim.playerId);
    if (winner) {
      const insertIndex = getInsertIndex(winner.row, card.year);
      winner.row.splice(insertIndex, 0, card);
      winner.score += 1;
    }
    activePlayer.tokens = Math.min(MAX_TOKENS, activePlayer.tokens + 1);
    return {
      activeCorrect: false,
      rowBefore,
      correctIndex,
      chosenIndex,
      winnerClaim,
      summary: `${activePlayer.name} missed. ${winnerClaim.name} sniped the correct gap.`,
      outcome: `${winnerClaim.name} takes the card. +1 point. ${activePlayer.name} gets a consolation token.`
    };
  }
  hostState.discard.push(card);
  return {
    activeCorrect: false,
    rowBefore,
    correctIndex,
    chosenIndex,
    winnerClaim: null,
    summary: `${activePlayer.name} missed, and nobody was there to catch it.`,
    outcome: "Card's gone."
  };
}

function resolveGuessOutcome(card, activePlayer) {
  const guessMode = hostState.rules.guessMode;
  const activeGuess = hostState.guessWindow.activeGuess || { title: "", studio: "" };
  const activeResult = evaluateGuessResult(card, activeGuess.title || "", activeGuess.studio || "", guessMode);
  const submissions = hostState.guessWindow.guessSubmissions || [];
  const evaluatedOpponents = submissions.map((submission) => ({
    ...submission,
    result: evaluateGuessResult(card, submission.title || "", submission.studio || "", guessMode)
  }));
  const maxOpponentRank = Math.max(0, ...evaluatedOpponents.map((entry) => entry.result.rank));
  const highestRank = Math.max(activeResult.rank, maxOpponentRank);
  let activeWins = false;
  let winningOpponents = [];

  if (highestRank > 0) {
    if (activeResult.rank === highestRank) {
      activeWins = true;
    } else {
      winningOpponents = evaluatedOpponents.filter((entry) => entry.result.rank === highestRank);
    }
  }

  if (activeWins) {
    activePlayer.tokens = Math.min(MAX_TOKENS, activePlayer.tokens + 1);
  } else {
    for (const winner of winningOpponents) {
      const player = hostGetPlayer(winner.playerId);
      if (player) player.tokens = Math.min(MAX_TOKENS, player.tokens + 2);
    }
  }

  const activeGuessText = `Active guess: ${activeGuess.title || "—"} / ${activeGuess.studio || "—"} (${guessRankLabel(activeResult, guessMode)}).`;
  let summary = activeGuessText;
  if (guessMode === "both" && highestRank === 0) {
    summary += " Nobody hit both — no guess reward.";
  } else if (highestRank === 0) {
    summary += " All guesses missed.";
  } else if (activeWins) {
    summary += ` ${activePlayer.name} called it right — ${guessRankLabel(activeResult, guessMode)}. +1 token.`;
  } else {
    summary += ` ${winningOpponents.map((entry) => entry.name).join(" and ")} nailed it — ${guessRankLabel(winningOpponents[0]?.result, guessMode)}.`;
  }

  const decisive = activeWins
    ? evaluatedOpponents.filter((entry) => entry.result.rank === activeResult.rank)
    : winningOpponents;
  let whySummary = "";
  if (highestRank === 0) {
    whySummary = "Every bid fell short this round.";
  } else if (activeWins && decisive.length) {
    whySummary = `Tied on ${guessRankLabel(activeResult, guessMode)}. Active player takes the edge.`;
  } else if (!activeWins && decisive.length && guessMode === "either" && activeResult.rank && decisive[0].result.rank !== activeResult.rank) {
    whySummary = `${guessRankLabel(decisive[0].result, guessMode)} beats ${guessRankLabel(activeResult, guessMode)}.`;
  } else if (!activeWins && decisive.length) {
    whySummary = `${decisive.map((entry) => `${entry.name}: ${guessRankLabel(entry.result, guessMode)}`).join(" • ")}`;
  }

  const sortedAll = [
    { name: activePlayer.name, active: true, guess: activeGuess, result: activeResult },
    ...evaluatedOpponents.map((entry) => ({ name: entry.name, active: false, guess: { title: entry.title, studio: entry.studio }, result: entry.result }))
  ].sort((a, b) => b.result.rank - a.result.rank || Number(a.active) - Number(b.active));

  return {
    activeResult,
    activeWins,
    winningOpponents,
    evaluatedOpponents,
    summary,
    whySummary,
    whyAll: sortedAll.map((entry) => {
      const guessText = `${entry.guess.title || "—"} / ${entry.guess.studio || "—"}`;
      return `${entry.active ? "Active player" : entry.name}: ${guessText} -> ${guessRankLabel(entry.result, guessMode)}`;
    }).join(" • "),
    affectedGuessNotes: evaluatedOpponents.map((entry) => ({
      playerId: entry.playerId,
      name: entry.name,
      exactGuess: `${entry.title || "—"} / ${entry.studio || "—"}`,
      rankLabel: guessRankLabel(entry.result, guessMode),
      affected: activeWins ? entry.result.rank === activeResult.rank : entry.result.rank === highestRank,
      spentToken: true
    }))
  };
}

function buildRoundResult(activePlayer, card, before, placementOutcome, guessOutcome) {
  const target = hostState.rules.pointsToWin;
  const payouts = hostState.players
    .map((player) => {
      const baseline = before.get(player.id) || { score: 0, tokens: 0, rowLength: 0 };
      const scoreDelta = player.score - baseline.score;
      const tokenDelta = player.tokens - baseline.tokens;
      const cardDelta = player.row.length - baseline.rowLength;
      const chips = [];
      if (cardDelta > 0) chips.push({ label: `+${cardDelta} card`, kind: "is-positive" });
      if (scoreDelta > 0) chips.push({ label: `+${scoreDelta} point`, kind: "is-positive" });
      if (tokenDelta > 0) chips.push({ label: `+${tokenDelta} token`, kind: "is-positive" });
      if (tokenDelta < 0) chips.push({ label: `${tokenDelta} token`, kind: "is-negative" });
      if (!chips.length) chips.push({ label: "No change", kind: "" });

      let outcome = "No dice.";
      if (player.id === activePlayer.id && placementOutcome.activeCorrect) outcome = "Nailed it. Card stays.";
      if (placementOutcome.winnerClaim?.playerId === player.id) outcome = "Sniped the correct gap. Card stolen.";
      if (player.id === activePlayer.id && !placementOutcome.activeCorrect && !placementOutcome.winnerClaim) outcome = "Whiff. Card's gone.";
      if (guessOutcome.activeWins && player.id === activePlayer.id) outcome += " Called it right.";
      if (!guessOutcome.activeWins && guessOutcome.winningOpponents.some((entry) => entry.playerId === player.id)) outcome += " Called it right.";
      if (guessOutcome.affectedGuessNotes.some((entry) => entry.playerId === player.id && !entry.affected)) outcome += " Wrong call.";

      return {
        playerId: player.id,
        name: player.name,
        highlight: player.id === activePlayer.id || placementOutcome.winnerClaim?.playerId === player.id || guessOutcome.winningOpponents.some((entry) => entry.playerId === player.id),
        outcome: outcome.trim(),
        deltaChips: chips
      };
    })
    .sort((a, b) => {
      if (a.playerId === activePlayer.id) return -1;
      if (b.playerId === activePlayer.id) return 1;
      const scoreA = Number(a.highlight) * 10 + a.deltaChips.filter((chip) => chip.kind === "is-positive").length - a.deltaChips.filter((chip) => chip.kind === "is-negative").length;
      const scoreB = Number(b.highlight) * 10 + b.deltaChips.filter((chip) => chip.kind === "is-positive").length - b.deltaChips.filter((chip) => chip.kind === "is-negative").length;
      return scoreB - scoreA;
    });

  const racePlayers = hostState.players.filter((player) => target - player.score <= 1 && target - player.score > 0);
  const raceSummary = racePlayers.length
    ? `${racePlayers.map((player) => `${player.name} is one card from the win`).join(" • ")}`
    : "";

  const baseRow = placementOutcome.rowBefore || [];
  const context = rowGapContext(baseRow, placementOutcome.correctIndex);
  const chosenLabel = describeSlot(baseRow, placementOutcome.chosenIndex, "as").replace(/^as /, "");
  const correctLabel = describeSlot(baseRow, placementOutcome.correctIndex, "as").replace(/^as /, "");
  const replayParts = [
    `${activePlayer.name} called ${chosenLabel}`,
    ...(hostState.guessWindow.placementClaims || []).map((entry) => `${entry.name} stole ${describeSlot(baseRow, entry.position, "as").replace(/^as /, "")}`),
    `True gap: ${correctLabel}`
  ];

  const affectedGuesses = guessOutcome.affectedGuessNotes;
  const counterSummaryBits = [];
  if (hostState.guessWindow.placementClaims?.length) {
    counterSummaryBits.push(`Gap challenges: ${hostState.guessWindow.placementClaims.map((entry) => `${entry.name} ${describeSlot(baseRow, entry.position, "as")}`).join(" • ")}`);
  } else {
    counterSummaryBits.push("No gaps were challenged.");
  }
  if (affectedGuesses.length) {
    counterSummaryBits.push(affectedGuesses.map((entry) => entry.affected ? `${entry.name} bid ${entry.exactGuess} (${entry.rankLabel})` : `${entry.name} bid missed`).join(" • "));
  } else {
    counterSummaryBits.push("No sealed bids this round.");
  }

  return {
    activePlayerId: activePlayer.id,
    headline: `${activePlayer.name}'s turn`,
    card: clone(card),
    placementSummary: `${placementOutcome.summary} ${placementOutcome.outcome}`,
    guessSummary: guessOutcome.summary,
    counterSummary: counterSummaryBits.join(" "),
    replaySummary: replayParts.join(" -> "),
    raceSummary,
    payouts,
    guessWhySummary: guessOutcome.whySummary,
    guessWhyAll: guessOutcome.whyAll,
    timelineSlice: {
      before: context.before,
      after: context.after,
      chosen: { index: placementOutcome.chosenIndex, label: chosenLabel },
      correct: { index: placementOutcome.correctIndex, label: correctLabel, spotlight: Boolean(placementOutcome.winnerClaim) }
    },
    highlightedCorrectGap: placementOutcome.winnerClaim
      ? `${placementOutcome.winnerClaim.name} sniped it.`
      : placementOutcome.activeCorrect
        ? `${activePlayer.name} read the timeline.`
        : "Nobody read the room.",
    disconnectNote: hostState.guessWindow?.activePlayerDisconnected ? "Resolved after active player disconnect." : ""
  };
}

function hostMaybeEndOnScore() {
  const target = hostState.rules.pointsToWin;
  const winner = hostState.players.find((player) => player.score >= target);
  if (!winner) return false;
  hostEndGame(`${winner.name} hit ${target} — that's the win.`);
  return true;
}

function hostAdvanceAfterResults() {
  clearTimeout(hostResultsTimer);
  hostResultsTimer = null;
  if (!hostState?.started) return;
  hostState.currentCard = null;
  hostState.revealCurrent = false;
  hostState.roundResult = null;
  hostState.turnIndex = (hostState.turnIndex + 1) % hostState.players.length;
  if (!hostState.deck.length) {
    hostEndGame();
    return;
  }
  hostStartNextTurn();
}

function hostResolveOpponentGuessWindow() {
  clearTimeout(hostGuessWindowTimer);
  hostGuessWindowTimer = null;
  if (!hostState?.guessWindow || hostState.phase !== "guess-window") return;
  const activePlayer = hostGetPlayer(hostState.turnPlayerId);
  const card = hostState.currentCard;
  if (!activePlayer || !card) return;
  const before = snapshotPlayers();
  const placementOutcome = resolvePlacementOutcome(activePlayer, card);
  const guessOutcome = resolveGuessOutcome(card, activePlayer);
  hostState.guessWindow.active = false;
  hostState.phase = "resolution";
  hostState.revealCurrent = true;
  hostState.roundResult = buildRoundResult(activePlayer, card, before, placementOutcome, guessOutcome);
  hostState.roundMessage = hostState.roundResult.disconnectNote
    ? `${hostState.roundResult.placementSummary} ${hostState.roundResult.disconnectNote}`
    : hostState.roundResult.placementSummary;
  hostBroadcastState(true);
  if (hostMaybeEndOnScore()) return;
  const swing = Boolean(placementOutcome.winnerClaim || guessOutcome.winningOpponents.length > 1 || !placementOutcome.activeCorrect);
  hostResultsTimer = setTimeout(hostAdvanceAfterResults, swing ? RESULTS_SWING_MS : RESULTS_NORMAL_MS);
}

function hostStartOpponentGuessWindow() {
  clearTimeout(hostGuessWindowTimer);
  const seconds = hostState.rules.guessWindowSeconds;
  hostState.phase = "guess-window";
  hostState.revealCurrent = false;
  hostState.guessWindow = {
    active: true,
    startedAt: Date.now(),
    deadlineAt: Date.now() + seconds * 1000,
    activePlacement: clone(hostState.guessWindow.activePlacement),
    activeGuess: clone(hostState.guessWindow.activeGuess),
    placementClaims: [],
    guessSubmissions: [],
    actionStates: [],
    activePlayerDisconnected: false
  };
  hostBroadcastState(false);
  hostGuessWindowTimer = setTimeout(hostResolveOpponentGuessWindow, seconds * 1000);
}

function hostHandlePlace(playerIdForAction, positionRaw, guessTitle, guessStudio) {
  if (!hostState.started || hostState.phase !== "place" || playerIdForAction !== hostState.turnPlayerId || !hostState.currentCard) return;
  const player = hostGetPlayer(playerIdForAction);
  if (!player) return;
  const row = [...player.row];
  const maxPosition = row.length;
  const position = Math.max(0, Math.min(maxPosition, Number.parseInt(positionRaw, 10) || 0));
  const normalizedTitle = canonicalGuessTitle(guessTitle);
  const normalizedStudio = canonicalGuessStudio(guessStudio);
  if (hostState.rules.guessMode === "both" && (!normalizeText(normalizedTitle) || !normalizeText(normalizedStudio))) {
    hostSystem("Both fields are required this match.", "warn");
    return;
  }
  hostState.guessWindow = {
    active: false,
    activePlacement: { playerId: player.id, position },
    activeGuess: { title: normalizedTitle || "", studio: normalizedStudio || "" },
    placementClaims: [],
    guessSubmissions: [],
    actionStates: []
  };
  hostState.roundMessage = `${player.name} called it. Anyone brave enough to challenge?`;
  hostStartOpponentGuessWindow();
}

function hostHandleReroll(playerIdForAction) {
  if (!hostState.started || hostState.phase !== "place" || playerIdForAction !== hostState.turnPlayerId || !hostState.currentCard) return;
  const player = hostGetPlayer(playerIdForAction);
  if (!player || player.tokens < 1 || !hostState.deck.length) return;
  player.tokens -= 1;
  hostState.discard.push(hostState.currentCard);
  hostState.currentCard = hostState.deck.pop();
  hostState.roundMessage = `${player.name} burned a token. New screenshot incoming.`;
  hostBroadcastState(false);
}

function hostHandleAutoPlace(playerIdForAction) {
  if (!hostState.started || hostState.phase !== "place" || playerIdForAction !== hostState.turnPlayerId || !hostState.currentCard) return;
  const player = hostGetPlayer(playerIdForAction);
  if (!player || player.tokens < 3) return;
  const card = hostState.currentCard;
  const insertIndex = getInsertIndex(player.row, card.year);
  player.tokens -= 3;
  player.row.splice(insertIndex, 0, card);
  player.score += 1;
  hostState.roundMessage = `${player.name} used Time Warp — ${card.title} snapped into place.`;
  hostState.currentCard = null;
  hostBroadcastState(true);
  if (hostMaybeEndOnScore()) return;
  hostState.turnIndex = (hostState.turnIndex + 1) % hostState.players.length;
  hostStartNextTurn();
}

function hostHandleCounterPlacementClaim(playerIdForAction, positionRaw) {
  if (!hostState.started || hostState.phase !== "guess-window" || !hostState.currentCard || !hostState.guessWindow?.active) return;
  if (playerIdForAction === hostState.turnPlayerId) return;
  const player = hostGetPlayer(playerIdForAction);
  const activePlayer = hostGetPlayer(hostState.turnPlayerId);
  if (!player || !activePlayer || player.tokens < 1) return;
  if ((hostState.guessWindow.placementClaims || []).some((entry) => entry.playerId === playerIdForAction)) return;
  const position = Math.max(0, Math.min(activePlayer.row.length, Number.parseInt(positionRaw, 10) || 0));
  if (position === hostState.guessWindow.activePlacement.position) return;
  if ((hostState.guessWindow.placementClaims || []).some((entry) => entry.position === position)) return;
  player.tokens -= 1;
  hostState.guessWindow.placementClaims.push({
    playerId: player.id,
    name: player.name,
    position,
    at: Date.now()
  });
  hostBroadcastState(false);
}

function hostHandleOpponentGuess(playerIdForAction, guessTitle, guessStudio) {
  if (!hostState.started || hostState.phase !== "guess-window" || !hostState.currentCard || !hostState.guessWindow?.active) return;
  if (playerIdForAction === hostState.turnPlayerId) return;
  const player = hostGetPlayer(playerIdForAction);
  if (!player || player.tokens < 1) return;
  if ((hostState.guessWindow.guessSubmissions || []).some((entry) => entry.playerId === playerIdForAction)) return;
  const title = canonicalGuessTitle(guessTitle);
  const studio = canonicalGuessStudio(guessStudio);
  if (hostState.rules.guessMode === "both" && (!normalizeText(title) || !normalizeText(studio))) return;
  player.tokens -= 1;
  hostState.guessWindow.guessSubmissions.push({
    playerId: player.id,
    name: player.name,
    title,
    studio,
    at: Date.now()
  });
  hostBroadcastState(false);
}

function startActiveReconnectPause(player) {
  clearTimeout(hostPauseTimer);
  clearTimeout(hostGuessWindowTimer);
  hostGuessWindowTimer = null;
  hostState.phase = "paused";
  hostState.pausedState = {
    kind: "active-disconnect",
    playerId: player.id,
    deadlineAt: Date.now() + RECONNECT_GRACE_SECONDS * 1000
  };
  hostState.roundMessage = `${player.name} dropped. Holding for ${RECONNECT_GRACE_SECONDS}s.`;
  hostBroadcastState(false);
  hostPauseTimer = setTimeout(() => {
    const stillMissing = hostGetPlayer(player.id)?.connected === false;
    if (!stillMissing || hostState.phase !== "paused") return;
    if (hostState.currentCard) {
      hostState.deck.push(hostState.currentCard);
      hostState.deck = shuffle(hostState.deck);
      hostState.currentCard = null;
    }
    hostState.pausedState = null;
    hostState.phase = "place";
    hostState.roundMessage = `${player.name} didn't come back. Card reshuffled, round skipped.`;
    hostState.turnIndex = (hostState.turnIndex + 1) % hostState.players.length;
    hostStartNextTurn();
  }, RECONNECT_GRACE_SECONDS * 1000);
}

function hostEndGame(reason = "Last card played. It's all over.") {
  clearTimeout(hostGuessWindowTimer);
  clearTimeout(hostResultsTimer);
  clearTimeout(hostPauseTimer);
  hostGuessWindowTimer = null;
  hostResultsTimer = null;
  hostPauseTimer = null;
  hostState.started = false;
  hostState.phase = "lobby";
  hostState.currentCard = null;
  hostState.revealCurrent = false;
  hostState.guessWindow = null;
  hostState.pausedState = null;
  hostState.roundResult = null;
  hostState.roundMessage = reason;
  hostState.players.forEach((player) => {
    player.ready = false;
  });
  hostBroadcastState(true);
}

function syncClientTicker() {
  clearInterval(clientCountdownTimer);
  clientCountdownTimer = null;
  if (gameState.phase === "guess-window" || gameState.phase === "paused") {
    clientCountdownTimer = setInterval(() => {
      if (gameState.phase === "guess-window") renderCounterBanner();
      if (gameState.phase === "paused") renderPauseBanner();
    }, 300);
  }
}

function leaveLobby() {
  if (peer) peer.destroy();
  peer = null;
  hostConnection = null;
  hostConnections = {};
  hostState = null;
  isHost = false;
  roomCode = "";
  peerId = "";
  playerId = "";
  clearTimeout(hostGuessWindowTimer);
  clearTimeout(hostResultsTimer);
  clearTimeout(hostPauseTimer);
  clearInterval(clientCountdownTimer);
  stopClientHeartbeat();
  clientConnectionGen += 1; // invalidate any in-flight reconnect handlers
  hostGuessWindowTimer = null;
  hostResultsTimer = null;
  hostPauseTimer = null;
  clientCountdownTimer = null;
  gameState = buildEmptyState();
  renderMainSections();
  updateLobbyActionVisibility();
  updateRuleControls();
  renderGuideAndReadyControls();
  renderPlayerList([]);
  renderStatusText();
  updateSidebarStatus();
  renderCounterBanner();
  renderPauseBanner();
  renderPrompt();
  renderResults();
  renderRows();
  renderHelperPanel();
  setLobbyMode("idle");
  setConnDiag("");
  showStatus("Enter a code and connect.", "ok");
}

function bindEvents() {
  ui.showHostBtn.addEventListener("click", showHostSetup);
  ui.showJoinBtn.addEventListener("click", showJoinSetup);
  ui.hostBackBtn.addEventListener("click", () => setLobbyMode("idle"));
  ui.joinBackBtn.addEventListener("click", () => setLobbyMode("idle"));
  ui.loadLibraryFilesBtn.addEventListener("click", handleLibraryUpload);
  ui.mismatchLoadBtn.addEventListener("click", handleMismatchUpload);
  ui.createLobby.addEventListener("click", hostStartLobby);
  ui.joinLobby.addEventListener("click", joinLobby);
  ui.copyRoom.addEventListener("click", async () => {
    if (!gameState.roomCode) return;
    await navigator.clipboard.writeText(gameState.roomCode);
    log("Room code copied.");
  });
  ui.leaveLobby.addEventListener("click", leaveLobby);
  ui.readyToggleBtn.addEventListener("click", () => {
    if (isHost) {
      hostHandleReadyToggle(playerId);
    } else {
      hostSendAction("toggle-ready");
    }
  });
  ui.openGuideBtn.addEventListener("click", () => {
    guideState.skipped = false;
    guideState.currentSlide = 0;
    persistGuideState();
    renderGuide();
  });
  ui.skipGuideBtn.addEventListener("click", () => {
    markGuideSkipped();
    if (isHost) {
      const player = hostGetPlayer(playerId);
      hostUpdateGuideState(player, { skipped: true });
      hostBroadcastState();
    } else {
      hostSendAction("guide-state", { skipped: true });
    }
    renderGuide();
  });
  ui.guidePrevBtn.addEventListener("click", () => {
    guideState.currentSlide = Math.max(0, (guideState.currentSlide || 0) - 1);
    persistGuideState();
    renderGuide();
  });
  ui.guideNextBtn.addEventListener("click", () => {
    const slides = guideSlidesForRules(gameState.rules || DEFAULT_RULES);
    guideState.currentSlide = Math.min(slides.length - 1, (guideState.currentSlide || 0) + 1);
    persistGuideState();
    renderGuide();
  });
  ui.guideCompleteBtn.addEventListener("click", () => {
    markGuideComplete();
    if (isHost) {
      const player = hostGetPlayer(playerId);
      hostUpdateGuideState(player, { completed: true });
      hostBroadcastState();
    } else {
      hostSendAction("guide-state", { completed: true });
    }
    renderGuide();
  });
  ui.reopenGuideBtn.addEventListener("click", () => {
    guideState.currentSlide = 0;
    persistGuideState();
    renderGuide();
  });
  ui.startGame.addEventListener("click", () => {
    if (isHost) hostHandleStartGame();
    else hostSendAction("start-game");
  });
  ui.pointsToWinInput.addEventListener("input", () => hostUpdateRules({ pointsToWin: ui.pointsToWinInput.value }));
  ui.guessTimerPresetInput.addEventListener("change", () => hostUpdateRules({ guessTimerPreset: ui.guessTimerPresetInput.value }));
  ui.guessModeInput.addEventListener("change", () => hostUpdateRules({ guessMode: ui.guessModeInput.value }));
  ui.imageModeInput.addEventListener("change", () => hostUpdateRules({ imageMode: ui.imageModeInput.value }));
  ui.placeBtn.addEventListener("click", () => {
    const title = canonicalGuessTitle(ui.guessTitle.value);
    const studio = canonicalGuessStudio(ui.guessStudio.value);
    if (isHost) {
      hostHandlePlace(playerId, Number(ui.positionSelect.value), title, studio);
    } else {
      hostSendAction("place", { position: Number(ui.positionSelect.value), guessTitle: title, guessStudio: studio });
    }
    ui.guessTitle.value = "";
    ui.guessStudio.value = "";
  });
  ui.rerollBtn.addEventListener("click", () => {
    if (isHost) hostHandleReroll(playerId);
    else hostSendAction("reroll");
  });
  ui.autoPlaceBtn.addEventListener("click", () => {
    if (isHost) hostHandleAutoPlace(playerId);
    else hostSendAction("auto-place");
  });
  ui.opponentPlacementBtn.addEventListener("click", () => {
    const value = Number.parseInt(ui.opponentPlacementSelect.value, 10);
    if (!Number.isInteger(value)) return;
    if (isHost) hostHandleCounterPlacementClaim(playerId, value);
    else hostSendAction("placement-claim", { position: value });
  });
  ui.opponentGuessBtn.addEventListener("click", () => {
    const title = canonicalGuessTitle(ui.opponentGuessTitle.value);
    const studio = canonicalGuessStudio(ui.opponentGuessStudio.value);
    if (isHost) {
      hostHandleOpponentGuess(playerId, title, studio);
    } else {
      hostSendAction("opponent-guess", { guessTitle: title, guessStudio: studio });
    }
  });
  ui.skipResultsBtn.addEventListener("click", () => {
    if (isHost) hostAdvanceAfterResults();
    else hostSendAction("skip-results");
  });
  ui.guessTitle.addEventListener("input", () => updateSuggestions(ui.guessTitle.value, suggestionTitles, ui.titleSuggestions));
  ui.guessStudio.addEventListener("input", () => updateSuggestions(ui.guessStudio.value, suggestionStudios, ui.studioSuggestions));
  ui.opponentGuessTitle.addEventListener("input", () => updateSuggestions(ui.opponentGuessTitle.value, suggestionTitles, ui.titleSuggestions));
  ui.opponentGuessStudio.addEventListener("input", () => updateSuggestions(ui.opponentGuessStudio.value, suggestionStudios, ui.studioSuggestions));
  ui.username.addEventListener("input", () => saveUsername(ui.username.value));
  $("debugToggleBtn").addEventListener("click", () => {
    const panel = $("logPanel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) panel.open = true;
  });
}

async function initialize() {
  await loadGameLibrary();
  bindEvents();
  renderGuide();
  const persistedName = getStoredUsername();
  if (persistedName) ui.username.value = persistedName;
  updateSuggestions("", suggestionTitles, ui.titleSuggestions);
  updateSuggestions("", suggestionStudios, ui.studioSuggestions);
  renderMainSections();
  updateLobbyActionVisibility();
  updateRuleControls();
  renderGuideAndReadyControls();
  renderStatusText();
  updateSidebarStatus();
}

initialize();
