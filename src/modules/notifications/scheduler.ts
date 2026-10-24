/* Ceasul serverului: la fiecare minut trimite amintirile al căror moment a venit.
   Un lacăt în baza de date garantează că, și cu mai multe copii ale serverului, o amintire pleacă o singură dată. */
import type { Db } from "../../db.js";
import type { NotificationsService } from "./service.js";

const LOCK_ID = 727_001; // un număr oarecare, același peste tot

export function startScheduler(db: Db, notifications: NotificationsService, everyMs: number, log: (msg: string, err?: unknown) => void) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await db.tx(async t => {
                const lock = await t.one<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [LOCK_ID]);
                if (!lock?.ok) return;
                const { sent } = await notifications.runDue(new Date());
                if (sent) log(`amintiri trimise: ${sent}`);
            });
        } catch (err) {
            log("ceasul amintirilor a dat eroare", err);
        } finally {
            running = false;
        }
    };
    const timer = setInterval(tick, everyMs);
    timer.unref?.();
    void tick();
    return () => clearInterval(timer);
}
