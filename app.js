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
let selectedColumns = ["flightNo", "stand"];

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

const KNOWN_NAMES = ["이영식", "박종규", "김우석", "윤기선", "최용준"];

const CROP = {
  table:  { x1: 0.035, y1: 0.035, x2: 0.982, y2: 0.992 },
  flight: { x1: 0.000, y1: 0.045, x2: 0.130, y2: 0.995 },
  name:   { x1: 0.610, y1: 0.045, x2: 0.755, y2: 0.995 },
  stand:  { x1: 0.900, y1: 0.045, x2: 0.985, y2: 0.995 }
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function showPreview(file) {
  if (!file || !preview) return;
  currentFile = file;
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.style.display = "block";
  if (previewWrap) previewWrap.classList.remove("empty");
  if (previewPlaceholder) previewPlaceholder.style.display = "none";
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
  return checked.length ? checked : ["flightNo", "stand"];
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

function normalizeStand(v) {
  if (!v) return "";

  let s = String(v).toUpperCase().replace(/\s+/g, "").trim();

  const map = {
    "6741": "674L",
    "674I": "674L",
    "674|": "674L",
    "6748": "674R",
    "674B": "674R"
  };

  s = map[s] || s;
  return VALID_STANDS.includes(s) ? s : "";
}

function extractStandFromText(text) {
  if (!text) return "";
  const m = String(text).toUpperCase().match(/\b(621|622|623|624|625|626|627|672|673|674[LRI18B|])\b/);
  return m ? normalizeStand(m[1]) : "";
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

  let m = upper.match(/\bKJ[\s\-_:|.,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = upper.match(/\bK[JIOQL1|][\s\-_:|.,]*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  m = upper.match(/\bK\s*J\s*\d{3,4}\b/);
  if (m) return normalizeFlightNo(m[0], removeLeadingZero);

  return "";
}

function normalizeKnownName(v) {
  if (!v) return "";

  let s = compactText(v);

  s = s
    .replace(/^[ABC]\s*/i, "")
    .replace(/^[ㄱㄴㄷ]\s*/i, "")
    .replace(/^0\s*/, "")
    .replace(/^O\s*/, "");

  const nameMap = {
    "박종구": "박종규",
    "박종큐": "박종규",
    "박종7": "박종규",
    "박종9": "박종규",
    "이영삭": "이영식",
    "이영직": "이영식",
    "김우서": "김우석",
    "윤기션": "윤기선",
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
      if (gray > 210) v = 255;
      else if (gray < 160) v = 0;
      else v = 90;
    } else if (type === "name") {
      if (gray > 215) v = 255;
      else if (gray < 135) v = 0;
      else v = 150;
    } else if (type === "stand") {
      if (gray > 205) v = 255;
      else if (gray < 150) v = 0;
      else v = 70;
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

async function recognizeCanvasDetailed(canvas, lang, type) {
  const options = {
    logger: () => {}
  };

  if (type === "flight") {
    options.tessedit_pageseg_mode = 6;
    options.tessedit_char_whitelist = "KJ0123456789";
  } else if (type === "stand") {
    options.tessedit_pageseg_mode = 6;
    options.tessedit_char_whitelist = "0123456789LR";
  } else if (type === "name") {
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
    found.avgY =
      found.words.reduce((sum, w) => sum + (w.bbox?.y0 ?? 0), 0) / found.words.length;
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
  return rows
    .map((r) => r.text)
    .filter((text) => {
      const c = compactText(text).toUpperCase();
      if (!c || c.includes("편명")) return false;
      return /K/.test(c) && /\d/.test(c);
    });
}

function cleanStandRows(rows) {
  return rows
    .map((r) => r.text)
    .filter((text) => {
      const c = compactText(text).toUpperCase();
      if (!c || c.includes("주기장")) return false;
      return /\d/.test(c);
    });
}

function cleanNameRows(rows) {
  return rows
    .map((r) => r.text)
    .filter((text) => {
      const c = compactText(text);
      if (!c) return false;
      if (/RO|LD|R\/O|L\/D/i.test(c)) return false;
      return /[A-Z가-힣\-]/i.test(c);
    });
}

function pickBetterNameRows(nameResult) {
  const fromLines = cleanNameRows(mergeNearRows(linesFromTesseract(nameResult), 10));
  const fromWords = cleanNameRows(groupWordsIntoRows(nameResult?.data?.words || [], 16));

  const score = (arr) => {
    let s = 0;
    for (const line of arr) {
      const c = compactText(line);
      if (/^[ABC]$/.test(c)) s += 3;
      if (/^[ABC][가-힣]{2,4}$/.test(c)) s += 8;
      if (KNOWN_NAMES.some((name) => c.includes(name))) s += 10;
      if (/[가-힣]/.test(c)) s += 2;
      if (/[@#$%^&*_=+]/.test(c)) s -= 3;
    }
    return s;
  };

  return score(fromLines) >= score(fromWords) ? fromLines : fromWords;
}

function parseNameLine(rawLine) {
  const line = normalizeText(rawLine);
  const compact = compactText(line);

  if (!line) {
    return { label: "", name: "", raw: "" };
  }

  const full = compact.match(/^([ABC])([가-힣]{2,4})$/i);
  if (full) {
    return {
      label: full[1].toUpperCase(),
      name: normalizeKnownName(full[2]),
      raw: line
    };
  }

  const loose = compact.match(/^([ABC])(.+)$/i);
  if (loose) {
    const maybeName = normalizeKnownName(loose[2]);
    return {
      label: loose[1].toUpperCase(),
      name: maybeName,
      raw: line
    };
  }

  const labelOnly = compact.match(/^([ABC])$/i);
  if (labelOnly) {
    return {
      label: labelOnly[1].toUpperCase(),
      name: "",
      raw: line
    };
  }

  if (compact === "-" || compact === "—" || compact === "_") {
    return { label: "-", name: "", raw: line };
  }

  return {
    label: "",
    name: normalizeKnownName(compact),
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
    if (row.name && KNOWN_NAMES.includes(row.name)) return row;
    if (row.label && nameMap[row.label]) {
      return {
        ...row,
        name: nameMap[row.label]
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
    const nameObj = nameRows[i] || { label: "", name: "", raw: "" };
    const standRaw = standRows[i] || "";

    out.push({
      flightNo: extractFlightNoFromText(flightRaw, removeLeadingZero),
      stand: extractStandFromText(standRaw),
      name: normalizeKnownName(nameObj.name || ""),
      nameRaw: nameObj.raw || "",
      flightRaw,
      standRaw,
      raw: [flightRaw, nameObj.raw, standRaw].filter(Boolean).join(" | ")
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
  return compactText(row.name).includes(compactText(q)) ||
         compactText(row.nameRaw).includes(compactText(keyword));
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
  return rows
    .map((row, idx) => {
      const flightFull = row.flightNo || "";
      const flightShort = stripFlightPrefix(flightFull);
      const stand = row.stand || "";
      return `${idx + 1}. ${flightFull} / ${flightShort} / ${stand}`;
    })
    .join("\n");
}

function downloadCSV(rows, columns) {
  if (!rows.length) {
    alert("다운로드할 결과가 없습니다.");
    return;
  }

  const header = columns
    .map((c) => `"${(COLUMN_LABELS[c] || c).replace(/"/g, '""')}"`)
    .join(",");

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

async function extractRowsBySeparatedColumns(file) {
  const img = await fileToImage(file);
  const processed = preprocessFullImage(img);

  const tableCanvas = cropCanvasByRatio(processed, CROP.table);

  const flightCanvasRaw = cropCanvasByRatio(tableCanvas, CROP.flight);
  const nameCanvasRaw = cropCanvasByRatio(tableCanvas, CROP.name);
  const standCanvasRaw = cropCanvasByRatio(tableCanvas, CROP.stand);

  const flightCanvas = preprocessColumn(flightCanvasRaw, "flight");
  const nameCanvas = preprocessColumn(nameCanvasRaw, "name");
  const standCanvas = preprocessColumn(standCanvasRaw, "stand");

  setStatus("편명 열 OCR 중...");
  const flightResult = await recognizeCanvasDetailed(flightCanvas, "eng", "flight");

  setStatus("이름 열 OCR 중...");
  const nameResult = await recognizeCanvasDetailed(nameCanvas, "kor+eng", "name");

  setStatus("주기장 열 OCR 중...");
  const standResult = await recognizeCanvasDetailed(standCanvas, "eng", "stand");

  const flightRowsRaw = mergeNearRows(linesFromTesseract(flightResult), 10);
  const standRowsRaw = mergeNearRows(linesFromTesseract(standResult), 10);

  const flightRows = cleanFlightRows(
    flightRowsRaw.length ? flightRowsRaw : groupWordsIntoRows(flightResult?.data?.words || [], 16)
  );

  const nameRowsText = pickBetterNameRows(nameResult);

  const standRows = cleanStandRows(
    standRowsRaw.length ? standRowsRaw : groupWordsIntoRows(standResult?.data?.words || [], 16)
  );

  const parsedNameRows = nameRowsText.map(parseNameLine);
  const nameMap = buildNameMap(parsedNameRows);
  const resolvedNameRows = resolveNameRows(parsedNameRows, nameMap);

  const mergedRows = mergeRows(flightRows, resolvedNameRows, standRows);
  const rows = dedupeRows(
    mergedRows.filter((row) => row.flightNo && row.stand).filter(isSearchMatched)
  );

  const debugText = [
    "[편명 열 TEXT]",
    flightResult?.data?.text || "",
    "",
    "[이름 열 TEXT]",
    nameResult?.data?.text || "",
    "",
    "[주기장 열 TEXT]",
    standResult?.data?.text || "",
    "",
    "[이름 코드 매핑]",
    JSON.stringify(nameMap, null, 2)
  ].join("\n");

  const lineDebug = mergedRows
    .map((row, idx) => {
      return [
        `${idx + 1}.`,
        `flightRaw=${row.flightRaw || "-"}`,
        `nameRaw=${row.nameRaw || "-"}`,
        `standRaw=${row.standRaw || "-"}`,
        `=> flight=${row.flightNo || "-"}`,
        `name=${row.name || "-"}`,
        `stand=${row.stand || "-"}`
      ].join(" | ");
    })
    .join("\n\n");

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
