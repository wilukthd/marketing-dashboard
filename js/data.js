/* ==========================================================
   THD Analytics
   Live Data Layer
   Version 0.1

   Fetches published Google Sheets CSVs and shapes them into
   the same structures the UI/chart layers expect. Falls back
   to generated dummy data per-source if a URL isn't configured
   yet or the fetch fails, so the dashboard always renders.

   ---- HOW TO GO LIVE ----
   1. Publish each sheet/tab to the web as CSV:
      File > Share > Publish to web > select sheet > CSV
   2. Paste the resulting URLs into CONFIG below.
   3. Make sure each sheet's columns match the "Expected columns"
      comment above each loader function.
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    const CONFIG = {
        // Daily GA4 rollup: date, users, sessions, purchases, revenue
        GA4_DAILY_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFOBVOeXWRrqSmnIFlU_wmlMlN3bw9mHJsJF-8OhA9I5PVVRKwam6k1hYkUBWCqr9AroVCvCSHTrsy/pub?gid=442548806&single=true&output=csv",

        // GA4 acquisition breakdown: sourceMedium, sessions, users, purchases, revenue, channel
        GA4_SOURCES_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFOBVOeXWRrqSmnIFlU_wmlMlN3bw9mHJsJF-8OhA9I5PVVRKwam6k1hYkUBWCqr9AroVCvCSHTrsy/pub?gid=96802008&single=true&output=csv",

        // GA4 landing page breakdown: path, sessions
        GA4_LANDING_PAGES_CSV_URL: "",

        // Spreadsheet: WEB本店新規／リピータ monthly rollup
        // period, totalRevenue, totalOrders, newRevenue, newOrders,
        // repeatRevenue, repeatOrders, visitorsPc, visitorsSp, visitorsTotal
        NEW_REPEAT_CSV_URL: ""
    };

    /* ==========================================================
       CSV fetch helper
    ========================================================== */

    function fetchCsv(url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject(new Error("No URL configured"));
                return;
            }
            Papa.parse(url, {
                download: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (err) => reject(err)
            });
        });
    }

    /* ==========================================================
       GA4 exports dates as YYYYMMDD (e.g. 20260702), and since
       PapaParse's dynamicTyping reads that as the number
       20260702, it must be converted explicitly rather than
       passed to `new Date()` directly.
    ========================================================== */

    function parseGA4Date(raw) {
        const s = String(raw);
        if (/^\d{8}$/.test(s)) {
            return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }
        return s;
    }

    /* ==========================================================
       Loaders — each resolves to parsed rows, or null on failure
       so callers can fall back to dummy data independently.
    ========================================================== */

    async function loadDailyGA4() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_DAILY_CSV_URL);
            return rows
                .filter((r) => r.date)
                .map((r) => ({
                    date: parseGA4Date(r.date),
                    users: Number(r.users) || 0,
                    sessions: Number(r.sessions) || 0,
                    purchases: Number(r.purchases) || 0,
                    revenue: Number(r.revenue) || 0
                }))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (e) {
            console.warn("[THD.data] GA4 daily CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    async function loadSources() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_SOURCES_CSV_URL);
            return rows
                .filter((r) => r.sourceMedium)
                .map((r) => ({
                    sourceMedium: r.sourceMedium,
                    sessions: Number(r.sessions) || 0,
                    users: Number(r.users) || 0,
                    purchases: Number(r.purchases) || 0,
                    revenue: Number(r.revenue) || 0,
                    channel: r.channel || null,
                    cvr: r.sessions ? ((Number(r.purchases) || 0) / Number(r.sessions)) * 100 : 0
                }))
                .sort((a, b) => b.sessions - a.sessions);
        } catch (e) {
            console.warn("[THD.data] GA4 sources CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    async function loadNewRepeat() {
        try {
            const rows = await fetchCsv(CONFIG.NEW_REPEAT_CSV_URL);
            return rows.filter((r) => r.period);
        } catch (e) {
            console.warn("[THD.data] New/Repeat CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    async function loadLandingPages() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_LANDING_PAGES_CSV_URL);
            return rows
                .filter((r) => r.path)
                .map((r) => ({
                    path: r.path,
                    sessions: Number(r.sessions) || 0
                }))
                .sort((a, b) => b.sessions - a.sessions)
                .slice(0, 8);
        } catch (e) {
            console.warn("[THD.data] Landing pages CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    /* ==========================================================
       Channel classification (simplified GA4 default channel
       grouping) — used to build the Traffic Sources doughnut
       from the same source/medium rows as the Sources table,
       for sheets that don't include an explicit channel column.
    ========================================================== */

    function classifySourceChannel(sourceMedium) {
        if (!sourceMedium) return "Other";
        const parts = String(sourceMedium).split("/").map((s) => s.trim().toLowerCase());
        const source = parts[0] || "";
        const medium = parts[1] || "";

        if (source === "(direct)" && (medium === "(none)" || medium === "")) return "Direct";
        if (medium === "organic") return "Organic Search";
        if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "paidsearch") return "Paid Search";
        if (medium === "email") return "Email";
        if (medium === "referral") return "Referral";
        if (medium === "display" || medium === "cpm" || medium === "banner") return "Display";
        if (medium === "social") return "Social";
        return "Other";
    }

    function deriveTrafficBreakdown(sourceRows) {
        const totals = {};
        let totalSessions = 0;

        sourceRows.forEach((r) => {
            const channel = r.channel || classifySourceChannel(r.sourceMedium);
            totals[channel] = (totals[channel] || 0) + r.sessions;
            totalSessions += r.sessions;
        });

        const entries = Object.entries(totals)
            .filter(([, sessions]) => sessions > 0)
            .sort((a, b) => b[1] - a[1]);

        return {
            labels: entries.map(([channel]) => channel),
            values: entries.map(([, sessions]) => totalSessions ? Math.round((sessions / totalSessions) * 100) : 0)
        };
    }

    /* ==========================================================
       Date-range filtering (client-side, no re-fetch)
       Computes current-period totals + delta vs the prior
       period of equal length, from a full daily row set.
    ========================================================== */

    function filterDailyRange(dailyRows, days) {

        const current = dailyRows.slice(-days);
        const previous = dailyRows.slice(-days * 2, -days);

        const sum = (rows, key) => rows.reduce((acc, r) => acc + r[key], 0);
        const pctDelta = (curr, prev) => (prev ? ((curr - prev) / prev) * 100 : 0);

        const curUsers = sum(current, "users");
        const curSessions = sum(current, "sessions");
        const curPurchases = sum(current, "purchases");
        const curRevenue = sum(current, "revenue");

        const prevUsers = sum(previous, "users");
        const prevSessions = sum(previous, "sessions");
        const prevPurchases = sum(previous, "purchases");
        const prevRevenue = sum(previous, "revenue");

        const curCvr = curSessions ? (curPurchases / curSessions) * 100 : 0;
        const prevCvr = prevSessions ? (prevPurchases / prevSessions) * 100 : 0;

        return {
            labels: current.map((r) => new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
            users: current.map((r) => r.users),
            purchases: current.map((r) => r.purchases),
            kpi: {
                users: { value: curUsers, delta: pctDelta(curUsers, prevUsers), daily: curUsers / current.length },
                sessions: { value: curSessions, delta: pctDelta(curSessions, prevSessions), daily: curSessions / current.length },
                purchases: { value: curPurchases, delta: pctDelta(curPurchases, prevPurchases), daily: curPurchases / current.length },
                revenue: { value: curRevenue, delta: pctDelta(curRevenue, prevRevenue), daily: curRevenue / current.length },
                cvr: { value: curCvr, delta: pctDelta(curCvr, prevCvr), daily: 6.50 }
            }
        };
    }

    THD.data = {
        CONFIG,
        loadDailyGA4,
        loadSources,
        loadNewRepeat,
        loadLandingPages,
        classifySourceChannel,
        deriveTrafficBreakdown,
        filterDailyRange
    };

})(window.THD);
