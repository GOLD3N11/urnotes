# urnotes-api · serverul urNotes

Aplicația (interfața) e în repository-ul [GOLD3N11/urnotes](https://github.com/GOLD3N11/urnotes) și stă pe GitHub Pages. Ea vorbește cu acest server doar prin API-ul de mai jos (`/v1/...`), la adresa din `api-config.js`. Cele două repository-uri se publică separat.

**Ce au în comun:** `shared/rules.js` (regulile de calcul și de realism). Locul lui e **aici**; aplicația ține o copie, iar testele ei pică dacă copia nu mai e la fel (vezi „Regulile comune” mai jos). `shared/school-data.json` merge invers: se generează din aplicație.

Un singur serviciu, împărțit în module. Fiecare modul are tabelele lui (prefixul din paranteză), serviciul și rutele lui, și nu citește tabelele altui modul. Așa, un modul se poate muta mai târziu într-un serviciu separat fără să schimbi restul.

| Modul | Ce face | Tabele |
| --- | --- | --- |
| Accounts | conturile (elev, părinte, profesor), legăturile părinte/profesor ↔ elev, integrarea Adservio, regula de acces | `accounts_*` |
| School data | anii școlari, săptămâna de schi pe județe, examenele (EN, Bac) | `school_*` |
| Notifications | amintirea de seară ca notificare push, chiar cu aplicația închisă | `notif_*` |
| Student data | caietul elevului, înregistrare cu înregistrare (materii, note, evenimente, setări…), cu un cursor pentru sincronizare; rezumatul mediilor; importul de note | `data_records` |
| Classes | clasele profesorului: cod de intrare, elevi, teste puse o dată pentru toată clasa | `class_*` |

Planul complet (fazele 1–6) e în documentul „urNotes: architecture review and backend plan”.

## Cine poate face ce

| Rol | Vede | Schimbă |
| --- | --- | --- |
| Elev | datele lui | datele lui |
| Părinte, profesor (legați printr-un cod de la elev) | datele elevului, oricând | nimic |
| Integrarea Adservio (permisă de elev) | — | doar notele importate |
| Administrator (`ADMIN_EMAILS`) | datele școlare | anii, județele, examenele |

Regula e scrisă o singură dată, în `src/modules/accounts/policy.ts`, și e verificată de teste. Un profesor e legat de elev și când elevul intră într-o clasă de-a lui.

## Sincronizarea caietului

Caietul nu mai urcă întreg: fiecare materie (`subject/<nume>`), notă (`grade/<id>`), eveniment (`event/<id>`) și restul (`doc/settings`, `doc/plan`…) e o înregistrare separată. Fiecare scriere primește un număr `rev` crescător; scrierile aceluiași elev se pun la coadă (un lacăt pe elev), așa că „dă-mi ce s-a schimbat după rev N” nu sare niciodată peste ceva. O ștergere rămâne ca înregistrare `deleted`, ca celelalte dispozitive s-o afle.

În aplicație (`js/serversync.js`): citește ce s-a schimbat de la cursor, pune peste caiet (o modificare făcută aici și netrimisă câștigă la aceeași înregistrare), apoi trimite doar ce diferă. Două dispozitive care schimbă lucruri diferite nu se mai suprascriu.

Mediile se calculează cu aceleași reguli peste tot: `shared/rules.js` e folosit și de aplicație, și de server (`GET /v1/students/:id/summary`).

## Regulile comune

`shared/rules.js` se schimbă **doar aici**, cu testele serverului. Apoi, în repository-ul aplicației:

```
node scripts/sync-rules.mjs     # aduce shared/rules.js de aici (ramura main)
```

și faci commit acolo. Până atunci, testele aplicației pică cu un mesaj care spune exact asta, ca aplicația să nu primească lucruri pe care serverul le refuză.

## Adservio

Adservio nu are un API public, așa că serverul nu se poate conecta singur la el. Calea pregătită: o integrare creată de administrator (o cheie), permisă de elev, trimite notele la `POST /v1/students/:id/imported-grades`. Fiecare notă vine cu id-ul ei din Adservio (`adservio:<id>`), deci un import repetat nu dublează nimic, iar integrarea nu poate atinge altceva decât notele importate de ea. Dacă Adservio oferă un export sau un acord de acces, legătura se scrie ca un mic program care citește de acolo și trimite aici.

## Pornire locală

Cu Docker:

```
cp .env.example .env      # completează FIREBASE_PROJECT_ID și, pentru push, cheile din `npm run vapid`
docker compose up --build
```

Fără Docker (Node 20+ și PostgreSQL 14+):

```
npm install
cp .env.example .env
npm run migrate
npm run dev
```

Apoi deschide aplicația cu `?api=http://localhost:8080` (de exemplu `https://gold3n11.github.io/urnotes/?api=http://localhost:8080`). Alegerea rămâne pe acel dispozitiv; `?api=off` o oprește. Pentru toată lumea, adresa se pune în `api-config.js` din repository-ul aplicației. Cât timp acolo e `null`, aplicația merge exact ca înainte, fără server.

## Teste

```
npm test
```

Testele pornesc singure un PostgreSQL temporar (dacă găsesc `initdb` în `/usr/lib/postgresql`); altfel, dă-le o bază goală prin `TEST_DATABASE_URL`.

## Postman

`postman/urnotes.postman_collection.json` trece prin tot API-ul în ordine (conturi, coduri, date școlare, Adservio, amintiri, sincronizarea caietului, clase), cu verificări la fiecare cerere. Pornește serverul cu `postman/postman.env` (AUTH_MODE=dev, pe o bază goală), importă colecția și apasă Run.

## API

Toate răspunsurile sunt JSON; erorile au forma `{ "error": "cod", "message": "text" }`. Cererile cu cont trimit `Authorization: Bearer <jetonul Firebase>`; integrările trimit `Authorization: Integration <cheie>`.

| Metodă și cale | Cine | Ce face |
| --- | --- | --- |
| `GET /health` | oricine | serverul merge |
| `GET /v1/me` | în cont | contul tău (sau `registered: false` dacă încă nu ți-ai ales rolul) |
| `POST /v1/me` `{ role, name? }` | în cont | alegi rolul: `student`, `parent` sau `teacher` (nu se mai schimbă) |
| `PATCH /v1/me` `{ name }` · `DELETE /v1/me` | cont | schimbi numele · ștergi contul |
| `POST /v1/me/invites` `{ relation }` | elev | un cod de 8 caractere, valabil 7 zile, pentru un părinte sau un profesor |
| `POST /v1/links` `{ code }` | părinte, profesor | te legi de elev cu codul lui |
| `GET /v1/me/links` | cont | elevul: cine îi vede datele; părintele/profesorul: elevii lui |
| `DELETE /v1/links/:studentId/:viewerId` | elevul sau cel legat | desface legătura |
| `GET /v1/students/:id/access` | cont sau integrare | ce poți face cu datele acelui elev |
| `GET /v1/integrations` · `PUT/DELETE /v1/me/integrations/:id` | elev | vezi integrările · permiți sau retragi importul |
| `POST /v1/admin/integrations` `{ kind: "adservio" }` · `DELETE /v1/admin/integrations/:id` | administrator | creezi (cheia apare o singură dată) · retragi |
| `GET /v1/school` | oricine | toate datele școlare, cu `ETag` (304 dacă nu s-a schimbat nimic) |
| `GET /v1/school/:kind/:year` · `PUT …` | oricine · administrator | un an (`years`, `counties`, `exams`) · îl publici |
| `GET /v1/notifications/vapid-key` | oricine | cheia publică pentru push |
| `POST` / `DELETE /v1/notifications/subscriptions` | cont | abonezi sau dezabonezi dispozitivul |
| `GET` / `PUT /v1/notifications/settings` `{ enabled, time, timezone }` | cont | amintirea de seară |
| `PUT /v1/notifications/digests` `{ from, days }` | cont | textul amintirilor pe zile (îl scrie aplicația) |
| `POST /v1/notifications/shown` `{ day }` | cont | amintirea a fost văzută în aplicație; serverul n-o mai trimite |
| `GET /v1/students/:id/records?since&limit` | elevul, părinte, profesor | ce s-a schimbat după `since` (`records`, `cursor`, `more`) |
| `POST /v1/students/:id/records` `{ changes: [{ collection, id, data }] }` | elevul (integrarea: doar `grade/adservio:*`) | scrie până la 1000 de înregistrări; `data: null` șterge |
| `GET /v1/students/:id/summary` | elevul, părinte, profesor | media generală și pe materii, calculate pe server |
| `POST /v1/students/:id/imported-grades` `{ grades: [{ externalId, subject, val, type?, date? }] }` | integrarea | notele importate din Adservio |
| `GET` / `POST /v1/classes` `{ name, subject? }` | profesor (elevul: doar `GET`) | clasele tale · o clasă nouă, cu cod |
| `POST /v1/classes/join` `{ code }` | elev | intri în clasă; testele ei viitoare îți apar în calendar |
| `GET /v1/classes/:id/members` · `DELETE …/members/:studentId` | profesorul clasei (elevul: doar ieșirea lui) | elevii · scoți un elev |
| `GET` / `POST /v1/classes/:id/events` · `PUT` / `DELETE …/events/:eventId` | profesorul clasei | testele clasei; orice schimbare ajunge în calendarul fiecărui elev |

## Date școlare

La prima pornire, serverul încarcă `shared/school-data.json`, generat din `js/config.js` și `js/exams.js` ale aplicației cu `npm run extract-school-data` (le citește de pe GitHub; `npm run extract-school-data -- ../urnotes` citește o copie locală). Testele de pe GitHub verifică că fișierul e la zi cu aplicația. Ce schimbă administratorul după aceea nu mai e suprascris. Un an nou se publică cu `PUT /v1/school/years/2027` (și `counties`, `exams`); aplicațiile îl primesc la următoarea deschidere, fără o versiune nouă.

## Publicarea (când ai un server)

Aplicația rămâne pe GitHub Pages; serverul stă pe Render, descris în `render.yaml` (serviciu mereu pornit + PostgreSQL). Serverul nu poate dormi: ceasul lui trimite amintirile de seară, iar o trezire ar dura mai mult decât cele 10 secunde cât așteaptă aplicația.

1. Pe Render: **New → Blueprint**, alegi acest depozit (și ramura cu `render.yaml`).
2. Când ți se cer, completezi `ADMIN_EMAILS` (emailul tău), `VAPID_PUBLIC_KEY` și `VAPID_PRIVATE_KEY` (din `npm run vapid`) și `VAPID_SUBJECT` (`mailto:` + emailul tău).
3. Când serviciul e pornit, verifici `https://<adresa>/health`: trebuie să răspundă `{"ok":true}`.
4. În repository-ul aplicației, pui adresa în `api-config.js` (`window.URNOTES_API = "https://<adresa>";`) și publici aplicația ca de obicei.

La prima intrare după pasul 4, fiecare elev își aduce caietul din Firebase pe server. Până la pasul 4 nu se schimbă nimic pentru nimeni.

## Pe Vercel

Serverul merge și pe Vercel (planul gratuit Hobby ajunge pentru început). Diferența față de Render: pe Vercel serverul pornește doar la cereri și doarme între ele, așa că:

- **Intrarea** e `src/index.ts`; `vercel.json` adaugă la pachet `migrations/` și `shared/`. Migrările se aplică singure la prima cerere de după o versiune nouă.
- **Baza de date** nu e pe Vercel: o adaugi din Vercel → proiectul → **Storage → Neon (Postgres)**, care pune singur `DATABASE_URL` în proiect. Folosește adresa cu *pooling* (are `-pooler` în nume).
- **Amintirile** nu mai au un cronometru în server. Le trimite `GET /internal/cron/reminders`, cu antetul `Authorization: Bearer <CRON_SECRET>`. Cronul din `vercel.json` îl cheamă o dată pe zi (cât permite Hobby), iar `.github/workflows/reminders.yml` la fiecare 15 minute, după ce pui secretele `URNOTES_API_URL` și `CRON_SECRET` în GitHub. O amintire pleacă la primul apel de după ora ei, o singură dată.
- **Variabilele** din proiectul Vercel: `DATABASE_URL` (de la Neon), `AUTH_MODE=firebase`, `FIREBASE_PROJECT_ID=zece-2f182`, `CORS_ORIGINS=https://gold3n11.github.io`, `ADMIN_EMAILS`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Aplicația** rămâne pe GitHub Pages: în repository-ul urnotes, `api-config.js` primește adresa de pe Vercel (`https://urnotes-api.vercel.app` sau cum se numește proiectul).

Pe repository privat, GitHub Actions are un număr limitat de minute gratuite pe lună; un apel la 15 minute le poate depăși. Pe repository public nu e limită.

Altă gazdă merge la fel: orice rulează imaginea (`docker build -t urnotes-api .`) cu variabilele din `.env.example`, dar trebuie să rămână pornită și între cereri.

Serverul aplică singur migrările la pornire. Cu mai multe copii pornite, amintirile pleacă o singură dată (un lacăt în baza de date).
