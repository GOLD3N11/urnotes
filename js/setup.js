/* urNotes · Configurarea la prima pornire și programa.
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== CONFIGURARE LA PRIMA PORNIRE ==================== */
/*
 * Un asistent în 4 pași (profil → materii → ținte → orar) care apare când caietul e gol.
 * Materiile propuse urmează planurile-cadru (liceu: clasa a IX-a, OMEC nr. 4350/2025; gimnaziu: planul în vigoare).
 * Orele sunt orientative: școlile pot redistribui orele, iar elevul le poate corecta în pasul 2.
 */
const SETUP_DONE_KEY = "pro_setup_done_v4";
const SETUP_STEPS = ["Profil", "Materii", "Ținte", "Orar"];
/*
 * Materiile propuse urmează planurile-cadru oficiale, după profil ȘI clasă (verificate în octombrie 2026):
 *   – clasa a IX-a: planul-cadru nou, OMEC 4350/2025 (modificat prin OMEC 4152/2026; intensiv informatică: OMEC 6873/2025),
 *     aplicat din 2026–2027 doar la a IX-a;
 *   – clasele X–XII: planurile din 2009 (OMECI 3410/2009, filiera teoretică și vocațională; pedagogic OMECTS 5347/2011;
 *     tehnologic OMECTS 3081/2010 și OMECI 3412/2009), cu anexa pentru XI–XII înlocuită prin OME 3667/2023 și OME 7723/2024
 *     (Istoria evreilor. Holocaustul în a XI-a, Istoria comunismului din România în a XII-a);
 *   – gimnaziul: OMENCS 3590/2016, anexa 2.
 * La vocațional și tehnologic, împărțirea orelor de specialitate pe discipline diferă între școli: e orientativă.
 * Orele de CDȘ / opționale nu apar (le alege fiecare școală). Totul se poate corecta în pasul 2.
 */
const LICEU = [9, 10, 11, 12];
const ROMAN = { 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "XI", 12: "XII" };
const LM2 = ["Limba franceză", { hint: "limba modernă 2" }];
const MAX_ORE = 7; // cea mai mare normă dintr-un plan-cadru (Informatică, intensiv, a XI-a)
const TARGET_CHOICES = [5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const LM2_CHOICES = ["Limba franceză", "Limba germană", "Limba spaniolă", "Limba italiană", "Limba rusă", "Limba portugheză"];
/* Dirigenția: în gimnaziu și în noua clasă a IX-a apare în planul-cadru sub alt nume; la celelalte clase o adăugăm noi. */
const DIRIG = "Dirigenție";
const DIRIG_ALIASES = ["Consiliere și dezvoltare personală", "Dezvoltare personală și consiliere pentru carieră"];
/* Opționalul (curriculum la decizia școlii): un singur loc, căruia elevul îi scrie doar tema. */
const OPT = "Opțional";
const isOptionalName = name => name === OPT || String(name).startsWith(`${OPT} · `);
const optionalTopic = name => isOptionalName(name) && name !== OPT ? name.slice(OPT.length + 3) : "";
const optionalName = topic => {
    const t = cleanName(topic, 40);
    return t ? `${OPT} · ${t}` : OPT;
};

/**
 * Pornește de la o listă de bază [nume, ore], schimbă orele (`set`), scoate materii (`drop`)
 * și adaugă materiile de specialitate (`add`). Orele 0 din `set` scot materia.
 */
function plan(base, { set = {}, drop = [], add = [] } = {}) {
    const rows = base
        .filter(([name]) => !drop.includes(name))
        .map(([name, ore, opt]) => [name, name in set ? set[name] : ore, opt])
        .filter(([, ore]) => ore > 0);
    return [...rows, ...add].map(([name, ore, opt]) => opt ? [name, ore, opt] : [name, ore]);
}
const withLm2 = (rows, ore) => rows.map(r => r[0] === LM2[0] ? [r[0], ore ?? r[1], LM2[1]] : r);

/* ---------- Clasa a IX-a: planul-cadru nou (OMEC 4350/2025, modificat prin OMEC 4152/2026), din 2026–2027 ---------- */
// Trunchiul comun, la fel pentru toate profilurile (19 ore); orele de „curriculum de specialitate” se adaugă peste el.
const TC_IX = [
    ["Limba și literatura română", 3], ["Limba engleză", 2], [LM2[0], 1],
    ["Matematică", 2], ["Fizică", 1], ["Chimie", 1], ["Biologie", 1],
    ["Istorie", 1], ["Geografie", 1], ["Logică", 1], ["Religie", 1],
    ["Educație artistică", 1, { hint: "educație muzicală și vizuală, câte o jumătate de oră" }],
    ["Educație fizică și sport", 1], ["TIC", 1], ["Dezvoltare personală și consiliere pentru carieră", 1]
];
const ix = opts => withLm2(plan(TC_IX, opts));

/* ---------- Clasele X–XII: planurile din 2009 (OMECI 3410/2009), cu modificările din 2023 și 2024 ---------- */
// Clasa a X-a (ciclul inferior al liceului, anexa 1 — neschimbată din 2009). Profilul real și cel umanist au câte un tabel comun.
const X_REAL = [
    ["Limba și literatura română", 3], ["Limba engleză", 2], [LM2[0], 2],
    ["Matematică", 4], ["Fizică", 3], ["Chimie", 2], ["Biologie", 2], ["Informatică", 1],
    ["Istorie", 1], ["Geografie", 1], ["Psihologie", 1], ["Religie", 1],
    ["Educație artistică", 1, { hint: "muzică și arte vizuale, alternativ" }], ["Educație fizică", 2], ["TIC", 1], ["Educație antreprenorială", 1]
];
const X_UMAN = [
    ["Limba și literatura română", 4], ["Limba engleză", 3], [LM2[0], 2], ["Limba latină", 1],
    ["Matematică", 2], ["Fizică", 2], ["Chimie", 1], ["Biologie", 1],
    ["Istorie", 3], ["Geografie", 2], ["Psihologie", 2], ["Religie", 1],
    ["Educație artistică", 1, { hint: "muzică și arte vizuale, alternativ" }], ["Educație fizică", 1], ["TIC", 1], ["Educație antreprenorială", 1]
];
// Trunchiul comun vocațional în a X-a (19 ore), peste care vin disciplinele artistice / sportive / teologice.
const X_VOC = [
    ["Limba și literatura română", 3], ["Limba engleză", 2], [LM2[0], 1],
    ["Matematică", 2], ["Fizică", 2], ["Chimie", 1], ["Biologie", 1],
    ["Istorie", 1], ["Geografie", 1], ["Psihologie", 1], ["Religie", 1],
    ["Educație fizică", 1], ["TIC", 1], ["Educație antreprenorială", 1]
];
// Clasele XI–XII (ciclul superior, anexa 2 înlocuită prin OME 3667/2023 și OME 7723/2024):
// în a XI-a „Istoria evreilor. Holocaustul”, în a XII-a „Istoria comunismului din România” — câte o oră, obligatorii.
const XI_XII_ISTORIE = cls => cls === 11 ? ["Istoria evreilor. Holocaustul", 1] : ["Istoria comunismului din România", 1];
const SOCIO_SUP = cls => cls === 11 ? "Economie" : "Filosofie";
const SUP_COMMON = cls => [
    ["Limba și literatura română", 3], ["Limba engleză", 2], [LM2[0], 2],
    ["Istorie", 1], XI_XII_ISTORIE(cls), ["Geografie", 1], [SOCIO_SUP(cls), 1], ["Religie", 1]
];
const sup = (cls, opts) => withLm2(plan(SUP_COMMON(cls), opts));

/* ---------- Clasele X–XII, filiera tehnologică (OMECTS 3081/2010; OMECI 3412/2009 cu OME 3664/2023 și 7724/2024) ---------- */
function tehnologicSup(cls, kind) {
    const servicii = kind === "servicii";
    const resurse = kind === "resurse";
    return withLm2([
        ["Limba și literatura română", 3], ["Limba engleză", 2], [LM2[0], 2],
        ["Matematică", 3],
        ...(servicii ? [] : resurse
            ? [["Chimie", cls === 11 ? 2 : 1], ["Biologie", cls === 11 ? 1 : 2]]
            : [["Fizică", 2], ["Chimie", 1]]),
        ["Istorie", servicii && cls === 11 ? 2 : 1], XI_XII_ISTORIE(cls), ["Geografie", servicii && cls === 12 ? 2 : 1],
        [cls === 11 ? "Economie" : "Economie aplicată", servicii ? 2 : 1], ["Religie", 1], ["Educație fizică", 1], ["TIC", 1],
        ["Cultură de specialitate", 6, { hint: "modulele calificării tale, la un loc" }],
        ["Pregătire practică", servicii && cls === 11 ? 6 : 5, { hint: "plus stagiile de practică de la sfârșitul anului" }]
    ]);
}
const TEHNOLOGIC_IX = [
    ["Pregătire teoretică de specialitate", 4, { hint: "modulele calificării tale, la un loc" }],
    ["Laborator tehnologic și instruire practică", 6, { hint: "plus 5 săptămâni de stagiu de practică pe an" }]
];
const TEHNOLOGIC_X = kind => withLm2(plan(X_VOC, {
    set: { "Matematică": kind === "servicii" ? 2 : 3, "Fizică": kind === "servicii" ? 1 : 2, [LM2[0]]: 2 },
    add: [
        ["Pregătire de specialitate", 6, { hint: "modulele calificării tale, la un loc" }],
        ["Instruire practică", 5, { hint: "plus 3 săptămâni de stagiu de practică pe an" }]
    ]
}));

const SETUP_GROUPS = [
    { id: "teoretic", label: "Liceu teoretic" },
    { id: "vocational", label: "Liceu vocațional" },
    { id: "tehnologic", label: "Liceu tehnologic" },
    { id: "alte", label: "Gimnaziu și altele" }
];

const SETUP_PROFILES = {
    "mate-info": {
        group: "teoretic", label: "Matematică-informatică", hint: "profil real", classes: LICEU,
        variantLabel: "Tipul clasei",
        variants: [{ id: "normal", label: "Normală" }, { id: "intensiv", label: "Intensiv informatică" }],
        subjects: ({ cls, variant }) => {
            const intensiv = variant?.id === "intensiv";
            if (cls === 9) return ix({ set: { "Matematică": 4, "Fizică": 3, "Chimie": 2 }, add: [["Informatică", intensiv ? 4 : 2]] });
            if (cls === 10) return withLm2(plan(X_REAL, { set: { "Informatică": intensiv ? 4 : 1 } }));
            return sup(cls, { add: [["Matematică", 4], ["Fizică", 3], ["Chimie", 1], ["Biologie", 1], ["Informatică", intensiv ? 7 : 4], ["Educație fizică", 1]] });
        }
    },
    "stiinte": {
        group: "teoretic", label: "Științe ale naturii", hint: "profil real", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({ set: { "Matematică": 3, "Fizică": 3, "Chimie": 3, "Biologie": 3 }, add: [["Informatică", 1]] });
            if (cls === 10) return withLm2(plan(X_REAL));
            return sup(cls, { add: [["Matematică", 3], ["Fizică", 3], ["Chimie", 2], ["Biologie", 2], ["TIC", cls === 11 ? 2 : 1], ["Educație fizică", 1]] });
        }
    },
    "filologie": {
        group: "teoretic", label: "Filologie", hint: "profil umanist", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({ set: { "Limba și literatura română": 5, "Limba engleză": 3, [LM2[0]]: 2, "Istorie": 2, "Geografie": 2, "Logică": 2 }, add: [["Limba latină", 1]] });
            if (cls === 10) return withLm2(plan(X_UMAN));
            return sup(cls, {
                set: { "Limba și literatura română": 4, "Limba engleză": 3, [LM2[0]]: 3, "Istorie": 2, [SOCIO_SUP(cls)]: cls === 12 ? 2 : 1 },
                add: [["Limba latină", cls === 11 ? 2 : 1], ["Literatură universală", 1], ["Științe", 1], ...(cls === 11 ? [["Sociologie", 1]] : []),
                    ["TIC", 1], ["Educație artistică", 1], ["Educație fizică", 1]]
            });
        }
    },
    "sociale": {
        group: "teoretic", label: "Științe sociale", hint: "profil umanist", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({ set: { "Limba și literatura română": 4, "Limba engleză": 3, [LM2[0]]: 2, "Istorie": 2, "Geografie": 2, "Logică": 2 }, add: [["Limba latină", 1]] });
            if (cls === 10) return withLm2(plan(X_UMAN));
            return sup(cls, {
                set: { "Istorie": 3, "Geografie": 2, [SOCIO_SUP(cls)]: cls === 11 ? 2 : 3 },
                add: [["Matematică", 2], ...(cls === 11 ? [["Sociologie", 2]] : [["Studii sociale", 1, { hint: "disciplina socio-umană a școlii" }]]),
                    ["TIC", cls === 11 ? 2 : 1], ["Educație artistică", 1], ["Educație fizică", 1]]
            });
        }
    },
    "arte-vizuale": {
        group: "vocational", label: "Arte vizuale", hint: "arte plastice, decorative, arhitectură, design", classes: LICEU,
        variantLabel: "Specializarea",
        variants: [
            { id: "plastice", label: "Arte plastice" },
            { id: "decorative", label: "Arte decorative" },
            { id: "arhitectura", label: "Arhitectură" },
            { id: "design", label: "Design" }
        ],
        subjects: ({ cls, variant }) => {
            const id = variant?.id || "plastice";
            const atelier = { plastice: "Atelier de specialitate", decorative: "Atelier de arte decorative", arhitectura: "Atelier de arhitectură", design: "Atelier de design" }[id];
            // În a IX-a, toate specializările de arte vizuale au aceleași discipline (OMEC 4350/2025, anexa 12).
            if (cls === 9) return ix({
                drop: ["Educație artistică"],
                add: [["Educație muzicală", 1], [atelier, 2], ["Studiul formelor în desen", 2], ["Studiul formelor în culoare", 2], ["Studiul formelor în volum", 2],
                    ["Crochiuri", 1], ["Istoria artelor și a arhitecturii", 1]]
            });
            const arhi = id === "arhitectura" || id === "design"; // în X–XII, design-ul e în tabelul „arhitectură, arte ambientale și design”
            if (cls === 10) return withLm2(plan(X_VOC, {
                add: [["Educație muzicală", 1], ["Studiul formelor în desen", 2], [arhi ? "Geometrie descriptivă și perspectivă" : "Studiul formelor în culoare și studiul culorii", 2],
                    ["Studiul formelor în volum", 2], [atelier, 2], [arhi ? "Istoria artelor și a arhitecturii" : "Istoria artelor", 1]]
            }));
            return sup(cls, {
                add: arhi
                    ? [["Matematică", 2], ["Desen", 3], ["Geometrie descriptivă și perspectivă", 2], [atelier, 4], ["Istoria artelor și a arhitecturii", 2],
                        ["Procesarea computerizată a imaginii", 2], ["Educație fizică", 1]]
                    : [["Studiul formelor în desen", 3], ["Crochiuri", 1], [atelier, 4], ["Studiul corpului și al figurii umane", 3], ["Istoria artelor", 2],
                        ["Procesarea computerizată a imaginii", 2], ["Educație fizică", 1]]
            });
        }
    },
    "muzica": {
        group: "vocational", label: "Muzică", hint: "instrument, canto, teorie", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({
                drop: ["Educație artistică"],
                add: [["Instrument principal", 3, { hint: "sau canto, după secție" }], ["Ansamblu", 3, { hint: "coral, orchestral sau cameral" }], ["Teorie-solfegiu-dicteu", 3],
                    ["Istoria muzicii", 1], ["Pian complementar", 1], ["Armonie", 1]]
            });
            if (cls === 10) return withLm2(plan(X_VOC, {
                add: [["Educație vizuală", 1], ["Instrument principal", 3, { hint: "sau canto, după secție" }], ["Teorie-solfegiu-dicteu", 2], ["Ansamblu", 2, { hint: "coral, orchestral sau cameral" }],
                    ["Armonie", 1], ["Istoria muzicii", 1], ["Pian complementar", 1]]
            }));
            return sup(cls, {
                add: [["Instrument principal", 4, { hint: "sau canto, după secție" }], ["Teorie-solfegiu-dicteu", 2], ["Armonie", 2], ["Istoria muzicii", 2],
                    ["Ansamblu", 2, { hint: "coral, orchestral sau cameral" }], ["Forme muzicale", 1], ["Pian complementar", 1], ["Educație fizică", 1], ["TIC", 1]]
            });
        }
    },
    "coregrafie": {
        group: "vocational", label: "Coregrafie", hint: "dans clasic și contemporan", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({
                drop: ["Educație artistică", "Educație fizică și sport"],
                add: [["Dans clasic", 8], ["Dans contemporan", 1], ["Dans de caracter", 1], ["Dans românesc", 1], ["Repertoriu individual", 1], ["Repertoriu de ansamblu", 1],
                    ["Istoria baletului", 1], ["Educație muzicală", 1], ["Laborator de creație", 1]]
            });
            if (cls === 10) return withLm2(plan(X_VOC, {
                drop: ["Educație fizică"],
                add: [["Educație muzicală", 1], ["Educație vizuală", 1], ["Dans clasic", 7], ["Dans contemporan", 2], ["Dans de caracter", 2], ["Dans românesc", 1], ["Istoria baletului", 1]]
            }));
            return sup(cls, {
                add: [["Biologie", 1], ["Educație muzicală", 1], ["Dans clasic", 8], ["Dans contemporan", 2], ["Dans de caracter", 2], ["Dans românesc", 1],
                    ["Repertoriu", cls === 11 ? 1 : 2], ["Istoria baletului", 1], ...(cls === 11 ? [["TIC", 1]] : [])]
            });
        }
    },
    "teatru": {
        group: "vocational", label: "Arta actorului", hint: "teatru", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({
                drop: ["Educație artistică"],
                add: [["Arta actorului", 4], ["Mișcare scenică", 2], ["Dicție și vorbire scenică", 1], ["Istoria teatrului", 1], ["Artele spectacolului", 1],
                    ["Educație muzicală", 1], ["Educație vizuală", 1]]
            });
            if (cls === 10) return withLm2(plan(X_VOC, {
                add: [["Educație muzicală", 1], ["Educație vizuală", 1], ["Arta actorului", 4], ["Mișcare scenică", 2], ["Dicție și vorbire scenică", 1], ["Istoria teatrului", 1]]
            }));
            return sup(cls, {
                add: [["Arta actorului", 5], ["Mișcare scenică", 2], ["Dicție și vorbire scenică", 1], ["Istoria teatrului", 1], ["Artele spectacolului", 1],
                    ["Educație muzicală", 1], ["Educație fizică", 2], ["TIC", 1]]
            });
        }
    },
    "sportiv": {
        group: "vocational", label: "Sportiv", hint: "instructor sportiv", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({ drop: ["Educație fizică și sport"], add: [["Pregătire sportivă teoretică", 2], ["Pregătire sportivă practică", 12]] });
            if (cls === 10) return withLm2(plan(X_VOC, {
                drop: ["Educație fizică"],
                add: [["Educație muzicală", 1], ["Educație vizuală", 1], ["Pregătire sportivă teoretică", 2], ["Pregătire sportivă practică", 10]]
            }));
            return sup(cls, { add: [["Matematică", 1], ["Biologie", 1], ["Educație muzicală", 1], ["Pregătire sportivă teoretică", 2], ["Pregătire sportivă practică", 14]] });
        }
    },
    "pedagogic": {
        group: "vocational", label: "Pedagogic", hint: "învățător-educatoare", classes: LICEU,
        subjects: ({ cls }) => {
            if (cls === 9) return ix({ set: { "Limba și literatura română": 5 }, add: [["Pedagogie", 2], ["Practică pedagogică", 3], ["Managementul emoțiilor", 1]] });
            if (cls === 10) return withLm2(plan(X_VOC, {
                set: { "Limba și literatura română": 4, [LM2[0]]: 2, "Fizică": 1, "TIC": 2 },
                add: [["Psihologie generală", 2], ["Teoria și practica instruirii și evaluării", 1], ["Educație muzicală", 1], ["Educație vizuală", 1],
                    ["Pregătire practică de specialitate", 3]]
            }));
            if (cls === 11) return withLm2([
                ["Limba și literatura română", 4], ["Metodica predării limbii române", 1], ["Limba engleză", 2], [LM2[0], 1],
                ["Matematică", 1], ["Aritmetică", 1], ["Metodica predării matematicii", 1], ["Științe ale naturii", 1], ["Metodica predării științelor", 1],
                ["Istorie", 1], XI_XII_ISTORIE(11), ["Geografie", 1], ["Metodica predării istoriei și geografiei", 1], ["Economie", 1], ["Religie", 1],
                ["Managementul clasei de elevi", 1], ["Psihologia vârstelor", 1], ["Practică pedagogică", 4],
                ["Educație muzicală și plastică", 1], ["Metodica educației muzicale și plastice", 1], ["Educație fizică", 1], ["Metodica educației fizice", 1], ["TIC", 1]
            ]);
            return withLm2([
                ["Limba și literatura română", 4], ["Limba engleză", 2], [LM2[0], 2],
                ["Matematică", 1], ["Aritmetică", 1], ["Științe", 2], ["Istorie", 1], XI_XII_ISTORIE(12), ["Geografie", 1], ["Filosofie", 1], ["Religie", 1],
                ["Psihopedagogie specială", 1], ["Psihologia educației", 1], ["Didactici inovative", 1], ["Practică pedagogică", 4],
                ["Educație muzicală și plastică", 2], ["Educație fizică", 1], ["TIC", 1]
            ]);
        }
    },
    "teologic": {
        group: "vocational", label: "Teologic", hint: "teologie ortodoxă", classes: LICEU,
        subjects: ({ cls }) => {
            // Ora de religie din trunchiul comun devine disciplină teologică.
            if (cls === 9) return ix({
                drop: ["Religie"],
                add: [["Studiul Sfintei Scripturi", 2], ["Învățătura de credință ortodoxă", 1], ["Liturgică și teologie practică", 3], ["Muzică bisericească", 3],
                    ["Spiritualitate și formare duhovnicească", 1], ["Limba latină", 1], ["Limba greacă", 1]]
            });
            if (cls === 10) return withLm2(plan(X_VOC, {
                drop: ["Religie"], set: { "Limba și literatura română": 4 },
                add: [["Studiul Sfintei Scripturi", 2], ["Liturgică", 2], ["Muzică bisericească", 2], ["Învățătura de credință ortodoxă", 1],
                    ["Limba latină", 1], ["Limba greacă", 1], ["Educație muzicală", 1], ["Educație vizuală", 1]]
            }));
            return sup(cls, {
                drop: ["Religie"],
                add: [["Studiul Sfintei Scripturi", 2], ["Învățătura de credință ortodoxă", 2], ["Liturgică", 2], ["Muzică bisericească", 3], ["Istoria bisericii", 2],
                    ["Morală și spiritualitate ortodoxă", 1], ["Pastorală", 1], ["Limba latină", 1], ["Limba greacă", 1],
                    ["Educație artistică", 1], ["Educație muzicală", 1], ["Educație fizică", 1], ["TIC", 1]]
            });
        }
    },
    "tehnic": {
        group: "tehnologic", label: "Tehnic", hint: "electronică, mecanică, construcții…", classes: LICEU,
        subjects: ({ cls }) => cls === 9 ? ix({ add: TEHNOLOGIC_IX }) : cls === 10 ? TEHNOLOGIC_X("tehnic") : tehnologicSup(cls, "tehnic")
    },
    "servicii": {
        group: "tehnologic", label: "Servicii", hint: "economic, turism, comerț…", classes: LICEU,
        subjects: ({ cls }) => cls === 9 ? ix({ add: TEHNOLOGIC_IX }) : cls === 10 ? TEHNOLOGIC_X("servicii") : tehnologicSup(cls, "servicii")
    },
    "resurse": {
        group: "tehnologic", label: "Resurse naturale și protecția mediului", hint: "agricultură, alimentație, ecologie…", classes: LICEU,
        subjects: ({ cls }) => cls === 9 ? ix({ add: TEHNOLOGIC_IX }) : cls === 10 ? TEHNOLOGIC_X("resurse") : tehnologicSup(cls, "resurse")
    },
    "gimnaziu": {
        // OMENCS 3590/2016, anexa 2 (cu modificările din 2018 și 2019), în vigoare și în 2026–2027
        group: "alte", label: "Gimnaziu", hint: "clasele V–VIII", classes: [5, 6, 7, 8],
        subjects: ({ cls }) => withLm2([
            ["Limba și literatura română", 4], ["Limba engleză", 2], [LM2[0], 2],
            ...(cls === 7 ? [["Elemente de limbă latină și de cultură romanică", 1]] : []),
            ["Matematică", 4], ...(cls >= 6 ? [["Fizică", 2]] : []), ...(cls >= 7 ? [["Chimie", 2]] : []),
            ["Biologie", cls === 6 || cls === 7 ? 2 : 1],
            ["Educație socială", 1, { hint: { 5: "gândire critică și drepturile copilului", 6: "educație interculturală", 7: "educație pentru cetățenie democratică", 8: "educație economico-financiară" }[cls] }],
            ["Istorie", cls === 5 || cls === 8 ? 2 : 1], ["Geografie", cls === 8 ? 2 : 1], ["Religie", 1],
            ["Educație plastică", 1], ["Educație muzicală", 1], ["Educație fizică și sport", 2],
            ["Educație tehnologică și aplicații practice", 1], ["Informatică și TIC", 1], ["Consiliere și dezvoltare personală", 1]
        ])
    }
};

/** Ce plan stă la baza propunerii, spus pe scurt sub alegerea clasei. */
function setupPlanNote(profile, cls) {
    if (profile === "gimnaziu") return "După planul-cadru pentru gimnaziu din 2016 (OMENCS 3590/2016), încă în vigoare.";
    const group = SETUP_PROFILES[profile]?.group;
    const special = group === "vocational" || group === "tehnologic"
        ? " Orele disciplinelor de specialitate diferă de la o școală la alta: verifică-le cu orarul tău."
        : "";
    return cls === 9
        ? `Clasa a IX-a are planul-cadru nou (OMEC 4350/2025), aplicat din 2026–2027: 19 ore comune pentru toate profilurile, plus cele ale profilului tău.${special}`
        : `Clasa a ${ROMAN[cls]}-a rămâne pe planul-cadru din 2009 (OMECI 3410/2009${group === "tehnologic" ? ", 3081/2010 și 3412/2009" : ""}), cu modificările din 2023 și 2024${cls >= 11 ? (cls === 11 ? " (ora de Istoria evreilor. Holocaustul)" : " (ora de Istoria comunismului din România)") : ""}.${special}`;
}

function setupDone() {
    try { return localStorage.getItem(SETUP_DONE_KEY) === "1"; } catch (_) { return true; }
}

function markSetupDone() {
    try { localStorage.setItem(SETUP_DONE_KEY, "1"); } catch (_) { /* fără stocare: nu insistăm */ }
}

/** Asistentul apare singur doar când caietul e complet gol și nu a fost închis înainte. */
function shouldOfferSetup() {
    if (!canEdit()) return false;
    return !setupDone() && Object.keys(state.subjects).length === 0 && Object.keys(state.calendar).length === 0;
}

function openSetup(step = 0) {
    if (!requireAccount()) return;
    const s = state.settings;
    ui.setup = {
        step,
        profile: "",
        cls: 9,
        variant: "",
        lm2: s.school.lm2,
        county: s.school.county,
        rows: [],
        target: s.goals.targetGPA,
        risk: s.calc.riskThreshold,
        method: Object.keys(state.subjects).length ? s.calc.method : "arithmetic",
        // Datele de module modificate de mână rămân neatinse dacă elevul nu alege altă structură.
        preset: matchingModulePreset(s.modules) === "custom" ? "keep" : matchingModulePreset(s.modules),
        returnFocus: document.activeElement
    };
    // Programa aleasă înainte rămâne selectată (de ex. când elevul trece în clasa următoare)
    const mine = myProgramme();
    if (mine) {
        Object.assign(ui.setup, { profile: mine.profile, cls: mine.cls || ui.setup.cls, variant: mine.variant });
        ui.setup.rows = setupRowsFor(mine.profile, ui.setup.cls, mine.variant, ui.setup.lm2);
    }
    closeQuickAdd({ restoreFocus: false });
    closeMoreMenu({ restoreFocus: false });
    closeNotifPanel({ restoreFocus: false });
    closeActionModal();
    $("setup").hidden = false;
    document.body.classList.add("modal-open");
    renderSetup();
}

function closeSetup() {
    $("setup").hidden = true;
    if ($("action-modal").hidden) document.body.classList.remove("modal-open");
    const back = ui.setup?.returnFocus;
    ui.setup = null;
    if (back && document.contains(back) && back !== document.body) back.focus();
}

/** Materiile din programa unui profil și a unei clase: [{ name, ore, hint, kind }] (kind: subject | lm2 | dirig | opt). */
function programmeRows(profile, cls, variantId, lm2 = LM2_CHOICES[0]) {
    const p = SETUP_PROFILES[profile];
    if (!p) return [];
    const variant = p.variants ? (p.variants.find(v => v.id === variantId) || p.variants[0]) : null;
    const rows = p.subjects({ cls, variant }).map(([name, ore, opt = {}]) => {
        if (DIRIG_ALIASES.includes(name)) return { name: DIRIG, ore, hint: `în planul-cadru: ${name}`, kind: "dirig", off: false };
        if (name === LM2[0]) return { name: lm2, ore, hint: "limba modernă 2: alege-o pe a ta", kind: "lm2", off: Boolean(opt.off) };
        return { name, ore, hint: opt.hint || "", kind: "subject", off: Boolean(opt.off) };
    });
    if (!rows.some(r => r.kind === "dirig")) rows.push({ name: DIRIG, ore: 1, hint: cls >= 9 ? "ora de dirigenție (de obicei fără note, nu intră în medie)" : "ora de dirigenție", kind: "dirig", off: false });
    rows.push({ name: OPT, ore: 1, hint: "maximum un opțional: scrie ce faci la ora la decizia școlii", kind: "opt", off: true });
    return rows;
}

function setupRowsFor(profile, cls, variantId, lm2) {
    return programmeRows(profile, cls, variantId, lm2).map(r => {
        const existing = r.kind === "opt" ? Object.keys(state.subjects).find(isOptionalName) : findSubjectName(r.name);
        // Doar ce e cu adevărat la alegere se poate debifa: religia (se poate renunța la ea) și opționalul.
        const choice = r.kind === "opt" || r.name === "Religie" || r.off;
        return { ...r, on: !r.off, choice, topic: "", exists: Boolean(existing), shown: existing || r.name };
    });
}

/** Programa salvată a elevului, sau null dacă nu și-a ales-o încă (ex. date vechi sau un backup importat). */
function myProgramme() {
    const sc = state.settings.school;
    return sc.profile && SETUP_PROFILES[sc.profile] ? sc : null;
}
function myProgrammeRows() {
    const sc = myProgramme();
    return sc ? programmeRows(sc.profile, sc.cls, sc.variant, sc.lm2) : [];
}
function programmeLabel() {
    const sc = myProgramme();
    if (!sc) return "";
    const p = SETUP_PROFILES[sc.profile];
    const variant = p.variants?.find(v => v.id === sc.variant);
    return [p.label, variant && variant.id !== p.variants[0].id ? variant.label : "", p.classes ? `clasa a ${ROMAN[sc.cls]}-a` : ""].filter(Boolean).join(" · ");
}
/** O materie e în programă? Fără programă aleasă nu judecăm (nu marcăm nimic). */
const firstOptional = () => Object.keys(state.subjects).find(isOptionalName) || null;
function inProgramme(name) {
    if (isOptionalName(name)) return !myProgramme() || firstOptional() === name; // maximum un opțional: al doilea iese din programă
    if (!myProgramme()) return true;
    const low = String(name).toLocaleLowerCase("ro");
    return myProgrammeRows().some(r => r.name.toLocaleLowerCase("ro") === low)
        || DIRIG_ALIASES.some(a => a.toLocaleLowerCase("ro") === low);
}
/** Rândul din programă al unei materii (orele oficiale), sau null. */
function programmeRowFor(name) {
    const rows = myProgrammeRows();
    if (isOptionalName(name)) return firstOptional() === name ? rows.find(r => r.kind === "opt") || null : null;
    const low = String(name).toLocaleLowerCase("ro");
    return rows.find(r => r.name.toLocaleLowerCase("ro") === low)
        || (DIRIG_ALIASES.some(a => a.toLocaleLowerCase("ro") === low) ? rows.find(r => r.kind === "dirig") : null)
        || null;
}

/** Orele nu se scriu de mână: vin din planul-cadru. Și dirigenția din liceu rămâne mereu în afara mediei. */
function syncProgrammeHours() {
    const sc = myProgramme();
    if (!sc || guest.on) return;
    // ultima zi de cursuri a clasei (a XII-a și a VIII-a termină mai devreme), dacă modulele sunt cele oficiale
    const mods = state.settings.modules;
    const preset = matchingModulePreset(mods);
    const lastDay = presetModules(preset, sc.cls)[4].end;
    if (preset !== "custom" && mods[4].end !== lastDay) mods[4] = { ...mods[4], end: lastDay };
    for (const [mat, sub] of Object.entries(state.subjects)) {
        const row = programmeRowFor(mat);
        if (!row) continue;
        if (sub.ore !== row.ore) sub.ore = row.ore;
        if (row.kind === "dirig" && sc.cls >= 9 && !sub.excludeFromGPA) sub.excludeFromGPA = true;
    }
}

/** Ce mai poate adăuga: materiile din programă care lipsesc din catalog (+ opționalul, dacă nu-l are). */
function missingProgrammeRows() {
    const hasOpt = Object.keys(state.subjects).some(isOptionalName);
    return myProgrammeRows().filter(r => r.kind === "opt" ? !hasOpt : !findSubjectName(r.name) && !(r.kind === "dirig" && DIRIG_ALIASES.some(a => findSubjectName(a))));
}

/** Numele unei materii existente, fără să conteze literele mari/mici. */
function findSubjectName(name) {
    const low = String(name).trim().toLocaleLowerCase("ro");
    return Object.keys(state.subjects).find(m => m.toLocaleLowerCase("ro") === low) || null;
}

function renderSetup() {
    const st = ui.setup;
    if (!st) return;
    const steps = $("setup-steps");
    steps.innerHTML = SETUP_STEPS.map((label, i) => {
        const n = i + 1;
        const state_ = st.step === n ? "is-current" : st.step > n ? "is-done" : "";
        return `<li class="${state_}" ${st.step === n ? 'aria-current="step"' : ""}><span>${st.step > n ? icon("check") : n}</span>${label}</li>`;
    }).join("");
    steps.classList.toggle("is-hidden", st.step === 0);
    steps.setAttribute("aria-hidden", String(st.step === 0));
    const keep = st.renderedStep === st.step ? $("setup-body").scrollTop : 0;
    $("setup-body").innerHTML = [setupWelcomeHTML, setupProfileHTML, setupSubjectsHTML, setupTargetsHTML, setupTimetableHTML][st.step]();
    $("setup-foot").innerHTML = setupFootHTML();
    $("setup-body").scrollTop = keep;
    // Pas nou: de sus, cu focus pe titlu. Același pas (ex. ai ales un profil): rămâne unde erai.
    if (st.renderedStep !== st.step) {
        st.renderedStep = st.step;
        $("setup-body").scrollTop = 0;
        const focus = $("setup-body").querySelector("[data-autofocus]") || $("setup-body").querySelector("h2");
        focus?.focus({ preventScroll: true });
    }
}

function setupFootHTML() {
    const { step, profile } = ui.setup;
    if (step === 0) return "";
    const back = `<button type="button" class="btn btn-text" data-action="setup-back">${icon("undo")} Înapoi</button>`;
    if (step === 1) return `${back}<button type="button" class="btn btn-primary" data-action="setup-next" ${profile ? "" : "disabled"}>Continuă</button>`;
    if (step === 2 || step === 3) return `${back}<button type="button" class="btn btn-primary" data-action="setup-next">Continuă</button>`;
    return `${back}<span></span>`;
}

function setupWelcomeHTML() {
    const has = Object.keys(state.subjects).length > 0;
    return `
        <div class="setup-hero">
            <h2 id="setup-title" tabindex="-1">${has ? "Configurare rapidă" : "Bun venit în urNotes!"}</h2>
            <p>${has
                ? "Adaugă dintr-o dată materiile unui profil și stabilește ținta și anul școlar. Materiile și notele pe care le ai rămân neatinse."
                : "În patru pași scurți îți pregătesc materiile, ținta și anul școlar. Poți schimba orice mai târziu, din Catalog și Setări."}</p>
        </div>
        <div class="setup-me">
            <div class="setup-me-buddy" id="setup-buddy" aria-hidden="true">${setupBuddyHTML()}</div>
            <div class="setup-me-fields">
                <div class="form-group">
                    <label for="setup-me-name">Cum te cheamă?</label>
                    <input type="text" id="setup-me-name" class="glass-input" maxlength="40" autocomplete="given-name" placeholder="ex: Tudor" value="${escapeHTML(state.settings.profile.name)}">
                </div>
                <div class="form-group">
                    <label for="setup-me-buddy">Cum îl botezi pe colegul tău, post-it-ul?</label>
                    <input type="text" id="setup-me-buddy" class="glass-input" maxlength="20" autocomplete="off" placeholder="${DEFAULT_SETTINGS.profile.buddy}" value="${escapeHTML(state.settings.profile.buddy)}">
                </div>
            </div>
        </div>
        <div class="setup-choices">
            <button type="button" class="setup-choice" data-action="setup-next" data-autofocus>
                ${icon("sparkles")}<span><b>${has ? "Alege un profil" : "Încep de la zero"}</b><small>Aleg profilul, iar materiile se completează singure.</small></span>${icon("chevron", "setup-arrow")}
            </button>
            <button type="button" class="setup-choice" data-action="setup-import">
                ${icon("upload")}<span><b>Am deja un backup</b><small>Încarc fișierul .json exportat din această aplicație.</small></span>${icon("chevron", "setup-arrow")}
            </button>
        </div>`;
}

function setupBuddyHTML() {
    const who = firstName();
    return `${buddySVG("happy")}<p class="buddy-bubble is-sm"><b class="buddy-name">${escapeHTML(buddyName())}</b><span>${who ? `Încântat, ${escapeHTML(who)}!` : "Salut! Cum te cheamă?"}</span></p>`;
}

function setupProfileHTML() {
    const { profile } = ui.setup;
    return `
        <h2 id="setup-title" tabindex="-1">Ce profil ai?</h2>
        <p class="setup-lead">Îți propun materiile din planul-cadru. În pasul următor le poți bifa, redenumi și ajusta.</p>
        <div role="radiogroup" aria-labelledby="setup-title">
            ${SETUP_GROUPS.map(g => `
                <h3 class="setup-group" id="setup-g-${g.id}">${escapeHTML(g.label)}</h3>
                <div class="setup-profiles" role="group" aria-labelledby="setup-g-${g.id}">
                    ${Object.entries(SETUP_PROFILES).filter(([, p]) => p.group === g.id).map(([id, p]) => `
                        <button type="button" class="setup-profile" role="radio" aria-checked="${profile === id}" data-action="setup-profile" data-id="${id}">
                            <b>${escapeHTML(p.label)}</b><small>${escapeHTML(p.hint)}</small>
                        </button>`).join("")}
                </div>
                ${SETUP_PROFILES[profile]?.group === g.id ? setupProfileExtraHTML() : ""}`).join("")}
        </div>
`;
}

/** Sub profilul ales: clasa (gimnaziu) sau specializarea (ex. Arte vizuale), chiar în grupul lui. */
function setupProfileExtraHTML() {
    const { profile, cls, variant } = ui.setup;
    const p = SETUP_PROFILES[profile];
    if (!p || (!p.classes && !p.variants)) return "";
    const note = p.classes ? setupPlanNote(profile, cls) : "";
    return `
        <div class="setup-extra">
            ${p.classes ? `
                <div class="setup-field">
                    <span class="setup-label" id="setup-cls-label">În ce clasă ești?</span>
                    <div class="azi-seg setup-seg" role="group" aria-labelledby="setup-cls-label">
                        ${p.classes.map(c => `<button type="button" data-action="setup-class" data-cls="${c}" aria-pressed="${cls === c}">a ${ROMAN[c]}-a</button>`).join("")}
                    </div>
                </div>` : ""}
            ${p.variants ? `
                <div class="setup-field">
                    <span class="setup-label" id="setup-var-label">${escapeHTML(p.variantLabel || "Specializarea")}</span>
                    <div class="azi-seg setup-seg" role="group" aria-labelledby="setup-var-label">
                        ${p.variants.map(v => `<button type="button" data-action="setup-variant" data-variant="${v.id}" aria-pressed="${variant === v.id}">${escapeHTML(v.label)}</button>`).join("")}
                    </div>
                </div>` : ""}
            ${note ? `<p class="setup-note">${icon("info")} ${escapeHTML(note)}</p>` : ""}
        </div>`;
}

function setupSubjectsHTML() {
    const { rows } = ui.setup;
    const on = rows.filter(r => r.on && !r.exists);
    const hours = on.reduce((s, r) => s + r.ore, 0);
    return `
        <h2 id="setup-title" tabindex="-1">Materiile tale${SETUP_PROFILES[ui.setup.profile]?.classes ? ` · clasa a ${ROMAN[ui.setup.cls]}-a` : ""}</h2>
        <p class="setup-lead">Materiile și orele vin din planul-cadru al clasei tale. Alege-ți limba modernă 2, debifează religia dacă nu o faci și, dacă ai un opțional, scrie ce e.</p>
        <ul class="setup-rows">
            ${rows.map((r, i) => `
                <li class="setup-row ${r.on ? "" : "is-off"} ${r.exists ? "is-existing" : ""}" data-name="${escapeHTML(r.exists ? r.shown : r.name)}" data-kind="${r.kind}">
                    <input type="checkbox" class="setup-check" data-i="${i}" ${r.on ? "checked" : ""} ${r.exists || !r.choice ? "disabled" : ""} aria-label="${escapeHTML(r.choice ? `Include ${r.name}` : `${r.name} (obligatorie)`)}">
                    <span class="setup-name-cell">
                        ${r.exists ? `<b class="setup-name-text">${escapeHTML(r.shown)}</b>`
                            : r.kind === "lm2" ? `<select class="glass-select setup-lm2" data-i="${i}" aria-label="Limba modernă 2">${LM2_CHOICES.map(l => `<option ${l === r.name ? "selected" : ""}>${escapeHTML(l)}</option>`).join("")}</select>`
                            : r.kind === "opt" ? `<span class="setup-opt"><b class="setup-name-text">${OPT}</b><input type="text" class="glass-input setup-opt-topic" data-i="${i}" value="${escapeHTML(r.topic)}" maxlength="40" placeholder="ce opțional? (ex: Educație financiară)" aria-label="Tema opționalului"></span>`
                            : `<b class="setup-name-text">${escapeHTML(r.name)}</b>`}
                        ${r.hint && !r.exists ? `<small class="setup-row-hint">${escapeHTML(r.hint)}</small>` : ""}
                    </span>
                    ${r.exists ? `<span class="setup-exists">există deja</span>` : `<span class="setup-hours-fixed">${r.ore} ${r.ore === 1 ? "oră" : "ore"}</span>`}
                </li>`).join("")}
        </ul>
        <p class="setup-note">${icon("info")} ${helpDot("programme")} Lista și orele vin din planul-cadru al clasei tale și nu se pot schimba. Alte materii nu se pot adăuga.</p>
        <p class="setup-count">${plural(on.length, "materie nouă", "materii noi")} · ${plural(hours, "oră", "ore")} pe săptămână · Purtarea e deja în catalog</p>`;
}

function setupTargetsHTML() {
    const { target, risk, method, preset } = ui.setup;
    const chips = (action, values, current, fmt) => values.map(v => `
        <button type="button" data-action="${action}" data-v="${v}" aria-pressed="${current === v}">${fmt(v)}</button>`).join("");
    return `
        <h2 id="setup-title" tabindex="-1">Ținta și anul școlar</h2>
        <p class="setup-lead">Le folosesc pe pagina Azi, în Statistici și în Simulator.</p>
        <div class="setup-field">
            <span class="setup-label" id="setup-target-l">Ce medie generală îți dorești?</span>
            <div class="azi-seg setup-seg" role="group" aria-labelledby="setup-target-l">${chips("setup-target", [8, 8.5, 9, 9.5, 10], target, v => v.toFixed(2))}</div>
        </div>
        <div class="setup-field">
            <span class="setup-label" id="setup-risk-l">De la ce medie a unei materii să te avertizez?</span>
            <div class="azi-seg setup-seg" role="group" aria-labelledby="setup-risk-l">${chips("setup-risk", [5, 6, 7, 8, 9], risk, v => `sub ${v}`)}</div>
        </div>
        <div class="setup-field">
            <span class="setup-label" id="setup-method-l">Cum se calculează media generală?</span>
            <div class="setup-options" role="radiogroup" aria-labelledby="setup-method-l">
                <button type="button" class="setup-option" role="radio" aria-checked="${method === "arithmetic"}" data-action="setup-method" data-v="arithmetic">
                    <b>Ca în catalog</b><small>media aritmetică a mediilor pe materii (recomandat)</small>
                </button>
                <button type="button" class="setup-option" role="radio" aria-checked="${method === "weighted"}" data-action="setup-method" data-v="weighted">
                    <b>Ponderată</b><small>materiile cu mai multe ore contează mai mult</small>
                </button>
            </div>
        </div>
        <div class="setup-field">
            <label class="setup-label" for="setup-county">Din ce județ ești?</label>
            <select id="setup-county" class="glass-select">${countyOptions(ui.setup.county)}</select>
            <small class="setup-field-hint">Din el aflu săptămâna vacanței de schi (o stabilește inspectoratul școlar).</small>
        </div>
        <div class="setup-field">
            <label class="setup-label" for="setup-preset">Vacanța mobilă (de ea depind modulele 3 și 4)</label>
            <select id="setup-preset" class="glass-select">
                ${matchingModulePreset(state.settings.modules) === "custom" ? `<option value="keep" ${preset === "keep" ? "selected" : ""}>Păstrez datele mele (din Setări)</option>` : ""}
                ${Object.entries(modulePresetsFor(currentSchoolYear())).map(([id, p]) => `<option value="${id}" ${id === preset ? "selected" : ""}>${escapeHTML(p.label)}</option>`).join("")}
            </select>
        </div>`;
}

function setupTimetableHTML() {
    const { rows, target } = ui.setup;
    const n = rows.filter(r => r.on && !r.exists && r.name.trim()).length;
    return `
        <div class="setup-hero">
            <h2 id="setup-title" tabindex="-1">Aproape gata!</h2>
            <p>Adaug ${plural(n, "materie", "materii")}, cu ținta ${target.toFixed(2)}. Ultimul pas: orarul. Cu el, pagina Azi îți arată orele fiecărei zile, iar testele se adaugă dintr-o atingere.</p>
        </div>
        <div class="setup-choices">
            <button type="button" class="setup-choice is-primary" data-action="setup-finish" data-timetable="1" data-autofocus>
                ${icon("calendar-days")}<span><b>Completez orarul acum</b><small>durează cam două minute</small></span>${icon("chevron", "setup-arrow")}
            </button>
            <button type="button" class="setup-choice" data-action="setup-finish">
                ${icon("clock")}<span><b>Mai târziu</b><small>îl găsești pe pagina Azi și în Calendar</small></span>${icon("chevron", "setup-arrow")}
            </button>
        </div>`;
}

function validSetupPreset(value, fallback) {
    return value === "keep" || MODULE_PRESETS[value] ? value : fallback;
}

/** Verifică lista de materii înainte de pasul următor; întoarce un mesaj de eroare sau null. */
function setupRowsError() {
    const seen = new Set();
    for (const r of ui.setup.rows) {
        if (!r.on || r.exists) continue;
        const name = (r.kind === "opt" ? optionalName(r.topic) : r.name).trim().replace(/\s+/g, " ");
        if (!name) return "O materie bifată nu are nume.";
        if (name === "__proto__" || name === PURTARE_KEY || isLegacyPurtareName(name)) return "Purtarea e deja în catalog; nu o adăuga ca materie.";
        const low = name.toLocaleLowerCase("ro");
        if (seen.has(low)) return `„${name}” apare de două ori.`;
        if (findSubjectName(name)) return `Materia ${findSubjectName(name)} există deja.`;
        seen.add(low);
    }
    return null;
}

function setupNext() {
    const st = ui.setup;
    if (st.step === 1 && !st.profile) return;
    if (st.step === 2) {
        const err = setupRowsError();
        if (err) {
            showToast(`⚠️ ${err}`);
            return;
        }
    }
    if (st.step === 3) st.preset = validSetupPreset(field("setup-preset"), st.preset);
    st.step = Math.min(4, st.step + 1);
    renderSetup();
}

function finishSetup(withTimetable) {
    const st = ui.setup;
    if (!st) return;
    const added = [];
    st.rows.forEach(r => {
        const name = (r.kind === "opt" ? optionalName(r.topic) : r.name).trim().replace(/\s+/g, " ");
        if (!r.on || r.exists || !name || findSubjectName(name)) return;
        if (r.kind === "opt" && firstOptional()) return; // maximum un opțional
        // dirigenția din liceu nu are note: nu trage media în jos
        state.subjects[name] = { ore: r.ore, target: st.target, grades: [], priority: false, excludeFromGPA: r.kind === "dirig" && st.cls >= 9 };
        added.push(name);
    });
    const s = state.settings;
    if (SETUP_PROFILES[st.profile]) s.school = { profile: st.profile, cls: SETUP_PROFILES[st.profile].classes ? st.cls : 0, variant: st.variant || "", lm2: st.lm2 || LM2_CHOICES[0], county: st.county || s.school.county || "" };
    else if (st.county) s.school.county = st.county;
    s.goals.targetGPA = st.target;
    s.goals.minGPA = Math.min(s.goals.minGPA, st.target);
    s.calc.riskThreshold = st.risk;
    s.calc.method = st.method;
    if (MODULE_PRESETS[st.preset]) s.modules = presetModules(st.preset, SETUP_PROFILES[st.profile]?.classes ? st.cls : 0);
    // Clasa aleasă ajunge și pe antetul raportului (dacă elevul nu a scris deja alta).
    if (SETUP_PROFILES[st.profile]?.classes && !s.report.cls) s.report.cls = `a ${ROMAN[st.cls]}-a`;
    addActivity(added.length ? `Configurare: ai adăugat ${plural(added.length, "materie", "materii")}.` : "Configurare: ținte și an școlar actualizate.");
    markSetupDone();
    closeSetup();
    ui.home.day = null;
    switchTab("tab-dashboard");
    refresh();
    if (withTimetable && Object.keys(state.subjects).length) {
        ui.tourAfterModal = true; // turul vine după ce închide orarul
        openTimetableModal();
    } else {
        showToast(`✅ Gata! ${added.length ? `Ai ${plural(Object.keys(state.subjects).length, "materie", "materii")} în catalog.` : "Setările au fost salvate."}`);
        setTimeout(maybeStartTour, 400);
    }
}
