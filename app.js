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
  "최용준",
  "변철웅",
  "임성우",
  "우식웅"
];

const TABLE_RATIO = { x1: 0.02, y1: 0.01, x2: 0.98, y2: 0.98 };
const HEADER_SCAN_RATIO = { x1: 0.00, y1: 0.00, x2: 1.00, y2: 0.16 };
const BODY_SCAN_RATIO = { x1: 0.00, y1: 0.10, x2: 1.00, y2: 0.96 };

// 외항사스케줄 8열 대략 비율 (사진마다 probe로 재보정)
const FIXED_COLUMN_HINTS = {
  flight: { x0r: 0.12, x1r: 0.26 },
  stand:  { x0r: 0.60, x1r: 0.73 },
  name:   { x0r: 0.73, x1r: 0.90 }
};

const ROW_MATCH_TOLERANCE = 18;
const NAME_SLOT_MAX_TOLERANCE = 24;
const NAME_ORDINAL_WEIGHT = 3;
const INF = 1e9;

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

  m = upper.match(/\bKJO[\s\-_:|./,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(String(m[0]).replace(/^KJO/, "KJ0"), removeLeadingZero);

  m = upper.match(/\bK[JIOQL1|/][\s\-_:|./,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = upper.match(/\bK\s*J\s*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  return "";
}

function stripNamePrefix(v) {
  return String(v || "")
    .replace(/^[>\-_=+~*.,:;!?()$$$$$${}\\/]+/, "")
    .replace(/^[ABC856쓰]\s*/i, "")
    .trim();
}

function normalizeKnownName(v) {
  if (!v) return "";
  let s = compactText(v);

  s = s
    .replace(/^[>\-_=+~*.,:;!?()$$$$$${}\\/]+/g, "")
    .replace(/^[ABC856쓰]\s*/i, "")
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
  // 좌우 여백을 넣어 글자 잘림/세로선 간섭을 줄임
  const padX = type === "name" ? 10 : 6;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, padX, 0, Math.max(1, out.width - padX * 2), out.height);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let v = gray;

    if (type === "flight") {
      // 흰 배경 + 검정 글자 유지 (회색 배경으로 만들지 않음)
      if (gray > 190) v = 255;
      else if (gray < 160) v = 0;
      else v = gray > 175 ? 255 : 0;
    } else if (type === "stand") {
      if (gray > 190) v = 255;
      else if (gray < 155) v = 0;
      else v = gray > 172 ? 255 : 0;
    } else if (type === "name") {
      // 한글은 강한 이진화보다 그레이스케일 유지가 유리
      if (gray > 210) v = 255;
      else if (gray < 120) v = 0;
      else v = gray;
    } else {
      if (gray > 210) v = 255;
      else if (gray < 140) v = 0;
      else v = gray;
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

function cleanFlightRowsWithY(rows) {
  return rows
    .filter((r) => {
      const c = compactText(r.text).toUpperCase();
      if (!c || c.includes("편명")) return false;
      return /K/.test(c) && /\d/.test(c);
    })
    .map((r) => ({ y: r.y, text: r.text }));
}

function cleanStandRowsWithY(rows) {
  return rows
    .filter((r) => {
      const c = compactText(r.text).toUpperCase();
      if (!c || c.includes("주기장")) return false;
      return /(621|622|623|624|625|626|627|672|673|674)/.test(c);
    })
    .map((r) => ({ y: r.y, text: r.text }));
}

function cleanNameRowsWithY(rows) {
  return rows
    .filter((r) => {
      const c = compactText(r.text);
      if (!c) return false;
      if (c === "-") return true;
      return /[ABC856쓰가-힣]/i.test(c);
    })
    .map((r) => ({ y: r.y, text: r.text }));
}

function stitchVerticalHangulNames(rows) {
  if (!rows.length) return [];

  const sorted = [...rows].sort((a, b) => a.y - b.y);
  const out = [];
  let buf = [];

  const flush = () => {
    if (!buf.length) return;
    const text = buf.map((r) => compactText(r.text)).join("");
    const y = buf.reduce((sum, r) => sum + r.y, 0) / buf.length;
    out.push({ y, text });
    buf = [];
  };

  for (const row of sorted) {
    const c = compactText(row.text);
    const singleHangul = /^[가-힣]$/.test(c);
    if (singleHangul) {
      if (buf.length && Math.abs(buf[buf.length - 1].y - row.y) > 48) flush();
      buf.push(row);
      if (buf.length >= 3) flush();
      continue;
    }
    flush();
    out.push(row);
  }
  flush();

  return out;
}

function pickBetterNameRowsWithY(nameResult) {
  const fromLines = stitchVerticalHangulNames(
    cleanNameRowsWithY(mergeNearRows(linesFromTesseract(nameResult), 10))
  );
  const fromWords = stitchVerticalHangulNames(
    cleanNameRowsWithY(groupWordsIntoRows(nameResult?.data?.words || [], 16))
  );

  const score = (arr) => {
    let s = 0;
    for (const row of arr) {
      const c = compactText(row.text);
      if (/^[ABC856]$/.test(c)) s += 3;
      if (/^[ABC856][가-힣]{2,4}$/.test(c)) s += 8;
      if (/^[가-힣]{2,4}$/.test(c)) s += 6;
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
    .replace(/^8/, "B")
    .replace(/^6/, "C")
    .replace(/^쓰/, "A");

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

  if (s.includes("편명") || s.includes("FLIGHT") || s.includes("FLT")) return "flight";
  if (s.includes("주기장") || s.includes("STAND") || s.includes("SPOT") || s.includes("GATE")) return "stand";
  if (
    s.includes("ROLD") ||
    s.includes("R/OLD") ||
    (s.includes("RO") && s.includes("LD")) ||
    (s.includes("R/O") && s.includes("L/D")) ||
    s.includes("이름") ||
    s.includes("담당")
  ) {
    return "name";
  }

  return "";
}

function scoreHeaderRow(words) {
  let score = 0;
  const joined = words.map((w) => normalizeText(w.text || "")).join(" ");
  const types = new Set();

  for (let i = 0; i < words.length; i++) {
    const t1 = normalizeText(words[i].text || "");
    const one = getHeaderType(t1);
    if (one) {
      types.add(one);
      score += 3;
    }
    if (i < words.length - 1) {
      const joined2 = `${t1} ${normalizeText(words[i + 1].text || "")}`;
      const two = getHeaderType(joined2);
      if (two) {
        types.add(two);
        score += 2;
      }
    }
  }

  if (/편명/.test(joined)) score += 5;
  if (/주기장/.test(joined)) score += 4;
  if (/ETD|ETA|DEP|ARR|등록/.test(normalizeHeaderText(joined))) score += 2;
  if (/외항사|스케줄/.test(joined)) score -= 6;

  return score + types.size * 2;
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
      words: [...row.words].sort((a, b) => (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0)),
      score: 0
    }))
    .map((row) => ({ ...row, score: scoreHeaderRow(row.words) }))
    .sort((a, b) => b.score - a.score || a.y - b.y);

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
  const pad = { flight: 18, stand: 14, name: 20 };

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const prev = cols[i - 1];
    const next = cols[i + 1];
    const p = pad[col.type] || 12;

    let left = Math.max(0, col.x0 - p);
    let right = Math.min(totalWidth, col.x1 + p);

    // 헤더 텍스트 폭이 좁아도 열 폭을 최소 확보
    const minWidth = Math.floor(totalWidth * (col.type === "flight" ? 0.12 : 0.10));
    if (right - left < minWidth) {
      const mid = (left + right) / 2;
      left = Math.max(0, Math.floor(mid - minWidth / 2));
      right = Math.min(totalWidth, Math.floor(mid + minWidth / 2));
    }

    if (prev) left = Math.max(left, Math.floor((prev.x1 + col.x0) / 2));
    if (next) right = Math.min(right, Math.floor((col.x1 + next.x0) / 2));

    if (right <= left + 10) {
      left = Math.max(0, col.x0 - p);
      right = Math.min(totalWidth, col.x1 + p);
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
  return rows.filter((r) => extractStandFromText(r.text)).length >= 3;
}

function hasEnoughNameRows(rows) {
  return rows.filter((r) => {
    const p = parseNameLine(r.text);
    return !!(p.name && KNOWN_NAMES.includes(p.name));
  }).length >= 2;
}

function hasEnoughFlightRows(rows) {
  return rows.filter((r) => extractFlightNoFromText(r.text, true)).length >= 3;
}

function looksLikeTimeColumn(flightResult, flightRowsY) {
  const text = String(flightResult?.data?.text || "");
  const timeHits = (text.match(/\b\d{1,2}:\d{2}\b/g) || []).length;
  const kjHits = (text.match(/\bKJ\s*\d{3,4}\b/gi) || []).length;
  if (timeHits >= 3 && timeHits > kjHits) return true;
  if (!hasEnoughFlightRows(flightRowsY) && timeHits >= 2) return true;
  return false;
}

function rowsFromResultWithY(result, type) {
  const lines = mergeNearRows(linesFromTesseract(result), 10);
  const words = groupWordsIntoRows(result?.data?.words || [], 16);
  const base = lines.length ? lines : words;

  if (type === "flight") return cleanFlightRowsWithY(base);
  if (type === "stand") return cleanStandRowsWithY(base);
  if (type === "name") return pickBetterNameRowsWithY(result);
  return [];
}

function median(values) {
  if (!values.length) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function chooseBestAnchorRows(flightRows, standRows) {
  return flightRows.length >= standRows.length ? flightRows : standRows;
}

function findNearestRow(targetY, candidates, tolerance) {
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const dist = Math.abs(row.y - targetY);
    if (dist > tolerance) continue;
    if (!best || dist < best.dist) {
      best = { idx: i, row, dist };
    }
  }
  return best;
}

function buildSlots(flightRowsY, standRowsY) {
  const anchors = chooseBestAnchorRows(flightRowsY, standRowsY)
    .slice()
    .sort((a, b) => a.y - b.y);

  return anchors.map((anchor) => {
    const flightMatch = findNearestRow(anchor.y, flightRowsY, ROW_MATCH_TOLERANCE);
    const standMatch = findNearestRow(anchor.y, standRowsY, ROW_MATCH_TOLERANCE);

    const flightRaw = flightMatch?.row?.text || "";
    const standRaw = standMatch?.row?.text || "";

    return {
      y: anchor.y,
      flightRaw,
      standRaw,
      flightNo: extractFlightNoFromText(flightRaw, !!removeZeroEl?.checked),
      stand: extractStandFromText(standRaw),
      name: "",
      nameRaw: "",
      raw: [flightRaw, standRaw].filter(Boolean).join(" | ")
    };
  });
}

function buildValidNameCandidates(nameRowsY) {
  return nameRowsY
    .map((row) => {
      const parsed = parseNameLine(row.text);
      let name = KNOWN_NAMES.includes(parsed.name) ? parsed.name : "";

      if (!name) {
        const normalized = normalizeKnownName(row.text);
        if (KNOWN_NAMES.includes(normalized)) {
          name = normalized;
        }
      }

      return {
        y: row.y,
        text: row.text,
        parsed,
        name
      };
    })
    .filter((row) => row.name || /[가-힣]/.test(row.text))
    .sort((a, b) => a.y - b.y);
}

function getRowPitch(slots) {
  if (slots.length < 2) return 0;
  const diffs = [];
  for (let i = 1; i < slots.length; i++) {
    const diff = slots[i].y - slots[i - 1].y;
    if (diff > 4) diffs.push(diff);
  }
  return median(diffs);
}

function getNameSlotTolerance(slots) {
  const pitch = getRowPitch(slots);
  if (!pitch) return NAME_SLOT_MAX_TOLERANCE;
  return Math.max(10, Math.min(NAME_SLOT_MAX_TOLERANCE, Math.floor(pitch * 0.42)));
}

function expectedSlotIndex(nameIndex, nameCount, slotCount) {
  if (slotCount <= 1) return 0;
  if (nameCount <= 1) return Math.floor((slotCount - 1) / 2);
  return ((nameIndex + 1) * (slotCount + 1)) / (nameCount + 1) - 1;
}

function assignNamesToSlotsConservatively(slots, nameCandidates) {
  const n = slots.length;
  const m = nameCandidates.length;

  if (!n || !m) {
    return {
      slots,
      assignmentDebug: []
    };
  }

  const tol = getNameSlotTolerance(slots);

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(INF));
  const choice = Array.from({ length: m + 1 }, () => Array(n + 1).fill(null));

  for (let i = 0; i <= n; i++) {
    dp[0][i] = 0;
    if (i > 0) choice[0][i] = { type: "skip", prevJ: 0, prevI: i - 1 };
  }

  for (let j = 0; j <= m; j++) {
    for (let i = 0; i < n; i++) {
      if (dp[j][i] >= INF) continue;

      if (dp[j][i] < dp[j][i + 1]) {
        dp[j][i + 1] = dp[j][i];
        choice[j][i + 1] = { type: "skip", prevJ: j, prevI: i };
      }

      if (j >= m) continue;

      const nameRow = nameCandidates[j];
      const slot = slots[i];
      const dist = Math.abs(nameRow.y - slot.y);

      if (dist > tol) continue;

      const expected = expectedSlotIndex(j, m, n);
      const ordinalPenalty = Math.abs(i - expected) * NAME_ORDINAL_WEIGHT;
      const cost = dist + ordinalPenalty;

      if (dp[j][i] + cost < dp[j + 1][i + 1]) {
        dp[j + 1][i + 1] = dp[j][i] + cost;
        choice[j + 1][i + 1] = {
          type: "assign",
          prevJ: j,
          prevI: i,
          slotIndex: i,
          nameIndex: j,
          dist,
          expected,
          cost
        };
      }
    }
  }

  let endI = 0;
  let bestCost = INF;
  for (let i = 0; i <= n; i++) {
    if (dp[m][i] < bestCost) {
      bestCost = dp[m][i];
      endI = i;
    }
  }

  const assignedPairs = [];
  let cj = m;
  let ci = endI;

  while (ci >= 0 && cj >= 0) {
    const ch = choice[cj][ci];
    if (!ch) break;
    if (ch.type === "assign") {
      assignedPairs.push({
        slotIndex: ch.slotIndex,
        nameIndex: ch.nameIndex,
        dist: ch.dist,
        expected: ch.expected,
        cost: ch.cost
      });
    }
    const nextJ = ch.prevJ;
    const nextI = ch.prevI;
    cj = nextJ;
    ci = nextI;
    if (cj === 0 && ci === 0) break;
  }

  assignedPairs.reverse();

  const outSlots = slots.map((s) => ({ ...s }));
  const assignmentDebug = [];

  for (const pair of assignedPairs) {
    const slot = outSlots[pair.slotIndex];
    const nameRow = nameCandidates[pair.nameIndex];

    slot.name = nameRow.name;
    slot.nameRaw = nameRow.parsed.raw || nameRow.text || "";
    slot.raw = [slot.flightRaw, slot.standRaw, slot.nameRaw].filter(Boolean).join(" | ");

    assignmentDebug.push({
      slotIndex: pair.slotIndex,
      slotY: slot.y,
      nameIndex: pair.nameIndex,
      nameY: nameRow.y,
      dist: pair.dist,
      expected: pair.expected,
      cost: pair.cost,
      nameRaw: slot.nameRaw,
      finalName: slot.name
    });
  }

  return {
    slots: outSlots,
    assignmentDebug
  };
}

function buildMergedRowsBySlots(flightRowsY, standRowsY, nameRowsY) {
  const slots = buildSlots(flightRowsY, standRowsY);
  const nameCandidates = buildValidNameCandidates(nameRowsY);
  const assigned = assignNamesToSlotsConservatively(slots, nameCandidates);

  const assignedCount = assigned.slots.filter((s) => s.name).length;

  if (assignedCount > 0) {
    return {
      mergedRows: assigned.slots,
      nameAssignmentDebug: assigned.assignmentDebug
    };
  }

  const fallbackSlots = slots.map((s) => ({ ...s }));
  const tol = Math.max(18, getNameSlotTolerance(fallbackSlots) + 6);
  let startIdx = 0;
  const fallbackDebug = [];

  for (let i = 0; i < nameCandidates.length; i++) {
    const cand = nameCandidates[i];
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let j = startIdx; j < fallbackSlots.length; j++) {
      const slot = fallbackSlots[j];
      const dist = Math.abs(slot.y - cand.y);
      if (dist <= tol && dist < bestDist) {
        bestIdx = j;
        bestDist = dist;
      }
    }

    if (bestIdx < 0) continue;

    const normalized = cand.name || normalizeKnownName(cand.text);
    if (!KNOWN_NAMES.includes(normalized)) continue;

    fallbackSlots[bestIdx].name = normalized;
    fallbackSlots[bestIdx].nameRaw = cand.parsed.raw || cand.text || "";
    fallbackSlots[bestIdx].raw = [
      fallbackSlots[bestIdx].flightRaw,
      fallbackSlots[bestIdx].standRaw,
      fallbackSlots[bestIdx].nameRaw
    ].filter(Boolean).join(" | ");

    fallbackDebug.push({
      mode: "fallback",
      slotIndex: bestIdx,
      slotY: fallbackSlots[bestIdx].y,
      nameY: cand.y,
      dist: bestDist,
      nameRaw: fallbackSlots[bestIdx].nameRaw,
      finalName: fallbackSlots[bestIdx].name
    });

    startIdx = bestIdx + 1;
  }

  return {
    mergedRows: fallbackSlots,
    nameAssignmentDebug: fallbackDebug
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [row.flightNo || "", row.stand || "", Math.round(row.y || 0)].join("|");
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

  const flightRowsY = rowsFromResultWithY(flightResult, "flight");
  const standRowsY = rowsFromResultWithY(standResult, "stand");
  const nameRowsY = rowsFromResultWithY(nameResult, "name");

  return {
    flightResult,
    standResult,
    nameResult,
    flightRowsY,
    standRowsY,
    nameRowsY
  };
}

function bandScoreFromText(text, langHint) {
  const t = String(text || "");
  const upper = t.toUpperCase();
  const kj = (upper.match(/\bKJ[\s\-_:|./]*\d{3,4}\b/g) || []).length;
  const stands = (upper.match(/\b(621|622|623|624|625|626|627|672|673|674[LRI18B]?)\b/g) || []).length;
  const times = (upper.match(/\b\d{1,2}:\d{2}\b/g) || []).length;
  const hangul = (t.match(/[가-힣]{2,4}/g) || []).length;
  const known = KNOWN_NAMES.reduce((n, name) => n + (t.includes(name) ? 1 : 0), 0);

  return {
    kj,
    stands,
    times,
    hangul,
    known,
    flightScore: kj * 5 - times * 3,
    standScore: stands * 6 - kj * 2,
    nameScore: known * 8 + hangul * 2 - kj * 2,
    langHint
  };
}

function mergeBandRanges(bands, totalWidth, padRatio = 0.01) {
  if (!bands.length) return null;
  const pad = Math.floor(totalWidth * padRatio);
  const x0 = Math.max(0, Math.min(...bands.map((b) => b.x0)) - pad);
  const x1 = Math.min(totalWidth, Math.max(...bands.map((b) => b.x1)) + pad);
  if (x1 <= x0 + 8) return null;
  return { x0, x1 };
}

async function probeColumnRangesByContent(tableCanvas) {
  const bands = 12;
  const sampleY = Math.floor(tableCanvas.height * 0.14);
  const sampleH = Math.max(80, Math.floor(tableCanvas.height * 0.42));
  const bandW = Math.max(20, Math.floor(tableCanvas.width / bands));
  const scored = [];

  for (let i = 0; i < bands; i++) {
    const x0 = i * bandW;
    const x1 = i === bands - 1 ? tableCanvas.width : (i + 1) * bandW;
    const raw = cropCanvasByPx(tableCanvas, x0, sampleY, Math.max(1, x1 - x0), sampleH);
    const useNameLang = i >= Math.floor(bands * 0.55);
    setStatus(`열 자동탐지 중... (${i + 1}/${bands})`);
    const pre = preprocessColumn(raw, useNameLang ? "name" : "flight");
    const result = await recognizeCanvasDetailed(
      pre,
      useNameLang ? "kor+eng" : "eng",
      useNameLang ? "name" : "flight"
    );
    const score = bandScoreFromText(result?.data?.text || "", useNameLang ? "kor" : "eng");
    scored.push({ i, x0, x1, ...score, text: result?.data?.text || "" });
  }

  const bestFlight = [...scored].sort((a, b) => b.flightScore - a.flightScore)[0];
  const bestStand = [...scored].sort((a, b) => b.standScore - a.standScore)[0];
  const bestName = [...scored].sort((a, b) => b.nameScore - a.nameScore)[0];

  const flightBands = scored.filter((b) => b.flightScore > 0 && b.kj >= 1 && Math.abs(b.i - bestFlight.i) <= 1);
  const standBands = scored.filter((b) => b.standScore > 0 && b.stands >= 1 && Math.abs(b.i - bestStand.i) <= 1);
  const nameBands = scored.filter((b) => b.nameScore > 0 && (b.hangul >= 1 || b.known >= 1) && Math.abs(b.i - bestName.i) <= 1);

  const flight = mergeBandRanges(flightBands.length ? flightBands : bestFlight.flightScore > 0 ? [bestFlight] : [], tableCanvas.width, 0.008);
  const stand = mergeBandRanges(standBands.length ? standBands : bestStand.standScore > 0 ? [bestStand] : [], tableCanvas.width, 0.008);
  const name = mergeBandRanges(nameBands.length ? nameBands : bestName.nameScore > 0 ? [bestName] : [], tableCanvas.width, 0.012);

  const fixed = buildFixedColumnRangeMap(tableCanvas.width);
  const ranges = {
    flight: flight || fixed.flight,
    stand: stand || fixed.stand,
    name: name || fixed.name
  };

  // 편명/주기장이 같으면 고정값으로 보정
  const overlap =
    Math.min(ranges.flight.x1, ranges.stand.x1) - Math.max(ranges.flight.x0, ranges.stand.x0);
  if (overlap > (ranges.flight.x1 - ranges.flight.x0) * 0.5) {
    ranges.flight = fixed.flight;
    ranges.stand = fixed.stand;
  }

  return {
    ranges,
    debug: scored.map((s) => ({
      i: s.i,
      kj: s.kj,
      stands: s.stands,
      times: s.times,
      hangul: s.hangul,
      known: s.known,
      flightScore: s.flightScore,
      standScore: s.standScore,
      nameScore: s.nameScore
    }))
  };
}

function passQuality(pass) {
  const standText = String(pass.standResult?.data?.text || "");
  const standKj = (standText.match(/\bKJ\s*\d{3,4}\b/gi) || []).length;
  return {
    flights: hasEnoughFlightRows(pass.flightRowsY),
    stands: hasEnoughStandRows(pass.standRowsY),
    names: hasEnoughNameRows(pass.nameRowsY),
    timeLike: looksLikeTimeColumn(pass.flightResult, pass.flightRowsY),
    standLooksLikeFlight: standKj >= 2
  };
}

async function extractRowsBySeparatedColumns(file) {
  const img = await fileToImage(file);
  const processed = preprocessFullImage(img);

  const tableCanvas = cropCanvasByRatio(processed, TABLE_RATIO);
  const headerCanvas = cropCanvasByRatio(tableCanvas, HEADER_SCAN_RATIO);

  setStatus("열 위치 자동탐지 중...");
  const probed = await probeColumnRangesByContent(tableCanvas);

  setStatus("헤더 분석 중...");
  const headerForOCR = preprocessColumn(headerCanvas, "header");
  const headerResult = await recognizeCanvasDetailed(headerForOCR, "kor+eng", "header");
  const headerDetected = detectHeadersFromHeaderResult(headerResult, headerCanvas.width);
  const autoColumnRanges = buildColumnRangeMap(headerDetected, tableCanvas.width);
  const fixedColumnRanges = buildFixedColumnRangeMap(tableCanvas.width);

  const candidates = [
    { mode: "probe", ranges: probed.ranges },
    { mode: "auto", ranges: autoColumnRanges },
    { mode: "fixed", ranges: fixedColumnRanges }
  ];

  let usedMode = "probe";
  let usedRanges = probed.ranges;
  let pass = await extractUsingRanges(tableCanvas, headerCanvas, probed.ranges, "probe");
  let quality = passQuality(pass);
  let best = { pass, ranges: probed.ranges, mode: "probe", score: 0 };

  const scorePass = (p, q) => {
    let s = 0;
    if (q.flights) s += 5;
    if (q.stands) s += 5;
    if (q.names) s += 3;
    if (q.timeLike) s -= 6;
    if (q.standLooksLikeFlight) s -= 5;
    s += Math.min(8, p.flightRowsY.length);
    s += Math.min(8, p.standRowsY.filter((r) => extractStandFromText(r.text)).length);
    return s;
  };

  best.score = scorePass(pass, quality);

  for (const cand of candidates.slice(1)) {
    if (best.score >= 12 && quality.flights && quality.stands) break;
    const trial = await extractUsingRanges(tableCanvas, headerCanvas, cand.ranges, cand.mode);
    const q = passQuality(trial);
    const s = scorePass(trial, q);
    if (s > best.score) {
      best = { pass: trial, ranges: cand.ranges, mode: cand.mode, score: s };
      pass = trial;
      quality = q;
      usedMode = cand.mode;
      usedRanges = cand.ranges;
    }
  }

  // stand 칸에 KJ가 보이면 그 범위를 편명으로 승격하고 주기장은 오른쪽으로 이동
  if (quality.standLooksLikeFlight) {
    usedMode = `${best.mode}+swap-stand-to-flight`;
    const w = tableCanvas.width;
    const swapped = {
      flight: { ...usedRanges.stand },
      stand: {
        x0: Math.min(w - 20, usedRanges.stand.x1 + Math.floor(w * 0.02)),
        x1: Math.min(w, usedRanges.stand.x1 + Math.floor(w * 0.14))
      },
      name: usedRanges.name
    };
    usedRanges = swapped;
    pass = await extractUsingRanges(tableCanvas, headerCanvas, swapped, "swap");
    quality = passQuality(pass);
    best = { pass, ranges: swapped, mode: usedMode, score: scorePass(pass, quality) };
  }

  if (looksLikeTimeColumn(pass.flightResult, pass.flightRowsY)) {
    usedMode = `${usedMode}+flight-shift`;
    const shifted = {
      ...usedRanges,
      flight: {
        x0: Math.min(tableCanvas.width - 20, usedRanges.flight.x0 + Math.floor(tableCanvas.width * 0.10)),
        x1: Math.min(tableCanvas.width, usedRanges.flight.x1 + Math.floor(tableCanvas.width * 0.12))
      }
    };
    usedRanges = shifted;
    pass = await extractUsingRanges(tableCanvas, headerCanvas, shifted, "flight-shift");
  }

  const { mergedRows, nameAssignmentDebug } = buildMergedRowsBySlots(
    pass.flightRowsY,
    pass.standRowsY,
    pass.nameRowsY
  );

  const rows = dedupeRows(
    mergedRows
      .filter((row) => row.flightNo || row.stand)
      .filter(isSearchMatched)
  );

  const debugText = [
    "[MODE]",
    usedMode,
    "",
    "[PROBE BAND SCORES]",
    JSON.stringify(probed.debug, null, 2),
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
    "[FLIGHT ROWS Y]",
    JSON.stringify(pass.flightRowsY, null, 2),
    "",
    "[STAND ROWS Y]",
    JSON.stringify(pass.standRowsY, null, 2),
    "",
    "[NAME ROWS Y]",
    JSON.stringify(pass.nameRowsY, null, 2),
    "",
    "[NAME SLOT ASSIGNMENT]",
    JSON.stringify(nameAssignmentDebug, null, 2)
  ].join("\n");

  const lineDebug = mergedRows.map((row, idx) => {
    return [
      `${idx + 1}.`,
      `y=${Math.round(row.y || 0)}`,
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
