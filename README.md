# urNotes — notele tale, în stilul tău

Aplicație web pentru evidența notelor școlare, personalizată pentru fiecare elev (numele tău, culoarea ta și o mascotă-post-it pe care o botezi tu): medii, ținte, purtare, calendar cu teste și teme, orar, statistici, simulator „ce-ar fi dacă” și raport pentru printare.

Gândită ca un Notion doar pentru școală: fiecare materie e o pagină (cu media, notele și notițele tale), meniul lateral arată toate paginile, iar testele și temele le vezi ca săptămână, lună, tabel sau panou.

**Deschide aplicația:** https://gold3n11.github.io/zece/

- Funcționează direct în browser (HTML, CSS și JavaScript, fără instalare).
- Datele se salvează în browser (localStorage) și merg și offline; din Setări poți exporta și importa un backup.
- Opțional, conturi (Google sau email + parolă) cu sincronizare între dispozitive, prin Firebase: completează `firebase-config.js` și publică regulile din `firestore.rules`. Fără configurare, aplicația rămâne doar locală.

## Cum e organizat codul

Fără pas de build: fișiere statice, publicate direct pe GitHub Pages.

- `index.html`: paginile (taburile) și ordinea scripturilor.
- `style.css`: aspectul componentelor; `ui.css`: stilul colorat „urNotes” (culori, litere, meniul, plăcile post-it); `notion.css`: stilul simplu, ca în Notion (implicit). Stilul se alege din Setări → Aspect → Stil și pune pe `<body>` clasa `style-notion` sau `style-urnotes`.
- `js/*.js`: aplicația, împărțită pe domenii. Sunt scripturi clasice care împart același spațiu global și se încarcă în ordinea din `index.html`:
  - `config.js`: constante, anii școlari (`SCHOOL_YEAR_DATA`), setări implicite.
  - `utils.js`, `model.js`, `storage.js`, `metrics.js`: datele și calculele.
  - Câte un fișier pentru fiecare pagină sau funcție: `azi.js`, `catalog.js`, `calendar-*.js`, `plan.js`, `stats.js`, `simulator.js`, `reminders.js`, `years.js`, `pal.js` etc.
  - `notes.js`: notițele din pagina fiecărei materii (blocuri: text, titlu, listă, de bifat; scurtături „# ”, „- ”, „[] ”, „> ” citat, „---” linie; blocurile se mută trăgând de mânerul ⋮⋮).
  - `pages.js`: pictogramele paginilor și ale materiilor (emoji, alese automat sau din alegătorul de pictograme), proprietățile materiei ca într-o bază de date Notion.
  - `windows.js`: pe ecrane mari, formularele, confirmările și notificările sunt ferestre: le tragi oriunde (fereastră liberă) sau le lipești în stânga, dreapta, jos ori la mijloc; fiecare fel își ține minte locul.
  - `sidetree.js`: meniul lateral ca arbore de pagini (Note → fiecare materie, Mai mult → Plan, Progres…).
  - `state.js` (starea) și `boot.js`/`main.js` (pornirea) se încarcă ultimele.
- `cloud.js`: conturile și sincronizarea (Firebase); `sw.js`: lucrul fără internet și amintirile din fundal.

### Paginile

Trei pagini principale: **Azi**, **Note** și **Calendar** (plus „+” pentru adăugare și „Eu” pentru cont și setări).
Restul sunt sub-pagini, cu buton „înapoi”: **Plan** (din Azi), **Progresul tău**, **Ce-ar fi dacă** și **Examene** (din Note), **Setări**.
Pe **Azi**: „Următorul pas” (un singur lucru important acum: o notă de scris, testul de mâine, sesiunea din plan, tema de predat sau materia la risc), apoi „De făcut” pe zile (au trecut, azi, mâine, mai încolo) și „Săptămâna asta” (luni și marți: recapitularea săptămânii trecute). Amintirea de seară poate anunța și testele de peste 2-3 zile.
În **Calendar**, testele și temele se pot vedea și ca **Tabel** (rânduri cu tip, materie, dată, stare) sau **Panou** (coloane De făcut · În lucru · Gata; tragi o carte ca să-i schimbi starea).
O sub-pagină se înregistrează cu `parent`: `registerTab("tab-…", { …, parent: "tab-catalog" })`.

### Cum adaugi ceva

- **O pagină nouă:** adaugi o `<section id="tab-…" class="tab-content">` în `index.html` și un fișier în `js/` care apelează `registerTab("tab-…", { render, title, icon, group, pal })`. Scriptul îl treci în `index.html` (înainte de `state.js`) și în lista `APP_JS` din `sw.js`.
- **Un an școlar nou:** adaugi anul în `SCHOOL_YEAR_DATA` (`js/config.js`), după ordinul ministrului. Până atunci, anul se estimează singur.
- **Calendarul examenelor:** datele Evaluării Naționale și ale Bacalaureatului stau în `EXAM_CALENDAR` (`js/exams.js`), pe ani școlari. Pentru un an nou, adaugi o intrare după ordinul ministrului.
- **Colegul care crește:** culorile, accesoriile și cât XP aduce fiecare lucru sunt în `js/growth.js` (`PAL_COLORS`, `PAL_ACCESSORIES`, `XP`).
- **O schimbare de format al datelor:** crești `DATA_SCHEMA` și adaugi o migrare în `MIGRATIONS` (`js/storage.js`). Datele vechi (din browser, backup sau cont) se aduc singure la zi.
- **Anii încheiați:** se mută în arhivă (`state.archive`, Setări → Anul școlar), așa că datele de zi cu zi rămân mici, oricâți ani ar trece.

