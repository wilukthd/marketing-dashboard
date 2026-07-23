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
    const fmtISODate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}/${m}/${day}`;
    };

    /* ==========================================================
       Range Comparison Bar
       Spells out the exact two date windows behind whatever the
       KPI cards are currently comparing, since "This Month" alone
       doesn't say what it's being measured against.
    ========================================================== */

    function renderRangeCompare(range) {
        const el = document.getElementById("rangeCompareBar");
        if (!el || !range) return;

        el.innerHTML = `
            <i data-lucide="calendar-range"></i>
            Looking at <strong>${fmtISODate(range.start)} – ${fmtISODate(range.end)}</strong>
            <span class="rangeVs">vs previous period</span>
            <strong>${fmtISODate(range.prevStart)} – ${fmtISODate(range.prevEnd)}</strong>
        `;
        if (window.lucide) lucide.createIcons();
    }

    /* ==========================================================
       Traffic Doughnut Period Labels
       Spells out the exact dates behind "selected period" and
       "previous period" next to each doughnut, same idea as
       renderRangeCompare above but placed at the chart itself.
    ========================================================== */

    function renderTrafficPeriodLabels(range) {
        if (!range) return;
        const curEl = document.getElementById("trafficPeriodCurrent");
        const prevEl = document.getElementById("trafficPeriodPrevious");
        const landingEl = document.getElementById("landingPagesPeriod");
        if (curEl) curEl.textContent = `${fmtISODate(range.start)} – ${fmtISODate(range.end)}`;
        if (prevEl) prevEl.textContent = `${fmtISODate(range.prevStart)} – ${fmtISODate(range.prevEnd)}`;
        if (landingEl) landingEl.textContent = `${fmtISODate(range.start)} – ${fmtISODate(range.end)}`;
    }

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

        if (!pages || !pages.length) {
            container.innerHTML = `<p class="emptyRow">No landing page data for this period.</p>`;
            return;
        }

        const maxSessions = Math.max(...pages.map((p) => p.sessions));

        container.innerHTML = pages.map((p) => {
            const stats = (p.revenue !== undefined)
                ? `<small>${fmtNumber(p.sessions)} sessions · ${fmtYen(p.revenue)} · ${fmtPercent(p.cvr)} CVR</small>`
                : `<small>${fmtNumber(p.sessions)} sessions</small>`;
            return `
                <div class="landingItem">
                    <div class="landingItemTop">
                        <span>${p.path}</span>
                        ${stats}
                    </div>
                    <div class="landingBar">
                        <div class="landingBarFill" style="width:${(p.sessions / maxSessions) * 100}%"></div>
                    </div>
                </div>
            `;
        }).join("");
    }

    /* ==========================================================
       Key Insights
    ========================================================== */

    function renderInsights(insights) {
        const container = document.querySelector(".insightCard ul");
        if (!container) return;

        if (!insights || !insights.length) {
            container.innerHTML = `<li>Not enough data yet to generate insights for this period.</li>`;
            return;
        }

        container.innerHTML = insights.map((text) => `<li>${text}</li>`).join("");
    }

    /* ==========================================================
       Dark Theme Toggle
       The actual dark/light attribute + localStorage persistence
       is handled here; onToggle lets app.js re-render charts
       afterward, since Chart.js colors are baked in at creation
       time and won't update on their own.
    ========================================================== */

    function wireThemeToggle(onToggle) {
        const checkbox = document.getElementById("darkThemeToggle");
        if (!checkbox) return;

        checkbox.checked = document.documentElement.getAttribute("data-theme") === "dark";

        checkbox.addEventListener("change", () => {
            const isDark = checkbox.checked;
            document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
            try {
                localStorage.setItem("thd-theme", isDark ? "dark" : "light");
            } catch (e) {
                // Private browsing / storage disabled — theme just won't persist across reloads.
            }
            if (onToggle) onToggle();
        });
    }

    /* ==========================================================
       Notes
       A simple dated remarks log, kept in localStorage since
       there's no backend — meant for things like "discussed
       re-pricing X after the Q3 review" rather than analytics.
    ========================================================== */

    const NOTES_KEY = "thd-notes";

    function loadNotes() {
        try {
            return JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");
        } catch (e) {
            return [];
        }
    }

    function saveNotes(notes) {
        try {
            localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
        } catch (e) {
            // Private browsing / storage disabled — notes just won't persist across reloads.
        }
    }

    function renderNotesList(notes) {
        const container = document.getElementById("notesList");
        if (!container) return;

        if (!notes.length) {
            container.innerHTML = `<p class="notesEmpty">No notes yet — add one above.</p>`;
            return;
        }

        container.innerHTML = notes.map((n) => `
            <div class="noteItem" data-id="${n.id}">
                <div class="noteItemBody">
                    <div class="noteItemDate">${new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                    <div class="noteItemText"></div>
                </div>
                <button class="noteDeleteBtn" data-id="${n.id}" title="Delete note">
                    <i data-lucide="x"></i>
                </button>
            </div>
        `).join("");

        // Set text via textContent (not template interpolation) so a
        // note containing HTML-looking text can't inject markup.
        container.querySelectorAll(".noteItem").forEach((el) => {
            const id = el.dataset.id;
            const note = notes.find((n) => String(n.id) === id);
            const textEl = el.querySelector(".noteItemText");
            if (note && textEl) textEl.textContent = note.text;
        });

        if (window.lucide) lucide.createIcons();
    }

    function wireNotes() {
        const input = document.getElementById("noteInput");
        const addBtn = document.getElementById("addNoteBtn");
        const list = document.getElementById("notesList");
        if (!input || !addBtn || !list) return;

        let notes = loadNotes();
        renderNotesList(notes);

        addBtn.addEventListener("click", () => {
            const text = input.value.trim();
            if (!text) return;
            notes = [{ id: Date.now(), text, createdAt: Date.now() }, ...notes];
            saveNotes(notes);
            renderNotesList(notes);
            input.value = "";
        });

        list.addEventListener("click", (e) => {
            const btn = e.target.closest(".noteDeleteBtn");
            if (!btn) return;
            notes = notes.filter((n) => String(n.id) !== btn.dataset.id);
            saveNotes(notes);
            renderNotesList(notes);
        });
    }

    /* ==========================================================
       Traffic Comparison Table
       One row per channel/platform, showing the current period
       right next to the previous one (rather than two separate
       legends) so the reader can actually compare them instead of
       cross-referencing two lists by eye.
    ========================================================== */

    function trafficCompareRowHtml(row, activeLabel) {
        const cur = row.current;
        const prev = row.previous;
        const curSessions = cur ? cur.sessions : 0;
        const prevSessions = prev ? prev.sessions : 0;
        const color = (cur && cur.color) || (prev && prev.color) || "#94A3B8";
        const isActive = !!activeLabel && activeLabel === row.label;

        let deltaHtml = "—";
        if (prevSessions > 0) {
            const delta = ((curSessions - prevSessions) / prevSessions) * 100;
            deltaHtml = `<span class="deltaBadge ${delta >= 0 ? "positive" : "negative"}">${fmtDelta(delta)}</span>`;
        } else if (curSessions > 0) {
            deltaHtml = `<span class="deltaBadge positive">New</span>`;
        }

        return `
            <tr class="tcRow${isActive ? " active" : ""}" data-label="${row.label}" title="Click to see the sources behind ${row.label} below">
                <td class="tcSource">
                    <span class="tcSourceInner">
                        <span class="legendColor" style="background:${color}"></span>
                        ${row.label}
                    </span>
                </td>
                <td class="number">${cur ? fmtNumber(cur.sessions) : "—"}</td>
                <td class="number">${prev ? fmtNumber(prev.sessions) : "—"}</td>
                <td class="number">${deltaHtml}</td>
                <td class="number">${cur ? fmtYen(cur.revenue) : "—"}</td>
                <td class="number">${cur ? fmtPercent(cur.cvr) : "—"}</td>
            </tr>
        `;
    }

    function renderTrafficComparison(rows, activeLabel) {
        const tbody = document.getElementById("trafficCompareTable");
        if (!tbody) return;

        if (!rows || !rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="emptyRow">No traffic data for this period.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map((r) => trafficCompareRowHtml(r, activeLabel)).join("");
    }

    // Clicking a row asks app.js (which holds the raw source rows and
    // current groupBy) to filter the Session Source table down to just
    // that bucket — e.g. click "Referral (Other)" to see which actual
    // sites make it up. Clicking the same row again clears it; app.js
    // owns that toggle logic, this just reports which label was clicked.
    function wireTrafficComparisonFilter(onRowClick) {
        const tbody = document.getElementById("trafficCompareTable");
        if (!tbody) return;
        tbody.addEventListener("click", (e) => {
            const row = e.target.closest("tr.tcRow");
            if (!row) return;
            onRowClick(row.dataset.label);
        });
    }

    /* ==========================================================
       Traffic Grouping Toggle (Ad Platform vs GA4 Channel)
    ========================================================== */

    function getTrafficGroupBy() {
        const select = document.getElementById("trafficGroupSelect");
        return select ? select.value : "platform";
    }

    function wireTrafficGroupToggle(onChange) {
        const select = document.getElementById("trafficGroupSelect");
        if (!select) return;
        select.addEventListener("change", () => onChange(select.value));
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

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="emptyRow">No sources match this filter for the selected period.</td></tr>`;
            const btn = document.getElementById("toggleSourcesBtn");
            if (btn) btn.style.display = "none";
            return;
        }

        const visible = sourcesExpanded ? allSourceRows : allSourceRows.slice(0, COLLAPSED_ROW_COUNT);
        tbody.innerHTML = visible.map(sourceRowHtml).join("");

        const btn = document.getElementById("toggleSourcesBtn");
        if (btn) {
            btn.style.display = "";
            btn.textContent = sourcesExpanded
                ? "Show Less"
                : `Show All (${allSourceRows.length})`;
        }
    }

    // Small "Filtered by: <label> [Clear]" indicator shown above the
    // Session Source table once a Traffic Comparison row is clicked.
    function renderSourceFilterStatus(label) {
        const status = document.getElementById("sourceFilterStatus");
        const labelEl = document.getElementById("sourceFilterLabel");
        if (!status || !labelEl) return;
        if (label) {
            labelEl.textContent = label;
            status.style.display = "flex";
        } else {
            status.style.display = "none";
        }
    }

    function wireClearSourceFilter(onClear) {
        const btn = document.getElementById("clearSourceFilterBtn");
        if (!btn) return;
        btn.addEventListener("click", onClear);
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
       New / Repeat Chart Metric Toggle (Orders vs Revenue)
    ========================================================== */

    function getNewRepeatMetric() {
        const select = document.getElementById("newRepeatMetricSelect");
        return select ? select.value : "orders";
    }

    function wireNewRepeatMetricToggle(onChange) {
        const select = document.getElementById("newRepeatMetricSelect");
        if (!select) return;
        select.addEventListener("change", () => onChange(select.value));
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
       Trend Chart Metric Toggles
    ========================================================== */

    function getCheckedMetrics() {
        const container = document.getElementById("metricToggles");
        if (!container) return [];
        return Array.from(container.querySelectorAll(".metricToggle"))
            .filter((label) => label.querySelector("input").checked)
            .map((label) => label.dataset.metric);
    }

    function wireMetricToggles(onChange) {
        const container = document.getElementById("metricToggles");
        if (!container) return;
        container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener("change", () => onChange(getCheckedMetrics()));
        });
    }

    /* ==========================================================
       Trend Overlay Toggle (7-day moving average)
    ========================================================== */

    function getTrendOverlayState() {
        const cb = document.getElementById("movingAverageToggle");
        return !!(cb && cb.checked);
    }

    function wireTrendOverlayToggle(onChange) {
        const cb = document.getElementById("movingAverageToggle");
        if (!cb) return;
        cb.addEventListener("change", () => onChange(cb.checked));
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

    /* ==========================================================
       Sidebar Navigation
       Sections are grouped into <div class="dashboardView"
       data-view="...">; a click on a nav link shows only the
       divs whose data-view matches (a view can have more than
       one div, since related sections aren't always contiguous
       in the markup — e.g. Key Insights sits between two
       Traffic sections but belongs to Overview).
    ========================================================== */

    function wireSidebarNav(onSwitch) {
        const links = document.querySelectorAll(".sidebarMenu a[data-view]");
        const views = document.querySelectorAll(".dashboardView");
        if (!links.length || !views.length) return;

        const HEADER_TEXT = {
            overview: ["Dashboard Overview", "Marketing performance at a glance"],
            traffic: ["Traffic", "Where sessions are coming from"],
            sales: ["Sales", "Revenue, orders, and repeat purchase performance"],
            notes: ["Notes", "Remarks and discussion history"],
            settings: ["Settings", "Dashboard preferences"]
        };
        const titleEl = document.getElementById("pageTitle");
        const subtitleEl = document.getElementById("pageSubtitle");

        links.forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const target = link.dataset.view;

                links.forEach((l) => l.classList.toggle("active", l === link));
                views.forEach((v) => v.classList.toggle("viewHidden", v.dataset.view !== target));

                const text = HEADER_TEXT[target];
                if (text) {
                    if (titleEl) titleEl.textContent = text[0];
                    if (subtitleEl) subtitleEl.textContent = text[1];
                }

                // Charts inside the newly-shown view were sized while
                // hidden and need a beat for layout to settle before
                // they can correctly measure their container.
                if (onSwitch) requestAnimationFrame(() => requestAnimationFrame(onSwitch));
            });
        });
    }

    THD.ui = {
        renderLastUpdate,
        renderKpis,
        renderInsights,
        renderRangeCompare,
        renderTrafficPeriodLabels,
        renderLandingPages,
        renderTrafficComparison,
        wireTrafficComparisonFilter,
        getTrafficGroupBy,
        wireTrafficGroupToggle,
        renderSourceTable,
        renderSourceFilterStatus,
        wireClearSourceFilter,
        wireSourceTableToggle,
        renderMonthlyTable,
        renderNewRepeatTable,
        getNewRepeatMetric,
        wireNewRepeatMetricToggle,
        getCheckedMetrics,
        wireMetricToggles,
        getTrendOverlayState,
        wireTrendOverlayToggle,
        wireRefreshButton,
        wireSidebarNav,
        wireThemeToggle,
        wireNotes
    };

})(window.THD);
