/* Ceasul amintirilor: trimite amintirile al căror moment a venit.
   - pe un server mereu pornit (Docker, Render, PC-ul tău): un cronometru, la fiecare minut
   - pe Vercel (serverul doarme între cereri): GET /internal/cron/reminders, chemat de un cron
   O amintire întârziată pleacă la primul pas de după ora ei, iar un lacăt în baza de date garantează că,
   oricâte copii ale serverului rulează, fiecare amintire pleacă o singură dată. */
import type { Db } from "../../db.js";
import type { NotificationsService } from "./service.js";

const LOCK_ID = 727_001; // un număr oarecare, același peste tot

/** Un pas al ceasului. `ran: false` = altă copie a serverului lucra deja. */
export async function runRemindersOnce(db: Db, notifications: NotificationsService, now = new Date()): Promise<{ ran: boolean; sent: number }> {
    return db.tx(async t => {
        const lock = await t.one<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [LOCK_ID]);
        if (!lock?.ok) return { ran: false, sent: 0 };
        const { sent } = await notifications.runDue(now);
        return { ran: true, sent };
    });
}

export function startScheduler(db: Db, notifications: NotificationsService, everyMs: number, log: (msg: string, err?: unknown) => void) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const { sent } = await runRemindersOnce(db, notifications);
            if (sent) log(`amintiri trimise: ${sent}`);
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
