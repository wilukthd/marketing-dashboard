/* ==========================================================
   THD Analytics
   UI Rendering & Interactions
   Version 1.0
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
    const fmtDelta = (n) => (n === null || n === undefined)
        ? window.I18N.t("traffic.new")
        : (n > 0 ? "▲ " : n < 0 ? "▼ " : "– ") + Math.abs(n).toFixed(1) + "%";
    const fmtPts = (n) => (n > 0 ? "▲ " : n < 0 ? "▼ " : "– ") + Math.abs(n).toFixed(2) + "pt";
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

    // hasCompareData: pass false when the resolved comparison window
    // has no underlying data at all (most likely with "Compare Same
    // Period Last Year" reaching further back than the data goes) —
    // shows a warning in place of the comparison dates instead of
    // silently implying "no change" from an all-zero previous period.
    function renderRangeCompare(range, hasCompareData = true) {
        const el = document.getElementById("rangeCompareBar");
        if (!el || !range) return;

        const lookingAt = `${window.I18N.t("rangeCompare.lookingAt")} <strong>${fmtISODate(range.start)} – ${fmtISODate(range.end)}</strong>`;

        if (!hasCompareData) {
            el.innerHTML = `
                <i data-lucide="calendar-range"></i>
                ${lookingAt}
                <span class="rangeVs rangeVsWarning">
                    <i data-lucide="alert-triangle"></i>
                    ${window.I18N.t("rangeCompare.noCompareData", { start: fmtISODate(range.prevStart), end: fmtISODate(range.prevEnd) })}
                </span>
            `;
        } else {
            const compareLabelKey = range.isYoy ? "rangeCompare.vsYoy" : "rangeCompare.vsPrevious";
            el.innerHTML = `
                <i data-lucide="calendar-range"></i>
                ${lookingAt}
                <span class="rangeVs">${window.I18N.t(compareLabelKey)}</span>
                <strong>${fmtISODate(range.prevStart)} – ${fmtISODate(range.prevEnd)}</strong>
            `;
        }
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
        // Ads/transactions only matter once their tab exists — until then
        // nothing on screen uses them, so a warning would just be noise.
        if (THD.ui.renderAdsKpis && !status.adSpend) keys.push("dataWarning.adSpend");
        if (THD.ui.renderTransactionsTable && !status.transactions) keys.push("dataWarning.transactions");

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
       Number Count-Up
       Animates a KPI's displayed value from its previous number
       to the new one instead of snapping straight to it. Skipped
       under prefers-reduced-motion (matched once, at module
       load — a user who changes the OS setting mid-session will
       pick it up on next page load, same as the browser's own
       reduced-motion-dependent UI generally behaves).
    ========================================================== */

    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const kpiPreviousValues = {}; // kpi key -> last raw numeric value shown, so re-renders animate FROM there rather than from 0

    function animateNumber(el, from, to, formatFn, duration) {
        if (prefersReducedMotion || from === to || !window.requestAnimationFrame) {
            el.textContent = formatFn(to);
            return;
        }
        const start = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
        function tick(now) {
            const progress = Math.min(1, (now - start) / duration);
            const current = from + (to - from) * ease(progress);
            el.textContent = formatFn(current);
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
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

    function renderKpis(kpi, hasCompareData = true) {
        Object.entries(kpi).forEach(([key, data]) => {
            const card = document.querySelector(`[data-kpi="${key}"]`);
            const format = KPI_FORMATS[key];
            if (!card || !format) return;

            card.classList.remove("isSkeleton");

            const valueEl = card.querySelector('[data-field="value"]');
            const deltaEl = card.querySelector('[data-field="delta"]');
            const dailyEl = card.querySelector('[data-field="daily"]');

            if (valueEl) {
                const isFirstRender = kpiPreviousValues[key] === undefined;
                const from = isFirstRender ? 0 : kpiPreviousValues[key];
                animateNumber(valueEl, from, data.value, format.value, 700);
                kpiPreviousValues[key] = data.value;

                if (!isFirstRender && !prefersReducedMotion) {
                    card.classList.remove("kpiFlash");
                    // Force reflow so the animation restarts even if
                    // the class never left (two updates in quick
                    // succession, e.g. rapid range changes).
                    void card.offsetWidth;
                    card.classList.add("kpiFlash");
                }
            }

            if (deltaEl) {
                deltaEl.classList.remove("positive", "negative", "neutral");
                if (hasCompareData && data.delta !== null) {
                    // CVR reads in points (6.07% -> 6.79% = +0.72pt).
                    const usePts = key === "cvr" && data.deltaPts !== null && data.deltaPts !== undefined;
                    deltaEl.textContent = usePts ? fmtPts(data.deltaPts) : fmtDelta(data.delta);
                    deltaEl.classList.add(data.delta >= 0 ? "positive" : "negative");
                } else {
                    // Comparison window has no underlying data at all
                    // (see hasDataInRange in data.js) — showing "0.0%"
                    // here would read as "no change" rather than "no
                    // data to compare against".
                    deltaEl.textContent = window.I18N.t("kpi.noCompareData");
                    deltaEl.classList.add("neutral");
                }
            }

            if (dailyEl) dailyEl.textContent = format.daily(data.daily);
        });
    }

    /* ==========================================================
       Skeleton Loading
       Shown from init() (see app.js) the moment the page paints,
       before the first live-data fetch resolves — cleared
       automatically as each section's real render function
       overwrites the same containers. Table skeletons infer
       their column count from the table's own <thead>, so they
       stay correct if a column is ever added or removed.
    ========================================================== */

    function showKpiSkeletons() {
        document.querySelectorAll(".kpiCard").forEach((card) => card.classList.add("isSkeleton"));
    }

    function skeletonTableRows(cols, rows) {
        const cell = `<td><span class="skeletonBlock" style="width:${60 + Math.random() * 30}%"></span></td>`;
        const row = `<tr class="skeletonRow">${cell.repeat(cols)}</tr>`;
        return row.repeat(rows);
    }

    function showTableSkeleton(tbodyId, rows) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const table = tbody.closest("table");
        const cols = table ? table.querySelectorAll("thead th").length : 4;
        tbody.innerHTML = skeletonTableRows(cols, rows || 5);
    }

    function showListSkeleton(selector, rows) {
        const container = typeof selector === "string" ? document.querySelector(selector) : selector;
        if (!container) return;
        const width = () => `${55 + Math.random() * 35}%`;
        container.innerHTML = Array.from({ length: rows || 3 })
            .map(() => `<li class="skeletonRow"><span class="skeletonBlock" style="width:${width()}"></span></li>`)
            .join("");
    }

    // Called once, right at init — see THD.ui.showInitialSkeletons in app.js.
    function showInitialSkeletons() {
        showKpiSkeletons();
        showTableSkeleton("sourceTable", 6);
        showTableSkeleton("monthlyTable", 6);
        showTableSkeleton("newRepeatTable", 6);
        showTableSkeleton("trafficCompareTable", 5);
        showListSkeleton(".insightCard ul", 3);
        showListSkeleton("#newRepeatInsights", 2);
    }

    /* ==========================================================
       Landing Pages
       Fixed 30-day window (doesn't follow the date-range picker —
       see aggregateLandingPages in data.js for why), with a PC /
       Smartphone / All device filter.
    ========================================================== */

    let allLandingPages = [];
    let landingPagesExpanded = false;
    let visibleLandingPages = []; // the slice actually rendered right now, indexed to match data-page-index
    const COLLAPSED_LANDING_COUNT = 10;

    function landingItemHtml(p, index) {
        const label = p.pageTitle || window.I18N.t("landing.notSet");
        let trendHtml = "";
        if (p.trend !== null && p.trend !== undefined) {
            const cls = p.trend >= 0 ? "positive" : "negative";
            trendHtml = ` · <span class="deltaBadge ${cls}">${fmtDelta(p.trend)}</span>`;
        }
        const stats = `<small>${fmtNumber(p.sessions)} ${window.I18N.t("landing.sessionsUnit")}${trendHtml}</small>`;
        return `
            <div class="landingItem" data-page-index="${index}" role="button" tabindex="0">
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
            visibleLandingPages = [];
            container.innerHTML = `<p class="emptyRow">${window.I18N.t("landing.empty")}</p>`;
            const btn = document.getElementById("toggleLandingPagesBtn");
            if (btn) btn.style.display = "none";
            return;
        }

        visibleLandingPages = landingPagesExpanded ? allLandingPages : allLandingPages.slice(0, COLLAPSED_LANDING_COUNT);
        container.innerHTML = visibleLandingPages.map(landingItemHtml).join("");

        const btn = document.getElementById("toggleLandingPagesBtn");
        if (btn) {
            btn.style.display = allLandingPages.length > COLLAPSED_LANDING_COUNT ? "" : "none";
            btn.textContent = landingPagesExpanded
                ? window.I18N.t("source.showLess")
                : window.I18N.t("source.showAllCount", { n: allLandingPages.length });
        }
    }

    // Delegated (not per-row) so it survives renderLandingPages()
    // re-rendering the container's innerHTML on every device/toggle
    // change — wire this once, not after every render.
    function wireLandingPageItemClick(onClick) {
        const container = document.getElementById("landingPages");
        if (!container || !onClick) return;
        container.addEventListener("click", (e) => {
            const item = e.target.closest(".landingItem[data-page-index]");
            if (!item || !container.contains(item)) return;
            const page = visibleLandingPages[Number(item.dataset.pageIndex)];
            if (page) onClick(page);
        });
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

    /* ==========================================================
       Rising Landing Page Panel
       Shown on the Landing Pages tab after clicking the Overview
       "rising page" insight (see buildRisingLandingPageInsight in
       data.js) — a dismissible highlight box with the page's own
       daily-sessions mini chart, so "click to see when it
       happened" leads somewhere concrete instead of just a fact.
    ========================================================== */

    /* ==========================================================
       Rising / Detail Landing Page Panel
       Shown on the Landing Pages tab in two ways: (1) after
       clicking the Overview "rising page" insight (see
       buildRisingLandingPageInsight in data.js) — pass
       { generic: false } (the default), or (2) after clicking any
       row in the Top Landing Pages list (see buildLandingPageDetail)
       — pass { generic: true }, which swaps the "Rising Page
       Detected" framing for a neutral "Page Detail" label and
       handles a changePct of null (no prior-week data) gracefully.
       Same dismissible highlight box + daily-sessions mini chart
       either way.
    ========================================================== */

    function renderLandingRisingPanel(insight, opts) {
        const panel = document.getElementById("landingRisingPanel");
        if (!panel || !insight) return;
        const generic = !!(opts && opts.generic);

        const iconEl = document.getElementById("landingRisingPanelIcon");
        const labelEl = document.getElementById("landingRisingPanelLabel");
        const titleEl = document.getElementById("landingRisingPanelTitle");
        const summaryEl = document.getElementById("landingRisingPanelSummary");
        const spikeEl = document.getElementById("landingRisingPanelSpike");

        if (iconEl) iconEl.textContent = insight.spikeSummary ? "⚡" : (generic ? "📊" : "📈");
        if (labelEl) labelEl.textContent = window.I18N.t(insight.spikeSummary ? "landing.spikePanelTitle" : (generic ? "landing.pageDetailTitle" : "landing.risingPanelTitle"));
        if (titleEl) titleEl.textContent = insight.pageTitle;

        if (summaryEl) {
            if (insight.spikeSummary) {
                // A single-day spike vs. this page's own typical day —
                // deliberately not framed as "this week vs last week"
                // like the branches below, since that comparison isn't
                // what triggered this insight (see
                // buildTodayYesterdaySpikeInsights in data.js).
                const changePct = insight.baseline ? ((insight.current - insight.baseline) / insight.baseline) * 100 : 0;
                const figure = `<span class="insightNum pos">+${Math.round(changePct)}%</span>`;
                summaryEl.innerHTML = window.I18N.t("landing.spikePanelSummary", {
                    current: Math.round(insight.current).toLocaleString("en-US"),
                    baseline: Math.round(insight.baseline).toLocaleString("en-US"),
                    date: insight.spikeDate,
                    figure
                });
            } else if (insight.changePct === null || insight.changePct === undefined) {
                summaryEl.innerHTML = window.I18N.t("landing.risingPanelWeekNew", {
                    current: Math.round(insight.current).toLocaleString("en-US")
                });
            } else {
                const cls = insight.changePct >= 0 ? "pos" : "neg";
                const sign = insight.changePct >= 0 ? "+" : "";
                const figure = `<span class="insightNum ${cls}">${sign}${Math.round(insight.changePct)}%</span>`;
                summaryEl.innerHTML = window.I18N.t("landing.risingPanelWeek", {
                    current: Math.round(insight.current).toLocaleString("en-US"),
                    previous: Math.round(insight.previous).toLocaleString("en-US"),
                    figure
                });
            }
        }

        if (spikeEl) {
            spikeEl.textContent = insight.spikeDate
                ? window.I18N.t("landing.risingPanelSpike", {
                    date: insight.spikeDate,
                    value: Math.round(insight.spikeValue).toLocaleString("en-US"),
                    mean: Math.round(insight.mean).toLocaleString("en-US")
                })
                : "";
        }

        panel.style.display = "";
    }

    function hideLandingRisingPanel() {
        const panel = document.getElementById("landingRisingPanel");
        if (panel) panel.style.display = "none";
    }

    /* ==========================================================
       Source Breakdown (inside the landing-page detail panel)
    ========================================================== */

    // Called whenever the panel opens on a fresh page/insight, before
    // any bar has been clicked yet — clears any breakdown left over
    // from a previously-viewed page and shows the "click a bar" hint.
    function resetSourceBreakdown() {
        const listEl = document.getElementById("sourceBreakdownList");
        const dateEl = document.getElementById("sourceBreakdownDate");
        const hintEl = document.getElementById("sourceBreakdownHint");
        if (listEl) listEl.innerHTML = "";
        if (dateEl) dateEl.textContent = "";
        if (hintEl) {
            hintEl.textContent = window.I18N.t("landing.sourceBreakdownHint");
            hintEl.style.display = "";
        }
    }

    // result is THD.data.buildDayPageSourceBreakdown's return value —
    // null when that exact day/page has no matching rows.
    function renderSourceBreakdown(result, dateLabel) {
        const listEl = document.getElementById("sourceBreakdownList");
        const dateEl = document.getElementById("sourceBreakdownDate");
        const hintEl = document.getElementById("sourceBreakdownHint");
        if (!listEl) return;

        if (dateEl) dateEl.textContent = dateLabel || "";

        if (!result || !result.breakdown || !result.breakdown.length) {
            listEl.innerHTML = "";
            if (hintEl) {
                hintEl.textContent = window.I18N.t("landing.sourceBreakdownEmpty");
                hintEl.style.display = "";
            }
            return;
        }

        if (hintEl) hintEl.style.display = "none";

        listEl.innerHTML = result.breakdown.map((row) => `
            <div class="sourceBreakdownRowWrap" data-label="${row.label}">
                <div class="sourceBreakdownRow">
                    <span class="sourceBreakdownLabel" title="${row.label}">${row.label}</span>
                    <div class="sourceBreakdownBarTrack"><div class="sourceBreakdownBarFill" style="width:${Math.max(row.pct, 3)}%"></div></div>
                    <span class="sourceBreakdownValue">${Math.round(row.sessions).toLocaleString("en-US")} <small>(${Math.round(row.pct)}%)</small></span>
                    <span class="sourceBreakdownChevron">›</span>
                </div>
            </div>
        `).join("");
    }

    // Delegated once (see app.js init) rather than re-wired per render,
    // since #sourceBreakdownList's innerHTML is replaced wholesale
    // every time renderSourceBreakdown runs above. Handles collapsing
    // (accordion — only one group's raw-source detail open at a time,
    // and clicking an already-open group closes it) entirely locally;
    // onRowClick only fires when a closed group needs its detail
    // fetched and rendered.
    function wireSourceBreakdownRowClicks(onRowClick) {
        const listEl = document.getElementById("sourceBreakdownList");
        if (!listEl) return;
        listEl.addEventListener("click", (evt) => {
            const wrap = evt.target.closest(".sourceBreakdownRowWrap");
            if (!wrap) return;
            const label = wrap.dataset.label;
            const wasOpen = wrap.classList.contains("isExpanded");

            listEl.querySelectorAll(".sourceBreakdownRowWrap.isExpanded").forEach((w) => {
                w.classList.remove("isExpanded");
                const detailEl = w.querySelector(".sourceBreakdownDetailTable");
                if (detailEl) detailEl.remove();
            });

            if (!wasOpen && onRowClick) onRowClick(label);
        });
    }

    // detail is THD.data.buildDayPageSourceDetail's return value (an
    // array, or null/empty when that group genuinely has no rows —
    // shouldn't normally happen since the group came from the same
    // day's data, but the empty state is here defensively).
    function renderSourceBreakdownDetail(label, detail) {
        const listEl = document.getElementById("sourceBreakdownList");
        if (!listEl || !window.CSS || !CSS.escape) return;
        const wrap = listEl.querySelector(`.sourceBreakdownRowWrap[data-label="${CSS.escape(label)}"]`);
        if (!wrap) return;
        wrap.classList.add("isExpanded");

        if (!detail || !detail.length) {
            wrap.insertAdjacentHTML("beforeend", `<div class="sourceBreakdownDetailTable"><p class="sourceBreakdownDetailEmpty">${window.I18N.t("landing.sourceDetailEmpty")}</p></div>`);
            return;
        }

        const rowsHtml = detail.map((d) => `
            <tr>
                <td>${d.sourceMedium}</td>
                <td class="number">${Math.round(d.sessions).toLocaleString("en-US")}</td>
                <td class="number">${Math.round(d.purchases).toLocaleString("en-US")}</td>
                <td class="number">¥${Math.round(d.revenue).toLocaleString("en-US")}</td>
                <td class="number">${d.cvr.toFixed(1)}%</td>
            </tr>
        `).join("");

        wrap.insertAdjacentHTML("beforeend", `
            <div class="sourceBreakdownDetailTable">
                <table>
                    <thead>
                        <tr>
                            <th>${window.I18N.t("landing.sourceDetailSource")}</th>
                            <th class="number">${window.I18N.t("landing.sourceDetailSessions")}</th>
                            <th class="number">${window.I18N.t("landing.sourceDetailPurchases")}</th>
                            <th class="number">${window.I18N.t("landing.sourceDetailRevenue")}</th>
                            <th class="number">${window.I18N.t("landing.sourceDetailCvr")}</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `);
    }

    function wireLandingRisingPanelClose(onClose) {
        const btn = document.getElementById("landingRisingPanelCloseBtn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            hideLandingRisingPanel();
            if (onClose) onClose();
        });
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

    // opts: { channelAnomalies, onChannelAnomalyClick }
    // Key Insights is now KPI-focused only: the plain sentence-level
    // insights (buildInsights/buildAnomalyInsights) plus zero or more
    // Traffic Sources channel anomalies (see buildChannelAnomalyInsights)
    // — channel-level, not landing-page-specific, so it stays here.
    // Everything landing-page-related (the "rising landing page" callout
    // and today/yesterday page spikes) lives in its own section now —
    // see renderTopLandingPageInsights below — so a busy day with many
    // spiking pages doesn't crowd out the KPI-level story here.
    function renderInsights(insights, opts) {
        opts = opts || {};
        const { channelAnomalies, onChannelAnomalyClick } = opts;
        const container = document.getElementById("keyInsightsList");
        if (!container) return;

        const items = [];

        items.push(...(insights || []).map((text) => `<li>${text}</li>`));

        (channelAnomalies || []).forEach((a, i) => {
            items.push(`<li class="insightClickable" data-anomaly-idx="${i}">${a.sentence}</li>`);
        });

        if (!items.length) {
            container.innerHTML = `<li>${window.I18N.t("insights.empty")}</li>`;
            return;
        }

        container.innerHTML = items.join("");

        if (channelAnomalies && channelAnomalies.length && onChannelAnomalyClick) {
            container.querySelectorAll("[data-anomaly-idx]").forEach((el) => {
                const idx = Number(el.dataset.anomalyIdx);
                el.addEventListener("click", () => onChannelAnomalyClick(channelAnomalies[idx]));
            });
        }
    }

    // opts: { riseInsight, onRiseClick, pageSpikes, onPageSpikeClick }
    // Groups the two landing-page-anomaly signals into their own
    // Overview section, below Key Insights: pageSpikes (zero or more —
    // see buildTodayYesterdaySpikeInsights) and the single riseInsight
    // (see buildRisingLandingPageInsight's rolling-7-day callout).
    // Combined into one list and sorted by session count (`current`)
    // descending, so whichever page actually had the biggest influx
    // leads regardless of which detector caught it, rather than always
    // listing today's spikes, then yesterday's, then the riser, in
    // that fixed order irrespective of size. Both item types render as
    // clickable list items and jump to the same Landing Pages detail
    // panel. The whole card hides itself when there's nothing to show,
    // same pattern as the Landing Pages tab's own insights card
    // (renderLandingPageInsights) — no empty-state text needed here.
    function renderTopLandingPageInsights(opts) {
        opts = opts || {};
        const { riseInsight, onRiseClick, pageSpikes, onPageSpikeClick } = opts;
        const card = document.getElementById("topLandingPageInsightsCard");
        const container = document.getElementById("topLandingPageInsightsList");
        if (!card || !container) return;

        const combined = (pageSpikes || []).map((s) => ({ kind: "spike", data: s }));
        if (riseInsight) combined.push({ kind: "rise", data: riseInsight });

        combined.sort((a, b) => (b.data.current || 0) - (a.data.current || 0));

        if (!combined.length) {
            card.style.display = "none";
            container.innerHTML = "";
            return;
        }

        card.style.display = "";
        container.innerHTML = combined.map((item) => `<li class="insightClickable">${item.data.sentence}</li>`).join("");

        container.querySelectorAll("li.insightClickable").forEach((el, i) => {
            const item = combined[i];
            el.addEventListener("click", () => {
                if (item.kind === "spike" && onPageSpikeClick) onPageSpikeClick(item.data);
                if (item.kind === "rise" && onRiseClick) onRiseClick(item.data);
            });
        });
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
        const color = (cur && cur.color) || (prev && prev.color) || "#9498A6";
        const isActive = !!activeLabel && activeLabel === row.label;
        const displayLabel = window.I18N.channelLabel(row.label);

        // More unattributed traffic is a tracking problem, not growth —
        // flip its colors so a jump reads as the warning it is.
        const upIsBad = row.label === "(not set)";
        let deltaHtml = "—";
        if (prevSessions > 0) {
            const delta = ((curSessions - prevSessions) / prevSessions) * 100;
            const good = upIsBad ? delta <= 0 : delta >= 0;
            deltaHtml = `<span class="deltaBadge ${good ? "positive" : "negative"}">${fmtDelta(delta)}</span>`;
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
       Channel Trend View (doughnut click drill-down)
       Swaps the current/previous doughnut pair for one merged
       line chart scoped to whichever channel was clicked in the
       Traffic Comparison table.
    ========================================================== */

    function showChannelTrendMode(channelLabel) {
        const doughnuts = document.getElementById("trafficDoughnutRow");
        const trendWrap = document.getElementById("trafficChannelTrendWrap");
        const title = document.getElementById("trafficChannelTrendTitle");
        if (doughnuts) doughnuts.style.display = "none";
        if (trendWrap) trendWrap.style.display = "";
        if (title) title.textContent = window.I18N.channelLabel(channelLabel);
    }

    function hideChannelTrendMode() {
        const doughnuts = document.getElementById("trafficDoughnutRow");
        const trendWrap = document.getElementById("trafficChannelTrendWrap");
        if (doughnuts) doughnuts.style.display = "";
        if (trendWrap) trendWrap.style.display = "none";
    }

    function getChannelTrendMetric() {
        const select = document.getElementById("trafficChannelMetricSelect");
        return select ? select.value : "sessions";
    }

    function wireChannelTrendMetricToggle(onChange) {
        const select = document.getElementById("trafficChannelMetricSelect");
        if (!select) return;
        select.addEventListener("change", () => onChange(select.value));
    }

    function wireChannelTrendCloseButton(onClose) {
        const btn = document.getElementById("trafficChannelTrendCloseBtn");
        if (!btn) return;
        btn.addEventListener("click", onClose);
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
       New / Repeat Insights
    ========================================================== */

    function renderNewRepeatInsights(insights) {
        const container = document.getElementById("newRepeatInsights");
        if (!container) return;

        if (!insights || !insights.length) {
            container.innerHTML = `<li>${window.I18N.t("newRepeatInsights.empty")}</li>`;
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
       Generalized over a container id so the same checkbox-toggle
       pattern (colored dot + label, click to show/hide a series)
       works for both the main Overview trend chart (#metricToggles)
       and the AOV trend chart (#aovMetricToggles) — defaults to the
       original container so every existing call site is unaffected.
    ========================================================== */

    function getCheckedMetrics(containerId = "metricToggles") {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll(".metricToggle"))
            .filter((label) => label.querySelector("input").checked)
            .map((label) => label.dataset.metric);
    }

    function wireMetricToggles(onChange, containerId = "metricToggles") {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener("change", () => onChange(getCheckedMetrics(containerId)));
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
        // By id: the passcode gate's Unlock button is also a
        // .primaryButton and comes first in the DOM, so the old
        // querySelector(".primaryButton") wired THAT instead and the
        // header Refresh button never did anything.
        const btn = document.getElementById("refreshBtn");
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

    // Shared by both the sidebar nav click handler and switchToView
    // (the programmatic version used by the Overview "rising landing
    // page" insight click-through), so the two ways of changing tabs
    // can't drift out of sync with each other.
    function activateView(target, onSwitch) {
        const links = document.querySelectorAll(".sidebarMenu a[data-view]");
        const views = document.querySelectorAll(".dashboardView");
        if (!links.length || !views.length) return;

        links.forEach((l) => l.classList.toggle("active", l.dataset.view === target));
        views.forEach((v) => v.classList.toggle("viewHidden", v.dataset.view !== target));

        applyHeaderText(target);
        document.body.dataset.view = target;
        window.scrollTo({ top: 0 });

        // Charts inside the newly-shown view were sized while hidden
        // and need a beat for layout to settle before they can
        // correctly measure their container.
        if (onSwitch) requestAnimationFrame(() => requestAnimationFrame(onSwitch));
    }

    function wireSidebarNav(onSwitch) {
        const links = document.querySelectorAll(".sidebarMenu a[data-view]");
        if (!links.length) return;

        links.forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                activateView(link.dataset.view, onSwitch);
            });
        });
    }

    // Programmatic tab switch (no click event) — used when the
    // Overview "rising landing page" insight is clicked, to jump to
    // the Landing Pages tab and reveal its highlight panel.
    function switchToView(target, onSwitch) {
        activateView(target, onSwitch);
    }

    /* ==========================================================
       Goals / Monthly Targets
       Settings-page form (values persisted via THD.goals, shared
       across the team through Firestore) and the read-only
       progress bars each KPI card shows underneath its existing
       stats. Progress always compares "This Month" actuals
       against the saved target, independent of whatever date
       range is selected in the main filter — app.js is
       responsible for computing that fixed-window actual figure
       and passing it in here.
    ========================================================== */

    const GOAL_METRICS = ["users", "sessions", "purchases", "revenue", "cvr"];
    const GOAL_FORMATS = {
        users: fmtNumber,
        sessions: fmtNumber,
        purchases: fmtNumber,
        revenue: fmtYen,
        cvr: fmtPercent
    };

    function renderGoalsForm(targets) {
        targets = targets || {};
        GOAL_METRICS.forEach((metric) => {
            const input = document.getElementById(`goalInput-${metric}`);
            if (!input) return;
            const val = targets[metric];
            input.value = (val === null || val === undefined) ? "" : val;
        });
    }

    function readGoalsForm() {
        const targets = {};
        GOAL_METRICS.forEach((metric) => {
            const input = document.getElementById(`goalInput-${metric}`);
            const raw = input ? input.value.trim() : "";
            targets[metric] = raw === "" ? null : Number(raw);
        });
        return targets;
    }

    function wireGoalsForm(onSave) {
        const btn = document.getElementById("saveGoalsBtn");
        if (!btn) return;
        btn.addEventListener("click", () => onSave(readGoalsForm()));
    }

    function setGoalsStatus(text, isError) {
        const el = document.getElementById("goalsStatus");
        if (!el) return;
        el.textContent = text;
        el.classList.toggle("negative", !!isError);
    }

    // actuals: the kpi object from THD.data.filterDailyRange(...,"month",null)
    // (i.e. "This Month" totals, regardless of the active date-range
    // filter). targets: { users, sessions, purchases, revenue, cvr }
    // as saved via THD.goals — any key can be null/undefined ("no
    // target set"), in which case that card's bar stays hidden.
    function renderGoalProgress(actuals, targets) {
        targets = targets || {};
        GOAL_METRICS.forEach((metric) => {
            const wrap = document.querySelector(`[data-goal="${metric}"]`);
            if (!wrap) return;

            const target = targets[metric];
            const hasTarget = typeof target === "number" && target > 0;

            if (!hasTarget) {
                wrap.style.display = "none";
            } else {
                const actual = (actuals && actuals[metric]) ? actuals[metric].value : 0;
                const percent = target ? (actual / target) * 100 : 0;
                const fill = wrap.querySelector('[data-field="goalFill"]');
                const label = wrap.querySelector('[data-field="goalLabel"]');
                if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
                wrap.classList.toggle("over", percent >= 100);
                if (label) {
                    label.textContent = window.I18N.t("goal.progress", {
                        percent: Math.round(percent),
                        target: GOAL_FORMATS[metric](target)
                    });
                }
                wrap.style.display = "";
            }

            // The CVR card's second stat is already labeled "Goal" in
            // the HTML (see kpiCard.cvr) rather than "Avg / Day", since
            // averaging a percentage across days isn't meaningful —
            // it's meant to show the actual target figure directly.
            if (metric === "cvr") {
                const cvrCard = document.querySelector('[data-kpi="cvr"] [data-field="daily"]');
                if (cvrCard) cvrCard.textContent = hasTarget ? fmtPercent(target) : "--";
            }
        });
    }

    /* ==========================================================
       CSV / PDF Export
       Button wiring only — THD.exportUtil (js/export.js) owns the
       actual mechanics. PDF export has nothing to populate here:
       it prints the live page as-is (see css/print.css), rather
       than building a separate summary view.
    ========================================================== */

    function wireCsvExportButtons(handlers) {
        Object.entries(handlers || {}).forEach(([buttonId, onClick]) => {
            const btn = document.getElementById(buttonId);
            if (btn) btn.addEventListener("click", onClick);
        });
    }

    function wireExportPdfButton(onClick) {
        const btn = document.getElementById("exportPdfBtn");
        if (!btn) return;
        btn.addEventListener("click", onClick);
    }

    /* ==========================================================
       Briefing (Overview)
       Three layers, read top to bottom:
         1. The headline — one sentence about revenue plus a
            supporting line (built in data.js buildBriefing).
         2. Vital signs — six compact figures with sparklines.
            Clicking one plots it in the trend chart further down.
         3. The story feed — ranked "what changed and why" cards.
            Clicking a card hands its `action` back to app.js,
            which routes it into the existing drill-downs (channel
            trend, landing-page panel, a metric on the chart…).
       Sparklines are hand-drawn inline SVG (no Chart.js instance
       per card) so a dozen of them stay cheap to re-render on
       every range change.
    ========================================================== */

    // values: number[]; opts: { highlight, compare, target, w, h }
    function sparkSvg(values, opts) {
        opts = opts || {};
        const w = opts.w || 120;
        const h = opts.h || 36;
        const pad = 3;
        const vals = (values || []).filter((v) => Number.isFinite(v));
        if (vals.length < 2) return "";

        const all = vals.concat((opts.compare || []).filter((v) => Number.isFinite(v)));
        if (Number.isFinite(opts.target)) all.push(opts.target);
        const min = Math.min(...all);
        const max = Math.max(...all);
        const span = max - min || 1;
        const x = (i, n) => pad + (i * (w - pad * 2)) / Math.max(n - 1, 1);
        const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
        const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i, arr.length).toFixed(1)},${y(v).toFixed(1)}`).join("");

        let svg = `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" preserveAspectRatio="none">`;
        if (opts.compare && opts.compare.length > 1) {
            svg += `<path class="sparkCompare" d="${path(opts.compare.slice(0, values.length))}"/>`;
        }
        if (Number.isFinite(opts.target)) {
            svg += `<line class="sparkTarget" x1="${pad}" x2="${w - pad}" y1="${y(opts.target).toFixed(1)}" y2="${y(opts.target).toFixed(1)}"/>`;
        }
        const area = `${path(values)}L${x(values.length - 1, values.length).toFixed(1)},${h - pad}L${pad},${h - pad}Z`;
        svg += `<path class="sparkArea" d="${area}"/>`;
        svg += `<path class="sparkLine" d="${path(values)}"/>`;
        const hi = Number.isInteger(opts.highlight) && opts.highlight >= 0 && opts.highlight < values.length
            ? opts.highlight
            : values.length - 1;
        svg += `<circle class="sparkDot${hi === opts.highlight ? " isHighlight" : ""}" cx="${x(hi, values.length).toFixed(1)}" cy="${y(values[hi]).toFixed(1)}" r="3"/>`;
        svg += "</svg>";
        return svg;
    }

    const fmtYenShort = (v) => {
        if (Math.abs(v) >= 1e6) return "¥" + (v / 1e6).toFixed(2) + "M";
        if (Math.abs(v) >= 1e4) return "¥" + Math.round(v / 1e3).toLocaleString("en-US") + "k";
        return "¥" + Math.round(v).toLocaleString("en-US");
    };

    // Order matters: what a reader scans first. users is last since
    // it's a daily sum (see kpi.totalUsers label), not unique people.
    const VITALS = [
        { key: "revenue", labelKey: "brief.vital.revenue", fmt: fmtYenShort, chart: "revenue" },
        { key: "purchases", labelKey: "brief.vital.purchases", fmt: fmtNumber, chart: "purchases" },
        { key: "aov", labelKey: "brief.vital.aov", fmt: (v) => "¥" + Math.round(v).toLocaleString("en-US"), chart: null },
        { key: "cvr", labelKey: "brief.vital.cvr", fmt: fmtPercent, chart: "cvr" },
        { key: "sessions", labelKey: "brief.vital.sessions", fmt: fmtNumber, chart: "sessions" },
        { key: "users", labelKey: "brief.vital.users", fmt: fmtNumber, chart: "users" }
    ];

    function vitalDeltaHtml(key, data, hasCompareData, partial) {
        // A partial day vs full days isn't a real comparison (−90% at 10am).
        if (partial) return `<span class="vitalDelta neutral">${window.I18N.t("brief.vital.partial")}</span>`;
        if (!hasCompareData) return `<span class="vitalDelta neutral">${window.I18N.t("kpi.noCompareData")}</span>`;
        // CVR reads in points, and a points change exists even when the
        // relative change doesn't (0% -> 5% is +5.00pt, not "new").
        if (key === "cvr" && Number.isFinite(data.deltaPts)) {
            return `<span class="vitalDelta ${data.deltaPts >= 0 ? "pos" : "neg"}">${fmtPts(data.deltaPts)}</span>`;
        }
        if (data.delta === null || data.delta === undefined) return `<span class="vitalDelta neutral">${window.I18N.t("brief.vital.new")}</span>`;
        return `<span class="vitalDelta ${data.delta >= 0 ? "pos" : "neg"}">${fmtDelta(data.delta)}</span>`;
    }

    // series: filterDailyRange(...).series — aov's daily series is
    // derived here (revenue / purchases per day).
    function renderVitals(kpi, series, hasCompareData, onPick, partial) {
        const el = document.getElementById("vitals");
        if (!el || !kpi) return;
        const aovSeries = (series.revenue || []).map((r, i) => (series.purchases[i] ? r / series.purchases[i] : 0));
        const checked = getCheckedMetrics();

        el.innerHTML = VITALS.map((v) => {
            const data = kpi[v.key];
            if (!data) return "";
            const values = v.key === "aov" ? aovSeries : series[v.key];
            const target = v.key === "cvr" && data.target ? data.target : null;
            const targetHtml = target
                ? `<span class="vitalTarget ${data.value >= target ? "hit" : "miss"}">${window.I18N.t("brief.vital.target", { target: fmtPercent(target) })}</span>`
                : "";
            const plotted = v.chart && checked.includes(v.chart);
            return `
                <button class="vital${plotted ? " isPlotted" : ""}" type="button" data-vital="${v.key}" style="--vital:var(--m-${v.key})"
                        ${v.chart ? `title="${window.I18N.t("brief.vital.hint")}"` : ""}>
                    <span class="vitalLabel">${window.I18N.t(v.labelKey)}</span>
                    <span class="vitalValue">${v.fmt(data.value)}</span>
                    <span class="vitalFoot">${vitalDeltaHtml(v.key, data, hasCompareData, partial)}${targetHtml}</span>
                    ${sparkSvg(values, { target, w: 140, h: 34 })}
                </button>`;
        }).join("");

        el.querySelectorAll(".vital").forEach((btn) => {
            btn.addEventListener("click", () => {
                const def = VITALS.find((v) => v.key === btn.dataset.vital);
                if (onPick) onPick(def);
            });
        });
    }

    // Turns one metric's checkbox on (if it isn't already) and lets the
    // existing change listener re-render the chart — keeps the vitals
    // and the chart's own toggles as one source of truth.
    function plotMetric(metric) {
        const container = document.getElementById("metricToggles");
        if (!container) return;
        const cb = container.querySelector(`.metricToggle[data-metric="${metric}"] input`);
        if (!cb) return;
        if (!cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event("change"));
        }
        syncVitalsPlotted();
        const card = document.getElementById("trendCard");
        if (card) card.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }

    // Keeps each vital's "plotted" underline in step with the chart's
    // own checkboxes, however they were toggled.
    function syncVitalsPlotted() {
        const checked = getCheckedMetrics();
        document.querySelectorAll(".vital").forEach((b) => {
            const def = VITALS.find((v) => v.key === b.dataset.vital);
            b.classList.toggle("isPlotted", !!(def && def.chart && checked.includes(def.chart)));
        });
    }

    function renderBriefHeader(range, hasCompareData, dataAsOf) {
        const rangeEl = document.getElementById("briefRange");
        const cmpEl = document.getElementById("briefCompare");
        const asOfEl = document.getElementById("briefAsOf");
        const partialEl = document.getElementById("briefPartial");
        const fmt = (d) => window.I18N.formatDayLabel(d);
        if (rangeEl) rangeEl.textContent = window.I18N.t("brief.kickerRange", { start: fmt(range.start), end: fmt(range.end) });
        if (cmpEl) {
            cmpEl.textContent = hasCompareData
                ? window.I18N.t(range.isYoy ? "brief.kickerYoy" : "brief.kickerCompare", { start: fmt(range.prevStart), end: fmt(range.prevEnd) })
                : window.I18N.t("rangeCompare.noCompareData", { start: fmtISODate(range.prevStart), end: fmtISODate(range.prevEnd) });
            cmpEl.classList.toggle("isWarning", !hasCompareData);
        }
        if (asOfEl) asOfEl.textContent = dataAsOf ? window.I18N.t("brief.dataAsOf", { date: fmt(dataAsOf) }) : "";
        if (partialEl) partialEl.style.display = range.partial ? "" : "none";
    }

    const TONE_ICONS = { alert: "alert-octagon", bad: "trending-down", good: "trending-up", info: "sparkles" };

    function storyHtml(story, index) {
        const spark = story.spark && story.spark.values
            ? sparkSvg(story.spark.values, { highlight: story.spark.highlight, compare: story.spark.compare, target: story.spark.target, w: 160, h: 44 })
            : "";
        return `
            <li class="story tone-${story.tone}${index === 0 ? " isLead" : ""}" data-story-idx="${index}" tabindex="0" role="button">
                <div class="storyMain">
                    <div class="storyMeta">
                        <span class="storyTone"><i data-lucide="${TONE_ICONS[story.tone] || "dot"}"></i>${window.I18N.t("brief.tone." + story.tone)}</span>
                        <span class="storyKicker">${story.kicker}</span>
                    </div>
                    <h4 class="storyTitle">${story.title}</h4>
                    ${story.body ? `<p class="storyBody">${story.body}</p>` : ""}
                </div>
                <div class="storySide">
                    <div class="storyStat">${story.stat || ""}</div>
                    ${spark}
                    <span class="storyOpen">${window.I18N.t("brief.open")} <i data-lucide="arrow-right"></i></span>
                </div>
            </li>`;
    }

    // briefing: { headline: {main, dek}, stories: [] } from THD.data.buildBriefing
    function renderBriefing(briefing, onAction) {
        const headlineEl = document.getElementById("briefHeadline");
        const dekEl = document.getElementById("briefDek");
        const list = document.getElementById("storyList");
        if (!briefing) return;

        if (headlineEl) headlineEl.innerHTML = briefing.headline.main;
        if (dekEl) dekEl.innerHTML = briefing.headline.dek;

        if (!list) return;
        if (!briefing.stories.length) {
            list.innerHTML = `<li class="storyEmpty">${window.I18N.t("brief.feedEmpty")}</li>`;
            return;
        }
        list.innerHTML = briefing.stories.map(storyHtml).join("");
        if (window.lucide) lucide.createIcons();

        list.querySelectorAll(".story").forEach((li) => {
            const story = briefing.stories[Number(li.dataset.storyIdx)];
            const go = () => { if (onAction && story.action) onAction(story.action); };
            li.addEventListener("click", go);
            li.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
            });
        });
    }

    THD.ui = {
        renderBriefing,
        renderBriefHeader,
        renderVitals,
        plotMetric,
        syncVitalsPlotted,
        renderLastUpdate,
        renderKpis,
        showInitialSkeletons,
        renderInsights,
        renderTopLandingPageInsights,
        renderRangeCompare,
        renderDataSourceWarning,
        renderTrafficPeriodLabels,
        renderLandingPages,
        wireLandingPagesToggle,
        wireLandingPageItemClick,
        renderLandingPageInsights,
        getHideSystemPages,
        wireHideSystemToggle,
        renderLandingPagesPeriodLabel,
        getLandingDevice,
        wireLandingDeviceToggle,
        renderLandingRisingPanel,
        hideLandingRisingPanel,
        resetSourceBreakdown,
        renderSourceBreakdown,
        wireSourceBreakdownRowClicks,
        renderSourceBreakdownDetail,
        wireLandingRisingPanelClose,
        renderTrafficComparison,
        wireTrafficComparisonFilter,
        showChannelTrendMode,
        hideChannelTrendMode,
        getChannelTrendMetric,
        wireChannelTrendMetricToggle,
        wireChannelTrendCloseButton,
        populateSourceFilterOptions,
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
        getCheckedMetrics,
        wireMetricToggles,
        getTrendOverlayState,
        wireTrendOverlayToggle,
        wireRefreshButton,
        wireSidebarNav,
        switchToView,
        refreshActiveHeader,
        wireThemeToggle,
        wireNotes,
        refreshNotesList,
        renderGoalsForm,
        wireGoalsForm,
        setGoalsStatus,
        renderGoalProgress,
        wireCsvExportButtons,
        wireExportPdfButton
    };

})(window.THD);
