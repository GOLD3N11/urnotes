/*
 * Serverul urNotes (backend/). Cât timp valoarea e `null`, aplicația funcționează ca înainte, fără server.
 * Când serverul e pornit undeva public, pune aici adresa lui, de exemplu:
 *   window.URNOTES_API = "https://api.urnotes.ro";
 *
 * Pentru încercări pe un singur dispozitiv (fără să schimbi aplicația pentru ceilalți), deschide aplicația cu
 *   ?api=http://localhost:8080   → folosește serverul pornit pe calculatorul tău (`docker compose up` în backend/)
 *   ?api=off                     → înapoi la varianta fără server
 * Alegerea rămâne ținută minte pe dispozitivul acela. Din motive de siguranță, din link se acceptă doar un server
 * de pe calculatorul tău (localhost / 127.0.0.1): un link primit de la altcineva nu-ți poate trimite datele în altă parte.
 */
window.URNOTES_API = null;

(function () {
    var KEY = "urn_api_local";
    var localOnly = function (url) {
        try {
            var u = new URL(url);
            return (u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
        } catch (e) { return false; }
    };
    try {
        var params = new URLSearchParams(location.search);
        var asked = params.get("api");
        if (asked !== null) {
            if (asked === "off" || asked === "") localStorage.removeItem(KEY);
            else if (localOnly(asked)) localStorage.setItem(KEY, asked.replace(/\/+$/, ""));
            // scoatem parametrul din adresă (ca un semn de carte să nu-l repete)
            params.delete("api");
            history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
        }
        var saved = localStorage.getItem(KEY);
        if (saved && localOnly(saved)) {
            window.URNOTES_API = saved;
            window.URNOTES_API_LOCAL = true;
        }
    } catch (e) { /* fără stocare: varianta fără server */ }
})();
