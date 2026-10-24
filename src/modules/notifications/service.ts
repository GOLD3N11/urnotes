/* Modulul Notifications: amintirea de seară trimisă de server, chiar dacă aplicația e închisă.
   Aplicația scrie dinainte textul amintirii pentru fiecare din următoarele 7 zile (ea are datele elevului);
   serverul îl trimite la ora aleasă, în fusul orar al elevului, o singură dată pe zi. */
import type { Db } from "../../db.js";
import { badRequest } from "../../errors.js";
import type { PushSender, PushTarget } from "./push.js";

export interface NotifSettings { enabled: boolean; time: string; timezone: string }
export interface Digest { title: string; body: string }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FAILURES = 5;

export function validTimeZone(tz: string): boolean {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** Data și ora locală („2026-10-24”, „19:05”) într-un fus orar. */
export function localNow(now: Date, timeZone: string): { day: string; time: string } {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(now).map(p => [p.type, p.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export class NotificationsService {
    constructor(private db: Db, private sender: PushSender, private publicKey: string | null) {}

    vapidKey() { return this.publicKey; }

    async subscribe(userId: string, sub: PushTarget, userAgent = "") {
        if (!/^https:\/\//.test(sub.endpoint)) throw badRequest("bad_endpoint", "Abonament push invalid.");
        await this.db.query(
            `INSERT INTO notif_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               user_agent = EXCLUDED.user_agent, failures = 0`,
            [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent.slice(0, 200)]
        );
    }

    async unsubscribe(userId: string, endpoint: string) {
        await this.db.query("DELETE FROM notif_subscriptions WHERE user_id = $1 AND endpoint = $2", [userId, endpoint]);
    }

    async subscriptionCount(userId: string): Promise<number> {
        return Number((await this.db.one("SELECT count(*)::int AS n FROM notif_subscriptions WHERE user_id = $1", [userId]))!.n);
    }

    async getSettings(userId: string): Promise<NotifSettings> {
        const r = await this.db.one("SELECT enabled, time, timezone FROM notif_settings WHERE user_id = $1", [userId]);
        return r ? { enabled: Boolean(r.enabled), time: String(r.time), timezone: String(r.timezone) } : { enabled: false, time: "19:00", timezone: "Europe/Bucharest" };
    }

    async putSettings(userId: string, s: NotifSettings): Promise<NotifSettings> {
        if (!TIME.test(s.time)) throw badRequest("bad_time", "Ora trebuie să fie de forma 19:00.");
        if (!validTimeZone(s.timezone)) throw badRequest("bad_timezone", "Fus orar necunoscut.");
        await this.db.query(
            `INSERT INTO notif_settings (user_id, enabled, time, timezone, updated_at) VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, time = EXCLUDED.time, timezone = EXCLUDED.timezone, updated_at = now()`,
            [userId, s.enabled, s.time, s.timezone]
        );
        return s;
    }

    /** Înlocuiește amintirile de la `from` încolo cu cele trimise acum de aplicație. */
    async putDigests(userId: string, from: string, days: Record<string, Digest>) {
        if (!DAY.test(from)) throw badRequest("bad_day", "Ziua trebuie să fie de forma 2026-10-24.");
        const entries = Object.entries(days);
        if (entries.length > 14) throw badRequest("too_many", "Cel mult 14 zile odată.");
        for (const [day, d] of entries) {
            if (!DAY.test(day) || day < from) throw badRequest("bad_day", `Zi invalidă: ${day}.`);
            if (typeof d?.title !== "string" || typeof d?.body !== "string" || !d.title || d.title.length > 120 || d.body.length > 600) throw badRequest("bad_digest", "Amintire invalidă.");
        }
        await this.db.tx(async t => {
            await t.query("DELETE FROM notif_digests WHERE user_id = $1 AND day >= $2", [userId, from]);
            for (const [day, d] of entries) {
                await t.query("INSERT INTO notif_digests (user_id, day, title, body) VALUES ($1, $2, $3, $4)", [userId, day, d.title, d.body]);
            }
        });
        return { saved: entries.length };
    }

    /** Elevul a văzut deja amintirea zilei în aplicație: serverul n-o mai trimite. */
    async markShown(userId: string, day: string) {
        if (!DAY.test(day)) throw badRequest("bad_day", "Zi invalidă.");
        await this.db.query("INSERT INTO notif_delivered (user_id, day, via) VALUES ($1, $2, 'app') ON CONFLICT DO NOTHING", [userId, day]);
    }

    async deliveredOn(userId: string, day: string) {
        const r = await this.db.one("SELECT via FROM notif_delivered WHERE user_id = $1 AND day = $2", [userId, day]);
        return r ? String(r.via) : null;
    }

    /** Trimite amintirile al căror moment a venit. Întoarce câte au plecat. */
    async runDue(now = new Date()): Promise<{ sent: number; checked: number }> {
        // candidații: amintiri pornite, cu o amintire scrisă în jurul zilei de azi (fusurile orare diferă cu cel mult o zi)
        const rows = await this.db.query<{ user_id: string; time: string; timezone: string; day: string; title: string; body: string }>(
            `SELECT s.user_id, s.time, s.timezone, d.day::text AS day, d.title, d.body
             FROM notif_settings s JOIN notif_digests d ON d.user_id = s.user_id
             WHERE s.enabled AND d.day BETWEEN ($1::date - 1) AND ($1::date + 1)
               AND NOT EXISTS (SELECT 1 FROM notif_delivered x WHERE x.user_id = s.user_id AND x.day = d.day)`,
            [now.toISOString().slice(0, 10)]
        );
        let sent = 0;
        for (const r of rows) {
            const local = localNow(now, r.timezone);
            if (r.day !== local.day || local.time < r.time) continue;
            const subs = await this.db.query<{ id: string; endpoint: string; p256dh: string; auth: string; failures: number }>(
                "SELECT id, endpoint, p256dh, auth, failures FROM notif_subscriptions WHERE user_id = $1", [r.user_id]);
            if (!subs.length) continue;
            const payload = JSON.stringify({ title: r.title, body: r.body, day: r.day, tag: "urnotes-remind", url: "./" });
            let ok = false;
            for (const s of subs) {
                const res = await this.sender.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
                if (res === "ok") {
                    ok = true;
                    await this.db.query("UPDATE notif_subscriptions SET last_ok_at = now(), failures = 0 WHERE id = $1", [s.id]);
                } else if (res === "gone" || s.failures + 1 >= MAX_FAILURES) {
                    await this.db.query("DELETE FROM notif_subscriptions WHERE id = $1", [s.id]);
                } else {
                    await this.db.query("UPDATE notif_subscriptions SET failures = failures + 1 WHERE id = $1", [s.id]);
                }
            }
            if (ok) {
                const ins = await this.db.query("INSERT INTO notif_delivered (user_id, day, via) VALUES ($1, $2, 'push') ON CONFLICT DO NOTHING RETURNING 1", [r.user_id, r.day]);
                sent += ins.length;
            }
        }
        // curățenie: amintirile mai vechi de o săptămână nu mai folosesc nimănui
        await this.db.query("DELETE FROM notif_digests WHERE day < ($1::date - 7)", [now.toISOString().slice(0, 10)]);
        await this.db.query("DELETE FROM notif_delivered WHERE day < ($1::date - 30)", [now.toISOString().slice(0, 10)]);
        return { sent, checked: rows.length };
    }
}
