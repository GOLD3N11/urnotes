/* Testele rulează pe un PostgreSQL adevărat. Dacă TEST_DATABASE_URL nu e dat, pornim unul temporar
   (initdb + pg_ctl), îl folosim și îl oprim la final. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, chownSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataDir = "";
let pgBin = "";
const asPostgres = (cmd: string, args: string[]) => {
    const isRoot = process.getuid?.() === 0;
    return isRoot ? execFileSync("runuser", ["-u", "postgres", "--", cmd, ...args], { stdio: "pipe" }) : execFileSync(cmd, args, { stdio: "pipe" });
};

export async function setup() {
    if (process.env.TEST_DATABASE_URL) return;
    const base = "/usr/lib/postgresql";
    const version = existsSync(base) ? readdirSync(base).sort().pop() : undefined;
    if (!version) throw new Error("Nu găsesc PostgreSQL: setează TEST_DATABASE_URL sau instalează postgresql.");
    pgBin = join(base, version, "bin");
    dataDir = mkdtempSync(join(tmpdir(), "urnotes-pg-"));
    if (process.getuid?.() === 0) chownSync(dataDir, Number(execFileSync("id", ["-u", "postgres"]).toString().trim()), Number(execFileSync("id", ["-g", "postgres"]).toString().trim()));
    const port = 55000 + Math.floor(Math.random() * 4000);
    asPostgres(join(pgBin, "initdb"), ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-sync", "-E", "UTF8"]);
    asPostgres(join(pgBin, "pg_ctl"), ["-D", dataDir, "-o", `-p ${port} -k ${dataDir} -c fsync=off -c listen_addresses=localhost`, "-w", "-l", join(dataDir, "log"), "start"]);
    process.env.TEST_DATABASE_URL = `postgres://postgres@localhost:${port}/postgres`;
}

export async function teardown() {
    if (!dataDir) return;
    try { asPostgres(join(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "stop"]); } catch { /* deja oprit */ }
    rmSync(dataDir, { recursive: true, force: true });
}
