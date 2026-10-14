/* urNotes · Utilitare: date, numere, texte.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== UTILITARE ==================== */
/** Iconiță din setul din index.html (linie simplă, în culoarea textului). */
function icon(name, cls = "") {
    return `<svg class="ico${cls ? ` ${cls}` : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function $(id) {
    return document.getElementById(id);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, incoming) {
    const output = clone(base);
    if (!isPlainObject(incoming)) return output;

    for (const [key, value] of Object.entries(incoming)) {
        if (key === "__proto__") continue; // date importate: nu lăsăm un fișier să modifice prototipul
        output[key] = isPlainObject(value) && isPlainObject(output[key])
            ? deepMerge(output[key], value)
            : value;
    }
    return output;
}

function safeParseJSON(raw, fallback) {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.warn("Date locale invalide; se folosește valoarea implicită.", err);
        return fallback;
    }
}

function clampNumber(value, min, max, fallback) {
    const parsed = parseFloat(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clampInteger(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/** Întoarce un întreg în [min, max] sau null dacă valoarea nu e validă (fără „corectare” tăcută). */
function parseStrictInteger(value, min, max) {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= min && n <= max ? n : null;
}

function roundValue(value, decimals = 2) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    // toPrecision taie zgomotul de virgulă mobilă: 8.495 * 100 = 849.4999… trebuie să devină 8.50, ca pe hârtie
    return Math.round(Number((value * factor).toPrecision(12))) / factor;
}

function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
    const [y, m, d] = String(dateKey).split("-").map(Number);
    return new Date(y, m - 1, d);
}

function getDateLabel(dateKey) {
    return parseDateKey(dateKey).toLocaleDateString("ro-RO");
}

function getShortDateLabel(dateKey) {
    return parseDateKey(dateKey).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit" });
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>'"]/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[ch]));
}

function uid() {
    return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}
