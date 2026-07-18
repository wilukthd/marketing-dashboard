/* ==========================================================
   THD Analytics
   Chart Rendering
   Version 0.2
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    let trendChartInstance = null;
    let trafficChartInstance = null;

    const COLORS = {
        blue: "#2563EB",
        orange: "#F59E0B",
        cyan: "#06B6D4",
        green: "#10B981",
        violet: "#8B5CF6",
        red: "#EF4444",
        grid: "#F1F5F9",
        textLight: "#6B7280"
    };

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = COLORS.textLight;

    /* ==========================================================
       Trend Chart
       Dual-line: Total Users (left axis) vs Ecommerce
       Purchases (right axis) — mirrors the GA4 report.
    ========================================================== */

    function renderTrendChart(labels, users, purchases) {

        const canvas = document.getElementById("trendChart");
        if (!canvas) return;

        if (trendChartInstance) {
            trendChartInstance.data.labels = labels;
            trendChartInstance.data.datasets[0].data = users;
            trendChartInstance.data.datasets[1].data = purchases;
            trendChartInstance.update();
            return;
        }

        trendChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Total Users",
                        data: users,
                        borderColor: COLORS.blue,
                        backgroundColor: COLORS.blue,
                        borderWidth: 2.5,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: COLORS.blue,
                        pointHoverBorderColor: "#fff",
                        pointHoverBorderWidth: 2,
                        tension: 0.35,
                        yAxisID: "yUsers"
                    },
                    {
                        label: "Ecommerce Purchases",
                        data: purchases,
                        borderColor: COLORS.orange,
                        backgroundColor: COLORS.orange,
                        borderWidth: 2.5,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: COLORS.orange,
                        pointHoverBorderColor: "#fff",
                        pointHoverBorderWidth: 2,
                        tension: 0.35,
                        yAxisID: "yPurchases"
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
                        backgroundColor: "#111827",
                        padding: 12,
                        cornerRadius: 10
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 8 }
                    },
                    yUsers: {
                        position: "left",
                        grid: { color: COLORS.grid },
                        border: { display: false },
                        ticks: { callback: (v) => Math.round(v).toLocaleString("en-US") }
                    },
                    yPurchases: {
                        position: "right",
                        grid: { display: false },
                        border: { display: false },
                        ticks: { callback: (v) => Math.round(v) }
                    }
                }
            }
        });
    }

    /* ==========================================================
       Traffic Sources (doughnut)
    ========================================================== */

    function renderTrafficChart(labels, values) {

        const canvas = document.getElementById("trafficChart");
        if (!canvas) return;

        const palette = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.cyan, COLORS.violet, COLORS.red];

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
