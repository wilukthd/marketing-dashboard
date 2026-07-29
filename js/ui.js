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
       Data Source Warning
       Shown whenever one or more live feeds failed to load and
       the dashboard fell back to generated demo data for that
       section — so nobody mistakes those numbers for real ones.
    ========================================================== */

    function renderDataSourceWarning(status) {
        const el = document.getElementById("dataSourceWarning");
        const textEl = document.getElementById("dataSourceWarningText");
        if (!el || !textEl || !status) return;

        const keys = [];
        if (!status.daily) keys.push("dataWarning.daily");
        if (!status.sources) keys.push("dataWarning.sources");
        if (!status.landingPages) keys.push("dataWarning.landingPages");
        if (!status.newRepeat) keys.push("dataWarning.newRepeat");

        if (!keys.length) {
            el.style.display = "none";
            return;
        }

        const separator = window.I18N.getLang() === "ja" ? "、" : ", ";
        const list = keys.map((k) => window.I18N.t(k)).join(separator);
        textEl.textContent = window.I18N.t("dataWarning.prefix", { list });
        el.style.display = "flex";
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
        if (curEl) curEl.textContent = `${fmtISODate(range.start)} – ${fmtISODate(range.end)}`;
        if (prevEl) prevEl.textContent = `${fmtISODate(range.prevStart)} – ${fmtISODate(range.prevEnd)}`;
    }

    /* ==========================================================
       Last Update
    ========================================================== */

    function renderLastUpdate() {
        const el = document.getElementById("lastUpdate");
        if (!el) return;
        el.textContent = window.I18N.formatDateTime(new Date());
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
       Fixed 30-day window (doesn't follow the date-range picker —
       see aggregateLandingPages in data.js for why), with a PC /
       Smartphone / All device filter.
    ========================================================== */

    let allLandingPages = [];
    let landingPagesExpanded = false;
    const COLLAPSED_LANDING_COUNT = 10;

    function landingItemHtml(p) {
        const label = p.pageTitle || window.I18N.t("landing.notSet");
        let trendHtml = "";
        if (p.trend !== null && p.trend !== undefined) {
            const cls = p.trend >= 0 ? "positive" : "negative";
            trendHtml = ` · <span class="deltaBadge ${cls}">${fmtDelta(p.trend)}</span>`;
        }
        const stats = `<small>${fmtNumber(p.sessions)} ${window.I18N.t("landing.sessionsUnit")}${trendHtml}</small>`;
        return `
            <div class="landingItem">
                <div class="landingItemTop">
                    <span>${label}</span>
                    ${stats}
                </div>
            </div>
        `;
    }

    // Revenue/CVR intentionally aren't shown per page: GA4 attributes
    // a purchase to whichever page started the session, and a
    // session-boundary reset mid-checkout can land that "start" on
    // the order-confirmation page itself — so revenue/CVR broken out
    // by landing page isn't reliably attributable to the page that
    // actually earned it. Sessions (and the trend badge derived from
    // them) aren't affected by that same issue, so that's what stays.
    function renderLandingPages(pages) {
        allLandingPages = pages || [];
        const container = document.getElementById("landingPages");
        if (!container) return;

        if (!allLandingPages.length) {
            container.innerHTML = `<p class="emptyRow">${window.I18N.t("landing.empty")}</p>`;
            const btn = document.getElementById("toggleLandingPagesBtn");
            if (btn) btn.style.display = "none";
            return;
        }

        const visible = landingPagesExpanded ? allLandingPages : allLandingPages.slice(0, COLLAPSED_LANDING_COUNT);
        container.innerHTML = visible.map(landingItemHtml).join("");

        const btn = document.getElementById("toggleLandingPagesBtn");
        if (btn) {
            btn.style.display = allLandingPages.length > COLLAPSED_LANDING_COUNT ? "" : "none";
            btn.textContent = landingPagesExpanded
                ? window.I18N.t("source.showLess")
                : window.I18N.t("source.showAllCount", { n: allLandingPages.length });
        }
    }

    function wireLandingPagesToggle() {
        const btn = document.getElementById("toggleLandingPagesBtn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            landingPagesExpanded = !landingPagesExpanded;
            renderLandingPages(allLandingPages);
        });
    }

    function renderLandingPageInsights(insights) {
        const card = document.getElementById("landingInsightsCard");
        const container = document.getElementById("landingPageInsights");
        if (!container || !card) return;
        if (!insights || !insights.length) {
            container.innerHTML = "";
            card.style.display = "none";
            return;
        }
        card.style.display = "";
        container.innerHTML = insights.map((s) => `<li>${s}</li>`).join("");
    }

    function getHideSystemPages() {
        const toggle = document.getElementById("landingHideSystemToggle");
        return toggle ? toggle.checked : true;
    }

    function wireHideSystemToggle(onChange) {
        const toggle = document.getElementById("landingHideSystemToggle");
        if (!toggle) return;
        toggle.addEventListener("change", () => onChange(toggle.checked));
    }

    function renderLandingPagesPeriodLabel(startStr, endStr) {
        const el = document.getElementById("landingPagesPeriod");
        if (!el) return;
        el.textContent = startStr && endStr ? window.I18N.t("landing.fixedWindow", { start: startStr, end: endStr }) : "";
    }

    function getLandingDevice() {
        const select = document.getElementById("landingDeviceSelect");
        return select ? select.value : "all";
    }

    function wireLandingDeviceToggle(onChange) {
        const select = document.getElementById("landingDeviceSelect");
        if (!select) return;
        select.addEventListener("change", () => onChange(select.value));
    }

    /* ==========================================================
       Key Insights
    ========================================================== */

    function renderInsights(insights) {
        const container = document.querySelector(".insightCard ul");
        if (!container) return;

        if (!insights || !insights.length) {
            container.innerHTML = `<li>${window.I18N.t("insights.empty")}</li>`;
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
       Synced across devices/teammates via Firestore (see
       js/notes.js) — this section only handles rendering and
       wiring the composer; THD.notes owns the actual data.

       Deleting a note is a genuinely riskier action here than in a
       normal single-user app, since the Firestore rules are open —
       anyone with the dashboard link could delete anyone else's
       note. So the main list only ever "archives" (reversible, no
       confirmation needed since nothing is destroyed); permanent
       deletion only exists inside the archived view, and does get
       a confirmation there.
    ========================================================== */

    const NOTE_CATEGORY_KEYS = {
        general: "notes.catGeneral",
        traffic: "notes.catTraffic",
        sales: "notes.catSales",
        product: "notes.catProduct",
        bug: "notes.catBug",
        idea: "notes.catIdea"
    };

    function noteCategoryLabel(category) {
        return window.I18N.t(NOTE_CATEGORY_KEYS[category] || "notes.catGeneral");
    }

    let currentNotes = []; // cached from the last Firestore snapshot, so a language change can re-render without re-subscribing
    let notesArchivedView = false; // false = showing active notes, true = showing the archived list

    function noteItemHtml(n, archivedView) {
        const actionBtn = archivedView
            ? `
                <button class="noteRestoreBtn" data-id="${n.id}" title="${window.I18N.t("notes.restoreTitle")}">
                    <i data-lucide="rotate-ccw"></i>
                </button>
                <button class="noteDeleteForeverBtn" data-id="${n.id}" title="${window.I18N.t("notes.deleteForeverTitle")}">
                    <i data-lucide="trash-2"></i>
                </button>
            `
            : `
                <button class="noteArchiveBtn" data-id="${n.id}" title="${window.I18N.t("notes.archiveTitle")}">
                    <i data-lucide="archive"></i>
                </button>
            `;

        return `
            <div class="noteItem" data-id="${n.id}">
                <div class="noteItemBody">
                    <div class="noteItemMeta">
                        <span class="noteCategoryBadge cat-${n.category}">${noteCategoryLabel(n.category)}</span>
                        <span class="noteItemAuthor"></span>
                        <span class="noteItemDate">${window.I18N.formatDateTimeFull(n.createdAt)}</span>
                    </div>
                    <div class="noteItemText"></div>
                </div>
                <div class="noteItemActions">
                    ${actionBtn}
                </div>
            </div>
        `;
    }

    function renderNotesList(notes) {
        currentNotes = notes || [];
        const container = document.getElementById("notesList");
        const historyTitle = document.getElementById("notesHistoryTitle");
        const archiveBtn = document.getElementById("notesArchiveToggleBtn");
        if (!container) return;

        const active = currentNotes.filter((n) => !n.archived);
        const archived = currentNotes.filter((n) => n.archived);
        const visible = notesArchivedView ? archived : active;

        if (historyTitle) {
            historyTitle.textContent = window.I18N.t(notesArchivedView ? "notes.archivedTitle" : "notes.history");
        }
        if (archiveBtn) {
            archiveBtn.textContent = notesArchivedView
                ? window.I18N.t("notes.backToNotes")
                : window.I18N.t("notes.showArchivedCount", { n: archived.length });
            archiveBtn.style.display = (!notesArchivedView && archived.length === 0) ? "none" : "";
        }

        if (!visible.length) {
            const key = !window.THD.notes || !window.THD.notes.isConfigured()
                ? "notes.notConfigured"
                : (notesArchivedView ? "notes.archivedEmpty" : "notes.empty");
            container.innerHTML = `<p class="notesEmpty">${window.I18N.t(key)}</p>`;
            return;
        }

        container.innerHTML = visible.map((n) => noteItemHtml(n, notesArchivedView)).join("");

        // Text and author set via textContent (not template
        // interpolation) so free-typed note/author text containing
        // HTML-looking characters can't inject markup.
        container.querySelectorAll(".noteItem").forEach((el) => {
            const id = el.dataset.id;
            const note = visible.find((n) => String(n.id) === id);
            if (!note) return;
            const textEl = el.querySelector(".noteItemText");
            const authorEl = el.querySelector(".noteItemAuthor");
            if (textEl) textEl.textContent = note.text;
            if (authorEl) authorEl.textContent = note.author || window.I18N.t("notes.anonymous");
        });

        if (window.lucide) lucide.createIcons();
    }

    function refreshNotesList() {
        renderNotesList(currentNotes);
    }

    function wireNotes() {
        const input = document.getElementById("noteInput");
        const addBtn = document.getElementById("addNoteBtn");
        const list = document.getElementById("notesList");
        const authorInput = document.getElementById("noteAuthorInput");
        const categorySelect = document.getElementById("noteCategorySelect");
        const archiveToggleBtn = document.getElementById("notesArchiveToggleBtn");
        if (!input || !addBtn || !list) return;

        if (authorInput && window.THD.notes) {
            authorInput.value = window.THD.notes.getAuthorName();
            authorInput.addEventListener("change", () => {
                window.THD.notes.setAuthorName(authorInput.value.trim());
            });
        }

        if (window.THD.notes) {
            window.THD.notes.subscribe(renderNotesList);
        }

        addBtn.addEventListener("click", () => {
            const text = input.value.trim();
            if (!text || !window.THD.notes) return;
            const author = authorInput ? authorInput.value.trim() : "";
            const category = categorySelect ? categorySelect.value : "general";
            if (authorInput) window.THD.notes.setAuthorName(author);
            window.THD.notes.add({ text, author, category }).catch((e) => {
                console.warn("[THD.ui] Failed to add note:", e.message);
            });
            input.value = "";
        });

        if (archiveToggleBtn) {
            archiveToggleBtn.addEventListener("click", () => {
                notesArchivedView = !notesArchivedView;
                renderNotesList(currentNotes);
            });
        }

        list.addEventListener("click", (e) => {
            if (!window.THD.notes) return;

            const archiveBtn = e.target.closest(".noteArchiveBtn");
            if (archiveBtn) {
                // Reversible — no confirmation needed, nothing is destroyed.
                window.THD.notes.archive(archiveBtn.dataset.id).catch((err) => {
                    console.warn("[THD.ui] Failed to archive note:", err.message);
                });
                return;
            }

            const restoreBtn = e.target.closest(".noteRestoreBtn");
            if (restoreBtn) {
                window.THD.notes.restore(restoreBtn.dataset.id).catch((err) => {
                    console.warn("[THD.ui] Failed to restore note:", err.message);
                });
                return;
            }

            const deleteForeverBtn = e.target.closest(".noteDeleteForeverBtn");
            if (deleteForeverBtn) {
                // The one genuinely destructive action left — confirm.
                if (!window.confirm(window.I18N.t("notes.deleteForeverConfirm"))) return;
                window.THD.notes.removeForever(deleteForeverBtn.dataset.id).catch((err) => {
                    console.warn("[THD.ui] Failed to permanently delete note:", err.message);
                });
            }
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
        const displayLabel = window.I18N.channelLabel(row.label);

        let deltaHtml = "—";
        if (prevSessions > 0) {
            const delta = ((curSessions - prevSessions) / prevSessions) * 100;
            deltaHtml = `<span class="deltaBadge ${delta >= 0 ? "positive" : "negative"}">${fmtDelta(delta)}</span>`;
        } else if (curSessions > 0) {
            deltaHtml = `<span class="deltaBadge positive">${window.I18N.t("traffic.new")}</span>`;
        }

        return `
            <tr class="tcRow${isActive ? " active" : ""}" data-label="${row.label}" title="${window.I18N.t("traffic.clickHint", { label: displayLabel })}">
                <td class="tcSource">
                    <span class="tcSourceInner">
                        <span class="legendColor" style="background:${color}"></span>
                        ${displayLabel}
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
            tbody.innerHTML = `<tr><td colspan="6" class="emptyRow">${window.I18N.t("traffic.empty")}</td></tr>`;
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
       All Sources Filter (Overview/Sales-wide channel scope)
       Populated from whatever channels actually appear in the
       data, rather than a hardcoded list — options and their
       translated labels are rebuilt on load and again on a
       language change.
    ========================================================== */

    function populateSourceFilterOptions(channels) {
        const select = document.getElementById("sourceFilterSelect");
        if (!select) return;
        const current = select.value;
        const optionsHtml = (channels || [])
            .map((c) => `<option value="${c}">${window.I18N.channelLabel(c)}</option>`)
            .join("");
        select.innerHTML = `<option value="all" data-i18n="filter.allSources">${window.I18N.t("filter.allSources")}</option>${optionsHtml}`;
        if (channels && channels.includes(current)) select.value = current;
    }

    function getSourceFilterChannel() {
        const select = document.getElementById("sourceFilterSelect");
        return select ? select.value : "all";
    }

    function wireSourceFilterToggle(onChange) {
        const select = document.getElementById("sourceFilterSelect");
        if (!select) return;
        select.addEventListener("change", () => onChange(select.value));
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
            tbody.innerHTML = `<tr><td colspan="6" class="emptyRow">${window.I18N.t("source.emptyFilter")}</td></tr>`;
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
                ? window.I18N.t("source.showLess")
                : window.I18N.t("source.showAllCount", { n: allSourceRows.length });
        }
    }

    // Small "Filtered by: <label> [Clear]" indicator shown above the
    // Session Source table once a Traffic Comparison row is clicked.
    function renderSourceFilterStatus(label) {
        const status = document.getElementById("sourceFilterStatus");
        const labelEl = document.getElementById("sourceFilterLabel");
        if (!status || !labelEl) return;
        if (label) {
            labelEl.textContent = window.I18N.channelLabel(label);
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
       New / Repeat Insights
    ========================================================== */

    function renderNewRepeatInsights(insights) {
        const container = document.getElementById("newRepeatInsights");
        if (!container) return;

        if (!insights || !insights.length) {
            container.innerHTML = `<li>Not enough history yet for a pattern here.</li>`;
            return;
        }

        container.innerHTML = insights.map((text) => `<li>${text}</li>`).join("");
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

    const HEADER_KEYS = {
        overview: ["header.overview.title", "header.overview.subtitle"],
        traffic: ["header.traffic.title", "header.traffic.subtitle"],
        sales: ["header.sales.title", "header.sales.subtitle"],
        notes: ["header.notes.title", "header.notes.subtitle"],
        settings: ["header.settings.title", "header.settings.subtitle"]
    };

    function applyHeaderText(target) {
        const keys = HEADER_KEYS[target];
        if (!keys) return;
        const titleEl = document.getElementById("pageTitle");
        const subtitleEl = document.getElementById("pageSubtitle");
        if (titleEl) titleEl.textContent = window.I18N.t(keys[0]);
        if (subtitleEl) subtitleEl.textContent = window.I18N.t(keys[1]);
    }

    // Re-applies the header text for whichever tab is currently active —
    // used after a language change, since that isn't a nav click.
    function refreshActiveHeader() {
        const active = document.querySelector(".sidebarMenu a[data-view].active");
        if (active) applyHeaderText(active.dataset.view);
    }

    function wireSidebarNav(onSwitch) {
        const links = document.querySelectorAll(".sidebarMenu a[data-view]");
        const views = document.querySelectorAll(".dashboardView");
        if (!links.length || !views.length) return;

        links.forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const target = link.dataset.view;

                links.forEach((l) => l.classList.toggle("active", l === link));
                views.forEach((v) => v.classList.toggle("viewHidden", v.dataset.view !== target));

                applyHeaderText(target);

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
        renderDataSourceWarning,
        renderTrafficPeriodLabels,
        renderLandingPages,
        wireLandingPagesToggle,
        renderLandingPageInsights,
        getHideSystemPages,
        wireHideSystemToggle,
        renderLandingPagesPeriodLabel,
        getLandingDevice,
        wireLandingDeviceToggle,
        renderTrafficComparison,
        wireTrafficComparisonFilter,
        populateSourceFilterOptions,
        getSourceFilterChannel,
        wireSourceFilterToggle,
        getTrafficGroupBy,
        wireTrafficGroupToggle,
        renderSourceTable,
        renderSourceFilterStatus,
        wireClearSourceFilter,
        wireSourceTableToggle,
        renderMonthlyTable,
        renderNewRepeatTable,
        renderNewRepeatInsights,
        getNewRepeatMetric,
        wireNewRepeatMetricToggle,
        getCheckedMetrics,
        wireMetricToggles,
        getTrendOverlayState,
        wireTrendOverlayToggle,
        wireRefreshButton,
        wireSidebarNav,
        refreshActiveHeader,
        wireThemeToggle,
        wireNotes,
        refreshNotesList
    };

})(window.THD);
