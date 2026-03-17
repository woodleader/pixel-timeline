const ui = {
  form: document.getElementById("cardForm"),
  formTitle: document.getElementById("formTitle"),
  title: document.getElementById("gameTitle"),
  studio: document.getElementById("gameStudio"),
  year: document.getElementById("gameYear"),
  screenshotUrl: document.getElementById("screenshotUrl"),
  screenshotFile: document.getElementById("screenshotFile"),
  preview: document.getElementById("screenshotPreview"),
  clearForm: document.getElementById("clearForm"),
  saveButton: document.getElementById("saveCard"),
  formStatus: document.getElementById("formStatus"),
  libraryRows: document.getElementById("libraryRows"),
  librarySummary: document.getElementById("librarySummary"),
  exportGames: document.getElementById("exportGames"),
  exportImages: document.getElementById("exportImages"),
  importInput: document.getElementById("importGamesFile"),
  importBtn: document.getElementById("importBtn"),
  importImagesInput: document.getElementById("importImagesFile"),
  importImagesBtn: document.getElementById("importImagesBtn"),
  fileStatus: document.getElementById("fileStatus")
};

const GAMES_JSON = "games.json";
const IMAGE_JSON = "game-images.json";
let cards = [];
let imageManifest = {};
let editingId = "";

function normalizeText(value) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function safe(value) {
  return String(value || "").trim();
}

function clampYear(raw) {
  const year = Number.parseInt(String(raw || "").trim(), 10);
  return Number.isFinite(year) ? year : NaN;
}

function slugify(value, fallback) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    || fallback;
}

function normalizeCards(items) {
  const dedupe = new Set();
  const out = [];

  items.forEach((card) => {
    const title = safe(card.title);
    const studio = safe(card.studio);
    const year = clampYear(card.year);
    const id = safe(card.id);
    const image = safe(card.image);
    const imageId = safe(card.imageId);

    if (!title || !studio || !Number.isFinite(year)) return;

    const key = `${normalizeText(title)}|${normalizeText(studio)}|${year}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);

    out.push({
      id: id || `g-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      title,
      studio,
      year,
      image,
      imageId: imageId || `img-${slugify(title, "game")}-${year}`
    });
  });

  return out.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.title.localeCompare(b.title);
  });
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== "object") return {};
  const map = {};
  Object.keys(raw).forEach((id) => {
    const value = safe(raw[id]);
    if (id && value) map[String(id)] = value;
  });
  return map;
}

function resolveImage(card) {
  if (card.image) return card.image;
  const manifestValue = imageManifest[card.imageId];
  return manifestValue ? String(manifestValue) : "";
}

function toGamesPayload() {
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    studio: card.studio,
    year: card.year,
    imageId: card.imageId
  }));
}

function triggerDownload(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function mergeImageManifest(next) {
  imageManifest = { ...imageManifest, ...next };
  refreshImageManifestForOrphans();
  cards = cards.map((card) => ({
    ...card,
    image: resolveImage(card)
  }));
  renderTable();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function status(text, kind = "") {
  ui.formStatus.textContent = text;
  ui.formStatus.className = `muted ${kind}`.trim();
}

function fileStatus(text, kind = "") {
  ui.fileStatus.textContent = text;
  ui.fileStatus.className = `muted ${kind}`.trim();
}

function clearForm() {
  editingId = "";
  ui.formTitle.textContent = "Add game";
  ui.title.value = "";
  ui.studio.value = "";
  ui.year.value = "";
  ui.screenshotUrl.value = "";
  ui.screenshotFile.value = "";
  ui.preview.removeAttribute("src");
  ui.saveButton.textContent = "Save game";
  status("");
}

function imageFromInput() {
  if (ui.screenshotFile.files && ui.screenshotFile.files[0]) {
    return readFileAsDataUrl(ui.screenshotFile.files[0]);
  }
  return Promise.resolve(ui.screenshotUrl.value.trim());
}

function ensureImageId(cardTitle, cardYear, imageId) {
  const base = `${slugify(cardTitle, "game")}-${cardYear}`;
  return imageId || `img-${base}`;
}

async function handleSubmit(event) {
  event.preventDefault();

  const title = safe(ui.title.value);
  const studio = safe(ui.studio.value);
  const year = clampYear(ui.year.value);

  if (!title || !studio || !Number.isFinite(year)) {
    status("Please fill title, studio and year.", "warn");
    return;
  }

  let image = safe(ui.screenshotUrl.value);
  if (ui.screenshotFile.files && ui.screenshotFile.files[0]) {
    image = await imageFromInput();
  }

  const editingCard = cards.find((card) => card.id === editingId);
  const inheritedImageId = editingCard ? editingCard.imageId : "";
  const imageId = inheritedImageId || ensureImageId(title, year);

  if (!image && !imageManifest[imageId]) {
    status("Provide screenshot URL or upload an image.", "warn");
    return;
  }

  if (editingId) {
    cards = cards.map((card) => {
      if (card.id !== editingId) return card;
      return {
        ...card,
        title,
        studio,
        year,
        image: image || card.image || "",
        imageId
      };
    });
    if (image) {
      imageManifest[imageId] = image;
    }
    status("Game updated.", "success");
  } else {
    const newId = `g-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const finalImage = image || "";

    cards.push({
      id: newId,
      title,
      studio,
      year,
      image: image ? finalImage : "",
      imageId
    });

    if (finalImage) {
      imageManifest[imageId] = finalImage;
    }
    status("Game added.", "success");
  }

  cards = normalizeCards(cards.map((c) => ({ ...c })));

  if (editingCard) {
    imageManifest[imageId] = image || resolveImage(editingCard) || imageManifest[imageId] || "";
  }

  refreshImageManifestForOrphans();
  renderTable();
  clearForm();
  setTimeout(() => status(""), 1400);
}

function refreshImageManifestForOrphans() {
  const used = new Set(cards.map((card) => card.imageId));
  const cleaned = {};
  used.forEach((id) => {
    if (imageManifest[id]) cleaned[id] = imageManifest[id];
  });
  imageManifest = cleaned;
}

function deleteCard(targetId) {
  const target = cards.find((card) => card.id === targetId);
  if (!target) return;
  if (!window.confirm(`Delete ${target.title}?`)) return;

  cards = cards.filter((card) => card.id !== targetId);
  refreshImageManifestForOrphans();

  if (editingId === targetId) {
    clearForm();
  }

  renderTable();
  status(`Deleted ${target.title}.`, "warn");
  setTimeout(() => status(""), 1400);
}

function editCard(targetId) {
  const card = cards.find((entry) => entry.id === targetId);
  if (!card) return;

  editingId = card.id;
  ui.formTitle.textContent = "Edit game";
  ui.title.value = card.title;
  ui.studio.value = card.studio;
  ui.year.value = String(card.year);
  ui.screenshotUrl.value = card.image ? card.image : "";
  ui.screenshotFile.value = "";

  const preview = resolveImage(card);
  if (preview) ui.preview.src = preview;
  else ui.preview.removeAttribute("src");

  ui.saveButton.textContent = "Update game";
}

function renderTable() {
  ui.libraryRows.innerHTML = "";
  ui.librarySummary.textContent = `${cards.length} game${cards.length === 1 ? "" : "s"} in working library.`;

  cards.forEach((card) => {
    const row = document.createElement("tr");

    const imageCell = document.createElement("td");
    const image = document.createElement("img");
    image.className = "admin-thumb";
    image.alt = card.title;
    const src = resolveImage(card);
    image.src = src || "";
    imageCell.appendChild(image);

    const titleCell = document.createElement("td");
    titleCell.textContent = card.title;

    const studioCell = document.createElement("td");
    studioCell.textContent = card.studio;

    const yearCell = document.createElement("td");
    yearCell.textContent = String(card.year);

    const imageIdCell = document.createElement("td");
    imageIdCell.textContent = card.imageId;

    const actionsCell = document.createElement("td");
    const edit = document.createElement("button");
    const remove = document.createElement("button");
    edit.type = "button";
    remove.type = "button";
    edit.textContent = "Edit";
    remove.textContent = "Delete";

    edit.addEventListener("click", () => editCard(card.id));
    remove.addEventListener("click", () => deleteCard(card.id));

    actionsCell.appendChild(edit);
    actionsCell.appendChild(remove);

    row.appendChild(imageCell);
    row.appendChild(titleCell);
    row.appendChild(studioCell);
    row.appendChild(yearCell);
    row.appendChild(imageIdCell);
    row.appendChild(actionsCell);
    ui.libraryRows.appendChild(row);
  });
}

function hydrateImageInputStatus(url) {
  if (url && url.trim()) ui.preview.src = url.trim();
}

async function initialize() {
  try {
    const [gamesResponse, imageResponse] = await Promise.all([
      fetch(GAMES_JSON, { cache: "no-store" }),
      fetch(IMAGE_JSON, { cache: "no-store" })
    ]);

    if (gamesResponse.ok) {
      const loadedGames = await gamesResponse.json();
      cards = normalizeCards(Array.isArray(loadedGames) ? loadedGames : []);
    }

    if (imageResponse.ok) {
      imageManifest = normalizeManifest(await imageResponse.json());
    }

    if (!cards.length && !imageManifest) {
      fileStatus("Could not load any game data.");
    } else {
      fileStatus(`Loaded ${cards.length} games from ${GAMES_JSON}.`);
    }

    cards = cards.map((card) => ({
      ...card,
      image: resolveImage(card)
    }));

    cards.forEach((card) => {
      if (card.image && card.imageId && !imageManifest[card.imageId]) {
        imageManifest[card.imageId] = card.image;
      }
    });

    renderTable();
  } catch {
    fileStatus("Failed to load library files.");
  }

  ui.screenshotUrl.addEventListener("input", () => hydrateImageInputStatus(ui.screenshotUrl.value));
  ui.screenshotFile.addEventListener("change", async () => {
    const file = ui.screenshotFile.files && ui.screenshotFile.files[0];
    if (!file) return;
    try {
      ui.preview.src = await readFileAsDataUrl(file);
    } catch {
      status("Could not read image file.", "warn");
    }
  });

  ui.form.addEventListener("submit", handleSubmit);
  ui.clearForm.addEventListener("click", clearForm);

  ui.exportGames.addEventListener("click", () => {
    triggerDownload("games.json", toGamesPayload());
    fileStatus("Downloaded games.json", "success");
  });

  ui.exportImages.addEventListener("click", () => {
    triggerDownload("game-images.json", imageManifest);
    fileStatus("Downloaded game-images.json", "success");
  });

  ui.importBtn.addEventListener("click", () => ui.importInput.click());
  ui.importInput.addEventListener("change", async () => {
    const file = ui.importInput.files && ui.importInput.files[0];
    if (!file) return;
    try {
      const raw = await readFileAsText(file);
      const loaded = JSON.parse(raw);
      if (!Array.isArray(loaded)) throw new Error("invalid");
      const imported = normalizeCards(loaded);
      if (!imported.length) throw new Error("empty");
      cards = imported.map((card) => ({
        ...card,
        image: card.image
      }));
      cards.forEach((card) => {
        if (card.image && card.imageId) {
          imageManifest[card.imageId] = card.image;
        }
      });
      refreshImageManifestForOrphans();
      renderTable();
      fileStatus(`Imported ${cards.length} entries from ${file.name}.`, "success");
      clearForm();
    } catch {
      fileStatus("Failed to import JSON. Must be array of game records.", "warn");
    }
    ui.importInput.value = "";
  });

  ui.importImagesBtn.addEventListener("click", () => ui.importImagesInput.click());
  ui.importImagesInput.addEventListener("change", async () => {
    const file = ui.importImagesInput.files && ui.importImagesInput.files[0];
    if (!file) return;
    try {
      const raw = await readFileAsText(file);
      const loaded = JSON.parse(raw);
      const normalized = normalizeManifest(loaded);

      if (!Object.keys(normalized).length) {
        fileStatus("Failed to import game-images.json. Expect object map format.", "warn");
        ui.importImagesInput.value = "";
        return;
      }

      mergeImageManifest(normalized);
      fileStatus(`Imported ${Object.keys(normalized).length} image entries.`, "success");
    } catch {
      fileStatus("Failed to import game-images.json. Ensure valid JSON object.", "warn");
    }

    ui.importImagesInput.value = "";
  });
}

initialize();
