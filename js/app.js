/* ==========================================================
   THD Analytics
   App Init
   Version 0.4

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
    let landingRows = [];     // full per-day-per-path rows (real or dummy)
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

    function renderNewRepeatChartForMetric() {
        THD.charts.renderNewRepeatChart(newRepeatRows, THD.ui.getNewRepeatMetric());
        THD.charts.renderAovChart(newRepeatRows);
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
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            const dateStr = d.toISOString().slice(0, 10);

            LANDING_PAGE_POOL.forEach(({ landingPage, pageTitle }, idx) => {
                // Rough relative popularity by pool position, so the
                // top-N ranking looks realistic instead of flat noise.
                // System pages (login/order-confirm/home) get an extra
                // traffic boost here on purpose, mirroring the real
                // observation that these tend to dominate raw session
                // counts — so the hide-system-pages toggle actually
                // demonstrates something in demo mode.
                const pageType = THD.data.classifyLandingPageType(landingPage, pageTitle);
                const weight = (pageType === "system" ? 1.6 : 1) * (1 - idx * 0.08);
                const sessions = Math.max(5, Math.round((Math.random() * 40 + 20) * weight));
                const purchases = pageType === "system" ? 0 : (Math.random() < 0.5 ? Math.round(sessions * Math.random() * 0.05) : 0);
                const revenue = purchases * (7000 + Math.random() * 6000);
                const device = landingPage.startsWith("/smartphone/") ? "Smartphone" : "PC";
                rows.push({ landingPage, pageTitle, device, pageType, date: dateStr, sessions, purchases, revenue });
            });
        }
        return rows;
    }

    const DUMMY_MONTHLY = [
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
        const trafficCurrent = THD.data.deriveTrafficBreakdown(sourcesCurrent, groupBy);
        const trafficPrevious = THD.data.deriveTrafficBreakdown(sourcesPrevious, groupBy);

        const currentChannels = THD.charts.renderTrafficChart("trafficChartCurrent", trafficCurrent.channels, trafficCurrent.totalSessions);
        const previousChannels = THD.charts.renderTrafficChart("trafficChartPrevious", trafficPrevious.channels, trafficPrevious.totalSessions);

        lastTrafficComparisonRows = THD.data.buildTrafficComparison(currentChannels, previousChannels);
        THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);

        THD.ui.renderInsights([
            ...THD.data.buildInsights(filtered.kpi, trafficCurrent.channels),
            ...THD.data.buildAnomalyInsights(filtered.labels, filtered.series)
        ]);

        // Monthly Business Performance recomputed here too (rather
        // than only once at load) so it stays in sync with the
        // source filter and with language changes, both of which
        // call renderForRange.
        const businessMonths = THD.data.buildBusinessMonths(effectiveDailyRows, 12);
        THD.ui.renderMonthlyTable(businessMonths.length ? businessMonths : DUMMY_MONTHLY);
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
        renderForRange(currentRange, currentCustomRange);
        renderLandingPagesForDevice();
        renderNewRepeatChartForMetric();
        THD.ui.renderNewRepeatTable(newRepeatRows);
        THD.ui.renderNewRepeatInsights(THD.data.buildNewRepeatInsights(fullNewRepeatRows));
        renderNewRepeatSourceNote();
        THD.ui.refreshNotesList();
    }

    /* ==========================================================
       Init
    ========================================================== */

    async function init() {

        window.I18N.applyStatic();
        window.I18N.wireLanguageToggle(onLanguageChange);

        THD.ui.renderLastUpdate();
        THD.ui.wireSourceTableToggle();
        THD.ui.wireRefreshButton(loadAndRenderAll);
        THD.ui.wireMetricToggles(renderTrendOnly);
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
        });
        THD.ui.wireClearSourceFilter(() => {
            activeSourceFilter = null;
            THD.ui.renderTrafficComparison(lastTrafficComparisonRows, activeSourceFilter);
            renderFilteredSourceTable();
        });
        THD.ui.wireNewRepeatMetricToggle(renderNewRepeatChartForMetric);
        THD.ui.wireLandingDeviceToggle(renderLandingPagesForDevice);
        THD.ui.wireHideSystemToggle(renderLandingPagesForDevice);
        THD.ui.wireLandingPagesToggle();
        THD.ui.wireSidebarNav(THD.charts.resizeCharts);
        THD.ui.wireThemeToggle(() => {
            renderForRange(currentRange, currentCustomRange);
            renderNewRepeatChartForMetric();
        });
        THD.ui.wireNotes();
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

        renderForRange(currentRange, currentCustomRange);
        renderLandingPagesForDevice();

        // Table and chart both stay capped to a recent window — full
        // history (back to 2021) lives in the linked spreadsheet, and
        // 50+ rows/bars stopped being readable in either view. The
        // insights below run on the FULL history instead, since the
        // year-over-year comparison needs to look back further than
        // what's shown on screen.
        const recentNewRepeat = newRepeat.slice(-12);
        THD.ui.renderNewRepeatTable(recentNewRepeat);
        newRepeatRows = recentNewRepeat;
        fullNewRepeatRows = newRepeat;
        renderNewRepeatChartForMetric();
        THD.ui.renderNewRepeatInsights(THD.data.buildNewRepeatInsights(newRepeat));
        renderNewRepeatSourceNote();

        THD.ui.renderLastUpdate();
    }

    document.addEventListener("DOMContentLoaded", init);

})();
