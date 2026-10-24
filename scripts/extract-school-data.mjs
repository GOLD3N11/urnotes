/* Scoate datele școlare din aplicație (js/config.js, js/exams.js) în shared/school-data.json,
   de unde serverul le încarcă la prima pornire. Rulează-l după ce schimbi datele în aplicație: npm run extract-school-data */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const literal = (file, name) => {
    const src = readFileSync(join(root, "js", file), "utf8");
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
const out = { $comment: "Generat din js/config.js și js/exams.js de backend/scripts/extract-school-data.mjs. Nu-l edita de mână.", years, counties, exams };
writeFileSync(join(root, "shared", "school-data.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`shared/school-data.json: ${Object.keys(years).length} ani, ${Object.keys(countyWeek).length} județe, ${Object.keys(exams).length} ani de examene`);
