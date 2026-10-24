# urNotes — notele tale, în stilul tău

Aplicație web pentru evidența notelor școlare, personalizată pentru fiecare elev (numele tău, culoarea ta și o mascotă-post-it pe care o botezi tu): medii, ținte, purtare, calendar cu teste și teme, orar, statistici, simulator „ce-ar fi dacă” și raport pentru printare.

Gândită ca un Notion doar pentru școală: fiecare materie e o pagină (cu media, notele și notițele tale), meniul lateral arată toate paginile, iar testele și temele le vezi ca săptămână, lună, tabel sau panou.

**Deschide aplicația:** https://gold3n11.github.io/urnotes/ (numele proiectului Firebase rămâne `zece-2f182`: Google nu permite redenumirea lui)

- Funcționează direct în browser (HTML, CSS și JavaScript, fără instalare).
- Datele se salvează în browser (localStorage) și merg și offline; din Setări poți exporta și importa un backup.
- Opțional, conturi (Google sau email + parolă) cu sincronizare între dispozitive, prin Firebase: completează `firebase-config.js` și publică regulile din `firestore.rules`. Fără configurare, aplicația rămâne doar locală.

## Serverul (backend/)

Aplicația merge și fără server. Când `api-config.js` are adresa serverului urNotes, ea:
- ia datele școlare (anii, județele, examenele) de pe server, așa că un ordin nou al ministrului nu mai cere o versiune nouă;
- trimite serverului amintirea de seară a fiecărei zile, iar serverul o trimite ca notificare push, chiar cu aplicația închisă;
- lasă elevul să creeze coduri pentru un părinte sau un profesor, care îi vor vedea datele fără să le poată schimba;
- sincronizează caietul notă cu notă (nu ca o copie întreagă), deci două dispozitive nu se mai suprascriu;
- are conturi de părinte și de profesor: la prima intrare cu un cont nou alegi „elev”, „părinte” sau „profesor”; părintele și profesorul văd caietul elevului doar pentru citire, iar profesorul face clase cu cod și pune teste care apar în calendarul fiecărui elev.

Detalii, API și pornire: `backend/README.md`. Formele datelor comune aplicației și serverului: `shared/types.ts`.

## Cum e organizat codul

Fără pas de build: fișiere statice, publicate direct pe GitHub Pages.

- `index.html`: paginile (taburile) și ordinea scripturilor.
- `style.css`: aspectul componentelor; `ui.css`: stilul colorat „urNotes” (culori, litere, meniul, plăcile post-it); `notion.css`: stilul simplu, ca în Notion (implicit). Stilul se alege din Setări → Aspect → Stil și pune pe `<body>` clasa `style-notion` sau `style-urnotes`.
- `shared/rules.js`: regulile de calcul (medii, rotunjire, purtare), aceleași în aplicație și pe server; `shared/types.ts`: formele datelor.
- `js/*.js`: aplicația, împărțită pe domenii. Sunt scripturi clasice care împart același spațiu global și se încarcă în ordinea din `index.html`:
  - `config.js`: constante, anii școlari (`SCHOOL_YEAR_DATA`), setări implicite.
  - `utils.js`, `model.js`, `storage.js`, `metrics.js`: datele și calculele.
  - Câte un fișier pentru fiecare pagină sau funcție: `azi.js`, `catalog.js`, `calendar-*.js`, `plan.js`, `stats.js`, `simulator.js`, `reminders.js`, `years.js`, `pal.js` etc.
  - `notes.js`: notițele din pagina fiecărei materii (blocuri: text, titlu, listă, de bifat; scurtături „# ”, „- ”, „[] ”, „> ” citat, „---” linie; blocurile se mută trăgând de mânerul ⋮⋮).
  - `pages.js`: pictogramele paginilor și ale materiilor (emoji, alese automat sau din alegătorul de pictograme), proprietățile materiei ca într-o bază de date Notion.
  - `api.js`: stratul către serverul urNotes (datele școlare, amintirile push, rolul contului, părinți și profesori); oprit cât timp `api-config.js` are `null`.
  - `serversync.js`: sincronizarea cu serverul, înregistrare cu înregistrare (înlocuiește copia din Firebase când serverul e pornit).
  - `viewer.js`: modul „doar citire” pentru părinți și profesori, clasele profesorului și intrarea elevului într-o clasă.
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

