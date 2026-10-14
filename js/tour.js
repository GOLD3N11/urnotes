/* urNotes · Turul ghidat.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== TUR GHIDAT (pentru cei noi) ==================== */
/*
 * Mascota îl plimbă pe elev prin aplicație: un „reflector” peste fiecare zonă importantă
 * și un bilețel cu explicația. Pornește singur o dată, după configurare; se poate relua din Setări,
 * din „Mai mult” sau din căutare. Pașii ale căror ținte nu sunt pe ecran (ex. pe telefon) se sar.
 */
const TOUR_DONE_KEY = "pro_tour_done_v4";
const tour = { open: false, i: 0, steps: [], returnFocus: null };
const isPhoneLayout = () => Boolean(window.matchMedia?.("(max-width: 900px)").matches);
const navSel = tab => isPhoneLayout() ? `.mobile-nav-btn[data-tab="${tab}"]` : `.side-link[data-tab="${tab}"]`;

function tourSteps() {
    const name = firstName();
    const hey = name ? `, ${name}` : "";
    const phone = isPhoneLayout();
    return [
        { text: `Salut${hey}! Eu sunt ${buddyName()}, colegul tău de bancă. În mai puțin de un minut îți arăt cum merge urNotes.` },
        { target: ".azi-head-text", text: "Asta e pagina Azi. În fiecare zi găsești aici ce ore ai, ce teste urmează și ce note mai aștepți." },
        { target: phone ? "#azi-plan" : navSel("tab-plan"), text: "La „Plan” îți fac un program de învățat pe 7 zile: înainte de teste, pentru teme și pentru materiile care au nevoie. Tu bifezi ce ai făcut." },
        { target: phone ? ".mobile-add" : "#quick-add-btn", text: `Cu „Adaugă” pui o notă, un test, o temă sau o materie nouă.${phone ? "" : " Merge și tasta N."}` },
        { target: navSel("tab-catalog"), text: "În Catalog ai toate materiile, cu notele și mediile lor. Deschide o materie ca să vezi ce notă îți trebuie ca să-ți atingi ținta." },
        { target: navSel("tab-calendar"), text: "Calendarul ține testele, tezele și temele. Când primești nota, o treci direct din calendar." },
        { target: navSel("tab-statistici"), text: "La Statistici vezi cum evoluează media: pe materii, pe module și pe zile ale săptămânii." },
        phone
            ? { target: "#more-btn", text: "În „Mai mult” găsești Simulatorul („ce-ar fi dacă aș lua un 9?”), contul tău și Setările." }
            : { target: navSel("tab-simulator"), text: "Simulatorul: „ce-ar fi dacă aș lua un 9 la mate?”. Încerci note fără să-ți atingi media reală." },
        { target: ".cmdk-trigger", text: `Aici cauți orice: materii, note, teste sau comenzi rapide.${phone ? "" : " Scurtătură: Ctrl K sau /."}` },
        { target: "#notif-btn", text: "Clopoțelul te anunță când o materie intră în risc sau când un test își așteaptă nota." },
        { target: phone ? "#tour-none" : "#account-chip", text: cloud.user ? "Ești în cont: notele se salvează singure și apar pe orice telefon sau calculator." : "Intră în cont ca notele să te urmeze pe orice telefon sau calculator." },
        { target: "#azi-buddy", text: "Și eu stau aici, pe pagina Azi: îți spun ce contează și mă bucur de fiecare 10. Mă poți gâdila cu un clic… dar nu prea tare! Numele noastre le schimbi din Setări." },
        { text: `Gata${hey}! Poți relua turul oricând din Setări. Spor la note mari!`, last: true }
    ];
}

const tourDone = () => { try { return localStorage.getItem(TOUR_DONE_KEY) === "1"; } catch (_) { return true; } };
function maybeStartTour() {
    if (!tourDone()) startTour();
}

function startTour() {
    if (!$("tour") || tour.open) return;
    if (!$("setup").hidden || ($("auth") && !$("auth").hidden)) return;
    closeActionModal();
    closeQuickAdd({ restoreFocus: false });
    closeMoreMenu({ restoreFocus: false });
    closeCmdk({ restoreFocus: false });
    closeNotifPanel({ restoreFocus: false });
    if (!$("action-modal").hidden) return; // o întrebare care cere răspuns (ex. sincronizarea) are prioritate
    switchTab("tab-dashboard");
    window.scrollTo(0, 0);
    tour.open = true;
    tour.steps = tourSteps();
    tour.returnFocus = document.activeElement;
    $("tour").hidden = false;
    document.body.classList.add("tour-open");
    window.addEventListener("resize", placeTour);
    window.addEventListener("scroll", placeTour, { passive: true });
    showTourStep(0, 1);
}

function endTour() {
    if (!tour.open) return;
    tour.open = false;
    $("tour").hidden = true;
    document.body.classList.remove("tour-open");
    window.removeEventListener("resize", placeTour);
    window.removeEventListener("scroll", placeTour);
    try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch (_) { /* fără stocare: tot nu insistăm */ }
    const back = tour.returnFocus;
    tour.returnFocus = null;
    if (back && document.contains(back) && back !== document.body) back.focus();
}

/** Elementul unui pas, doar dacă se vede pe ecran. */
function tourTarget(step) {
    if (!step?.target) return null;
    const el = document.querySelector(step.target);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" ? el : null;
}
const tourVisible = (step, k, all) => k === 0 || k === all.length - 1 || Boolean(tourTarget(step));

/** Arată pasul `i`; dacă ținta lui nu e pe ecran, merge mai departe în direcția `dir`. */
function showTourStep(i, dir) {
    const steps = tour.steps;
    while (i > 0 && i < steps.length - 1 && !tourTarget(steps[i])) i += dir;
    tour.i = Math.max(0, Math.min(steps.length - 1, i));
    const step = steps[tour.i];
    const el = tourTarget(step);
    if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > innerHeight - 70) el.scrollIntoView({ block: "center" });
    }
    const visible = steps.map(tourVisible);
    const pos = visible.slice(0, tour.i + 1).filter(Boolean).length;
    $("tour-buddy").innerHTML = buddySVG(step.last ? "giggle" : tour.i === 0 ? "happy" : "focused");
    $("tour-step").textContent = `${buddyName()} · ${pos} din ${visible.filter(Boolean).length}`;
    $("tour-text").textContent = step.text;
    $("tour-back").hidden = tour.i === 0;
    $("tour-next").textContent = step.last ? "Hai să începem!" : tour.i === 0 ? "Arată-mi" : "Mai departe";
    $("tour-skip").hidden = Boolean(step.last);
    placeTour();
    $("tour-next").focus({ preventScroll: true });
}

/** Reflectorul peste țintă și bilețelul lângă ea (dedesubt dacă încape, altfel deasupra). */
function placeTour() {
    if (!tour.open) return;
    const el = tourTarget(tour.steps[tour.i]);
    const hole = $("tour-hole");
    const card = $("tour-card");
    const pad = 8;
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = innerHeight;
    $("tour").classList.toggle("is-centered", !el);
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (!el) {
        hole.hidden = true;
        card.style.left = `${Math.max(12, (vw - cw) / 2)}px`;
        card.style.top = `${Math.max(12, (vh - ch) / 2)}px`;
        return;
    }
    const r = el.getBoundingClientRect();
    hole.hidden = false;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const gap = 14;
    let top = r.bottom + pad + gap;
    if (top + ch > vh - 12) top = r.top - pad - gap - ch;
    if (top < 12) top = Math.max(12, vh - ch - 12); // nu încape nici sus, nici jos: îl ținem pe ecran
    const left = Math.max(12, Math.min(vw - cw - 12, r.left + r.width / 2 - cw / 2));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
}

const TOUR_ACTIONS = {
    "tour-start": () => startTour(),
    "tour-next": () => tour.i >= tour.steps.length - 1 ? endTour() : showTourStep(tour.i + 1, 1),
    "tour-back": () => showTourStep(tour.i - 1, -1),
    "tour-skip": () => endTour(),
    "buddy-poke": (el, event) => pokeBuddy(el, event)
};

/** Tastele cât timp e deschis turul: Escape îl închide, săgețile schimbă pasul, Tab rămâne în bilețel. */
function handleTourKey(event) {
    const k = event.key;
    if (k === "Escape") { event.preventDefault(); endTour(); return; }
    if (k === "ArrowRight") { event.preventDefault(); TOUR_ACTIONS["tour-next"](); return; }
    if (k === "ArrowLeft" && tour.i > 0) { event.preventDefault(); TOUR_ACTIONS["tour-back"](); return; }
    if (k === "Tab") trapFocusIn($("tour-card"), event);
}

const SETUP_ACTIONS = {
    "setup-open": () => openSetup(0),
    "programme-change": () => openSetup(1),
    "help": el => openHelp(el.dataset.key),
    "bgame-start": () => startBuddyGame(),
    "bgame-hit": el => hitBuddy(el),
    "install-hide": () => { try { localStorage.setItem(IOS_HINT_KEY, "1"); } catch (_) { /* fără stocare */ } renderDashboard(); },
    "badge-allow": async () => {
        try { await Notification.requestPermission(); } catch (_) { /* refuzat */ }
        renderNotificationBadge();
        renderBadgeSetting();
    },
    "start-hide": () => { try { localStorage.setItem(START_HIDE_KEY, "1"); } catch (_) { /* fără stocare */ } renderDashboard(); },
    "setup-skip": () => {
        markSetupDone();
        closeSetup();
        setTimeout(maybeStartTour, 300);
        showToast("Poți porni configurarea oricând din Setări sau din căutare (Ctrl+K).");
    },
    "setup-next": () => setupNext(),
    "setup-back": () => {
        ui.setup.step = Math.max(0, ui.setup.step - 1);
        renderSetup();
    },
    "setup-import": () => {
        markSetupDone();
        closeSetup();
        $("backup-file-input")?.click();
    },
    "setup-profile": el => {
        const st = ui.setup;
        if (!SETUP_PROFILES[el.dataset.id]) return;
        st.profile = el.dataset.id;
        const prof = SETUP_PROFILES[st.profile];
        // Clasa rămâne aleasă când treci de la un profil la altul, dacă există și la noul profil.
        if (prof.classes && !prof.classes.includes(st.cls)) st.cls = prof.classes[0];
        if (prof.variants && !prof.variants.some(v => v.id === st.variant)) st.variant = prof.variants[0].id;
        st.rows = setupRowsFor(st.profile, st.cls, st.variant, st.lm2);
        renderSetup();
        $("setup-body").querySelector(`[data-id="${st.profile}"]`)?.focus({ preventScroll: true });
        $("setup-body").querySelector(".setup-extra")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    },
    "setup-variant": el => {
        const st = ui.setup;
        const prof = SETUP_PROFILES[st.profile];
        if (!prof?.variants?.some(v => v.id === el.dataset.variant)) return;
        st.variant = el.dataset.variant;
        st.rows = setupRowsFor(st.profile, st.cls, st.variant, st.lm2);
        renderSetup();
        $("setup-body").querySelector(`[data-variant="${st.variant}"]`)?.focus();
    },
    "setup-class": el => {
        const st = ui.setup;
        const classes = SETUP_PROFILES[st.profile]?.classes || [];
        const c = Number(el.dataset.cls);
        if (!classes.includes(c)) return;
        st.cls = c;
        st.rows = setupRowsFor(st.profile, st.cls, st.variant, st.lm2);
        renderSetup();
        $("setup-body").querySelector(`[data-cls="${st.cls}"]`)?.focus();
    },
    "setup-hours": el => {
        const r = ui.setup.rows[Number(el.dataset.i)];
        if (!r) return;
        r.ore = Math.min(10, Math.max(1, r.ore + Number(el.dataset.d)));
        renderSetup();
        $("setup-body").querySelector(`[data-action="setup-hours"][data-i="${el.dataset.i}"][data-d="${el.dataset.d}"]:not(:disabled)`)?.focus();
    },
    "setup-target": el => { ui.setup.target = clampNumber(el.dataset.v, 5, 10, 10); rerenderSetupKeepFocus(el); },
    "setup-risk": el => { ui.setup.risk = clampNumber(el.dataset.v, 1, 10, 8); rerenderSetupKeepFocus(el); },
    "setup-method": el => { ui.setup.method = el.dataset.v === "weighted" ? "weighted" : "arithmetic"; rerenderSetupKeepFocus(el); },
    "setup-finish": el => finishSetup(el.dataset.timetable === "1")
};

/** Redesenează pasul curent și pune focusul înapoi pe butonul echivalent (pentru tastatură). */
function rerenderSetupKeepFocus(el) {
    const sel = `[data-action="${el.dataset.action}"][data-v="${el.dataset.v}"]`;
    ui.setup.preset = validSetupPreset(field("setup-preset"), ui.setup.preset);
    renderSetup();
    $("setup-body").querySelector(sel)?.focus();
}

function bindSetupEvents() {
    const box = $("setup");
    if (!box) return;
    box.addEventListener("change", event => {
        const t = event.target;
        if (t.classList.contains("setup-check")) {
            const r = ui.setup?.rows[Number(t.dataset.i)];
            if (r) { r.on = t.checked; renderSetup(); $("setup-body").querySelector(`.setup-check[data-i="${t.dataset.i}"]`)?.focus(); }
        } else if (t.id === "setup-preset" && ui.setup) {
            ui.setup.preset = validSetupPreset(t.value, ui.setup.preset);
        } else if (t.id === "setup-county" && ui.setup) {
            ui.setup.county = COUNTY_WEEK[t.value] ? t.value : "";
            if (COUNTY_WEEK[t.value]) {
                ui.setup.preset = COUNTY_WEEK[t.value];
                if ($("setup-preset")) $("setup-preset").value = ui.setup.preset;
            }
        }
    });
    box.addEventListener("input", event => {
        const t = event.target;
        if (t.id === "setup-me-name" || t.id === "setup-me-buddy") {
            // Se salvează pe loc: numele rămân chiar dacă elevul sare peste restul configurării.
            const p = state.settings.profile;
            if (t.id === "setup-me-name") p.name = cleanName(t.value, 40);
            else p.buddy = cleanName(t.value, 20) || DEFAULT_SETTINGS.profile.buddy;
            saveState();
            $("setup-buddy").innerHTML = setupBuddyHTML();
            return;
        }
        if (t.classList.contains("setup-opt-topic")) {
            const r = ui.setup?.rows[Number(t.dataset.i)];
            if (r) {
                r.topic = t.value;
                // a scris tema: opționalul se bifează singur
                if (t.value.trim() && !r.on) {
                    r.on = true;
                    t.closest(".setup-row")?.classList.remove("is-off");
                    const chk = t.closest(".setup-row")?.querySelector(".setup-check");
                    if (chk) chk.checked = true;
                }
            }
        }
    });
    box.addEventListener("change", event => {
        const t = event.target;
        if (!t.classList.contains("setup-lm2")) return;
        const r = ui.setup?.rows[Number(t.dataset.i)];
        if (!r || !LM2_CHOICES.includes(t.value)) return;
        r.name = t.value;
        ui.setup.lm2 = t.value;
        r.exists = Boolean(findSubjectName(r.name));
        r.shown = findSubjectName(r.name) || r.name;
        renderSetup();
        $("setup-body").querySelector(".setup-lm2")?.focus();
    });
}
