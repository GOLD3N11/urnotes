# urNotes — notele tale, în stilul tău

Aplicație web pentru evidența notelor școlare, personalizată pentru fiecare elev (numele tău, culoarea ta și o mascotă-post-it pe care o botezi tu): medii, ținte, purtare, calendar cu teste și teme, orar, statistici, simulator „ce-ar fi dacă” și raport pentru printare.

Gândită ca un Notion doar pentru școală: fiecare materie e o pagină (cu media, notele și notițele tale), meniul lateral arată toate paginile, iar testele și temele le vezi ca săptămână, lună, tabel sau panou.

**Deschide aplicația:** https://gold3n11.github.io/urnotes/ (numele proiectului Firebase rămâne `zece-2f182`: Google nu permite redenumirea lui)

- Funcționează direct în browser (HTML, CSS și JavaScript, fără instalare).
- Datele se salvează în browser (localStorage) și merg și offline; din Setări poți exporta și importa un backup.
- Opțional, conturi (Google sau email + parolă) cu sincronizare între dispozitive, prin Firebase: completează `firebase-config.js` și publică regulile din `firestore.rules`. Fără configurare, aplicația rămâne doar locală.

## Serverul (repository-ul urnotes-api)

Acest repository e doar aplicația (interfața), publicată pe GitHub Pages. Serverul e în [GOLD3N11/urnotes-api](https://github.com/GOLD3N11/urnotes-api), cu istoria lui, și se publică separat. Cele două vorbesc doar prin API-ul serverului (`/v1/...`), la adresa din `api-config.js`; pentru încercări pe un singur dispozitiv, `?api=http://localhost:8080` în adresa aplicației.

Aplicația merge și fără server. Când `api-config.js` are adresa serverului urNotes, ea:
- ia datele școlare (anii, județele, examenele) de pe server, așa că un ordin nou al ministrului nu mai cere o versiune nouă;
- trimite serverului amintirea de seară a fiecărei zile, iar serverul o trimite ca notificare push, chiar cu aplicația închisă;
- lasă elevul să creeze coduri pentru un părinte sau un profesor, care îi vor vedea datele fără să le poată schimba;
- sincronizează caietul notă cu notă (nu ca o copie întreagă), deci două dispozitive nu se mai suprascriu;
- are conturi de părinte și de profesor: la prima intrare cu un cont nou alegi „elev”, „părinte” sau „profesor”; părintele și profesorul văd caietul elevului doar pentru citire, iar profesorul face clase cu cod și pune teste care apar în calendarul fiecărui elev.

Detalii, API, formele datelor și pornire: README-ul din urnotes-api.

**Regulile comune.** `shared/rules.js` (medii, rotunjire, purtare, realism) trebuie să fie identic aici și pe server. Locul lui e în urnotes-api; aici e o copie, ca aplicația să meargă și offline. După ce regulile se schimbă pe server: `node scripts/sync-rules.mjs` și commit. Testele de pe GitHub pică până atunci.

## Cum e organizat codul

Fără pas de build: fișiere statice, publicate direct pe GitHub Pages.

- `index.html`: paginile (taburile) și ordinea scripturilor.
- `style.css`: aspectul componentelor; `ui.css`: stilul colorat „urNotes” (culori, litere, meniul, plăcile post-it); `tokens.css`: culorile, literele și umbrele comune.
- `shared/rules.js`: regulile de calcul (medii, rotunjire, purtare, realism), copia celor din urnotes-api (vezi mai sus).
- `tests/`: testele aplicației (jsdom): `cd tests && npm ci && node run.js`. Le rulează și GitHub la fiecare push.
- `scripts/sync-rules.mjs`: aduce sau verifică copia regulilor.
- `js/`: aplicația, pe secțiuni. Sunt scripturi clasice care împart același spațiu global și se încarcă în ordinea din `index.html`:
  - `core/`: configurarea (`config.js`, cu anii școlari în `SCHOOL_YEAR_DATA`), utilitarele, modelul, stocarea, motorul de calcul (`metrics.js`), randarea, acțiunile (`events.js`), adresele paginilor (`router.js`) și pornirea (`state.js`, `boot.js`, `main.js`, încărcate ultimele).
  - `azi/`: pagina Azi (`azi.js`) și „Ce ai luat?” (`realism.js`).
  - `note/`: materiile și notele (`catalog.js`, `grades-subjects.js`, `quickgrade.js`, `notes.js`), Progresul (`stats.js`, `report.js`, `selects-charts.js`) și Ce-ar fi dacă (`simulator.js`).
  - `calendar/`: calendarul, bara de adăugat (`cal-compose.js`), orarul și amintirile de seară.
  - `plan/`: planul de învățat (`plan.js`) și examenele (`exams.js`, cu `EXAM_CALENDAR`).
  - `eu/`: pagina Eu: setările, backupul, configurarea, turul, anii școlari, mascota (`pal.js`) și creșterea ei (`growth.js`).
  - `cont/`: contul și sincronizarea (`account.js`, `guest.js`, `api.js`, `serversync.js`) și, ca extra, părinții și profesorii (`viewer.js`).
  - `ui/`: navigarea, căutarea (Ctrl+K), meniul lateral, ferestrele de pe ecrane mari, foile de jos de pe telefon și animațiile.
- `cloud.js`: conturile și sincronizarea (Firebase); `sw.js`: lucrul fără internet și amintirile din fundal.

### Paginile

Aplicația e făcută pentru elev, în jurul zilei lui. Patru secțiuni, la fel pe telefon și pe calculator, plus **Eu**:

| Secțiune | Adresă | Ce e acolo |
| --- | --- | --- |
| **Azi** | `/azi` | „Acum” (un singur lucru important), „Ce ai luat?”, orele de azi, de făcut, planul de azi, „La note” (primele concluzii din Progres), săptămâna |
| **Note** | `/note` · `/progres` · `/ce-ar-fi-daca` | file: **Materii** (fiecare materie cu notele și notițele ei), **Progres**, **Ce-ar fi dacă** |
| **Calendar** | `/calendar` | teste, teme, orarul; vederi Săptămână, Lună, Agendă, Tabel, Panou |
| **Plan** | `/plan` · `/examene` | file: **Săptămâna** (ce înveți în fiecare zi) și **Examene** (Bac, Evaluarea Națională) |
| **Eu** | `/eu` (vechea `/setari` duce aici) | profilul și mascota, contul, setările, tema, backupul; părinții și profesorii, ca extra, în Cont |

Pe telefon, bara de jos are Azi · Note · ＋ · Calendar · Plan, iar „Eu” e avatarul din bara de sus.
O filă a unei secțiuni se înregistrează cu `hub` (calea „Note › Progres”, fără „înapoi”): `registerTab("tab-…", { …, group: "grades", hub: "tab-catalog" })`; filele se pun în `<nav class="subnav">` din `index.html`. O sub-pagină cu „înapoi” se înregistrează cu `parent`.

### Cum adaugi ceva

- **O pagină nouă:** adaugi o `<section id="tab-…" class="tab-content">` în `index.html` și un fișier în secțiunea lui din `js/` care apelează `registerTab("tab-…", { render, title, icon, group, pal })`. Scriptul îl treci în `index.html` (înainte de `state.js`) și în lista `APP_JS` din `sw.js`.
- **Un an școlar nou:** adaugi anul în `SCHOOL_YEAR_DATA` (`js/core/config.js`), după ordinul ministrului. Până atunci, anul se estimează singur.
- **Calendarul examenelor:** datele Evaluării Naționale și ale Bacalaureatului stau în `EXAM_CALENDAR` (`js/plan/exams.js`), pe ani școlari. Pentru un an nou, adaugi o intrare după ordinul ministrului.
- **Colegul care crește:** culorile, accesoriile și cât XP aduce fiecare lucru sunt în `js/eu/growth.js` (`PAL_COLORS`, `PAL_ACCESSORIES`, `XP`).
- **O schimbare de format al datelor:** crești `DATA_SCHEMA` și adaugi o migrare în `MIGRATIONS` (`js/core/storage.js`). Datele vechi (din browser, backup sau cont) se aduc singure la zi.
- **Anii încheiați:** se mută în arhivă (`state.archive`, Setări → Anul școlar), așa că datele de zi cu zi rămân mici, oricâți ani ar trece.

