/* ==========================================================
   THD Dashboard — Passcode Gate
   Version 1.0

   ============================================================
   IMPORTANT — read this before relying on it:
   This is a LIGHT DETERRENT, not real security. This dashboard
   is a fully static site with no backend, so there is no way
   to truly enforce access control here. Anyone who opens
   browser dev tools and reads this file can see exactly how
   this check works, and the underlying CSV/Firestore endpoints
   this dashboard reads from are equally reachable with or
   without this gate. What this DOES stop: a stumbled-upon
   link, a search-engine crawler indexing the page, someone
   glancing at a screen without being invited to look closer —
   i.e. it keeps honest/casual visitors out by default. If you
   ever need real protection, put this behind an actual
   authenticated host (many static hosting providers have
   built-in password protection) — this is not a substitute
   for that.
   ============================================================

   The passcode itself is never stored in this file — only its
   SHA-256 hash, computed with the browser's built-in
   crypto.subtle API. That's a small step up from plaintext
   (a glance at the source doesn't hand someone the passcode
   directly), not real encryption.

   To change the passcode: open this file in a browser console
   and run:
       crypto.subtle.digest("SHA-256", new TextEncoder().encode("your-new-passcode"))
         .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("")))
   then paste the printed hash into PASSCODE_HASH below.
   ========================================================== */

(function () {
    "use strict";

    const PASSCODE_HASH = "7c74142155dbe5a34d1914fa5ce5e48fada03c25f953099df559ab0834d8aa05";
    const UNLOCK_KEY = "thd-dashboard-unlocked";

    async function sha256Hex(text) {
        const data = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    function isUnlocked() {
        try {
            return localStorage.getItem(UNLOCK_KEY) === "1";
        } catch (e) {
            return false;
        }
    }

    function removeGate() {
        const gate = document.getElementById("passcodeGate");
        if (gate) gate.remove();
        document.body.classList.remove("gate-active");
    }

    function showError(messageKey) {
        const error = document.getElementById("passcodeError");
        const input = document.getElementById("passcodeInput");
        if (error) {
            error.textContent = window.I18N ? window.I18N.t(messageKey || "gate.error") : "Incorrect passcode — try again.";
            error.style.display = "block";
        }
        if (input) {
            input.value = "";
            input.focus();
        }
    }

    function wireGate() {
        if (window.I18N) window.I18N.applyStatic();

        // Not configured yet (still the placeholder hash) — don't
        // lock people out of a dashboard with no real passcode set.
        if (PASSCODE_HASH === "REPLACE_ME") {
            removeGate();
            return;
        }

        if (isUnlocked()) {
            removeGate();
            return;
        }

        document.body.classList.add("gate-active");

        const form = document.getElementById("passcodeForm");
        const input = document.getElementById("passcodeInput");
        if (!form) return;

        if (input) input.focus();

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!window.crypto || !window.crypto.subtle) {
                showError("gate.errorNoCrypto");
                return;
            }
            sha256Hex((input.value || "").trim()).then((hash) => {
                if (hash === PASSCODE_HASH) {
                    try {
                        localStorage.setItem(UNLOCK_KEY, "1");
                    } catch (err) {
                        // Private browsing / storage disabled — will just re-prompt next visit.
                    }
                    removeGate();
                } else {
                    showError();
                }
            }).catch(() => {
                // crypto.subtle threw (e.g. still somehow reached this
                // point in an insecure context) rather than just being
                // absent — same message either way.
                showError("gate.errorNoCrypto");
            });
        });
    }

    document.addEventListener("DOMContentLoaded", wireGate);
})();
