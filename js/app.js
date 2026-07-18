/* ==========================================================
   THD Analytics
   App Init
   Version 0.3

   Data flow:
     THD.data.loadDailyGA4() / loadSources() / loadNewRepeat()
     each try a live Google Sheets CSV (see js/data.js CONFIG)
     and fall back to dummy data below if not configured yet.

   The date-range selector re-filters the already-fetched daily
   rows in memory — no re-fetch needed when switching ranges.
========================================================== */

(function () {

    let dailyRows = [];       // full daily GA4 rows (real or dummy), oldest -> newest
    let currentRangeDays = 30;

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

    function buildDummyDailyRows(days = 90) {
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
        "newsletter / email", "ameblo.jp / referral", "rakuten / referral",
        "criteo / display", "bing / organic", "twitter / social", "pinterest / social",
        "biopaste.jp / referral", "aosorahiroba.jugem.jp / referral", "admanager.google.com / referral",
        "adclick.g.doubleclick.net / referral", "a20.hm-f.jp / referral", "a05.hm-f.jp / referral"
    ];

    function buildDummySources() {
        return SOURCE_POOL.map((name) => {
            const sessions = Math.round(Math.random() * 1800 + 1);
            const users = Math.round(sessions * (0.75 + Math.random() * 0.2));
            const purchases = Math.random() < 0.6 ? Math.round(sessions * Math.random() * 0.04) : 0;
            const revenue = purchases * (7000 + Math.random() * 6000);
            return {
                sourceMedium: name,
                sessions,
                users,
                purchases,
                revenue,
                cvr: sessions ? (purchases / sessions) * 100 : 0
            };
        }).sort((a, b) => b.sessions - a.sessions);
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

    const DUMMY_TRAFFIC = {
        labels: ["Google CPC", "Organic Search", "Direct", "Social", "Referral"],
        values: [29, 26, 21, 15, 9]
    };

    const DUMMY_LANDING_PAGES = [
        { path: "/products/summer-sale", sessions: 8420 },
        { path: "/", sessions: 7110 },
        { path: "/blog/style-guide-2026", sessions: 4890 },
        { path: "/products/new-arrivals", sessions: 3260 },
        { path: "/about", sessions: 1540 }
    ];

    const DUMMY_MONTHLY = [
        { month: "Feb 2026", revenue: 31250400, orders: 3210, users: 36800, cvr: 5.62, trend: 4.1 },
        { month: "Mar 2026", revenue: 29870200, orders: 3050, users: 35120, cvr: 5.48, trend: -3.2 },
        { month: "Apr 2026", revenue: 33410900, orders: 3390, users: 38650, cvr: 5.77, trend: 6.5 },
        { month: "May 2026", revenue: 34980100, orders: 3510, users: 39900, cvr: 5.91, trend: 3.9 },
        { month: "Jun 2026", revenue: 33450600, orders: 3800, users: 39420, cvr: 5.95, trend: -1.2 },
        { month: "Jul 2026", revenue: 36182782, orders: 3719, users: 41175, cvr: 6.03, trend: 8.2 }
    ];

    /* ==========================================================
       Render current date range from dailyRows already in memory
    ========================================================== */

    function renderForRange(days) {
        currentRangeDays = days;
        const filtered = THD.data.filterDailyRange(dailyRows, days);
        THD.ui.renderKpis(filtered.kpi);
        THD.charts.renderTrendChart(filtered.labels, filtered.users, filtered.purchases);
    }

    function wireDateRange() {
        const select = document.getElementById("dateRangeSelect");
        if (!select) return;
        select.addEventListener("change", () => {
            renderForRange(Number(select.value));
        });
    }

    /* ==========================================================
       Init
    ========================================================== */

    async function init() {

        THD.ui.renderLastUpdate();
        THD.ui.wireSourceTableToggle();
        THD.ui.wireRefreshButton(loadAndRenderAll);
        wireDateRange();

        await loadAndRenderAll();
    }

    async function loadAndRenderAll() {

        // Each source loads independently and falls back to dummy
        // data on its own, so a partial live setup still works.
        const [liveDaily, liveSources, liveNewRepeat] = await Promise.all([
            THD.data.loadDailyGA4(),
            THD.data.loadSources(),
            THD.data.loadNewRepeat()
        ]);

        dailyRows = liveDaily && liveDaily.length ? liveDaily : buildDummyDailyRows(90);
        const sources = liveSources && liveSources.length ? liveSources : buildDummySources();
        const newRepeat = liveNewRepeat && liveNewRepeat.length ? liveNewRepeat : buildDummyNewRepeat();

        renderForRange(currentRangeDays);

        THD.ui.renderLandingPages(DUMMY_LANDING_PAGES);
        THD.ui.renderSourceTable(sources);
        THD.ui.renderMonthlyTable(DUMMY_MONTHLY);
        THD.ui.renderNewRepeatTable(newRepeat);

        const legendItems = THD.charts.renderTrafficChart(DUMMY_TRAFFIC.labels, DUMMY_TRAFFIC.values);
        THD.ui.renderTrafficLegend(legendItems);

        THD.ui.renderLastUpdate();
    }

    document.addEventListener("DOMContentLoaded", init);

})();
