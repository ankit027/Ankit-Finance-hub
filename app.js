// ============================================================
// ANKIT FINANCE HUB
// APP.JS
// ============================================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbwYIXL6HtbCW6QiSediymQGV_zySDfcd0f-f61zJ2ihqeIFJ4h1C_Ge6T_zlaVWw3-M/exec";

let DB = {};

// ============================================================
// BASIC HELPERS
// ============================================================

const $ = id => document.getElementById(id);

const val = id => {
  const el = $(id);
  return el ? el.value : "";
};

const num = v => Number(v || 0);

const today = () => new Date().toISOString().slice(0, 10);

const unique = arr =>
  [...new Set(
    (arr || [])
      .filter(v => v !== "" && v !== null && v !== undefined)
      .map(String)
  )];

const money = value =>
  "₹" +
  num(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0
  });

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// ============================================================
// TOAST
// ============================================================

function toast(message) {
  const t = $("toast");

  if (!t) {
    alert(message);
    return;
  }

  t.textContent = message;
  t.classList.add("show");

  setTimeout(() => {
    t.classList.remove("show");
  }, 2600);
}

// ============================================================
// STATUS
// ============================================================

function setStatus(status) {
  const el = $("syncStatus");
  if (el) el.textContent = status;
}

function apiReady() {
  return API_URL && !API_URL.includes("PASTE_YOUR");
}

// ============================================================
// API
// ============================================================

async function api(action, payload = {}) {

  if (!apiReady()) {
    throw new Error(
      "Paste your Google Apps Script Web App URL in app.js"
    );
  }

  const response = await fetch(API_URL, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.error || "Cloud request failed"
    );
  }

  return result;
}

// ============================================================
// LOAD ALL DATA
// ============================================================
