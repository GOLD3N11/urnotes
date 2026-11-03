/* Datele școlare ale aplicației (anii, săptămâna de schi pe județe, examenele), citite direct din js/config.js și
   js/exams.js, în forma pe care o trimite serverul. Așa testul nu ține o copie a lor care să rămână în urmă. */
const fs = require("fs"), path = require("path"), vm = require("vm");

function literal(src, name) {
    const start = src.indexOf(`const ${name} = {`);
    if (start < 0) throw new Error(`${name} lipsește`);
    let i = src.indexOf("{", start), depth = 0, inStr = null;
    for (; i < src.length; i++) {
        const c = src[i];
        if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
        if (c === '"' || c === "'" || c === "`") inStr = c;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
    }
    return vm.runInNewContext(`(${src.slice(src.indexOf("{", start), i + 1)})`);
}

module.exports = dir => {
    const config = fs.readFileSync(path.join(dir, "js", "config.js"), "utf8");
    const exams = fs.readFileSync(path.join(dir, "js", "exams.js"), "utf8");
    const counties = {};
    for (const [county, id] of Object.entries(literal(config, "COUNTY_WEEK"))) {
        const [year, week] = id.split("-");
        (counties[year] ||= {})[county] = week;
    }
    return { years: literal(config, "SCHOOL_YEAR_DATA"), counties, exams: literal(exams, "EXAM_CALENDAR") };
};
