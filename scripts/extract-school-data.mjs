/* Scoate datele școlare din aplicație (js/config.js, js/exams.js din repository-ul urnotes) în shared/school-data.json,
   de unde serverul le încarcă la prima pornire. Rulează-l după ce schimbi datele în aplicație:
     npm run extract-school-data                 → citește aplicația de pe GitHub (ramura main)
     npm run extract-school-data -- ../urnotes   → citește o copie locală a aplicației */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_RAW = "https://raw.githubusercontent.com/GOLD3N11/urnotes/main/js/";
const appDir = process.argv[2];
if (appDir && !existsSync(join(appDir, "js", "config.js"))) throw new Error(`${appDir} nu pare aplicația urNotes (lipsește js/config.js)`);
const read = async file => {
    if (appDir) return readFileSync(join(appDir, "js", file), "utf8");
    const res = await fetch(APP_RAW + file);
    if (!res.ok) throw new Error(`${APP_RAW + file}: ${res.status}`);
    return res.text();
};
const sources = { "config.js": await read("config.js"), "exams.js": await read("exams.js") };
const literal = (file, name) => {
    const src = sources[file];
    const start = src.indexOf(`const ${name} = {`);
    if (start < 0) throw new Error(`${name} nu e în ${file}`);
    let i = src.indexOf("{", start), depth = 0, inStr = null;
    for (; i < src.length; i++) {
        const c = src[i];
        if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
        if (c === '"' || c === "'" || c === "`") inStr = c;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
    }
    return vm.runInNewContext(`(${src.slice(src.indexOf("{", start), i + 1)})`);
};

const years = literal("config.js", "SCHOOL_YEAR_DATA");
const countyWeek = literal("config.js", "COUNTY_WEEK");
const exams = literal("exams.js", "EXAM_CALENDAR");

// COUNTY_WEEK: { "Iași": "2026-feb22" } → pe ani: { "2026": { "Iași": "feb22" } }
const counties = {};
for (const [county, id] of Object.entries(countyWeek)) {
    const [year, week] = id.split("-");
    (counties[year] ||= {})[county] = week;
}
const out = { $comment: "Generat din js/config.js și js/exams.js de scripts/extract-school-data.mjs (urnotes-api). Nu-l edita de mână.", years, counties, exams };
writeFileSync(join(root, "shared", "school-data.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`shared/school-data.json: ${Object.keys(years).length} ani, ${Object.keys(countyWeek).length} județe, ${Object.keys(exams).length} ani de examene`);
