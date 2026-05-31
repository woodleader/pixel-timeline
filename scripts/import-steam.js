#!/usr/bin/env node
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const process = require("node:process");
const { exec, execFile } = require("node:child_process");

const DEFAULT_OPTIONS = {
  gamesPath: path.join(process.cwd(), "games.json"),
  imagesPath: path.join(process.cwd(), "game-images.json"),
  country: "us",
  language: "english",
  maxGames: 25,
  mode: "interactive",
  imageMode: "thumbnail",
  pageSize: 50,
  delayMs: 250,
  preview: true,
  sort: "popular",
  autoImageCount: 3,
  maxImageBytes: 200000,
  imageMaxWidth: 640,
  imageQuality: 55,
  pastYears: 0
};

const SORT_ALIASES = {
  popular: "popular",
  populars: "popular",
  popular_desc: "popular",
  mostpopular: "popular",
  most_popular: "popular",
  most: "popular",
  top: "popular",
  popularity: "popular",
  reviewscore: "popular",
  reviews: "popular",
  reviewed: "popular",
  reviews_desc: "popular",
  rating: "popular",
  rating_desc: "popular",
  hype: "popular",
  hypes: "popular"
};

const POPULAR_SORT_FALLBACKS = ["popular"];

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
  if (token === "--max") {
      options.maxGames = parseIntSafe(argv[index + 1], options.maxGames);
      index += 1;
      continue;
    }
    if (token === "--mode") {
      options.mode = String(argv[index + 1] || options.mode).trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--image-mode") {
      const value = String(argv[index + 1] || options.imageMode).trim().toLowerCase();
      options.imageMode = value === "full" ? "full" : "thumbnail";
      index += 1;
      continue;
    }
    if (token === "--page-size") {
      options.pageSize = parseIntSafe(argv[index + 1], options.pageSize);
      index += 1;
      continue;
    }
    if (token === "--games") {
      options.gamesPath = argv[index + 1] || options.gamesPath;
      index += 1;
      continue;
    }
    if (token === "--images") {
      options.imagesPath = argv[index + 1] || options.imagesPath;
      index += 1;
      continue;
    }
    if (token === "--country") {
      options.country = argv[index + 1] || options.country;
      index += 1;
      continue;
    }
    if (token === "--lang" || token === "--language") {
      options.language = argv[index + 1] || options.language;
      index += 1;
      continue;
    }
    if (token === "--delay") {
      options.delayMs = parseIntSafe(argv[index + 1], options.delayMs);
      index += 1;
      continue;
    }
    if (token === "--max-image-bytes") {
      options.maxImageBytes = parseIntSafe(argv[index + 1], options.maxImageBytes);
      index += 1;
      continue;
    }
    if (token === "--image-max-width") {
      options.imageMaxWidth = parseIntSafe(argv[index + 1], options.imageMaxWidth);
      index += 1;
      continue;
    }
    if (token === "--image-quality") {
      options.imageQuality = parseIntSafe(argv[index + 1], options.imageQuality);
      index += 1;
      continue;
    }
    if (token === "--auto-image-count") {
      options.autoImageCount = parseIntSafe(argv[index + 1], options.autoImageCount);
      index += 1;
      continue;
    }
    if (token === "--past-years") {
      options.pastYears = parseIntSafe(argv[index + 1], options.pastYears);
      index += 1;
      continue;
    }
    if (token === "--no-preview") {
      options.preview = false;
      continue;
    }
    if (token === "--sort") {
      options.sort = normalizeSort(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  if (!Number.isFinite(options.maxGames) || options.maxGames < 1) options.maxGames = DEFAULT_OPTIONS.maxGames;
  if (!Number.isFinite(options.pageSize) || options.pageSize < 1) options.pageSize = DEFAULT_OPTIONS.pageSize;
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) options.delayMs = DEFAULT_OPTIONS.delayMs;
  if (!Number.isFinite(options.maxImageBytes) || options.maxImageBytes < 0) options.maxImageBytes = DEFAULT_OPTIONS.maxImageBytes;
  if (!Number.isFinite(options.imageMaxWidth) || options.imageMaxWidth < 64) options.imageMaxWidth = DEFAULT_OPTIONS.imageMaxWidth;
  if (!Number.isFinite(options.imageQuality) || options.imageQuality < 1 || options.imageQuality > 100) options.imageQuality = DEFAULT_OPTIONS.imageQuality;
  if (!Number.isFinite(options.pastYears) || options.pastYears < 0) options.pastYears = DEFAULT_OPTIONS.pastYears;
  return options;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/import-steam.js [options]

Options:
  --max <number>        Maximum number of games to import (default: ${DEFAULT_OPTIONS.maxGames})
  --mode <interactive|auto> Import mode. \"auto\" skips prompts and auto-picks screenshots (default: ${DEFAULT_OPTIONS.mode})
  --image-mode <thumbnail|full> Image source for auto mode. Thumbnail keeps files smaller (default: ${DEFAULT_OPTIONS.imageMode})
  --page-size <number>  IGDB results page chunk size (default: ${DEFAULT_OPTIONS.pageSize})
  --games <path>        Path to games.json (default: ./games.json)
  --images <path>       Path to game-images.json (default: ./game-images.json)
  --country <cc>        Unused legacy option (kept for compatibility)
  --lang <locale>       Unused legacy option (kept for compatibility)
  --delay <ms>          Delay between IGDB requests (default: ${DEFAULT_OPTIONS.delayMs})
  --sort <popular|reviews|rating|hype|custom>  Ranking type. Defaults to ${DEFAULT_OPTIONS.sort}.
  --sort custom accepts raw IGDB sort expressions too (e.g. first_release_date desc).
  --auto-image-count <number>  Number of screenshots to store per game in auto mode (default: ${DEFAULT_OPTIONS.autoImageCount}, never includes the first candidate)
  --past-years <number>       In auto mode, import up to --max games for each year from now back through this many past years (default: ${DEFAULT_OPTIONS.pastYears})
  --max-image-bytes <number>  Soft cap after resize/compression. Larger results are skipped if still too big. Default: ${DEFAULT_OPTIONS.maxImageBytes}
  --image-max-width <number>  Resize imported screenshots down to this max width before embedding (default: ${DEFAULT_OPTIONS.imageMaxWidth})
  --image-quality <number>    JPEG quality used for resized images, from 1-100 (default: ${DEFAULT_OPTIONS.imageQuality})
  --no-preview          Disable browser screenshot preview (URL-only mode)
  --help                Show this help

Environment:
  IGDB_CLIENT_ID        Twitch application client id for IGDB (optional if entered interactively)
  IGDB_CLIENT_SECRET    Twitch application client secret for IGDB (optional if entered interactively)

Workflow:
  - The importer authenticates with Twitch, then queries the IGDB Games API.
  - For each new title it fetches metadata and screenshots, then asks you to choose one screenshot in interactive mode.
  - Enter a screenshot index, 'c' for custom URL, 's' to skip, or 'q' to stop.
  - If preview is enabled, the script opens a browser page with screenshot thumbnails.
  - In auto mode, it can sweep IGDB popularity year by year, picks random screenshots from results, skips the first candidate, resizes/compresses them locally, stores up to N images as base64 in game-images.json, and does not ask for input.
  `);
}

function normalizeSort(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "popular";
  if (value === "custom" || value === "manual") return "popular";
  return SORT_ALIASES[value] || value;
}

function resolveSortFallback(rawSort) {
  const normalized = normalizeSort(rawSort);
  const list = [];
  const add = (value) => {
    if (value && !list.includes(value)) list.push(value);
  };
  add(normalized);
  POPULAR_SORT_FALLBACKS.forEach(add);
  return list;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(rawDate) {
  if (!rawDate || typeof rawDate !== "string") return NaN;
  const match = rawDate.match(/(\d{4})/);
  return match ? Number.parseInt(match[1], 10) : NaN;
}

function sortGamesByTimeline(cards) {
  return cards.slice().sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.title.localeCompare(b.title);
  });
}

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

async function promptForIgdbCredentials(rl) {
  const envClientId = readEnv("IGDB_CLIENT_ID");
  const envClientSecret = readEnv("IGDB_CLIENT_SECRET");

  const clientId = envClientId || (await rl.question("IGDB client id: ")).trim();
  const clientSecret = envClientSecret || (await rl.question("IGDB client secret: ")).trim();

  if (!clientId || !clientSecret) {
    throw new Error("IGDB client id and secret are required.");
  }

  return { clientId, clientSecret };
}

async function createIgdbAuth(credentials) {
  const clientId = String(credentials?.clientId || "").trim();
  const clientSecret = String(credentials?.clientSecret || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing IGDB credentials.");
  }
  const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
  tokenUrl.searchParams.set("client_id", clientId);
  tokenUrl.searchParams.set("client_secret", clientSecret);
  tokenUrl.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: {
      "user-agent": "Pixel-Timeline-IGDB-Importer/1.0"
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`IGDB auth failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  if (!payload || !payload.access_token) {
    throw new Error("IGDB auth failed: missing access token.");
  }
  return {
    clientId,
    accessToken: payload.access_token
  };
}

async function igdbRequest(endpoint, body, auth) {
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": auth.clientId,
      "Authorization": `Bearer ${auth.accessToken}`,
      "Accept": "application/json",
      "Content-Type": "text/plain",
      "user-agent": "Pixel-Timeline-IGDB-Importer/1.0"
    },
    body
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IGDB request failed for ${endpoint}: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json();
}

function yearToUnixRange(year) {
  const from = Math.floor(Date.UTC(year, 0, 1, 0, 0, 0) / 1000);
  const to = Math.floor(Date.UTC(year + 1, 0, 1, 0, 0, 0) / 1000);
  return { from, to };
}

function buildIgdbImageUrl(imageId, sizeName) {
  return `https://images.igdb.com/igdb/image/upload/t_${sizeName}/${imageId}.jpg`;
}

function buildIgdbWhereClause() {
  const conditions = [
    "version_parent = null",
    "parent_game = null",
    "screenshots != null",
    "first_release_date != null"
  ];
  return conditions.join(" & ");
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function normalizeArrayCandidateLimit(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseImageMode(raw) {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "auto") return "auto";
  return "interactive";
}

function resolveImageUrlForImport(candidate, imageMode) {
  const full = String(candidate?.path || "").trim();
  const thumbnail = String(candidate?.thumbnail || "").trim();
  if (imageMode === "full" && full) return full;
  if (thumbnail) return thumbnail;
  return full;
}

async function fetchImageAsDataUrl(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      "user-agent": "Pixel-Timeline-IGDB-Importer/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Image fetch failed for ${imageUrl}: HTTP ${response.status}`);
  }
  const mime = (response.headers.get("content-type") || "image/jpeg").split(";")[0] || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mime, size: buffer.length };
}

async function compressImageBufferToJpeg(sourceBuffer, options) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pixel-timeline-import-"));
  const sourcePath = path.join(tempDir, "source-image");
  const outputPath = path.join(tempDir, "compressed.jpg");

  try {
    await fs.writeFile(sourcePath, sourceBuffer);
    await execFileAsync("/usr/bin/sips", [
      "-s", "format", "jpeg",
      "--setProperty", "formatOptions", String(options.imageQuality),
      "--resampleWidth", String(options.imageMaxWidth),
      sourcePath,
      "--out", outputPath
    ]);
    return fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function encodeImportedImage(imageUrl, options) {
  const fetched = await fetchImageAsDataUrl(imageUrl);
  let outputBuffer = fetched.buffer;
  let mime = fetched.mime;

  if (process.platform === "darwin") {
    try {
      outputBuffer = await compressImageBufferToJpeg(fetched.buffer, options);
      mime = "image/jpeg";
    } catch (error) {
      console.warn(`  image compression failed for ${imageUrl}, using original bytes: ${error.message}`);
    }
  }

  return {
    dataUrl: `data:${mime};base64,${outputBuffer.toString("base64")}`,
    size: outputBuffer.length,
    originalSize: fetched.size
  };
}

function pickRandomEntries(items, count) {
  const source = Array.isArray(items) ? items.slice() : [];
  const pool = source
    .filter((entry) => entry && typeof entry.path === "string" && entry.path.trim());
  const targetCount = Number.isInteger(count) ? count : 3;
  const chosen = [];

  while (pool.length && chosen.length < targetCount) {
    const index = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}

async function autoChooseImages(game, count, options) {
  const candidates = (game.screenshotCandidates || []).slice(1);
  const chosenPaths = pickRandomEntries(candidates, count);
  const encoded = [];
  for (const candidate of chosenPaths) {
    const resolved = resolveImageUrlForImport(candidate, options.imageMode);
    if (!resolved) continue;
    try {
      const fetched = await encodeImportedImage(resolved, options);
      if (options.maxImageBytes > 0 && fetched.size > options.maxImageBytes) {
        console.warn(`  skipped ${resolved} for ${game.title} (${fetched.size} bytes after compression > ${options.maxImageBytes}).`);
        continue;
      }
      if (fetched.dataUrl) {
        if (fetched.originalSize > fetched.size) {
          console.log(`  compressed image for ${game.title}: ${fetched.originalSize} -> ${fetched.size} bytes`);
        }
        encoded.push(fetched.dataUrl);
      }
    } catch (error) {
      console.warn(`  could not fetch image for ${game.title}: ${error.message}`);
    }
  }
  return encoded;
}

function previewPathForGame(appId) {
  return path.join(process.cwd(), "scripts", `.igdb-preview-${appId}.html`);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function writePreviewPage(game) {
  const filePath = previewPathForGame(game.appId);
  const safeTitle = escapeHtml(game.title);
  const cards = (game.screenshotCandidates || []).map((entry, index) => `
      <div class="shot">
        <p><strong>${index + 1}.</strong> ${escapeHtml(entry.label)}</p>
        <a href="${entry.path}" target="_blank" rel="noreferrer">
          <img src="${entry.path}" alt="${safeTitle} ${index + 1}" />
        </a>
        <p class="meta">
          <a href="${entry.path}" target="_blank" rel="noreferrer">open original</a>
        </p>
      </div>`).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Pixel Timeline - ${safeTitle}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; background: #101b32; color: #e9f1ff; margin: 0; padding: 16px; }
    h1 { margin-top: 0; }
    .meta { color: #9fb0d4; font-size: 13px; margin: 0 0 12px; }
    .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .shot { border: 1px solid #31416d; background: #152341; border-radius: 10px; padding: 8px; }
    .shot p { margin: 0 0 6px; font-size: 13px; }
    .shot img { width: 100%; border-radius: 6px; border: 1px solid #2d3e67; display: block; }
    a { color: #9fbfff; }
  </style>
</head>
<body>
  <h1>${safeTitle} (${game.releaseYear})</h1>
  <p class="meta">Studio: ${escapeHtml(game.studio)}</p>
  <p class="meta">Game page: <a href="${game.gameUrl}" target="_blank" rel="noreferrer">${game.gameUrl}</a></p>
  <div class="shots">${cards}</div>
</body>
</html>`;
  await fs.writeFile(filePath, html, "utf8");
  return filePath;
}

async function openPreview(filePath) {
  const normalized = path.resolve(filePath).replace(/"/g, '\\"');
  const quoted = `"${normalized}"`;
  const openCommand = process.platform === "darwin"
    ? `open ${quoted}`
    : process.platform === "win32"
      ? `cmd /c start "" ${quoted}`
      : `xdg-open ${quoted}`;
  return new Promise((resolve) => {
    exec(openCommand, () => resolve());
  });
}

async function fetchIgdbGamesByIds(ids, auth) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const body = [
    "fields name,slug,url,first_release_date,involved_companies.*,involved_companies.company.*,screenshots.*;",
    `where id = (${ids.join(",")}) & ${buildIgdbWhereClause()};`,
    `limit ${ids.length};`
  ].join("\n");
  return igdbRequest("games", body, auth);
}

async function fetchIgdbGamesPage(start, pageSize, sortBy, auth) {
  const popularityBody = [
    "fields game_id,value,popularity_type;",
    "where game_id != null;",
    "sort value desc;",
    `limit ${pageSize};`,
    `offset ${start};`
  ].join("\n");
  const popularityRows = await igdbRequest("popularity_primitives", popularityBody, auth);
  const ids = popularityRows
    .map((row) => Number(row && row.game_id))
    .filter((value, index, array) => Number.isFinite(value) && array.indexOf(value) === index);
  return fetchIgdbGamesByIds(ids, auth);
}

function selectStudioName(involvedCompanies) {
  const entries = Array.isArray(involvedCompanies) ? involvedCompanies : [];
  const preferred = entries.find((entry) => entry && entry.developer && entry.company && entry.company.name);
  if (preferred) return String(preferred.company.name || "").trim();

  const fallback = entries.find((entry) => entry && entry.company && entry.company.name);
  return fallback ? String(fallback.company.name || "").trim() : "";
}

function extractYearFromUnix(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds)) return NaN;
  return new Date(timestampSeconds * 1000).getUTCFullYear();
}

function normalizeIgdbGameDetails(raw) {
  if (!raw || typeof raw !== "object") return null;
  const releaseYear = extractYearFromUnix(Number(raw.first_release_date));
  const studio = selectStudioName(raw.involved_companies);
  const screenshotEntries = Array.isArray(raw.screenshots) ? raw.screenshots : [];
  const screenshots = screenshotEntries
    .filter((entry) => entry && entry.image_id)
    .map((entry) => ({
      path: buildIgdbImageUrl(entry.image_id, "screenshot_big"),
      thumbnail: buildIgdbImageUrl(entry.image_id, "screenshot_med"),
      label: "IGDB screenshot"
    }));

  if (!raw.name || !studio || !Number.isFinite(releaseYear)) {
    return null;
  }

  return {
    appId: raw.id,
    title: String(raw.name || "").trim(),
    studio,
    releaseYear,
    gameUrl: String(raw.url || `https://www.igdb.com/games/${raw.slug || raw.id}`),
    screenshotCandidates: screenshots
  };
}

function makeImageKey(cardTitle, cardYear, appId) {
  return `igdb-${appId}-${normalize(cardTitle).slice(0, 16) || "game"}-${cardYear || "na"}`;
}

function dedupeFromExisting(cards, images) {
  const existingCards = new Set();
  cards.forEach((card) => {
    existingCards.add(`${normalize(card.title)}|${normalize(card.studio)}|${card.year}`);
  });
  const existingImages = new Set(Object.keys(images || {}));
  return {
    existingCards,
    existingImages
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTargetYears(options) {
  if (options.mode !== "auto" || options.pastYears <= 0) {
    return [null];
  }
  const currentYear = new Date().getFullYear();
  return Array.from({ length: options.pastYears + 1 }, (_, offset) => currentYear - offset);
}

async function promptScreenshotChoice(rl, game, options) {
  const candidates = game.screenshotCandidates || [];
  if (!candidates.length) {
    console.log("No IGDB screenshots found in API payload for this game.");
    const custom = (await rl.question("Enter screenshot URL, [s]kip, or [q]uit: ")).trim();
    if (custom.toLowerCase() === "q") return { action: "quit" };
    if (custom.toLowerCase() === "s" || !custom) return { action: "skip" };
    return { action: "use", image: custom };
  }

  console.log(`\nGame page: ${game.gameUrl}`);
  if (options.preview) {
    const previewFile = await writePreviewPage(game);
    console.log(`Preview written to: ${previewFile}`);
    await openPreview(previewFile);
    await rl.question("A preview opened in your browser. Press Enter to continue.");
  }
  const displayLimit = Math.max(1, Math.min(12, candidates.length));
  candidates.slice(0, displayLimit).forEach((entry, index) => {
    console.log(`[${index + 1}] ${entry.label} -> ${entry.path}`);
  });
  const choice = (await rl.question(`Choose screenshot [1-${displayLimit}], [c]ustom url, [s]kip, [q]uit: `)).trim();
  const lower = choice.toLowerCase();
  if (lower === "q") return { action: "quit" };
  if (lower === "s") return { action: "skip" };
  if (lower === "c") {
    const custom = (await rl.question("Paste screenshot URL: ")).trim();
    if (!custom) return { action: "skip" };
    return { action: "use", image: custom };
  }
  const selected = parseIntSafe(choice, NaN);
  if (selected >= 1 && selected <= displayLimit) {
    return { action: "use", image: candidates[selected - 1].path };
  }
  console.log("Invalid selection, skipping this game.");
  return { action: "skip" };
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv);
  options.mode = parseImageMode(options.mode);
  options.autoImageCount = normalizeArrayCandidateLimit(options.autoImageCount, 3);
  printUsage();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const credentials = await promptForIgdbCredentials(rl);
  const auth = await createIgdbAuth(credentials);
  const games = await readJsonFile(options.gamesPath, []);
  const imageManifest = await readJsonFile(options.imagesPath, {});
  if (!Array.isArray(games) || typeof imageManifest !== "object" || imageManifest === null) {
    rl.close();
    console.error("Invalid existing data files. Make sure games.json and game-images.json are valid JSON.");
    process.exit(1);
  }
  const { existingCards, existingImages } = dedupeFromExisting(games, imageManifest);

  let nextId = games.reduce((max, card) => {
    if (typeof card.id === "string" && card.id.startsWith("g-")) {
      const [, num] = card.id.match(/g-(\d+)/) || [];
      const parsed = Number.parseInt(num, 10);
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }
    return max;
  }, 1000);

  let imported = 0;
  const targetYears = getTargetYears(options);
  outer: for (const targetYear of targetYears) {
    let importedForYear = 0;
    let start = 0;

    if (targetYear !== null) {
      console.log(`\n=== Importing up to ${options.maxGames} popular games for ${targetYear} ===`);
    }

    while (options.mode !== "auto" ? imported < options.maxGames : importedForYear < options.maxGames) {
      const yearLabel = targetYear === null ? "" : ` for release year ${targetYear}`;
      console.log(`\nFetching top IGDB titles ${start + 1}..${start + options.pageSize}${yearLabel}`);
      const sortCandidates = resolveSortFallback(options.sort);
      const gamesPage = await (async () => {
        for (const sortBy of sortCandidates) {
          const items = await fetchIgdbGamesPage(start, options.pageSize, sortBy, auth);
          if (items.length) {
            console.log(`Using sort ${sortBy} for start ${start + 1}${yearLabel}`);
            return items;
          }
          console.log(`No results for sort ${sortBy}, trying next.`);
        }
        return [];
      })();
      if (!gamesPage.length) {
        console.log(targetYear === null
          ? "No more IGDB results found."
          : `No more IGDB results found while searching for ${targetYear}.`);
        break;
      }

      for (const rawGame of gamesPage) {
        if (options.mode !== "auto" && imported >= options.maxGames) break;
        if (options.mode === "auto" && targetYear !== null && importedForYear >= options.maxGames) break;
        const game = normalizeIgdbGameDetails(rawGame);
        if (!game) continue;
        if (targetYear !== null && game.releaseYear !== targetYear) continue;

        const key = `${normalize(game.title)}|${normalize(game.studio)}|${game.releaseYear}`;
        if (existingCards.has(key) || existingImages.has(`igdb-${game.appId}-${normalize(game.title).slice(0, 16) || "game"}-${game.releaseYear || "na"}`)) {
          continue;
        }

        console.log(`\nReview candidate: ${game.title} (${game.releaseYear}) by ${game.studio}`);
        let decision;
        if (options.mode === "auto") {
          const images = await autoChooseImages(game, options.autoImageCount, options);
          if (!images.length) {
            console.log("No eligible images found for auto mode. Skipping this title.");
            continue;
          }
          decision = { action: "use", images };
        } else {
          decision = await promptScreenshotChoice(rl, game, options);
          if (decision.action === "quit") break outer;
          if (decision.action === "skip") continue;
        }

        const imageId = makeImageKey(game.title, game.releaseYear, game.appId);
        if (existingImages.has(imageId)) {
          console.log("Image key already exists, choosing next available variant.");
          continue;
        }

        const nextNumber = String(++nextId).padStart(3, "0");
        games.push({
          id: `g-${nextNumber}`,
          title: game.title,
          studio: game.studio,
          year: game.releaseYear,
          imageId
        });
        imageManifest[imageId] = options.mode === "auto"
          ? decision.images
          : decision.image;
        existingCards.add(key);
        existingImages.add(imageId);
        imported += 1;
        if (targetYear !== null) {
          importedForYear += 1;
        }
        console.log(`Added: ${game.title} (${game.releaseYear})`);
        if (options.delayMs > 0) await delay(options.delayMs);
      }

      start += options.pageSize;
    }

    if (targetYear !== null) {
      console.log(`Finished year ${targetYear}: imported ${importedForYear} game(s).`);
    }
  }

  rl.close();

  const sorted = sortGamesByTimeline(games);
  await writeJsonFile(options.gamesPath, sorted);
  await writeJsonFile(options.imagesPath, imageManifest);
  console.log(`\nDone. Imported ${imported} new games.`);
  console.log(`Updated: ${path.relative(process.cwd(), options.gamesPath)} and ${path.relative(process.cwd(), options.imagesPath)}.`);
}

main().catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
