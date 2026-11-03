/* shared/rules.js (regulile de calcul și de realism) își are locul în repository-ul serverului, GOLD3N11/urnotes-api.
   Aplicația ține o copie, ca să meargă și fără internet. Scriptul ăsta o aduce la zi sau verifică dacă e la zi:
     node scripts/sync-rules.mjs            → copiază shared/rules.js de pe ramura main a serverului
     node scripts/sync-rules.mjs --check    → doar verifică (îl rulează testele de pe GitHub)
   Dacă urnotes-api e privat, pune un token cu drept de citire în URNOTES_API_TOKEN. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.URNOTES_API_REPO || "GOLD3N11/urnotes-api";
const REF = process.env.URNOTES_API_REF || "main";
const url = `https://raw.githubusercontent.com/${REPO}/${REF}/shared/rules.js`;
const file = join(dirname(fileURLToPath(import.meta.url)), "..", "shared", "rules.js");
const check = process.argv.includes("--check");
const token = process.env.URNOTES_API_TOKEN || "";

const res = await fetch(url, token ? { headers: { Authorization: `token ${token}` } } : {});
if (!res.ok) {
    const msg = `Nu pot citi ${url} (${res.status}). ${token ? "Verifică tokenul." : "Dacă urnotes-api e privat, pune un token în URNOTES_API_TOKEN."}`;
    // fără acces nu putem spune nimic despre copie: avertizăm, dar nu oprim aplicația pentru asta
    if (check && !token && res.status === 404) { console.log(`::warning::${msg}`); process.exit(0); }
    console.error(msg);
    process.exit(1);
}
const theirs = await res.text();
const ours = readFileSync(file, "utf8");
if (theirs === ours) { console.log("shared/rules.js e la zi cu serverul."); process.exit(0); }
if (check) {
    console.log("::error file=shared/rules.js::Regulile s-au schimbat pe server. Rulează `node scripts/sync-rules.mjs` și fă commit, ca aplicația să nu primească lucruri pe care serverul le refuză.");
    process.exit(1);
}
writeFileSync(file, theirs);
console.log(`shared/rules.js adus de la ${REPO}@${REF}. Verifică diferența și fă commit.`);
