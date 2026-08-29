/* ==========================================================
   THD Analytics
   App Init
   Version 1.0

   Data flow:
     THD.data.loadDailyGA4() / loadSources() / loadNewRepeat()
     each try a live Google Sheets CSV (see js/data.js CONFIG)
     and fall back to dummy data below if not configured yet.

   The date-range selector re-filters the already-fetched daily
   and per-day-source rows in memory — no re-fetch on range change.
========================================================== */

(function () {

    let dailyRows = [];       // full daily GA4 rows (real or dummy), oldest -> newest
    let sourceRows = [];      // full per-day-per-source rows (real or dummy)
    let landingRows = [];     // full per-day-per-path-per-source rows (real or dummy)
    let currentRange = "month";
    let currentCustomRange = null; // { start: Date, end: Date }, only used when currentRange === "custom"

    // Drill-down filter: set by clicking a row in the Traffic
    // Comparison table (e.g. "Referral (Other)") to narrow the
    // Session Source table below to just the rows behind that
    // bucket. sourcesCurrentForFilter/lastTrafficComparisonRows hold
    // the last-computed data so the filter can be toggled without
    // recomputing the whole period.
    let activeSourceFilter = null;
    let sourcesCurrentForFilter = [];
    let lastTrafficComparisonRows = [];
    let sourceFilterChannel = "all"; // "All Sources" dropdown selection
    let availableChannels = []; // cached channel list, so a language change can repopulate translated option labels without recomputing
    let newRepeatRows = []; // last-loaded new/repeat rows (sliced to 12), kept so the Orders/Revenue toggle can re-render without re-fetching
    let fullNewRepeatRows = []; // full history (unsliced) — needed to rebuild New/Repeat insights on a language change without re-fetching
    let lastBusinessMonths = []; // last-rendered Monthly Business Performance rows, cached so the CSV export button doesn't need to recompute

    // Monthly targets (see js/goals.js), shared across the team via
    // Firestore. {} until the first subscribe() callback fires.
    let currentGoalTargets = {};

    // Overview "rising landing page" insight (see buildRisingLandingPageInsight
    // in data.js) — fixed 7-day-vs-prior-7-day window, independent of the
    // main date-range picker, same as Landing Pages' own fixed 30-day
    // window. risingPanelActiveInsight tracks whether its detail panel on
    // the Landing Pages tab is currently open (and risingPanelActiveGeneric
    // whether it's showing that rising insight vs. an arbitrary page clicked
    // in the Top Landing Pages list — see buildLandingPageDetail), so a
    // language change or device-filter change can refresh it in place
    // instead of leaving it showing stale numbers.
    let risingPageInsight = null;
    let risingPanelActiveInsight = null;
    let risingPanelActiveGeneric = false;

    // Cached from the last renderForRange call so the channel-trend
    // click handler / metric toggle can recompute without redoing the
    // whole period's work.
    let currentRangeObj = null;
    let currentEffectiveSourceRows = [];
    let currentGroupBy = "platform";

    function renderChannelTrendOrDoughnuts() {
        if (!activeSourceFilter) {
            THD.ui.hideChannelTrendMode();
            return;
        }
        const trendData = THD.data.buildChannelTrend(currentEffectiveSourceRows, activeSourceFilter, currentGroupBy, currentRangeObj);
        THD.ui.showChannelTrendMode(activeSourceFilter);
        THD.charts.renderChannelTrendChart("trafficChannelTrendChart", activeSourceFilter, trendData, THD.ui.getChannelTrendMetric());
    }
    let dataSourceStatus = { daily: true, sources: true, landingPages: true, newRepeat: true }; // true = live data loaded successfully; false = fell back to demo data

    function renderNewRepeatSourceNote() {
        const el = document.getElementById("newRepeatSourceNote");
        if (!el) return;
        const link = `<a class="sourceLink" href="https://docs.google.com/spreadsheets/d/18mnPzByMm0eyQ3Q7JJGeLG5lQHCNucu-mM3ylCdgav0" target="_blank" rel="noopener">${window.I18N.t("newRepeat.sourceLinkText")}</a>`;
        el.innerHTML = window.I18N.t("newRepeat.source", { link });
    }

    function renderFilteredSourceTable() {
        const rows = activeSourceFilter
            ? sourcesCurrentForFilter.filter((r) => THD.data.classifyForGroupBy(r, THD.ui.getTrafficGroupBy()) === activeSourceFilter)
            : sourcesCurrentForFilter;
        THD.ui.renderSourceTable(rows);
        THD.ui.renderSourceFilterStatus(activeSourceFilter);
    }

    function renderNewRepeatChartOnly() {
        THD.charts.renderNewRepeatChart(newRepeatRows);
        renderAovChartOnly();
    }

    function renderAovChartOnly() {
        THD.charts.renderAovChart(newRepeatRows, THD.ui.getCheckedMetrics("aovMetricToggles"));
    }

    // Top Landing Pages ignores the global date-range picker (fixed
    // 30-day window instead — see aggregateLandingPages), so it only
    // needs to re-render itself when the device filter changes.
    function renderLandingPagesForDevice() {
        const device = THD.ui.getLandingDevice();
        const excludeSystem = THD.ui.getHideSystemPages();
        const rows = THD.data.aggregateLandingPages(landingRows, device, 50, excludeSystem);
        THD.ui.renderLandingPages(rows);
        THD.ui.renderLandingPageInsights(THD.data.buildLandingPageInsights(landingRows));
        const win = THD.data.resolveLast30DayWindow(landingRows);
        if (win) THD.ui.renderLandingPagesPeriodLabel(win.startStr, win.endStr);

        // If a page-detail panel (opened by clicking a row — see
        // onLandingPageItemClick) is currently open, refresh it against
        // the new device filter so its numbers stay consistent with
        // what the list above it is now showing. The "rising" panel
        // (opened from the Overview insight) intentionally ignores the
        // device filter, same as the insight itself, so it's left as-is.
        if (risingPanelActiveInsight && risingPanelActiveGeneric) {
            const refreshed = THD.data.buildLandingPageDetail(landingRows, risingPanelActiveInsight.pageTitle, device);
            if (refreshed) {
                risingPanelActiveInsight = refreshed;
                THD.ui.renderLandingRisingPanel(refreshed, { generic: true });
                THD.ui.resetSourceBreakdown();
                THD.charts.renderLandingPageMiniChart("landingRisingPanelChart", refreshed.dailySessions, refreshed.spikeDate,
                    (date) => showBreakdownForDate(date, refreshed.pageTitle));
                if (refreshed.spikeDate) showBreakdownForDate(refreshed.spikeDate, refreshed.pageTitle);
            }
        }
    }

    // Populates the source-breakdown panel for one specific day of the
    // currently-open landing-page detail (see onRisingPageInsightClick /
    // onLandingPageItemClick below) — shared by the initial auto-fill
    // (spike day, if there is one) and every subsequent bar click.
    // Groups the same way the Traffic Sources tab currently is
    // (platform or channel), so a person who just came from grouping
    // by channel there sees the same grouping here. Reads from
    // landingRows directly — sourceMedium lives on that same feed.
    // Remembers {pageTitle, date, groupBy} in breakdownContext so the
    // row-click handler (wired once in init(), see below) knows what
    // to drill into without needing that context passed back to it.
    let breakdownContext = null;

    function showBreakdownForDate(date, pageTitle) {
        const groupBy = THD.ui.getTrafficGroupBy();
        breakdownContext = { date, pageTitle, groupBy };
        const result = THD.data.buildDayPageSourceBreakdown(landingRows, pageTitle, date, groupBy);
        THD.ui.renderSourceBreakdown(result, window.I18N.formatDayLabel(date));
    }

    // Click-through for a Traffic Sources anomaly insight (see
    // buildChannelAnomalyInsights): jumps to the Traffic tab and
    // applies that channel as the active drill-down filter, exactly
    // as if the person had clicked its row in the Traffic Comparison
    // table themselves — same channel-trend chart, same Session
    // Source table scoping, so the anomaly leads straight into the
    // existing investigation tools instead of a separate view.
    function onChannelAnomalyInsightClick(anomaly) {
        if (!anomaly || !anomaly.channel) return;
        THD.ui.switchToView("traffic", () => {
            THD.charts.resizeCharts();
            activeSourceFilter = anomaly.channel;
            THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);
            renderFilteredSourceTable();
            renderChannelTrendOrDoughnuts();
            const wrap = document.getElementById("trafficChannelTrendWrap");
            if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // Click-through for the Overview "rising landing page" insight:
    // jumps to the Landing Pages tab and reveals its highlight panel
    // with a mini daily-sessions chart for that one page, the standout
    // day picked out in a different color. The chart is rendered
    // inside the tab-switch's onSwitch callback (not immediately)
    // since the canvas is still zero-size until the newly-shown tab's
    // layout has settled — same reason resizeCharts() exists.
    function onRisingPageInsightClick(insight) {
        if (!insight) return;
        risingPanelActiveInsight = insight;
        risingPanelActiveGeneric = false;
        THD.ui.renderLandingRisingPanel(insight);
        THD.ui.resetSourceBreakdown();
        THD.ui.switchToView("traffic", () => {
            THD.charts.resizeCharts();
            THD.charts.renderLandingPageMiniChart("landingRisingPanelChart", insight.dailySessions, insight.spikeDate,
                (date) => showBreakdownForDate(date, insight.pageTitle));
            if (insight.spikeDate) showBreakdownForDate(insight.spikeDate, insight.pageTitle);
            const panel = document.getElementById("landingRisingPanel");
            if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // Click-through for clicking any row in the Top Landing Pages list
    // (already on the Landing Pages tab, so no tab switch needed — just
    // the panel itself going from display:none to visible, which still
    // needs a layout beat before Chart.js can measure the canvas, hence
    // the double rAF here too.
    function onLandingPageItemClick(page) {
        if (!page || !page.pageTitle) return;
        const device = THD.ui.getLandingDevice();
        const detail = THD.data.buildLandingPageDetail(landingRows, page.pageTitle, device);
        if (!detail) return;
        risingPanelActiveInsight = detail;
        risingPanelActiveGeneric = true;
        THD.ui.renderLandingRisingPanel(detail, { generic: true });
        THD.ui.resetSourceBreakdown();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            THD.charts.renderLandingPageMiniChart("landingRisingPanelChart", detail.dailySessions, detail.spikeDate,
                (date) => showBreakdownForDate(date, detail.pageTitle));
            if (detail.spikeDate) showBreakdownForDate(detail.spikeDate, detail.pageTitle);
            const panel = document.getElementById("landingRisingPanel");
            if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
    }

    /* ==========================================================
       Dummy Data (fallback when a live source isn't configured)
    ========================================================== */

    function randomWalk(days, start, volatility, floorRatio = 0.3) {
        const out = [];
        let value = start;
        for (let i = 0; i < days; i++) {
            value += (Math.random() - 0.45) * volatility;
            value = Math.max(value, start * floorRatio);
            out.push(Math.round(value));
        }
        return out;
    }

    function buildDummyDailyRows(days = 900) {
        const users = randomWalk(days, 2000, 350);
        const purchases = randomWalk(days, 130, 40);
        const rows = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            const sessions = Math.round(users[i] * 1.5);
            rows.push({
                date: d.toISOString().slice(0, 10),
                users: users[i],
                sessions: sessions,
                purchases: purchases[i],
                revenue: purchases[i] * 9575
            });
        }
        return rows;
    }

    const SOURCE_POOL = [
        "google / cpc", "google / organic", "(direct) / (none)", "yahoo / organic",
        "instagram / social", "line / social", "facebook / social", "yahoo / cpc",
        "facebook / cpc", "instagram / cpc",
        "newsletter / email", "ameblo.jp / referral", "rakuten / referral",
        "criteo / display", "bing / organic", "twitter / social", "pinterest / social",
        "biopaste.jp / referral", "aosorahiroba.jugem.jp / referral", "admanager.google.com / referral",
        "adclick.g.doubleclick.net / referral", "a20.hm-f.jp / referral", "a05.hm-f.jp / referral"
    ];

    function buildDummySourcesDaily(days = 900) {
        const rows = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            const dateStr = d.toISOString().slice(0, 10);

            SOURCE_POOL.forEach((name) => {
                const sessions = Math.round(Math.random() * 60 + 1);
                const users = Math.round(sessions * (0.75 + Math.random() * 0.2));
                const purchases = Math.random() < 0.5 ? Math.round(sessions * Math.random() * 0.04) : 0;
                const revenue = purchases * (7000 + Math.random() * 6000);
                rows.push({ sourceMedium: name, date: dateStr, sessions, users, purchases, revenue, channel: null });
            });
        }
        return rows;
    }

    function buildDummyNewRepeat() {
        return [
            { period: "Jul 2025", totalRevenue: 38120400, totalOrders: 3612, newRevenue: 4100800, newOrders: 401, repeatRevenue: 34019600, repeatOrders: 3211, visitorsPc: 8650, visitorsSp: 47800, visitorsTotal: 56450 },
            { period: "Aug 2025", totalRevenue: 40310062, totalOrders: 3754, newRevenue: 4389200, newOrders: 423, repeatRevenue: 35920862, repeatOrders: 3331, visitorsPc: 8931, visitorsSp: 49719, visitorsTotal: 58650 },
            { period: "Sep 2025", totalRevenue: 35777697, totalOrders: 3538, newRevenue: 3429971, newOrders: 385, repeatRevenue: 32347726, repeatOrders: 3153, visitorsPc: 9843, visitorsSp: 51407, visitorsTotal: 61250 },
            { period: "Oct 2025", totalRevenue: 34192356, totalOrders: 3423, newRevenue: 3066125, newOrders: 322, repeatRevenue: 31126231, repeatOrders: 3101, visitorsPc: 8622, visitorsSp: 44182, visitorsTotal: 52804 },
            { period: "Nov 2025", totalRevenue: 38398975, totalOrders: 3684, newRevenue: 3150676, newOrders: 280, repeatRevenue: 35248299, repeatOrders: 3404, visitorsPc: 8876, visitorsSp: 43471, visitorsTotal: 52347 },
            { period: "Dec 2025", totalRevenue: 49027372, totalOrders: 4400, newRevenue: 7360062, newOrders: 643, repeatRevenue: 41667310, repeatOrders: 3757, visitorsPc: 9954, visitorsSp: 47370, visitorsTotal: 57324 },
            { period: "Jan 2026", totalRevenue: 32791349, totalOrders: 3408, newRevenue: 2513318, newOrders: 287, repeatRevenue: 30278031, repeatOrders: 3121, visitorsPc: 9918, visitorsSp: 46060, visitorsTotal: 55978 },
            { period: "Feb 2026", totalRevenue: 51419069, totalOrders: 3244, newRevenue: 3499564, newOrders: 343, repeatRevenue: 47919505, repeatOrders: 2901, visitorsPc: 10669, visitorsSp: 41536, visitorsTotal: 52205 },
            { period: "Mar 2026", totalRevenue: 33210500, totalOrders: 3180, newRevenue: 2980100, newOrders: 298, repeatRevenue: 30230400, repeatOrders: 2882, visitorsPc: 9200, visitorsSp: 42800, visitorsTotal: 52000 },
            { period: "Apr 2026", totalRevenue: 36450800, totalOrders: 3390, newRevenue: 3210900, newOrders: 315, repeatRevenue: 33239900, repeatOrders: 3075, visitorsPc: 9450, visitorsSp: 44600, visitorsTotal: 54050 },
            { period: "May 2026", totalRevenue: 37980200, totalOrders: 3510, newRevenue: 3350700, newOrders: 330, repeatRevenue: 34629500, repeatOrders: 3180, visitorsPc: 9680, visitorsSp: 45900, visitorsTotal: 55580 },
            { period: "Jun 2026", totalRevenue: 35450600, totalOrders: 3400, newRevenue: 3050800, newOrders: 300, repeatRevenue: 32399800, repeatOrders: 3100, visitorsPc: 9300, visitorsSp: 44100, visitorsTotal: 53400 },
            { period: "Jul 2026", totalRevenue: 36182782, totalOrders: 3719, newRevenue: 3980000, newOrders: 372, repeatRevenue: 32202782, repeatOrders: 3347, visitorsPc: 9060, visitorsSp: 30880, visitorsTotal: 41175 }
        ];
    }

    // Mix of PC and Smartphone (path prefixed "/smartphone/") pages,
    // matching how the real export's device flag works.
    const LANDING_PAGE_POOL = [
        { landingPage: "/", pageTitle: "トップページ" },
        { landingPage: "/smartphone/index.html", pageTitle: "トータルヘルスデザイン公式ショップWEB本店" },
        { landingPage: "/smartphone/login.html", pageTitle: "会員ページログイン" },
        { landingPage: "/smartphone/EntryOrderConfirm.html", pageTitle: "ご注文内容確認" },
        { landingPage: "/shopdetail/000000002741", pageTitle: "【オンライン学習】後藤 芳宏さん　植物さんとのコミュニ｜トータルヘルスデザイン公式ショップWEB本店" },
        { landingPage: "/smartphone/detail.html", pageTitle: "夏のセール限定 サマーケアセット｜トータルヘルスデザイン公式ショップWEB本店" },
        { landingPage: "/smartphone/detail.html", pageTitle: "モイストクリーム 100g【特典付き】｜トータルヘルスデザイン公式ショップWEB本店" },
        { landingPage: "/smartphone/page78.html", pageTitle: "商品一覧 / トータルヘルスデザイン公式ショップWEB本店" },
        { landingPage: "/blog/style-guide-2026", pageTitle: "2026年 スタイルガイド ブログ" },
        { landingPage: "/smartphone/detail.html", pageTitle: "オリジンウォーター 500ml【2本購入で特典付き】｜トータルヘルスデザイン公式ショップWEB本店" }
    ];

    function buildDummyLandingPagesDaily(days = 45) {
        const rows = [];
        const spikeSource = "instagram / social";

        LANDING_PAGE_POOL.forEach(({ landingPage, pageTitle }, idx) => {
            const pageType = THD.data.classifyLandingPageType(landingPage, pageTitle);
            // Demo data has no real per-domain device signal to model, so
            // this stays a simple URL-based guess (unlike the real
            // loadLandingPages, which now reads GA4's actual device
            // column) — a small deliberate Tablet slice is mixed in
            // purely so the Tablet filter option has something to show
            // in demo mode.
            const deviceRoll = Math.random();
            const device = landingPage.startsWith("/smartphone/")
                ? "Smartphone"
                : (deviceRoll < 0.06 ? "Tablet" : "PC");

            // A fixed subset of ~5 sources per page (not the full pool)
            // keeps the breakdown readable, and stable across days so
            // repeat visits to the same page show a consistent set of
            // sources — like a real page would.
            const sources = [spikeSource, ...SOURCE_POOL.filter((s) => s !== spikeSource)]
                .filter((_, sIdx) => (sIdx + idx) % 4 !== 0)
                .slice(0, 5);

            for (let i = 0; i < days; i++) {
                const d = new Date();
                d.setDate(d.getDate() - (days - 1 - i));
                const dateStr = d.toISOString().slice(0, 10);
                const daysFromEnd = days - 1 - i; // 0 = most recent day

                // Rough relative popularity by pool position, so the
                // top-N ranking looks realistic instead of flat noise.
                // System pages (login/order-confirm/home) get an extra
                // traffic boost here on purpose, mirroring the real
                // observation that these tend to dominate raw session
                // counts — so the hide-system-pages toggle actually
                // demonstrates something in demo mode.
                const weight = (pageType === "system" ? 1.6 : 1) * (1 - idx * 0.08);
                let totalSessions = Math.max(5, Math.round((Math.random() * 40 + 20) * weight));

                // Demo-only: give one content page a deliberate rise over
                // the most recent 7 days, with a standout single day in
                // the middle of that window, so the Overview "Rising
                // Landing Page" insight (buildRisingLandingPageInsight)
                // has something real to surface when the live GA4 feed
                // isn't configured yet — random noise alone wouldn't
                // reliably clear its 100%+ threshold. On that standout
                // day specifically, the extra sessions are concentrated
                // into one source below so clicking that bar tells a
                // coherent story ("an Instagram post drove this")
                // instead of flat random noise.
                const isSpikeWeek = idx === 5 && daysFromEnd < 7;
                const isSpikeDay = idx === 5 && daysFromEnd === 2;
                if (isSpikeWeek) {
                    totalSessions = Math.round(totalSessions * 2.6);
                    if (isSpikeDay) totalSessions = Math.round(totalSessions * 1.8);
                }

                const totalPurchases = pageType === "system" ? 0 : (Math.random() < 0.5 ? Math.round(totalSessions * Math.random() * 0.05) : 0);
                const totalRevenue = totalPurchases * (7000 + Math.random() * 6000);

                // Split this page/day's totals across its sources by
                // random weight (renormalized to sum to totalSessions
                // exactly, remainder on the last source) — purchases
                // and revenue follow each source's session share.
                const weights = sources.map((s) => (isSpikeDay && s === spikeSource ? 4 + Math.random() * 2 : Math.random() + 0.1));
                const weightSum = weights.reduce((a, b) => a + b, 0);

                let assignedSessions = 0;
                sources.forEach((sourceMedium, sIdx) => {
                    const isLast = sIdx === sources.length - 1;
                    const sessions = isLast
                        ? Math.max(0, totalSessions - assignedSessions)
                        : Math.round(totalSessions * (weights[sIdx] / weightSum));
                    assignedSessions += sessions;
                    if (sessions <= 0) return;
                    const share = sessions / totalSessions;
                    rows.push({
                        landingPage, pageTitle, device, pageType, date: dateStr, sourceMedium,
                        sessions,
                        purchases: Math.round(totalPurchases * share),
                        revenue: Math.round(totalRevenue * share)
                    });
                });
            }
        });
        return rows;
    }

    // Emergency fallback for Monthly Business Performance specifically
    // (used only if buildBusinessMonths itself returns nothing — e.g.
    // dailyRows failed to load at all) — 13 months, matching the same
    // "13, not 12" window used everywhere else in this section.
    const DUMMY_MONTHLY = [
        { month: "Jul 2025", revenue: 28450300, orders: 2980, users: 34200, cvr: 5.35, trend: 2.1 },
        { month: "Aug 2025", revenue: 30120800, orders: 3050, users: 34980, cvr: 5.41, trend: 5.9 },
        { month: "Sep 2025", revenue: 27880400, orders: 2870, users: 33650, cvr: 5.30, trend: -7.4 },
        { month: "Oct 2025", revenue: 29340600, orders: 2990, users: 34500, cvr: 5.38, trend: 5.2 },
        { month: "Nov 2025", revenue: 33210900, orders: 3320, users: 36700, cvr: 5.60, trend: 13.2 },
        { month: "Dec 2025", revenue: 42780500, orders: 4150, users: 41200, cvr: 6.10, trend: 28.8 },
        { month: "Jan 2026", revenue: 30050100, orders: 3040, users: 35400, cvr: 5.42, trend: -29.7 },
        { month: "Feb 2026", revenue: 31250400, orders: 3210, users: 36800, cvr: 5.62, trend: 4.1 },
        { month: "Mar 2026", revenue: 29870200, orders: 3050, users: 35120, cvr: 5.48, trend: -3.2 },
        { month: "Apr 2026", revenue: 33410900, orders: 3390, users: 38650, cvr: 5.77, trend: 6.5 },
        { month: "May 2026", revenue: 34980100, orders: 3510, users: 39900, cvr: 5.91, trend: 3.9 },
        { month: "Jun 2026", revenue: 33450600, orders: 3800, users: 39420, cvr: 5.95, trend: -1.2 },
        { month: "Jul 2026", revenue: 36182782, orders: 3719, users: 41175, cvr: 6.03, trend: 8.2 }
    ];

    /* ==========================================================
       Render current date range from dailyRows/sourceRows
       already in memory — no re-fetch needed on range change.
    ========================================================== */

    function renderForRange(rangeKey, customRange) {
        currentRange = rangeKey;
        currentCustomRange = rangeKey === "custom" ? customRange : null;

        const range = THD.data.resolveRange(rangeKey, currentCustomRange);

        // "All Sources" filter: when a specific channel is chosen,
        // everything below is scoped to just that channel's rows —
        // derived from sourceRows (the only feed with a channel
        // dimension) rather than the separate dailyRows rollup.
        // Left at "all", nothing changes from before this feature.
        const effectiveSourceRows = sourceFilterChannel === "all"
            ? sourceRows
            : sourceRows.filter((r) => THD.data.classifyForGroupBy(r, "channel") === sourceFilterChannel);
        const effectiveDailyRows = sourceFilterChannel === "all"
            ? dailyRows
            : THD.data.buildDailyRowsFromSources(effectiveSourceRows);

        const filtered = THD.data.filterDailyRange(effectiveDailyRows, rangeKey, currentCustomRange);
        THD.ui.renderKpis(filtered.kpi);
        THD.ui.renderRangeCompare(range);
        THD.ui.renderTrafficPeriodLabels(range);

        THD.charts.renderTrendChart(filtered.labels, filtered.series, THD.ui.getCheckedMetrics(), {
            showTrendOverlay: THD.ui.getTrendOverlayState()
        });

        // Session Source table stays on the current period only.
        const sourcesCurrent = THD.data.filterSourcesByDates(effectiveSourceRows, range.start, range.end);
        sourcesCurrentForFilter = sourcesCurrent;
        renderFilteredSourceTable();

        // Traffic Sources doughnuts: same current window, plus the
        // matching previous window, both grouped the same way.
        const sourcesPrevious = THD.data.filterSourcesByDates(effectiveSourceRows, range.prevStart, range.prevEnd);
        const groupBy = THD.ui.getTrafficGroupBy();
        currentRangeObj = range;
        currentEffectiveSourceRows = effectiveSourceRows;
        currentGroupBy = groupBy;
        const trafficCurrent = THD.data.deriveTrafficBreakdown(sourcesCurrent, groupBy);
        const trafficPrevious = THD.data.deriveTrafficBreakdown(sourcesPrevious, groupBy);

        const currentChannels = THD.charts.renderTrafficChart("trafficChartCurrent", trafficCurrent.channels, trafficCurrent.totalSessions);
        const previousChannels = THD.charts.renderTrafficChart("trafficChartPrevious", trafficPrevious.channels, trafficPrevious.totalSessions);

        lastTrafficComparisonRows = THD.data.buildTrafficComparison(currentChannels, previousChannels);
        THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);
        renderChannelTrendOrDoughnuts();

        const channelAnomalies = THD.data.buildChannelAnomalyInsights(effectiveSourceRows, trafficCurrent.channels, groupBy, range);

        const insightSentences = [
            ...THD.data.buildInsights(filtered.kpi, trafficCurrent.channels),
            ...THD.data.buildAnomalyInsights(filtered.labels, filtered.series)
        ];

        THD.ui.renderInsights(insightSentences, {
            riseInsight: risingPageInsight,
            onRiseClick: onRisingPageInsightClick,
            channelAnomalies,
            onChannelAnomalyClick: onChannelAnomalyInsightClick
        });

        // Monthly Business Performance recomputed here too (rather
        // than only once at load) so it stays in sync with the
        // source filter and with language changes, both of which
        // call renderForRange.
        //
        // 13 months, not 12: the most recent month is always still in
        // progress, so a plain trailing-12 window is really "11
        // complete months + 1 partial one" — one extra month at the
        // far end keeps a full 12 complete months on screen alongside
        // the partial current one, rather than quietly losing a
        // month's worth of the "whole year" picture every time.
        const businessMonths = THD.data.buildBusinessMonths(effectiveDailyRows, 13);
        lastBusinessMonths = businessMonths.length ? businessMonths : DUMMY_MONTHLY;
        THD.ui.renderMonthlyTable(lastBusinessMonths);

        // Goals feature is paused (see the commented-out block in
        // init()) — leave this uncalled for now so the CVR card's
        // "Goal" stat keeps showing its original placeholder value
        // rather than being blanked to "--" by an empty targets object.
        // renderGoalsProgressFromState();
    }

    // Goal progress always compares "This Month" actuals against
    // the saved target — a fixed window independent of whatever
    // date range is selected above (same idea as risingPageInsight's
    // own fixed 7-day window), since a monthly target wouldn't mean
    // much measured against, say, "Last 7 Days".
    function renderGoalsProgressFromState() {
        const monthActuals = THD.data.filterDailyRange(dailyRows, "month", null).kpi;
        THD.ui.renderGoalProgress(monthActuals, currentGoalTargets);
    }

    function renderTrendOnly() {
        const filtered = THD.data.filterDailyRange(dailyRows, currentRange, currentCustomRange);
        THD.charts.renderTrendChart(filtered.labels, filtered.series, THD.ui.getCheckedMetrics(), {
            showTrendOverlay: THD.ui.getTrendOverlayState()
        });
    }

    // "Custom Range" needs two dates before it can render anything, so
    // selecting it just reveals the pickers; rendering happens on Apply.
    // Every other option renders immediately and hides the pickers.
    function wireDateRange() {
        const select = document.getElementById("dateRangeSelect");
        const customInputs = document.getElementById("customRangeInputs");
        const startInput = document.getElementById("customStartDate");
        const endInput = document.getElementById("customEndDate");
        const applyBtn = document.getElementById("applyCustomRange");
        if (!select) return;

        select.addEventListener("change", () => {
            if (select.value === "custom") {
                if (customInputs) customInputs.style.display = "flex";
                return;
            }
            if (customInputs) customInputs.style.display = "none";
            renderForRange(select.value);
        });

        if (applyBtn) {
            applyBtn.addEventListener("click", () => {
                if (!startInput.value || !endInput.value) return;
                const start = new Date(startInput.value);
                const end = new Date(endInput.value);
                if (start > end) return;
                renderForRange("custom", { start, end });
            });
        }
    }

    // Re-renders every piece of JS-generated text (chart legends/
    // tooltips, insight sentences, table rows, the active tab's
    // header) in the newly-selected language, using data already in
    // memory — no re-fetch needed. I18N.wireLanguageToggle() already
    // re-applies [data-i18n] static text before calling this.
    function onLanguageChange() {
        THD.ui.refreshActiveHeader();
        THD.ui.populateSourceFilterOptions(availableChannels);
        THD.ui.renderDataSourceWarning(dataSourceStatus);
        // Rebuilt (not just re-rendered) since insight.sentence is a
        // pre-formatted i18n string baked in at build time, same
        // reason the New/Repeat insights below get rebuilt too.
        risingPageInsight = THD.data.buildRisingLandingPageInsight(landingRows);
        renderForRange(currentRange, currentCustomRange);
        renderLandingPagesForDevice();
        renderNewRepeatChartOnly();
        THD.ui.renderNewRepeatTable(newRepeatRows);
        THD.ui.renderNewRepeatInsights(THD.data.buildNewRepeatInsights(fullNewRepeatRows));
        renderNewRepeatSourceNote();
        THD.ui.refreshNotesList();

        // If the "rising" panel (opened from the Overview insight) is
        // currently open, refresh it in place too — the generic
        // per-row-click panel doesn't need separate handling here since
        // renderLandingPagesForDevice() above already refreshes it as
        // part of its own re-render (by the time it runs, I18N's
        // internal language state has already switched, so its strings
        // come out translated).
        if (risingPanelActiveInsight && !risingPanelActiveGeneric && risingPageInsight) {
            risingPanelActiveInsight = risingPageInsight;
            THD.ui.renderLandingRisingPanel(risingPageInsight);
            THD.charts.renderLandingPageMiniChart("landingRisingPanelChart", risingPageInsight.dailySessions, risingPageInsight.spikeDate,
                (date) => showBreakdownForDate(date, risingPageInsight.pageTitle));
            if (risingPageInsight.spikeDate) showBreakdownForDate(risingPageInsight.spikeDate, risingPageInsight.pageTitle);
        }
    }

    /* ==========================================================
       Init
    ========================================================== */

    async function init() {

        window.I18N.applyStatic();
        window.I18N.wireLanguageToggle(onLanguageChange);

        THD.ui.showInitialSkeletons();
        THD.ui.renderLastUpdate();
        THD.ui.wireSourceTableToggle();
        THD.ui.wireRefreshButton(loadAndRenderAll);
        THD.ui.wireMetricToggles(renderTrendOnly);
        THD.ui.wireMetricToggles(renderAovChartOnly, "aovMetricToggles");
        THD.ui.wireTrendOverlayToggle(renderTrendOnly);
        THD.ui.wireSourceFilterToggle((channel) => {
            sourceFilterChannel = channel;
            activeSourceFilter = null;
            renderForRange(currentRange, currentCustomRange);
        });
        THD.ui.wireTrafficGroupToggle(() => {
            activeSourceFilter = null;
            renderForRange(currentRange, currentCustomRange);
        });
        THD.ui.wireTrafficComparisonFilter((label) => {
            activeSourceFilter = (activeSourceFilter === label) ? null : label;
            THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);
            renderFilteredSourceTable();
            renderChannelTrendOrDoughnuts();
        });
        THD.ui.wireClearSourceFilter(() => {
            activeSourceFilter = null;
            THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);
            renderFilteredSourceTable();
            renderChannelTrendOrDoughnuts();
        });
        THD.ui.wireChannelTrendMetricToggle(renderChannelTrendOrDoughnuts);
        THD.ui.wireChannelTrendCloseButton(() => {
            activeSourceFilter = null;
            THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);
            renderFilteredSourceTable();
            renderChannelTrendOrDoughnuts();
        });
        THD.ui.wireLandingDeviceToggle(renderLandingPagesForDevice);
        THD.ui.wireHideSystemToggle(renderLandingPagesForDevice);
        THD.ui.wireLandingPagesToggle();
        THD.ui.wireLandingPageItemClick(onLandingPageItemClick);
        THD.ui.wireLandingRisingPanelClose(() => {
            risingPanelActiveInsight = null;
            risingPanelActiveGeneric = false;
        });
        THD.ui.wireSourceBreakdownRowClicks((label) => {
            if (!breakdownContext) return;
            const detail = THD.data.buildDayPageSourceDetail(landingRows, breakdownContext.pageTitle, breakdownContext.date, breakdownContext.groupBy, label);
            THD.ui.renderSourceBreakdownDetail(label, detail);
        });
        THD.ui.wireSidebarNav(THD.charts.resizeCharts);
        THD.ui.wireThemeToggle(() => {
            renderForRange(currentRange, currentCustomRange);
            renderNewRepeatChartOnly();
        });
        THD.ui.wireNotes();

        // ---- Monthly Targets (Goals) ----
        // Built for v2, but the target-setting approach itself hasn't
        // been settled on yet — paused rather than shipped. Everything
        // (js/goals.js, the Settings-page form markup, the KPI card
        // progress bar CSS/HTML) is still in place; re-enable by
        // uncommenting this block, adding the js/goals.js <script> tag
        // back in index.html, and restoring the Monthly Targets section
        // on the Settings page (see git history / previous zip).
        //
        // THD.goals.subscribe((targets) => {
        //     currentGoalTargets = targets;
        //     THD.ui.renderGoalsForm(targets);
        //     renderGoalsProgressFromState();
        // });
        // THD.ui.wireGoalsForm((targets) => {
        //     THD.ui.setGoalsStatus("");
        //     THD.goals.save(targets).then(() => {
        //         THD.ui.setGoalsStatus(window.I18N.t("settings.goalsSaved"));
        //     }).catch(() => {
        //         THD.ui.setGoalsStatus(window.I18N.t("settings.goalsError"), true);
        //     });
        // });

        // ---- CSV Export ----
        // Raw numeric values, not the display-formatted strings on
        // screen (no ¥, no thousands separators) — so the exported
        // file is actually useful to re-open and compute on.
        THD.ui.wireCsvExportButtons({
            exportSourceCsvBtn: () => {
                THD.exportUtil.downloadCsv("thd-session-source.csv", [
                    { key: "sourceMedium", header: "Source / Medium" },
                    { key: "sessions", header: "Sessions" },
                    { key: "users", header: "Total Users" },
                    { key: "purchases", header: "Ecommerce Purchases" },
                    { key: "revenue", header: "Total Revenue" },
                    { header: "CVR (%)", value: (r) => r.cvr.toFixed(2) }
                ], sourcesCurrentForFilter);
            },
            exportTrafficCsvBtn: () => {
                THD.exportUtil.downloadCsv("thd-traffic-comparison.csv", [
                    { key: "label", header: "Source" },
                    { header: "Sessions (Current)", value: (r) => r.current ? r.current.sessions : 0 },
                    { header: "Sessions (Previous)", value: (r) => r.previous ? r.previous.sessions : 0 },
                    {
                        header: "Delta vs Previous (%)",
                        value: (r) => {
                            const cur = r.current ? r.current.sessions : 0;
                            const prev = r.previous ? r.previous.sessions : 0;
                            return prev ? ((cur - prev) / prev * 100).toFixed(2) : "";
                        }
                    },
                    { header: "Revenue (Current)", value: (r) => r.current ? r.current.revenue : 0 },
                    { header: "CVR (Current, %)", value: (r) => r.current ? r.current.cvr.toFixed(2) : "" }
                ], lastTrafficComparisonRows);
            },
            exportMonthlyCsvBtn: () => {
                THD.exportUtil.downloadCsv("thd-monthly-performance.csv", [
                    { key: "month", header: "Month" },
                    { key: "revenue", header: "Revenue" },
                    { key: "orders", header: "Orders" },
                    { key: "users", header: "Total Users" },
                    { header: "CVR (%)", value: (r) => r.cvr.toFixed(2) },
                    { header: "Trend vs Prior Month (%)", value: (r) => r.trend.toFixed(2) }
                ], lastBusinessMonths);
            },
            exportNewRepeatCsvBtn: () => {
                THD.exportUtil.downloadCsv("thd-new-repeat.csv", [
                    { key: "period", header: "Period" },
                    { key: "totalRevenue", header: "Total Revenue" },
                    { key: "totalOrders", header: "Total Orders" },
                    { key: "newRevenue", header: "New Revenue" },
                    { key: "newOrders", header: "New Orders" },
                    { key: "repeatRevenue", header: "Repeat Revenue" },
                    { key: "repeatOrders", header: "Repeat Orders" },
                    { key: "visitorsPc", header: "Visitors (PC)" },
                    { key: "visitorsSp", header: "Visitors (SP)" },
                    { key: "visitorsTotal", header: "Visitors (Total)" }
                ], newRepeatRows);
            }
        });

        // ---- PDF Export ----
        // Prints the whole active tab exactly as it currently looks —
        // whatever date range/source filter/toggle state is applied —
        // rather than a hand-built summary. css/print.css hides the
        // sidebar and action buttons and leaves everything else (the
        // .dashboardView that isn't .viewHidden, i.e. whichever tab is
        // open) to print natively, checkboxes/selects/canvases and
        // all, so it's a faithful snapshot of what's on screen.
        THD.ui.wireExportPdfButton(() => {
            THD.exportUtil.printCurrentView();
        });

        wireDateRange();

        await loadAndRenderAll();
    }

    async function loadAndRenderAll() {

        // Each source loads independently and falls back to dummy
        // data on its own, so a partial live setup still works.
        const [liveDaily, liveSources, liveNewRepeat, liveLandingPages] = await Promise.all([
            THD.data.loadDailyGA4(),
            THD.data.loadSources(),
            THD.data.loadNewRepeat(),
            THD.data.loadLandingPages()
        ]);

        dailyRows = liveDaily && liveDaily.length ? liveDaily : buildDummyDailyRows();
        sourceRows = liveSources && liveSources.length ? liveSources : buildDummySourcesDaily();
        landingRows = liveLandingPages && liveLandingPages.length ? liveLandingPages : buildDummyLandingPagesDaily();
        const newRepeat = liveNewRepeat && liveNewRepeat.length ? liveNewRepeat : buildDummyNewRepeat();

        dataSourceStatus = {
            daily: !!(liveDaily && liveDaily.length),
            sources: !!(liveSources && liveSources.length),
            landingPages: !!(liveLandingPages && liveLandingPages.length),
            newRepeat: !!(liveNewRepeat && liveNewRepeat.length)
        };
        THD.ui.renderDataSourceWarning(dataSourceStatus);

        availableChannels = THD.data.listAvailableChannels(sourceRows, "channel");
        THD.ui.populateSourceFilterOptions(availableChannels);

        // Fixed 7-day-vs-prior-7-day window (independent of the main
        // date-range picker), so this must be computed before the
        // first renderForRange call — renderForRange is what actually
        // passes it into THD.ui.renderInsights.
        risingPageInsight = THD.data.buildRisingLandingPageInsight(landingRows);

        renderForRange(currentRange, currentCustomRange);
        renderLandingPagesForDevice();

        // Table and chart both stay capped to a recent window — full
        // history (back to 2021) lives in the linked spreadsheet, and
        // 50+ rows/bars stopped being readable in either view. The
        // insights below run on the FULL history instead, since the
        // year-over-year comparison needs to look back further than
        // what's shown on screen.
        //
        // 13 months, not 12, for the same reason as businessMonths in
        // renderForRange above: the most recent month is still in
        // progress, so this keeps a full 12 complete months on screen
        // alongside it instead of displacing one of them.
        const recentNewRepeat = newRepeat.slice(-13);
        THD.ui.renderNewRepeatTable(recentNewRepeat);
        newRepeatRows = recentNewRepeat;
        fullNewRepeatRows = newRepeat;
        renderNewRepeatChartOnly();
        THD.ui.renderNewRepeatInsights(THD.data.buildNewRepeatInsights(newRepeat));
        renderNewRepeatSourceNote();

        THD.ui.renderLastUpdate();
    }

    document.addEventListener("DOMContentLoaded", init);

})();
