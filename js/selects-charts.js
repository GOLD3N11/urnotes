/* urNotes · Liste derulante personalizate, tooltip și grafice.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== LISTE DERULANTE PERSONALIZATE ==================== */
/*
 * Elementul <select> rămâne cel real (valoare, evenimente „change”, aspectul închis),
 * doar lista care se deschide e înlocuită cu una în stilul aplicației.
 * Pe telefon/tabletă (pointer „coarse”) rămâne selectorul sistemului, care e mai comod la atingere.
 */
const customSelect = { open: null, typed: "", typedTimer: 0 };

function initCustomSelects() {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    document.addEventListener("mousedown", event => {
        const select = event.target.closest?.("select");
        if (!select || event.button !== 0 || select.disabled || select.multiple || select.size > 1) return;
        event.preventDefault();
        if (customSelect.open?.select === select) {
            closeCustomSelect();
            return;
        }
        select.focus({ preventScroll: true });
        openCustomSelect(select);
    }, true);

    document.addEventListener("keydown", event => {
        const select = event.target;
        if (!(select instanceof HTMLSelectElement) || select.disabled || customSelect.open) return;
        const opens = [" ", "Enter", "ArrowDown", "ArrowUp", "F4"].includes(event.key);
        if (!opens || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        openCustomSelect(select);
    }, true);

    // O derulare care mută lista închisă o închide (altfel lista ar rămâne „plutind”);
    // controalele lipite sus (sticky) nu se mișcă la derulare, așa că lista lor rămâne deschisă.
    document.addEventListener("scroll", event => {
        const open = customSelect.open;
        if (!open || open.pop.contains(event.target)) return;
        const r = open.select.getBoundingClientRect();
        if (Math.abs(r.top - open.anchorTop) > 2 || Math.abs(r.left - open.anchorLeft) > 2) closeCustomSelect({ restoreFocus: false });
    }, true);
    window.addEventListener("resize", () => closeCustomSelect({ restoreFocus: false }));
    document.addEventListener("mousedown", event => {
        const open = customSelect.open;
        if (open && !open.pop.contains(event.target) && event.target !== open.select) closeCustomSelect({ restoreFocus: false });
    });
}

function customOptionItems() {
    return [...customSelect.open.pop.querySelectorAll(".cs-opt:not(.is-disabled)")];
}

function openCustomSelect(select) {
    closeCustomSelect({ restoreFocus: false });
    const options = [...select.options].filter(o => !o.hidden);
    if (options.length === 0) return;

    const pop = document.createElement("div");
    pop.className = "cs-pop";
    pop.id = "cs-pop";
    pop.tabIndex = -1;
    pop.setAttribute("role", "listbox");
    const label = select.getAttribute("aria-label") || select.labels?.[0]?.textContent || "";
    if (label.trim()) pop.setAttribute("aria-label", label.trim());

    pop.innerHTML = options.map(o => `
        <div class="cs-opt ${o.selected ? "is-selected" : ""} ${o.disabled ? "is-disabled" : ""} ${o.value === "" ? "is-placeholder" : ""}"
            role="option" id="cs-opt-${o.index}" data-index="${o.index}" aria-selected="${o.selected}" ${o.disabled ? 'aria-disabled="true"' : ""}>
            <span class="cs-check" aria-hidden="true"></span>
            <span class="cs-label">${escapeHTML(o.textContent.trim())}</span>
            ${o.dataset.meta ? `<span class="cs-meta">${escapeHTML(o.dataset.meta)}</span>` : ""}
        </div>`).join("");

    document.body.appendChild(pop);
    const anchor = select.getBoundingClientRect();
    customSelect.open = { select, pop, anchorTop: anchor.top, anchorLeft: anchor.left };
    select.setAttribute("aria-expanded", "true");
    select.classList.add("cs-open");
    positionCustomSelect();

    pop.addEventListener("mousedown", event => event.preventDefault()); // focusul rămâne în listă
    pop.addEventListener("click", event => {
        const opt = event.target.closest(".cs-opt");
        if (opt && !opt.classList.contains("is-disabled")) chooseCustomOption(Number(opt.dataset.index));
    });
    pop.addEventListener("mousemove", event => {
        const opt = event.target.closest(".cs-opt:not(.is-disabled)");
        if (opt && !opt.classList.contains("is-active")) setActiveCustomOption(opt, { scroll: false });
    });
    pop.addEventListener("keydown", handleCustomSelectKey);
    pop.addEventListener("focusout", event => {
        if (customSelect.open?.pop === pop && !pop.contains(event.relatedTarget) && event.relatedTarget !== select) {
            closeCustomSelect({ restoreFocus: false });
        }
    });

    const items = customOptionItems();
    setActiveCustomOption(items.find(el => el.classList.contains("is-selected")) || items[0], { center: true });
    pop.focus({ preventScroll: true });
    requestAnimationFrame(() => pop.classList.add("is-open"));
}

function positionCustomSelect() {
    const { select, pop } = customSelect.open;
    const r = select.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    pop.style.minWidth = `${Math.round(r.width)}px`;

    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const natural = Math.min(pop.scrollHeight, 340);
    const openUp = below < natural && above > below;
    pop.style.maxHeight = `${Math.max(120, Math.min(340, openUp ? above : below))}px`;
    pop.classList.toggle("opens-up", openUp);

    const h = pop.offsetHeight;
    const w = pop.offsetWidth;
    pop.style.top = `${Math.round(openUp ? r.top - gap - h : r.bottom + gap)}px`;
    pop.style.left = `${Math.round(Math.max(margin, Math.min(r.left, window.innerWidth - w - margin)))}px`;
}

function setActiveCustomOption(el, { scroll = true, center = false } = {}) {
    const open = customSelect.open;
    if (!open || !el) return;
    open.pop.querySelector(".cs-opt.is-active")?.classList.remove("is-active");
    el.classList.add("is-active");
    open.pop.setAttribute("aria-activedescendant", el.id);
    if (center) el.scrollIntoView({ block: "center" });
    else if (scroll) el.scrollIntoView({ block: "nearest" });
}

function handleCustomSelectKey(event) {
    const open = customSelect.open;
    if (!open) return;
    const items = customOptionItems();
    const i = items.findIndex(el => el.classList.contains("is-active"));
    const go = index => setActiveCustomOption(items[Math.max(0, Math.min(items.length - 1, index))]);

    switch (event.key) {
        case "ArrowDown": go(i + 1); break;
        case "ArrowUp": go(i - 1); break;
        case "Home": go(0); break;
        case "End": go(items.length - 1); break;
        case "PageDown": go(i + 8); break;
        case "PageUp": go(i - 8); break;
        case "Enter":
        case " ":
            if (items[i]) chooseCustomOption(Number(items[i].dataset.index));
            break;
        case "Escape":
        case "Tab":
            closeCustomSelect();
            break;
        default:
            // Tastare rapidă: „ma” sare la „Matematică” (fără diacritice).
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                clearTimeout(customSelect.typedTimer);
                customSelect.typed += foldText(event.key);
                customSelect.typedTimer = setTimeout(() => { customSelect.typed = ""; }, 700);
                const start = customSelect.typed.length === 1 ? i + 1 : i;
                const ordered = [...items.slice(start), ...items.slice(0, start)];
                const hit = ordered.find(el => foldText(el.querySelector(".cs-label").textContent).startsWith(customSelect.typed));
                if (hit) setActiveCustomOption(hit);
                break;
            }
            return; // alte taste: comportament normal
    }
    event.preventDefault();
    event.stopPropagation(); // ex. Escape nu închide și dialogul
}

function chooseCustomOption(index) {
    const { select } = customSelect.open || {};
    if (!select) return;
    closeCustomSelect();
    if (select.selectedIndex === index) return;
    select.selectedIndex = index;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
}

function closeCustomSelect({ restoreFocus = true } = {}) {
    const open = customSelect.open;
    if (!open) return;
    customSelect.open = null;
    open.select.removeAttribute("aria-expanded");
    open.select.classList.remove("cs-open");
    open.pop.remove();
    if (restoreFocus && open.select.isConnected) open.select.focus({ preventScroll: true });
}

/* ==================== TOOLTIP GRAFICE ==================== */
/** Tooltip HTML în stilul aplicației, în locul celui negru, implicit, din Chart.js. */
function chartTooltip({ value = v => String(v), title = t => t } = {}) {
    return ({ chart, tooltip }) => {
        let el = $("chart-tip");
        if (!el) {
            el = document.createElement("div");
            el.id = "chart-tip";
            el.className = "chart-tip";
            el.setAttribute("role", "tooltip");
            document.body.appendChild(el);
        }
        if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
            el.classList.remove("is-visible");
            return;
        }

        const type = chart.config.type;
        el.innerHTML = `
            <b class="chart-tip-title">${escapeHTML(title((tooltip.title || []).join(" ")))}</b>
            ${tooltip.dataPoints.map((dp, i) => {
                const c = tooltip.labelColors?.[i] || {};
                const color = type === "line" ? c.borderColor : c.backgroundColor;
                return `
                    <span class="chart-tip-row">
                        <i style="background:${escapeHTML(String(color || "currentColor"))}"></i>
                        <span>${escapeHTML(dp.dataset.label || "")}</span>
                        <b>${escapeHTML(value(dp.raw, dp))}</b>
                    </span>`;
            }).join("")}`;

        const r = chart.canvas.getBoundingClientRect();
        const x = r.left + tooltip.caretX;
        const y = r.top + tooltip.caretY;
        el.classList.add("is-visible");
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const below = y - h - 14 < 8;
        el.classList.toggle("is-below", below);
        el.style.left = `${Math.round(Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8)))}px`;
        el.style.top = `${Math.round(below ? y + 14 : y - h - 14)}px`;
    };
}

/** Același tooltip pentru elemente simple (ex. punctele din graficul unei materii). */
function bindHoverTips() {
    document.addEventListener("mouseover", event => {
        const el = event.target.closest?.("[data-tip-value], [data-tip-lines]");
        if (!el) return;
        let tip = $("chart-tip");
        if (!tip) {
            chartTooltip()({ chart: null, tooltip: null });
            tip = $("chart-tip");
        }
        const lines = el.dataset.tipLines !== undefined
            ? el.dataset.tipLines.split("\n").map(l => l.split("|"))
            : [["Nota", el.dataset.tipValue]];
        tip.innerHTML = `
            <b class="chart-tip-title">${escapeHTML(el.dataset.tipTitle || "")}</b>
            ${lines.map(([label, value]) => `<span class="chart-tip-row"><span>${escapeHTML(label || "")}</span><b>${escapeHTML(value || "")}</b></span>`).join("")}`;
        tip.classList.add("is-visible");
        const r = el.getBoundingClientRect();
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const below = r.top - h - 10 < 8;
        tip.classList.toggle("is-below", below);
        tip.style.left = `${Math.round(Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)))}px`;
        tip.style.top = `${Math.round(below ? r.bottom + 10 : r.top - h - 10)}px`;
    });
    document.addEventListener("mouseout", event => {
        if (event.target.closest?.("[data-tip-value], [data-tip-lines]")) hideChartTip();
    });
    document.addEventListener("scroll", hideChartTip, true);
}

function hideChartTip() {
    $("chart-tip")?.classList.remove("is-visible");
}

const TIP = {
    avg: { value: v => Number(v).toFixed(2) },
    subjectAvg: { value: v => (Number(v) > 0 ? `${Number(v).toFixed(2)} → ${Math.round(v)}` : "fără note") },
    count: { value: v => plural(Number(v), "notă", "note") },
    distribution: { value: v => plural(Number(v), "notă", "note"), title: t => `Nota ${t}` }
};

let chartDefaultsApplied = false;
function applyChartDefaults() {
    if (chartDefaultsApplied || !chartsAvailable()) return;
    chartDefaultsApplied = true;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
}

/* ==================== GRAFICE ==================== */
function chartsAvailable() {
    return typeof window.Chart === "function";
}

function chartTheme() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim() || ACCENTS.violet.light;
    return {
        accent,
        surface: document.body.classList.contains("dark-mode") ? "#111827" : "#ffffff",
        text: document.body.classList.contains("dark-mode") ? "#94a3b8" : "#64748b",
        grid: document.body.classList.contains("dark-mode") ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.12)"
    };
}

function baseChartOptions(theme, { legend = true, yMax = null, tip = TIP.avg } = {}) {
    const axis = { ticks: { color: theme.text }, grid: { color: theme.grid } };
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        scales: {
            x: axis,
            y: yMax === null ? { ...axis, beginAtZero: true, ticks: { ...axis.ticks, precision: 0 } } : { ...axis, min: 0, max: yMax }
        },
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: legend ? { labels: { color: theme.text, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8 } } : { display: false },
            tooltip: { enabled: false, external: chartTooltip(tip) }
        }
    };
}

function destroyChart(id) {
    const chart = ui.charts[id];
    if (!chart) return;
    try {
        chart.destroy();
    } catch (err) {
        console.warn(`Nu s-a putut distruge graficul ${id}.`, err);
    }
    delete ui.charts[id];
}

function destroyAllCharts() {
    Object.keys(ui.charts).forEach(destroyChart);
}

/** Creează sau actualizează un grafic. Fără Chart.js (offline), afișează un mesaj în loc. */
function upsertChart(id, config) {
    const canvas = $(id);
    if (!canvas) {
        destroyChart(id);
        return;
    }

    const frame = canvas.parentElement;
    if (!chartsAvailable()) {
        frame?.classList.add("chart-unavailable");
        return;
    }
    frame?.classList.remove("chart-unavailable");

    const existing = ui.charts[id];
    if (existing) {
        existing.data = config.data;
        existing.options = config.options;
        existing.update("none");
        return;
    }

    try {
        applyChartDefaults();
        ui.charts[id] = new Chart(canvas, config);
    } catch (err) {
        console.error(`Graficul ${id} nu a putut fi creat.`, err);
    }
}
