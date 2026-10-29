/* urNotes · Regulile de calcul, comune aplicației și serverului (faza 5 din planul de arhitectură).
   Același fișier rulează în browser (ca script clasic: definește `URN_RULES`) și pe server (require),
   ca o medie să iasă la fel peste tot. Fără dependențe și fără stare: totul vine prin parametri. */
(function (root, factory) {
    "use strict";
    const rules = factory();
    if (typeof module === "object" && module.exports) module.exports = rules;
    else root.URN_RULES = rules;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    /** Rotunjire „ca pe hârtie”: 8.495 → 8.50 (fără zgomotul virgulei mobile). */
    function roundValue(value, decimals = 2) {
        if (!Number.isFinite(value)) return 0;
        const factor = 10 ** decimals;
        return Math.round(Number((value * factor).toPrecision(12))) / factor;
    }

    function clampNumber(value, min, max, fallback) {
        const parsed = parseFloat(String(value).replace(",", "."));
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    }

    /** Purtarea pe module: 10 implicit, nota pusă de diriginte dacă există; modulele care n-au început nu contează. */
    function purtareSummary(modules, grades, today) {
        const list = Array.isArray(modules) ? modules : [];
        const year = list.length ? String(list[0].start).slice(0, 4) : "";
        const mods = list.map((m, i) => {
            const key = `${year}-${i + 1}`;
            const saved = grades && grades[key];
            const status = today < m.start ? "upcoming" : today > m.end ? "done" : "current";
            return {
                n: i + 1, key, start: m.start, end: m.end, status,
                val: status === "upcoming" ? null : (saved && saved.val != null ? saved.val : 10),
                reason: (saved && saved.reason) || "",
                changed: Boolean(saved)
            };
        });
        const started = mods.filter(m => m.status !== "upcoming");
        // Înainte de primul modul nota e 10 (se reînnoiește); după ultimul rămâne media anului.
        const avg = started.length ? started.reduce((s, m) => s + m.val, 0) / started.length : 10;
        return { modules: mods, avg };
    }

    function emptyMetrics() {
        return { subjects: {}, globalAvg: 0, rawGlobalAvg: 0, riskCount: 0, totalGrades: 0, tensCount: 0, maxGrade: null, minGrade: null, purtare: null };
    }

    /**
     * Mediile: pe materii (exactă, finală rotunjită la întreg, câte note mai trebuie, starea) și media generală.
     * opts = { calc: { method, rounding, riskThreshold }, purtare: { avg, ... } | null, purtareExcluded, purtareWeight }
     */
    function computeMetrics(subjects, opts) {
        const calc = opts.calc;
        const decimals = Number(calc.rounding);
        const m = emptyMetrics();
        let weightedSum = 0, weightTotal = 0, arithmeticSum = 0, arithmeticCount = 0;

        for (const [mat, sub] of Object.entries(subjects || {})) {
            const grades = Array.isArray(sub.grades) ? sub.grades : [];
            let sum = 0;
            const count = grades.length;
            grades.forEach(g => {
                const value = clampNumber(g.val, 1, 10, 1);
                sum += value;
                m.totalGrades++;
                if (value === 10) m.tensCount++;
                m.maxGrade = m.maxGrade === null ? value : Math.max(m.maxGrade, value);
                m.minGrade = m.minGrade === null ? value : Math.min(m.minGrade, value);
            });
            const rawAvg = count > 0 ? sum / count : 0;
            const exactAvg = count > 0 ? roundValue(rawAvg, decimals) : 0;
            const d = {
                rawAvg,
                exactAvg,
                // media la materie din catalog: media aritmetică exactă rotunjită la întreg (la ,50 în favoarea elevului)
                roundedAvg: count > 0 ? roundValue(rawAvg, 0) : 0,
                requiredNotes: Math.max(0, Math.ceil(sub.ore) + 3 - count)
            };
            if (count === 0) { d.status = "Fără note"; d.statusClass = "badge-warn"; }
            else if (exactAvg < calc.riskThreshold) { d.status = "Risc"; d.statusClass = "badge-danger"; m.riskCount++; }
            else { d.status = "Sigur"; d.statusClass = "badge-ok"; }

            if (!sub.excludeFromGPA && rawAvg > 0) {
                weightedSum += rawAvg * sub.ore;
                weightTotal += sub.ore;
                // „ca în catalog” (ROFUIP): media generală = media aritmetică a mediilor ÎNTREGI pe materii (+ purtarea)
                arithmeticSum += d.roundedAvg;
                arithmeticCount++;
            }
            m.subjects[mat] = d;
        }

        // Purtarea intră ca o materie, dar doar dacă există și alte medii.
        m.purtare = opts.purtare || null;
        if (m.purtare && !opts.purtareExcluded && arithmeticCount > 0) {
            const w = opts.purtareWeight ?? 1;
            weightedSum += m.purtare.avg * w;
            weightTotal += w;
            arithmeticSum += m.purtare.avg;
            arithmeticCount++;
        }
        m.rawGlobalAvg = calc.method === "weighted"
            ? (weightTotal > 0 ? weightedSum / weightTotal : 0)
            : (arithmeticCount > 0 ? arithmeticSum / arithmeticCount : 0);
        m.globalAvg = roundValue(m.rawGlobalAvg, decimals);
        return m;
    }

    /* ==================== REALISM: ce e posibil într-o școală adevărată ==================== */
    const LIMITS = {
        subjects: 22,            // planul-cadru are cel mult ~18 materii, plus dirigenția și un opțional
        subjectName: 48,
        eventTitle: 60,
        perDayItems: 8,          // teste, teme, proiecte… într-o singură zi
        perDayEvaluations: 3,    // teste + teze pe zi (regula din școli: nu mai mult de câteva evaluări scrise pe zi)
        perDayExams: 1,          // o singură teză pe zi
        gradesPerSubjectPerDay: 2,
        gradesPerDay: 8,
        gradesPerSubject: 40
    };
    const EVALUATIONS = ["Test", "Examen"];
    const SCHOOL_DAY_ONLY = ["Test", "Examen", "Prezentare"];
    const NEEDS_SUBJECT = ["Test", "Examen", "Temă", "Proiect", "Prezentare"];

    const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const EMOJI_RE = /\p{Extended_Pictographic}/u;
    /** Nume rezervate de JavaScript (ar încurca datele dacă ar fi chei de materii). */
    const RESERVED_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype).concat(["__proto__", "prototype"]));

    /** Text curat: spații normale, fără litere repetate la nesfârșit, fără cuvinte repetate, cel mult 2 emoji. */
    function cleanText(value, max) {
        let s = String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
        s = s.replace(/(.)\1{3,}/gu, "$1$1$1");                          // „aaaaaaa” → „aaa”
        s = s.replace(/\b(\p{L}+)(?:\s+\1\b){2,}/giu, "$1");             // „stra stra stra stra” → „stra”
        let emoji = 0;
        s = Array.from(s).filter(ch => !EMOJI_RE.test(ch) || ++emoji <= 2).join("").replace(/️(?!\p{Extended_Pictographic})/gu, "");
        s = s.replace(/\s+/g, " ").trim();
        return max ? Array.from(s).slice(0, max).join("").trim() : s;
    }

    const KEYBOARD_RUNS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "poiuytrewq", "lkjhgfdsa", "mnbvcxz"];
    /** Pare scris la întâmplare? (fără litere, rânduri de tastatură, o literă repetată, consoane fără vocale) */
    function looksLikeJunk(value) {
        const f = fold(value).replace(/\s/g, "");
        if (!f || !/[a-z]/.test(f)) return true;
        if (f.length >= 5 && KEYBOARD_RUNS.some(run => { for (let i = 0; i + 5 <= f.length; i++) if (run.includes(f.slice(i, i + 5))) return true; return false; })) return true;
        if (f.length >= 3 && new Set(f).size <= 1) return true;
        if (f.length >= 6 && !/[aeiouy]/.test(f)) return true;
        return false;
    }

    /** Materiile care există în școlile din România (planurile-cadru); restul doar ca „Opțional – …”. */
    const KNOWN_SUBJECTS = [
        "Limba și literatura română", "Limba română", "Comunicare în limba română", "Matematică", "Matematică și explorarea mediului", "Fizică", "Chimie", "Biologie",
        "Științe ale naturii", "Istorie", "Geografie", "Limba engleză", "Limba franceză", "Limba germană", "Limba spaniolă", "Limba italiană", "Limba rusă", "Limba latină",
        "Limba portugheză", "Limba chineză", "Limba japoneză", "Limba maghiară", "Limba și literatura maghiară", "Limba maternă", "Limba modernă", "Informatică", "TIC",
        "Tehnologia informației și a comunicațiilor", "Informatică și TIC", "Educație fizică", "Educație fizică și sport", "Religie", "Educație muzicală", "Muzică",
        "Muzică și mișcare", "Educație plastică", "Educație artistică", "Educație vizuală", "Arte vizuale și abilități practice", "Desen", "Istoria artei", "Educație tehnologică",
        "Educație tehnologică și aplicații practice", "Educație socială", "Gândire critică și drepturile copilului", "Educație interculturală", "Educație pentru cetățenie democratică",
        "Educație economico-financiară", "Logică", "Logică, argumentare și comunicare", "Psihologie", "Economie", "Filosofie", "Sociologie", "Educație antreprenorială",
        "Economie aplicată", "Studii sociale", "Dirigenție", "Consiliere și dezvoltare personală", "Consiliere și orientare", "Istoria evreilor. Holocaustul",
        "Istoria și tradițiile minorității maghiare", "Istoria minorităților", "Literatura universală", "Matematică aplicată", "Laborator tehnologic", "Instruire practică",
        "Pregătire practică", "Pregătire teoretică de specialitate", "Modul", "Stagiu de pregătire practică", "Educație pentru sănătate", "Educație ecologică",
        "Anatomie", "Fiziologie", "Ecologie", "Astronomie", "Teatru", "Dans", "Pian", "Canto", "Instrument", "Teoria muzicii", "Armonie", "Studiul formelor", "Atelier artistic",
        "Teologie", "Muzică bisericească", "Educație civică", "Cultură civică", "Istoria românilor", "Opțional"
    ];
    const KNOWN_FOLDED = KNOWN_SUBJECTS.map(fold);
    /** Grupuri de nume care înseamnă aceeași materie (ca să nu apară de două ori). */
    const SUBJECT_ALIASES = [
        ["educatie fizica", "educatie fizica si sport", "sport"],
        ["limba romana", "limba si literatura romana", "romana", "comunicare in limba romana"],
        ["tic", "tehnologia informatiei si a comunicatiilor", "informatica si tic"],
        ["educatie muzicala", "muzica", "muzica si miscare"],
        ["educatie plastica", "educatie artistica", "educatie vizuala", "desen"],
        ["logica", "logica argumentare si comunicare"],
        ["dirigentie", "consiliere si dezvoltare personala", "consiliere si orientare"],
        ["matematica", "mate"], ["limba engleza", "engleza"], ["limba franceza", "franceza"], ["limba germana", "germana"]
    ];
    function subjectKey(name) {
        const f = fold(name).replace(/^optional\s+/, "optional ");
        const group = SUBJECT_ALIASES.find(g => g.includes(f));
        return group ? group[0] : f;
    }
    function isKnownSubject(name, extra) {
        const f = fold(name);
        if (/^optional\b/.test(f)) return true;
        const known = extra ? KNOWN_FOLDED.concat(extra.map(fold)) : KNOWN_FOLDED;
        return known.some(k => f === k || (k.length >= 5 && f.startsWith(k + " ")));
    }

    /** O materie nouă e realistă? Întoarce motivul (în română) sau null. */
    function subjectProblem(name, existing, opts) {
        const o = opts || {};
        const clean = cleanText(name, LIMITS.subjectName);
        if (clean.length < 2) return "Scrie numele materiei.";
        if (RESERVED_NAMES.has(clean)) return "Numele nu pare al unei materii.";
        if (EMOJI_RE.test(clean)) return "Numele materiei nu poate avea emoji.";
        if (!/\p{L}{2}/u.test(clean)) return "Numele materiei trebuie să aibă litere.";
        if (looksLikeJunk(clean.replace(/^Op[tț]ional\s*[-–:]\s*/iu, ""))) return "Numele nu pare al unei materii.";
        const list = existing || [];
        if (list.length >= LIMITS.subjects) return `Ai deja ${list.length} materii; atâtea nu are nicio clasă.`;
        const key = subjectKey(clean);
        const twin = list.find(n => subjectKey(n) === key);
        if (twin) return `${twin} e deja în catalog.`;
        if (!o.allowUnknown && !isKnownSubject(clean, o.extra)) return "Materia nu există în programa școlară. Dacă e un opțional, adaug-o ca „Opțional – …”.";
        return null;
    }

    const isWeekend = date => { const [y, m, d] = String(date).split("-").map(Number); const wd = new Date(y, m - 1, d).getDay(); return wd === 0 || wd === 6; };
    const inModules = (date, modules) => (modules || []).some(m => date >= m.start && date <= m.end);
    const inSchoolYear = (date, modules) => Boolean(modules && modules.length) && date >= modules[0].start && date <= modules[modules.length - 1].end;

    /**
     * Un eveniment nou (sau mutat) pe ziua `date` e realist? `dayEvents` = ce e deja în ziua aceea (fără el).
     * Întoarce motivul sau null.
     */
    function eventProblem(ev, date, dayEvents, opts) {
        const o = opts || {};
        const type = ev.type;
        const title = cleanText(ev.title, LIMITS.eventTitle);
        if (NEEDS_SUBJECT.includes(type) && !ev.subject) return `Alege materia: un ${String(type).toLowerCase()} e mereu la o materie.`;
        if (title && looksLikeJunk(title) && !ev.subject) return "Titlul nu pare real. Scrie ce ai, de exemplu „Test la mate”.";
        if (o.modules && SCHOOL_DAY_ONLY.includes(type)) {
            if (isWeekend(date)) return "În weekend nu se dau teste.";
            if (o.modules.length && !inModules(date, o.modules)) return "Atunci e vacanță: nu se dau teste.";
        }
        if (o.modules && NEEDS_SUBJECT.includes(type) && o.modules.length && !inSchoolYear(date, o.modules) && date > o.modules[o.modules.length - 1].end) return "Data e după sfârșitul anului școlar.";
        const list = dayEvents || [];
        if (list.length >= LIMITS.perDayItems) return `Ai deja ${list.length} lucruri în ziua asta; mai mult de ${LIMITS.perDayItems} nu e realist.`;
        const evals = list.filter(e => EVALUATIONS.includes(e.type));
        if (EVALUATIONS.includes(type)) {
            if (evals.length >= LIMITS.perDayEvaluations) return `Într-o zi se dau cel mult ${LIMITS.perDayEvaluations} evaluări scrise.`;
            if (type === "Examen" && list.some(e => e.type === "Examen")) return "Se dă o singură teză pe zi.";
            const same = evals.find(e => e.subject && e.subject === ev.subject);
            if (same) return `Ai deja ${same.type === "Examen" ? "o teză" : "un test"} la ${ev.subject} în ziua asta.`;
        }
        const dup = list.find(e => e.type === type && (e.subject || "") === (ev.subject || "") && fold(cleanText(e.title)) === fold(title));
        if (dup) return "Există deja în ziua asta.";
        return null;
    }

    /** O notă nouă e realistă? `subjectGrades` = notele materiei, `dayCount` = câte note ai deja în ziua aceea (toate materiile). */
    function gradeProblem(grade, subjectGrades, dayCount, opts) {
        const o = opts || {};
        const v = Number(grade.val);
        if (!Number.isInteger(v) || v < 1 || v > 10) return "Nota e un număr întreg de la 1 la 10.";
        const list = subjectGrades || [];
        if (list.length >= LIMITS.gradesPerSubject) return `Ai deja ${list.length} note la materia asta; atâtea nu se pun într-un an.`;
        const date = grade.date;
        if (date) {
            if (o.today && date > o.today) return "Nota nu poate fi din viitor.";
            if (o.modules && o.modules.length) {
                if (isWeekend(date)) return "În weekend nu se pun note. Alege ziua în care ai primit-o.";
                if (!inModules(date, o.modules)) return "Atunci a fost vacanță. Alege ziua în care ai primit nota.";
            }
            if (list.filter(g => g.date === date).length >= LIMITS.gradesPerSubjectPerDay) return `Cel mult ${LIMITS.gradesPerSubjectPerDay} note pe zi la aceeași materie.`;
            if ((dayCount || 0) >= LIMITS.gradesPerDay) return `Ai deja ${dayCount} note în ziua asta; mai multe nu e realist.`;
        }
        return null;
    }

    return {
        roundValue, clampNumber, purtareSummary, emptyMetrics, computeMetrics,
        LIMITS, EVALUATIONS, NEEDS_SUBJECT, fold, cleanText, looksLikeJunk, isKnownSubject, subjectKey, subjectProblem, eventProblem, gradeProblem, isWeekend, inModules
    };
});
