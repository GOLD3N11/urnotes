/* urNotes · Pagina fiecărei materii: notițele tale, ca în Notion (blocuri de text, titluri, liste, de bifat).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* Un bloc: { id, t, text, done? }
     t = "p" (text) · "h" (titlu) · "li" (listă) · "todo" (de bifat) · "q" (citat) · "hr" (linie despărțitoare)
   Scurtături la începutul unui bloc: „# ” → titlu, „- ” sau „* ” → listă, „[] ” sau „[ ] ” → de bifat,
   „" ” sau „> ” → citat, „---” → linie. */
const NB_TYPES = ["p", "h", "li", "todo", "q", "hr"];
const NB_MAX_BLOCKS = 400;
const NB_MAX_TEXT = 2000;
const NB_SHORTCUTS = [[/^#\s/, "h"], [/^[-*]\s/, "li"], [/^\[\s?\]\s/, "todo"], [/^\[x\]\s/i, "todo-done"], [/^["„“>]\s/, "q"]];

function sanitizeNotes(raw) {
    return (Array.isArray(raw) ? raw : []).filter(isPlainObject).slice(0, NB_MAX_BLOCKS).map(b => ({
        id: typeof b.id === "string" && b.id ? b.id.slice(0, 40) : uid(),
        t: NB_TYPES.includes(b.t) ? b.t : "p",
        text: typeof b.text === "string" ? b.text.slice(0, NB_MAX_TEXT) : "",
        ...(b.t === "todo" ? { done: b.done === true } : {})
    }));
}

const nbBlocks = mat => state.subjects[mat] ? (state.subjects[mat].notes ||= []) : null;
const nbFind = (mat, id) => nbBlocks(mat)?.findIndex(b => b.id === id) ?? -1;

const NB_PLACEHOLDER = { p: "Scrie ceva…", h: "Titlu", li: "Listă", todo: "De făcut", q: "Citat", hr: "" };

function nbBlockHTML(b, editable) {
    const tools = editable ? `<span class="nb-tools"><button type="button" class="nb-plus" data-action="nb-add" data-id="${escapeHTML(b.id)}" aria-label="Bloc nou dedesubt" title="Bloc nou dedesubt" tabindex="-1">${icon("plus")}</button><span class="nb-grip" draggable="true" title="Trage ca să muți" aria-hidden="true">${icon("grip")}</span></span>` : "";
    if (b.t === "hr") return `<div class="nb nb-hr" data-id="${escapeHTML(b.id)}">${tools}<hr tabindex="${editable ? 0 : -1}" aria-label="Linie despărțitoare"></div>`;
    return `
        <div class="nb nb-${b.t} ${b.done ? "is-done" : ""}" data-id="${escapeHTML(b.id)}">${tools}
            ${b.t === "todo" ? `<button type="button" class="nb-check" data-action="nb-toggle" data-id="${escapeHTML(b.id)}" role="checkbox" aria-checked="${Boolean(b.done)}" aria-label="Bifează" ${editable ? "" : "disabled"}>${icon("check")}</button>` : ""}
            ${b.t === "li" ? `<span class="nb-bullet" aria-hidden="true">•</span>` : ""}
            <div class="nb-text" ${editable ? 'contenteditable="true"' : ""} role="textbox" aria-multiline="false" spellcheck="true"
                aria-label="${escapeHTML(NB_PLACEHOLDER[b.t])}" data-placeholder="${escapeHTML(NB_PLACEHOLDER[b.t])}">${escapeHTML(b.text)}</div>
        </div>`;
}

/** Secțiunea de notițe din pagina materiei. */
function notesEditorHTML(mat) {
    const blocks = nbBlocks(mat) || [];
    const editable = canEdit();
    const shown = blocks.length ? blocks : [{ id: "nb-new", t: "p", text: "" }];
    return `
        <section class="cat-block nb-section" aria-labelledby="nb-title">
            <h4 id="nb-title">${icon("pen")} Notițele mele</h4>
            <div class="nb-editor" data-mat="${escapeHTML(mat)}">
                ${shown.map(b => nbBlockHTML(b, editable)).join("")}
            </div>
            ${editable ? `<p class="nb-hint">Enter = bloc nou · „# ” titlu · „- ” listă · „[] ” de bifat · „> ” citat · „---” linie</p>` : ""}
        </section>`;
}

/* ---------- caret ---------- */
function nbCaret(el) {
    const sel = window.getSelection?.();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return el.textContent.length;
    const r = sel.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    return r.toString().length;
}
function nbFocus(id, at = "end") {
    const el = document.querySelector(`.nb[data-id="${CSS.escape(id)}"] .nb-text`);
    if (!el) return;
    el.focus({ preventScroll: false });
    const sel = window.getSelection?.();
    if (!sel) return;
    const text = el.firstChild;
    const pos = at === "start" ? 0 : at === "end" ? el.textContent.length : Math.min(at, el.textContent.length);
    const range = document.createRange();
    if (text && text.nodeType === 3) range.setStart(text, pos); else range.setStart(el, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

/* ---------- modificări (salvăm fără să redesenăm pagina, ca să nu pierzi cursorul) ---------- */
function nbSave() {
    clearTimeout(nbSave.t);
    nbSave.t = setTimeout(() => saveState(), 350);
}

function nbRerender(mat, focusId, at) {
    const ed = document.querySelector(`.nb-editor[data-mat="${CSS.escape(mat)}"]`);
    if (!ed) return;
    const blocks = nbBlocks(mat);
    ed.innerHTML = (blocks.length ? blocks : [{ id: "nb-new", t: "p", text: "" }]).map(b => nbBlockHTML(b, canEdit())).join("");
    if (focusId) nbFocus(focusId, at);
}

/** Blocul scris pentru prima dată în pagina goală devine unul adevărat. */
function nbEnsure(mat, id) {
    const blocks = nbBlocks(mat);
    if (id !== "nb-new" || blocks.length) return id;
    const b = { id: uid(), t: "p", text: "" };
    blocks.push(b);
    document.querySelector('.nb[data-id="nb-new"]')?.setAttribute("data-id", b.id);
    return b.id;
}

function nbInput(el) {
    const block = el.closest(".nb"), ed = el.closest(".nb-editor");
    if (!block || !ed || !canEdit()) return;
    const mat = ed.dataset.mat;
    const id = nbEnsure(mat, block.dataset.id);
    const i = nbFind(mat, id);
    if (i < 0) return;
    const b = nbBlocks(mat)[i];
    let text = el.textContent.replace(/\n/g, " ").slice(0, NB_MAX_TEXT);
    // „---” pe un bloc gol devine linie despărțitoare, cu un bloc nou dedesubt
    if (text === "---" && b.t === "p") {
        b.t = "hr"; b.text = "";
        const nb = { id: uid(), t: "p", text: "" };
        nbBlocks(mat).splice(i + 1, 0, nb);
        nbSave();
        nbRerender(mat, nb.id, "start");
        return;
    }
    // scurtăturile de la început
    for (const [re, t] of NB_SHORTCUTS) {
        if (re.test(text) && (b.t === "p" || (t.startsWith("todo") && b.t !== "todo"))) {
            text = text.replace(re, "");
            b.t = t.startsWith("todo") ? "todo" : t;
            if (b.t === "todo") b.done = t === "todo-done"; else delete b.done;
            b.text = text;
            nbSave();
            nbRerender(mat, id, "start");
            return;
        }
    }
    b.text = text;
    nbSave();
}

function nbKeydown(event) {
    const el = event.target.closest?.(".nb-text");
    if (!el || !canEdit()) return;
    const block = el.closest(".nb"), mat = el.closest(".nb-editor").dataset.mat;
    const id = nbEnsure(mat, block.dataset.id);
    const blocks = nbBlocks(mat);
    const i = nbFind(mat, id);
    if (i < 0) return;
    const b = blocks[i];
    const pos = nbCaret(el);

    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        // pe o listă goală, Enter iese din listă (ca în Notion)
        if ((b.t === "li" || b.t === "todo") && !b.text) { b.t = "p"; delete b.done; nbSave(); nbRerender(mat, id, "start"); return; }
        if (blocks.length >= NB_MAX_BLOCKS) return;
        const rest = b.text.slice(pos);
        b.text = b.text.slice(0, pos);
        const nb = { id: uid(), t: b.t === "h" || b.t === "q" ? "p" : b.t, text: rest };
        if (nb.t === "todo") nb.done = false;
        blocks.splice(i + 1, 0, nb);
        nbSave();
        nbRerender(mat, nb.id, "start");
        return;
    }
    if (event.key === "Backspace" && pos === 0 && !window.getSelection?.()?.toString()) {
        if (b.t !== "p") { event.preventDefault(); b.t = "p"; delete b.done; nbSave(); nbRerender(mat, id, "start"); return; }
        if (i > 0 && blocks[i - 1].t === "hr") {
            event.preventDefault();
            blocks.splice(i - 1, 1);
            nbSave();
            nbRerender(mat, id, "start");
            return;
        }
        if (i > 0) {
            event.preventDefault();
            const prev = blocks[i - 1];
            const join = prev.text.length;
            prev.text = (prev.text + b.text).slice(0, NB_MAX_TEXT);
            blocks.splice(i, 1);
            nbSave();
            nbRerender(mat, prev.id, join);
        }
        return;
    }
    const near = (dir) => { for (let j = i + dir; j >= 0 && j < blocks.length; j += dir) if (blocks[j].t !== "hr") return blocks[j]; return null; };
    if (event.key === "ArrowUp" && pos === 0 && near(-1)) { event.preventDefault(); nbFocus(near(-1).id, "end"); return; }
    if (event.key === "ArrowDown" && pos === el.textContent.length && near(1)) { event.preventDefault(); nbFocus(near(1).id, "start"); }
}

function nbToggle(id) {
    const ed = document.querySelector(`.nb[data-id="${CSS.escape(id)}"]`)?.closest(".nb-editor");
    if (!ed || !requireAccount()) return;
    const mat = ed.dataset.mat;
    const b = nbBlocks(mat)?.[nbFind(mat, id)];
    if (!b) return;
    b.done = !b.done;
    saveState();
    nbRerender(mat);
}

/** „+” din stânga unui bloc: un bloc gol dedesubt. */
function nbAdd(id) {
    const ed = document.querySelector(`.nb[data-id="${CSS.escape(id)}"]`)?.closest(".nb-editor");
    if (!ed || !requireAccount()) return;
    const mat = ed.dataset.mat;
    const realId = nbEnsure(mat, id);
    const blocks = nbBlocks(mat), i = nbFind(mat, realId);
    if (i < 0 || blocks.length >= NB_MAX_BLOCKS) return;
    const nb = { id: uid(), t: "p", text: "" };
    blocks.splice(i + 1, 0, nb);
    nbSave();
    nbRerender(mat, nb.id, "start");
}

/** Mută un bloc înainte de alt bloc (sau la sfârșit, dacă beforeId lipsește). */
function nbMove(mat, id, beforeId) {
    const blocks = nbBlocks(mat), from = nbFind(mat, id);
    if (from < 0 || id === beforeId) return;
    const [b] = blocks.splice(from, 1);
    const to = beforeId ? nbFind(mat, beforeId) : blocks.length;
    blocks.splice(to < 0 ? blocks.length : to, 0, b);
    nbSave();
    nbRerender(mat);
}

// o linie despărțitoare selectată se șterge cu Backspace / Delete
document.addEventListener("keydown", event => {
    const hr = event.target.closest?.(".nb-hr hr");
    if (!hr || !["Backspace", "Delete"].includes(event.key) || !canEdit()) return;
    event.preventDefault();
    const ed = hr.closest(".nb-editor"), mat = ed.dataset.mat, id = hr.closest(".nb").dataset.id;
    const blocks = nbBlocks(mat), i = nbFind(mat, id);
    if (i < 0) return;
    blocks.splice(i, 1);
    nbSave();
    const next = blocks[Math.min(i, blocks.length - 1)];
    nbRerender(mat, next && next.t !== "hr" ? next.id : null, "start");
});

// trage blocurile de mânerul ⋮⋮ ca să le schimbi ordinea
let nbDrag = null;
document.addEventListener("dragstart", event => {
    const grip = event.target.closest?.(".nb-grip");
    if (!grip) return;
    const block = grip.closest(".nb"), ed = grip.closest(".nb-editor");
    if (!canEdit() || block.dataset.id === "nb-new") { event.preventDefault(); return; }
    nbDrag = { mat: ed.dataset.mat, id: block.dataset.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/urn-block", block.dataset.id);
    try { event.dataTransfer.setDragImage(block, 12, 12); } catch (_) { /* unele browsere nu pot */ }
    block.classList.add("is-dragging");
});
const nbDropTarget = event => {
    const ed = event.target.closest?.(".nb-editor");
    if (!ed || !nbDrag || ed.dataset.mat !== nbDrag.mat) return null;
    const blocks = [...ed.querySelectorAll(".nb")];
    const before = blocks.find(b => { const r = b.getBoundingClientRect(); return event.clientY < r.top + r.height / 2; });
    return { ed, before };
};
document.addEventListener("dragover", event => {
    const t = nbDropTarget(event);
    if (!t) return;
    event.preventDefault();
    t.ed.querySelectorAll(".nb.drop-before, .nb.drop-after").forEach(b => b.classList.remove("drop-before", "drop-after"));
    if (t.before) t.before.classList.add("drop-before"); else t.ed.querySelector(".nb:last-child")?.classList.add("drop-after");
});
document.addEventListener("drop", event => {
    const t = nbDropTarget(event);
    if (!t) return;
    event.preventDefault();
    nbMove(nbDrag.mat, nbDrag.id, t.before?.dataset.id);
});
document.addEventListener("dragend", () => {
    nbDrag = null;
    document.querySelectorAll(".nb.is-dragging, .nb.drop-before, .nb.drop-after").forEach(b => b.classList.remove("is-dragging", "drop-before", "drop-after"));
});

document.addEventListener("input", event => { if (event.target.closest?.(".nb-text")) nbInput(event.target.closest(".nb-text")); });
document.addEventListener("keydown", nbKeydown);
// lipește doar text simplu (fără formatare adusă din alte pagini)
document.addEventListener("paste", event => {
    const el = event.target.closest?.(".nb-text");
    if (!el) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\s*\n\s*/g, " ");
    document.execCommand?.("insertText", false, text);
});

Object.assign(ACTIONS, { "nb-toggle": el => nbToggle(el.dataset.id), "nb-add": el => nbAdd(el.dataset.id) });
