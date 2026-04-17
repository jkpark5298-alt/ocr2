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

/*
  표 전체 대략 영역
*/
const TABLE_RATIO = { x1: 0.03, y1: 0.02, x2: 0.97, y2: 0.94 };

/*
  헤더 / 본문 스캔
*/
const HEADER_SCAN_RATIO = { x1: 0.00, y1: 0.00, x2: 1.00, y2: 0.10 };
const BODY_SCAN_RATIO = { x1: 0.00, y1: 0.08, x2: 1.00, y2: 0.78 };

/*
  헤더 자동 탐지 실패 시 fallback
  - 현재 사용자가 올린 양식 기준
  - 편명 / 주기장 / R/O L/D
*/
const FIXED_COLUMN_HINTS = {
  flight: { x0r: 0.00, x1r: 0.13 },
  stand:  { x0r: 0.13, x1r: 0.23 },
  name:   { x0r: 0.71, x1r: 0.86 }
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
 
