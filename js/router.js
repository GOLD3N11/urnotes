/* urNotes · Adresele paginilor: fiecare pagină principală are adresa ei
   (…/urnotes/azi, /calendar, /note, /plan, /progres, /scoala, /setari), cu Înapoi și Înainte din browser.
   GitHub Pages servește doar fișiere: o adresă ca …/urnotes/calendar ajunge întâi la 404.html, care trimite
   înapoi la aplicație cu ?route=calendar; aici adresa se pune la loc. Cu lucrătorul offline instalat (sw.js),
   aplicația vine direct, fără ocolul prin 404.html.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const appRoutes = (() => {
    const ROUTES = {
        azi: "tab-dashboard", calendar: "tab-calendar", note: "tab-catalog", plan: "tab-plan",
        progres: "tab-statistici", "ce-ar-fi-daca": "tab-simulator", examene: "tab-examene",
        scoala: "tab-scoala", setari: "tab-setari"
    };
    const SLUG = Object.fromEntries(Object.entries(ROUTES).map(([slug, tab]) => [tab, slug]));
    // rădăcina aplicației (…/urnotes/), din locul acestui fișier: merge și pe GitHub Pages, și local
    const BASE = (() => {
        try { return new URL("..", document.currentScript.src).pathname; } catch (_) { return "/"; }
    })();
    const slugFromPath = () => {
        const p = location.pathname;
        if (!p.startsWith(BASE)) return "";
        return decodeURIComponent(p.slice(BASE.length)).replace(/\/+$/, "").split("/")[0].toLowerCase();
    };
    const query = () => {
        const q = new URLSearchParams(location.search);
        q.delete("route");
        return q.toString() ? `?${q}` : "";
    };

    // venit de la 404.html: …/urnotes/?route=calendar → …/urnotes/calendar
    try {
        const asked = new URLSearchParams(location.search).get("route");
        if (asked !== null) history.replaceState(history.state, "", BASE + (ROUTES[asked] ? asked : "") + query() + location.hash);
    } catch (_) { /* fără History API: rămâne adresa veche */ }

    let applying = false; // schimbarea vine din adresă (Înapoi / Înainte): nu mai scriem încă o intrare în istoric

    function setTitle(tabId) {
        const t = typeof TABS !== "undefined" && TABS[tabId]?.title;
        document.title = t ? `${t} · urNotes` : "urNotes";
    }

    /** După fiecare schimbare de pagină: adresa ei în bara browserului. */
    function afterSwitch() {
        if (typeof ui === "undefined") return;
        const tab = ui.activeTab, slug = SLUG[tab];
        setTitle(tab);
        if (applying || !slug || slugFromPath() === slug) return;
        try { history.pushState({ tab }, "", BASE + slug + query()); } catch (_) { /* adresa rămâne */ }
    }

    /** Pagina cerută de adresă (la pornire și la Înapoi / Înainte). */
    function applyPath() {
        if (typeof switchTab !== "function" || typeof ui === "undefined") return;
        const slug = slugFromPath();
        const tab = ROUTES[slug] || (slug ? null : "tab-dashboard");
        if (!tab) { try { history.replaceState(history.state, "", BASE + query()); } catch (_) {} return; } // adresă necunoscută → începutul
        applying = true;
        try { if (ui.activeTab !== tab) switchTab(tab); } finally { applying = false; }
        setTitle(tab);
    }

    // switchTab rămâne funcția aplicației; doar o înfășurăm ca adresa să o urmeze
    if (typeof switchTab === "function") {
        const original = switchTab;
        switchTab = function routedSwitchTab(...args) {
            const out = original.apply(this, args);
            afterSwitch();
            return out;
        };
    }
    window.addEventListener("popstate", applyPath);
    window.addEventListener("load", () => { if (slugFromPath()) applyPath(); else setTitle(typeof ui !== "undefined" ? ui.activeTab : ""); });

    return { BASE, ROUTES, slugFromPath, urlFor: tab => (SLUG[tab] ? BASE + SLUG[tab] : BASE) };
})();
