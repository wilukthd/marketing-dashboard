/* ==========================================================
   THD Analytics
   i18n (English / 日本語)
   Version 0.1

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
            "sidebar.version": "Version 1.0",

            "nav.overview": "Overview",
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

            "header.lastUpdate": "Last Update",
            "header.refresh": "Refresh",

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

            "kpi.totalUsers": "Total Users",
            "kpi.sessions": "Sessions",
            "kpi.purchases": "Ecommerce Purchases",
            "kpi.revenue": "Total Revenue",
            "kpi.cvr": "CVR",
            "kpi.vsPrevious": "vs Previous Period",
            "kpi.avgDay": "Avg / Day",
            "kpi.dailyAvg": "Daily Avg",
            "kpi.goal": "Goal",

            "trend.title": "Metrics Trend",
            "trend.subtitle": "Select a Date Range Above",
            "trend.movingAvg": "Show 7-day moving average",
            "trend.movingAvgSuffix": " (7-day avg)",

            "traffic.title": "Traffic Sources",
            "traffic.subtitle": "Selected period vs. the period before it, by ad platform",
            "traffic.byPlatform": "By Ad Platform (Google, Meta, Yahoo, Criteo…)",
            "traffic.byChannel": "By Channel (GA4 default grouping)",
            "traffic.selectedPeriod": "Selected period:",
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
            "landing.fixedWindow": "Fixed 30-day window: {start} – {end}",
            "landing.sessionsUnit": "sessions",
            "landing.cvrUnit": "CVR",
            "landing.hideSystem": "Hide login/checkout/system pages",

            "landingInsight.systemShare": "{figure} of landing page sessions in the last 30 days went to login, checkout, or other non-content pages — hidden from the list below by default.",
            "landingInsight.topPage": "{title} was the top content page with {sessions} sessions and {revenue} in revenue.",
            "landingInsight.zeroConversion": "{count} pages got meaningful traffic but zero purchases — worth checking for pricing, stock, or checkout issues.",
            "landingInsight.deviceSplit": "Smartphone accounted for {sp} of content-page sessions vs {pc} on PC.",
            "landing.empty": "No landing page data for this window.",
            "landing.notSet": "(not set)",

            "insights.title": "Key Insights",
            "insights.empty": "Not enough data yet to generate insights for this period.",

            "source.title": "Session Source / Medium",
            "source.filteredBy": "Filtered by",
            "source.clear": "Clear",
            "source.showAll": "Show All",
            "source.showAllCount": "Show All ({n})",
            "source.showLess": "Show Less",
            "source.emptyFilter": "No sources match this filter for the selected period.",

            "th.sourceMediumCol": "Session Source / Medium",
            "th.sessions": "Sessions",
            "th.totalUsers": "Total Users",
            "th.ecommercePurchases": "Ecommerce Purchases",
            "th.totalRevenue": "Total Revenue",
            "th.cvr": "CVR",

            "monthly.title": "Monthly Business Performance",
            "th.month": "Month",
            "th.revenue": "Revenue",
            "th.orders": "Orders",
            "th.users": "Users",
            "th.trend": "Trend",

            "newRepeat.chartTitle": "New vs Repeat Customers",
            "newRepeat.chartSubtitle": "WEB Store New / Repeat — by business month",
            "newRepeat.orders": "Orders",
            "newRepeat.revenue": "Revenue",
            "newRepeat.legendNew": "New",
            "newRepeat.legendRepeat": "Repeat",
            "newRepeat.legendShare": "New Customer Share",

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
            "notes.subtitle": "Jot down remarks from a discussion, a product observation, or anything worth remembering next time you're in the dashboard. Saved on this device.",
            "notes.placeholder": "e.g. Discussed re-pricing the SP-14 bundle after the Q3 review — revisit next month.",
            "notes.addNote": "Add Note",
            "notes.history": "History",
            "notes.empty": "No notes yet — add one above.",
            "notes.deleteTitle": "Delete note",

            "settings.appearance": "Appearance",
            "settings.darkTheme": "Dark theme",
            "settings.darkThemeDesc": "Switch the dashboard to a dark color scheme. Saved on this device.",
            "settings.language": "Language",
            "settings.languageDesc": "Choose the display language for the dashboard. Saved on this device.",
            "settings.comingSoon": "More settings coming soon",
            "settings.comingSoonDesc": "Account, data source, and notification preferences will live here.",

            "th.overallRevenue": "Total Revenue",

            "unit.pts": "pts",

            "insight.revenueChange": "Revenue {direction} by {figure} compared to the previous period.",
            "insight.increased": "increased",
            "insight.decreased": "decreased",
            "insight.topChannelRevenue": "{label} generated {figure} of total revenue.",
            "insight.notSetShare": "{figure} of sessions have no attribution data {notSet} — worth checking GA4 tagging/UTM setup, since this may be skewing channel-level numbers.",
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
            "newRepeatInsight.trend": "New customer share has been {direction} over the last 3 months ({figure} vs the prior 3) — {note}.",
            "newRepeatInsight.trendingUp": "trending up",
            "newRepeatInsight.trendingDown": "trending down",
            "newRepeatInsight.trendUpNote": "acquisition is gaining ground",
            "newRepeatInsight.trendDownNote": "worth checking if acquisition channels have slowed",

            "anomaly.spike": "spiked",
            "anomaly.drop": "dropped",
            "anomaly.sentence": "{metric} {verb} on {date} ({figure} vs a typical {mean} for this period) — there might have been an external event, promotion, or outage around that date worth checking."
        },
        ja: {
            "doc.title": "THDアナリティクス ダッシュボード",
            "logo.subtitle": "アナリティクス",
            "sidebar.version": "バージョン 1.0",

            "nav.overview": "概要",
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

            "header.lastUpdate": "最終更新",
            "header.refresh": "更新",

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

            "kpi.totalUsers": "総ユーザー数",
            "kpi.sessions": "セッション数",
            "kpi.purchases": "EC購入数",
            "kpi.revenue": "総売上",
            "kpi.cvr": "CVR（購入率）",
            "kpi.vsPrevious": "前期間比",
            "kpi.avgDay": "1日あたり平均",
            "kpi.dailyAvg": "1日平均",
            "kpi.goal": "目標",

            "trend.title": "推移グラフ",
            "trend.subtitle": "上の期間セレクターから範囲を選択してください",
            "trend.movingAvg": "7日移動平均を表示",
            "trend.movingAvgSuffix": "（7日移動平均）",

            "traffic.title": "トラフィック獲得経路",
            "traffic.subtitle": "選択期間と前期間の比較（広告プラットフォーム別）",
            "traffic.byPlatform": "広告プラットフォーム別（Google、Meta、Yahoo、Criteoなど）",
            "traffic.byChannel": "チャネル別（GA4デフォルトのグループ化）",
            "traffic.selectedPeriod": "選択期間：",
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
            "landing.fixedWindow": "固定30日間：{start}～{end}",
            "landing.sessionsUnit": "セッション",
            "landing.cvrUnit": "CVR",
            "landing.hideSystem": "ログイン・購入手続きなどのシステムページを非表示",

            "landingInsight.systemShare": "過去30日間のランディングページセッションのうち{figure}はログインや購入手続きなど非コンテンツページへのアクセスでした — 以下のリストではデフォルトで非表示にしています。",
            "landingInsight.topPage": "{title}が最もセッション数の多いコンテンツページで、{sessions}セッション・{revenue}の売上を記録しました。",
            "landingInsight.zeroConversion": "一定量のアクセスがありながら購入が0件のページが{count}件あります — 価格・在庫・購入手続きに問題がないか確認する価値があります。",
            "landingInsight.deviceSplit": "コンテンツページのセッションはスマートフォンが{sp}、PCが{pc}を占めています。",
            "landing.empty": "この期間のランディングページデータはありません。",
            "landing.notSet": "（未設定）",

            "insights.title": "主なインサイト",
            "insights.empty": "この期間はインサイトを生成するのに十分なデータがありません。",

            "source.title": "セッションの参照元 / メディア",
            "source.filteredBy": "絞り込み中：",
            "source.clear": "解除",
            "source.showAll": "すべて表示",
            "source.showAllCount": "すべて表示（{n}件）",
            "source.showLess": "表示を減らす",
            "source.emptyFilter": "選択期間・条件に一致する参照元がありません。",

            "th.sourceMediumCol": "セッションの参照元 / メディア",
            "th.sessions": "セッション数",
            "th.totalUsers": "総ユーザー数",
            "th.ecommercePurchases": "EC購入数",
            "th.totalRevenue": "総売上",
            "th.cvr": "CVR",

            "monthly.title": "月次売上実績",
            "th.month": "月",
            "th.revenue": "売上",
            "th.orders": "受注件数",
            "th.users": "ユーザー数",
            "th.trend": "前月比",

            "newRepeat.chartTitle": "新規・リピーター推移",
            "newRepeat.chartSubtitle": "WEB本店 新規／リピータ — 会計月ベース",
            "newRepeat.orders": "受注件数",
            "newRepeat.revenue": "売上",
            "newRepeat.legendNew": "新規",
            "newRepeat.legendRepeat": "リピーター",
            "newRepeat.legendShare": "新規顧客比率",

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
            "notes.subtitle": "打ち合わせの内容や商品に関する気づきなど、次回このダッシュボードを見るときに残しておきたいことを記録できます。このデバイスに保存されます。",
            "notes.placeholder": "例：Q3レビュー後にSP-14セットの価格見直しを検討 — 来月再確認。",
            "notes.addNote": "メモを追加",
            "notes.history": "履歴",
            "notes.empty": "まだメモがありません。上から追加してください。",
            "notes.deleteTitle": "メモを削除",

            "settings.appearance": "表示設定",
            "settings.darkTheme": "ダークテーマ",
            "settings.darkThemeDesc": "ダッシュボードをダークカラーに切り替えます。このデバイスに保存されます。",
            "settings.language": "言語",
            "settings.languageDesc": "ダッシュボードの表示言語を選択します。このデバイスに保存されます。",
            "settings.comingSoon": "その他の設定は近日公開予定",
            "settings.comingSoonDesc": "アカウント・データソース・通知に関する設定を今後追加予定です。",

            "th.overallRevenue": "総合売上",

            "unit.pts": "pt",

            "insight.revenueChange": "売上は前期間と比較して{figure}{direction}しました。",
            "insight.increased": "増加",
            "insight.decreased": "減少",
            "insight.topChannelRevenue": "{label}が総売上の{figure}を占めました。",
            "insight.notSetShare": "セッションの{figure}が参照元不明{notSet}です。GA4のタグ設定やUTMパラメータを見直す価値があります — チャネル別の数値に影響している可能性があります。",
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
            "newRepeatInsight.trend": "新規顧客比率はここ3ヶ月{direction}傾向です（直近3ヶ月とその前の3ヶ月の差は{figure}）— {note}。",
            "newRepeatInsight.trendingUp": "上昇",
            "newRepeatInsight.trendingDown": "下降",
            "newRepeatInsight.trendUpNote": "新規獲得が伸びている状況です",
            "newRepeatInsight.trendDownNote": "新規獲得チャネルの動きが鈍化していないか確認する価値があります",

            "anomaly.spike": "急増",
            "anomaly.drop": "急減",
            "anomaly.sentence": "{date}に{metric}が{verb}しました（この期間の平均{mean}に対して{figure}）— この日付前後に外部要因・施策・システム障害などがなかったか確認する価値があります。"
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
            "Referral (Other)": "参照（その他）",
            "Organic Search (Other)": "オーガニック検索（その他）",
            "Social (Other)": "ソーシャル（その他）",
            "Paid (Other)": "有料（その他）"
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
