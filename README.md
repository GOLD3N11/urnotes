# Serverul urNotes (backend)

Un singur serviciu, împărțit în module. Fiecare modul are tabelele lui (prefixul din paranteză), serviciul și rutele lui, și nu citește tabelele altui modul. Așa, un modul se poate muta mai târziu într-un serviciu separat fără să schimbi restul.

| Modul | Ce face | Tabele |
| --- | --- | --- |
| Accounts | conturile (elev, părinte, profesor), legăturile părinte/profesor ↔ elev, integrarea Adservio, regula de acces | `accounts_*` |
| School data | anii școlari, săptămâna de schi pe județe, examenele (EN, Bac) | `school_*` |
| Notifications | amintirea de seară ca notificare push, chiar cu aplicația închisă | `notif_*` |

Planul complet (fazele 1–6) e în documentul „urNotes: architecture review and backend plan”.

## Cine poate face ce

| Rol | Vede | Schimbă |
| --- | --- | --- |
| Elev | datele lui | datele lui |
| Părinte, profesor (legați printr-un cod de la elev) | datele elevului, oricând | nimic |
| Integrarea Adservio (permisă de elev) | — | doar notele importate |
| Administrator (`ADMIN_EMAILS`) | datele școlare | anii, județele, examenele |

Regula e scrisă o singură dată, în `src/modules/accounts/policy.ts`, și e verificată de teste.

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

Apoi, în aplicație, pune adresa serverului în `api-config.js` (de exemplu `window.URNOTES_API = "http://localhost:8080";`). Cât timp acolo e `null`, aplicația merge exact ca înainte, fără server.

## Teste

```
npm test
```

Testele pornesc singure un PostgreSQL temporar (dacă găsesc `initdb` în `/usr/lib/postgresql`); altfel, dă-le o bază goală prin `TEST_DATABASE_URL`.

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

## Date școlare

La prima pornire, serverul încarcă `shared/school-data.json`, generat din `js/config.js` și `js/exams.js` cu `npm run extract-school-data`. Ce schimbă administratorul după aceea nu mai e suprascris. Un an nou se publică cu `PUT /v1/school/years/2027` (și `counties`, `exams`); aplicațiile îl primesc la următoarea deschidere, fără o versiune nouă.

## Publicarea (când ai un server)

Orice gazdă care rulează un container și are PostgreSQL merge (de exemplu Cloud Run + Cloud SQL, Fly.io, Render, Railway). Pași:

1. o bază PostgreSQL și `DATABASE_URL`
2. imaginea: `docker build -f backend/Dockerfile -t urnotes-api .` (din rădăcina proiectului)
3. variabilele din `.env.example`, cu `AUTH_MODE=firebase`, `FIREBASE_PROJECT_ID`, `ADMIN_EMAILS` și cheile VAPID
4. adresa serverului în `api-config.js`, apoi publici aplicația ca de obicei

Serverul aplică singur migrările la pornire. Cu mai multe copii pornite, amintirile pleacă o singură dată (un lacăt în baza de date).
