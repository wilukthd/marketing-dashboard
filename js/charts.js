/* ==========================================================
   THD Analytics
   Chart Rendering
   Version 0.3
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    let trendChartInstance = null;
    const trafficChartInstances = {}; // keyed by canvas id, since current/previous each get their own doughnut

    // Read fresh at render time (not cached) so charts pick up the
    // right palette whether they're being created for the first time
    // or re-rendered after a dark/light theme toggle.
    function getChartColors() {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        return {
            grid: dark ? "#334155" : "#F1F5F9",
            textLight: dark ? "#94A3B8" : "#6B7280",
            text: dark ? "#F1F5F9" : "#111827",
            surface: dark ? "#1E293B" : "#FFFFFF"
        };
    }

    // Colors match each metric's KPI card accent, so the chart
    // and the cards above it read as the same visual language.
    // Hues spread ~72° apart around the wheel (blue / orange / green /
    // magenta / purple) so no two lines read as "the same color family"
    // when several are stacked together — unlike the old cyan+blue pair.
    const METRIC_CONFIG = {
        users: { label: "Total Users", color: "#2563EB", format: (v) => Math.round(v).toLocaleString("en-US") },
        sessions: { label: "Sessions", color: "#EA580C", format: (v) => Math.round(v).toLocaleString("en-US") },
        purchases: { label: "Ecommerce Purchases", color: "#16A34A", format: (v) => Math.round(v).toLocaleString("en-US") },
        revenue: { label: "Total Revenue", color: "#DB2777", format: (v) => "¥" + Math.round(v).toLocaleString("en-US") },
        cvr: { label: "CVR", color: "#7C3AED", format: (v) => v.toFixed(2) + "%" }
    };

    Chart.defaults.font.family = "'Inter', sans-serif";

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
                label: cfg.label,
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
                    label: `${cfg.label} · 7-day avg`,
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
                        backgroundColor: "#111827",
                        padding: 12,
                        cornerRadius: 10,
                        callbacks: {
                            label: (item) => {
                                const key = item.dataset.metricKey;
                                const cfg = METRIC_CONFIG[key];
                                const suffix = item.dataset.isTrendline ? " (7-day avg)" : "";
                                return `${cfg.label}${suffix}: ${cfg.format(item.parsed.y)}`;
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
        "#2563EB", "#16A34A", "#EA580C", "#7C3AED", "#DB2777", "#0891B2",
        "#CA8A04", "#DC2626", "#4F46E5", "#059669", "#9333EA", "#6B7280"
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

        const labels = channels.map((c) => c.label);
        const values = channels.map((c) => c.percent);
        const palette = labels.map(colorForLabel);
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
                ctx.fillText("Sessions", cx, cy + 12);
                ctx.restore();
            }
        };

        trafficChartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: labels,
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
                        backgroundColor: "#111827",
                        padding: 12,
                        cornerRadius: 10,
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
       New vs Repeat Customers
       Stacked bars (New / Repeat, in whichever metric — orders or
       revenue — is selected) with a "New Customer Share" line on
       its own 0-100% axis, so both the absolute mix and the trend
       in acquisition-vs-retention balance read at a glance.
    ========================================================== */

    let newRepeatChartInstance = null;

    const NEW_REPEAT_COLORS = {
        newBar: "#2563EB",
        repeatBar: "#94A3B8",
        pctLine: "#16A34A"
    };

    function formatNewRepeatValue(v, isRevenue) {
        return isRevenue
            ? "¥" + Math.round(v).toLocaleString("en-US")
            : Math.round(v).toLocaleString("en-US");
    }

    function renderNewRepeatChart(rows, metric) {
        const canvas = document.getElementById("newRepeatChart");
        if (!canvas) return;

        const colors = getChartColors();
        const isRevenue = metric === "revenue";

        if (newRepeatChartInstance) {
            newRepeatChartInstance.destroy();
            newRepeatChartInstance = null;
        }

        if (!rows || !rows.length) return;

        const labels = rows.map((r) => r.period);
        const newValues = rows.map((r) => (isRevenue ? r.newRevenue : r.newOrders));
        const repeatValues = rows.map((r) => (isRevenue ? r.repeatRevenue : r.repeatOrders));
        const newShare = rows.map((r) => {
            const newV = isRevenue ? r.newRevenue : r.newOrders;
            const repeatV = isRevenue ? r.repeatRevenue : r.repeatOrders;
            const total = newV + repeatV;
            return total ? (newV / total) * 100 : 0;
        });

        newRepeatChartInstance = new Chart(canvas.getContext("2d"), {
            data: {
                labels,
                datasets: [
                    {
                        type: "bar",
                        label: "New",
                        data: newValues,
                        backgroundColor: NEW_REPEAT_COLORS.newBar,
                        stack: "total",
                        yAxisID: "yValue",
                        borderRadius: 4,
                        maxBarThickness: 40
                    },
                    {
                        type: "bar",
                        label: "Repeat",
                        data: repeatValues,
                        backgroundColor: NEW_REPEAT_COLORS.repeatBar,
                        stack: "total",
                        yAxisID: "yValue",
                        borderRadius: 4,
                        maxBarThickness: 40
                    },
                    {
                        type: "line",
                        label: "New Customer Share",
                        data: newShare,
                        borderColor: NEW_REPEAT_COLORS.pctLine,
                        backgroundColor: NEW_REPEAT_COLORS.pctLine,
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.35,
                        yAxisID: "yPct",
                        order: 0
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
                        backgroundColor: "#111827",
                        padding: 12,
                        cornerRadius: 10,
                        callbacks: {
                            label: (item) => item.dataset.yAxisID === "yPct"
                                ? `${item.dataset.label}: ${item.parsed.y.toFixed(1)}%`
                                : `${item.dataset.label}: ${formatNewRepeatValue(item.parsed.y, isRevenue)}`
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: colors.textLight }
                    },
                    yValue: {
                        stacked: true,
                        position: "left",
                        grid: { color: colors.grid },
                        border: { display: false },
                        ticks: { callback: (v) => formatNewRepeatValue(v, isRevenue), color: colors.textLight }
                    },
                    yPct: {
                        position: "right",
                        min: 0,
                        max: 100,
                        grid: { display: false },
                        border: { display: false },
                        ticks: { callback: (v) => v + "%", color: colors.textLight }
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
        Object.values(trafficChartInstances).forEach((chart) => chart.resize());
    }

    THD.charts = {
        renderTrendChart,
        renderTrafficChart,
        renderNewRepeatChart,
        resizeCharts
    };

})(window.THD);
