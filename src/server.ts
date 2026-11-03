/* Pornirea: migrări, datele școlare inițiale, serverul HTTP și ceasul amintirilor.
   Pe Vercel, fișierul ăsta e intrarea (prin src/index.ts): Vercel preia app.listen și pornește serverul la cerere. */
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { createDb, migrate } from "./db.js";
import { verifierFor } from "./auth.js";
import { buildApp, createServices } from "./app.js";
import { startScheduler } from "./modules/notifications/scheduler.js";
import { MIGRATIONS_DIR, SCHOOL_SEED_FILE } from "./paths.js";

const config = loadConfig();
const db = createDb(config.databaseUrl, config.poolMax);
const applied = await migrate(db, MIGRATIONS_DIR);
const deps = { config, db, verifier: verifierFor(config), logger: true };
const services = createServices(deps);
const seeded = await services.school.seed(JSON.parse(await readFile(SCHOOL_SEED_FILE, "utf8")));
const app = await buildApp(deps, services);
if (applied.length) app.log.info(`migrări aplicate: ${applied.join(", ")}`);
if (seeded) app.log.info(`date școlare inițiale: ${seeded}`);
if (!config.vapid) app.log.warn("Fără VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: amintirile push sunt oprite.");
// pe Vercel (și cu SCHEDULER_EVERY_MS=0) nu pornește cronometrul: amintirile le pornește cronul, prin /internal/cron/reminders
const stop = config.schedulerEveryMs
    ? startScheduler(db, services.notifications, config.schedulerEveryMs, (msg, err) => err ? app.log.error({ err }, msg) : app.log.info(msg))
    : () => {};
if (!config.schedulerEveryMs && !config.cronSecret) app.log.warn("Fără cronometru și fără CRON_SECRET: amintirile push nu pleacă.");

await app.listen({ port: config.port, host: config.host });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
        stop();
        await app.close();
        await db.close();
        process.exit(0);
    });
}
