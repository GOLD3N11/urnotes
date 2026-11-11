/* urNotes · Părinți și profesori (faza 6 din planul de arhitectură).
   Un cont de părinte sau profesor nu are caiet propriu: vede caietul elevilor legați de el, oricând, dar nu poate schimba
   nimic (serverul refuză oricum scrierile; aici aplicația intră într-un mod „doar citire”, înrudit cu modul vizitator).
   Profesorul are în plus clasele: un cod pentru elevi și testele puse o dată pentru toată clasa, care apar singure
   în calendarul fiecărui elev. Elevul intră într-o clasă din panoul contului.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const VIEWER_PICK_KEY = "urn_viewer_pick_v1";
const VIEWER_POLL = 30_000;
const CLASS_EVENT_TYPES = ["Test", "Examen", "Temă", "Proiect", "Prezentare"];
const viewer = { user: null, students: [], current: "", records: new Map(), cursor: 0, poll: 0, loading: false };
const classesUI = { list: [], open: null, members: [], events: [] };

/* ==================== MODUL „DOAR CITIRE” ==================== */
async function enterViewer(user) {
    viewer.user = user;
    if (!guest.viewer) {
        Object.assign(guest, { on: true, demo: false, viewer: true });
        document.body.classList.add("is-guest", "is-viewer");
    }
    setSyncStatus("synced");
    await viewerReload();
    clearInterval(viewer.poll);
    viewer.poll = setInterval(() => { if (document.visibilityState === "visible") viewerRefresh(); }, VIEWER_POLL);
}

/** La ieșirea din cont: caietul elevului dispare, revine ce era pe acest dispozitiv. */
function leaveViewer() {
    if (!guest.viewer) return;
    clearInterval(viewer.poll);
    Object.assign(guest, { on: false, demo: false, base: null, fp: "", viewer: false });
    Object.assign(viewer, { user: null, students: [], current: "", records: new Map(), cursor: 0 });
    document.body.classList.remove("is-guest", "is-viewer", "viewer-empty");
    loadState();
    refresh();
    renderGuestBar();
    if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
}

/** Lista elevilor legați; rămânem la cel ales data trecută (dacă e încă legat). */
async function viewerReload() {
    if (!guest.viewer) return;
    try {
        const { data } = await api.request("GET", "/v1/me/links");
        viewer.students = data.links.map(l => ({ id: l.studentId, name: l.name || l.email, relation: l.relation }));
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
    }
    let saved = "";
    try { saved = localStorage.getItem(VIEWER_PICK_KEY) || ""; } catch (_) { /* fără stocare */ }
    const pick = viewer.students.find(s => s.id === viewer.current) || viewer.students.find(s => s.id === saved) || viewer.students[0];
    await viewerShow(pick?.id || "");
}

async function viewerShow(id) {
    if (id !== viewer.current || !id) {
        Object.assign(viewer, { current: id, records: new Map(), cursor: 0 });
        try { if (id) localStorage.setItem(VIEWER_PICK_KEY, id); } catch (_) { /* fără stocare */ }
        if (!id) viewerApply();
    }
    if (id) await viewerRefresh(true);
    renderGuestBar();
}

/** Ce s-a schimbat în caietul elevului de la ultima citire. */
async function viewerRefresh(force = false) {
    if (!guest.viewer || !viewer.current || viewer.loading) return;
    viewer.loading = true;
    const id = viewer.current;
    try {
        const { records, cursor } = await srvPull(id, viewer.cursor);
        if (viewer.current !== id) return;
        records.forEach(r => {
            const key = srvKey(r.collection, r.id);
            if (r.deleted) viewer.records.delete(key); else viewer.records.set(key, r.data);
        });
        viewer.cursor = cursor;
        if (records.length || force) viewerApply();
    } catch (err) {
        if (err.status === 403) { showToast("⚠️ Nu mai ai acces la datele acestui elev."); viewerReload(); }
        else if (force) showToast(`⚠️ ${err.message}`);
    } finally {
        viewer.loading = false;
    }
}

/** Arată caietul elevului (doar în memorie: nimic nu se salvează pe acest dispozitiv). */
function viewerApply() {
    guest.restoring = true;
    try {
        applyLoadedData(recordsToLoaded(viewer.records));
        ui.catalog = { ...ui.catalog, selected: "", showDetail: false };
        guest.base = guestSnapshot();
        guest.fp = guestFingerprint();
    } finally {
        guest.restoring = false;
    }
    applyAppearanceSettings();
    refresh();
    guest.fp = guestFingerprint(); // după ce aplicația și-a calculat singură ce-i trebuie (planul, istoricul)
    guest.base = guestSnapshot();
    if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
}

function viewerBarHTML() {
    document.body.classList.toggle("viewer-empty", guest.viewer && !viewer.current);
    const who = viewer.students.find(s => s.id === viewer.current);
    const role = viewer.user?.role === "teacher" ? "profesor" : "părinte";
    const chips = viewer.students.length > 1 ? `<span class="viewer-chips">${viewer.students.map(s => `
        <button type="button" class="chip${s.id === viewer.current ? " is-on" : ""}" data-action="viewer-pick" data-id="${escapeHTML(s.id)}" aria-pressed="${s.id === viewer.current}">${escapeHTML(s.name)}</button>`).join("")}</span>` : "";
    return `
        <span class="guest-bar-text">${icon("eye")}<span>${who
            ? `<b>Caietul lui ${escapeHTML(who.name)}.</b> Cont de ${role}: vezi tot, dar doar elevul își schimbă notele.`
            : `<b>Încă nu urmărești niciun elev.</b> Cere-i elevului un cod (din contul lui → Părinți și profesori)${viewer.user?.role === "teacher" ? " sau fă o clasă" : ""}.`}</span></span>
        ${chips}
        <span class="viewer-actions">
            <button type="button" class="btn btn-glass btn-sm" data-action="viewer-code">${icon("plus")} Am un cod</button>
            ${viewer.user?.role === "teacher" ? `<button type="button" class="btn btn-primary btn-sm" data-action="classes-open">${icon("user")} Clasele mele</button>` : ""}
        </span>`;
}

function openViewerCode() {
    openModal({
        title: "Codul de la elev",
        guestOk: true,
        confirmText: "Leagă",
        body: `<p class="modal-hint">Elevul îl face în contul lui → Părinți și profesori. Are 8 caractere și merge o singură dată.</p>
            <div class="form-group"><label for="viewer-code-input">Cod</label><input id="viewer-code-input" class="glass-input" autocomplete="off" autocapitalize="characters" maxlength="20" placeholder="ABCD-1234"></div>`,
        onConfirm: async () => {
            const code = field("viewer-code-input").trim();
            if (!code) return;
            try {
                const { data } = await api.request("POST", "/v1/links", { code });
                closeActionModal();
                showToast("✓ Gata: vezi acum și caietul acestui elev.");
                await viewerReload();
                if (data?.studentId) await viewerShow(data.studentId);
            } catch (err) {
                showToast(`⚠️ ${err.message}`);
            }
        }
    });
}

/* ==================== CLASELE (profesor) ==================== */
async function openClasses(classId = "") {
    try {
        const { data } = await api.request("GET", "/v1/classes");
        classesUI.list = data.classes;
        classesUI.open = classId ? classesUI.list.find(c => c.id === classId) || null : null;
        if (classesUI.open) {
            const [m, e] = await Promise.all([
                api.request("GET", `/v1/classes/${classesUI.open.id}/members`),
                api.request("GET", `/v1/classes/${classesUI.open.id}/events`)
            ]);
            classesUI.members = m.data.members;
            classesUI.events = e.data.events;
        }
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
        return;
    }
    openModal({ layout: "panel", guestOk: true, title: classesUI.open ? classesUI.open.name : "Clasele mele", confirmText: "", cancelText: "Închide", body: classesUI.open ? classDetailHTML() : classListHTML() });
}

const fmtCode = code => `${code.slice(0, 3)}-${code.slice(3)}`;

function classListHTML() {
    return `
        <p class="modal-hint">O clasă are un cod. Elevii intră cu el (din contul lui → Clasele mele), iar testele puse aici apar în calendarul fiecăruia. Le vezi și notele, fără să le poți schimba.</p>
        ${classesUI.list.length ? `<ul class="links-list">${classesUI.list.map(c => `
            <li><span><b>${escapeHTML(c.name)}</b><small>${c.subject ? `${escapeHTML(c.subject)} · ` : ""}${c.members} ${c.members === 1 ? "elev" : "elevi"} · cod ${escapeHTML(fmtCode(c.code))}</small></span>
                <button type="button" class="btn btn-glass btn-sm" data-action="class-open" data-id="${escapeHTML(c.id)}">Deschide</button></li>`).join("")}</ul>`
            : `<p class="muted-small">Încă nu ai nicio clasă.</p>`}
        <h3 class="account-sub mt-3">${icon("plus")} Clasă nouă</h3>
        <div class="form-row">
            <div class="form-group"><label for="class-name">Nume</label><input id="class-name" class="glass-input" maxlength="60" placeholder="a X-a B"></div>
            <div class="form-group"><label for="class-subject">Materia ta</label><input id="class-subject" class="glass-input" maxlength="60" placeholder="Matematică"></div>
        </div>
        <div class="account-actions"><button type="button" class="btn btn-primary btn-sm" data-action="class-create">Fă clasa</button></div>`;
}

function classDetailHTML() {
    const c = classesUI.open;
    const today = getLocalDateKey();
    const upcoming = classesUI.events.filter(e => e.date >= today);
    const past = classesUI.events.length - upcoming.length;
    return `
        <button type="button" class="btn btn-text btn-sm" data-action="class-back">← Toate clasele</button>
        <p class="link-code"><b>${escapeHTML(fmtCode(c.code))}</b><small>Codul clasei: elevii îl scriu în contul lor → Clasele mele.</small></p>
        <h3 class="account-sub">${icon("calendar")} Teste și teme pentru clasă</h3>
        ${upcoming.length ? `<ul class="links-list">${upcoming.map(e => `
            <li><span><b>${escapeHTML(e.title)}</b><small>${escapeHTML(e.type)} · ${escapeHTML(getShortDateLabel(e.date))}${e.time ? ` · ${escapeHTML(e.time)}` : ""}${e.subject ? ` · ${escapeHTML(e.subject)}` : ""}</small></span>
                <button type="button" class="btn btn-text btn-sm text-danger" data-action="class-event-del" data-id="${escapeHTML(e.id)}">Șterge</button></li>`).join("")}</ul>`
            : `<p class="muted-small">Niciun test pus încă.</p>`}
        ${past ? `<p class="muted-small">${past} ${past === 1 ? "eveniment trecut" : "evenimente trecute"}.</p>` : ""}
        <div class="form-row">
            <div class="form-group"><label for="cev-title">Titlu</label><input id="cev-title" class="glass-input" maxlength="100" placeholder="Test – capitolul 2"></div>
            <div class="form-group"><label for="cev-type">Tip</label><select id="cev-type" class="glass-select">${CLASS_EVENT_TYPES.map(t => `<option>${t}</option>`).join("")}</select></div>
            <div class="form-group"><label for="cev-date">Ziua</label><input id="cev-date" type="date" class="glass-input" min="${today}" value="${addDays(today, 7)}"></div>
            <div class="form-group"><label for="cev-time">Ora (opțional)</label><input id="cev-time" type="time" class="glass-input"></div>
            <div class="form-group"><label for="cev-subject">Materia</label><input id="cev-subject" class="glass-input" maxlength="60" value="${escapeHTML(c.subject || "")}"></div>
            <div class="form-group"><label for="cev-desc">Detalii (opțional)</label><input id="cev-desc" class="glass-input" maxlength="500"></div>
        </div>
        <div class="account-actions"><button type="button" class="btn btn-primary btn-sm" data-action="class-event-add">${icon("plus")} Pune în calendarul clasei</button></div>
        <h3 class="account-sub mt-3">${icon("user")} Elevii (${classesUI.members.length})</h3>
        ${classesUI.members.length ? `<ul class="links-list">${classesUI.members.map(m => `
            <li><span><b>${escapeHTML(m.name || m.email)}</b><small>${escapeHTML(m.email)}</small></span>
                <span class="links-btns">
                    <button type="button" class="btn btn-glass btn-sm" data-action="viewer-pick" data-id="${escapeHTML(m.id)}">Vezi caietul</button>
                    <button type="button" class="btn btn-text btn-sm text-danger" data-action="class-member-del" data-id="${escapeHTML(m.id)}">Scoate</button>
                </span></li>`).join("")}</ul>`
            : `<p class="muted-small">Încă n-a intrat nimeni. Dă-le elevilor codul de mai sus.</p>`}`;
}

/* ==================== CLASELE (elev) ==================== */
async function renderStudentClasses() {
    const box = $("account-classes");
    if (!box) return;
    let list = [];
    try { list = (await api.request("GET", "/v1/classes")).data.classes; } catch (_) { box.innerHTML = ""; return; }
    box.innerHTML = `
        <h3 class="account-sub mt-3">🏫 Clasele mele</h3>
        <p class="subtitle">Testele puse de profesor pentru toată clasa apar singure în calendarul tău. Profesorul clasei îți vede notele (nu le poate schimba).</p>
        ${list.length ? `<ul class="links-list">${list.map(c => `
            <li><span><b>${escapeHTML(c.name)}</b><small>${[c.subject, c.teacher].filter(Boolean).map(escapeHTML).join(" · ")}</small></span>
                <button type="button" class="btn btn-text btn-sm text-danger" data-action="class-leave" data-id="${escapeHTML(c.id)}">Ieși</button></li>`).join("")}</ul>` : ""}
        <div class="account-actions">
            <input id="class-join-code" class="glass-input" maxlength="12" autocomplete="off" placeholder="Codul clasei (ABC-123)" aria-label="Codul clasei">
            <button type="button" class="btn btn-glass btn-sm" data-action="class-join">Intră în clasă</button>
        </div>`;
}

/* ==================== ACȚIUNI ==================== */
const VIEWER_ACTIONS = {
    "viewer-pick": async el => {
        if (!guest.viewer) return;
        if (!$("action-modal").hidden) closeActionModal();
        if (!viewer.students.some(s => s.id === el.dataset.id)) await viewerReload(); // tocmai a intrat în clasă
        await viewerShow(el.dataset.id);
    },
    "viewer-code": () => openViewerCode(),
    "classes-open": () => openClasses(),
    "class-open": el => openClasses(el.dataset.id),
    "class-back": () => openClasses(),
    "class-create": async () => {
        const name = field("class-name").trim();
        if (!name) { showToast("Scrie numele clasei."); return; }
        try {
            const { data } = await api.request("POST", "/v1/classes", { name, subject: field("class-subject").trim() });
            showToast(`✓ Clasa e gata. Codul: ${fmtCode(data.code)}`);
            openClasses(data.id);
        } catch (err) { showToast(`⚠️ ${err.message}`); }
    },
    "class-event-add": async () => {
        const c = classesUI.open;
        const body = { title: field("cev-title").trim(), type: field("cev-type"), date: field("cev-date"), time: field("cev-time"), subject: field("cev-subject").trim(), description: field("cev-desc").trim() };
        if (!c || !body.title || !DATE_KEY_RE.test(body.date)) { showToast("Scrie titlul și alege ziua."); return; }
        try {
            await api.request("POST", `/v1/classes/${c.id}/events`, body);
            showToast(`✓ Apare în calendarul celor ${c.members} ${c.members === 1 ? "elev" : "elevi"}.`);
            openClasses(c.id);
        } catch (err) { showToast(`⚠️ ${err.message}`); }
    },
    "class-event-del": async el => {
        const c = classesUI.open;
        try {
            await api.request("DELETE", `/v1/classes/${c.id}/events/${encodeURIComponent(el.dataset.id)}`);
            showToast("✓ L-am scos și din calendarele elevilor.");
            openClasses(c.id);
        } catch (err) { showToast(`⚠️ ${err.message}`); }
    },
    "class-member-del": async el => {
        const c = classesUI.open;
        try {
            await api.request("DELETE", `/v1/classes/${c.id}/members/${encodeURIComponent(el.dataset.id)}`);
            openClasses(c.id);
        } catch (err) { showToast(`⚠️ ${err.message}`); }
    },
    "class-join": async () => {
        const code = field("class-join-code").trim();
        if (!code) return;
        try {
            const { data } = await api.request("POST", "/v1/classes/join", { code });
            showToast(`✓ Ai intrat în ${data.name}.`);
            renderLinksBox();
            if (srv.on) srvSync(); // testele clasei ajung în calendar
        } catch (err) { showToast(`⚠️ ${err.message}`); }
    },
    "class-leave": async el => {
        try {
            const me = await api.ensureStudent();
            await api.request("DELETE", `/v1/classes/${encodeURIComponent(el.dataset.id)}/members/${me.id}`);
            showToast("✓ Ai ieșit din clasă.");
            renderLinksBox();
            if (srv.on) srvSync();
        } catch (err) { showToast(`⚠️ ${err.message}`); }
    }
};
Object.assign(ACTIONS, VIEWER_ACTIONS);
// părintele și profesorul nu pot schimba caietul, dar pot folosi tot ce ține de contul lor
["viewer-pick", "viewer-code", "classes-open", "class-open", "class-back", "class-create", "class-event-add", "class-event-del", "class-member-del",
    "role-pick", "sync-pick", "sync-now", "link-remove", "account-signout", "account-delete", "win-mode"].forEach(a => GUEST_OK.add(a));
