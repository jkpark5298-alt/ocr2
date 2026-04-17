const cameraBtn = document.getElementById("cameraBtn");
const galleryBtn = document.getElementById("galleryBtn");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("previewWrap");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const runBtn = document.getElementById("runBtn");
const copyBtn = document.getElementById("copyBtn");
const csvBtn = document.getElementById("csvBtn");
const statusEl = document.getElementById("status");
const searchTypeEl = document.getElementById("searchType");
const searchValueEl = document.getElementById("searchValue");
const removeZeroEl = document.getElementById("removeLeadingZero");
const resultTableHeadEl = document.getElementById("resultTableHead");
const resultTableBodyEl = document.getElementById("resultTableBody");
const copyOutputEl = document.getElementById("copyOutput");
const ocrRawOutputEl = document.getElementById("ocrRawOutput");
const ocrLinesOutputEl = document.getElementById("ocrLinesOutput");

let currentFile = null;
let lastRows = [];
let selectedColumns = ["flightNo", "stand", "name"];

const COLUMN_LABELS = {
  flightNo: "편명",
  stand: "주기장",
  name: "이름",
  nameRaw: "이름원문",
  flightRaw: "편명원문",
  standRaw: "주기장원문",
  raw: "합본원문"
};

const VALID_STANDS = [
  "621", "622", "623", "624", "625", "626", "627",
  "672", "673", "674L", "674R"
];

const KNOWN_NAMES = [
  "박종규",
  "강정형",
  "정찬호",
  "이영식",
  "김우석",
  "윤기선",
  "최용준"
];

const TABLE_RATIO = { x1: 0.03, y1: 0.02, x2: 0.97, y2: 0.94 };
const HEADER_SCAN_RATIO = { x1: 0.00, y1: 0.00, x2: 1.00, y2: 0.10 };
const BODY_SCAN_RATIO = { x1: 0.00, y1: 0.08, x2: 1.00, y2: 0.78 };

const FIXED_COLUMN_HINTS = {
  flight: { x0r: 0.00, x1r: 0.13 },
  stand:  { x0r: 0.13, x1r: 0.23 },
  name:   { x0r: 0.71, x1r: 0.86 }
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function resetFileInput(input) {
  if (input) input.value = "";
}

function showPreview(file) {
  if (!file || !preview) return;
  currentFile = file;
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.style.display = "block";
  if (previewWrap) previewWrap.classList.remove("empty");
  if (previewPlaceholder) previewPlaceholder.style.display = "none";
  setStatus(`선택됨: ${file.name}`);
}

if (cameraBtn && cameraInput) {
  cameraBtn.addEventListener("click", () => {
    resetFileInput(cameraInput);
    cameraInput.click();
  });
}

if (galleryBtn && galleryInput) {
  galleryBtn.addEventListener("click", () => {
    resetFileInput(galleryInput);
    galleryInput.click();
  });
}

if (cameraInput) {
  cameraInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) showPreview(file);
  });
}

if (galleryInput) {
  galleryInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) showPreview(file);
  });
}

function getSelectedColumns() {
  const checked = Array.from(document.querySelectorAll('input[name="columns"]:checked'))
    .map((el) => el.value)
    .filter(Boolean);
  return checked.length ? checked : ["flightNo", "stand", "name"];
}

function getSearchType() {
  return String(searchTypeEl?.value || "name");
}

function getSearchKeyword() {
  return String(searchValueEl?.value || "").trim();
}

function normalizeText(v) {
  return String(v || "")
    .replace(/\u00A0/g, " ")
    .replace(/[|]/g, "I")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[，]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(v) {
  return String(v || "").replace(/\s+/g, "");
}

function normalizeHeaderText(v) {
  return compactText(v)
    .toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S");
}

function normalizeStand(v) {
  if (!v) return "";
  let s = String(v).toUpperCase().replace(/\s+/g, "").trim();

  const map = {
    "6741": "674L",
    "674I": "674L",
    "674|": "674L",
    "674L.": "674L",
    "6748": "674R",
    "674B": "674R",
    "674R.": "674R"
  };

  s = map[s] || s;
  return VALID_STANDS.includes(s) ? s : "";
}

function extractStandFromText(text) {
  if (!text) return "";
  const upper = String(text).toUpperCase().replace(/\s+/g, "");
  const match = upper.match(/(621|622|623|624|625|626|627|672|673|674L|674R|674I|6741|6748|674B)/);
  return match ? normalizeStand(match[1]) : "";
}

function normalizeFlightNo(v, removeLeadingZero = true) {
  if (!v) return "";
  let s = String(v).toUpperCase().replace(/\s+/g, "").trim();

  s = s
    .replace(/^KJO/, "KJ0")
    .replace(/^KJQ/, "KJ0")
    .replace(/^KJI/, "KJ1")
    .replace(/^KJL/, "KJ1")
    .replace(/^KI/, "KJ")
    .replace(/^K\|/, "KJ")
    .replace(/^K\//, "KJ")
    .replace(/[^A-Z0-9]/g, "");

  const m = s.match(/^KJ(\d{3,4})$/);
  if (!m) return "";

  let num = m[1];
  if (removeLeadingZero) num = String(parseInt(num, 10));
  if (!/^\d{3,4}$/.test(num)) return "";

  return `KJ${num}`;
}

function extractFlightNoFromText(text, removeLeadingZero = true) {
  if (!text) return "";
  const upper = String(text).toUpperCase();

  let m = upper.match(/\bKJ[\s\-_:|./,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = upper.match(/\bK[JIOQL1|/][\s\-_:|./,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = upper.match(/\bK\s*J\s*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  return "";
}

function stripNamePrefix(v) {
  return String(v || "")
    .replace(/^[>\-_=+~*.,:;!?()$$$$$${}\\/]+/, "")
    .replace(/^[ABC8]\s*/i, "")
    .trim();
}

function normalizeKnownName(v) {
  if (!v) return "";
  let s = compactText(v);

  s = s
    .replace(/^[>\-_=+~*.,:;!?()$$$$$${}\\/]+/g, "")
    .replace(/^[ABC8]\s*/i, "")
    .replace(/^0\s*/, "")
    .replace(/^O\s*/, "")
    .replace(/[^A-Z가-힣0-9]/gi, "");

  const nameMap = {
    "박종규": "박종규",
    "박종구": "박종규",
    "박종큐": "박종규",
    "박종7": "박종규",
    "박종9": "박종규",

    "강정형": "강정형",
    "강정영": "강정형",
    "강정헝": "강정형",

    "정찬호": "정찬호",
    "정찬후": "정찬호",
    "정찬흐": "정찬호",

    "이영식": "이영식",
    "이영삭": "이영식",
    "이영직": "이영식",

    "김우석": "김우석",
    "김우서": "김우석",

    "윤기선": "윤기선",
    "윤기션": "윤기선",

    "최용준": "최용준",
    "최용순": "최용준",
    "최용춘": "최용준"
  };

  s = nameMap[s] || s;

  for (const name of KNOWN_NAMES) {
    if (s.includes(name)) return name;
  }
  return s;
}

function createCanvas(width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

async function fileToImage(file) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function preprocessFullImage(img) {
  const scale = 2.2;
  const canvas = createCanvas(Math.floor(img.width * scale), Math.floor(img.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function preprocessColumn(canvas, type) {
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let v = gray;

    if (type === "flight") {
      if (gray > 215) v = 255;
      else if (gray < 150) v = 0;
      else v = 85;
    } else if (type === "stand") {
      if (gray > 212) v = 255;
      else if (gray < 150) v = 0;
      else v = 70;
    } else if (type === "name") {
      if (gray > 220) v = 255;
      else if (gray < 140) v = 0;
      else v = 160;
    } else {
      if (gray > 220) v = 255;
      else if (gray < 145) v = 0;
    }

    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}

function cropCanvasByRatio(sourceCanvas, ratio) {
  const sx = Math.floor(sourceCanvas.width * ratio.x1);
  const sy = Math.floor(sourceCanvas.height * ratio.y1);
  const sw = Math.floor(sourceCanvas.width * (ratio.x2 - ratio.x1));
  const sh = Math.floor(sourceCanvas.height * (ratio.y2 - ratio.y1));

  const out = createCanvas(sw, sh);
  const ctx = out.getContext("2d");
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function cropCanvasByPx(sourceCanvas, sx, sy, sw, sh) {
  const out = createCanvas(sw, sh);
  const ctx = out.getContext("2d");
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function ensureDebugPreviewSection() {
  let wrap = document.getElementById("debugCropSection");
  if (wrap) return wrap;

  wrap = document.createElement("section");
  wrap.id = "debugCropSection";
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>6. Crop 디버그 미리보기</h2>
    <div style="margin-top:16px; display:grid; gap:16px;">
      <div><div style="font-weight:700; margin-bottom:8px;">table crop</div><div id="debugBoxTable" style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff; overflow:auto;"></div></div>
      <div><div style="font-weight:700; margin-bottom:8px;">header crop</div><div id="debugBoxHeader" style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff; overflow:auto;"></div></div>
      <div><div style="font-weight:700; margin-bottom:8px;">flight crop</div><div id="debugBoxFlight" style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff; overflow:auto;"></div></div>
      <div><div style="font-weight:700; margin-bottom:8px;">stand crop</div><div id="debugBoxStand" style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff; overflow:auto;"></div></div>
      <div><div style="font-weight:700; margin-bottom:8px;">name crop (R/O L/D)</div><div id="debugBoxName" style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff; overflow:auto;"></div></div>
    </div>
  `;

  const container = document.querySelector(".container");
  if (container) container.appendChild(wrap);
  return wrap;
}

function cloneCanvasForDisplay(canvas, maxWidth = 1000) {
  const out = document.createElement("canvas");
  const ratio = Math.min(1, maxWidth / canvas.width);
  out.width = Math.max(1, Math.floor(canvas.width * ratio));
  out.height = Math.max(1, Math.floor(canvas.height * ratio));
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  out.style.display = "block";
  out.style.maxWidth = "100%";
  out.style.height = "auto";
  out.style.borderRadius = "8px";
  return out;
}

function renderDebugCanvas(boxId, canvas, labelText = "") {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML = "";

  const meta = document.createElement("div");
  meta.style.fontSize = "12px";
  meta.style.color = "#475569";
  meta.style.marginBottom = "8px";
  meta.textContent = `${labelText} (${canvas.width} x ${canvas.height})`;

  box.appendChild(meta);
  box.appendChild(cloneCanvasForDisplay(canvas));
}

function renderCropDebugPreviews({ tableCanvas, headerCanvas, flightCanvas, standCanvas, nameCanvas }) {
  ensureDebugPreviewSection();
  renderDebugCanvas("debugBoxTable", tableCanvas, "table");
  renderDebugCanvas("debugBoxHeader", headerCanvas, "header");
  renderDebugCanvas("debugBoxFlight", flightCanvas, "flight");
  renderDebugCanvas("debugBoxStand", standCanvas, "stand");
  renderDebugCanvas("debugBoxName", nameCanvas, "name");
}

async function recognizeCanvasDetailed(canvas, lang, type) {
  const options = { logger: () => {} };

  if (type === "flight") {
    options.tessedit_pageseg_mode = 6;
    options.tessedit_char_whitelist = "KJ0123456789";
  } else if (type === "stand") {
    options.tessedit_pageseg_mode = 6;
    options.tessedit_char_whitelist = "0123456789LR";
  } else if (type === "name") {
    options.tessedit_pageseg_mode = 6;
  } else if (type === "header") {
    options.tessedit_pageseg_mode = 6;
  }

  return await Tesseract.recognize(canvas, lang, options);
}

function sortWords(words) {
  return [...words].sort((a, b) => {
    const ay = a.bbox?.y0 ?? 0;
    const by = b.bbox?.y0 ?? 0;
    if (Math.abs(ay - by) > 8) return ay - by;
    const ax = a.bbox?.x0 ?? 0;
    const bx = b.bbox?.x0 ?? 0;
    return ax - bx;
  });
}

function validWordText(text) {
  return normalizeText(text).length > 0;
}

function groupWordsIntoRows(words, tolerance = 18) {
  const rows = [];
  const sorted = sortWords(words).filter((w) => validWordText(w.text));

  for (const word of sorted) {
    const y = word.bbox?.y0 ?? 0;
    let found = null;

    for (const row of rows) {
      if (Math.abs(row.avgY - y) <= tolerance) {
        found = row;
        break;
      }
    }

    if (!found) {
      found = { words: [], avgY: y };
      rows.push(found);
    }

    found.words.push(word);
    found.avgY = found.words.reduce((sum, w) => sum + (w.bbox?.y0 ?? 0), 0) / found.words.length;
  }

  return rows
    .map((row) => {
      const sortedWords = [...row.words].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0));
      const text = sortedWords.map((w) => normalizeText(w.text)).join(" ").trim();
      return { y: row.avgY, text };
    })
    .filter((row) => row.text);
}

function linesFromTesseract(result) {
  const lines = result?.data?.lines || [];
  return lines
    .map((line) => ({
      y: line?.bbox?.y0 ?? 0,
      text: normalizeText(line?.text || "")
    }))
    .filter((row) => row.text);
}

function mergeNearRows(rows, tolerance = 12) {
  if (!rows.length) return [];

  const sorted = [...rows].sort((a, b) => a.y - b.y);
  const out = [];

  for (const row of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - row.y) <= tolerance) {
      last.text = normalizeText(`${last.text} ${row.text}`);
      last.y = (last.y + row.y) / 2;
    } else {
      out.push({ ...row });
    }
  }

  return out;
}

function cleanFlightRows(rows) {
  return rows.map((r) => r.text).filter((text) => {
    const c = compactText(text).toUpperCase();
    if (!c || c.includes("편명")) return false;
    return /K/.test(c) && /\d/.test(c);
  });
}

function cleanStandRows(rows) {
  return rows.map((r) => r.text).filter((text) => {
    const c = compactText(text).toUpperCase();
    if (!c || c.includes("주기장")) return false;
    return /(621|622|623|624|625|626|627|672|673|674)/.test(c);
  });
}

function cleanNameRows(rows) {
  return rows.map((r) => r.text).filter((text) => {
    const c = compactText(text);
    if (!c) return false;
    if (c === "-") return true;
    return /[ABC8가-힣]/i.test(c);
  });
}

function pickBetterNameRows(nameResult) {
  const fromLines = cleanNameRows(mergeNearRows(linesFromTesseract(nameResult), 10));
  const fromWords = cleanNameRows(groupWordsIntoRows(nameResult?.data?.words || [], 16));

  const score = (arr) => {
    let s = 0;
    for (const line of arr) {
      const c = compactText(line);
      if (/^[ABC8]$/.test(c)) s += 3;
      if (/^[ABC8][가-힣]{2,4}$/.test(c)) s += 8;
      if (KNOWN_NAMES.some((name) => c.includes(name))) s += 10;
      if (/[가-힣]/.test(c)) s += 2;
      if (/[@#$%^&*_=+]/.test(c)) s -= 4;
    }
    return s;
  };

  return score(fromLines) >= score(fromWords) ? fromLines : fromWords;
}

function parseNameLine(rawLine) {
  const line = normalizeText(rawLine);
  const compact = compactText(line);

  if (!line) return { label: "", name: "", raw: "" };

  if (
    compact === "-" ||
    compact === "—" ||
    compact === "_" ||
    compact === "." ||
    compact === ".." ||
    compact === "..." ||
    compact === "·"
  ) {
    return { label: "-", name: "", raw: line };
  }

  const cleanedCompact = compact
    .replace(/^[>\-_=+~*.,:;!?]+/, "")
    .replace(/^8/, "B");

  const full = cleanedCompact.match(/^([ABC])([가-힣]{2,4})$/i);
  if (full) {
    return {
      label: full[1].toUpperCase(),
      name: normalizeKnownName(full[2]),
      raw: line
    };
  }

  const loose = cleanedCompact.match(/^([ABC])(.+)$/i);
  if (loose) {
    const normalized = normalizeKnownName(loose[2]);

    if (!KNOWN_NAMES.includes(normalized)) {
      return {
        label: loose[1].toUpperCase(),
        name: "",
        raw: line
      };
    }

    return {
      label: loose[1].toUpperCase(),
      name: normalized,
      raw: line
    };
  }

  const normalized = normalizeKnownName(cleanedCompact);

  if (!KNOWN_NAMES.includes(normalized)) {
    return {
      label: "",
      name: "",
      raw: line
    };
  }

  return {
    label: "",
    name: normalized,
    raw: line
  };
}

function buildNameMap(parsedNameRows) {
  const map = {};
  for (const row of parsedNameRows) {
    if (row.label && row.name && KNOWN_NAMES.includes(row.name)) {
      map[row.label] = row.name;
    }
  }
  return map;
}

function resolveNameRows(parsedNameRows, nameMap) {
  return parsedNameRows.map((row) => {
    if (row.name && KNOWN_NAMES.includes(row.name)) {
      return row;
    }

    if (!row.name) {
      return {
        ...row,
        name: ""
      };
    }

    return row;
  });
}

function mergeRows(flightRows, nameRows, standRows) {
  const rowCount = Math.max(flightRows.length, nameRows.length, standRows.length);
  const out = [];
  const removeLeadingZero = !!removeZeroEl?.checked;

  for (let i = 0; i < rowCount; i++) {
    const flightRaw = flightRows[i] || "";
    const standRaw = standRows[i] || "";
    const nameObj = nameRows[i] || { label: "", name: "", raw: "" };

    const finalName = KNOWN_NAMES.includes(nameObj.name) ? nameObj.name : "";

    out.push({
      flightNo: extractFlightNoFromText(flightRaw, removeLeadingZero),
      stand: extractStandFromText(standRaw),
      name: finalName,
      nameRaw: nameObj.raw || "",
      flightRaw,
      standRaw,
      raw: [flightRaw, standRaw, nameObj.raw].filter(Boolean).join(" | ")
    });
  }

  return out;
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [row.flightNo || "", row.name || "", row.stand || ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function isSearchMatched(row) {
  const keyword = getSearchKeyword();
  const type = getSearchType();

  if (!keyword) return true;

  if (type === "raw") {
    return compactText(row.raw).includes(compactText(keyword));
  }

  const q = normalizeKnownName(keyword);
  const rawWithoutPrefix = stripNamePrefix(row.nameRaw || "");

  return (
    compactText(row.name).includes(compactText(q)) ||
    compactText(normalizeKnownName(rawWithoutPrefix)).includes(compactText(q)) ||
    compactText(row.nameRaw).includes(compactText(keyword))
  );
}

function renderTable(rows, columns) {
  if (!resultTableHeadEl || !resultTableBodyEl) return;

  resultTableHeadEl.innerHTML = "";
  resultTableBodyEl.innerHTML = "";

  const headTr = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = COLUMN_LABELS[col] || col;
    headTr.appendChild(th);
  });
  resultTableHeadEl.appendChild(headTr);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] || "";
      tr.appendChild(td);
    });
    resultTableBodyEl.appendChild(tr);
  });
}

function stripFlightPrefix(flightNo) {
  return String(flightNo || "").replace(/^KJ/i, "");
}

function buildCopyText(rows) {
  return rows.map((row, idx) => {
    const flightFull = row.flightNo || "";
    const flightShort = stripFlightPrefix(flightFull);
    const stand = row.stand || "";
    return `${idx + 1}. ${flightFull} / ${flightShort} / ${stand}`;
  }).join("\n");
}

function downloadCSV(rows, columns) {
  if (!rows.length) {
    alert("다운로드할 결과가 없습니다.");
    return;
  }

  const header = columns.map((c) => `"${(COLUMN_LABELS[c] || c).replace(/"/g, '""')}"`).join(",");
  const body = rows.map((row) =>
    columns.map((c) => `"${String(row[c] || "").replace(/"/g, '""')}"`).join(",")
  );

  const csv = [header, ...body].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "ocr_result.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getHeaderType(text) {
  const s = normalizeHeaderText(text);
  if (!s) return "";

  if (s.includes("편명")) return "flight";
  if (s.includes("주기장")) return "stand";
  if (
    s.includes("ROLD") ||
    s.includes("R/OLD") ||
    (s.includes("R/O") && s.includes("L/D")) ||
    (s.includes("RO") && s.includes("LD"))
  ) {
    return "name";
  }

  return "";
}

function detectHeadersFromHeaderResult(headerResult, headerCanvasWidth) {
  const words = headerResult?.data?.words || [];
  const rows = [];

  for (const w of sortWords(words)) {
    const text = normalizeText(w.text || "");
    if (!text) continue;

    const y = w.bbox?.y0 ?? 0;
    let found = null;

    for (const row of rows) {
      if (Math.abs(row.avgY - y) <= 24) {
        found = row;
        break;
      }
    }

    if (!found) {
      found = { words: [], avgY: y };
      rows.push(found);
    }

    found.words.push(w);
    found.avgY = found.words.reduce((sum, item) => sum + (item.bbox?.y0 ?? 0), 0) / found.words.length;
  }

  const candidateRows = rows
    .map((row) => ({
      y: row.avgY,
      words: [...row.words].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0))
    }))
    .sort((a, b) => a.y - b.y);

  const headerRow = candidateRows[0] || { words: [] };
  const detected = [];

  for (let i = 0; i < headerRow.words.length; i++) {
    const w1 = headerRow.words[i];
    const t1 = normalizeText(w1.text || "");
    const one = getHeaderType(t1);
    if (one) {
      detected.push({ type: one, x0: w1.bbox?.x0 ?? 0, x1: w1.bbox?.x1 ?? 0, text: t1 });
      continue;
    }

    if (i < headerRow.words.length - 1) {
      const w2 = headerRow.words[i + 1];
      const joined = `${normalizeText(w1.text || "")} ${normalizeText(w2.text || "")}`;
      const two = getHeaderType(joined);
      if (two) {
        detected.push({
          type: two,
          x0: Math.min(w1.bbox?.x0 ?? 0, w2.bbox?.x0 ?? 0),
          x1: Math.max(w1.bbox?.x1 ?? 0, w2.bbox?.x1 ?? 0),
          text: joined
        });
      }
    }
  }

  const byType = {};
  for (const d of detected) {
    if (!byType[d.type]) byType[d.type] = d;
  }

  const fallback = {
    flight: {
      x0: Math.floor(headerCanvasWidth * FIXED_COLUMN_HINTS.flight.x0r),
      x1: Math.floor(headerCanvasWidth * FIXED_COLUMN_HINTS.flight.x1r),
      text: "fallback-flight",
      type: "flight"
    },
    stand: {
      x0: Math.floor(headerCanvasWidth * FIXED_COLUMN_HINTS.stand.x0r),
      x1: Math.floor(headerCanvasWidth * FIXED_COLUMN_HINTS.stand.x1r),
      text: "fallback-stand",
      type: "stand"
    },
    name: {
      x0: Math.floor(headerCanvasWidth * FIXED_COLUMN_HINTS.name.x0r),
      x1: Math.floor(headerCanvasWidth * FIXED_COLUMN_HINTS.name.x1r),
      text: "fallback-name",
      type: "name"
    }
  };

  return {
    flight: byType.flight || fallback.flight,
    stand: byType.stand || fallback.stand,
    name: byType.name || fallback.name,
    debugList: ["flight", "stand", "name"].map((k) => byType[k] || fallback[k])
  };
}

function buildColumnRangeMap(detected, totalWidth) {
  const cols = [
    { type: "flight", ...detected.flight },
    { type: "stand", ...detected.stand },
    { type: "name", ...detected.name }
  ].sort((a, b) => a.x0 - b.x0);

  const ranges = {};

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const prev = cols[i - 1];
    const next = cols[i + 1];

    let left = Math.max(0, col.x0 - 8);
    let right = Math.min(totalWidth, col.x1 + 8);

    if (prev) left = Math.max(left, Math.floor((prev.x1 + col.x0) / 2));
    if (next) right = Math.min(right, Math.floor((col.x1 + next.x0) / 2));

    if (right <= left + 10) {
      left = Math.max(0, col.x0 - 12);
      right = Math.min(totalWidth, col.x1 + 12);
    }

    ranges[col.type] = { x0: left, x1: right };
  }

  return ranges;
}

function buildFixedColumnRangeMap(totalWidth) {
  return {
    flight: {
      x0: Math.floor(totalWidth * FIXED_COLUMN_HINTS.flight.x0r),
      x1: Math.floor(totalWidth * FIXED_COLUMN_HINTS.flight.x1r)
    },
    stand: {
      x0: Math.floor(totalWidth * FIXED_COLUMN_HINTS.stand.x0r),
      x1: Math.floor(totalWidth * FIXED_COLUMN_HINTS.stand.x1r)
    },
    name: {
      x0: Math.floor(totalWidth * FIXED_COLUMN_HINTS.name.x0r),
      x1: Math.floor(totalWidth * FIXED_COLUMN_HINTS.name.x1r)
    }
  };
}

function hasEnoughStandRows(rows) {
  const valid = rows.filter((r) => extractStandFromText(r));
  return valid.length >= 3;
}

function hasEnoughNameRows(rows) {
  const valid = rows.filter((r) => {
    const p = parseNameLine(r);
    return !!(p.name && KNOWN_NAMES.includes(p.name));
  });
  return valid.length >= 2;
}

async function extractUsingRanges(tableCanvas, headerCanvas, columnRanges, modeLabel) {
  const bodyYOffset = Math.floor(tableCanvas.height * BODY_SCAN_RATIO.y1);
  const bodyHeight = Math.max(1, Math.floor(tableCanvas.height * (BODY_SCAN_RATIO.y2 - BODY_SCAN_RATIO.y1)));

  const flightRange = columnRanges.flight;
  const standRange = columnRanges.stand;
  const nameRange = columnRanges.name;

  const flightCanvasRaw = cropCanvasByPx(tableCanvas, flightRange.x0, bodyYOffset, Math.max(1, flightRange.x1 - flightRange.x0), bodyHeight);
  const standCanvasRaw = cropCanvasByPx(tableCanvas, standRange.x0, bodyYOffset, Math.max(1, standRange.x1 - standRange.x0), bodyHeight);
  const nameCanvasRaw = cropCanvasByPx(tableCanvas, nameRange.x0, bodyYOffset, Math.max(1, nameRange.x1 - nameRange.x0), bodyHeight);

  const flightCanvas = preprocessColumn(flightCanvasRaw, "flight");
  const standCanvas = preprocessColumn(standCanvasRaw, "stand");
  const nameCanvas = preprocessColumn(nameCanvasRaw, "name");

  renderCropDebugPreviews({
    tableCanvas,
    headerCanvas,
    flightCanvas,
    standCanvas,
    nameCanvas
  });

  setStatus(`편명 열 OCR 중... (${modeLabel})`);
  const flightResult = await recognizeCanvasDetailed(flightCanvas, "eng", "flight");

  setStatus(`주기장 열 OCR 중... (${modeLabel})`);
  const standResult = await recognizeCanvasDetailed(standCanvas, "eng", "stand");

  setStatus(`이름 열 OCR 중... (${modeLabel})`);
  const nameResult = await recognizeCanvasDetailed(nameCanvas, "kor+eng", "name");

  const flightRowsRaw = mergeNearRows(linesFromTesseract(flightResult), 10);
  const standRowsRaw = mergeNearRows(linesFromTesseract(standResult), 10);

  const flightRows = cleanFlightRows(
    flightRowsRaw.length ? flightRowsRaw : groupWordsIntoRows(flightResult?.data?.words || [], 16)
  );

  const standRows = cleanStandRows(
    standRowsRaw.length ? standRowsRaw : groupWordsIntoRows(standResult?.data?.words || [], 16)
  );

  const nameRowsText = pickBetterNameRows(nameResult);

  return {
    flightResult,
    standResult,
    nameResult,
    flightRows,
    standRows,
    nameRowsText
  };
}

async function extractRowsBySeparatedColumns(file) {
  const img = await fileToImage(file);
  const processed = preprocessFullImage(img);

  const tableCanvas = cropCanvasByRatio(processed, TABLE_RATIO);
  const headerCanvas = cropCanvasByRatio(tableCanvas, HEADER_SCAN_RATIO);

  setStatus("헤더 분석 중...");
  const headerForOCR = preprocessColumn(headerCanvas, "header");
  const headerResult = await recognizeCanvasDetailed(headerForOCR, "kor+eng", "header");

  const headerDetected = detectHeadersFromHeaderResult(headerResult, headerCanvas.width);
  const autoColumnRanges = buildColumnRangeMap(headerDetected, tableCanvas.width);
  const fixedColumnRanges = buildFixedColumnRangeMap(tableCanvas.width);

  let usedMode = "auto";
  let usedRanges = autoColumnRanges;
  let pass = await extractUsingRanges(tableCanvas, headerCanvas, autoColumnRanges, "auto");

  if (!hasEnoughStandRows(pass.standRows) || !hasEnoughNameRows(pass.nameRowsText)) {
    usedMode = "fixed-fallback";
    usedRanges = fixedColumnRanges;
    pass = await extractUsingRanges(tableCanvas, headerCanvas, fixedColumnRanges, "fixed");
  }

  const parsedNameRows = pass.nameRowsText.map(parseNameLine);
  const nameMap = buildNameMap(parsedNameRows);
  const resolvedNameRows = resolveNameRows(parsedNameRows, nameMap);

  const mergedRows = mergeRows(pass.flightRows, resolvedNameRows, pass.standRows);
  const rows = dedupeRows(
    mergedRows.filter((row) => row.flightNo && row.stand).filter(isSearchMatched)
  );

  const debugText = [
    "[MODE]",
    usedMode,
    "",
    "[HEADER OCR TEXT]",
    headerResult?.data?.text || "",
    "",
    "[HEADER DETECTED]",
    JSON.stringify(headerDetected.debugList, null, 2),
    "",
    "[AUTO COLUMN RANGES]",
    JSON.stringify(autoColumnRanges, null, 2),
    "",
    "[FIXED COLUMN RANGES]",
    JSON.stringify(fixedColumnRanges, null, 2),
    "",
    "[USED COLUMN RANGES]",
    JSON.stringify(usedRanges, null, 2),
    "",
    "[편명 열 TEXT]",
    pass.flightResult?.data?.text || "",
    "",
    "[주기장 열 TEXT]",
    pass.standResult?.data?.text || "",
    "",
    "[이름 열 TEXT]",
    pass.nameResult?.data?.text || "",
    "",
    "[이름 코드 매핑]",
    JSON.stringify(nameMap, null, 2)
  ].join("\n");

  const lineDebug = mergedRows.map((row, idx) => {
    return [
      `${idx + 1}.`,
      `flightRaw=${row.flightRaw || "-"}`,
      `nameRaw=${row.nameRaw || "-"}`,
      `standRaw=${row.standRaw || "-"}`,
      `=> flight=${row.flightNo || "-"}`,
      `name=${row.name || "-"}`,
      `stand=${row.stand || "-"}`
    ].join(" | ");
  }).join("\n\n");

  return { rows, debugText, lineDebug };
}

if (runBtn) {
  runBtn.addEventListener("click", async () => {
    if (!currentFile) {
      alert("사진을 먼저 선택하세요.");
      return;
    }

    try {
      selectedColumns = getSelectedColumns();
      setStatus("이미지 분석 준비 중...");

      if (ocrRawOutputEl) ocrRawOutputEl.value = "";
      if (ocrLinesOutputEl) ocrLinesOutputEl.value = "";
      if (copyOutputEl) copyOutputEl.value = "";

      const { rows, debugText, lineDebug } = await extractRowsBySeparatedColumns(currentFile);

      lastRows = rows;
      renderTable(lastRows, selectedColumns);

      if (copyOutputEl) copyOutputEl.value = buildCopyText(lastRows);
      if (ocrRawOutputEl) ocrRawOutputEl.value = debugText;
      if (ocrLinesOutputEl) ocrLinesOutputEl.value = lineDebug;

      setStatus(`완료 (${lastRows.length}건)`);
    } catch (err) {
      console.error(err);
      setStatus("오류 발생");
      alert("OCR 처리 중 오류가 발생했습니다.");
    }
  });
}

if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const text = copyOutputEl ? copyOutputEl.value : "";
    if (!text) {
      alert("복사할 결과가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      alert("복사 완료");
    } catch (e) {
      console.error(e);
      alert("복사 실패");
    }
  });
}

if (csvBtn) {
  csvBtn.addEventListener("click", () => {
    downloadCSV(lastRows, selectedColumns);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.error("SW 등록 실패:", err);
    });
  });
}
