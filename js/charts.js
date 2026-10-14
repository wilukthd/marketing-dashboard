/* ==========================================================
   THD Analytics
   Chart Rendering
   Version 1.0
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    let trendChartInstance = null;
    let channelTrendChartInstance = null;
    const trafficChartInstances = {}; // keyed by canvas id, since current/previous each get their own doughnut

    // Read fresh at render time (not cached) so charts pick up the
    // right palette whether they're being created for the first time
    // or re-rendered after a dark/light theme toggle.
    // Pulled from the CSS tokens (css/briefing.css) so the charts
    // always match the page, in either theme, without a second copy
    // of the palette living here.
    function cssVar(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }

    function getChartColors() {
        return {
            grid: cssVar("--border", "#E4DCCF"),
            textLight: cssVar("--text-light", "#6E675C"),
            text: cssVar("--text", "#1B1813"),
            surface: cssVar("--surface", "#FFFDF9")
        };
    }

    // Colors match each metric's KPI card accent (see --m-* tokens
    // in css/main.css), so the chart and the cards above it read as
    // the same visual language. Hues spread ~72° apart around the
    // wheel (cobalt / teal / green / rose / violet) so no two lines
    // read as "the same color family" when several are stacked
    // together, and none of them collide with the brand signal
    // color (#FF5A2E), which is reserved for interactive/highlight
    // use only (see the rising-day bar highlight further down).
    // color is a getter so it re-reads the --m-* token on every render
    // (i.e. follows the light/dark theme).
    const metricEntry = (key, fallback, format) => ({
        get color() { return cssVar(`--m-${key}`, fallback); },
        format
    });
    const METRIC_CONFIG = {
        users: metricEntry("users", "#3456BF", (v) => Math.round(v).toLocaleString("en-US")),
        sessions: metricEntry("sessions", "#0F8A8A", (v) => Math.round(v).toLocaleString("en-US")),
        purchases: metricEntry("purchases", "#2B7A4B", (v) => Math.round(v).toLocaleString("en-US")),
        revenue: metricEntry("revenue", "#B8325E", (v) => "¥" + Math.round(v).toLocaleString("en-US")),
        cvr: metricEntry("cvr", "#6B47D6", (v) => v.toFixed(2) + "%")
    };

    // Reuses the same dictionary keys as the KPI cards, so a metric's
    // name never drifts between the cards and the chart that plots it.
    const METRIC_LABEL_KEYS = {
        users: "kpi.totalUsers",
        sessions: "kpi.sessions",
        purchases: "kpi.purchases",
        revenue: "kpi.revenue",
        cvr: "kpi.cvr"
    };

    function metricLabel(key) {
        return window.I18N.t(METRIC_LABEL_KEYS[key] || key);
    }

    Chart.defaults.font.family = "'Inter', 'Noto Sans JP', sans-serif";

    /* ==========================================================
       Trend Chart
       Renders any combination of the 5 metrics, each on its own
       independently-scaled axis (so e.g. Revenue in the millions
       doesn't flatten CVR's 0-10% range). Only the first two
       visible metrics get a drawn axis to avoid clutter; the
       rest still scale correctly, just without visible ticks.
    ========================================================== */

    function renderTrendChart(labels, series, visibleMetrics, options) {

        const canvas = document.getElementById("trendChart");
        if (!canvas) return;

        const colors = getChartColors();
        const showTrendOverlay = !!(options && options.showTrendOverlay);

        if (trendChartInstance) {
            trendChartInstance.destroy();
            trendChartInstance = null;
        }

        if (!visibleMetrics || !visibleMetrics.length) return;

        // Each metric contributes its solid line, and — when the
        // moving-average toggle is on — a dashed overlay right after
        // it sharing the same axis/color, so it reads as "this line,
        // smoothed" rather than a new unrelated series.
        const datasets = [];
        visibleMetrics.forEach((key) => {
            const cfg = METRIC_CONFIG[key];
            datasets.push({
                label: metricLabel(key),
                data: series[key],
                borderColor: cfg.color,
                backgroundColor: cfg.color,
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: cfg.color,
                pointHoverBorderColor: "#fff",
                pointHoverBorderWidth: 2,
                tension: 0.35,
                yAxisID: `y_${key}`,
                metricKey: key,
                isTrendline: false
            });

            if (showTrendOverlay && THD.data && THD.data.computeMovingAverage) {
                datasets.push({
                    label: `${metricLabel(key)}${window.I18N.t("trend.movingAvgSuffix")}`,
                    data: THD.data.computeMovingAverage(series[key], 7),
                    borderColor: cfg.color,
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    tension: 0.35,
                    yAxisID: `y_${key}`,
                    metricKey: key,
                    isTrendline: true
                });
            }
        });

        const scales = {
            x: {
                grid: { display: false },
                ticks: { maxTicksLimit: 8, color: colors.textLight }
            }
        };

        visibleMetrics.forEach((key, i) => {
            const cfg = METRIC_CONFIG[key];
            scales[`y_${key}`] = {
                position: i % 2 === 0 ? "left" : "right",
                display: i < 2,
                grid: { display: i === 0, color: colors.grid },
                border: { display: false },
                ticks: { callback: (v) => cfg.format(v), color: colors.textLight }
            };
        });

        trendChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#181A22",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (item) => {
                                const key = item.dataset.metricKey;
                                const cfg = METRIC_CONFIG[key];
                                const suffix = item.dataset.isTrendline ? window.I18N.t("trend.movingAvgSuffix") : "";
                                return `${metricLabel(key)}${suffix}: ${cfg.format(item.parsed.y)}`;
                            }
                        }
                    }
                },
                scales
            }
        });
    }

    /* ==========================================================
       Traffic Sources (doughnut)
    ========================================================== */

    // A single, shared palette (rather than one derived per-call) so a
    // given channel/platform gets the same color in both the current
    // and previous doughnut, which is what makes the two visually
    // comparable at a glance instead of just two unrelated pie charts.
    const TRAFFIC_PALETTE = [
        "#2B59FF", "#0F9D63", "#0EA5A5", "#7C4DFF", "#D6336C", "#FF5A2E",
        "#C67C00", "#C81E3A", "#5B6EF5", "#2E8B7C", "#A64DFF", "#6B6F7B"
    ];
    const trafficColorAssignments = {}; // label -> color, built up as labels are seen

    function colorForLabel(label) {
        if (!trafficColorAssignments[label]) {
            const used = Object.keys(trafficColorAssignments).length;
            trafficColorAssignments[label] = TRAFFIC_PALETTE[used % TRAFFIC_PALETTE.length];
        }
        return trafficColorAssignments[label];
    }

    function renderTrafficChart(canvasId, channels, totalSessions) {

        const canvas = document.getElementById(canvasId);
        if (!canvas) return [];

        const rawLabels = channels.map((c) => c.label);
        const displayLabels = rawLabels.map((l) => window.I18N.channelLabel(l));
        const values = channels.map((c) => c.percent);
        const palette = rawLabels.map(colorForLabel);
        const colors = getChartColors();

        if (trafficChartInstances[canvasId]) {
            trafficChartInstances[canvasId].destroy();
            delete trafficChartInstances[canvasId];
        }

        // Draws the running total in the doughnut's hole so the empty
        // center carries information instead of being dead space.
        const centerTextPlugin = {
            id: "trafficCenterText",
            afterDraw(chart) {
                const { ctx, chartArea } = chart;
                if (!chartArea) return;
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top + chartArea.bottom) / 2;
                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = colors.text;
                ctx.font = "700 22px 'Inter', sans-serif";
                ctx.fillText(Math.round(totalSessions || 0).toLocaleString("en-US"), cx, cy - 10);
                ctx.fillStyle = colors.textLight;
                ctx.font = "500 12px 'Inter', sans-serif";
                ctx.fillText(window.I18N.t("traffic.centerLabel"), cx, cy + 12);
                ctx.restore();
            }
        };

        trafficChartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: displayLabels,
                datasets: [{
                    data: values,
                    backgroundColor: palette,
                    borderColor: colors.surface,
                    borderWidth: 3,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "68%",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#181A22",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (item) => `${item.label}: ${item.parsed}%`
                        }
                    }
                }
            },
            plugins: [centerTextPlugin]
        });

        return channels.map((c) => ({ ...c, color: colorForLabel(c.label) }));
    }

    /* ==========================================================
       Channel Trend (doughnut click drill-down)
       Replaces both doughnuts with one merged line chart when a
       Traffic Comparison row is clicked — current period solid,
       previous period dashed in a lighter shade of the same hue,
       aligned by day-offset (not calendar date) so "This Month"
       sits directly above "Last Month" for genuine comparison.
    ========================================================== */

    // Single line for the selected channel's own current-period trend.
    // A "vs. previous period" overlay used to render here too, but it
    // added visual noise without much payoff once you're already
    // looking at one channel in isolation — the doughnuts one level up
    // are where the current-vs-previous comparison actually belongs.
    function renderChannelTrendChart(canvasId, channelKey, data, metric) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const colors = getChartColors();
        const cfg = METRIC_CONFIG[metric] || METRIC_CONFIG.sessions;
        const color = colorForLabel(channelKey);

        if (channelTrendChartInstance) {
            channelTrendChartInstance.destroy();
            channelTrendChartInstance = null;
        }

        if (!data || !data.labels || !data.labels.length) return;

        const safeMetric = data.series[metric] ? metric : "sessions";
        const currentValues = data.series[safeMetric].current;

        channelTrendChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: metricLabel(safeMetric),
                        data: currentValues,
                        borderColor: color,
                        backgroundColor: color,
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.35
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#181A22",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => (items.length ? data.labels[items[0].dataIndex] : ""),
                            label: (item) => `${item.dataset.label}: ${cfg.format(item.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: colors.textLight }
                    },
                    y: {
                        grid: { color: colors.grid },
                        border: { display: false },
                        ticks: { callback: (v) => cfg.format(v), color: colors.textLight }
                    }
                }
            }
        });
    }

    /* ==========================================================
       New vs Repeat Customers
       Two 100%-stacked bars per month — Orders and Revenue — so
       the order-count split and the revenue split are visible
       side by side rather than needing two separate charts
       mentally cross-referenced. See renderNewRepeatChart below.
    ========================================================== */

    let newRepeatChartInstance = null;

    const NEW_REPEAT_COLORS = {
        newBar: "#2B59FF",
        repeatBar: "#7C4DFF"
    };

    // Mixes a hex color toward white by `amount` (0-1) — used for the
    // Revenue bars' lighter tint (see renderNewRepeatChart). A true
    // lighter shade reads more predictably across light/dark themes
    // and card backgrounds than transparency would, since transparency
    // blends with whatever's behind the bar rather than always
    // producing the same tone.
    function lightenHex(hex, amount) {
        const num = parseInt(hex.replace("#", ""), 16);
        const r = Math.round(((num >> 16) & 0xFF) + (255 - ((num >> 16) & 0xFF)) * amount);
        const g = Math.round(((num >> 8) & 0xFF) + (255 - ((num >> 8) & 0xFF)) * amount);
        const b = Math.round((num & 0xFF) + (255 - (num & 0xFF)) * amount);
        return `rgb(${r}, ${g}, ${b})`;
    }

    // One chart, both lenses at once: for each month, an Orders bar
    // and a Revenue bar sit side by side, each a 100%-stacked
    // New/Repeat split. Orders and Revenue share the same New/Repeat
    // hues — opacity is what tells them apart (Orders solid, Revenue
    // at reduced opacity), so color is reserved entirely for the
    // New-vs-Repeat comparison, which is the thing actually worth
    // comparing here. Grouping both stacks under the same 13 month
    // categories (rather than 26 flat categories) is what gives the
    // native "close together within a month, real gap between
    // months" spacing — Chart.js does that automatically once
    // datasets share a category axis but differ in `stack`.
    function renderNewRepeatChart(rows) {
        const canvas = document.getElementById("newRepeatChart");
        if (!canvas) return;

        if (newRepeatChartInstance) {
            newRepeatChartInstance.destroy();
            newRepeatChartInstance = null;
        }

        if (!rows || !rows.length) return;

        const colors = getChartColors();
        const labels = rows.map((r) => r.period);

        const newOrdersShare = rows.map((r) => {
            const total = r.newOrders + r.repeatOrders;
            return total ? (r.newOrders / total) * 100 : 0;
        });
        const repeatOrdersShare = newOrdersShare.map((v) => 100 - v);

        const newRevenueShare = rows.map((r) => {
            const total = r.newRevenue + r.repeatRevenue;
            return total ? (r.newRevenue / total) * 100 : 0;
        });
        const repeatRevenueShare = newRevenueShare.map((v) => 100 - v);

        const newLabel = window.I18N.t("newRepeat.legendNew");
        const repeatLabel = window.I18N.t("newRepeat.legendRepeat");
        const ordersLabel = window.I18N.t("newRepeat.orders");
        const revenueLabel = window.I18N.t("newRepeat.revenue");

        // Every segment gets a labeled "chip" — a small dark rounded
        // rect behind white text — rather than plain text colored to
        // match whatever's underneath. This guarantees legible
        // contrast regardless of the bar's own color, opacity, or the
        // active theme, and (since the chip doesn't depend on the
        // segment being tall enough to read plain text against) means
        // every segment gets a percentage shown, not just ones above
        // some size cutoff. For a segment too short to contain the
        // chip, the chip is nudged toward the shared boundary with its
        // sibling segment (which, since the two always sum to 100%,
        // necessarily has room) rather than toward the segment's own
        // outer edge, which may have none.
        const segmentLabelPlugin = {
            id: "newRepeatSegmentLabels",
            afterDatasetsDraw(chart) {
                const { ctx, scales } = chart;
                const topPixel = scales.y.getPixelForValue(100);
                const bottomPixel = scales.y.getPixelForValue(0);

                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (meta.hidden) return;
                    meta.data.forEach((bar, index) => {
                        const value = dataset.data[index];
                        if (value == null) return;

                        const segTop = Math.min(bar.y, bar.base);
                        const segBottom = Math.max(bar.y, bar.base);
                        const segHeight = segBottom - segTop;

                        const text = `${Math.round(value)}%`;
                        ctx.font = "700 10px 'IBM Plex Mono', monospace";
                        const chipW = ctx.measureText(text).width + 10;
                        const chipH = 16;

                        let labelY = (segTop + segBottom) / 2;
                        if (segHeight < chipH + 4) {
                            // Which edge of this segment borders its
                            // sibling? The bottom-of-stack segment's
                            // own bottom sits at the axis zero-line
                            // (shared by every bar), so matching that
                            // fixed pixel identifies it; anything else
                            // is the top-of-stack segment, whose own
                            // top sits at the fixed 100%-line instead.
                            const isBottomOfStack = Math.abs(segBottom - bottomPixel) < 1.5;
                            labelY = isBottomOfStack
                                ? segTop + chipH / 2 + 2
                                : segBottom - chipH / 2 - 2;
                            labelY = Math.min(Math.max(labelY, topPixel + chipH / 2 + 2), bottomPixel - chipH / 2 - 2);
                        }

                        ctx.save();
                        ctx.fillStyle = "rgba(18, 20, 28, 0.82)";
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(bar.x - chipW / 2, labelY - chipH / 2, chipW, chipH, 4);
                            ctx.fill();
                        } else {
                            ctx.fillRect(bar.x - chipW / 2, labelY - chipH / 2, chipW, chipH);
                        }
                        ctx.fillStyle = "#FFFFFF";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(text, bar.x, labelY + 0.5);
                        ctx.restore();
                    });
                });
            }
        };

        newRepeatChartInstance = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: `${newLabel} · ${ordersLabel}`,
                        data: newOrdersShare,
                        backgroundColor: NEW_REPEAT_COLORS.newBar,
                        stack: "orders",
                        borderRadius: 3,
                        categoryPercentage: 0.7,
                        barPercentage: 0.9
                    },
                    {
                        label: `${repeatLabel} · ${ordersLabel}`,
                        data: repeatOrdersShare,
                        backgroundColor: NEW_REPEAT_COLORS.repeatBar,
                        stack: "orders",
                        borderRadius: 3,
                        categoryPercentage: 0.7,
                        barPercentage: 0.9
                    },
                    {
                        label: `${newLabel} · ${revenueLabel}`,
                        data: newRevenueShare,
                        backgroundColor: lightenHex(NEW_REPEAT_COLORS.newBar, 0.55),
                        borderColor: NEW_REPEAT_COLORS.newBar,
                        borderWidth: 1.5,
                        stack: "revenue",
                        borderRadius: 3,
                        categoryPercentage: 0.7,
                        barPercentage: 0.9
                    },
                    {
                        label: `${repeatLabel} · ${revenueLabel}`,
                        data: repeatRevenueShare,
                        backgroundColor: lightenHex(NEW_REPEAT_COLORS.repeatBar, 0.55),
                        borderColor: NEW_REPEAT_COLORS.repeatBar,
                        borderWidth: 1.5,
                        stack: "revenue",
                        borderRadius: 3,
                        categoryPercentage: 0.7,
                        barPercentage: 0.9
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        align: "end",
                        labels: { color: colors.text, usePointStyle: true, boxWidth: 8, padding: 16 }
                    },
                    tooltip: {
                        backgroundColor: "#181A22",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: colors.textLight }
                    },
                    y: {
                        stacked: true,
                        min: 0,
                        max: 100,
                        grid: { color: colors.grid },
                        border: { display: false },
                        ticks: { callback: (v) => v + "%", color: colors.textLight }
                    }
                }
            },
            plugins: [segmentLabelPlugin]
        });
    }


    /* ==========================================================
       Average Order Value (AOV) Trend
       Reuses the same monthly New/Repeat rows already loaded for
       the chart above — revenue/orders per bucket, just divided
       into three AOV lines (overall, new, repeat) instead of
       stacked bars, so the pattern behind the AOV-comparison
       insight ("repeat customers spend X% more per order") is
       visible as a trend rather than a single-month snapshot.
    ========================================================== */

    let aovChartInstance = null;

    const AOV_COLORS = {
        overall: "#9498A6",
        newCustomer: "#2B59FF",
        repeatCustomer: "#7C4DFF"
    };

    // visibleMetrics: array of "overall" | "new" | "repeat" — mirrors
    // the main trend chart's visibleMetrics pattern (renderTrendChart
    // above) so both charts behave the same way: an unchecked series
    // isn't just hidden, its dataset is never built at all. Defaults
    // to all three so any caller that hasn't been updated still gets
    // the original behavior.
    function renderAovChart(rows, visibleMetrics = ["overall", "new", "repeat"]) {
        const canvas = document.getElementById("aovChart");
        if (!canvas) return;

        const colors = getChartColors();

        if (aovChartInstance) {
            aovChartInstance.destroy();
            aovChartInstance = null;
        }

        if (!rows || !rows.length || !visibleMetrics || !visibleMetrics.length) return;

        const labels = rows.map((r) => r.period);
        const fmtYenShort = (v) => "¥" + Math.round(v).toLocaleString("en-US");

        const AOV_SERIES = {
            overall: {
                label: window.I18N.t("aov.legendOverall"),
                data: rows.map((r) => (r.totalOrders ? r.totalRevenue / r.totalOrders : 0)),
                color: AOV_COLORS.overall,
                borderWidth: 2.5,
                borderDash: undefined
            },
            new: {
                label: window.I18N.t("aov.legendNew"),
                data: rows.map((r) => (r.newOrders ? r.newRevenue / r.newOrders : 0)),
                color: AOV_COLORS.newCustomer,
                borderWidth: 2,
                borderDash: [5, 4]
            },
            repeat: {
                label: window.I18N.t("aov.legendRepeat"),
                data: rows.map((r) => (r.repeatOrders ? r.repeatRevenue / r.repeatOrders : 0)),
                color: AOV_COLORS.repeatCustomer,
                borderWidth: 2,
                borderDash: [5, 4]
            }
        };

        const datasets = visibleMetrics
            .filter((key) => AOV_SERIES[key])
            .map((key) => {
                const s = AOV_SERIES[key];
                return {
                    label: s.label,
                    data: s.data,
                    borderColor: s.color,
                    backgroundColor: s.color,
                    borderWidth: s.borderWidth,
                    borderDash: s.borderDash,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.35
                };
            });

        aovChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    // Replaced by the custom checkbox toggles above the
                    // chart (#aovMetricToggles, same pattern as the main
                    // trend chart's #metricToggles) — a plain legend
                    // click-to-hide was there before, but wasn't as
                    // discoverable as an explicit checkbox with a label.
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#181A22",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (item) => `${item.dataset.label}: ${fmtYenShort(item.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: colors.textLight }
                    },
                    y: {
                        grid: { color: colors.grid },
                        border: { display: false },
                        ticks: { callback: (v) => fmtYenShort(v), color: colors.textLight }
                    }
                }
            }
        });
    }

    /* ==========================================================
       Rising Landing Page — mini daily chart
       Powers the click-through from the Overview "rising landing
       page" insight: one page's daily sessions across the full
       30-day landing-pages window, with the single standout day
       (from buildRisingLandingPageInsight's z-score check) picked
       out in a different bar color so the eye lands on it
       immediately instead of having to read the x-axis.
    ========================================================== */

    let landingRisingChartInstance = null;

    // onBarClick(date) fires when any bar is clicked — not just the
    // highlighted spike bar — so the breakdown panel (see
    // buildDayPageSourceBreakdown in data.js) works for any day the
    // person is curious about, the spike day included.
    function renderLandingPageMiniChart(canvasId, dailySessions, spikeDate, onBarClick) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const colors = getChartColors();

        if (landingRisingChartInstance) {
            landingRisingChartInstance.destroy();
            landingRisingChartInstance = null;
        }
        if (!dailySessions || !dailySessions.length) return;

        const labels = dailySessions.map((d) => window.I18N.formatDayLabel(d.date));
        const values = dailySessions.map((d) => d.sessions);
        const barColors = dailySessions.map((d) => (d.date === spikeDate ? "#FF5A2E" : "#2B59FF"));

        landingRisingChartInstance = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: metricLabel("sessions"),
                    data: values,
                    backgroundColor: barColors,
                    borderRadius: 4,
                    maxBarThickness: 18
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements) => {
                    if (!onBarClick || !elements || !elements.length) return;
                    const point = dailySessions[elements[0].index];
                    if (point) onBarClick(point.date);
                },
                onHover: (evt, elements) => {
                    if (!onBarClick) return;
                    evt.native.target.style.cursor = elements.length ? "pointer" : "default";
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#181A22",
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (item) => `${metricLabel("sessions")}: ${Math.round(item.parsed.y).toLocaleString("en-US")}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: colors.textLight, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
                    },
                    y: {
                        grid: { color: colors.grid },
                        border: { display: false },
                        ticks: { color: colors.textLight }
                    }
                }
            }
        });
    }

    // Charts created while their tab is hidden (display:none) get stuck
    // at Chart.js's zero-size fallback, since nothing tells them to
    // remeasure once the container becomes visible again. Call this
    // right after a tab switch to fix that.
    function resizeCharts() {
        if (trendChartInstance) trendChartInstance.resize();
        if (newRepeatChartInstance) newRepeatChartInstance.resize();
        if (aovChartInstance) aovChartInstance.resize();
        if (channelTrendChartInstance) channelTrendChartInstance.resize();
        if (landingRisingChartInstance) landingRisingChartInstance.resize();
        Object.values(trafficChartInstances).forEach((chart) => chart.resize());
    }

    THD.charts = {
        renderTrendChart,
        renderTrafficChart,
        renderChannelTrendChart,
        renderNewRepeatChart,
        renderAovChart,
        renderLandingPageMiniChart,
        resizeCharts
    };

})(window.THD);
