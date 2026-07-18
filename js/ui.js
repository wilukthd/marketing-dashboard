/* ==========================================================
   THD Analytics
   UI Rendering & Interactions
   Version 0.2
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    /* ==========================================================
       Formatters
    ========================================================== */

    const fmtYen = (n) => "¥" + Math.round(n).toLocaleString("en-US");
    const fmtYenCompact = (n) => "¥" + (n / 1e6).toFixed(2) + "M";
    const fmtNumber = (n) => Math.round(n).toLocaleString("en-US");
    const fmtPercent = (n) => n.toFixed(2) + "%";
    const fmtDelta = (n) => (n > 0 ? "▲ " : n < 0 ? "▼ " : "– ") + Math.abs(n).toFixed(1) + "%";

    /* ==========================================================
       Last Update
    ========================================================== */

    function renderLastUpdate() {
        const el = document.getElementById("lastUpdate");
        if (!el) return;
        const now = new Date();
        el.textContent = now.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    /* ==========================================================
       KPI Cards
       Each card is <article data-kpi="key"> with children
       marked data-field="value|delta|daily"
    ========================================================== */

    const KPI_FORMATS = {
        users: { value: fmtNumber, daily: fmtNumber },
        sessions: { value: fmtNumber, daily: fmtNumber },
        purchases: { value: fmtNumber, daily: fmtNumber },
        revenue: { value: fmtYen, daily: fmtYenCompact },
        cvr: { value: fmtPercent, daily: fmtPercent }
    };

    function renderKpis(kpi) {
        Object.entries(kpi).forEach(([key, data]) => {
            const card = document.querySelector(`[data-kpi="${key}"]`);
            const format = KPI_FORMATS[key];
            if (!card || !format) return;

            const valueEl = card.querySelector('[data-field="value"]');
            const deltaEl = card.querySelector('[data-field="delta"]');
            const dailyEl = card.querySelector('[data-field="daily"]');

            if (valueEl) valueEl.textContent = format.value(data.value);

            if (deltaEl) {
                deltaEl.textContent = fmtDelta(data.delta);
                deltaEl.classList.remove("positive", "negative");
                deltaEl.classList.add(data.delta >= 0 ? "positive" : "negative");
            }

            if (dailyEl) dailyEl.textContent = format.daily(data.daily);
        });
    }

    /* ==========================================================
       Landing Pages
    ========================================================== */

    function renderLandingPages(pages) {
        const container = document.getElementById("landingPages");
        if (!container) return;

        const maxSessions = Math.max(...pages.map((p) => p.sessions));

        container.innerHTML = pages.map((p) => `
            <div class="landingItem">
                <div class="landingItemTop">
                    <span>${p.path}</span>
                    <small>${fmtNumber(p.sessions)} sessions</small>
                </div>
                <div class="landingBar">
                    <div class="landingBarFill" style="width:${(p.sessions / maxSessions) * 100}%"></div>
                </div>
            </div>
        `).join("");
    }

    /* ==========================================================
       Traffic Legend
    ========================================================== */

    function renderTrafficLegend(items) {
        const container = document.getElementById("trafficLegend");
        if (!container) return;

        container.innerHTML = items.map((item) => `
            <div class="legendItem">
                <span class="legendColor" style="background:${item.color}"></span>
                ${item.label}
            </div>
        `).join("");
    }

    /* ==========================================================
       Session Source / Medium Table
    ========================================================== */

    let allSourceRows = [];
    let sourcesExpanded = false;
    const COLLAPSED_ROW_COUNT = 8;

    function sourceRowHtml(r) {
        return `
            <tr>
                <td>${r.sourceMedium}</td>
                <td class="number">${fmtNumber(r.sessions)}</td>
                <td class="number">${fmtNumber(r.users)}</td>
                <td class="number">${fmtNumber(r.purchases)}</td>
                <td class="number">${fmtYen(r.revenue)}</td>
                <td class="number">${fmtPercent(r.cvr)}</td>
            </tr>
        `;
    }

    function renderSourceTable(rows) {
        allSourceRows = rows;
        const tbody = document.getElementById("sourceTable");
        if (!tbody) return;

        const visible = sourcesExpanded ? allSourceRows : allSourceRows.slice(0, COLLAPSED_ROW_COUNT);
        tbody.innerHTML = visible.map(sourceRowHtml).join("");

        const btn = document.getElementById("toggleSourcesBtn");
        if (btn) {
            btn.textContent = sourcesExpanded
                ? "Show Less"
                : `Show All (${allSourceRows.length})`;
        }
    }

    function wireSourceTableToggle() {
        const btn = document.getElementById("toggleSourcesBtn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            sourcesExpanded = !sourcesExpanded;
            renderSourceTable(allSourceRows);
        });
    }

    /* ==========================================================
       Monthly Business Performance Table
    ========================================================== */

    function renderMonthlyTable(rows) {
        const tbody = document.getElementById("monthlyTable");
        if (!tbody) return;

        tbody.innerHTML = rows.map((r) => `
            <tr>
                <td>${r.month}</td>
                <td class="number">${fmtYen(r.revenue)}</td>
                <td class="number">${fmtNumber(r.orders)}</td>
                <td class="number">${fmtNumber(r.users)}</td>
                <td class="number">${fmtPercent(r.cvr)}</td>
                <td>
                    <span class="status ${r.trend >= 0 ? "up" : "down"}">
                        ${r.trend >= 0 ? "▲" : "▼"} ${Math.abs(r.trend).toFixed(1)}%
                    </span>
                </td>
            </tr>
        `).join("");
    }

    /* ==========================================================
       New / Repeat Customer Table (spreadsheet)
    ========================================================== */

    function renderNewRepeatTable(rows) {
        const tbody = document.getElementById("newRepeatTable");
        if (!tbody) return;

        tbody.innerHTML = rows.map((r) => `
            <tr>
                <td>${r.period}</td>
                <td class="number">${fmtYen(r.totalRevenue)}</td>
                <td class="number">${fmtNumber(r.totalOrders)}</td>
                <td class="number">${fmtYen(r.newRevenue)}</td>
                <td class="number">${fmtNumber(r.newOrders)}</td>
                <td class="number">${fmtYen(r.repeatRevenue)}</td>
                <td class="number">${fmtNumber(r.repeatOrders)}</td>
                <td class="number">${fmtNumber(r.visitorsPc)}</td>
                <td class="number">${fmtNumber(r.visitorsSp)}</td>
                <td class="number">${fmtNumber(r.visitorsTotal)}</td>
            </tr>
        `).join("");
    }

    /* ==========================================================
       Refresh Button
    ========================================================== */

    function wireRefreshButton(onRefresh) {
        const btn = document.querySelector(".primaryButton");
        if (!btn) return;

        btn.addEventListener("click", () => {
            const icon = btn.querySelector("svg");
            btn.disabled = true;
            if (icon) icon.style.animation = "spin .6s linear infinite";

            setTimeout(() => {
                onRefresh();
                renderLastUpdate();
                btn.disabled = false;
                if (icon) icon.style.animation = "";
            }, 500);
        });
    }

    THD.ui = {
        renderLastUpdate,
        renderKpis,
        renderLandingPages,
        renderTrafficLegend,
        renderSourceTable,
        wireSourceTableToggle,
        renderMonthlyTable,
        renderNewRepeatTable,
        wireRefreshButton
    };

})(window.THD);
