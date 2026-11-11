/* ==========================================================
   THD Analytics
   i18n (English / 日本語)
   Version 1.0

   Loaded before every other script (see index.html) since
   ui.js/data.js/charts.js/app.js all read window.I18N at
   render time. Language is persisted in localStorage and
   defaults to Japanese, since the underlying business/data
   (WEB本店) is Japanese.

   Two kinds of text in this dashboard:
   1. Static HTML strings (nav labels, headers, table headers,
      buttons) — swapped via [data-i18n] attributes + applyStatic().
   2. JS-generated text (insights sentences, chart legends,
      channel names, formatted dates) — functions elsewhere call
      I18N.t() / I18N.channelLabel() / I18N.formatMonth() etc.
      directly at render time, so no separate wiring is needed
      per string.
========================================================== */

window.I18N = (function () {

    const LANG_KEY = "thd-lang";
    const DEFAULT_LANG = "ja";

    /* ==========================================================
       Static UI strings
    ========================================================== */

    const STRINGS = {
        en: {
            "doc.title": "THD Analytics Dashboard",
            "logo.subtitle": "Analytics",
            "gate.label": "Enter passcode to continue",
            "gate.submit": "Unlock",
            "gate.error": "Incorrect passcode — try again.",
            "gate.errorNoCrypto": "Can't verify the passcode here — this page needs to be opened over HTTPS or localhost, not as a local file.",

            "nav.traffic": "Traffic",
            "nav.sales": "Sales",
            "nav.notes": "Notes",
            "nav.settings": "Settings",

            "header.overview.title": "Dashboard Overview",
            "header.overview.subtitle": "Marketing performance at a glance",
            "header.traffic.title": "Traffic",
            "header.traffic.subtitle": "Where sessions are coming from",
            "header.sales.title": "Sales",
            "header.sales.subtitle": "Revenue, orders, and repeat purchase performance",
            "header.notes.title": "Notes",
            "header.notes.subtitle": "Remarks and discussion history",
            "header.settings.title": "Settings",
            "header.settings.subtitle": "Dashboard preferences",

            "header.dataAsOf": "Data through",
            "header.refreshTitle": "Check for new data (the sheet updates about hourly)",
            "refresh.updated": "Loaded new data — now through {date}.",
            "refresh.noNew": "No new data yet (latest: {date}). The sheet updates about once an hour.",
            "refresh.failed": "Couldn't reach some of the data — still showing the last data that loaded.",
            "header.refresh": "Refresh",
            "header.exportPdf": "Export PDF",
            "export.csv": "Export CSV",

            "filter.today": "Today",
            "filter.yesterday": "Yesterday",
            "filter.7d": "Last 7 Days",
            "filter.14d": "Last 14 Days",
            "filter.30d": "Last 30 Days",
            "filter.month": "This Month",
            "filter.lastMonth": "Last Month",
            "filter.3m": "3 Months",
            "filter.6m": "6 Months",
            "filter.year": "This Year",
            "filter.lastYear": "Last Year",
            "filter.custom": "Custom Range",
            "filter.apply": "Apply",
            "filter.allSources": "All Sources",
            "filter.comparePrevious": "Compare Previous",
            "filter.compareYoy": "Compare Same Period Last Year",

            "rangeCompare.lookingAt": "Looking at",
            "rangeCompare.vsPrevious": "vs previous period",
            "rangeCompare.vsYoy": "vs same period last year",
            "rangeCompare.noCompareData": "No comparison data available for {start} – {end} (outside the available data range)",
            "kpi.noCompareData": "N/A",

            "kpi.totalUsers": "Users (daily sum)",
            "kpi.sessions": "Sessions",
            "kpi.purchases": "Ecommerce Purchases",
            "kpi.revenue": "Total Revenue",
            "kpi.cvr": "CVR",
            "trend.movingAvg": "Show 7-day moving average",
            "trend.movingAvgSuffix": " (7-day avg)",

            "traffic.title": "Traffic Sources",
            "traffic.subtitle": "Channel → platform → source. ▸ opens a row; click a row to see its trend and sources",
            "traffic.smallSources": "Small sources ({n})",
            "traffic.showMore": "Show {n} more",
            "traffic.expand": "Show breakdown",
            "traffic.collapse": "Hide breakdown",
            "traffic.internalCvrHint": "Own sites and payment pages: these sessions are mid-checkout, so their CVR isn't a channel metric",
            "traffic.selectedPeriod": "Selected period:",
            "traffic.backToOverview": "Back to Overview",
            "traffic.previousPeriod": "Previous period:",
            "traffic.centerLabel": "Sessions",
            "traffic.clickHint": "Click to see the sources behind {label} below",
            "traffic.new": "New",
            "traffic.empty": "No traffic data for this period.",

            "th.source": "Source",
            "th.sessionsCurrent": "Sessions (Current)",
            "th.sessionsPrevious": "Sessions (Previous)",
            "th.deltaVsPrevious": "Δ vs Previous",
            "th.revenueCurrent": "Revenue (Current)",
            "th.cvrCurrent": "CVR (Current)",

            "landing.title": "Top Landing Pages",
            "landing.allDevices": "All Devices",
            "landing.pc": "PC",
            "landing.smartphone": "Smartphone",
            "landing.tablet": "Tablet",
            "landing.fixedWindow": "Fixed 30-day window: {start} – {end}",
            "landing.sessionsUnit": "sessions",
            "landing.hideSystem": "Hide login/checkout/system pages",
            "landingInsights.heading": "Insights",

            "landingInsight.rising": "{title}'s sessions grew {figure} in the second half of the last 30 days vs. the first half.",
            "landingInsight.cooling": "{title}'s sessions dropped {figure} in the second half of the last 30 days vs. the first half.",
            "landingInsight.deviceMismatch": "{title} skews toward {device}: {figure} of its sessions vs {site} site-wide.",
            "landingInsight.spike": "{title} had an unusually high {figure} sessions on {date}, compared to its typical {mean} per day.",
            "landingInsight.spikeToday": "{title} is spiking today — {figure} sessions vs. a typical {mean}.",
            "landingInsight.spikeYesterday": "{title} spiked yesterday — {figure} sessions vs. a typical {mean}.",
            "landingInsight.spikeOn": "{title} spiked on {date} — {figure} sessions vs. a typical {mean}.",
            "landingInsight.overviewRising": "📈 {title} is up {figure} over the last 7 days ({previous} → {current} sessions vs. the 7 days before).",
            "landing.empty": "No landing page data for this window.",
            "landing.notSet": "(not set)",

            "landing.risingPanelTitle": "Rising Page Detected",
            "landing.pageDetailTitle": "Page Detail",
            "landing.risingPanelWeek": "{current} sessions this week vs. {previous} last week ({figure})",
            "landing.risingPanelWeekNew": "{current} sessions this week (no data last week to compare)",
            "landing.spikePanelTitle": "Sudden Spike Detected",
            "landing.spikePanelSummary": "{current} sessions on {date} — typical day: {baseline} ({figure})",
            "landing.risingPanelSpike": "Biggest single-day jump: {date} — {value} sessions (typical day: ~{mean})",
            "landing.risingPanelClose": "Close",

            "landing.sourceBreakdownTitle": "Where the sessions came from",
            "landing.sourceBreakdownHint": "Click any bar above to see that day's source breakdown.",
            "landing.sourceBreakdownEmpty": "No source breakdown available for this day.",

            "landing.sourceDetailSource": "Source / Medium",
            "landing.sourceDetailSessions": "Sessions",
            "landing.sourceDetailPurchases": "Purchases",
            "landing.sourceDetailRevenue": "Revenue",
            "landing.sourceDetailCvr": "CVR",
            "landing.sourceDetailEmpty": "No detail available for this group.",

            "insights.title": "Key Insights",
            "insights.empty": "Not enough data yet to generate insights for this period.",
            "insights.topLandingTitle": "Top Landing Pages Insights",

            "source.title": "Session Source / Medium",
            "source.filteredBy": "Filtered by",
            "source.clear": "Clear",
            "source.showAll": "Show All",
            "source.showAllCount": "Show All ({n})",
            "source.showLess": "Show Less",
            "source.emptyFilter": "No sources match this filter for the selected period.",

            "th.sourceMediumCol": "Session Source / Medium",
            "th.sessions": "Sessions",
            "th.totalUsers": "Users (daily sum)",
            "th.ecommercePurchases": "Ecommerce Purchases",
            "th.totalRevenue": "Total Revenue",
            "th.cvr": "CVR",

            "monthly.title": "Monthly Business Performance",
            "th.month": "Month",
            "th.revenue": "Revenue",
            "th.orders": "Orders",
            "th.users": "Users",
            "th.trend": "Trend",
            "newRepeat.orders": "Orders",
            "newRepeat.revenue": "Revenue",
            "newRepeat.legendNew": "New",
            "newRepeat.legendRepeat": "Repeat",

            "aov.title": "Average Order Value Trend",
            "aov.subtitle": "Overall vs. new vs. repeat customers, by business month",
            "aov.legendOverall": "Overall AOV",
            "aov.legendNew": "New Customer AOV",
            "aov.legendRepeat": "Repeat Customer AOV",

            "newRepeatInsights.title": "New vs Repeat Insights",
            "newRepeatInsights.empty": "Not enough history yet for a pattern here.",

            "newRepeat.tableTitle": "WEB本店 新規／リピータ",
            "newRepeat.source": "Last 12 months — Source: {link} for full history since 2021",
            "newRepeat.sourceLinkText": "Spreadsheet",
            "th.year": "Year",
            "th.totalOrders": "Total Orders",
            "th.newRevenue": "New Revenue",
            "th.newOrders": "New Orders",
            "th.repeatRevenue": "Repeat Revenue",
            "th.repeatOrders": "Repeat Orders",
            "th.visitorsPc": "Visitors: PC",
            "th.visitorsSp": "Visitors: SP",
            "th.visitorsTotal": "Visitors: Total",

            "notes.title": "Team Notes",
            "notes.subtitle": "Jot down remarks from a discussion, a product observation, or anything worth remembering — visible to the whole team, synced across devices.",
            "notes.placeholder": "e.g. Discussed re-pricing the SP-14 bundle after the Q3 review — revisit next month.",
            "notes.yourName": "Your name",
            "notes.anonymous": "Anonymous",
            "notes.addNote": "Add Note",
            "notes.history": "History",
            "notes.empty": "No notes yet — add one above.",
            "notes.notConfigured": "Notes aren't connected yet — ask your admin to finish the Firebase setup.",
            "notes.showArchived": "Show Archived",
            "notes.showArchivedCount": "Show Archived ({n})",
            "notes.backToNotes": "Back to Notes",
            "notes.archivedTitle": "Archived",
            "notes.archivedEmpty": "No archived notes.",
            "notes.archiveTitle": "Archive note",
            "notes.restoreTitle": "Restore note",
            "notes.deleteForeverTitle": "Delete forever",
            "notes.deleteForeverConfirm": "Permanently delete this note? This can't be undone.",
            "notes.catGeneral": "General",
            "notes.catTraffic": "Traffic",
            "notes.catSales": "Sales",
            "notes.catProduct": "Product",
            "notes.catBug": "Bug",
            "notes.catIdea": "Idea",

            "settings.appearance": "Appearance",
            "settings.darkTheme": "Dark theme",
            "settings.darkThemeDesc": "Switch the dashboard to a dark color scheme. Saved on this device.",
            "settings.language": "Language",
            "settings.languageDesc": "Choose the display language for the dashboard. Saved on this device.",
            "settings.comingSoon": "More settings coming soon",
            "settings.comingSoonDesc": "Account, data source, and notification preferences will live here.",
            "settings.goalsSaved": "Saved.",
            "settings.goalsError": "Couldn't save — check your connection and try again.",
            "goal.progress": "{percent}% of {target} target",

            "dataWarning.prefix": "Showing demo data for: {list} — the live data source(s) didn't load. Numbers in these sections aren't real.",
            "dataWarning.daily": "Overview & Monthly Performance",
            "dataWarning.sources": "Traffic Sources",
            "dataWarning.landingPages": "Top Landing Pages",
            "dataWarning.newRepeat": "New vs Repeat & AOV",
            "dataWarning.adSpend": "Ads Performance (spend)",
            "dataWarning.transactions": "Ads Performance (transactions)",

            "th.overallRevenue": "Total Revenue",

            "unit.pts": "pts",

            "insight.revenueChange": "Revenue {direction} by {figure} compared to the previous period.",
            "insight.increased": "increased",
            "insight.decreased": "decreased",
            "insight.topChannelRevenue": "{label} generated {figure} of total revenue.",
            "insight.notSetShare": "{figure} of sessions have no attribution data {notSet}.",
            "insight.moverChange": "{label} {direction} by {figure}.",
            "insight.cvrChange": "Conversion rate {direction} to {figure} this period.",
            "insight.cvrImproved": "improved",
            "insight.cvrDeclined": "declined",
            "insight.mover.users": "User traffic",
            "insight.mover.sessions": "Session traffic",
            "insight.mover.purchases": "Purchases",

            "newRepeatInsight.newShareYoy": "New customers made up {share} of orders in {period}, {direction} {figure} year-over-year.",
            "newRepeatInsight.newShare": "New customers made up {share} of orders in {period}.",
            "newRepeatInsight.up": "up",
            "newRepeatInsight.down": "down",
            "newRepeatInsight.repeatRevenueShare": "Repeat customers generated {figure} of total revenue in {period}.",
            "newRepeatInsight.aovSame": "New and repeat customers spent about the same per order this month (¥{higher} vs ¥{lower}).",
            "newRepeatInsight.aovDiff": "{who} customers spend {figure} more per order than {otherWho} customers this month (¥{higher} vs ¥{lower}).",
            "newRepeatInsight.repeat": "Repeat",
            "newRepeatInsight.new": "New",
            "newRepeatInsight.repeatLower": "repeat",
            "newRepeatInsight.newLower": "new",
            "newRepeatInsight.trend": "New customer share has been {direction} over the last 3 months ({figure} vs the prior 3).",
            "newRepeatInsight.trendingUp": "trending up",
            "newRepeatInsight.trendingDown": "trending down",

            "anomaly.spike": "spiked",
            "anomaly.drop": "dropped",
            "anomaly.sentence": "{metric} {verb} on {date} ({figure} vs a typical {mean} for this period).",
            "nav.overview": "Briefing",
            "brief.kickerRange": "Briefing · {start} – {end}",
            "brief.kickerCompare": "vs {start} – {end}",
            "brief.kickerYoy": "vs same dates last year ({start} – {end})",
            "brief.kickerPartial": "Today is still being counted — numbers will change.",
            "brief.dataAsOf": "Data through {date}",
            "brief.headline.up": "Revenue {revenue}, {delta} {vs}.",
            "brief.headline.down": "Revenue {revenue}, {delta} {vs}.",
            "brief.vs.prev": "on the previous period",
            "brief.vs.yoy": "on the same period last year",
            "brief.vital.partial": "in progress",
            "brief.vital.onChart": "on chart",
            "brief.kicker.drivers": "Why it moved",
            "brief.kicker.risk": "Risk",
            "brief.kicker.customers": "Customers",
            "brief.dek.decomp": "traffic {sessions}, CVR {cvr}, order value {aov}",
            "brief.dek.yoy": "{pct} vs last year",
            "brief.day.bodyDow": "{value} vs a typical {mean} for that weekday.",
            "brief.drivers.cvrDragTitle": "More traffic added {sess}, but lower CVR took {cvr} back",
            "brief.drivers.body": "Revenue change {total} = traffic {s} + CVR {c} + order value {a}.",
            "brief.drivers.leadDownTitle": "Revenue fell mainly through {name} ({amount})",
            "brief.drivers.leadUpTitle": "Revenue grew mainly through {name} ({amount})",
            "brief.drivers.name.sessions": "traffic",
            "brief.drivers.name.cvr": "conversion rate",
            "brief.drivers.name.aov": "order value",
            "brief.lowyield.title": "{label}: +{sessions} sessions, but only {revenue} more revenue",
            "brief.lowyield.fellTitle": "{label}: +{sessions} sessions, yet revenue fell {revenue}",
            "brief.lowyield.body": "CVR {prev}% → {cur}%. Net revenue change per net added session: {perSession} (site average {sitePerSession} per session).",
            "brief.contrib.title": "{label} drove the change ({amount} of {total})",
            "brief.contrib.body": "Up: {up}. Down: {down}.",
            "brief.contrib.item": "{label} {amount}",
            "brief.concentration.title": "{share}% of revenue depends on {label}",
            "brief.concentration.note": "{label} also accounts for {share}% of revenue — a watch point, not a verdict.",
            "brief.moreStories": "Show {n} more",
            "brief.concentration.body": "A change in this one channel (budget, policy, algorithm) would move total revenue sharply. Next largest: {next} at {nextShare}%.",
            "brief.customers.downTitle": "New customers below last year in {n} of {total} months",
            "brief.customers.upTitle": "New customers above last year in {n} of {total} months",
            "brief.customers.body": "Latest closed month ({month}): {cur} new-customer orders vs {ly} a year ago.",
            "customers.title": "Customer flow",
            "customers.subtitle": "New-customer and repeat orders by business month (closes on the 20th)",
            "customers.newTitle": "New-customer orders",
            "customers.repeatTitle": "Repeat-customer orders",
            "customers.thisYear": "This year",
            "customers.lastYear": "Last year",
            "customers.lastYearSame": "Same month last year",
            "customers.howToRead": "Each number is the change vs the same month last year: green above = more, red below = fewer.",
            "customers.newLabel": "New customers",
            "customers.newDesc": "First-time buyers · orders per month",
            "customers.repeatLabel": "Repeat customers",
            "customers.repeatDesc": "Returning buyers (2nd order or later) · orders per month",
            "customers.statShare": "New share of orders",
            "customers.vsLy": "{pct} vs last year ({value})",
            "customers.vsLyPts": "{pts}pt vs last year",
            "customers.noteDrop": "{month}: new customers {pct} vs the same month last year ({prev} → {cur})",
            "customers.notePeak": "{month}: the peak for new customers ({value} orders)",
            "customers.noteYoy": "{month}: new customers {pct} vs the same month last year",
            "customers.noteOpen": "{month} is still open (closes on the 20th) — shown faded",
            "customers.noteStreakDown": "New customers were below last year in {n} of the last {total} months",
            "customers.noteStreakUp": "New customers were above last year in {n} of the last {total} months",
            "brief.headline.flat": "Revenue {revenue} for this period.",
            "brief.headline.empty": "No data for this period yet.",
            "brief.dek.topChannel": "{label} brought in {share}% of revenue",
            "brief.dek.drivers": "orders {orders}, order value {aov}",
            "brief.dek.watch": "watch: {title}",
            "brief.dek.sep": " · ",
            "brief.feedTitle": "What changed",
            "brief.feedSub": "Ranked by how much it needs your attention",
            "brief.feedEmpty": "Nothing unusual this period — a quiet one.",
            "brief.trendTitle": "The numbers behind it",
            "brief.allInsights": "Every insight, as a list",
            "brief.open": "Dig in",
            "brief.tone.alert": "Fix",
            "brief.tone.bad": "Watch",
            "brief.tone.good": "Good news",
            "brief.tone.info": "FYI",
            "brief.vital.users": "Users",
            "brief.vital.sessions": "Sessions",
            "brief.vital.purchases": "Orders",
            "brief.vital.revenue": "Revenue",
            "brief.vital.cvr": "CVR",
            "brief.vital.aov": "Order value",
            "brief.vital.target": "target {target}",
            "brief.vital.new": "new",
            "brief.vital.hint": "Click to show/hide on the chart",
            "brief.kicker.tracking": "Tracking",
            "brief.kicker.conversion": "Conversion",
            "brief.kicker.channel": "Channel",
            "brief.kicker.day": "Single day",
            "brief.kicker.basket": "Basket",
            "brief.kicker.page": "Landing page",
            "brief.tracking.jumpTitle": "Unattributed traffic jumped from {prev} to {cur} sessions",
            "brief.tracking.shareTitle": "{share}% of sessions have no source",
            "brief.tracking.body": "{share}% of this period's sessions can't be traced to a channel — every channel's numbers are understated by that much. Usually broken UTMs, cross-domain checkout, or consent mode. Worth checking first.",
            "brief.cvr.belowTitle": "CVR is {cvr}% — below the {target}% target",
            "brief.cvr.aboveTitle": "CVR is {cvr}%, above the {target}% target",
            "brief.cvr.body": "{pts}pt {vs}.",
            "brief.weak.title": "{label}: traffic that isn't buying ({cvr}% CVR)",
            "brief.weak.body": "{sessions} sessions but only {revenue} in revenue — well under the site's {site}% CVR. Check targeting and the landing page it sends people to.",
            "brief.weak.bodyGrowing": "Sessions grew {growth} to {sessions}, but revenue is only {revenue} — well under the site's {site}% CVR. More spend here isn't turning into orders.",
            "brief.strong.title": "{label} converts at {cvr}%",
            "brief.strong.body": "Over twice the site's {site}% CVR, worth {revenue} ({share}% of revenue). A candidate for more investment.",
            "brief.day.spikeTitle": "{metric} spiked on {date}",
            "brief.day.dropTitle": "{metric} dropped on {date}",
            "brief.chDay.spikeTitle": "{label} spiked on {date}",
            "brief.chDay.dropTitle": "{label} dropped on {date}",
            "brief.day.body": "{value} vs a typical {mean} for this period.",
            "brief.day.drivers": "Driven by {list}.",
            "brief.day.driverItem": "{label} ({mean} → {value} sessions)",
            "brief.aov.upTitle": "Average order value {pct}",
            "brief.aov.downTitle": "Average order value {pct}",
            "brief.aov.body": "{prev} → {cur} per order. Revenue moved more than order count did.",
            "brief.rise.title": "{title} is taking off",
            "brief.rise.body": "{prev} → {cur} sessions, last 7 days vs the 7 before.",
            "brief.spikes.oneTitle": "{title} spiked in the latest data",
            "brief.spikes.manyTitle": "{n} pages spiked in the latest data",
            "brief.spikes.item": "{title} — {value} sessions (usually {mean})"
        },
        ja: {
            "doc.title": "THDアナリティクス ダッシュボード",
            "logo.subtitle": "アナリティクス",
            "gate.label": "パスコードを入力してください",
            "gate.submit": "開く",
            "gate.error": "パスコードが正しくありません。もう一度お試しください。",
            "gate.errorNoCrypto": "この環境ではパスコードを確認できません — このページはローカルファイルではなく、HTTPSまたはlocalhost経由で開く必要があります。",

            "nav.traffic": "トラフィック",
            "nav.sales": "売上",
            "nav.notes": "メモ",
            "nav.settings": "設定",

            "header.overview.title": "ダッシュボード概要",
            "header.overview.subtitle": "マーケティング成果を一目で確認",
            "header.traffic.title": "トラフィック",
            "header.traffic.subtitle": "セッションの流入経路",
            "header.sales.title": "売上",
            "header.sales.subtitle": "売上・受注・リピート購入の実績",
            "header.notes.title": "メモ",
            "header.notes.subtitle": "議事メモの履歴",
            "header.settings.title": "設定",
            "header.settings.subtitle": "ダッシュボードの環境設定",

            "header.dataAsOf": "データ最新日",
            "header.refreshTitle": "新しいデータを確認（シートは約1時間ごとに更新）",
            "refresh.updated": "新しいデータを取り込みました（{date}まで）。",
            "refresh.noNew": "新しいデータはまだありません（最新：{date}）。シートは約1時間ごとに更新されます。",
            "refresh.failed": "一部のデータを取得できませんでした。前回読み込んだデータを表示しています。",
            "header.refresh": "更新",
            "header.exportPdf": "PDF出力",
            "export.csv": "CSVを出力",

            "filter.today": "今日",
            "filter.yesterday": "昨日",
            "filter.7d": "過去7日間",
            "filter.14d": "過去14日間",
            "filter.30d": "過去30日間",
            "filter.month": "今月",
            "filter.lastMonth": "先月",
            "filter.3m": "過去3ヶ月",
            "filter.6m": "過去6ヶ月",
            "filter.year": "今年",
            "filter.lastYear": "昨年",
            "filter.custom": "期間を指定",
            "filter.apply": "適用",
            "filter.allSources": "すべての流入元",
            "filter.comparePrevious": "前期間と比較",
            "filter.compareYoy": "前年同期間と比較",

            "rangeCompare.lookingAt": "対象期間：",
            "rangeCompare.vsPrevious": "前期間と比較",
            "rangeCompare.vsYoy": "前年同期間と比較",
            "rangeCompare.noCompareData": "{start} – {end} の比較データが見つかりません（データ範囲外）",
            "kpi.noCompareData": "対象外",

            "kpi.totalUsers": "延べユーザー数",
            "kpi.sessions": "セッション数",
            "kpi.purchases": "EC購入数",
            "kpi.revenue": "総売上",
            "kpi.cvr": "CVR（購入率）",
            "trend.movingAvg": "7日移動平均を表示",
            "trend.movingAvgSuffix": "（7日移動平均）",

            "traffic.title": "トラフィック獲得経路",
            "traffic.subtitle": "チャネル → プラットフォーム → 参照元。▸で内訳を開き、行をクリックで推移と参照元を表示",
            "traffic.smallSources": "少数の流入元（{n}）",
            "traffic.showMore": "さらに{n}件を表示",
            "traffic.expand": "内訳を表示",
            "traffic.collapse": "内訳を閉じる",
            "traffic.internalCvrHint": "自社サイト・決済ページ：購入手続きの途中のセッションのため、CVRはチャネルの指標になりません",
            "traffic.selectedPeriod": "選択期間：",
            "traffic.backToOverview": "概要に戻る",
            "traffic.previousPeriod": "前期間：",
            "traffic.centerLabel": "セッション",
            "traffic.clickHint": "{label}の内訳をクリックして下に表示",
            "traffic.new": "新規",
            "traffic.empty": "この期間のトラフィックデータはありません。",

            "th.source": "流入元",
            "th.sessionsCurrent": "セッション数（選択期間）",
            "th.sessionsPrevious": "セッション数（前期間）",
            "th.deltaVsPrevious": "前期間比",
            "th.revenueCurrent": "売上（選択期間）",
            "th.cvrCurrent": "CVR（選択期間）",

            "landing.title": "人気ランディングページ",
            "landing.allDevices": "すべてのデバイス",
            "landing.pc": "PC",
            "landing.smartphone": "スマートフォン",
            "landing.tablet": "タブレット",
            "landing.fixedWindow": "固定30日間：{start}～{end}",
            "landing.sessionsUnit": "セッション",
            "landing.hideSystem": "ログイン・購入手続きなどのシステムページを非表示",
            "landingInsights.heading": "インサイト",

            "landingInsight.rising": "{title}のセッションは直近30日間の後半で前半比{figure}増加しました。",
            "landingInsight.cooling": "{title}のセッションは直近30日間の後半で前半比{figure}減少しました。",
            "landingInsight.deviceMismatch": "{title}は{device}比率が高めです（このページ{figure}、サイト全体{site}）。",
            "landingInsight.spike": "{title}は{date}に{figure}セッションと、通常の1日あたり{mean}セッションに比べて突出して多くなりました。",
            "landingInsight.spikeToday": "{title} が本日急上昇中 — {figure} セッション（通常 {mean}）。",
            "landingInsight.spikeYesterday": "{title} が前日急上昇 — {figure} セッション（通常 {mean}）。",
            "landingInsight.spikeOn": "{title} が{date}に急上昇 — {figure} セッション（通常 {mean}）。",
            "landingInsight.overviewRising": "📈 {title}が直近7日間で{figure}増加（前の7日間 {previous} → {current} セッション）。",
            "landing.empty": "この期間のランディングページデータはありません。",
            "landing.notSet": "（未設定）",

            "landing.risingPanelTitle": "急上昇ページを検出",
            "landing.pageDetailTitle": "ページ詳細",
            "landing.risingPanelWeek": "今週 {current} セッション（先週 {previous} セッションから {figure}）",
            "landing.risingPanelWeekNew": "今週 {current} セッション（先週のデータなし）",
            "landing.spikePanelTitle": "急上昇を検出",
            "landing.spikePanelSummary": "{date} は {current} セッション — 通常 {baseline} セッション（{figure}）",
            "landing.risingPanelSpike": "最も急増した日：{date} — {value}セッション（通常は1日あたり約{mean}セッション）",
            "landing.risingPanelClose": "閉じる",

            "landing.sourceBreakdownTitle": "セッションの流入元",
            "landing.sourceBreakdownHint": "上のグラフのバーをクリックすると、その日の流入元内訳を表示します。",
            "landing.sourceBreakdownEmpty": "この日の流入元データはありません。",

            "landing.sourceDetailSource": "流入元 / メディア",
            "landing.sourceDetailSessions": "セッション数",
            "landing.sourceDetailPurchases": "購入数",
            "landing.sourceDetailRevenue": "売上",
            "landing.sourceDetailCvr": "CVR",
            "landing.sourceDetailEmpty": "このグループの詳細データはありません。",

            "insights.title": "主なインサイト",
            "insights.empty": "この期間はインサイトを生成するのに十分なデータがありません。",
            "insights.topLandingTitle": "急上昇ランディングページ インサイト",

            "source.title": "セッションの参照元 / メディア",
            "source.filteredBy": "絞り込み中：",
            "source.clear": "解除",
            "source.showAll": "すべて表示",
            "source.showAllCount": "すべて表示（{n}件）",
            "source.showLess": "表示を減らす",
            "source.emptyFilter": "選択期間・条件に一致する参照元がありません。",

            "th.sourceMediumCol": "セッションの参照元 / メディア",
            "th.sessions": "セッション数",
            "th.totalUsers": "延べユーザー数",
            "th.ecommercePurchases": "EC購入数",
            "th.totalRevenue": "総売上",
            "th.cvr": "CVR",

            "monthly.title": "月次売上実績",
            "th.month": "月",
            "th.revenue": "売上",
            "th.orders": "受注件数",
            "th.users": "ユーザー数",
            "th.trend": "前月比",
            "newRepeat.orders": "受注件数",
            "newRepeat.revenue": "売上",
            "newRepeat.legendNew": "新規",
            "newRepeat.legendRepeat": "リピーター",

            "aov.title": "客単価（AOV）推移",
            "aov.subtitle": "全体・新規顧客・リピーター顧客別、会計月ベース",
            "aov.legendOverall": "全体客単価",
            "aov.legendNew": "新規顧客客単価",
            "aov.legendRepeat": "リピーター客単価",

            "newRepeatInsights.title": "新規・リピーター分析",
            "newRepeatInsights.empty": "傾向を判断するにはまだ履歴が不足しています。",

            "newRepeat.tableTitle": "WEB本店 新規／リピータ",
            "newRepeat.source": "過去12ヶ月分を表示 — 2021年以降の全履歴は{link}をご覧ください",
            "newRepeat.sourceLinkText": "スプレッドシート",
            "th.year": "年度",
            "th.totalOrders": "総合受注件数",
            "th.newRevenue": "新規売上",
            "th.newOrders": "新規受注件数",
            "th.repeatRevenue": "リピーター売上",
            "th.repeatOrders": "リピーター受注件数",
            "th.visitorsPc": "訪問者数：PC",
            "th.visitorsSp": "訪問者数：SP",
            "th.visitorsTotal": "訪問者数：合計",

            "notes.title": "チームメモ",
            "notes.subtitle": "打ち合わせの内容や商品に関する気づきなど、残しておきたいことを記録できます — チーム全員に共有され、デバイス間で同期されます。",
            "notes.placeholder": "例：Q3レビュー後にSP-14セットの価格見直しを検討 — 来月再確認。",
            "notes.yourName": "お名前",
            "notes.anonymous": "匿名",
            "notes.addNote": "メモを追加",
            "notes.history": "履歴",
            "notes.empty": "まだメモがありません。上から追加してください。",
            "notes.notConfigured": "メモ機能はまだ接続されていません — 管理者にFirebaseの設定を完了してもらってください。",
            "notes.showArchived": "アーカイブを表示",
            "notes.showArchivedCount": "アーカイブを表示（{n}件）",
            "notes.backToNotes": "メモに戻る",
            "notes.archivedTitle": "アーカイブ済み",
            "notes.archivedEmpty": "アーカイブされたメモはありません。",
            "notes.archiveTitle": "メモをアーカイブ",
            "notes.restoreTitle": "メモを復元",
            "notes.deleteForeverTitle": "完全に削除",
            "notes.deleteForeverConfirm": "このメモを完全に削除しますか？この操作は取り消せません。",
            "notes.catGeneral": "一般",
            "notes.catTraffic": "トラフィック",
            "notes.catSales": "売上",
            "notes.catProduct": "商品",
            "notes.catBug": "不具合",
            "notes.catIdea": "アイデア",

            "settings.appearance": "表示設定",
            "settings.darkTheme": "ダークテーマ",
            "settings.darkThemeDesc": "ダッシュボードをダークカラーに切り替えます。このデバイスに保存されます。",
            "settings.language": "言語",
            "settings.languageDesc": "ダッシュボードの表示言語を選択します。このデバイスに保存されます。",
            "settings.comingSoon": "その他の設定は近日公開予定",
            "settings.comingSoonDesc": "アカウント・データソース・通知に関する設定を今後追加予定です。",
            "settings.goalsSaved": "保存しました。",
            "settings.goalsError": "保存に失敗しました。接続を確認して再度お試しください。",
            "goal.progress": "目標 {target} に対して {percent}%",

            "dataWarning.prefix": "以下はデモデータを表示しています：{list} — 実データの読み込みに失敗しました。この区画の数値は実際のものではありません。",
            "dataWarning.daily": "概要・月次業績",
            "dataWarning.sources": "流入元データ",
            "dataWarning.landingPages": "ランディングページ",
            "dataWarning.newRepeat": "新規／リピーター・客単価",
            "dataWarning.adSpend": "広告成果（広告費）",
            "dataWarning.transactions": "広告成果（取引明細）",

            "th.overallRevenue": "総合売上",

            "unit.pts": "pt",

            "insight.revenueChange": "売上は前期間と比較して{figure}{direction}しました。",
            "insight.increased": "増加",
            "insight.decreased": "減少",
            "insight.topChannelRevenue": "{label}が総売上の{figure}を占めました。",
            "insight.notSetShare": "セッションの{figure}が参照元不明{notSet}です。",
            "insight.moverChange": "{label}は{figure}{direction}しました。",
            "insight.cvrChange": "コンバージョン率（CVR）はこの期間で{figure}に{direction}しました。",
            "insight.cvrImproved": "改善",
            "insight.cvrDeclined": "低下",
            "insight.mover.users": "ユーザー数",
            "insight.mover.sessions": "セッション数",
            "insight.mover.purchases": "購入件数",

            "newRepeatInsight.newShareYoy": "{period}の新規顧客は受注件数の{share}を占め、前年同月比で{figure}{direction}しました。",
            "newRepeatInsight.newShare": "{period}の新規顧客は受注件数の{share}を占めました。",
            "newRepeatInsight.up": "増加",
            "newRepeatInsight.down": "減少",
            "newRepeatInsight.repeatRevenueShare": "{period}のリピーター顧客は総売上の{figure}を占めました。",
            "newRepeatInsight.aovSame": "新規顧客とリピーター顧客の平均客単価はほぼ同じでした（¥{higher} 対 ¥{lower}）。",
            "newRepeatInsight.aovDiff": "{who}顧客は{otherWho}顧客より今月の平均客単価が{figure}高くなっています（¥{higher} 対 ¥{lower}）。",
            "newRepeatInsight.repeat": "リピーター",
            "newRepeatInsight.new": "新規",
            "newRepeatInsight.repeatLower": "リピーター",
            "newRepeatInsight.newLower": "新規",
            "newRepeatInsight.trend": "新規顧客比率はここ3ヶ月{direction}傾向です（直近3ヶ月とその前の3ヶ月の差は{figure}）。",
            "newRepeatInsight.trendingUp": "上昇",
            "newRepeatInsight.trendingDown": "下降",

            "anomaly.spike": "急増",
            "anomaly.drop": "急減",
            "anomaly.sentence": "{date}に{metric}が{verb}しました（この期間の平均{mean}に対して{figure}）。",
            "nav.overview": "ブリーフィング",
            "brief.kickerRange": "ブリーフィング · {start} – {end}",
            "brief.kickerCompare": "比較：{start} – {end}",
            "brief.kickerYoy": "比較：前年同期間（{start} – {end}）",
            "brief.kickerPartial": "本日分は集計中のため、数値は変動します。",
            "brief.dataAsOf": "データ最新日 {date}",
            "brief.headline.up": "売上 {revenue}、{vs} {delta}。",
            "brief.headline.down": "売上 {revenue}、{vs} {delta}。",
            "brief.vs.prev": "前期間比",
            "brief.vs.yoy": "前年同期比",
            "brief.vital.partial": "集計中",
            "brief.vital.onChart": "グラフ表示中",
            "brief.kicker.drivers": "変動の要因",
            "brief.kicker.risk": "リスク",
            "brief.kicker.customers": "顧客",
            "brief.dek.decomp": "流入数 {sessions}・CVR {cvr}・客単価 {aov}",
            "brief.dek.yoy": "前年同期比 {pct}",
            "brief.day.bodyDow": "同じ曜日の通常値 {mean} に対して {value}。",
            "brief.drivers.cvrDragTitle": "流入増で{sess}、しかしCVR低下で{cvr}を失っています",
            "brief.drivers.body": "売上の変化 {total} ＝ 流入数 {s} ＋ CVR {c} ＋ 客単価 {a}。",
            "brief.drivers.leadDownTitle": "売上減の主因は{name}（{amount}）",
            "brief.drivers.leadUpTitle": "売上増の主因は{name}（{amount}）",
            "brief.drivers.name.sessions": "流入数",
            "brief.drivers.name.cvr": "CVR",
            "brief.drivers.name.aov": "客単価",
            "brief.lowyield.title": "{label}：セッション +{sessions} に対し、売上増は {revenue} のみ",
            "brief.lowyield.fellTitle": "{label}：セッションは +{sessions} 増えたのに、売上は {revenue}",
            "brief.lowyield.body": "CVR {prev}% → {cur}%。純増セッション1件あたりの売上純増は {perSession}（サイト平均は1セッション {sitePerSession}）。",
            "brief.contrib.title": "売上変動の主因は{label}（全体{total}のうち{amount}）",
            "brief.contrib.body": "増加：{up}　減少：{down}",
            "brief.contrib.item": "{label} {amount}",
            "brief.concentration.title": "売上の{share}%が{label}に依存",
            "brief.concentration.note": "なお{label}は売上の{share}%を占めており、依存度の注視が必要です。",
            "brief.moreStories": "さらに{n}件を表示",
            "brief.concentration.body": "このチャネル1つの変化（予算・規約・アルゴリズム）で全体の売上が大きく動きます。2番目は{next}（{nextShare}%）。",
            "brief.customers.downTitle": "新規顧客が直近{total}ヶ月中{n}ヶ月で前年割れ",
            "brief.customers.upTitle": "新規顧客が直近{total}ヶ月中{n}ヶ月で前年超え",
            "brief.customers.body": "直近の締め月（{month}）は新規受注 {cur}件（前年 {ly}件）。",
            "customers.title": "顧客の獲得とリピート",
            "customers.subtitle": "新規顧客・リピーターの受注件数（会計月ベース・毎月20日締め）",
            "customers.newTitle": "新規顧客の受注件数",
            "customers.repeatTitle": "リピーターの受注件数",
            "customers.thisYear": "今年",
            "customers.lastYear": "前年",
            "customers.lastYearSame": "前年同月",
            "customers.howToRead": "数字は前年同月との差です。緑（上）＝増加、赤（下）＝減少。",
            "customers.newLabel": "新規のお客様",
            "customers.newDesc": "はじめて購入したお客様 · 月ごとの受注件数",
            "customers.repeatLabel": "リピーターのお客様",
            "customers.repeatDesc": "2回目以降の購入のお客様 · 月ごとの受注件数",
            "customers.statShare": "新規比率",
            "customers.vsLy": "前年比 {pct}（前年 {value}）",
            "customers.vsLyPts": "前年比 {pts}pt",
            "customers.noteDrop": "{month}：新規顧客が前年同月比 {pct}（{prev} → {cur}）",
            "customers.notePeak": "{month}：新規顧客のピーク（{value}件）",
            "customers.noteYoy": "{month}：新規顧客が前年同月比 {pct}",
            "customers.noteOpen": "{month}は集計中（20日締め）のため薄く表示しています",
            "customers.noteStreakDown": "直近{total}ヶ月のうち{n}ヶ月で新規顧客が前年を下回っています",
            "customers.noteStreakUp": "直近{total}ヶ月のうち{n}ヶ月で新規顧客が前年を上回っています",
            "brief.headline.flat": "この期間の売上は {revenue}。",
            "brief.headline.empty": "この期間のデータはまだありません。",
            "brief.dek.topChannel": "{label}が売上の{share}%を占める",
            "brief.dek.drivers": "注文数 {orders}・客単価 {aov}",
            "brief.dek.watch": "要確認：{title}",
            "brief.dek.sep": "／",
            "brief.feedTitle": "変化と理由",
            "brief.feedSub": "対応が必要な順に並べています",
            "brief.feedEmpty": "この期間は特筆すべき変化はありません。",
            "brief.trendTitle": "数字の推移",
            "brief.allInsights": "すべてのインサイトを一覧で見る",
            "brief.open": "詳しく見る",
            "brief.tone.alert": "要対応",
            "brief.tone.bad": "要注意",
            "brief.tone.good": "好調",
            "brief.tone.info": "参考",
            "brief.vital.users": "延べユーザー",
            "brief.vital.sessions": "セッション",
            "brief.vital.purchases": "注文数",
            "brief.vital.revenue": "売上",
            "brief.vital.cvr": "CVR",
            "brief.vital.aov": "客単価",
            "brief.vital.target": "目標 {target}",
            "brief.vital.new": "新規",
            "brief.vital.hint": "クリックでグラフに表示／非表示",
            "brief.kicker.tracking": "計測",
            "brief.kicker.conversion": "コンバージョン",
            "brief.kicker.channel": "流入チャネル",
            "brief.kicker.day": "特定日",
            "brief.kicker.basket": "客単価",
            "brief.kicker.page": "ランディングページ",
            "brief.tracking.jumpTitle": "参照元不明の流入が {prev} → {cur} セッションに急増",
            "brief.tracking.shareTitle": "セッションの{share}%が参照元不明",
            "brief.tracking.body": "この期間のセッションの{share}%はどのチャネルから来たか判別できず、その分だけ各チャネルの数値が過小評価されています。UTMの設定ミス、クロスドメイン計測、同意モードが主な原因です。まず確認をおすすめします。",
            "brief.cvr.belowTitle": "CVR {cvr}% — 目標 {target}% を下回っています",
            "brief.cvr.aboveTitle": "CVR {cvr}% — 目標 {target}% を上回っています",
            "brief.cvr.body": "{vs} {pts}pt。",
            "brief.weak.title": "{label}：流入はあるが購入につながっていない（CVR {cvr}%）",
            "brief.weak.body": "{sessions} セッションに対し売上は {revenue} のみ。サイト全体のCVR {site}% を大きく下回ります。ターゲティングと遷移先ページを確認してください。",
            "brief.weak.bodyGrowing": "セッションは {growth} 増えて {sessions} になりましたが、売上は {revenue} のみ。サイト全体のCVR {site}% を大きく下回り、増えた流入が注文につながっていません。",
            "brief.strong.title": "{label} のCVRは {cvr}%",
            "brief.strong.body": "サイト全体のCVR {site}% の2倍以上で、売上は {revenue}（全体の{share}%）。投資を増やす候補です。",
            "brief.day.spikeTitle": "{date}に{metric}が急増",
            "brief.day.dropTitle": "{date}に{metric}が急減",
            "brief.chDay.spikeTitle": "{date}に{label}が急増",
            "brief.chDay.dropTitle": "{date}に{label}が急減",
            "brief.day.body": "この期間の通常値 {mean} に対して {value}。",
            "brief.day.drivers": "けん引したのは {list}。",
            "brief.day.driverItem": "{label}（{mean} → {value} セッション）",
            "brief.aov.upTitle": "客単価が {pct}",
            "brief.aov.downTitle": "客単価が {pct}",
            "brief.aov.body": "1注文あたり {prev} → {cur}。注文数以上に売上が動いています。",
            "brief.rise.title": "「{title}」が伸びています",
            "brief.rise.body": "直近7日間 {cur} セッション（その前の7日間は {prev}）。",
            "brief.spikes.oneTitle": "「{title}」が直近のデータで急上昇",
            "brief.spikes.manyTitle": "直近のデータで{n}ページが急上昇",
            "brief.spikes.item": "{title} — {value} セッション（通常 {mean}）"
        }
    };

    /* ==========================================================
       Channel / Platform / Device labels
       classifySourceChannel() and classifyPlatform() in data.js
       keep returning these exact English keys — that's what
       filtering/drill-down/color-assignment key off internally.
       Translation happens ONLY at display time via channelLabel(),
       so switching language never breaks the click-to-filter logic.
    ========================================================== */

    const CHANNEL_LABELS = {
        ja: {
            "Direct": "ダイレクト",
            "Organic Search": "オーガニック検索",
            "Paid Search": "有料検索",
            "Email": "メール",
            "Referral": "参照",
            "Display": "ディスプレイ",
            "Social": "ソーシャル",
            "Paid Social": "有料ソーシャル",
            "Affiliates": "アフィリエイト",
            "Other": "その他",
            "(not set)": "（未設定）",
            "Google Ads": "Google 広告",
            "Google Organic": "Google オーガニック",
            "Meta Ads": "Meta 広告",
            "Meta Organic": "Meta オーガニック",
            "Yahoo Ads": "Yahoo 広告",
            "Yahoo Organic": "Yahoo オーガニック",
            "Bing Ads": "Bing 広告",
            "Bing Organic": "Bing オーガニック",
            "Rakuten": "楽天",
            "Referral (Other)": "その他のサイト",
            "Google Referral": "Google（参照）",
            "Yahoo Referral": "Yahoo（参照）",
            "Meta Referral": "Meta（参照）",
            "Bing Referral": "Bing（参照）",
            "Organic Search (Other)": "オーガニック検索（その他）",
            "Social (Other)": "ソーシャル（その他）",
            "Paid (Other)": "有料（その他）",
            "Internal / Payment": "自社サイト・決済",
            "AI Assistants": "AIアシスタント",
            "YouTube": "YouTube",
            "Video": "動画",
            "Shopping": "ショッピング",
            "Cross-network": "クロスネットワーク（P-MAX等）"
        }
    };

    const DEVICE_LABELS = {
        ja: {
            "PC": "PC",
            "Smartphone": "スマートフォン",
            "Unknown": "不明",
            "all": "すべてのデバイス"
        }
    };

    /* ==========================================================
       Core lookup / persistence
    ========================================================== */

    function getLang() {
        try {
            const saved = localStorage.getItem(LANG_KEY);
            if (saved === "en" || saved === "ja") return saved;
        } catch (e) { /* private browsing / storage disabled */ }
        return DEFAULT_LANG;
    }

    function setLang(lang) {
        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch (e) { /* private browsing / storage disabled */ }
    }

    function t(key, vars) {
        const lang = getLang();
        let str = (STRINGS[lang] && STRINGS[lang][key]) || (STRINGS.en && STRINGS.en[key]) || key;
        if (vars) {
            Object.keys(vars).forEach((k) => {
                str = str.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
            });
        }
        return str;
    }

    function channelLabel(key) {
        const lang = getLang();
        if (lang === "ja" && CHANNEL_LABELS.ja[key]) return CHANNEL_LABELS.ja[key];
        return key;
    }

    function deviceLabel(key) {
        const lang = getLang();
        if (lang === "ja" && DEVICE_LABELS.ja[key]) return DEVICE_LABELS.ja[key];
        return key;
    }

    /* ==========================================================
       Locale-aware date/month formatting
       Centralized here so chart x-axis labels, the "exclude
       today" check in anomaly detection, and table period
       labels all format the exact same way regardless of
       language — several places compare formatted strings for
       equality, so drift between two ad-hoc formatters would
       silently break those comparisons.
    ========================================================== */

    function localeTag() {
        return getLang() === "ja" ? "ja-JP" : "en-US";
    }

    // Short day label used for trend-chart x-axis ticks and to
    // detect "is this today" (excludeToday in data.js) — e.g.
    // "Jul 24" / "7月24日".
    function formatDayLabel(date) {
        return new Date(date).toLocaleDateString(localeTag(), { month: "short", day: "numeric" });
    }

    // "Aug 2025" / "2025年8月" — used for Monthly Business
    // Performance and New/Repeat period labels.
    function formatMonth(year, month0) {
        return new Date(year, month0, 1).toLocaleDateString(localeTag(), { month: "short", year: "numeric" });
    }

    // "Jul 24, 2:30 PM" / "7月24日 14:30" — Last Update / notes timestamps.
    function formatDateTime(date) {
        return new Date(date).toLocaleString(localeTag(), {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
    }

    // "Jul 24, 2026, 2:30 PM" / "2026年7月24日 14:30" — notes list entries.
    function formatDateTimeFull(date) {
        return new Date(date).toLocaleString(localeTag(), {
            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
    }

    /* ==========================================================
       Static DOM translation
       Walks every [data-i18n] element and sets its textContent
       from the dictionary. Attribute variants cover placeholder/
       title text that isn't a text node.
    ========================================================== */

    function applyStatic(root) {
        const scope = root || document;
        scope.querySelectorAll("[data-i18n]").forEach((el) => {
            el.textContent = t(el.getAttribute("data-i18n"));
        });
        scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
        });
        scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
            el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
        });
        document.title = t("doc.title");
        document.documentElement.setAttribute("lang", getLang());
    }

    /* ==========================================================
       Settings toggle
    ========================================================== */

    function wireLanguageToggle(onChange) {
        const select = document.getElementById("languageSelect");
        if (!select) return;
        select.value = getLang();
        select.addEventListener("change", () => {
            setLang(select.value);
            applyStatic();
            if (onChange) onChange(select.value);
        });
    }

    return {
        getLang,
        setLang,
        t,
        channelLabel,
        deviceLabel,
        formatDayLabel,
        formatMonth,
        formatDateTime,
        formatDateTimeFull,
        applyStatic,
        wireLanguageToggle
    };

})();
