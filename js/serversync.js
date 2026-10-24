/* urNotes · Sincronizarea cu serverul urNotes, înregistrare cu înregistrare (faza 4 din planul de arhitectură).
   Pornește doar când api-config.js are adresa serverului; altfel rămâne sincronizarea veche prin Firebase (account.js).

   Cum lucrează:
   - caietul e împărțit în înregistrări: fiecare materie, fiecare notă, fiecare eveniment și câte un „doc” pentru restul
     (setări, orar, purtare, plan…). Vezi backend/src/modules/records/collections.ts.
   - ținem minte ce știm că e pe server (`base`: o amprentă pe înregistrare) și până unde am citit (`cursor`).
   - la fiecare sincronizare: aducem ce s-a schimbat pe server de la cursor încoace, le punem peste caiet (o modificare
     făcută aici și netrimisă încă are prioritate), apoi trimitem ce diferă de `base`. Două dispozitive care schimbă
     lucruri diferite (o notă aici, un test acolo) nu se mai calcă pe picioare, ca la copia întreagă din Firebase.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

const SRV_KEY = "urn_srv_sync_v1";
const SRV_BACKUP_KEY = "urn_pre_server_backup";
const SRV_DOCS = ["settings", "timetable", "purtare", "plan", "exams", "pal", "archive", "achievements", "history", "alertMeta", "activity", "simulator"];
const SRV_POLL = 20_000;
const SRV_CHUNK = 500;
const SRV_PAGE = 2000;
const srv = { on: false, student: "", cursor: 0, base: {}, timer: 0, poll: 0, busy: false, again: false, starting: null };

/* ---------- înregistrările ---------- */
/** JSON cu cheile în ordine (serverul le reordonează), ca aceeași înregistrare să aibă aceeași amprentă peste tot. */
function canonicalJSON(v) {
    if (Array.isArray(v)) return `[${v.map(x => canonicalJSON(x === undefined ? null : x)).join(",")}]`;
    if (v && typeof v === "object") {
        return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalJSON(v[k])}`).join(",")}}`;
    }
    return JSON.stringify(v === undefined ? null : v);
}
/** Amprenta unei înregistrări (cyrb53: scurtă, ca `base` să încapă ușor în localStorage). */
function srvHash(data) {
    const text = canonicalJSON(data);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const srvKey = (collection, id) => `${collection}/${id}`;
const srvSplit = key => { const i = key.indexOf("/"); return [key.slice(0, i), key.slice(i + 1)]; };
const srvIdOk = id => typeof id === "string" && id.length > 0 && id.length <= 120;

/** Caietul de acum, ca înregistrări: Map „colecție/id” → date. */
function stateRecords(data = buildBackup().data) {
    ensureGradeIds(data.subjects);
    const out = new Map();
    Object.entries(data.subjects || {}).forEach(([name, sub], pos) => {
        if (!srvIdOk(name)) return;
        const { grades, ...rest } = sub;
        out.set(srvKey("subject", name), { ...rest, pos });
        (grades || []).forEach((g, n) => {
            const { id, ...grade } = g;
            if (srvIdOk(id)) out.set(srvKey("grade", id), { ...grade, mat: name, n });
        });
    });
    for (const [start, events] of Object.entries(data.calendar || {})) {
        for (const ev of events) {
            const { id, ...rest } = ev;
            if (srvIdOk(id)) out.set(srvKey("event", id), { ...rest, start });
        }
    }
    for (const key of SRV_DOCS) {
        const value = key === "simulator" ? data.simulator : data[key];
        if (value && typeof value === "object") out.set(srvKey("doc", key), value);
    }
    return out;
}

/** Înapoi: din înregistrări, datele în forma copiei de siguranță (trec apoi prin aceleași verificări ca la pornire). */
function recordsToData(records) {
    const subjects = [], grades = {}, calendar = {}, docs = {};
    for (const [key, d] of records) {
        const [collection, id] = srvSplit(key);
        if (!d || typeof d !== "object") continue;
        if (collection === "subject") subjects.push([id, d]);
        else if (collection === "grade" && typeof d.mat === "string") (grades[d.mat] ||= []).push({ ...d, id });
        else if (collection === "event" && typeof d.start === "string") (calendar[d.start] ||= []).push({ ...d, id });
        else if (collection === "doc" && SRV_DOCS.includes(id)) docs[id] = d;
    }
    subjects.sort((a, b) => (a[1].pos ?? 1e9) - (b[1].pos ?? 1e9) || a[0].localeCompare(b[0]));
    const subj = {};
    for (const [name, d] of subjects) {
        const { pos, ...rest } = d;
        subj[name] = { ...rest, grades: [] };
    }
    for (const [mat, list] of Object.entries(grades)) {
        list.sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || String(a.date || "").localeCompare(String(b.date || "")) || a.id.localeCompare(b.id));
        if (!subj[mat]) subj[mat] = { ore: 2, target: 10, grades: [] }; // o notă importată la o materie nouă: materia apare și ea
        subj[mat].grades = list.map(({ mat: _m, n: _n, ...g }) => g);
    }
    for (const list of Object.values(calendar)) list.forEach(ev => { delete ev.start; });
    return { ...docs, subjects: subj, calendar, meta: { schema: DATA_SCHEMA } };
}
const recordsToLoaded = records => { const data = recordsToData(records); return readStoredData(name => clone(data[name] ?? null)); };

/** Pune peste caiet datele venite de pe server, fără să strice ce e deschis pe ecran. */
function srvApply(records) {
    const loaded = recordsToLoaded(records);
    cloud.applying = true;
    try {
        applyLoadedData(loaded);
        if (ui.catalog?.selected && !state.subjects[ui.catalog.selected]) ui.catalog = { ...ui.catalog, selected: "", showDetail: false };
        applyAppearanceSettings();
        refresh();
        if (ui.activeTab === "tab-setari") loadSettingsIntoUI();
    } finally {
        cloud.applying = false;
    }
}

/* ---------- starea sincronizării (pe dispozitiv) ---------- */
function srvLoadMeta(student) {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(SRV_KEY) || "null"); } catch (_) { /* stricat: o luăm de la capăt */ }
    if (m && m.student === student && m.base && typeof m.base === "object") return { cursor: Number(m.cursor) || 0, base: m.base, known: true };
    return { cursor: 0, base: {}, known: false };
}
function srvSaveMeta() {
    try { localStorage.setItem(SRV_KEY, JSON.stringify({ student: srv.student, cursor: srv.cursor, base: srv.base })); } catch (_) { /* fără stocare: data viitoare comparăm din nou */ }
}

/** Tot ce s-a schimbat pe server de la `since`, pagină cu pagină. */
async function srvPull(student, since) {
    const records = [];
    let cursor = since, more = true;
    while (more) {
        const { data } = await api.request("GET", `/v1/students/${encodeURIComponent(student)}/records?since=${cursor}&limit=${SRV_PAGE}`);
        records.push(...data.records);
        more = Boolean(data.more) && data.cursor > cursor;
        cursor = data.cursor;
    }
    return { records, cursor };
}

async function srvPush(student, changes) {
    for (let i = 0; i < changes.length; i += SRV_CHUNK) {
        const chunk = changes.slice(i, i + SRV_CHUNK);
        await api.request("POST", `/v1/students/${encodeURIComponent(student)}/records`, {
            changes: chunk.map(c => { const [collection, id] = srvSplit(c.key); return { collection, id, data: c.data }; })
        });
        if (srv.student !== student) return;
        chunk.forEach(c => { if (c.hash === null) delete srv.base[c.key]; else srv.base[c.key] = c.hash; });
        srvSaveMeta();
    }
}

/* ---------- pornirea (la intrarea în cont) ---------- */
/** Elevul: îi sincronizăm caietul. Părintele/profesorul: intră în modul „doar citire” (viewer.js). */
async function srvBoot(user) {
    try {
        const me = await api.ensureRole();
        if (cloud.user?.uid !== user.uid) return;
        if (me.role === "student") await srvStart(user);
        else await enterViewer(me);
    } catch (err) {
        srvFailed(err);
    }
}

async function srvStart(user) {
    if (srv.starting) return srv.starting;
    srv.starting = (async () => {
        setSyncStatus("syncing");
        const me = await api.ensureStudent();
        if (cloud.user?.uid !== user.uid) return;
        const meta = srvLoadMeta(me.id);
        Object.assign(srv, { on: true, student: me.id, cursor: meta.cursor, base: meta.base });
        if (!meta.known) await srvFirstSync(user);
        else await srvSync();
        srvArmPoll();
    })();
    try {
        await srv.starting;
    } catch (err) {
        srvFailed(err);
    } finally {
        srv.starting = null;
    }
}

/** Prima sincronizare a acestui dispozitiv cu acest cont pe server. */
async function srvFirstSync(user) {
    const student = srv.student;
    const remote = await srvPull(student, 0);
    if (srv.student !== student) return;
    const live = remote.records.filter(r => !r.deleted);
    if (!live.length) {
        // Serverul e gol: întâi aducem ce era în contul Firebase (dacă există), apoi urcă tot caietul.
        if (cloud.api?.load) await reconcileWithCloud();
        if (cloud.user?.uid !== user.uid) return;
        srv.cursor = remote.cursor;
        srv.base = {};
        await srvSync();
        return;
    }
    // Serverul are deja caietul. Dispozitivul e o copie curată a contului: o înlocuim cu ce e pe server.
    // Are modificări netrimise (sau e al altcuiva): le unim, notă cu notă; la aceeași înregistrare câștigă serverul.
    const remoteMap = new Map(live.map(r => [srvKey(r.collection, r.id), r.data]));
    const local = stateRecords();
    const metaFb = syncMeta();
    const cleanCopy = metaFb.uid === user.uid && !metaFb.dirty;
    if (hasLocalData()) {
        try { localStorage.setItem(SRV_BACKUP_KEY, dataJSON()); } catch (_) { /* prea mare: rămâne doar unirea */ }
    }
    const merged = new Map(remoteMap);
    if (!cleanCopy) for (const [key, d] of local) if (!merged.has(key)) merged.set(key, d);
    srv.base = Object.fromEntries([...remoteMap].map(([k, d]) => [k, srvHash(d)]));
    srv.cursor = remote.cursor;
    srvSaveMeta();
    srvApply(merged);
    const added = merged.size - remoteMap.size;
    if (added > 0) showToast(`☁ Am unit caietul de aici cu cel din cont (${added} ${added === 1 ? "lucru nou" : "lucruri noi"} de pe acest dispozitiv).`, { duration: 5000 });
    await srvSync();
}

/* ---------- sincronizarea ---------- */
async function srvSync() {
    if (!srv.on || !cloud.user) return;
    if (srv.busy) {
        srv.again = true;
        return;
    }
    srv.busy = true;
    clearTimeout(srv.timer);
    const student = srv.student;
    setSyncStatus("syncing");
    try {
        const remote = await srvPull(student, srv.cursor);
        if (srv.student !== student || !srv.on) return;
        let local = stateRecords();
        // ce am schimbat aici și n-a ajuns încă pe server (față de ce știam despre server înainte de citire)
        const pending = new Set();
        for (const [key, d] of local) if (srv.base[key] !== srvHash(d)) pending.add(key);
        for (const key of Object.keys(srv.base)) if (!local.has(key)) pending.add(key);

        let changed = false;
        for (const r of remote.records) {
            const key = srvKey(r.collection, r.id);
            const h = r.deleted ? null : srvHash(r.data);
            if (h === null) delete srv.base[key]; else srv.base[key] = h;
            if (pending.has(key)) continue; // modificarea de aici e mai nouă: pleacă spre server mai jos
            const cur = local.get(key);
            if (h === null) {
                if (cur !== undefined) { local.delete(key); changed = true; }
            } else if (cur === undefined || srvHash(cur) !== h) {
                local.set(key, r.data);
                changed = true;
            }
        }
        srv.cursor = remote.cursor;
        srvSaveMeta();
        if (changed) {
            srvApply(local);
            local = stateRecords();
            if (remote.records.length) showToast("↻ Am adus modificările făcute pe alt dispozitiv.");
        }

        const changes = [];
        for (const [key, d] of local) {
            const hash = srvHash(d);
            if (srv.base[key] !== hash) changes.push({ key, data: d, hash });
        }
        for (const key of Object.keys(srv.base)) if (!local.has(key)) changes.push({ key, data: null, hash: null });
        if (changes.length) await srvPush(student, changes);
        if (srv.student !== student) return;
        const at = Date.now();
        cloud.dirty = false;
        cloud.lastSyncAt = at;
        setSyncMeta({ uid: cloud.user.uid, lastSyncAt: at, dirty: false });
        setSyncStatus("synced");
    } catch (err) {
        srvFailed(err);
    } finally {
        srv.busy = false;
        if (srv.again) {
            srv.again = false;
            srvSchedule(300);
        }
    }
}

function srvFailed(err) {
    if (err?.code === "not_student") return; // părinte/profesor: n-are caiet propriu de sincronizat
    console.warn("Sincronizarea cu serverul a eșuat; reîncerc.", err?.message || err);
    if (cloud.user) {
        cloud.dirty = true;
        setSyncMeta({ uid: cloud.user.uid, dirty: true });
    }
    setSyncStatus(navigator.onLine === false || err?.code === "offline" ? "offline" : "error");
    clearTimeout(srv.timer);
    srv.timer = setTimeout(() => (srv.on ? srvSync() : cloud.user && !guest.viewer && srvBoot(cloud.user)), SYNC_RETRY);
}

/** Apelată la fiecare salvare (prin onLocalDataChange): trimite după o scurtă pauză. */
function srvSchedule(delay = SYNC_DELAY) {
    if (!srv.on) return;
    clearTimeout(srv.timer);
    srv.timer = setTimeout(srvSync, delay);
}

/** Cât timp aplicația e în față, întrebăm serverul din când în când dacă s-a schimbat ceva pe alt dispozitiv. */
function srvArmPoll() {
    clearInterval(srv.poll);
    srv.poll = setInterval(() => { if (srv.on && document.visibilityState === "visible") srvSync(); }, SRV_POLL);
}

function srvStop() {
    clearTimeout(srv.timer);
    clearInterval(srv.poll);
    Object.assign(srv, { on: false, student: "", cursor: 0, base: {}, busy: false, again: false });
}

if (api.enabled) {
    window.addEventListener("focus", () => { if (srv.on) srvSync(); });
    window.addEventListener("online", () => { if (srv.on) srvSync(); else if (cloud.user && !guest.viewer) srvBoot(cloud.user); });
    document.addEventListener("visibilitychange", () => { if (srv.on && document.visibilityState === "visible") srvSync(); });
}
