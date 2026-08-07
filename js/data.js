/* ==========================================================
   THD Analytics
   Live Data Layer
   Version 1.0

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

        // GA4 landing page breakdown — fixed 30-day rolling window
        // (the underlying GA4 export is capped there; ~60k rows even
        // at 30 days, so no more history is kept). Columns: date,
        // landingPage, pageTitle, landingPagePlusQueryString, sessions,
        // ecommercePurchases, totalRevenue. See loadLandingPages() —
        // grouping uses pageTitle (readable) rather than landingPage,
        // since landingPage is a generic template shared by hundreds of
        // different product pages (the actual product only shows up in
        // the query string / pageTitle).
        GA4_LANDING_PAGES_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFOBVOeXWRrqSmnIFlU_wmlMlN3bw9mHJsJF-8OhA9I5PVVRKwam6k1hYkUBWCqr9AroVCvCSHTrsy/pub?gid=1176432957&single=true&output=csv",

        // Spreadsheet: WEB本店新規／リピータ — published as-is, raw
        // layout (two header rows, no need to restructure the sheet).
        // See loadNewRepeat() for the exact column mapping.
        NEW_REPEAT_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQSRf48VUc7RKvkbgkwFXDrYxPidpJaOX6xRRsu-y19J4Jas-RsrLlzNT3CCh0pxR1Ha7rLaXF1TJvS/pub?gid=0&single=true&output=csv"
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

    // For sheets with merged/multi-row headers (like WEB本店新規／
    // リピータ), header:true would collapse duplicate sub-header
    // names (前月比 repeats 8 times) into one column and lose data.
    // This reads plain row arrays instead so the loader can map
    // columns by position.
    function fetchRawCsv(url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject(new Error("No URL configured"));
                return;
            }
            Papa.parse(url, {
                download: true,
                header: false,
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
                .filter((r) => r.sourceMedium && r.date)
                .map((r) => ({
                    sourceMedium: r.sourceMedium,
                    date: parseGA4Date(r.date),
                    sessions: Number(r.sessions) || 0,
                    users: Number(r.users) || 0,
                    purchases: Number(r.purchases) || 0,
                    revenue: Number(r.revenue) || 0,
                    channel: r.channel || null
                }));
        } catch (e) {
            console.warn("[THD.data] GA4 sources CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    // Raw column layout (0-indexed), matching the sheet exactly as
    // published — two header rows (merged group labels, then the
    // 売上/前月比/昨年比/受注件数/... sub-labels), then one row per
    // month. No blank spacer column — confirmed against the actual
    // published CSV (the web-preview HTML table view showed an
    // extra blank column C, but that turned out to be a rendering
    // artifact only, not real data):
    //   0  年度 (year)              13 リピーター 昨年比
    //   1  月度 (month, 1-12)       14 リピーター 売上
    //   2  総合 売上                15 リピーター 前月比
    //   3  総合 前月比               16 リピーター 昨年比
    //   4  総合 昨年比               17 リピーター 受注件数
    //   5  総合 受注件数             18 リピーター 前月比
    //   6  総合 前月比               19 リピーター 昨年比
    //   7  総合 昨年比               20 訪問者数 PC
    //   8  新規 売上                 21 訪問者数 スマホ
    //   9  新規 前月比               22 訪問者数 合計
    //   10 新規 昨年比               23 訪問者数 前月比
    //   11 新規 受注件数             24 訪問者数 昨年比
    //   12 新規 前月比
    // Only year/month/revenue/orders/visitor columns are used — the
    // 前月比/昨年比 (MoM/YoY %) columns are ignored since the dashboard
    // computes its own period-over-period deltas from the raw figures.
    // The published sheet formats larger numbers with thousand-
    // separator commas plus a trailing space (e.g. "29,515,711 "),
    // which arrive as unparsed strings since PapaParse's dynamic
    // typing only auto-converts plain numeric strings. Number()
    // on a comma-containing string returns NaN, so this strips
    // commas/whitespace first.
    function parseFormattedNumber(v) {
        if (typeof v === "number") return v;
        if (v === null || v === undefined || v === "") return 0;
        const n = parseFloat(String(v).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : 0;
    }

    async function loadNewRepeat() {
        try {
            const raw = await fetchRawCsv(CONFIG.NEW_REPEAT_CSV_URL);
            return raw
                .slice(2) // skip the two header rows
                .filter((r) => Number.isFinite(r[0]) && Number.isFinite(r[1])) // drops blank/leftover formula rows at the bottom
                .sort((a, b) => (a[0] * 12 + a[1]) - (b[0] * 12 + b[1]))
                .map((r) => ({
                    period: businessMonthLabel(r[0], r[1] - 1),
                    totalRevenue: parseFormattedNumber(r[2]),
                    totalOrders: parseFormattedNumber(r[5]),
                    newRevenue: parseFormattedNumber(r[8]),
                    newOrders: parseFormattedNumber(r[11]),
                    repeatRevenue: parseFormattedNumber(r[14]),
                    repeatOrders: parseFormattedNumber(r[17]),
                    visitorsPc: parseFormattedNumber(r[20]),
                    visitorsSp: parseFormattedNumber(r[21]),
                    visitorsTotal: parseFormattedNumber(r[22])
                }));
        } catch (e) {
            console.warn("[THD.data] New/Repeat CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    // This site's mobile pages all live under a "/smartphone/" path
    // prefix and PC pages don't — so device can be read straight off
    // landingPage without GA4 needing a separate device dimension.
    function classifyDevice(landingPage) {
        if (!landingPage) return "Unknown";
        return landingPage.startsWith("/smartphone/") ? "Smartphone" : "PC";
    }

    // Distinguishes actual content (products, blog posts) from the
    // login/checkout/account/home "system" pages that technically
    // count as landing pages in GA4 but carry no marketing signal —
    // nobody clicks an ad to land on an order-confirmation screen.
    //
    // This site's own title template turns out to be the reliable
    // signal: product/content pages are titled "{item name}｜{shop
    // name}" (a pipe — either the full-width｜or a plain ASCII | shows
    // up in the data), while every system/navigational page either
    // shows just the shop name alone, joins it with a different
    // separator ("-", "/"), or has no shop-name suffix at all
    // (the checkout-flow steps). Checking for that pipe is a single
    // rule that covers every case observed so far, and — unlike an
    // enumerated keyword blocklist — doesn't need updating if a new
    // system page shows up later using text we haven't seen yet.
    //
    // An earlier version of this function prioritized the landingPage
    // path (e.g. detail.html/shopdetail/ => "product") over the title.
    // That was wrong: a handful of rows had one of those paths paired
    // with a generic title (an unresolved/broken product hit), and the
    // path check overrode the title, wrongly keeping them as "product".
    // Title wins now — if the title itself doesn't look like a real
    // item, the path it happened to load on doesn't matter.
    function classifyLandingPageType(landingPage, pageTitle) {
        const path = String(landingPage || "");
        const title = String(pageTitle || "");

        if (!title || title === "(not set)") return "system";
        if (/[｜|]/.test(title)) return "content";
        if (/blog/i.test(path) || /ブログ/.test(title)) return "content";

        return "system";
    }

    async function loadLandingPages() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_LANDING_PAGES_CSV_URL);
            return rows
                .filter((r) => r.date) // keep rows even when landingPage/pageTitle is blank — that's a real "(not set)" hit, not junk
                .map((r) => {
                    const landingPage = r.landingPage || "";
                    const pageTitle = r.pageTitle || "(not set)";
                    return {
                        date: parseGA4Date(r.date),
                        landingPage,
                        pageTitle,
                        device: classifyDevice(landingPage),
                        pageType: classifyLandingPageType(landingPage, pageTitle),
                        sessions: Number(r.sessions) || 0,
                        // Column name confirmed from the sheet is truncated in
                        // the UI preview ("ecommercePurc…") — covering the
                        // likely full names defensively so this doesn't
                        // silently read as 0 if the exact header differs.
                        purchases: Number(r.ecommercePurchases ?? r.ecommercePurc ?? r.purchases) || 0,
                        revenue: Number(r.totalRevenue) || 0
                    };
                });
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

        // Broken/missing attribution (bad UTMs, cross-domain linking
        // gaps, ad blockers stripping referrers, etc.) — kept as its
        // own bucket rather than folded into "Other" so it's visible
        // instead of quietly inflating a generic catch-all.
        if (source === "(not set)" || medium === "(not set)") return "(not set)";

        if (source === "(direct)" && (medium === "(none)" || medium === "")) return "Direct";
        if (medium === "organic") return "Organic Search";
        if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "paidsearch") return "Paid Search";
        if (medium === "email") return "Email";
        if (medium === "referral") return "Referral";
        if (medium === "display" || medium === "cpm" || medium === "banner") return "Display";
        if (medium === "social") return "Social";
        return "Other";
    }

    /* ==========================================================
       Ad Platform classification
       A finer cut than the standard channel grouping above —
       groups by the actual vendor (Google, Meta, Yahoo, Criteo,
       LINE, Bing…) and splits paid vs organic within each, so ad
       spend efficiency can be compared platform-by-platform
       instead of lumped into "Paid Search" / "Display" / "Social".
       This is what different agencies actually run campaigns on,
       so it's the more useful cut when the question is "which
       platform's ads are working."
    ========================================================== */

    const PLATFORM_MATCHERS = [
        { test: /google|doubleclick|admanager/, label: "Google" },
        { test: /facebook|instagram|meta/, label: "Meta" },
        { test: /yahoo/, label: "Yahoo" },
        { test: /criteo/, label: "Criteo" },
        { test: /^line$|\bline\b/, label: "LINE" },
        { test: /bing|microsoft/, label: "Bing" },
        { test: /twitter|^x\.com$|^x$/, label: "Twitter/X" },
        { test: /pinterest/, label: "Pinterest" },
        { test: /rakuten/, label: "Rakuten" },
        { test: /newsletter|email|mailchimp|klaviyo/, label: "Email" }
    ];

    // Platforms that run both ads and organic/owned presence get
    // split into "<Platform> Ads" vs "<Platform> Organic" so the two
    // don't get averaged together; platforms below are effectively
    // single-channel in this data and read fine as just the name.
    const SPLIT_PAID_ORGANIC = ["Google", "Meta", "Yahoo", "Bing"];

    function classifyPlatform(sourceMedium) {
        if (!sourceMedium) return "Other";
        const parts = String(sourceMedium).split("/").map((s) => s.trim().toLowerCase());
        const source = parts[0] || "";
        const medium = parts[1] || "";

        if (source === "(not set)" || medium === "(not set)") return "(not set)";

        if (source === "(direct)" && (medium === "(none)" || medium === "")) return "Direct";

        const match = PLATFORM_MATCHERS.find((m) => m.test.test(source));
        if (match) {
            if (SPLIT_PAID_ORGANIC.includes(match.label)) {
                const isPaid = /cpc|ppc|paid|cpm|display|banner/.test(medium);
                return `${match.label} ${isPaid ? "Ads" : "Organic"}`;
            }
            return match.label;
        }

        if (medium === "referral") return "Referral (Other)";
        if (medium === "organic") return "Organic Search (Other)";
        if (medium === "social") return "Social (Other)";
        if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "cpm" || medium === "display") return "Paid (Other)";
        return "Other";
    }

    // Same classification a source/medium row would fall into for a
    // given groupBy ("platform" or "channel") — shared so the Session
    // Source table can be filtered down to exactly the rows behind
    // one doughnut/comparison-table bucket (e.g. drilling into
    // "Referral (Other)" to see which sites make it up).
    function classifyForGroupBy(row, groupBy) {
        return groupBy === "platform"
            ? classifyPlatform(row.sourceMedium)
            : (row.channel || classifySourceChannel(row.sourceMedium));
    }

    // Distinct channel values actually present in the data, used to
    // populate the "All Sources" filter dropdown with real options
    // instead of a hardcoded list that might not match what's there.
    function listAvailableChannels(sourceRows, groupBy = "channel") {
        const set = new Set();
        (sourceRows || []).forEach((r) => set.add(classifyForGroupBy(r, groupBy)));
        return Array.from(set).sort();
    }

    // Collapses per-day-per-source rows (already filtered down to one
    // channel by the caller) into one row per date, in the same shape
    // as the daily GA4 rollup — lets the "All Sources" filter reuse
    // filterDailyRange/buildBusinessMonths/the trend chart exactly as
    // they already work, just fed a source-scoped daily series instead
    // of the full-property one.
    function buildDailyRowsFromSources(sourceRows) {
        const byDate = {};
        (sourceRows || []).forEach((r) => {
            if (!byDate[r.date]) byDate[r.date] = { date: r.date, users: 0, sessions: 0, purchases: 0, revenue: 0 };
            const d = byDate[r.date];
            d.users += r.users;
            d.sessions += r.sessions;
            d.purchases += r.purchases;
            d.revenue += r.revenue;
        });
        return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Daily series for one specific channel/platform within a date
    // window — powers the "click a channel to see its trend instead
    // of the doughnut" view. Just filters down to that one channel's
    // rows first, then reuses the same daily aggregator above.
    function buildChannelDailySeries(sourceRows, channel, groupBy, start, end) {
        const filtered = (sourceRows || []).filter((r) =>
            classifyForGroupBy(r, groupBy) === channel && inRange(r.date, start, end)
        );
        return buildDailyRowsFromSources(filtered);
    }

    function deriveTrafficBreakdown(sourceRows, groupBy) {
        const totals = {};
        let totalSessions = 0;

        sourceRows.forEach((r) => {
            const channel = classifyForGroupBy(r, groupBy);
            if (!totals[channel]) totals[channel] = { sessions: 0, revenue: 0, purchases: 0 };
            totals[channel].sessions += r.sessions;
            totals[channel].revenue += r.revenue;
            totals[channel].purchases += r.purchases;
            totalSessions += r.sessions;
        });

        const entries = Object.entries(totals)
            .filter(([, t]) => t.sessions > 0)
            .sort((a, b) => b[1].sessions - a[1].sessions);

        return {
            totalSessions,
            labels: entries.map(([channel]) => channel),
            values: entries.map(([, t]) => totalSessions ? Math.round((t.sessions / totalSessions) * 100) : 0),
            channels: entries.map(([channel, t]) => ({
                label: channel,
                sessions: t.sessions,
                revenue: t.revenue,
                cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0,
                percent: totalSessions ? Math.round((t.sessions / totalSessions) * 100) : 0
            }))
        };
    }

    /* ==========================================================
       Date Range Resolution
       Supports both rolling windows (7d/14d/3m/6m) and
       calendar-anchored windows (this month/this year/last year).

       "Previous period" for delta comparisons is normally the
       same-length window immediately preceding the start date.
       Year-level ranges ("year", "lastYear") are the exception:
       since they're meant to show seasonal performance, their
       comparison window is the same month/day span exactly one
       calendar year earlier — e.g. Jan 1–Jul 22 2026 compares to
       Jan 1–Jul 22 2025, not a same-length rolling window ending
       Dec 31 2025 (which would land mostly in H2 and say nothing
       about season-over-season change).
    ========================================================== */

    function startOfDay(d) {
        const copy = new Date(d);
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    function daysAgo(n, from) {
        const d = startOfDay(from || new Date());
        d.setDate(d.getDate() - n);
        return d;
    }

    const RANGE_DEFS = {
        "today": () => ({ start: startOfDay(new Date()), end: startOfDay(new Date()) }),
        "yesterday": () => ({ start: daysAgo(1), end: daysAgo(1) }),
        "7d": () => ({ start: daysAgo(6), end: startOfDay(new Date()) }),
        "14d": () => ({ start: daysAgo(13), end: startOfDay(new Date()) }),
        "30d": () => ({ start: daysAgo(29), end: startOfDay(new Date()) }),
        "month": () => {
            const now = new Date();
            return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: startOfDay(now) };
        },
        "lastMonth": () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day of previous month
            return { start, end: startOfDay(end) };
        },
        "3m": () => ({ start: daysAgo(89), end: startOfDay(new Date()) }),
        "6m": () => ({ start: daysAgo(179), end: startOfDay(new Date()) }),
        "year": () => {
            const now = new Date();
            return { start: new Date(now.getFullYear(), 0, 1), end: startOfDay(now) };
        },
        "lastYear": () => {
            const y = new Date().getFullYear() - 1;
            return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
        }
    };

    // Ranges whose comparison window should be "same calendar dates,
    // one year back" rather than "same number of days, immediately
    // preceding" — see note above.
    const YEAR_ALIGNED_RANGES = new Set(["year", "lastYear"]);

    function resolveRange(rangeKey, customRange) {
        let start, end;
        if (rangeKey === "custom" && customRange && customRange.start && customRange.end) {
            start = startOfDay(customRange.start);
            end = startOfDay(customRange.end);
        } else {
            const def = RANGE_DEFS[rangeKey] || RANGE_DEFS["month"];
            ({ start, end } = def());
        }

        const spanDays = Math.round((end - start) / 86400000) + 1;

        let prevStart, prevEnd;
        if (YEAR_ALIGNED_RANGES.has(rangeKey)) {
            prevStart = startOfDay(new Date(start.getFullYear() - 1, start.getMonth(), start.getDate()));
            prevEnd = startOfDay(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()));
        } else {
            prevEnd = new Date(start);
            prevEnd.setDate(prevEnd.getDate() - 1);
            prevStart = daysAgo(spanDays - 1, prevEnd);
        }

        return { start, end, spanDays, prevStart, prevEnd };
    }

    function inRange(dateStr, start, end) {
        const d = startOfDay(new Date(dateStr));
        return d >= start && d <= end;
    }

    /* ==========================================================
       Daily rows -> KPI cards + trend chart
    ========================================================== */

    function filterDailyRange(dailyRows, rangeKey, customRange) {

        const { start, end, prevStart, prevEnd } = resolveRange(rangeKey, customRange);

        const current = dailyRows.filter((r) => inRange(r.date, start, end));
        const previous = dailyRows.filter((r) => inRange(r.date, prevStart, prevEnd));

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
        const dayCount = current.length || 1;

        return {
            labels: current.map((r) => window.I18N.formatDayLabel(r.date)),
            series: {
                users: current.map((r) => r.users),
                sessions: current.map((r) => r.sessions),
                purchases: current.map((r) => r.purchases),
                revenue: current.map((r) => r.revenue),
                cvr: current.map((r) => (r.sessions ? (r.purchases / r.sessions) * 100 : 0))
            },
            kpi: {
                users: { value: curUsers, delta: pctDelta(curUsers, prevUsers), daily: curUsers / dayCount },
                sessions: { value: curSessions, delta: pctDelta(curSessions, prevSessions), daily: curSessions / dayCount },
                purchases: { value: curPurchases, delta: pctDelta(curPurchases, prevPurchases), daily: curPurchases / dayCount },
                revenue: { value: curRevenue, delta: pctDelta(curRevenue, prevRevenue), daily: curRevenue / dayCount },
                cvr: { value: curCvr, delta: pctDelta(curCvr, prevCvr), daily: 6.50 }
            }
        };
    }

    /* ==========================================================
       Key Insights
       Turns the KPI deltas and traffic channel breakdown that
       are already computed for the current date range into a
       few sentences, so the panel reflects whatever range/filter
       is active instead of showing fixed placeholder text.
    ========================================================== */

    // Wraps a figure in a <span> so ui.js's renderInsights (which
    // inserts these strings via innerHTML) can visually emphasize it
    // with color — green/red for a clear direction, blue for a
    // neutral highlight like a share-of-total. Kept as a tiny helper
    // here rather than in ui.js since this is where the sentiment
    // ("is this good or bad") is actually known.
    function highlight(text, sentiment) {
        return `<span class="insightNum ${sentiment}">${text}</span>`;
    }

    function buildInsights(kpi, channels) {
        const insights = [];

        if (kpi && kpi.revenue) {
            const d = kpi.revenue.delta;
            const figure = highlight(`${Math.abs(d).toFixed(1)}%`, d >= 0 ? "pos" : "neg");
            const direction = window.I18N.t(d >= 0 ? "insight.increased" : "insight.decreased");
            insights.push(window.I18N.t("insight.revenueChange", { direction, figure }));
        }

        if (channels && channels.length) {
            const totalRevenue = channels.reduce((sum, c) => sum + c.revenue, 0);
            const topByRevenue = channels.reduce((a, b) => (b.revenue > a.revenue ? b : a), channels[0]);
            const share = totalRevenue ? Math.round((topByRevenue.revenue / totalRevenue) * 100) : 0;
            const label = `<strong>${window.I18N.channelLabel(topByRevenue.label)}</strong>`;
            insights.push(window.I18N.t("insight.topChannelRevenue", { label, figure: highlight(share + "%", "neutral") }));

            const notSet = channels.find((c) => c.label === "(not set)");
            if (notSet) {
                const totalSessions = channels.reduce((sum, c) => sum + c.sessions, 0);
                const notSetShare = totalSessions ? Math.round((notSet.sessions / totalSessions) * 100) : 0;
                if (notSetShare >= 5) {
                    const figure = highlight(notSetShare + "%", "neg");
                    const notSetLabel = `<strong>${window.I18N.channelLabel("(not set)")}</strong>`;
                    insights.push(window.I18N.t("insight.notSetShare", { figure, notSet: notSetLabel }));
                }
            }
        }

        if (kpi) {
            const movers = [
                { key: "users", labelKey: "insight.mover.users" },
                { key: "sessions", labelKey: "insight.mover.sessions" },
                { key: "purchases", labelKey: "insight.mover.purchases" }
            ];
            let biggest = null;
            movers.forEach(({ key, labelKey }) => {
                const d = kpi[key] ? kpi[key].delta : 0;
                if (!biggest || Math.abs(d) > Math.abs(biggest.delta)) biggest = { labelKey, delta: d };
            });
            if (biggest) {
                const figure = highlight(`${Math.abs(biggest.delta).toFixed(1)}%`, biggest.delta >= 0 ? "pos" : "neg");
                const direction = window.I18N.t(biggest.delta >= 0 ? "insight.increased" : "insight.decreased");
                insights.push(window.I18N.t("insight.moverChange", { label: window.I18N.t(biggest.labelKey), direction, figure }));
            }
        }

        if (kpi && kpi.cvr) {
            const d = kpi.cvr.delta;
            const figure = highlight(`${kpi.cvr.value.toFixed(2)}%`, d >= 0 ? "pos" : "neg");
            const direction = window.I18N.t(d >= 0 ? "insight.cvrImproved" : "insight.cvrDeclined");
            insights.push(window.I18N.t("insight.cvrChange", { direction, figure }));
        }

        return insights;
    }

    /* ==========================================================
       New / Repeat Insights
       Runs on the FULL New/Repeat history (not just the 12 months
       shown in the table), since the year-over-year and trend
       comparisons below need to look back further than the visible
       window.
    ========================================================== */

    function buildNewRepeatInsights(rows) {
        const insights = [];
        if (!rows || rows.length < 2) return insights;

        const latest = rows[rows.length - 1];
        const orderShare = (r) => (r.newOrders + r.repeatOrders)
            ? (r.newOrders / (r.newOrders + r.repeatOrders)) * 100
            : 0;
        const latestShare = orderShare(latest);
        const period = `<strong>${latest.period}</strong>`;
        const shareText = highlight(latestShare.toFixed(1) + "%", "neutral");

        // New customer share of orders, with YoY comparison once a
        // full year of history is available.
        if (rows.length > 12) {
            const yearAgo = rows[rows.length - 13];
            const diff = latestShare - orderShare(yearAgo);
            const figure = highlight(`${Math.abs(diff).toFixed(1)} ${window.I18N.t("unit.pts")}`, diff >= 0 ? "pos" : "neg");
            const direction = window.I18N.t(diff >= 0 ? "newRepeatInsight.up" : "newRepeatInsight.down");
            insights.push(window.I18N.t("newRepeatInsight.newShareYoy", { share: shareText, period, direction, figure }));
        } else {
            insights.push(window.I18N.t("newRepeatInsight.newShare", { share: shareText, period }));
        }

        // Repeat customers' share of revenue — often a different
        // number than their share of orders, since basket sizes differ.
        const repeatRevenueShare = latest.totalRevenue ? (latest.repeatRevenue / latest.totalRevenue) * 100 : 0;
        insights.push(window.I18N.t("newRepeatInsight.repeatRevenueShare", {
            figure: highlight(repeatRevenueShare.toFixed(1) + "%", "neutral"),
            period
        }));

        // AOV comparison between new and repeat customers this month.
        const newAov = latest.newOrders ? latest.newRevenue / latest.newOrders : 0;
        const repeatAov = latest.repeatOrders ? latest.repeatRevenue / latest.repeatOrders : 0;
        if (newAov && repeatAov) {
            const repeatHigher = repeatAov >= newAov;
            const pctDiff = repeatHigher
                ? ((repeatAov - newAov) / newAov) * 100
                : ((newAov - repeatAov) / repeatAov) * 100;
            const higher = Math.round(repeatHigher ? repeatAov : newAov).toLocaleString("en-US");
            const lower = Math.round(repeatHigher ? newAov : repeatAov).toLocaleString("en-US");
            if (pctDiff < 2) {
                insights.push(window.I18N.t("newRepeatInsight.aovSame", { higher, lower }));
            } else {
                const figure = highlight(`${pctDiff.toFixed(1)}%`, "neutral");
                const who = window.I18N.t(repeatHigher ? "newRepeatInsight.repeat" : "newRepeatInsight.new");
                const otherWho = window.I18N.t(repeatHigher ? "newRepeatInsight.newLower" : "newRepeatInsight.repeatLower");
                insights.push(window.I18N.t("newRepeatInsight.aovDiff", { who, otherWho, figure, higher, lower }));
            }
        }

        // Recent direction: average new-customer share over the last
        // 3 months vs the 3 months before that.
        if (rows.length >= 6) {
            const avgShare = (arr) => arr.reduce((sum, r) => sum + orderShare(r), 0) / arr.length;
            const trendDiff = avgShare(rows.slice(-3)) - avgShare(rows.slice(-6, -3));
            if (Math.abs(trendDiff) >= 1) {
                const figure = highlight(`${Math.abs(trendDiff).toFixed(1)} ${window.I18N.t("unit.pts")}`, trendDiff >= 0 ? "pos" : "neg");
                const direction = window.I18N.t(trendDiff >= 0 ? "newRepeatInsight.trendingUp" : "newRepeatInsight.trendingDown");
                insights.push(window.I18N.t("newRepeatInsight.trend", { direction, figure }));
            }
        }

        return insights;
    }

    /* ==========================================================
       Anomaly Detection
       Flags any day within the selected range whose value sits
       far outside that same range's own average (z-score based,
       so "far outside" is relative to the period, not a fixed
       number) — a simple stand-in for "something happened here"
       without needing an external events calendar.
    ========================================================== */

    const ANOMALY_Z_THRESHOLD = 2;
    const ANOMALY_MIN_DAYS = 5;

    const ANOMALY_METRIC_I18N_KEYS = {
        users: "kpi.totalUsers",
        sessions: "kpi.sessions",
        purchases: "kpi.purchases",
        revenue: "kpi.revenue",
        cvr: "kpi.cvr"
    };

    const ANOMALY_FORMATTERS = {
        users: (v) => Math.round(v).toLocaleString("en-US"),
        sessions: (v) => Math.round(v).toLocaleString("en-US"),
        purchases: (v) => Math.round(v).toLocaleString("en-US"),
        revenue: (v) => "¥" + Math.round(v).toLocaleString("en-US"),
        cvr: (v) => v.toFixed(2) + "%"
    };

    // Today's row is still accumulating live traffic, so it always
    // reads as a drop relative to any finished day — not a real
    // anomaly. Strip it before anomaly detection only; KPI totals
    // still include today, since "This Month" etc. should naturally
    // include today-so-far like any other dashboard.
    function excludeToday(labels, series) {
        const todayLabel = window.I18N.formatDayLabel(new Date());
        if (!labels.length || labels[labels.length - 1] !== todayLabel) {
            return { labels, series };
        }
        const trimmedSeries = {};
        Object.keys(series).forEach((key) => {
            trimmedSeries[key] = series[key].slice(0, -1);
        });
        return { labels: labels.slice(0, -1), series: trimmedSeries };
    }

    function detectAnomalies(labels, series) {
        const anomalies = [];

        Object.keys(series || {}).forEach((key) => {
            const values = series[key] || [];
            const n = values.length;
            if (n < ANOMALY_MIN_DAYS) return;

            const mean = values.reduce((a, b) => a + b, 0) / n;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            if (!stdDev) return;

            const format = ANOMALY_FORMATTERS[key] || ((v) => v);

            values.forEach((v, i) => {
                const z = (v - mean) / stdDev;
                if (Math.abs(z) >= ANOMALY_Z_THRESHOLD) {
                    anomalies.push({
                        metric: window.I18N.t(ANOMALY_METRIC_I18N_KEYS[key] || key),
                        date: labels[i],
                        valueText: format(v),
                        meanText: format(mean),
                        z,
                        direction: z > 0 ? "spike" : "drop"
                    });
                }
            });
        });

        anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
        return anomalies;
    }

    function buildAnomalyInsights(labels, series) {
        const trimmed = excludeToday(labels, series);
        return detectAnomalies(trimmed.labels, trimmed.series)
            .slice(0, 2)
            .map((a) => {
                const verb = window.I18N.t(a.direction === "spike" ? "anomaly.spike" : "anomaly.drop");
                const figure = highlight(a.valueText, a.direction === "spike" ? "pos" : "neg");
                return window.I18N.t("anomaly.sentence", {
                    metric: a.metric,
                    verb,
                    date: a.date,
                    figure,
                    mean: a.meanText
                });
            });
    }

    /* ==========================================================
       Per-day-per-source rows -> Session Source table +
       Traffic Sources doughnuts. Aggregates matching rows within
       an arbitrary [start, end] window into one row per
       sourceMedium — used for both the current and the previous
       period so the two are built the exact same way.
    ========================================================== */

    function filterSourcesByDates(sourceRows, start, end) {
        const inWindow = sourceRows.filter((r) => inRange(r.date, start, end));

        const totals = {};
        inWindow.forEach((r) => {
            if (!totals[r.sourceMedium]) {
                totals[r.sourceMedium] = {
                    sourceMedium: r.sourceMedium,
                    sessions: 0, users: 0, purchases: 0, revenue: 0,
                    channel: r.channel || null
                };
            }
            const t = totals[r.sourceMedium];
            t.sessions += r.sessions;
            t.users += r.users;
            t.purchases += r.purchases;
            t.revenue += r.revenue;
        });

        return Object.values(totals)
            .map((t) => ({ ...t, cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0 }))
            .sort((a, b) => b.sessions - a.sessions);
    }

    function filterSourcesRange(sourceRows, rangeKey, customRange) {
        const { start, end } = resolveRange(rangeKey, customRange);
        return filterSourcesByDates(sourceRows, start, end);
    }

    /* ==========================================================
       Per-day-per-path rows -> Top Landing Pages. Same shape as
       filterSourcesByDates: aggregates matching rows within an
       arbitrary [start, end] window into one row per path, so the
       list responds to whatever date range is selected instead of
       always showing one fixed snapshot.
    ========================================================== */

    // Top Landing Pages intentionally does NOT follow the dashboard's
    // date-range picker — the underlying GA4 export only ever holds a
    // trailing 30-day window (data volume gets too large otherwise),
    // so this always aggregates the most recent 30 days available in
    // whatever's loaded, regardless of what range is selected
    // elsewhere. Grouped by pageTitle rather than landingPage, since
    // landingPage is a generic template (e.g. "/smartphone/detail.html")
    // shared by hundreds of different products — the actual page
    // identity only shows up in pageTitle/the query string.
    function resolveLast30DayWindow(landingRows) {
        if (!landingRows || !landingRows.length) return null;
        const maxDate = landingRows.reduce((max, r) => (r.date > max ? r.date : max), landingRows[0].date);
        const end = new Date(maxDate);
        const start = new Date(maxDate);
        start.setDate(start.getDate() - 29);
        return { start, end, startStr: start.toISOString().slice(0, 10), endStr: maxDate };
    }

    function aggregateLandingPages(landingRows, device = "all", limit = 10, excludeSystem = true) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return [];

        const inWindow = landingRows.filter((r) =>
            r.date >= win.startStr && r.date <= win.endStr &&
            (device === "all" || r.device === device) &&
            (!excludeSystem || r.pageType !== "system")
        );

        // Same first-half/second-half split used by the momentum
        // insight, computed once here so every row in the list can
        // show its own trend badge, not just whichever single page
        // moved the most.
        const allDates = Array.from(new Set(inWindow.map((r) => r.date))).sort();
        const midIdx = Math.floor(allDates.length / 2);
        const firstHalfDates = new Set(allDates.slice(0, midIdx));
        const secondHalfDates = new Set(allDates.slice(midIdx));

        const totals = {};
        inWindow.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            if (!totals[key]) {
                totals[key] = { pageTitle: key, landingPage: r.landingPage, pageType: r.pageType, sessions: 0, purchases: 0, revenue: 0, firstHalfSessions: 0, secondHalfSessions: 0 };
            }
            const t = totals[key];
            t.sessions += r.sessions;
            t.purchases += r.purchases;
            t.revenue += r.revenue;
            if (firstHalfDates.has(r.date)) t.firstHalfSessions += r.sessions;
            if (secondHalfDates.has(r.date)) t.secondHalfSessions += r.sessions;
        });

        return Object.values(totals)
            .map((t) => {
                // Null (not just 0%) when there isn't enough of a first-half
                // base to make a % change meaningful — the UI skips the
                // badge entirely in that case rather than showing a
                // misleadingly precise number off a tiny denominator.
                const trend = t.firstHalfSessions >= 5
                    ? ((t.secondHalfSessions - t.firstHalfSessions) / t.firstHalfSessions) * 100
                    : null;
                return { ...t, cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0, trend };
            })
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, limit);
    }

    // Text insights for the Top Landing Pages card — runs on the
    // FULL 30-day window (not just the top-N shown in the list),
    // since the product-vs-system split needs every row to be
    // meaningful, and always ignores the device filter so it reads
    // as an overall summary regardless of which device view is open.
    function buildLandingPageInsights(landingRows) {
        const insights = [];
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return insights;

        const inWindow = landingRows.filter((r) => r.date >= win.startStr && r.date <= win.endStr);
        if (!inWindow.length) return insights;

        const contentRows = inWindow.filter((r) => r.pageType !== "system");

        const byTitle = {};
        contentRows.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            if (!byTitle[key]) byTitle[key] = { pageTitle: key, sessions: 0, pc: 0, sp: 0 };
            const t = byTitle[key];
            t.sessions += r.sessions;
            if (r.device === "PC") t.pc += r.sessions;
            if (r.device === "Smartphone") t.sp += r.sessions;
        });
        const ranked = Object.values(byTitle).sort((a, b) => b.sessions - a.sessions);
        if (!ranked.length) return insights;

        // Only look among pages with real traffic — the long tail of
        // one-session hits would just add noise to both signals below.
        const candidates = ranked.slice(0, 10);

        // 1. Momentum: split the 30-day window in half by date and
        // compare each candidate page's sessions, second half vs
        // first. Surfaces whether a page is still gaining traction or
        // fading — something to actually act on (keep pushing it, or
        // go find out why interest dropped), unlike a static "here's
        // your top page" fact.
        const allDates = Array.from(new Set(inWindow.map((r) => r.date))).sort();
        const midIdx = Math.floor(allDates.length / 2);
        const firstHalfDates = new Set(allDates.slice(0, midIdx));
        const secondHalfDates = new Set(allDates.slice(midIdx));

        let biggestMover = null;
        candidates.forEach((p) => {
            const rows = contentRows.filter((r) => (r.pageTitle || "(not set)") === p.pageTitle);
            const firstHalf = rows.filter((r) => firstHalfDates.has(r.date)).reduce((s, r) => s + r.sessions, 0);
            const secondHalf = rows.filter((r) => secondHalfDates.has(r.date)).reduce((s, r) => s + r.sessions, 0);
            if (firstHalf < 5) return; // too small a base for a % swing to mean anything
            const change = ((secondHalf - firstHalf) / firstHalf) * 100;
            if (!biggestMover || Math.abs(change) > Math.abs(biggestMover.change)) {
                biggestMover = { pageTitle: p.pageTitle, change };
            }
        });
        if (biggestMover && Math.abs(biggestMover.change) >= 20) {
            const key = biggestMover.change >= 0 ? "landingInsight.rising" : "landingInsight.cooling";
            insights.push(window.I18N.t(key, {
                title: `<strong>${biggestMover.pageTitle}</strong>`,
                figure: highlight(Math.abs(biggestMover.change).toFixed(0) + "%", biggestMover.change >= 0 ? "pos" : "neg")
            }));
        }

        // 2. Device mismatch: among the same candidates, flag one whose
        // PC/Smartphone split is meaningfully more lopsided than the
        // overall content-traffic split — a concrete "go check how
        // this looks on the other device" candidate, rather than a
        // generic overall split nobody can act on.
        const totalPc = contentRows.filter((r) => r.device === "PC").reduce((s, r) => s + r.sessions, 0);
        const totalSp = contentRows.filter((r) => r.device === "Smartphone").reduce((s, r) => s + r.sessions, 0);
        const overallSpShare = (totalPc + totalSp) ? (totalSp / (totalPc + totalSp)) * 100 : 0;

        let biggestMismatch = null;
        candidates.forEach((p) => {
            const total = p.pc + p.sp;
            if (total < 20) return; // needs enough volume for the split to be meaningful
            const spShare = (p.sp / total) * 100;
            const diff = Math.abs(spShare - overallSpShare);
            if (!biggestMismatch || diff > biggestMismatch.diff) {
                biggestMismatch = { pageTitle: p.pageTitle, spShare, diff };
            }
        });
        if (biggestMismatch && biggestMismatch.diff >= 25) {
            const deviceLabel = biggestMismatch.spShare > overallSpShare
                ? window.I18N.t("landing.smartphone")
                : window.I18N.t("landing.pc");
            const figure = Math.max(biggestMismatch.spShare, 100 - biggestMismatch.spShare);
            insights.push(window.I18N.t("landingInsight.deviceMismatch", {
                title: `<strong>${biggestMismatch.pageTitle}</strong>`,
                device: deviceLabel,
                figure: highlight(figure.toFixed(0) + "%", "neutral")
            }));
        }

        // 3. Single-day spike: for each candidate page, build its own
        // daily session series across the window and flag a day that's
        // abnormal relative to THAT PAGE's own typical day (z-score
        // against its own mean/stdDev) — same method as the daily
        // KPI anomaly detector, just scoped per page instead of per
        // metric. This is a different question from the momentum
        // signal above: momentum looks for a sustained shift over two
        // weeks, this looks for one unusual day (a press mention, a
        // social share, a flash sale) that a half-window comparison
        // could easily wash out or miss entirely.
        let biggestSpike = null;
        candidates.forEach((p) => {
            const byDate = {};
            contentRows
                .filter((r) => (r.pageTitle || "(not set)") === p.pageTitle)
                .forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + r.sessions; });

            const values = allDates.map((d) => byDate[d] || 0);
            const n = values.length;
            if (n < 5) return;

            const mean = values.reduce((a, b) => a + b, 0) / n;
            if (mean < 3) return; // needs a real baseline — not near-zero noise

            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            if (!stdDev) return;

            values.forEach((v, i) => {
                const z = (v - mean) / stdDev;
                if (z >= 2 && (!biggestSpike || z > biggestSpike.z)) {
                    biggestSpike = { pageTitle: p.pageTitle, date: allDates[i], value: v, mean, z };
                }
            });
        });
        if (biggestSpike) {
            insights.push(window.I18N.t("landingInsight.spike", {
                title: `<strong>${biggestSpike.pageTitle}</strong>`,
                date: biggestSpike.date,
                figure: highlight(Math.round(biggestSpike.value).toLocaleString("en-US"), "pos"),
                mean: Math.round(biggestSpike.mean).toLocaleString("en-US")
            }));
        }

        return insights;
    }

    /* ==========================================================
       Landing Page Detail — shared helpers
       Both the Overview "rising page" insight and clicking any row
       in the Top Landing Pages list need the same two things: a
       page's daily-sessions series across the 30-day window (with
       its single standout day picked out), and its this-week vs.
       last-week totals. Pulled out here so both call sites stay in
       sync instead of drifting apart.
    ========================================================== */

    function sumSessionsByTitle(rows) {
        const map = {};
        rows.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            map[key] = (map[key] || 0) + r.sessions;
        });
        return map;
    }

    // This-week / last-week windows, anchored to the most recent date
    // actually present in the data (not "today"), same anchoring
    // approach resolveLast30DayWindow already uses.
    function weekWindowsFor(win) {
        const maxDate = new Date(win.endStr);
        const curStart = new Date(maxDate);
        curStart.setDate(curStart.getDate() - 6);
        const prevEnd = new Date(curStart);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - 6);
        return {
            curStartStr: curStart.toISOString().slice(0, 10),
            prevStartStr: prevStart.toISOString().slice(0, 10),
            prevEndStr: prevEnd.toISOString().slice(0, 10)
        };
    }

    // One page's daily series across the full 30-day window, plus the
    // single day that stands out most (highest z-score, even if it
    // doesn't clear the ANOMALY_Z_THRESHOLD used elsewhere — here we
    // always want *a* day to point to, not just a statistically
    // extreme one). `rows` should already be scoped to whatever
    // device/page-type filter the caller wants applied.
    function buildLandingPageDailySeries(rows, win, pageTitle) {
        const allDates = [];
        for (let d = new Date(win.start); d <= win.end; d.setDate(d.getDate() + 1)) {
            allDates.push(d.toISOString().slice(0, 10));
        }
        const byDate = {};
        rows
            .filter((r) => (r.pageTitle || "(not set)") === pageTitle)
            .forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + r.sessions; });

        const dailySessions = allDates.map((d) => ({ date: d, sessions: byDate[d] || 0 }));
        const values = dailySessions.map((d) => d.sessions);
        const n = values.length;
        const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
        const variance = n ? values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n : 0;
        const stdDev = Math.sqrt(variance);

        let spikeDate = null;
        let spikeValue = null;
        let spikeZ = null;
        values.forEach((v, i) => {
            const z = stdDev ? (v - mean) / stdDev : 0;
            if (spikeZ === null || z > spikeZ) {
                spikeZ = z;
                spikeDate = allDates[i];
                spikeValue = v;
            }
        });

        return { dailySessions, mean, spikeDate, spikeValue };
    }

    /* ==========================================================
       Overview "Rising Landing Page" Insight
       A focused early-warning signal, deliberately separate from
       the Landing Pages tab's own momentum/spike insights above
       (buildLandingPageInsights): this looks ONLY at the most
       recent 7 days vs. the 7 days right before that — not the
       30-day half-window split used there — and ONLY surfaces a
       page whose sessions at least doubled. The point is "is
       something unusual happening RIGHT NOW", checkable at a
       glance from Overview, rather than a general momentum read.

       A minimum previous-week session floor keeps a 1session->3
       session blip from reading as a "300% rise". Content pages
       only (see classifyLandingPageType) — a spike on a checkout
       or login page isn't the kind of anomaly this is hunting for.
    ========================================================== */

    const RISING_PAGE_MIN_PREV_SESSIONS = 10;
    const RISING_PAGE_THRESHOLD_PCT = 100;

    function buildRisingLandingPageInsight(landingRows) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return null;

        const { curStartStr, prevStartStr, prevEndStr } = weekWindowsFor(win);

        const contentRows = landingRows.filter((r) => r.pageType !== "system");
        const curRows = contentRows.filter((r) => r.date >= curStartStr && r.date <= win.endStr);
        const prevRows = contentRows.filter((r) => r.date >= prevStartStr && r.date <= prevEndStr);

        const curMap = sumSessionsByTitle(curRows);
        const prevMap = sumSessionsByTitle(prevRows);

        // Single biggest riser clearing both the noise-floor and the
        // 100%+ threshold — ties broken by whichever change % is
        // largest, so this reads as "the one thing most worth a look"
        // rather than a list that could get noisy in a busy week.
        let best = null;
        Object.keys(curMap).forEach((title) => {
            const current = curMap[title];
            const previous = prevMap[title] || 0;
            if (previous < RISING_PAGE_MIN_PREV_SESSIONS) return;
            const changePct = ((current - previous) / previous) * 100;
            if (changePct < RISING_PAGE_THRESHOLD_PCT) return;
            if (!best || changePct > best.changePct) {
                best = { pageTitle: title, current, previous, changePct };
            }
        });
        if (!best) return null;

        const { dailySessions, mean, spikeDate, spikeValue } = buildLandingPageDailySeries(contentRows, win, best.pageTitle);

        const sentence = window.I18N.t("landingInsight.overviewRising", {
            title: `<strong>${best.pageTitle}</strong>`,
            figure: highlight(`+${Math.round(best.changePct)}%`, "pos")
        });

        return {
            pageTitle: best.pageTitle,
            current: best.current,
            previous: best.previous,
            changePct: best.changePct,
            sentence,
            dailySessions,
            mean,
            spikeDate,
            spikeValue
        };
    }

    /* ==========================================================
       Landing Page Detail (any page, on demand)
       Powers clicking a row in the Top Landing Pages list: same
       week-over-week comparison and daily-series/spike-day lookup
       as the rising-page insight above, but for whichever specific
       page was clicked — no threshold, no content-only restriction
       (a system page can be clicked too if it's visible in the
       list), and scoped to whichever device filter is currently
       selected so the numbers shown match the row the person
       clicked. changePct is null (not 0) when there's no previous-
       week data to compare against, so the UI can say "no data"
       instead of a misleading "+∞%" or "0%".
    ========================================================== */

    function buildLandingPageDetail(landingRows, pageTitle, device) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win || !pageTitle) return null;

        const { curStartStr, prevStartStr, prevEndStr } = weekWindowsFor(win);
        const scoped = landingRows.filter((r) => !device || device === "all" || r.device === device);

        const curRows = scoped.filter((r) => r.date >= curStartStr && r.date <= win.endStr);
        const prevRows = scoped.filter((r) => r.date >= prevStartStr && r.date <= prevEndStr);

        const current = sumSessionsByTitle(curRows)[pageTitle] || 0;
        const previous = sumSessionsByTitle(prevRows)[pageTitle] || 0;
        const changePct = previous > 0 ? ((current - previous) / previous) * 100 : null;

        const { dailySessions, mean, spikeDate, spikeValue } = buildLandingPageDailySeries(scoped, win, pageTitle);

        return { pageTitle, current, previous, changePct, dailySessions, mean, spikeDate, spikeValue };
    }

    /* ==========================================================
       Current vs previous period, merged into one row per
       channel/platform so the two can be shown side by side
       (and so a channel that only appears in one period still
       shows up, with the other side reading "—").
    ========================================================== */

    function buildTrafficComparison(currentChannels, previousChannels) {
        const map = {};

        (currentChannels || []).forEach((c) => {
            map[c.label] = { label: c.label, current: c, previous: null };
        });
        (previousChannels || []).forEach((c) => {
            if (!map[c.label]) map[c.label] = { label: c.label, current: null, previous: c };
            else map[c.label].previous = c;
        });

        return Object.values(map).sort((a, b) => {
            const aSessions = a.current ? a.current.sessions : 0;
            const bSessions = b.current ? b.current.sessions : 0;
            return bSessions - aSessions;
        });
    }

    // Builds a merged current-vs-previous daily trend for one
    // channel/platform, for the doughnut-click drill-down. The two
    // windows are aligned by DAY OFFSET within their own period (day
    // 1 of current next to day 1 of previous), not by calendar date —
    // since "This Month" vs "Last Month" cover different calendar
    // days entirely, aligning by offset is what makes the two lines
    // actually comparable side by side, same idea GA4's own
    // date-range-comparison charts use.
    function buildChannelTrend(sourceRows, channelKey, groupBy, range) {
        const filtered = sourceRows.filter((r) => classifyForGroupBy(r, groupBy) === channelKey);

        const byDate = {};
        filtered.forEach((r) => {
            if (!byDate[r.date]) byDate[r.date] = { users: 0, sessions: 0, purchases: 0, revenue: 0 };
            const d = byDate[r.date];
            d.users += r.users;
            d.sessions += r.sessions;
            d.purchases += r.purchases;
            d.revenue += r.revenue;
        });

        const spanDays = Math.round((range.end - range.start) / 86400000) + 1;
        const labels = [];
        const previousLabels = [];
        const series = {
            users: { current: [], previous: [] },
            sessions: { current: [], previous: [] },
            purchases: { current: [], previous: [] },
            revenue: { current: [], previous: [] },
            cvr: { current: [], previous: [] }
        };

        for (let i = 0; i < spanDays; i++) {
            const curDate = new Date(range.start);
            curDate.setDate(curDate.getDate() + i);
            const prevDate = new Date(range.prevStart);
            prevDate.setDate(prevDate.getDate() + i);

            const curKey = curDate.toISOString().slice(0, 10);
            const prevKey = prevDate.toISOString().slice(0, 10);
            const cur = byDate[curKey] || { users: 0, sessions: 0, purchases: 0, revenue: 0 };
            const prev = byDate[prevKey] || { users: 0, sessions: 0, purchases: 0, revenue: 0 };

            labels.push(window.I18N.formatDayLabel(curDate));
            previousLabels.push(window.I18N.formatDayLabel(prevDate));

            series.users.current.push(cur.users);
            series.users.previous.push(prev.users);
            series.sessions.current.push(cur.sessions);
            series.sessions.previous.push(prev.sessions);
            series.purchases.current.push(cur.purchases);
            series.purchases.previous.push(prev.purchases);
            series.revenue.current.push(cur.revenue);
            series.revenue.previous.push(prev.revenue);
            series.cvr.current.push(cur.sessions ? (cur.purchases / cur.sessions) * 100 : 0);
            series.cvr.previous.push(prev.sessions ? (prev.purchases / prev.sessions) * 100 : 0);
        }

        return { labels, previousLabels, series };
    }

    /* ==========================================================
       Monthly Business Performance
       Company's fiscal "month" runs 21st of the previous calendar
       month through the 20th of the named month — e.g. the "Feb
       2026" bucket is 2026-01-21 ~ 2026-02-20. Any day from the
       21st onward rolls forward into the following calendar
       month's bucket; the 1st-20th stay in their own calendar
       month. Built straight from daily GA4 rows so it always
       reflects whatever's actually loaded (live or dummy).
    ========================================================== */

    function businessMonthOf(dateStr) {
        const d = new Date(dateStr);
        let month = d.getMonth(); // 0-indexed
        let year = d.getFullYear();
        if (d.getDate() >= 21) {
            month += 1;
            if (month > 11) { month = 0; year += 1; }
        }
        return { year, month };
    }

    function businessMonthLabel(year, month) {
        return window.I18N.formatMonth(year, month);
    }

    function buildBusinessMonths(dailyRows, monthsToShow = 12) {
        const buckets = {};

        (dailyRows || []).forEach((r) => {
            const { year, month } = businessMonthOf(r.date);
            const key = `${year}-${month}`;
            if (!buckets[key]) buckets[key] = { year, month, revenue: 0, orders: 0, users: 0, sessions: 0 };
            const b = buckets[key];
            b.revenue += r.revenue;
            b.orders += r.purchases;
            b.users += r.users;
            b.sessions += r.sessions;
        });

        const sortedKeys = Object.keys(buckets).sort((a, b) => {
            const A = buckets[a], B = buckets[b];
            return (A.year * 12 + A.month) - (B.year * 12 + B.month);
        });

        const rows = sortedKeys.map((key, i) => {
            const b = buckets[key];
            const prev = i > 0 ? buckets[sortedKeys[i - 1]] : null;
            return {
                month: businessMonthLabel(b.year, b.month),
                revenue: b.revenue,
                orders: b.orders,
                users: b.users,
                cvr: b.sessions ? (b.orders / b.sessions) * 100 : 0,
                trend: prev && prev.revenue ? ((b.revenue - prev.revenue) / prev.revenue) * 100 : 0
            };
        });

        return rows.slice(-monthsToShow);
    }

    /* ==========================================================
       Moving Average
       Simple trailing-window average (default 7 days) used as an
       optional overlay on the trend chart to smooth out day-to-day
       noise. Early points use whatever days are available so the
       line still starts at index 0 instead of leaving a gap.
    ========================================================== */

    function computeMovingAverage(values, windowSize) {
        const w = windowSize || 7;
        const out = [];
        for (let i = 0; i < values.length; i++) {
            const from = Math.max(0, i - w + 1);
            const slice = values.slice(from, i + 1);
            out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
        return out;
    }

    THD.data = {
        CONFIG,
        loadDailyGA4,
        loadSources,
        loadNewRepeat,
        loadLandingPages,
        classifySourceChannel,
        classifyPlatform,
        classifyForGroupBy,
        listAvailableChannels,
        buildDailyRowsFromSources,
        buildChannelDailySeries,
        deriveTrafficBreakdown,
        buildInsights,
        buildNewRepeatInsights,
        detectAnomalies,
        buildAnomalyInsights,
        resolveRange,
        filterDailyRange,
        filterSourcesRange,
        filterSourcesByDates,
        resolveLast30DayWindow,
        classifyLandingPageType,
        aggregateLandingPages,
        buildLandingPageInsights,
        buildRisingLandingPageInsight,
        buildLandingPageDetail,
        buildTrafficComparison,
        buildChannelTrend,
        computeMovingAverage,
        buildBusinessMonths
    };

})(window.THD);
