/* ==========================================================
   THD Analytics
   Export Utilities (CSV + PDF)
   Version 2.0

   Two independent mechanisms, both kept deliberately dumb here —
   the "what data, which columns, what's in the summary" decisions
   all live in app.js/ui.js, which already have that context:

   1. CSV — generic array-of-objects -> CSV string -> file
      download. Exports the underlying numeric values (not the
      display-formatted strings shown on screen), so the file is
      actually useful to re-open and compute on in a spreadsheet.

   2. PDF — no external library, and no hand-built summary either.
      THD.exportUtil.printCurrentView() just calls window.print();
      css/print.css (loaded with media="print") hides the sidebar
      and action buttons and lets the browser print whichever
      .dashboardView tab is currently active exactly as it looks —
      current filters, toggles, and chart canvases included — since
      that's already real DOM/CSS state, not something that needs
      re-deriving here. The person then uses their browser's own
      print dialog to "Save as PDF".
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    /* ==========================================================
       CSV
    ========================================================== */

    // Wraps a value in quotes (doubling any internal quotes) only
    // when it actually needs it — commas, quotes, or newlines.
    function csvEscape(value) {
        const str = value === null || value === undefined ? "" : String(value);
        if (/[",\n\r]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    // columns: [{ key, header }], rows: array of plain objects.
    // Reads row[key] directly — pass already-computed raw numbers,
    // not display-formatted strings (no ¥, no thousands commas),
    // so the export is actually usable for further calculation.
    function buildCsv(columns, rows) {
        const headerLine = columns.map((c) => csvEscape(c.header)).join(",");
        const lines = (rows || []).map((row) =>
            columns.map((c) => csvEscape(typeof c.value === "function" ? c.value(row) : row[c.key])).join(",")
        );
        return [headerLine, ...lines].join("\r\n");
    }

    // UTF-8 BOM so Excel (still the most likely destination for a
    // team CSV export) correctly detects encoding for Japanese
    // channel/source names instead of showing mojibake.
    function downloadCsv(filename, columns, rows) {
        const csv = buildCsv(columns, rows);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ==========================================================
       PDF (print-to-PDF)
       No hand-built summary — prints the live page as-is. See
       css/print.css for what gets hidden (sidebar, action buttons)
       vs. left alone (whichever .dashboardView tab is currently
       active, with all its current filters/toggles/canvases).
    ========================================================== */

    function printCurrentView() {
        window.print();
    }

    THD.exportUtil = {
        downloadCsv,
        printCurrentView
    };

})(window.THD);
