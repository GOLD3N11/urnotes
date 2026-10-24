/* Cine are voie să vadă și să schimbe datele unui elev. O funcție pură: toate celelalte module o folosesc
   prin AccountsService.access(), ca regula să fie scrisă într-un singur loc.

   - elevul: își vede și își schimbă toate datele
   - părintele și profesorul legați de elev: văd tot, oricând; nu schimbă nimic
   - integrarea Adservio permisă de elev: schimbă doar notele importate; nu citește restul
   - oricine altcineva (inclusiv administratorul): nimic */
export type Role = "student" | "parent" | "teacher";

export type Actor =
    | { kind: "user"; id: string; role: Role; isAdmin: boolean }
    | { kind: "integration"; id: string; integrationKind: "adservio" };

export interface Access {
    read: boolean;
    /** „all” = toate datele; „grades” = doar notele (importul); „none” = nimic */
    write: "all" | "grades" | "none";
}

export interface AccessFacts {
    /** există o legătură elev ↔ acest părinte/profesor */
    linked: boolean;
    /** elevul a permis această integrare */
    granted: boolean;
}

export const NO_ACCESS: Access = { read: false, write: "none" };

export function accessTo(actor: Actor, studentId: string, studentRole: Role | null, facts: AccessFacts): Access {
    if (studentRole !== "student") return NO_ACCESS;
    if (actor.kind === "user") {
        if (actor.id === studentId) return { read: true, write: "all" };
        if ((actor.role === "parent" || actor.role === "teacher") && facts.linked) return { read: true, write: "none" };
        return NO_ACCESS;
    }
    if (actor.kind === "integration" && facts.granted) return { read: false, write: "grades" };
    return NO_ACCESS;
}
