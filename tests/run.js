/* Rulează toate testele aplicației (jsdom), câte 4 deodată, și iese cu 1 dacă vreunul pică.
     cd tests && npm ci && node run.js            → toate
     node run.js cal shell                        → doar câteva */
const { spawn } = require("child_process"), path = require("path"), os = require("os");
const ALL = ["real", "stats2", "stats", "purtare", "cat", "cal", "test", "shell", "home", "undo", "setup", "compat", "me",
    "plan", "catmenu", "catnav", "ux", "remind", "years", "pal", "exams", "growth", "notion", "azi2"];
const root = path.join(__dirname, "..");
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const limit = Math.max(2, Math.min(4, os.cpus().length));

function runOne(name) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [path.join(__dirname, `${name}.js`), root], { cwd: __dirname });
        let out = "";
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { out += d; });
        const timer = setTimeout(() => { out += "\nTIMEOUT după 150 s"; child.kill("SIGKILL"); }, 150000);
        child.on("close", code => {
            clearTimeout(timer);
            const bad = out.split("\n").filter(l => /^(FAIL|JSDOM ERR|CONSOLE ERR|CRASH)|TIMEOUT|Error:/.test(l));
            resolve({ name, ok: code === 0 && /ALL PASSED/.test(out) && !bad.length, bad, out });
        });
    });
}

(async () => {
    const queue = [...names], results = [];
    await Promise.all(Array.from({ length: limit }, async () => {
        while (queue.length) results.push(await runOne(queue.shift()));
    }));
    results.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
    for (const r of results) {
        console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}`);
        if (!r.ok) console.log((r.bad.length ? r.bad : r.out.trim().split("\n").slice(-15)).map(l => `       ${l}`).join("\n"));
    }
    const failed = results.filter(r => !r.ok).length;
    console.log(failed ? `\n${failed} din ${results.length} au picat` : `\nToate ${results.length} au trecut`);
    process.exit(failed ? 1 : 0);
})();
