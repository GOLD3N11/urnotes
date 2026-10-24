/* urNotes · Colegul de pe fiecare pagină: mascota (post-it-ul botezat de elev) în antetul fiecărui tab,
   cu o propoziție utilă despre pagina respectivă. Atinge-l ca să-ți spună altceva.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* Fiecare pagină are o listă de replici, de la cea mai utilă acum la sfaturi generale.
   O pagină nouă își adaugă replicile aici (sau prin registerTab(..., { pal })). */
const line = (text, mood = "focused") => ({ text, mood });
const shortMat = mat => shortSubjectName(mat);

const PAL_LINES = {
    "tab-plan": () => {
        const out = [];
        const today = getLocalDateKey();
        if (!state.plan.prefs.setup) {
            out.push(line("Spune-mi cât timp ai în zilele de școală și în weekend, iar eu îți potrivesc ce să înveți în fiecare zi.", "happy"));
        } else {
            const left = state.plan.items.filter(it => it.date === today && !it.done);
            const done = state.plan.items.filter(it => it.date === today && it.done);
            if (left.length) {
                const first = [...left].sort((a, b) => PLAN_KINDS[a.kind].rank - PLAN_KINDS[b.kind].rank)[0];
                out.push(line(`Azi mai ai ${plural(left.length, "sesiune", "sesiuni")} (${left.reduce((n, it) => n + it.min, 0)} min). Începe cu ${shortMat(first.mat)}${first.reason ? `: ${first.reason}` : ""}.`));
            } else if (done.length) {
                out.push(line(`Ai terminat planul de azi. Bravo! Mâine continuăm.`, "love"));
            } else {
                out.push(line("Azi n-ai nimic în plan. Dacă ai chef, adaugă o sesiune la ce simți că ai nevoie.", "happy"));
            }
            const streak = planStreak(today);
            if (streak >= 2) out.push(line(`${plural(streak, "zi", "zile")} la rând cu planul făcut. Nu rupe șirul!`, "happy"));
        }
        out.push(line("Bifează o sesiune când o termini. Dacă apare un test nou, planul se reface singur."));
        out.push(line("„Începe” pornește cronometrul: învață până sună, fără telefon în mână.", "happy"));
        return out;
    },
    "tab-calendar": () => {
        const out = [];
        const today = getLocalDateKey();
        const links = gradeLinks();
        const next = occurrencesBetween(today, addDays(today, 30)).find(o => NEEDS_GRADE.has(o.ev.type) && !isOccurrenceDone(o.ev, o.date, links));
        const missed = missedOccurrences(links, today).filter(o => NEEDS_GRADE.has(o.ev.type));
        if (missed.length) out.push(line(`${plural(missed.length, "test trecut așteaptă", "teste trecute așteaptă")} nota. Pune-o din „Necesită atenție”, ca să-ți calculez media corect.`, "worried"));
        if (next) out.push(line(`Următorul: ${next.ev.title}, ${relativeDay(next.date)}${daysUntil(next.date) <= 2 ? ". Hai să-l pregătim!" : "."}`, daysUntil(next.date) <= 2 ? "surprised" : "focused"));
        else out.push(line("Nimic de dat în următoarele 30 de zile. Adaugă testele cum le anunță profesorii.", "happy"));
        if (!Object.keys(state.timetable).length) out.push(line("Pune-ți orarul (butonul „Orar”): așa știu când e următoarea oră la fiecare materie."));
        out.push(line("Trage un test pe altă zi ca să-l muți. Atinge o oră din orar ca să adaugi repede un test acolo."));
        return out;
    },
    "tab-catalog": () => {
        const out = [];
        const entries = Object.entries(metrics.subjects);
        const risk = entries.filter(([, d]) => d.status === "Risc").sort((a, b) => a[1].rawAvg - b[1].rawAvg)[0];
        const need = entries.filter(([, d]) => d.requiredNotes > 0).sort((a, b) => b[1].requiredNotes - a[1].requiredNotes)[0];
        const best = entries.filter(([, d]) => d.rawAvg > 0).sort((a, b) => b[1].rawAvg - a[1].rawAvg)[0];
        if (!entries.length) return [line("Încă n-ai materii. Fă configurarea rapidă și le pun eu pe toate, după programa ta.", "happy")];
        if (risk) {
            const pill = planPill(planForCondition(risk[0], d => d.exactAvg >= state.settings.calc.riskThreshold));
            out.push(line(`${shortMat(risk[0])} e sub ${state.settings.calc.riskThreshold}: ca să ieși din risc îți trebuie ${pill.text}.`, "worried"));
        }
        if (need) out.push(line(`La ${shortMat(need[0])} îți mai trebuie ${plural(need[1].requiredNotes, "notă", "note")} până la minimul pe an.`));
        if (best && best[1].rawAvg >= 9) out.push(line(`Cea mai bună medie: ${shortMat(best[0])}, ${best[1].exactAvg.toFixed(2)}. Ține-o așa!`, "happy"));
        out.push(line("Apasă lung (sau clic dreapta) pe o materie pentru meniul rapid: notă, ținte, prioritate."));
        return out;
    },
    "tab-statistici": () => {
        const out = [];
        if (!metrics.totalGrades) return [line("Când ai câteva note, aici îți arăt cum evoluezi și ce merită îmbunătățit.", "happy")];
        const change = generalChange(averageTimeline());
        if (change && Math.abs(change.delta) >= TREND_STABLE) {
            out.push(change.delta > 0
                ? line(`Media generală a urcat cu ${change.delta.toFixed(2)} ${change.label}. Super!`, "love")
                : line(`Media a coborât cu ${Math.abs(change.delta).toFixed(2)} ${change.label}. Uită-te la „Ce să faci acum”.`, "worried"));
        }
        const prev = lastArchived();
        if (prev?.gpa && metrics.globalAvg) out.push(line(`Anul trecut ai încheiat cu ${prev.gpa.toFixed(2)}. Acum ești la ${metrics.globalAvg.toFixed(2)}.`));
        out.push(line(`Ai ${plural(metrics.tensCount, "notă de 10", "note de 10")} din ${metrics.totalGrades}.`, metrics.tensCount ? "happy" : "focused"));
        out.push(line("„Raport pentru printare” îți face o foaie frumoasă cu toate notele, bună de arătat acasă."));
        return out;
    },
    "tab-simulator": () => {
        const out = [];
        const hypo = Object.values(activeScenario()?.hypo || {}).reduce((n, l) => n + l.length, 0);
        if (hypo) out.push(line(`Ai ${plural(hypo, "notă ipotetică", "note ipotetice")}. Notele tale reale rămân neatinse, stai liniștit.`, "happy"));
        const low = Object.entries(metrics.subjects).filter(([, d]) => d.rawAvg > 0).sort((a, b) => a[1].rawAvg - b[1].rawAvg)[0];
        if (low) out.push(line(`Încearcă un 10 la ${shortMat(low[0])}: e media cea mai mică, deci acolo urcă cel mai mult media generală.`));
        out.push(line("Fă mai multe scenarii („+ Nou”) și compară: unul optimist, unul realist."));
        return out;
    },
    "tab-setari": () => {
        const out = [];
        if (!myProgramme()) out.push(line("Alege-ți programa (profil și clasă): așa știu ce materii și câte ore ai.", "worried"));
        if (!state.settings.remind.on) out.push(line("Pornește „Amintiri” și îți spun seara ce ai a doua zi.", "happy"));
        if (!state.settings.school.county) out.push(line("Spune-mi județul, ca să știu când ai vacanța de schi."));
        out.push(line(`Anul școlar ${yearOfModules().label}${myProgramme() ? `, clasa a ${ROMAN[state.settings.school.cls] || state.settings.school.cls}-a` : ""}. Totul se salvează singur.`));
        out.push(line("Exportă din când în când un backup: un fișier cu toate datele tale, pentru orice eventualitate."));
        return out;
    }
};

/** Replicile unei pagini, ca listă (cel puțin una). */
function palLines(tab) {
    const fn = TABS[tab]?.pal || PAL_LINES[tab];
    if (!fn) return [];
    try {
        const list = fn().filter(l => l && l.text);
        return list.length ? list : [line("Sunt aici dacă ai nevoie de mine.")];
    } catch (err) {
        console.error("Colegul nu și-a găsit cuvintele.", err);
        return [];
    }
}

/** Colegul din antetul paginii active. */
function renderPagePal(tab = ui.activeTab) {
    const box = document.querySelector(`#${tab} .page-pal`);
    if (!box) return;
    const lines = palLines(tab);
    if (!lines.length) { box.hidden = true; return; }
    ui.pal ||= {};
    const i = (ui.pal[tab] || 0) % lines.length;
    const l = lines[i];
    box.hidden = false;
    const key = `${l.mood}|${l.text}`;
    if (box.dataset.key === key) return; // nimic nou: nu-l mai redesenăm (ar reporni animația)
    box.dataset.key = key;
    box.innerHTML = `
        <button type="button" class="pal-face" data-action="pal-next" data-tab="${tab}" aria-label="${escapeHTML(buddyName())}">${buddySVG(l.mood, "pal-buddy")}</button>`;
}

Object.assign(ACTIONS, {
    "pal-next": el => {
        const tab = el.dataset.tab;
        ui.pal ||= {};
        ui.pal[tab] = (ui.pal[tab] || 0) + 1;
        renderPagePal(tab);
        const face = document.querySelector(`#${tab} .pal-face`);
        if (face && !reduceMotion()) { face.classList.remove("is-hit"); void face.offsetWidth; face.classList.add("is-hit"); }
    }
});
GUEST_OK.add("pal-next");
