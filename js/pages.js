/* urNotes · Paginile ca în Notion: o pictogramă (emoji) pentru fiecare pagină și materie, alegătorul de pictograme,
   proprietățile materiei (ca la o pagină dintr-o bază de date Notion).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const PAGE_EMOJI = {
    "tab-dashboard": "☀️", "tab-calendar": "🗓️", "tab-catalog": "📒", "tab-plan": "⏱️",
    "tab-statistici": "📈", "tab-simulator": "🔮", "tab-examene": "🎓", "tab-setari": "⚙️"
};

const SUBJECT_EMOJI_RULES = [
    [/educație fizică|sport/i, "⚽"], [/matem/i, "📐"], [/fizic/i, "⚛️"], [/chimi/i, "🧪"], [/biolog/i, "🧬"], [/român|literatur/i, "📖"],
    [/englez/i, "💂"], [/francez/i, "🥐"], [/german/i, "🥨"], [/spaniol/i, "💃"], [/italian/i, "🍕"], [/latin/i, "🏺"],
    [/istori/i, "🏛️"], [/geograf/i, "🌍"], [/informatic|^tic$|tehnologia informa/i, "💻"],
    [/religi/i, "🕊️"], [/logic/i, "🧩"], [/filosof/i, "🦉"], [/psiholog/i, "🧠"], [/economi|antreprenor/i, "💰"],
    [/sociolog|socială|social/i, "🤝"], [/desen|arte|plastic|vizual/i, "🎨"], [/muzic/i, "🎵"], [/dirigen|consiliere/i, "🧭"],
    [/tehnolog/i, "⚙️"]
];

const EMOJI_CHOICES = [
    "📐", "➗", "🔢", "📊", "⚛️", "🔭", "🧲", "💡", "🧪", "⚗️", "🧬", "🌱", "🦠", "🐸", "📖", "✍️",
    "📚", "📝", "💬", "🗣️", "💂", "🥐", "🥨", "💃", "🏛️", "🏺", "🌍", "🗺️", "⛰️", "💻", "⌨️", "🤖",
    "⚽", "🏀", "🏃", "🕊️", "⛪", "🧩", "🦉", "🧠", "💰", "📈", "🤝", "🎨", "🎵", "🎭", "🧭", "⚙️",
    "⭐", "🔥", "🎯", "📌", "📒", "🗂️", "🧑‍🏫", "🏆"
];

function subjectEmoji(mat) {
    const own = sanitizeSubjectIcon(state.subjects[mat]?.icon);
    if (own) return own;
    for (const [re, e] of SUBJECT_EMOJI_RULES) if (re.test(mat)) return e;
    return "📄";
}

/** Câmpul „icon” salvat la materie: un singur emoji scurt (sau nimic = cel ales automat). */
function sanitizeSubjectIcon(v) {
    if (typeof v !== "string") return "";
    const s = v.trim();
    return s && s.length <= 12 && !/[<>"'&]/.test(s) ? s : "";
}

/* ---------- pictograma din titlul fiecărei pagini: o iconiță din setul de linii, în culoarea mărcii (fără emoji 3D) ---------- */
function renderPageIcons() {
    for (const [tab, def] of Object.entries(TABS)) {
        if (!def.icon || tab === "tab-dashboard") continue; // pe Azi titlul e salutul
        const h = $(tab)?.querySelector(":scope > .page-intro h2");
        if (!h || h.querySelector(".page-ico")) continue;
        h.insertAdjacentHTML("afterbegin", icon(def.icon, "page-ico"));
    }
}

/* ---------- alegătorul de pictograme ---------- */
function openEmojiPicker(btn) {
    const mat = btn.dataset.mat;
    if (!state.subjects[mat] || !requireAccount()) return;
    closeEmojiPicker();
    const pop = document.createElement("div");
    pop.className = "emoji-pop";
    pop.id = "emoji-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Alege o pictogramă");
    const cur = subjectEmoji(mat);
    pop.innerHTML = `
        <div class="emoji-pop-head"><span>Pictogramă</span>
            <button type="button" class="btn btn-text btn-sm" data-action="emoji-set" data-mat="${escapeHTML(mat)}" data-emoji="">Automată</button></div>
        <div class="emoji-grid">${EMOJI_CHOICES.map(e => `<button type="button" class="emoji-opt ${e === cur ? "is-on" : ""}" data-action="emoji-set" data-mat="${escapeHTML(mat)}" data-emoji="${e}" aria-label="${e}">${e}</button>`).join("")}</div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)))}px`;
    pop.style.top = `${Math.round(r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6)}px`;
    openEmojiPicker.ret = btn;
    pop.querySelector(".emoji-opt.is-on, .emoji-opt")?.focus();
}
function closeEmojiPicker(restore = false) {
    const pop = $("emoji-pop");
    if (!pop) return;
    pop.remove();
    if (restore && openEmojiPicker.ret && document.contains(openEmojiPicker.ret)) openEmojiPicker.ret.focus();
}
function setSubjectIcon(mat, emoji) {
    const sub = state.subjects[mat];
    if (!sub || !requireAccount()) return;
    const v = sanitizeSubjectIcon(emoji);
    if (v) sub.icon = v; else delete sub.icon;
    closeEmojiPicker();
    refresh();
    document.querySelector(".subj-emoji-btn")?.focus({ preventScroll: true });
}

document.addEventListener("click", event => {
    const pop = $("emoji-pop");
    if (pop && !pop.contains(event.target) && !event.target.closest?.('[data-action="emoji-pick"]')) closeEmojiPicker();
}, true);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && $("emoji-pop")) { event.stopPropagation(); closeEmojiPicker(true); }
}, true);

/* ---------- proprietățile materiei (ca într-o bază de date Notion) ---------- */
function subjectPropsHTML(mat, sub, d, { last, minTotal, reached, gap }) {
    const row = (ico, label, value) => `<div class="prop"><span class="prop-k">${icon(ico)}${label}</span><span class="prop-v">${value}</span></div>`;
    const tag = (text, tone) => `<span class="prop-tag ${tone}">${text}</span>`;
    const statusTone = d.statusClass === "badge-danger" ? "t-red" : d.statusClass === "badge-warn" ? "t-yellow" : "t-green";
    return `
        <div class="cat-props" role="list" aria-label="Proprietăți">
            ${row("target", "Stare", tag(escapeHTML(d.status), statusTone))}
            ${row("chart", "Media", sub.grades.length ? `<b>${d.exactAvg.toFixed(2)}</b> <span class="prop-dim">→ ${d.roundedAvg} finală</span>` : `<span class="prop-dim">încă fără note</span>`)}
            ${row("flag", "Ținta", `<b>${fmtTarget(sub.target)}</b> ${sub.grades.length ? (reached ? tag("atinsă", "t-green") : `<span class="prop-dim">lipsesc ${Math.max(0.01, roundValue(gap, 2)).toFixed(2)}</span>`) : ""}`)}
            ${row("note", "Note", `<b>${sub.grades.length}</b> ${d.requiredNotes > 0 ? `<span class="prop-dim">încă ${d.requiredNotes} până la ${minTotal}</span>` : tag("minim atins", "t-green")}`)}
            ${row("pen", "Ultima notă", last ? `<span class="cat-grade-val tone-${gradeTone(Number(last.g.val))}">${escapeHTML(last.g.val)}</span> <span class="prop-dim">${escapeHTML(`${last.g.type || "Altele"}${last.g.date ? ` · ${getShortDateLabel(last.g.date)}` : ""}`)}</span>` : `<span class="prop-dim">Gol</span>`)}
            ${row("clock", "Ore pe săptămână", `${fmtNumber(sub.ore)}`)}
            ${sub.priority ? row("star", "Prioritară", tag("da", "t-purple")) : ""}
        </div>`;
}

Object.assign(ACTIONS, {
    "emoji-pick": el => ($("emoji-pop") ? closeEmojiPicker() : openEmojiPicker(el)),
    "emoji-set": el => setSubjectIcon(el.dataset.mat, el.dataset.emoji),
    "side-add-subject": () => { if (requireAccount()) promptAddMaterie(); }
});
