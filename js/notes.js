/* ==============================================================
   THD Dashboard — Team Notes (Firebase / Firestore)
   ==============================================================
   Replaces the old localStorage-only note store so notes sync
   across every device/teammate instead of staying stuck to one
   browser. Requires the Firebase compat SDK scripts (loaded in
   index.html) and a Firestore database.

   ---- SETUP (one-time, on your end) ----
   1. Go to https://console.firebase.google.com -> Add project.
   2. In the new project: Build -> Firestore Database -> Create
      database -> Start in production mode (any region is fine).
   3. Firestore -> Rules tab, replace with:

        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /notes/{noteId} {
              allow read, write: if true;
            }
          }
        }

      This keeps it open only to the "notes" collection — same
      trust model as your publicly-published GA4/Sheets CSVs
      (anyone with the dashboard can read/add/delete notes; nothing
      else in the project is exposed). Click "Publish".
   4. Project settings (gear icon) -> General -> "Your apps" ->
      Add app -> Web (</> icon) -> register it (any nickname) ->
      it'll show you a firebaseConfig object.
   5. Paste those exact values into FIREBASE_CONFIG below, replacing
      the placeholders.
   ============================================================== */

window.THD = window.THD || {};

(function (THD) {
    "use strict";

    // ---- REPLACE THESE WITH YOUR REAL FIREBASE CONFIG VALUES ----
    const FIREBASE_CONFIG = {
        apiKey: "REPLACE_ME",
        authDomain: "REPLACE_ME.firebaseapp.com",
        projectId: "REPLACE_ME",
        storageBucket: "REPLACE_ME.appspot.com",
        messagingSenderId: "REPLACE_ME",
        appId: "REPLACE_ME"
    };

    const NOTES_COLLECTION = "notes";
    const AUTHOR_NAME_KEY = "thd-note-author";

    let db = null;
    let configured = false;

    function init() {
        if (configured) return true;
        if (FIREBASE_CONFIG.apiKey === "REPLACE_ME") return false; // not set up yet — caller falls back gracefully
        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.firestore();
            configured = true;
            return true;
        } catch (e) {
            console.warn("[THD.notes] Firebase init failed:", e.message);
            return false;
        }
    }

    // Real-time subscription — calls onChange(notesArray) once with
    // whatever's already in Firestore, then again every time any
    // device adds/edits/removes a note. Returns an unsubscribe
    // function (not currently used elsewhere, but good practice to
    // expose it). If Firebase isn't configured yet, calls back once
    // with an empty array so the UI still renders sensibly.
    function subscribe(onChange) {
        if (!init()) {
            onChange([]);
            return () => {};
        }
        return db.collection(NOTES_COLLECTION)
            .orderBy("createdAt", "desc")
            .onSnapshot(
                (snapshot) => {
                    const notes = snapshot.docs.map((doc) => {
                        const d = doc.data();
                        return {
                            id: doc.id,
                            text: d.text || "",
                            author: d.author || "",
                            category: d.category || "general",
                            // createdAt is a Firestore server timestamp once it
                            // round-trips; it can briefly be null for a note
                            // this same client just added, before the server
                            // confirms it — fall back to "now" for that instant.
                            createdAt: d.createdAt ? d.createdAt.toMillis() : Date.now()
                        };
                    });
                    onChange(notes);
                },
                (err) => {
                    console.warn("[THD.notes] Firestore subscription failed:", err.message);
                    onChange([]);
                }
            );
    }

    function add({ text, author, category }) {
        if (!init()) return Promise.reject(new Error("Firebase not configured"));
        return db.collection(NOTES_COLLECTION).add({
            text,
            author: author || "",
            category: category || "general",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    function remove(id) {
        if (!init()) return Promise.reject(new Error("Firebase not configured"));
        return db.collection(NOTES_COLLECTION).doc(id).delete();
    }

    // The author's own name is a per-device convenience, not shared
    // data — it stays in localStorage (like the theme/language
    // preferences) and is just attached to whatever note gets added.
    function getAuthorName() {
        try {
            return localStorage.getItem(AUTHOR_NAME_KEY) || "";
        } catch (e) {
            return "";
        }
    }

    function setAuthorName(name) {
        try {
            localStorage.setItem(AUTHOR_NAME_KEY, name);
        } catch (e) {
            // Private browsing / storage disabled — just won't be remembered next time.
        }
    }

    function isConfigured() {
        return FIREBASE_CONFIG.apiKey !== "REPLACE_ME";
    }

    THD.notes = {
        subscribe,
        add,
        remove,
        getAuthorName,
        setAuthorName,
        isConfigured
    };

})(window.THD);
