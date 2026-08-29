/* ==============================================================
   THD Dashboard — Monthly Targets / Goals (Firebase / Firestore)
   ==============================================================
   Same Firebase project as js/notes.js (team notes) — targets are
   just a second collection in the same database, so there's only
   one Firestore project to set up. One shared document holds every
   metric's target ("targets/monthly"), edited from the Settings
   page, and read by every KPI card's progress bar — this is
   intentionally a single team-wide value, not per-browser
   localStorage, so everyone sees the same number.

   ---- SETUP (one-time, on your end) ----
   If you've already set up Firestore for Notes, you only need to
   add one more match block to your existing Rules (Firestore ->
   Rules tab):

        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /notes/{noteId} {
              allow read, write: if true;
            }
            match /targets/{docId} {
              allow read, write: if true;
            }
          }
        }

   Same trust model as Notes and the publicly-published GA4/Sheets
   CSVs — anyone with the dashboard link can view/edit the shared
   targets; nothing else in the project is exposed. If Notes isn't
   set up yet, see js/notes.js for the full from-scratch steps —
   FIREBASE_CONFIG below is deliberately the same object.
   ============================================================== */

window.THD = window.THD || {};

(function (THD) {
    "use strict";

    // Same project as js/notes.js — see that file if this needs
    // to be copied into a fresh setup that doesn't have it yet.
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDZytEwyva5w6v85NiJZMNYfHVumCsiYWQ",
        authDomain: "thd-dashboard-note.firebaseapp.com",
        projectId: "thd-dashboard-note",
        storageBucket: "thd-dashboard-note.firebasestorage.app",
        messagingSenderId: "447126017532",
        appId: "1:447126017532:web:7eb56b0405927af0cd8e79"
    };

    const TARGETS_COLLECTION = "targets";
    const TARGETS_DOC = "monthly"; // single shared doc — one set of targets for the whole team
    const METRICS = ["users", "sessions", "purchases", "revenue", "cvr"];

    let db = null;
    let configured = false;

    function init() {
        if (configured) return true;
        if (FIREBASE_CONFIG.apiKey === "REPLACE_ME") return false; // not set up yet — caller falls back gracefully
        try {
            // js/notes.js may have already called initializeApp() for
            // the same (default) Firebase app — calling it twice
            // throws, so this only initializes if nothing has yet,
            // regardless of which of the two modules runs first.
            if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.firestore();
            configured = true;
            return true;
        } catch (e) {
            console.warn("[THD.goals] Firebase init failed:", e.message);
            return false;
        }
    }

    // Real-time subscription — calls onChange(targets) once with
    // whatever's already saved, then again whenever anyone on the
    // team updates a target from the Settings page. targets is a
    // plain { users, sessions, purchases, revenue, cvr } object;
    // any metric with no saved target comes back as null so the
    // caller can tell "no target set" apart from "target is 0".
    function subscribe(onChange) {
        if (!init()) {
            onChange({});
            return () => {};
        }
        return db.collection(TARGETS_COLLECTION).doc(TARGETS_DOC).onSnapshot(
            (doc) => {
                const d = doc.exists ? doc.data() : {};
                const targets = {};
                METRICS.forEach((m) => {
                    targets[m] = typeof d[m] === "number" ? d[m] : null;
                });
                onChange(targets);
            },
            (err) => {
                console.warn("[THD.goals] Firestore subscription failed:", err.message);
                onChange({});
            }
        );
    }

    // targets: { users, sessions, purchases, revenue, cvr }, any of
    // which may be null/undefined/"" to CLEAR that metric's target
    // (rather than saving it as 0, which would mean "hit the target
    // the moment there's any activity at all").
    function save(targets) {
        if (!init()) return Promise.reject(new Error("Firebase not configured"));
        const payload = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        METRICS.forEach((m) => {
            const val = targets ? targets[m] : undefined;
            if (val === null || val === undefined || val === "" || Number.isNaN(Number(val))) {
                payload[m] = firebase.firestore.FieldValue.delete();
            } else {
                payload[m] = Number(val);
            }
        });
        return db.collection(TARGETS_COLLECTION).doc(TARGETS_DOC).set(payload, { merge: true });
    }

    function isConfigured() {
        return FIREBASE_CONFIG.apiKey !== "REPLACE_ME";
    }

    THD.goals = {
        subscribe,
        save,
        isConfigured,
        METRICS
    };

})(window.THD);
