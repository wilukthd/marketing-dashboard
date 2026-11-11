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

    // How fresh the DATA is (latest date in the feed) — not when the page
    // was loaded, which said nothing about whether the numbers were new.
    let lastFreshnessDate = null;
    function renderDataFreshness(date) {
        if (date !== undefined) lastFreshnessDate = date;
        const el = document.getElementById("lastUpdate");
        if (!el) return;
        el.textContent = lastFreshnessDate ? window.I18N.formatDayLabel(lastFreshnessDate) : "--";
    }

    // Small status message at the bottom of the screen (refresh results).
    let toastTimer = null;
    function showToast(text, tone) {
        let el = document.getElementById("toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "toast";
            el.className = "toast";
            el.setAttribute("role", "status");
            el.setAttribute("aria-live", "polite");
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.dataset.tone = tone || "info";
        el.classList.add("isShown");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("isShown"), 4500);
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

    /* ==========================================================
       KPI Cards
       Each card is <article data-kpi="key"> with children
       marked data-field="value|delta|daily"
    ========================================================== */

    /* ==========================================================
       Skeleton Loading
       Shown from init() (see app.js) the moment the page paints,
       before the first live-data fetch resolves — cleared
       automatically as each section's real render function
       overwrites the same containers. Table skeletons infer
       their column count from the table's own <thead>, so they
       stay correct if a column is ever added or removed.
    ========================================================== */

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
                    <span>${escAttr(label)}</span>
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
        const open = (e) => {
            const item = e.target.closest(".landingItem[data-page-index]");
            if (!item || !container.contains(item)) return;
            const page = visibleLandingPages[Number(item.dataset.pageIndex)];
            if (page) onClick(page);
        };
        container.addEventListener("click", open);
        // role="button" items need the keyboard too
        container.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); }
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
                    // Today/yesterday spike insights carry their typical
                    // day as `baseline`, not `mean` — this printed "NaN".
                    mean: Math.round(insight.mean !== undefined ? insight.mean : insight.baseline).toLocaleString("en-US")
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
            <div class="sourceBreakdownRowWrap" data-label="${escAttr(row.label)}">
                <div class="sourceBreakdownRow">
                    <span class="sourceBreakdownLabel" title="${escAttr(row.label)}">${escAttr(row.label)}</span>
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
                <td>${escAttr(d.sourceMedium)}</td>
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
        // Notes come from a shared database anyone with the link can write
        // to: escape the id and allowlist the category before they reach markup.
        n = { ...n, id: escAttr(n.id), category: NOTE_CATEGORY_KEYS[n.category] ? n.category : "general" };
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
            // Keep the draft until the save actually succeeds.
            addBtn.disabled = true;
            window.THD.notes.add({ text, author, category }).then(() => {
                input.value = "";
            }).catch((e) => {
                console.warn("[THD.ui] Failed to add note:", e.message);
                input.setAttribute("aria-invalid", "true");
            }).finally(() => {
                addBtn.disabled = false;
            });
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

    // Clicking a row asks app.js (which holds the raw source rows and
    // current groupBy) to filter the Session Source table down to just
    // that bucket — e.g. click "Referral (Other)" to see which actual
    // sites make it up. Clicking the same row again clears it; app.js
    // owns that toggle logic, this just reports which label was clicked.
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
            .map((c) => `<option value="${escAttr(c)}">${escAttr(window.I18N.channelLabel(c))}</option>`)
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

    // The platform/channel dropdown is gone (the traffic tree shows
    // both levels at once). Platform stays the grouping for the
    // landing-page source breakdown and the briefing — it's the more
    // actionable cut ("Meta Ads", not "Paid Social").
    function getTrafficGroupBy() {
        return "platform";
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
                <td>${escAttr(r.sourceMedium)}</td>
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
    function renderSourceFilterStatus(filter) {
        const status = document.getElementById("sourceFilterStatus");
        const labelEl = document.getElementById("sourceFilterLabel");
        if (!status || !labelEl) return;
        const label = filter && typeof filter === "object" ? filter.label : filter;
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
                    <span class="status ${r.trend === null || r.trend === undefined ? "" : (r.trend >= 0 ? "up" : "down")}">
                        ${r.trend === null || r.trend === undefined ? window.I18N.t("brief.vital.partial") : (r.trend >= 0 ? "▲" : "▼") + " " + Math.abs(r.trend).toFixed(1) + "%"}
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

        btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            const icon = btn.querySelector("svg");
            btn.disabled = true;
            if (icon) icon.style.animation = "spin .6s linear infinite";
            // Wait for the reload to finish before re-enabling, so two
            // clicks can't race and an older response can't win.
            try {
                await onRefresh();
            } finally {
                btn.disabled = false;
                if (icon) icon.style.animation = "";
            }
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
        { key: "aov", labelKey: "brief.vital.aov", fmt: (v) => "¥" + Math.round(v).toLocaleString("en-US"), chart: "aov" },
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
            const plotted = v.chart && checked.includes(v.chart);
            return `
                <button class="vital${plotted ? " isPlotted" : ""}" type="button" data-vital="${v.key}" style="--vital:var(--m-${v.key})"
                        ${v.chart ? `aria-pressed="${plotted ? "true" : "false"}"` : ""}
                        ${v.chart ? `title="${window.I18N.t("brief.vital.hint")}"` : ""}>
                    <span class="vitalLabel">${window.I18N.t(v.labelKey)}${v.chart ? `<span class="vitalOnChart">${window.I18N.t("brief.vital.onChart")}</span>` : ""}</span>
                    <span class="vitalValue">${v.fmt(data.value)}</span>
                    <span class="vitalFoot">${vitalDeltaHtml(v.key, data, hasCompareData, partial)}</span>
                    ${sparkSvg(values, { w: 140, h: 34 })}
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
    // toggle: true = clicking an already-plotted metric removes it
    // (vital signs); false = always add it (story click-throughs).
    function plotMetric(metric, toggle) {
        const container = document.getElementById("metricToggles");
        if (!container) return;
        const cb = container.querySelector(`.metricToggle[data-metric="${metric}"] input`);
        if (!cb) return;
        if (toggle && cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event("change"));
            syncVitalsPlotted();
            return;
        }
        if (!cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event("change"));
        }
        syncVitalsPlotted();
        // Story click-throughs jump to the chart; toggling vitals stays
        // put so several can be switched on in a row.
        if (toggle) return;
        const card = document.getElementById("trendCard");
        if (card) card.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }

    // Keeps each vital's "plotted" underline in step with the chart's
    // own checkboxes, however they were toggled.
    function syncVitalsPlotted() {
        const checked = getCheckedMetrics();
        document.querySelectorAll(".vital").forEach((b) => {
            const def = VITALS.find((v) => v.key === b.dataset.vital);
            const on = !!(def && def.chart && checked.includes(def.chart));
            b.classList.toggle("isPlotted", on);
            if (def && def.chart) b.setAttribute("aria-pressed", on ? "true" : "false");
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
            ? sparkSvg(story.spark.values, { highlight: story.spark.highlight, compare: story.spark.compare, w: 160, h: 44 })
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
        // A briefing should be short: the 5 most important stories, the
        // rest one click away.
        const LEAD = 5;
        const extra = briefing.stories.length - LEAD;
        list.innerHTML = briefing.stories.map(storyHtml).join("") +
            (extra > 0 ? `<li class="storyMore"><button type="button" class="storyMoreBtn">${window.I18N.t("brief.moreStories", { n: extra })}</button></li>` : "");
        list.classList.toggle("isCollapsed", extra > 0);
        const moreBtn = list.querySelector(".storyMoreBtn");
        if (moreBtn) moreBtn.addEventListener("click", () => {
            list.classList.remove("isCollapsed");
            moreBtn.parentElement.remove();
        });
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

    /* ==========================================================
       Customer Flow (Sales tab) — replaces the old 100%-stacked
       new/repeat share bars, where ~90% of every bar was the same
       repeat-customer purple and the part that actually moves (new
       customers, 5–15%) was a sliver at the bottom.

       Deliberately a different visual grammar from every other
       chart in the app (those are Chart.js lines/areas/bars in the
       metric colors): ink dots and hollow rings, monochrome, drawn
       as inline SVG — so nobody mistakes it for "another revenue
       chart".
         • New customers: a dumbbell per month — filled dot = this
           year, ring = same month last year, connector colored by
           whether it's up or down. Acquisition is the question here,
           and last year is the honest baseline (seasonality).
         • Repeat orders: slim ink columns with a dashed median line.
         • Above both: three headline figures and auto-written notes
           for the months that matter (biggest drop, the peak).
    ========================================================== */

    const svgEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    // "2025年9月" -> "9月", "Sep 2025" -> "Sep"; year shown separately on January.
    function shortMonth(period, row) {
        if (row && Number.isFinite(row.year) && Number.isFinite(row.month)) {
            const d = new Date(row.year, row.month - 1, 1);
            const month = window.I18N.getLang() === "ja"
                ? row.month + "月"
                : d.toLocaleDateString("en-US", { month: "short" });
            return { month, year: String(row.year), isJan: row.month === 1 };
        }
        const ja = /^(\d{4})年(\d{1,2})月/.exec(period);
        if (ja) return { month: ja[2] + "月", year: ja[1], isJan: ja[2] === "1" };
        const en = /^([A-Za-z]{3})\w*\s+(\d{4})/.exec(period);
        if (en) return { month: en[1], year: en[2], isJan: en[1] === "Jan" };
        return { month: period, year: "", isJan: false };
    }

    function niceMax(v) {
        if (v <= 0) return 1;
        const mag = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / mag;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    }

    // Drawn at roughly the size it's shown (one full-width panel per row),
    // so labels render near their real pixel size instead of being
    // stretched up or squeezed down.
    const CF = { w: 1040, h: 300, padL: 52, padR: 16, padT: 24, padB: 40 };

    // Axis range for a dot chart. Starts at zero when the values reach
    // down toward it; otherwise zooms in (dots, unlike bars, don't need a
    // zero baseline) — repeat orders run ~2,500–4,000 with ±200 changes
    // that would be invisible on a 0–5,000 axis. Padded so the difference
    // labels above/below the points always have room.
    function cfRange(lo, hi) {
        if (lo <= hi * 0.5) {
            const max = niceMax(hi * 1.15);
            return { min: 0, max, ticks: [0, max / 2, max] };
        }
        const span = Math.max(hi - lo, hi * 0.1, 1);
        const rawMin = lo - span * 0.35;
        const rawMax = hi + span * 0.35;
        const rough = (rawMax - rawMin) / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const unit = (rough / mag >= 5 ? 5 : rough / mag >= 2 ? 2 : 1) * mag;
        const min = Math.max(0, Math.floor(rawMin / unit) * unit);
        const max = Math.ceil(rawMax / unit) * unit;
        const count = Math.round((max - min) / unit);
        const tickStep = count > 5 ? unit * 2 : unit;
        const ticks = [];
        for (let v = min; v <= max + 1e-9; v += tickStep) ticks.push(v);
        return { min, max, ticks };
    }

    function cfFrame(n, range, months) {
        const innerW = CF.w - CF.padL - CF.padR;
        const innerH = CF.h - CF.padT - CF.padB;
        const step = innerW / n;
        const x = (i) => CF.padL + step * (i + 0.5);
        const y = (v) => CF.padT + innerH - ((v - range.min) / (range.max - range.min)) * innerH;
        let g = "";
        range.ticks.forEach((v) => {
            g += `<line class="cfGrid" x1="${CF.padL}" x2="${CF.w - CF.padR}" y1="${y(v)}" y2="${y(v)}"/>`;
            g += `<text class="cfTick" x="${CF.padL - 8}" y="${y(v) + 3.5}" text-anchor="end">${fmtNumber(v)}</text>`;
        });
        months.forEach((m, i) => {
            g += `<text class="cfMonth" x="${x(i)}" y="${CF.h - CF.padB + 15}" text-anchor="middle">${svgEsc(m.month)}</text>`;
            if (m.isJan || i === 0) g += `<text class="cfYear" x="${x(i)}" y="${CF.h - CF.padB + 28}" text-anchor="middle">${svgEsc(m.year)}</text>`;
        });
        return { x, y, step, grid: g, bottom: y(range.min) };
    }

    // Difference vs the same month last year, as a small coloured label:
    // green and ABOVE the point when up, red and BELOW it when down — so
    // the sign can be read from position and colour before the number.
    function cfDiffChip(cx, yAnchor, diff, f) {
        if (!Number.isFinite(diff)) return "";
        const up = diff >= 0;
        const text = (up ? "+" : "−") + fmtNumber(Math.abs(diff));
        const h = 16;
        // above the higher point for "up", below the lower point for "down",
        // kept inside the plot area
        let cy = up ? yAnchor - 19 : yAnchor + 19;
        cy = Math.min(Math.max(cy, CF.padT + h / 2), f.bottom - h / 2 - 2);
        // Plain coloured text (no box, which competed with the marks); a
        // background-coloured outline keeps it legible where it crosses a
        // line or bar — see .cfDiff text in briefing.css.
        return `<g class="cfDiff ${up ? "up" : "down"}">` +
            `<text x="${cx.toFixed(1)}" y="${(cy + 4.5).toFixed(1)}" text-anchor="middle">${text}</text></g>`;
    }

    function cfTip(month, cur, ly) {
        return `${month}: ${fmtNumber(cur)}` + (Number.isFinite(ly)
            ? ` / ${window.I18N.t("customers.lastYear")} ${fmtNumber(ly)} (${cur - ly >= 0 ? "+" : "−"}${fmtNumber(Math.abs(cur - ly))})`
            : "");
    }

    // The one diagram both panels use (new customers and repeat customers
    // read exactly the same way): filled dot = this year, ring = the same
    // month last year, a green/red line joining them, and the difference
    // printed above (up) or below (down).
    function customerDotsSvg(rows, key, lastYear, months, ariaLabel) {
        const cur = rows.map((r) => r[key]);
        const all = cur.concat(lastYear.filter(Number.isFinite));
        const f = cfFrame(rows.length, cfRange(Math.min(...all), Math.max(...all)), months);
        let s = f.grid;
        rows.forEach((r, i) => {
            const cx = f.x(i);
            const v = cur[i];
            const ly = lastYear[i];
            const open = isOpenMonth(r);
            s += `<g class="cfMonthGroup"><title>${svgEsc(cfTip(months[i].month, v, ly))}</title>`;
            s += `<rect class="cfHit" x="${cx - f.step / 2}" y="${CF.padT}" width="${f.step}" height="${CF.h - CF.padT - CF.padB}"/>`;
            if (Number.isFinite(ly)) {
                s += `<line class="cfLink ${v >= ly ? "up" : "down"}" x1="${cx}" x2="${cx}" y1="${f.y(ly)}" y2="${f.y(v)}"/>`;
                s += `<circle class="cfRing" cx="${cx}" cy="${f.y(ly)}" r="6"/>`;
            }
            s += `<circle class="cfDot${open ? " isOpen" : ""}" cx="${cx}" cy="${f.y(v)}" r="7.5"/>`;
            if (Number.isFinite(ly) && !open) {
                const diff = v - ly;
                s += cfDiffChip(cx, diff >= 0 ? f.y(Math.max(v, ly)) : f.y(Math.min(v, ly)), diff, f);
            }
            s += "</g>";
        });
        return `<svg class="cfSvg" viewBox="0 0 ${CF.w} ${CF.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${svgEsc(ariaLabel)}">${s}</svg>`;
    }

    // Business months close on the 20th (see businessMonthOf in data.js);
    // a row whose month hasn't closed yet is still filling up.
    function isOpenMonth(r) {
        if (!r || !Number.isFinite(r.year) || !Number.isFinite(r.month)) return false;
        return new Date() <= new Date(r.year, r.month - 1, 20, 23, 59, 59);
    }

    const pctChange = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);
    const signedPct = (v) => (v === null ? "—" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(0) + "%");

    // recentRows: the 13 months on screen; fullRows: all history (for last-year baselines)
    function renderCustomerFlow(recentRows, fullRows) {
        const statsEl = document.getElementById("custStats");
        const notesEl = document.getElementById("custNotes");
        const newEl = document.getElementById("custNewChart");
        const repEl = document.getElementById("custRepeatChart");
        if (!newEl || !repEl || !recentRows || !recentRows.length) return;

        const full = fullRows && fullRows.length ? fullRows : recentRows;
        const offset = full.length - recentRows.length;
        const byYm = new Map();
        full.forEach((r) => { if (Number.isFinite(r.year) && Number.isFinite(r.month)) byYm.set(r.year * 12 + r.month, r); });
        // Same month last year, looked up by (year - 1, month) so a month
        // missing from the sheet can't shift every comparison by one.
        // Falls back to position only for rows without year/month (demo data).
        const lastYearRow = (r, i) => (Number.isFinite(r.year) && Number.isFinite(r.month))
            ? byYm.get((r.year - 1) * 12 + r.month)
            : full[offset + i - 12];
        const lyRows = recentRows.map(lastYearRow);
        const lastYear = lyRows.map((ly) => (ly ? ly.newOrders : NaN));
        const lastYearRepeat = lyRows.map((ly) => (ly ? ly.repeatOrders : NaN));
        const months = recentRows.map((r) => shortMonth(r.period, r));
        const t = window.I18N.t;

        // ---- notes: biggest month-on-month drop in new customers, and the peak ----
        // Computed over CLOSED months only — an open month's low count is
        // just "not finished yet", not a drop.
        const closedCount = recentRows.filter((r) => !isOpenMonth(r)).length;
        const notes = [];
        // Worst month vs the SAME month last year — month-on-month would
        // just rediscover seasonality (every January drops after the
        // December peak).
        let worst = null;
        recentRows.forEach((r, i) => {
            if (i >= closedCount) return;
            const prev = lastYear[i];
            if (!Number.isFinite(prev) || prev < 100) return;
            const ch = pctChange(r.newOrders, prev);
            if (ch !== null && ch <= -25 && (!worst || ch < worst.ch)) worst = { i, ch, prev, cur: r.newOrders };
        });
        // The trend across months beats any single month: how many closed
        // months came in below the same month last year?
        const compared = recentRows.map((r, i) => (i < closedCount && Number.isFinite(lastYear[i]) ? r.newOrders - lastYear[i] : null)).filter((d) => d !== null);
        const below = compared.filter((d) => d < 0).length;
        const above = compared.filter((d) => d > 0).length; // ties count as neither
        if (compared.length >= 6 && below / compared.length >= 0.7) {
            notes.push({ tone: "bad", text: t("customers.noteStreakDown", { n: below, total: compared.length }) });
        } else if (compared.length >= 6 && above / compared.length >= 0.7) {
            notes.push({ tone: "good", text: t("customers.noteStreakUp", { n: above, total: compared.length }) });
        }
        if (worst) {
            notes.push({ tone: "bad", text: t("customers.noteDrop", { month: months[worst.i].month, pct: signedPct(worst.ch), prev: fmtNumber(worst.prev), cur: fmtNumber(worst.cur) }) });
        }
        if (closedCount > 0) {
            const peakIdx = recentRows.reduce((best, r, i) => (i < closedCount && r.newOrders > recentRows[best].newOrders ? i : best), 0);
            notes.push({ tone: "good", text: t("customers.notePeak", { month: months[peakIdx].month, value: fmtNumber(recentRows[peakIdx].newOrders) }) });
        }
        const latestI = Math.max(closedCount - 1, 0); // latest CLOSED month
        if (closedCount > 0 && Number.isFinite(lastYear[latestI]) && (!worst || worst.i !== latestI)) {
            const ch = pctChange(recentRows[latestI].newOrders, lastYear[latestI]);
            if (ch !== null && Math.abs(ch) >= 10) {
                notes.push({ tone: ch >= 0 ? "good" : "bad", text: t("customers.noteYoy", { month: months[latestI].month, pct: signedPct(ch) }) });
            }
        }

        // ---- headline figures for the latest month ----
        const latest = recentRows[latestI];
        const share = (r) => (r.newOrders + r.repeatOrders ? (r.newOrders / (r.newOrders + r.repeatOrders)) * 100 : 0);
        const lyRow = lyRows[latestI];
        const stat = (label, value, compare) => `
            <div class="custStat">
                <span class="custStatLabel">${label}</span>
                <span class="custStatValue">${value}</span>
                <span class="custStatCompare">${compare}</span>
            </div>`;
        const vsLy = (cur, ly) => Number.isFinite(ly) ? t("customers.vsLy", { pct: signedPct(pctChange(cur, ly)), value: fmtNumber(ly) }) : "";
        if (statsEl) {
            statsEl.innerHTML =
                `<div class="custStatMonth">${svgEsc(Number.isFinite(latest.year) ? window.I18N.formatMonth(latest.year, latest.month - 1) : latest.period)}${closedCount === 0 ? " · " + svgEsc(t("brief.vital.partial")) : ""}</div>` +
                stat(t("customers.statShare"), share(latest).toFixed(1) + "%",
                    lyRow ? t("customers.vsLyPts", { pts: ((share(latest) - share(lyRow)) >= 0 ? "+" : "−") + Math.abs(share(latest) - share(lyRow)).toFixed(1) }) : "");
        }
        if (closedCount < recentRows.length) {
            notes.push({ tone: "info", text: t("customers.noteOpen", { month: months[recentRows.length - 1].month }) });
        }
        if (notesEl) {
            notesEl.innerHTML = notes.map((n) => `<li class="custNote ${n.tone}">${svgEsc(n.text)}</li>`).join("");
        }

        // Each panel's header carries its own latest-month figure, so the
        // number sits inside the frame it belongs to.
        const monthLabel = Number.isFinite(latest.year) ? window.I18N.formatMonth(latest.year, latest.month - 1) : latest.period;
        const panelStat = (id, value, ly) => {
            const el = document.getElementById(id);
            if (!el) return;
            const pct = Number.isFinite(ly) ? pctChange(value, ly) : null;
            el.innerHTML =
                `<span class="custPanelStatValue">${fmtNumber(value)}</span>` +
                `<span class="custPanelStatMeta">${svgEsc(monthLabel)}` +
                (pct !== null ? ` · <b class="${pct >= 0 ? "up" : "down"}">${svgEsc(t("customers.vsLy", { pct: signedPct(pct), value: fmtNumber(ly) }))}</b>` : "") +
                `</span>`;
        };
        panelStat("custNewStat", latest.newOrders, lastYear[latestI]);
        panelStat("custRepeatStat", latest.repeatOrders, lastYearRepeat[latestI]);

        newEl.innerHTML = customerDotsSvg(recentRows, "newOrders", lastYear, months, t("customers.newTitle"));
        repEl.innerHTML = customerDotsSvg(recentRows, "repeatOrders", lastYearRepeat, months, t("customers.repeatTitle"));
    }

    /* ==========================================================
       Traffic tree table (replaces the flat comparison table and
       its platform/channel dropdown — see buildTrafficTree in
       data.js). The caret opens a row; clicking the row itself
       filters the Session Source table and channel trend to that
       slice. Expansion state survives re-renders (range changes),
       and the path to the active filter is always opened.
    ========================================================== */

    const treeExpanded = new Set();
    const treeShowAll = new Set(); // parent ids whose full child list is open
    const TREE_CHILD_LIMIT = 12;
    let lastTree = [];
    let lastTreeColors = {};

    const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function treeNodeMatches(n, filter) {
        if (!filter) return false;
        if (n.groupBy === filter.groupBy && n.label === filter.label) {
            // A scoped filter (platform/source picked inside a channel)
            // only matches that channel's row; a global one (from the
            // briefing) matches it wherever it appears.
            return !filter.channel || filter.channel === n.channel;
        }
        return filter.groupBy === "platform" && !filter.channel && n.alsoPlatform === filter.label;
    }

    // Opens every ancestor of the node the filter points at, so a
    // click-through from the briefing lands on a visible row.
    function expandPathTo(filter) {
        const walk = (nodes, path) => {
            for (const n of nodes) {
                if (treeNodeMatches(n, filter)) {
                    path.forEach((id) => { treeExpanded.add(id); treeShowAll.add(id); });
                    return true;
                }
                if (walk(n.children, path.concat(n.id))) return true;
            }
            return false;
        };
        walk(lastTree, []);
    }

    function treeLabel(n) {
        if (n.level === "group") return escAttr(window.I18N.t("traffic.smallSources", { n: n.children.length }));
        if (n.level === "source") return escAttr(n.label); // raw GA4 source / medium — untrusted text
        return escAttr(window.I18N.channelLabel(n.label));
    }

    function treeDeltaHtml(n) {
        const cur = n.cur.sessions;
        const prev = n.prev.sessions;
        if (prev > 0) {
            const delta = ((cur - prev) / prev) * 100;
            // More unattributed traffic is a tracking problem, not growth.
            const upIsBad = n.label === "(not set)";
            const good = upIsBad ? delta <= 0 : delta >= 0;
            return `<span class="deltaBadge ${good ? "positive" : "negative"}">${fmtDelta(delta)}</span>`;
        }
        return cur > 0 ? `<span class="deltaBadge positive">${window.I18N.t("traffic.new")}</span>` : "—";
    }

    function treeRowsHtml(nodes, depth, filter) {
        return nodes.map((n) => {
            const hasKids = n.children.length > 0;
            const open = hasKids && treeExpanded.has(n.id);
            const active = treeNodeMatches(n, filter);
            const color = n.level === "channel" ? (lastTreeColors[n.label] || "var(--text-faint)") : null;
            // Internal / Payment sessions are mid-checkout — their CVR
            // isn't a channel metric, so don't invite comparing it.
            const notChannel = n.label === "Internal / Payment";
            const cvr = notChannel ? `<span class="tcMuted" title="${escAttr(window.I18N.t("traffic.internalCvrHint"))}">—</span>` : (n.cur.sessions ? fmtPercent(n.cur.cvr) : "—");
            const row = `
                <tr class="tcRow lvl-${n.level}${active ? " active" : ""}${notChannel ? " isInternal" : ""}" data-id="${escAttr(n.id)}" data-level="${n.level}"
                    data-group-by="${n.groupBy || ""}" data-label="${escAttr(n.label)}" data-channel="${n.level === "channel" || !n.channel ? "" : escAttr(n.channel)}">
                    <td class="tcSource">
                        <span class="tcSourceInner" style="--depth:${depth}">
                            ${hasKids
                                ? `<button type="button" class="tcCaret${open ? " isOpen" : ""}" aria-expanded="${open}" aria-label="${escAttr(window.I18N.t(open ? "traffic.collapse" : "traffic.expand"))}">›</button>`
                                : `<span class="tcCaretSpacer"></span>`}
                            ${color ? `<span class="legendColor" style="background:${color}"></span>` : ""}
                            <span class="tcLabel">${treeLabel(n)}</span>
                            ${hasKids ? `<small class="tcCount">${n.children.length}</small>` : ""}
                        </span>
                    </td>
                    <td class="number">${n.cur.sessions ? fmtNumber(n.cur.sessions) : "—"}</td>
                    <td class="number">${n.prev.sessions ? fmtNumber(n.prev.sessions) : "—"}</td>
                    <td class="number">${treeDeltaHtml(n)}</td>
                    <td class="number">${n.cur.sessions ? fmtYen(n.cur.revenue) : "—"}</td>
                    <td class="number">${cvr}</td>
                </tr>`;
            if (!open) return row;
            const all = treeShowAll.has(n.id) || n.children.length <= TREE_CHILD_LIMIT + 2;
            const shown = all ? n.children : n.children.slice(0, TREE_CHILD_LIMIT);
            let html = row + treeRowsHtml(shown, depth + 1, filter);
            if (!all) {
                const rest = n.children.length - shown.length;
                html += `
                <tr class="tcRow lvl-more" data-id="${escAttr(n.id)}" data-level="more">
                    <td class="tcSource" colspan="6">
                        <span class="tcSourceInner" style="--depth:${depth + 1}">
                            <span class="tcCaretSpacer"></span>
                            <button type="button" class="tcMore">${escAttr(window.I18N.t("traffic.showMore", { n: rest }))}</button>
                        </span>
                    </td>
                </tr>`;
            }
            return html;
        }).join("");
    }

    // colors: channel label -> doughnut color (from renderTrafficChart)
    function renderTrafficTree(tree, filter, colors) {
        if (tree) lastTree = tree;
        if (colors) lastTreeColors = colors;
        const tbody = document.getElementById("trafficCompareTable");
        if (!tbody) return;
        if (!lastTree.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="emptyRow">${window.I18N.t("traffic.empty")}</td></tr>`;
            return;
        }
        if (filter) expandPathTo(filter);
        tbody.innerHTML = treeRowsHtml(lastTree, 0, filter);
    }

    // onFilter({groupBy, label}) for a row click; the caret (and the
    // "small sources" group row) only open/close.
    function wireTrafficTree(onFilter, getFilter) {
        const tbody = document.getElementById("trafficCompareTable");
        if (!tbody) return;
        tbody.addEventListener("click", (e) => {
            const row = e.target.closest("tr.tcRow");
            if (!row) return;
            const toggle = () => {
                const id = row.dataset.id;
                if (treeExpanded.has(id)) treeExpanded.delete(id); else treeExpanded.add(id);
                renderTrafficTree(null, getFilter(), null);
            };
            if (row.dataset.level === "more") {
                treeShowAll.add(row.dataset.id);
                renderTrafficTree(null, getFilter(), null);
                return;
            }
            if (e.target.closest(".tcCaret") || row.dataset.level === "group") { toggle(); return; }
            onFilter({ groupBy: row.dataset.groupBy, label: row.dataset.label, channel: row.dataset.channel || undefined });
        });
    }

    THD.ui = {
        renderTrafficTree,
        wireTrafficTree,
        renderCustomerFlow,
        renderBriefing,
        renderBriefHeader,
        renderVitals,
        plotMetric,
        syncVitalsPlotted,
        renderDataFreshness,
        showToast,
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
        showChannelTrendMode,
        hideChannelTrendMode,
        getChannelTrendMetric,
        wireChannelTrendMetricToggle,
        wireChannelTrendCloseButton,
        populateSourceFilterOptions,
        wireSourceFilterToggle,
        getTrafficGroupBy,
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
