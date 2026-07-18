/* ==========================================================
   THD Analytics
   Chart Rendering
   Version 0.3
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    let trendChartInstance = null;
    let trafficChartInstance = null;

    const COLORS = {
        grid: "#F1F5F9",
        textLight: "#6B7280"
    };

    // Colors match each metric's KPI card accent, so the chart
    // and the cards above it read as the same visual language.
    const METRIC_CONFIG = {
        users: { label: "Total Users", color: "#06B6D4", format: (v) => Math.round(v).toLocaleString("en-US") },
        sessions: { label: "Sessions", color: "#8B5CF6", format: (v) => Math.round(v).toLocaleString("en-US") },
        purchases: { label: "Ecommerce Purchases", color: "#10B981", format: (v) => Math.round(v).toLocaleString("en-US") },
        revenue: { label: "Total Revenue", color: "#2563EB", format: (v) => "¥" + Math.round(v).toLocaleString("en-US") },
        cvr: { label: "CVR", color: "#F59E0B", format: (v) => v.toFixed(2) + "%" }
    };

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = COLORS.textLight;

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
                ticks: { maxTicksLimit: 8 }
            }
        };

        visibleMetrics.forEach((key, i) => {
            const cfg = METRIC_CONFIG[key];
            scales[`y_${key}`] = {
                position: i % 2 === 0 ? "left" : "right",
                display: i < 2,
                grid: { display: i === 0, color: COLORS.grid },
                border: { display: false },
                ticks: { callback: (v) => cfg.format(v) }
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

    function renderTrafficChart(labels, values) {

        const canvas = document.getElementById("trafficChart");
        if (!canvas) return;

        const palette = ["#2563EB", "#10B981", "#F59E0B", "#06B6D4", "#8B5CF6", "#EF4444"];

        if (trafficChartInstance) {
            trafficChartInstance.destroy();
            trafficChartInstance = null;
        }

        trafficChartInstance = new Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: palette,
                    borderColor: "#FFFFFF",
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
            }
        });

        return labels.map((label, i) => ({ label, color: palette[i % palette.length] }));
    }

    THD.charts = {
        renderTrendChart,
        renderTrafficChart
    };

})(window.THD);
