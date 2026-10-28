/* urNotes · Căutarea (Ctrl+K sau „/”): o casetă pentru materii, pagini, teste și teme, și comenzile de adăugat.
   Scrii câteva litere (fără diacritice e la fel), săgețile aleg, Enter deschide.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const pal = { items: [], index: 0, returnFocus: null };

/** Tot ce se poate căuta, în ordinea în care apare când caseta e goală. */
function paletteSources() {
    const out = [];
    const add = (kind, label, hint, ic, run, extra = "") => out.push({ kind, label, hint, ic, run, key: foldText(`${label} ${hint} ${extra}`) });
    add("cmd", "Adaugă o notă", "N", "check-circle", () => ccOpenGlobal({ type: "Notă" }), "nota noua");
    add("cmd", "Adaugă un test", "T", "note", () => ccOpenGlobal({ type: "Test" }), "test lucrare evaluare");
    add("cmd", "Adaugă o temă", "H", "book", () => ccOpenGlobal({ type: "Temă" }), "tema");
    add("cmd", "Materie nouă", "", "plus", () => promptAddMaterie(), "materie");
    const pages = [["tab-dashboard", "Azi", "home"], ["tab-calendar", "Calendar", "calendar"], ["tab-catalog", "Note", "notebook"], ["tab-plan", "Planul meu", "timer"],
        ["tab-statistici", "Progresul tău", "chart"], ["tab-simulator", "Ce-ar fi dacă", "target"], ["tab-examene", "Examene", "graduation"], ["tab-setari", "Setări", "settings"]];
    pages.forEach(([tab, label, ic]) => add("page", label, "pagină", ic, () => switchTab(tab), tab));
    Object.keys(state.subjects).sort((a, b) => a.localeCompare(b, "ro")).forEach(mat => {
        const d = metrics.subjects[mat];
        const hint = state.subjects[mat].grades.length ? `media ${d.exactAvg.toFixed(2)}${d.statusClass === "badge-danger" ? " · risc" : ""}` : "fără note";
        add("subject", mat, hint, "notebook", () => openSubjectInCatalog(mat), shortSubjectName(mat));
    });
    const today = getLocalDateKey();
    occurrencesBetween(addDays(today, -14), addDays(today, 60)).forEach(({ ev, date }) => {
        add("event", ev.title, `${ev.type} · ${relativeDayLabel(date)}`, EVENT_TYPE_ICON[ev.type] || "pin", () => calGoto(date), `${ev.subject} ${shortDayLabel(date)}`);
    });
    return out;
}

const PAL_ORDER = ["cmd", "page", "subject", "event"];
const PAL_GROUP = { cmd: "Adaugă", page: "Pagini", subject: "Materii", event: "Teste și teme" };

function renderPalette() {
    const q = foldText($("palette-input").value.trim());
    const all = paletteSources();
    const words = q.split(/\s+/).filter(Boolean);
    pal.items = (words.length ? all.filter(it => words.every(w => it.key.includes(w))) : all.filter(it => it.kind !== "event").slice(0, 16))
        // pe grupuri (comenzi, pagini, materii, teste); în fiecare grup, potrivirile de la începutul numelui întâi
        .map((it, i) => ({ it, i, rank: PAL_ORDER.indexOf(it.kind) * 2 + (words.length && !foldText(it.label).startsWith(words[0]) ? 1 : 0) }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i).map(x => x.it)
        .slice(0, 30);
    pal.index = Math.min(pal.index, Math.max(0, pal.items.length - 1));
    let group = "";
    $("palette-list").innerHTML = pal.items.length ? pal.items.map((it, i) => {
        const head = it.kind !== group ? `<li class="palette-group" role="presentation">${PAL_GROUP[it.kind]}</li>` : "";
        group = it.kind;
        return `${head}<li id="pal-${i}" class="palette-item ${i === pal.index ? "is-on" : ""}" role="option" aria-selected="${i === pal.index}" data-i="${i}">
            ${icon(it.ic)}<span class="palette-label">${escapeHTML(it.label)}</span>${it.hint ? `<small>${escapeHTML(it.hint)}</small>` : ""}</li>`;
    }).join("") : `<li class="palette-empty">Nimic pentru „${escapeHTML($("palette-input").value.trim())}”.</li>`;
    $("palette-input").setAttribute("aria-activedescendant", pal.items.length ? `pal-${pal.index}` : "");
    $("palette-list").querySelector(".is-on")?.scrollIntoView({ block: "nearest" });
}

function openPalette() {
    const box = $("palette");
    if (!box || !box.hidden) return;
    pal.returnFocus = document.activeElement;
    pal.index = 0;
    $("palette-input").value = "";
    box.hidden = false;
    document.body.classList.add("palette-open");
    renderPalette();
    $("palette-input").focus();
}

function closePalette({ restore = true } = {}) {
    const box = $("palette");
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.classList.remove("palette-open");
    if (restore && pal.returnFocus && document.contains(pal.returnFocus)) pal.returnFocus.focus();
}

function runPalette(i = pal.index) {
    const it = pal.items[i];
    if (!it) return;
    closePalette({ restore: false });
    it.run();
}

Object.assign(ACTIONS, {
    "palette-open": () => openPalette(),
    "palette-close": () => closePalette()
});
GUEST_OK.add("palette-open");
GUEST_OK.add("palette-close");

document.addEventListener("input", event => {
    if (event.target.id === "palette-input") { pal.index = 0; renderPalette(); }
});
document.addEventListener("keydown", event => {
    if ($("palette")?.hidden !== false) return;
    const k = event.key;
    if (k === "Escape") { event.preventDefault(); event.stopPropagation(); closePalette(); return; }
    if (k === "ArrowDown" || k === "ArrowUp") {
        event.preventDefault();
        if (!pal.items.length) return;
        pal.index = (pal.index + (k === "ArrowDown" ? 1 : -1) + pal.items.length) % pal.items.length;
        renderPalette();
        return;
    }
    if (k === "Enter") { event.preventDefault(); runPalette(); return; }
    if (k === "Tab") event.preventDefault();
}, true);
document.addEventListener("click", event => {
    const li = event.target.closest?.(".palette-item");
    if (li) runPalette(Number(li.dataset.i));
});
