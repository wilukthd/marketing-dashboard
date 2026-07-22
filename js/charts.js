/* ==========================================================
   THD Analytics
   Chart Rendering
   Version 0.3
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    let trendChartInstance = null;
    let trafficChartInstance = null;

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

    function renderTrendChart(labels, series, visibleMetrics) {

        const canvas = document.getElementById("trendChart");
        if (!canvas) return;

        const colors = getChartColors();

        if (trendChartInstance) {
            trendChartInstance.destroy();
            trendChartInstance = null;
        }

        if (!visibleMetrics || !visibleMetrics.length) return;

        const datasets = visibleMetrics.map((key) => {
            const cfg = METRIC_CONFIG[key];
            return {
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
                yAxisID: `y_${key}`
            };
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
                                const key = visibleMetrics[item.datasetIndex];
                                return `${item.dataset.label}: ${METRIC_CONFIG[key].format(item.parsed.y)}`;
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

    function renderTrafficChart(channels, totalSessions) {

        const canvas = document.getElementById("trafficChart");
        if (!canvas) return [];

        const labels = channels.map((c) => c.label);
        const values = channels.map((c) => c.percent);
        const palette = ["#2563EB", "#16A34A", "#EA580C", "#7C3AED", "#DB2777", "#6B7280"];
        const colors = getChartColors();

        if (trafficChartInstance) {
            trafficChartInstance.destroy();
            trafficChartInstance = null;
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

        trafficChartInstance = new Chart(canvas.getContext("2d"), {
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

        return channels.map((c, i) => ({ ...c, color: palette[i % palette.length] }));
    }

    // Charts created while their tab is hidden (display:none) get stuck
    // at Chart.js's zero-size fallback, since nothing tells them to
    // remeasure once the container becomes visible again. Call this
    // right after a tab switch to fix that.
    function resizeCharts() {
        if (trendChartInstance) trendChartInstance.resize();
        if (trafficChartInstance) trafficChartInstance.resize();
    }

    THD.charts = {
        renderTrendChart,
        renderTrafficChart,
        resizeCharts
    };

})(window.THD);
