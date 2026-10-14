/* urNotes · Start (ultimul fișier încărcat).
   Fișierele din js/ se încarcă în ordinea din index.html și împart același spațiu global (scripturi clasice). */
"use strict";

/* ==================== START ==================== */
// La final, ca toate constantele de mai sus să fie deja definite.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}
