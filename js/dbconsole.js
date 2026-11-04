/* urNotes · Școala → Bază de date (CEO și Operatorul de date).
   Toate tabelele catalogului, din toate școlile: căutare, filtre, ordine, rândul deschis cu istoria lui, export CSV.
   Ce poate schimba un administrator aici doar se vede; rămân două acțiuni: închiderea unei sesiuni și deblocarea
   unui cont. Exportul și acțiunile cer codul din telefon dacă ultimul e mai vechi de 10 minute (îl cere serverul).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const dbConsoleUI = (() => {
    const D = { tables: null, table: "", q: {}, page: 1, data: null, schools: [], busy: false };
    let X = null; // { api, apiText, esc, run, toast, ROLE_LABEL } din school.js
    const el = id => document.getElementById(id);
    const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    const fmt = (v, kind, key) => {
        const esc = X.esc;
        if (v === null || v === undefined || v === "") return `<span class="muted-small">—</span>`;
        if (kind === "bool") return v ? "da" : `<span class="muted-small">nu</span>`;
        if (kind === "time") { const d = new Date(v); return esc(`${d.toLocaleDateString("ro-RO")} ${d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`); }
        if (kind === "date") { const [y, m, d] = String(v).split("-"); return esc(`${d}.${m}.${y}`); }
        if (kind === "json") { const s = JSON.stringify(v); return `<span class="sch-mono muted-small">${esc(s.length > 80 ? `${s.slice(0, 80)}…` : s)}</span>`; }
        if (key === "role") return esc(X.ROLE_LABEL[v] || v);
        return esc(v);
    };
    const query = (extra = {}) => {
        const q = new URLSearchParams();
        Object.entries({ ...D.q, ...extra }).forEach(([k, v]) => { if (v !== "" && v !== undefined && v !== null && v !== false) q.set(k, String(v)); });
        return q.toString();
    };
    const tdef = () => D.tables.find(t => t.key === D.table);

    /* ---------- codul cerut din nou ---------- */
    function askCode() {
        return new Promise((resolve, reject) => {
            const d = document.createElement("dialog");
            d.className = "sch-dialog";
            d.innerHTML = `<form method="dialog" novalidate><h3>${icon("shield")} Codul din telefon</h3>
                <p class="muted-small">Pentru export și pentru acțiuni îți cerem din nou codul (e valabil 10 minute).</p>
                <div class="form-group"><label for="db-code">Cod</label><input id="db-code" class="glass-input sch-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
                <div id="db-code-err"></div>
                <div class="sch-actions"><button type="button" class="btn btn-glass" id="db-code-x">Renunță</button><button type="submit" class="btn btn-primary">Continuă</button></div></form>`;
            document.body.appendChild(d);
            const close = ok => { d.close?.(); d.remove(); ok ? resolve() : reject(Object.assign(new Error("Ai renunțat."), { quiet: true })); };
            d.querySelector("#db-code-x").addEventListener("click", () => close(false));
            d.addEventListener("cancel", () => close(false));
            d.querySelector("form").addEventListener("submit", e => {
                e.preventDefault();
                X.run(e.submitter, d.querySelector("#db-code-err"), async () => { await X.api("POST", "/v2/auth/step-up", { code: d.querySelector("#db-code").value }); close(true); });
            });
            d.showModal?.() ?? d.setAttribute("open", "");
            d.querySelector("#db-code").focus();
        });
    }
    /** Rulează `fn`; dacă serverul cere codul, îl cere omului și încearcă încă o dată. */
    async function withStepUp(fn) {
        try { return await fn(); }
        catch (e) {
            if (e.code !== "step_up_required") throw e;
            await askCode();
            return fn();
        }
    }

    /* ---------- desenarea ---------- */
    async function render(root, ctx) {
        X = ctx;
        root.innerHTML = `<p class="muted-small">Se încarcă…</p>`;
        try {
            if (!D.tables) {
                D.tables = (await X.api("GET", "/v2/db/tables")).tables;
                D.schools = (await X.api("GET", "/v2/db/schools?sort=name")).rows;
            }
            if (!D.table) D.table = "grades";
            await loadPage();
        } catch (e) { root.innerHTML = `<p class="sch-error">${X.esc(e.message)}</p>`; return; }
        draw(root);
    }

    async function loadPage() {
        D.data = await X.api("GET", `/v2/db/${D.table}?${query({ page: D.page })}`);
    }

    function draw(root) {
        if (!root.isConnected) return;
        const esc = X.esc, t = tdef(), R = D.data;
        const pages = Math.max(1, Math.ceil(R.total / R.pageSize));
        const sortKey = (D.q.sort || "").replace(/^-/, ""), desc = (D.q.sort || "").startsWith("-");
        root.innerHTML = `
            <div class="db-wrap">
                <nav class="glass-card db-side" aria-label="Tabelele">
                    <label class="sr-only" for="db-table-pick">Tabelul</label>
                    <select id="db-table-pick" class="glass-select db-pick">${D.tables.map(x => `<option value="${x.key}" ${x.key === D.table ? "selected" : ""}>${esc(x.label)} (${x.rows})</option>`).join("")}</select>
                    <ul class="db-list">${D.tables.map(x => `<li><button type="button" class="db-tab${x.key === D.table ? " is-on" : ""}" data-db-table="${x.key}" ${x.key === D.table ? 'aria-current="true"' : ""}>
                        <span>${esc(x.label)}</span><small>${x.rows}</small></button></li>`).join("")}</ul>
                </nav>
                <section class="glass-card db-main" aria-labelledby="db-title">
                    <div class="sch-head">
                        <h3 id="db-title">${esc(t.label)} <span class="muted-small">(${R.total})</span></h3>
                        <button type="button" class="btn btn-glass btn-sm" id="db-export">${icon("download")} Export CSV</button>
                    </div>
                    <p class="muted-small">Cine le schimbă: ${esc(t.owner)}.${t.actions.length ? "" : " Aici doar se văd."}</p>
                    <div class="db-filters">
                        <label class="sr-only" for="db-q">Caută</label>
                        <input id="db-q" class="glass-input" type="search" placeholder="Caută…" value="${esc(D.q.q || "")}" maxlength="80">
                        ${t.filters.includes("school") ? `<label class="sr-only" for="db-school">Școala</label><select id="db-school" class="glass-select"><option value="">Toate școlile</option>${D.schools.map(s => `<option value="${esc(s.id)}" ${D.q.school === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
                        ${t.filters.includes("role") ? `<label class="sr-only" for="db-role">Rolul</label><select id="db-role" class="glass-select"><option value="">Toate rolurile</option>${Object.entries(X.ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${D.q.role === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
                        ${t.hasDates ? `<label class="db-date"><span class="muted-small">de la</span><input id="db-from" class="glass-input" type="date" value="${esc(D.q.from || "")}"></label>
                            <label class="db-date"><span class="muted-small">până la</span><input id="db-to" class="glass-input" type="date" value="${esc(D.q.to || "")}"></label>` : ""}
                        ${D.table === "grades" ? `<label class="sch-check"><input type="checkbox" id="db-deleted" ${D.q.deleted ? "checked" : ""}> și cele șterse</label>` : ""}
                    </div>
                    ${R.rows.length ? `<div class="sch-table-wrap"><table class="sch-table db-table"><thead><tr>${t.columns.map(c => `
                        <th aria-sort="${sortKey === c.key ? (desc ? "descending" : "ascending") : "none"}"><button type="button" class="db-sort" data-db-sort="${c.key}">${esc(c.label)}${sortKey === c.key ? (desc ? " ↓" : " ↑") : ""}</button></th>`).join("")}</tr></thead><tbody>
                        ${R.rows.map(r => `<tr class="db-row" data-db-row="${esc(r.id)}" tabindex="0">${t.columns.map(c => `<td data-label="${esc(c.label)}">${fmt(r[c.key], c.kind, c.key)}</td>`).join("")}</tr>`).join("")}
                    </tbody></table></div>` : `<p class="muted-small">Niciun rând${D.q.q || D.q.school || D.q.from || D.q.to ? " pentru filtrul ales" : ""}.</p>`}
                    ${pages > 1 ? `<div class="db-pager"><button type="button" class="btn btn-glass btn-sm" id="db-prev" ${R.page <= 1 ? "disabled" : ""}>‹ Înapoi</button>
                        <span class="muted-small">pagina ${R.page} din ${pages}</span>
                        <button type="button" class="btn btn-glass btn-sm" id="db-next" ${R.page >= pages ? "disabled" : ""}>Înainte ›</button></div>` : ""}
                    <div id="db-err"></div>
                </section>
            </div>`;
        const reload = async () => {
            try { await loadPage(); draw(root); }
            catch (e) { const box = el("db-err"); if (box) box.innerHTML = `<p class="sch-error">${esc(e.message)}</p>`; }
        };
        const pick = key => { D.table = key; D.q = {}; D.page = 1; reload(); };
        root.querySelectorAll("[data-db-table]").forEach(b => b.addEventListener("click", () => pick(b.dataset.dbTable)));
        el("db-table-pick").addEventListener("change", e => pick(e.target.value));
        const setQ = (k, v) => { D.q[k] = v; D.page = 1; reload(); };
        el("db-q").addEventListener("input", debounce(e => { D.q.q = e.target.value; D.page = 1; reload().then(() => { const q = el("db-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 350));
        el("db-school")?.addEventListener("change", e => setQ("school", e.target.value));
        el("db-role")?.addEventListener("change", e => setQ("role", e.target.value));
        el("db-from")?.addEventListener("change", e => setQ("from", e.target.value));
        el("db-to")?.addEventListener("change", e => setQ("to", e.target.value));
        el("db-deleted")?.addEventListener("change", e => setQ("deleted", e.target.checked ? "1" : ""));
        root.querySelectorAll("[data-db-sort]").forEach(b => b.addEventListener("click", () => {
            const k = b.dataset.dbSort;
            D.q.sort = D.q.sort === k ? `-${k}` : k;
            reload();
        }));
        el("db-prev")?.addEventListener("click", () => { D.page--; reload(); });
        el("db-next")?.addEventListener("click", () => { D.page++; reload(); });
        root.querySelectorAll("[data-db-row]").forEach(r => {
            r.addEventListener("click", () => openRow(r.dataset.dbRow, reload));
            r.addEventListener("keydown", e => { if (e.key === "Enter") openRow(r.dataset.dbRow, reload); });
        });
        el("db-export").addEventListener("click", e => X.run(e.currentTarget, el("db-err"), async () => {
            try {
                const csv = await withStepUp(() => X.apiText(`/v2/db/${D.table}/export.csv?${query()}`));
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                a.download = `urnotes-${D.table}-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                X.toast("✓ Exportul e gata. S-a scris în jurnal.");
            } catch (err) { if (!err.quiet) throw err; }
        }));
    }

    /* ---------- un rând ---------- */
    async function openRow(id, reload) {
        const esc = X.esc, t = tdef();
        let R;
        try { R = await X.api("GET", `/v2/db/${D.table}/${encodeURIComponent(id)}`); }
        catch (e) { X.toast(`⚠️ ${e.message}`); return; }
        const row = R.row;
        const lockedNow = D.table === "accounts" && row.locked_until && new Date(row.locked_until) > new Date();
        const canEnd = D.table === "sessions" && !row.ended;
        const d = document.createElement("dialog");
        d.className = "sch-dialog db-sheet";
        d.setAttribute("aria-labelledby", "db-row-title");
        d.innerHTML = `
            <div class="sch-head"><h3 id="db-row-title">${esc(t.label)}</h3><button type="button" class="btn btn-text btn-sm" id="db-row-x">Închide</button></div>
            <dl class="db-fields">${t.columns.map(c => `<dt>${esc(c.label)}</dt><dd>${fmt(row[c.key], c.kind, c.key)}</dd>`).join("")}</dl>
            ${R.extra && Object.keys(R.extra).length ? `<h4>Legat de el</h4><ul class="links-list">
                ${R.extra.grades !== undefined ? `<li><span>Note în catalog: <b>${R.extra.grades}</b></span></li>` : ""}
                ${R.extra.openSessions !== undefined ? `<li><span>Sesiuni deschise: <b>${R.extra.openSessions}</b></span></li>` : ""}
                ${(R.extra.links || []).map(l => `<li><span>${esc(l)}</span></li>`).join("")}</ul>` : ""}
            ${canEnd || lockedNow ? `<form id="db-act" class="db-act" novalidate>
                <h4>${canEnd ? "Închide sesiunea" : "Deblochează contul"}</h4>
                <p class="muted-small">${canEnd ? "Dispozitivul iese din cont (de exemplu un telefon pierdut)." : "Contul poate intra din nou, fără să mai aștepte 15 minute."}</p>
                <div class="form-group"><label for="db-reason">Motivul</label><input id="db-reason" class="glass-input" maxlength="200" required placeholder="${canEnd ? "telefon pierdut" : "a sunat la secretariat"}"></div>
                <div id="db-act-err"></div>
                <button type="submit" class="btn btn-primary">${canEnd ? "Închide sesiunea" : "Deblochează"}</button>
            </form>` : ""}
            <h4>Istoric</h4>
            ${R.history.length ? `<ul class="db-history">${R.history.map(h => `<li><span class="muted-small">${esc(new Date(h.at).toLocaleString("ro-RO"))}</span> <b>${esc(h.actor)}</b> · ${esc(h.action)}${h.reason ? ` · <i>${esc(h.reason)}</i>` : ""}</li>`).join("")}</ul>` : `<p class="muted-small">Nimic în jurnal pentru acest rând.</p>`}
            <p class="muted-small">Deschiderea acestui rând s-a scris în jurnal.</p>`;
        document.body.appendChild(d);
        const close = () => { d.close?.(); d.remove(); };
        d.querySelector("#db-row-x").addEventListener("click", close);
        d.addEventListener("cancel", close);
        d.querySelector("#db-act")?.addEventListener("submit", e => {
            e.preventDefault();
            X.run(e.submitter, d.querySelector("#db-act-err"), async () => {
                const reason = d.querySelector("#db-reason").value.trim();
                if (reason.length < 3) throw new Error("Scrie motivul (cel puțin 3 litere).");
                try {
                    await withStepUp(() => X.api("POST", canEnd ? `/v2/db/sessions/${row.id}/end` : `/v2/db/accounts/${row.id}/clear-lockout`, { reason }));
                } catch (err) { if (err.quiet) return; throw err; }
                close();
                X.toast(canEnd ? "✓ Sesiunea a fost închisă." : "✓ Contul a fost deblocat.");
                D.tables = (await X.api("GET", "/v2/db/tables")).tables; // numărul de rânduri s-a putut schimba
                reload();
            });
        });
        d.showModal?.() ?? d.setAttribute("open", "");
    }

    return { render, reset: () => Object.assign(D, { tables: null, table: "", q: {}, page: 1, data: null }) };
})();
