/* Trimiterea notificărilor push (Web Push, cu chei VAPID). Ascunsă după o interfață, ca testele să n-o trimită de-adevăratelea. */
import webpush from "web-push";
import type { VapidKeys } from "../../config.js";

export interface PushTarget { endpoint: string; keys: { p256dh: string; auth: string } }
export type PushResult = "ok" | "gone" | "error";
export interface PushSender { send(target: PushTarget, payload: string): Promise<PushResult> }

export function webPushSender(vapid: VapidKeys): PushSender {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    return {
        async send(target, payload) {
            try {
                await webpush.sendNotification(target, payload, { TTL: 6 * 3600, urgency: "normal" });
                return "ok";
            } catch (err) {
                const code = (err as { statusCode?: number }).statusCode;
                // 404/410: abonamentul nu mai există (aplicația dezinstalată, permisiunea retrasă)
                return code === 404 || code === 410 ? "gone" : "error";
            }
        }
    };
}

/** Fără chei VAPID: nu trimite nimic (amintirile rămân doar în aplicație). */
export const noPushSender: PushSender = { async send() { return "error"; } };
