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
            labels: current.map((r) => new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
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
            insights.push(`Revenue ${d >= 0 ? "increased" : "decreased"} by ${figure} compared to the previous period.`);
        }

        if (channels && channels.length) {
            const totalRevenue = channels.reduce((sum, c) => sum + c.revenue, 0);
            const topByRevenue = channels.reduce((a, b) => (b.revenue > a.revenue ? b : a), channels[0]);
            const share = totalRevenue ? Math.round((topByRevenue.revenue / totalRevenue) * 100) : 0;
            insights.push(`<strong>${topByRevenue.label}</strong> generated ${highlight(share + "%", "neutral")} of total revenue.`);

            const notSet = channels.find((c) => c.label === "(not set)");
            if (notSet) {
                const totalSessions = channels.reduce((sum, c) => sum + c.sessions, 0);
                const notSetShare = totalSessions ? Math.round((notSet.sessions / totalSessions) * 100) : 0;
                if (notSetShare >= 5) {
                    const figure = highlight(notSetShare + "%", "neg");
                    insights.push(`${figure} of sessions have no attribution data (<strong>(not set)</strong>) — worth checking GA4 tagging/UTM setup, since this may be skewing channel-level numbers.`);
                }
            }
        }

        if (kpi) {
            const movers = [
                { key: "users", label: "User traffic" },
                { key: "sessions", label: "Session traffic" },
                { key: "purchases", label: "Purchases" }
            ];
            let biggest = null;
            movers.forEach(({ key, label }) => {
                const d = kpi[key] ? kpi[key].delta : 0;
                if (!biggest || Math.abs(d) > Math.abs(biggest.delta)) biggest = { label, delta: d };
            });
            if (biggest) {
                const figure = highlight(`${Math.abs(biggest.delta).toFixed(1)}%`, biggest.delta >= 0 ? "pos" : "neg");
                insights.push(`${biggest.label} ${biggest.delta >= 0 ? "increased" : "decreased"} by ${figure}.`);
            }
        }

        if (kpi && kpi.cvr) {
            const d = kpi.cvr.delta;
            const figure = highlight(`${kpi.cvr.value.toFixed(2)}%`, d >= 0 ? "pos" : "neg");
            insights.push(`Conversion rate ${d >= 0 ? "improved" : "declined"} to ${figure} this period.`);
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

    const ANOMALY_METRIC_LABELS = {
        users: "Total Users",
        sessions: "Sessions",
        purchases: "Ecommerce Purchases",
        revenue: "Revenue",
        cvr: "CVR"
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
        const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
                        metric: ANOMALY_METRIC_LABELS[key] || key,
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
                const verb = a.direction === "spike" ? "spiked" : "dropped";
                const figure = highlight(a.valueText, a.direction === "spike" ? "pos" : "neg");
                return `${a.metric} ${verb} on ${a.date} (${figure} vs a typical ${a.meanText} for this period) — there might have been an external event, promotion, or outage around that date worth checking.`;
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
        return new Date(year, month, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
        deriveTrafficBreakdown,
        buildInsights,
        detectAnomalies,
        buildAnomalyInsights,
        resolveRange,
        filterDailyRange,
        filterSourcesRange,
        filterSourcesByDates,
        buildTrafficComparison,
        computeMovingAverage,
        buildBusinessMonths
    };

})(window.THD);
