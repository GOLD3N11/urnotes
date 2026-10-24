/* Cine face cererea. Aplicația trimite jetonul de autentificare Firebase („Authorization: Bearer …”);
   integrările (de ex. Adservio) trimit cheia lor („Authorization: Integration …”). */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import type { Config } from "./config.js";
import { unauthorized } from "./errors.js";

export interface Identity { uid: string; email: string; name: string; emailVerified: boolean }

export interface TokenVerifier { verify(token: string): Promise<Identity> }

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** Verifică jetonul Firebase după cheile publice Google (fără SDK-ul de admin și fără chei secrete). */
export function firebaseVerifier(projectId: string): TokenVerifier {
    const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS));
    return {
        async verify(token) {
            try {
                const { payload } = await jwtVerify(token, jwks, {
                    issuer: `https://securetoken.google.com/${projectId}`,
                    audience: projectId,
                    algorithms: ["RS256"]
                });
                if (!payload.sub) throw new Error("fără sub");
                return {
                    uid: payload.sub,
                    email: String(payload.email || ""),
                    name: String(payload.name || ""),
                    emailVerified: payload.email_verified === true
                };
            } catch {
                throw unauthorized("Sesiunea a expirat. Intră din nou în cont.");
            }
        }
    };
}

/** Doar local și în teste: „dev:<uid>:<email>[:<nume>]”. */
export function devVerifier(): TokenVerifier {
    return {
        async verify(token) {
            const m = /^dev:([\w-]{1,64}):([^:\s]*)(?::(.*))?$/.exec(token);
            if (!m) throw unauthorized("Jeton de test invalid.");
            return { uid: m[1], email: m[2], name: m[3] || "", emailVerified: true };
        }
    };
}

export function verifierFor(config: Config): TokenVerifier {
    return config.authMode === "dev" ? devVerifier() : firebaseVerifier(config.firebaseProjectId);
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export type Credential = { kind: "user"; token: string } | { kind: "integration"; key: string } | null;

export function readCredential(header: string | undefined): Credential {
    if (!header) return null;
    const [scheme, value] = header.split(/\s+/, 2);
    if (!value) return null;
    if (/^bearer$/i.test(scheme)) return { kind: "user", token: value };
    if (/^integration$/i.test(scheme)) return { kind: "integration", key: value };
    return null;
}
