/* urNotes · Mișcare cu rost: o bifă care „sare” când termini ceva și puțină confetti doar pentru un 10.
   Totul e scurt (sub o secundă), nu se repetă și dispare complet cu „reducere mișcare” din sistem.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";


/** Confetti mică, din culorile mărcii și ale materiilor; o singură dată, apoi se curăță singură. */
function celebrate() {
    if (reduceMotion() || typeof document === "undefined" || !document.body) return;
    document.querySelector(".confetti")?.remove();
    const box = document.createElement("div");
    box.className = "confetti";
    box.setAttribute("aria-hidden", "true");
    const colors = ["var(--yellow, #FFC93C)", "var(--navy, #1E2B58)", "var(--c-tomato)", "var(--c-sky)", "var(--c-mint)", "var(--c-grape)"];
    let html = "";
    for (let i = 0; i < 36; i++) {
        const x = 50 + (Math.random() - 0.5) * 70;            // de unde pornește (vw)
        const dx = (Math.random() - 0.5) * 40;                 // cât se duce în lateral (vw)
        const delay = Math.random() * 120;
        const rot = Math.round(Math.random() * 720 - 360);
        const w = 6 + Math.round(Math.random() * 5);
        html += `<i style="left:${x}vw;--dx:${dx}vw;--rot:${rot}deg;width:${w}px;height:${Math.round(w * 1.6)}px;background:${colors[i % colors.length]};animation-delay:${delay}ms"></i>`;
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1500);
}

/** După orice notă nouă: un 10 merită confetti. */
function celebrateGrade(val) {
    if (Number(val) === 10) celebrate();
}

/* Bifa care sare: unde ai atins, un cerc galben care se lărgește o dată (pagina se redesenează, așa că îl punem deasupra). */
const TICK_ACTIONS = new Set(["event-done", "plan-toggle"]);
function tickPop(x, y) {
    if (reduceMotion()) return;
    const dot = document.createElement("span");
    dot.className = "tick-pop";
    dot.setAttribute("aria-hidden", "true");
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.innerHTML = icon("check");
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 650);
}
document.addEventListener("click", event => {
    const el = event.target.closest?.("[data-action]");
    if (!el || !TICK_ACTIONS.has(el.dataset.action)) return;
    // doar când bifezi (nu și când scoți bifa)
    if (el.type === "checkbox" && !el.checked) return;
    const r = el.getBoundingClientRect();
    const x = event.clientX || r.left + r.width / 2, y = event.clientY || r.top + r.height / 2;
    requestAnimationFrame(() => tickPop(x, y));
}, true);
