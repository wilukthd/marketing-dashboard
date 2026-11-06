/* ==========================================================
   THD Analytics
   Live Data Layer
   Version 1.0

   Fetches published Google Sheets CSVs and shapes them into
   the same structures the UI/chart layers expect. Falls back
   to generated dummy data per-source if a URL isn't configured
   yet or the fetch fails, so the dashboard always renders.

   ---- HOW TO GO LIVE ----
   1. Publish each sheet/tab to the web as CSV:
      File > Share > Publish to web > select sheet > CSV
   2. Paste the resulting URLs into CONFIG below.
   3. Make sure each sheet's columns match the "Expected columns"
      comment above each loader function.
========================================================== */

window.THD = window.THD || {};

(function (THD) {

    const CONFIG = {
        // Daily GA4 rollup: date, users, sessions, purchases, revenue
        GA4_DAILY_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFOBVOeXWRrqSmnIFlU_wmlMlN3bw9mHJsJF-8OhA9I5PVVRKwam6k1hYkUBWCqr9AroVCvCSHTrsy/pub?gid=442548806&single=true&output=csv",

        // GA4 acquisition breakdown: sourceMedium, sessions, users, purchases, revenue, channel
        GA4_SOURCES_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFOBVOeXWRrqSmnIFlU_wmlMlN3bw9mHJsJF-8OhA9I5PVVRKwam6k1hYkUBWCqr9AroVCvCSHTrsy/pub?gid=96802008&single=true&output=csv",

        // GA4 landing page breakdown — fixed 30-day rolling window
        // (the underlying GA4 export is capped there; ~60k rows even
        // at 30 days, so no more history is kept). Columns:
        // device, sourceMedium, date, landingPage, pageTitle,
        // landingPagePlusQueryString, sessions, ecommercePurchases,
        // totalRevenue — sourceMedium and device were both added on top
        // of the original report (device = GA4's own deviceCategory:
        // desktop/mobile/tablet, mapped in loadLandingPages via
        // mapDeviceCategory — replaced the old "/smartphone/" URL-path
        // guess, which silently misclassified every landing page hosted
        // off the main site's own domain, e.g. cross-domain-tracked
        // checkout/payment pages, as PC regardless of actual device).
        // sourceMedium lets this single feed also answer "where did
        // this day's sessions come from" (see buildDayPageSourceBreakdown).
        // Both additions mean each date+page combination now spans
        // several rows (one per source) rather than one summed row.
        // Every function that reads landingRows already sums across
        // matching rows rather than assuming one-row-per-day, so this
        // needed no changes anywhere else. See loadLandingPages() —
        // grouping uses pageTitle (readable) rather than landingPage,
        // since landingPage is a generic template shared by hundreds of
        // different product pages (the actual product only shows up in
        // the query string / pageTitle).
        GA4_LANDING_PAGES_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFOBVOeXWRrqSmnIFlU_wmlMlN3bw9mHJsJF-8OhA9I5PVVRKwam6k1hYkUBWCqr9AroVCvCSHTrsy/pub?gid=1176432957&single=true&output=csv",

        // Spreadsheet: WEB本店新規／リピータ — published as-is, raw
        // layout (two header rows, no need to restructure the sheet).
        // See loadNewRepeat() for the exact column mapping.
        NEW_REPEAT_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQSRf48VUc7RKvkbgkwFXDrYxPidpJaOX6xRRsu-y19J4Jas-RsrLlzNT3CCh0pxR1Ha7rLaXF1TJvS/pub?gid=0&single=true&output=csv",

        // ---- Not set up yet — both left blank on purpose ----
        // loadAdSpend()/loadTransactions() below fall back to dummy
        // data exactly like any other feed left unconfigured (see
        // fetchCsv's `if (!url)` guard). Fill these in once each is
        // published; see thd-dashboard-changelog.md item 12 for the
        // exact column layout each one is expected to have.

        // Daily ad spend by platform/campaign — Google Ads + Meta Ads.
        // Columns: date, platform, campaign, spend, impressions, clicks.
        // platform must be exactly "Google" or "Meta" (matching
        // classifyPlatform's vendor labels below) for spend to line up
        // with the matching "<Platform> Ads" GA4 sessions/revenue.
        AD_SPEND_CSV_URL: "",

        // Per-order transaction detail, for spot-checking that a given
        // ad-driven session actually converted (and reconciling GA4's
        // purchase count/revenue against your order system's own
        // numbers — GA4 under-counting paid traffic specifically, via
        // ad blockers/ITP/consent banners, is common enough to be
        // worth checking rather than assuming away).
        // Columns: orderId, date, sourceMedium, campaign, revenue,
        // newOrRepeat ("new" or "repeat").
        TRANSACTIONS_CSV_URL: "",

        // Conversion-rate target shown on the CVR figure (hit/miss).
        // Change it here until the paused Goals feature (js/goals.js)
        // ships and takes over.
        CVR_TARGET: 6.5
    };

    // Google's published-CSV endpoint is cached, so a plain re-fetch on
    // "Refresh" can hand back the same file — a throwaway query param
    // forces a fresh copy.
    function bustCache(url) {
        if (!url) return url;
        return url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
    }

    /* ==========================================================
       CSV fetch helper
    ========================================================== */

    function fetchCsv(url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject(new Error("No URL configured"));
                return;
            }
            Papa.parse(bustCache(url), {
                download: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (err) => reject(err)
            });
        });
    }

    // For sheets with merged/multi-row headers (like WEB本店新規／
    // リピータ), header:true would collapse duplicate sub-header
    // names (前月比 repeats 8 times) into one column and lose data.
    // This reads plain row arrays instead so the loader can map
    // columns by position.
    function fetchRawCsv(url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject(new Error("No URL configured"));
                return;
            }
            Papa.parse(bustCache(url), {
                download: true,
                header: false,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (err) => reject(err)
            });
        });
    }

    /* ==========================================================
       GA4 exports dates as YYYYMMDD (e.g. 20260702), and since
       PapaParse's dynamicTyping reads that as the number
       20260702, it must be converted explicitly rather than
       passed to `new Date()` directly.
    ========================================================== */

    function parseGA4Date(raw) {
        const s = String(raw);
        if (/^\d{8}$/.test(s)) {
            return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }
        return s;
    }

    /* ==========================================================
       Loaders — each resolves to parsed rows, or null on failure
       so callers can fall back to dummy data independently.
    ========================================================== */

    async function loadDailyGA4() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_DAILY_CSV_URL);
            return rows
                .filter((r) => r.date)
                .map((r) => ({
                    date: parseGA4Date(r.date),
                    users: Number(r.users) || 0,
                    sessions: Number(r.sessions) || 0,
                    purchases: Number(r.purchases) || 0,
                    revenue: Number(r.revenue) || 0
                }))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (e) {
            console.warn("[THD.data] GA4 daily CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    async function loadSources() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_SOURCES_CSV_URL);
            return rows
                .filter((r) => r.sourceMedium && r.date)
                .map((r) => ({
                    sourceMedium: r.sourceMedium,
                    date: parseGA4Date(r.date),
                    sessions: Number(r.sessions) || 0,
                    users: Number(r.users) || 0,
                    purchases: Number(r.purchases) || 0,
                    revenue: Number(r.revenue) || 0,
                    // GA4's own channel group, if the report adds the
                    // sessionDefaultChannelGroup dimension (see the report
                    // config sheet) — far better than guessing from text.
                    channel: r.channel || r.sessionDefaultChannelGroup || null,
                    // Optional — only present once a "campaign" column is
                    // added to the published sheet (see Ads Performance,
                    // thd-dashboard-changelog.md item 12). Used to line up
                    // GA4 sessions/revenue with ad spend at the individual
                    // campaign level; everything else about this feed
                    // (Traffic tab, Session Source table, etc.) works
                    // identically whether or not it's present.
                    campaign: r.campaign || null
                }));
        } catch (e) {
            console.warn("[THD.data] GA4 sources CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    // Raw column layout (0-indexed), matching the sheet exactly as
    // published — two header rows (merged group labels, then the
    // 売上/前月比/昨年比/受注件数/... sub-labels), then one row per
    // month. No blank spacer column — confirmed against the actual
    // published CSV (the web-preview HTML table view showed an
    // extra blank column C, but that turned out to be a rendering
    // artifact only, not real data):
    //   0  年度 (year)              13 リピーター 昨年比
    //   1  月度 (month, 1-12)       14 リピーター 売上
    //   2  総合 売上                15 リピーター 前月比
    //   3  総合 前月比               16 リピーター 昨年比
    //   4  総合 昨年比               17 リピーター 受注件数
    //   5  総合 受注件数             18 リピーター 前月比
    //   6  総合 前月比               19 リピーター 昨年比
    //   7  総合 昨年比               20 訪問者数 PC
    //   8  新規 売上                 21 訪問者数 スマホ
    //   9  新規 前月比               22 訪問者数 合計
    //   10 新規 昨年比               23 訪問者数 前月比
    //   11 新規 受注件数             24 訪問者数 昨年比
    //   12 新規 前月比
    // Only year/month/revenue/orders/visitor columns are used — the
    // 前月比/昨年比 (MoM/YoY %) columns are ignored since the dashboard
    // computes its own period-over-period deltas from the raw figures.
    // The published sheet formats larger numbers with thousand-
    // separator commas plus a trailing space (e.g. "29,515,711 "),
    // which arrive as unparsed strings since PapaParse's dynamic
    // typing only auto-converts plain numeric strings. Number()
    // on a comma-containing string returns NaN, so this strips
    // commas/whitespace first.
    function parseFormattedNumber(v) {
        if (typeof v === "number") return v;
        if (v === null || v === undefined || v === "") return 0;
        const n = parseFloat(String(v).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : 0;
    }

    async function loadNewRepeat() {
        try {
            const raw = await fetchRawCsv(CONFIG.NEW_REPEAT_CSV_URL);
            return raw
                .slice(2) // skip the two header rows
                .filter((r) => Number.isFinite(r[0]) && Number.isFinite(r[1])) // drops blank/leftover formula rows at the bottom
                .sort((a, b) => (a[0] * 12 + a[1]) - (b[0] * 12 + b[1]))
                .map((r) => ({
                    year: r[0],
                    month: r[1],
                    period: businessMonthLabel(r[0], r[1] - 1),
                    totalRevenue: parseFormattedNumber(r[2]),
                    totalOrders: parseFormattedNumber(r[5]),
                    newRevenue: parseFormattedNumber(r[8]),
                    newOrders: parseFormattedNumber(r[11]),
                    repeatRevenue: parseFormattedNumber(r[14]),
                    repeatOrders: parseFormattedNumber(r[17]),
                    visitorsPc: parseFormattedNumber(r[20]),
                    visitorsSp: parseFormattedNumber(r[21]),
                    visitorsTotal: parseFormattedNumber(r[22])
                }));
        } catch (e) {
            console.warn("[THD.data] New/Repeat CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    // This site's mobile pages all live under a "/smartphone/" path
    // prefix and PC pages don't — so before GA4's own deviceCategory
    // was added to the sheet, this URL heuristic was the only signal
    // available. It breaks down for any landing page hosted off the
    // main site's own domain (a cross-domain-tracked checkout/payment
    // page, a docomo carrier-billing page, an iframe sandbox, etc.) —
    // those never follow the "/smartphone/" convention regardless of
    // the visitor's actual device, so they always fell into "PC" and
    // quietly skewed every device-mix number toward PC. Kept now only
    // as a fallback for rows where the real device column (added
    // below in loadLandingPages) is missing or blank.
    function classifyDeviceFromUrl(landingPage) {
        if (!landingPage) return "Unknown";
        return landingPage.startsWith("/smartphone/") ? "Smartphone" : "PC";
    }

    // Maps GA4's own deviceCategory values (desktop/mobile/tablet) onto
    // this app's existing PC/Smartphone labels, adding Tablet as its
    // own bucket rather than folding it into either — silently
    // guessing which one a tablet visitor "really" is would just trade
    // one inaccuracy for another.
    function mapDeviceCategory(raw) {
        const key = (raw || "").trim().toLowerCase();
        if (key === "desktop") return "PC";
        if (key === "mobile") return "Smartphone";
        if (key === "tablet") return "Tablet";
        return null;
    }

    // Distinguishes actual content (products, blog posts) from the
    // login/checkout/account/home "system" pages that technically
    // count as landing pages in GA4 but carry no marketing signal —
    // nobody clicks an ad to land on an order-confirmation screen.
    //
    // This site's own title template turns out to be the reliable
    // signal: product/content pages are titled "{item name}｜{shop
    // name}" (a pipe — either the full-width｜or a plain ASCII | shows
    // up in the data), while every system/navigational page either
    // shows just the shop name alone, joins it with a different
    // separator ("-", "/"), or has no shop-name suffix at all
    // (the checkout-flow steps). Checking for that pipe is a single
    // rule that covers every case observed so far, and — unlike an
    // enumerated keyword blocklist — doesn't need updating if a new
    // system page shows up later using text we haven't seen yet.
    //
    // An earlier version of this function prioritized the landingPage
    // path (e.g. detail.html/shopdetail/ => "product") over the title.
    // That was wrong: a handful of rows had one of those paths paired
    // with a generic title (an unresolved/broken product hit), and the
    // path check overrode the title, wrongly keeping them as "product".
    // Title wins now — if the title itself doesn't look like a real
    // item, the path it happened to load on doesn't matter.
    function classifyLandingPageType(landingPage, pageTitle) {
        const path = String(landingPage || "");
        const title = String(pageTitle || "");

        if (!title || title === "(not set)") return "system";
        if (/[｜|]/.test(title)) return "content";
        if (/blog/i.test(path) || /ブログ/.test(title)) return "content";

        return "system";
    }

    async function loadLandingPages() {
        try {
            const rows = await fetchCsv(CONFIG.GA4_LANDING_PAGES_CSV_URL);
            return rows
                .filter((r) => r.date) // keep rows even when landingPage/pageTitle is blank — that's a real "(not set)" hit, not junk
                .map((r) => {
                    const landingPage = r.landingPage || "";
                    const pageTitle = r.pageTitle || "(not set)";
                    return {
                        date: parseGA4Date(r.date),
                        landingPage,
                        pageTitle,
                        // Prefer GA4's own deviceCategory (added as a real
                        // column on this report) over the URL-prefix guess —
                        // it's ground truth and works for every landing
                        // page regardless of which domain it's hosted on.
                        // Falls back to the URL heuristic only when the
                        // column is missing or has an unrecognized value,
                        // so this keeps working during any transition and
                        // against older cached data.
                        device: mapDeviceCategory(r.device) || classifyDeviceFromUrl(landingPage),
                        pageType: classifyLandingPageType(landingPage, pageTitle),
                        sourceMedium: r.sourceMedium || r.sessionSourceMedium || "(not set)",
                        sessions: Number(r.sessions) || 0,
                        // Column name confirmed from the sheet is truncated in
                        // the UI preview ("ecommercePurc…") — covering the
                        // likely full names defensively so this doesn't
                        // silently read as 0 if the exact header differs.
                        purchases: Number(r.ecommercePurchases ?? r.ecommercePurc ?? r.purchases) || 0,
                        revenue: Number(r.totalRevenue) || 0
                    };
                });
        } catch (e) {
            console.warn("[THD.data] Landing pages CSV not available, using dummy data:", e.message);
            return null;
        }
    }

    /* ==========================================================
       Ads Performance — spend + transaction feeds
       Both optional/unconfigured by default (see CONFIG above);
       fail the same way every other not-yet-set-up feed does.
    ========================================================== */

    async function loadAdSpend() {
        try {
            const rows = await fetchCsv(CONFIG.AD_SPEND_CSV_URL);
            return rows
                .filter((r) => r.date && r.platform)
                .map((r) => ({
                    date: parseGA4Date(r.date),
                    platform: String(r.platform).trim(), // "Google" or "Meta"
                    campaign: r.campaign || null,
                    spend: Number(r.spend) || 0,
                    impressions: Number(r.impressions) || 0,
                    clicks: Number(r.clicks) || 0
                }));
        } catch (e) {
            console.warn("[THD.data] Ad spend CSV not configured, using dummy data:", e.message);
            return null;
        }
    }

    async function loadTransactions() {
        try {
            const rows = await fetchCsv(CONFIG.TRANSACTIONS_CSV_URL);
            return rows
                .filter((r) => r.orderId && r.date)
                .map((r) => ({
                    orderId: String(r.orderId),
                    date: parseGA4Date(r.date),
                    sourceMedium: r.sourceMedium || "(not set)",
                    campaign: r.campaign || null,
                    revenue: Number(r.revenue) || 0,
                    newOrRepeat: (String(r.newOrRepeat || "").toLowerCase() === "new") ? "new" : "repeat"
                }));
        } catch (e) {
            console.warn("[THD.data] Transactions CSV not configured, using dummy data:", e.message);
            return null;
        }
    }

    /* ==========================================================
       Channel classification (simplified GA4 default channel
       grouping) — used to build the Traffic Sources doughnut
       from the same source/medium rows as the Sources table,
       for sheets that don't include an explicit channel column.
    ========================================================== */

    /* ==========================================================
       Special buckets — checked BEFORE the normal channel/platform
       rules, in both groupings.
       • Internal / Payment: the company's own sites and tools, and
         payment / carrier-billing pages. A customer who goes to the
         payment page and comes back starts a NEW session credited to
         that page, which steals the sale from the real source and
         made "Referral (Other)" look like an 18%-CVR channel. These
         aren't acquisition channels at all, so they get their own
         bucket and are kept out of the channel-efficiency stories.
         (The real fix is GA4's "unwanted referrals" list + cross-
         domain measurement — this just stops the dashboard repeating
         the distortion.)
       • AI Assistants: ChatGPT/Gemini/Perplexity etc. arrive as
         referral, organic or (not set) depending on the app — one
         bucket so the trend is visible.
       • Webmail: mail.nifty.com etc. are email clicks, not referrals.
       Edit these lists when a new domain shows up in 参照（その他）.
    ========================================================== */

    const OWN_HOSTS = [
        /(^|\.)totalhealthdesign\.jp$/,
        /(^|\.)th-d\.co\.jp$/,
        /(^|\.)makerepeater\.jp$/,
        /(^|\.)utage-system\.com$/,
        /studioiframesandbox\.com$/
    ];
    const PAYMENT_HOSTS = [
        /(^|\.)mul-pay\.jp$/,          // GMO Payment Gateway
        /(^|\.)gmo-pg\.com$/,
        // docomo carrier billing / d払い only — NOT all of docomo.ne.jp:
        // mail.smt.docomo.ne.jp is docomo webmail (→ Email).
        /^service\.smt\.docomo\.ne\.jp$/,
        // (auone.jp deliberately absent: search.portal.auone.jp is au's
        // search engine — real visitors, not a payment page.)
        /(^|\.)softbank\.jp$/,
        /(^|\.)paypay\.ne\.jp$/,
        /(^|\.)paypal\.com$/,
        /(^|\.)stripe\.com$/,
        /(^|\.)sbpayment\.jp$/,
        /(^|\.)veritrans\.co\.jp$/,
        /(^|\.)paygent\.co\.jp$/,
        /(^|\.)pay\.amazon\./,
        /(^|\.)pay\.rakuten\.co\.jp$/
    ];
    const AI_SOURCE = /^(chatgpt\.com|chat\.openai\.com|openai|chatgpt|perplexity|perplexity\.ai|gemini|gemini\.google\.com|bard\.google\.com|claude\.ai|copilot\.microsoft\.com|copilot)$/;
    // Any webmail host (mail.ocn.jp, mail.commufa.jp, wm.zaq.ne.jp, outlook.live.com, …).
    const WEBMAIL_SOURCE = /^((web)?mail\d*|wm|webmail)\.[a-z0-9.-]+$|^outlook\.(live|office|office365)\.com$/;

    function specialBucket(source) {
        // Webmail first: carrier webmail hosts (mail.smt.docomo.ne.jp)
        // share a domain with carrier payment pages.
        if (WEBMAIL_SOURCE.test(source)) return "Email";
        if (OWN_HOSTS.some((re) => re.test(source)) || PAYMENT_HOSTS.some((re) => re.test(source))) return "Internal / Payment";
        if (AI_SOURCE.test(source)) return "AI Assistants";
        return null;
    }

    // Social networks by their short and long source names — "ig"/"fb"
    // are what Meta's own UTM templates send.
    const SOCIAL_SOURCE = /^(ig|fb|instagram|facebook|meta|l\.facebook\.com|m\.facebook\.com|lm\.facebook\.com|instagram\.com|facebook\.com|line|line\.me|twitter|x|t\.co|x\.com|twitter\.com|tiktok|tiktok\.com|pinterest|pinterest\.com|youtube|youtube\.com|m\.youtube\.com)$/;

    // GA4 default channel group names -> this dashboard's keys.
    const GA4_CHANNEL_MAP = {
        "unassigned": "(not set)",
        "(not set)": "(not set)",
        "organic social": "Social",
        "organic video": "Video",
        "paid video": "Video",
        "organic shopping": "Shopping",
        "paid shopping": "Shopping",
        "cross-network": "Cross-network",
        "paid other": "Paid (Other)",
        "mobile push notifications": "Other",
        "sms": "Other",
        "audio": "Other"
    };

    function normalizeGa4Channel(ch) {
        if (!ch) return null;
        const key = String(ch).trim();
        return GA4_CHANNEL_MAP[key.toLowerCase()] || key;
    }

    function classifySourceChannel(sourceMedium) {
        if (!sourceMedium) return "Other";
        const parts = String(sourceMedium).split("/").map((s) => s.trim().toLowerCase());
        const source = parts[0] || "";
        const medium = parts[1] || "";

        const special = specialBucket(source);
        if (special) return special;

        // Broken/missing attribution (bad UTMs, cross-domain linking
        // gaps, ad blockers stripping referrers, etc.) — kept as its
        // own bucket rather than folded into "Other" so it's visible
        // instead of quietly inflating a generic catch-all.
        if (isUnattributed(source, medium)) return "(not set)";

        if (source === "(direct)" && (medium === "(none)" || medium === "")) return "Direct";
        // A social network with a paid medium is paid social, not paid
        // search ("ig / paid", "fb / paid" used to land in Paid Search);
        // a social network linking in normally is social, not referral.
        if (SOCIAL_SOURCE.test(source)) {
            if (/cpc|ppc|paid|cpm|ads?$/.test(medium)) return "Paid Social";
            if (medium === "display" || medium === "banner") return "Display";
            return "Social";
        }
        if (medium === "organic") return "Organic Search";
        // Paid social has to be checked before plain "paid"/"social" —
        // Meta's own auto-tagging sends "paid_social", which used to
        // fall all the way through to "Other".
        if (/^(paid[_\- ]?social|social[_\- ]?paid|paidsocial|social[_\- ]?ads?)$/.test(medium)) return "Paid Social";
        if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "paidsearch" || medium === "paid_search") return "Paid Search";
        if (medium === "email" || medium === "e-mail" || medium === "newsletter" || medium === "mail") return "Email";
        if (medium === "affiliate" || medium === "affiliates") return "Affiliates";
        if (medium === "referral") return "Referral";
        if (medium === "display" || medium === "cpm" || medium === "banner" || medium === "interstitial") return "Display";
        if (medium === "social" || medium === "social-network" || medium === "social-media" || medium === "sm") return "Social";
        return "Other";
    }

    // GA4 reports missing attribution two ways: "(not set)" (broken
    // UTMs, cross-domain gaps) and "(data not available)" (consent mode
    // / thresholding). Both mean "we don't know where this came from",
    // so they share one bucket instead of the second hiding in "Other".
    function isUnattributed(source, medium) {
        const blank = (v) => v === "(not set)" || v === "(data not available)";
        return blank(source) || blank(medium);
    }

    /* ==========================================================
       Ad Platform classification
       A finer cut than the standard channel grouping above —
       groups by the actual vendor (Google, Meta, Yahoo, Criteo,
       LINE, Bing…) and splits paid vs organic within each, so ad
       spend efficiency can be compared platform-by-platform
       instead of lumped into "Paid Search" / "Display" / "Social".
       This is what different agencies actually run campaigns on,
       so it's the more useful cut when the question is "which
       platform's ads are working."
    ========================================================== */

    const PLATFORM_MATCHERS = [
        { test: /youtube|youtu\.be/, label: "YouTube" },
        { test: /google|doubleclick|admanager/, label: "Google" },
        { test: /facebook|instagram|meta|^ig$|^fb$/, label: "Meta" },
        { test: /yahoo|^ydn$|overture/, label: "Yahoo" },
        { test: /criteo/, label: "Criteo" },
        { test: /^line$|\bline\b/, label: "LINE" },
        { test: /bing|microsoft/, label: "Bing" },
        { test: /twitter|^x\.com$|^x$/, label: "Twitter/X" },
        { test: /pinterest/, label: "Pinterest" },
        { test: /rakuten/, label: "Rakuten" },
        { test: /newsletter|email|mailchimp|klaviyo/, label: "Email" }
    ];

    // Platforms that run both ads and organic/owned presence get
    // split into "<Platform> Ads" vs "<Platform> Organic" so the two
    // don't get averaged together; platforms below are effectively
    // single-channel in this data and read fine as just the name.
    const SPLIT_PAID_ORGANIC = ["Google", "Meta", "Yahoo", "Bing"];

    function classifyPlatform(sourceMedium) {
        if (!sourceMedium) return "Other";
        const parts = String(sourceMedium).split("/").map((s) => s.trim().toLowerCase());
        const source = parts[0] || "";
        const medium = parts[1] || "";

        const special = specialBucket(source);
        if (special) return special;

        if (isUnattributed(source, medium)) return "(not set)";

        if (source === "(direct)" && (medium === "(none)" || medium === "")) return "Direct";

        const match = PLATFORM_MATCHERS.find((m) => m.test.test(source));
        if (match) {
            if (SPLIT_PAID_ORGANIC.includes(match.label)) {
                const isPaid = /cpc|ppc|paid|cpm|display|banner/.test(medium);
                if (isPaid) return `${match.label} Ads`;
                // e.g. news.yahoo.co.jp / referral is a link from a Yahoo
                // site, not Yahoo search — don't call it "Organic".
                if (medium === "referral") return `${match.label} Referral`;
                return `${match.label} Organic`;
            }
            return match.label;
        }

        if (medium === "referral") return "Referral (Other)";
        if (medium === "organic") return "Organic Search (Other)";
        if (medium === "social") return "Social (Other)";
        if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "cpm" || medium === "display") return "Paid (Other)";
        return "Other";
    }

    // Same classification a source/medium row would fall into for a
    // given groupBy ("platform" or "channel") — shared so the Session
    // Source table can be filtered down to exactly the rows behind
    // one doughnut/comparison-table bucket (e.g. drilling into
    // "Referral (Other)" to see which sites make it up).
    // Memoized on the row: the per-channel trend/anomaly code re-classifies
    // every source row once per channel on every render (≈4s for "This
    // Year"), and a row's sourceMedium never changes after load.
    function classifyForGroupBy(row, groupBy) {
        if (groupBy === "source") return row.sourceMedium;
        if (groupBy === "platform") {
            if (row._platform === undefined) row._platform = classifyPlatform(row.sourceMedium);
            return row._platform;
        }
        if (row._channel === undefined) {
            const source = String(row.sourceMedium || "").split("/")[0].trim().toLowerCase();
            // Our special buckets win even over GA4's grouping (GA4 calls
            // the payment gateway "Referral"); otherwise prefer GA4's own
            // channel when the export has it, else classify from text.
            row._channel = specialBucket(source) || normalizeGa4Channel(row.channel) || classifySourceChannel(row.sourceMedium);
        }
        return row._channel;
    }

    // Distinct channel values actually present in the data, used to
    // populate the "All Sources" filter dropdown with real options
    // instead of a hardcoded list that might not match what's there.
    function listAvailableChannels(sourceRows, groupBy = "channel") {
        const set = new Set();
        (sourceRows || []).forEach((r) => set.add(classifyForGroupBy(r, groupBy)));
        return Array.from(set).sort();
    }

    // Collapses per-day-per-source rows (already filtered down to one
    // channel by the caller) into one row per date, in the same shape
    // as the daily GA4 rollup — lets the "All Sources" filter reuse
    // filterDailyRange/buildBusinessMonths/the trend chart exactly as
    // they already work, just fed a source-scoped daily series instead
    // of the full-property one.
    function buildDailyRowsFromSources(sourceRows) {
        const byDate = {};
        (sourceRows || []).forEach((r) => {
            if (!byDate[r.date]) byDate[r.date] = { date: r.date, users: 0, sessions: 0, purchases: 0, revenue: 0 };
            const d = byDate[r.date];
            d.users += r.users;
            d.sessions += r.sessions;
            d.purchases += r.purchases;
            d.revenue += r.revenue;
        });
        return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    function deriveTrafficBreakdown(sourceRows, groupBy) {
        const totals = {};
        let totalSessions = 0;

        sourceRows.forEach((r) => {
            const channel = classifyForGroupBy(r, groupBy);
            if (!totals[channel]) totals[channel] = { sessions: 0, revenue: 0, purchases: 0 };
            totals[channel].sessions += r.sessions;
            totals[channel].revenue += r.revenue;
            totals[channel].purchases += r.purchases;
            totalSessions += r.sessions;
        });

        const entries = Object.entries(totals)
            .filter(([, t]) => t.sessions > 0)
            .sort((a, b) => b[1].sessions - a[1].sessions);

        return {
            totalSessions,
            labels: entries.map(([channel]) => channel),
            values: entries.map(([, t]) => totalSessions ? Math.round((t.sessions / totalSessions) * 100) : 0),
            channels: entries.map(([channel, t]) => ({
                label: channel,
                sessions: t.sessions,
                revenue: t.revenue,
                cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0,
                percent: totalSessions ? Math.round((t.sessions / totalSessions) * 100) : 0
            }))
        };
    }

    /* ==========================================================
       Date Range Resolution
       Supports both rolling windows (7d/14d/3m/6m) and
       calendar-anchored windows (this month/this year/last year).

       "Previous period" for delta comparisons is normally the
       same-length window immediately preceding the start date.
       Year-level ranges ("year", "lastYear") are the exception:
       since they're meant to show seasonal performance, their
       comparison window is the same month/day span exactly one
       calendar year earlier — e.g. Jan 1–Jul 22 2026 compares to
       Jan 1–Jul 22 2025, not a same-length rolling window ending
       Dec 31 2025 (which would land mostly in H2 and say nothing
       about season-over-season change).
    ========================================================== */

    function startOfDay(d) {
        const copy = new Date(d);
        copy.setHours(0, 0, 0, 0);
        return copy;
    }

    // Local midnight Date -> "YYYY-MM-DD" (the inverse of parseLocalDate).
    function toLocalDateKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // "YYYY-MM-DD" -> local midnight. new Date("2026-10-01") parses as
    // UTC midnight, which lands on the PREVIOUS local day for anyone
    // viewing from a timezone behind UTC — this keeps every row on the
    // calendar date it was exported for, wherever the viewer is.
    function parseLocalDate(dateStr) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
        if (!m) return startOfDay(new Date(dateStr));
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    function daysAgo(n, from) {
        const d = startOfDay(from || new Date());
        d.setDate(d.getDate() - n);
        return d;
    }

    // Multi-day ranges end YESTERDAY, not today: today's row is still
    // filling up (GA4 shows a partial day), so including it compared a
    // part-day against a window of full days and dragged every delta
    // and daily average down. "Today" is the one range that still
    // shows today — flagged partial so the UI can say so.
    const RANGE_DEFS = {
        "today": () => ({ start: startOfDay(new Date()), end: startOfDay(new Date()), partial: true }),
        "yesterday": () => ({ start: daysAgo(1), end: daysAgo(1) }),
        "7d": () => ({ start: daysAgo(7), end: daysAgo(1) }),
        "14d": () => ({ start: daysAgo(14), end: daysAgo(1) }),
        "30d": () => ({ start: daysAgo(30), end: daysAgo(1) }),
        "month": () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            // On the 1st there are no complete days yet this month —
            // fall back to today-so-far rather than an empty range.
            if (now.getDate() === 1) return { start, end: startOfDay(now), partial: true };
            return { start, end: daysAgo(1) };
        },
        "lastMonth": () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day of previous month
            return { start, end: startOfDay(end) };
        },
        "3m": () => ({ start: daysAgo(90), end: daysAgo(1) }),
        "6m": () => ({ start: daysAgo(180), end: daysAgo(1) }),
        "year": () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), 0, 1);
            if (now.getMonth() === 0 && now.getDate() === 1) return { start, end: startOfDay(now), partial: true };
            return { start, end: daysAgo(1) };
        },
        "lastYear": () => {
            const y = new Date().getFullYear() - 1;
            return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
        }
    };

    // Ranges whose comparison window should be "same calendar dates,
    // one year back" rather than "same number of days, immediately
    // preceding" — see note above.
    const YEAR_ALIGNED_RANGES = new Set(["year", "lastYear"]);

    // compareMode: "previous" (default) = same length, immediately
    // preceding — except the two ranges above, which are already
    // year-aligned by definition. "yoy" = same calendar dates, exactly
    // one year back, regardless of which range is selected — e.g. a
    // custom Jun 1–Sep 2 2026 range compares to Jun 1–Sep 2 2025, not
    // to the 94 days immediately before it.
    // Set by app.js once the daily feed loads (see setLatestDataDate).
    let latestDataDate = null;

    function setLatestDataDate(d) {
        latestDataDate = d ? startOfDay(d) : null;
    }

    function resolveRange(rangeKey, customRange, compareMode = "previous") {
        let start, end, partial = false;
        if (rangeKey === "custom" && customRange && customRange.start && customRange.end) {
            start = startOfDay(customRange.start);
            end = startOfDay(customRange.end);
            partial = end >= startOfDay(new Date());
        } else {
            const def = RANGE_DEFS[rangeKey] || RANGE_DEFS["month"];
            ({ start, end, partial = false } = def());
        }

        // (2) GA4 exports can lag: if yesterday hasn't landed yet, a
        // "last 7 days" ending yesterday would really hold 6 days and
        // be compared with 7. Clamp to the last date in the data.
        if (!partial && latestDataDate && end > latestDataDate && latestDataDate >= start) {
            end = new Date(latestDataDate);
        }

        const spanDays = Math.round((end - start) / 86400000) + 1;

        let prevStart, prevEnd;
        if (compareMode === "yoy" || YEAR_ALIGNED_RANGES.has(rangeKey)) {
            prevStart = startOfDay(new Date(start.getFullYear() - 1, start.getMonth(), start.getDate()));
            prevEnd = startOfDay(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()));
        } else {
            prevEnd = new Date(start);
            prevEnd.setDate(prevEnd.getDate() - 1);
            prevStart = daysAgo(spanDays - 1, prevEnd);
        }

        // isYoy: the comparison window really is "same dates last year" —
        // either chosen explicitly, or implied by a year-level range.
        const isYoy = compareMode === "yoy" || YEAR_ALIGNED_RANGES.has(rangeKey);
        return { start, end, spanDays, prevStart, prevEnd, compareMode, partial, isYoy };
    }

    function inRange(dateStr, start, end) {
        const d = parseLocalDate(dateStr);
        return d >= start && d <= end;
    }

    // Whether any row in dailyRows falls inside [start, end] — used
    // to tell "the comparison period is genuinely all zero" apart
    // from "there's no data at all to compare against" (e.g. a
    // same-period-last-year comparison reaching further back than
    // the data actually goes), so the latter can show a warning
    // instead of a silently misleading "0.0% change".
    function hasDataInRange(dailyRows, start, end) {
        return (dailyRows || []).some((r) => inRange(r.date, start, end));
    }

    /* ==========================================================
       Daily rows -> KPI cards + trend chart
    ========================================================== */

    function filterDailyRange(dailyRows, rangeKey, customRange, compareMode = "previous") {

        const { start, end, prevStart, prevEnd } = resolveRange(rangeKey, customRange, compareMode);

        const current = dailyRows.filter((r) => inRange(r.date, start, end));
        const previous = dailyRows.filter((r) => inRange(r.date, prevStart, prevEnd));

        const sum = (rows, key) => rows.reduce((acc, r) => acc + r[key], 0);

        const curUsers = sum(current, "users");
        const curSessions = sum(current, "sessions");
        const curPurchases = sum(current, "purchases");
        const curRevenue = sum(current, "revenue");

        const prevUsers = sum(previous, "users");
        const prevSessions = sum(previous, "sessions");
        const prevPurchases = sum(previous, "purchases");
        const prevRevenue = sum(previous, "revenue");

        const curCvr = curSessions ? (curPurchases / curSessions) * 100 : 0;
        const prevCvr = prevSessions ? (prevPurchases / prevSessions) * 100 : 0;
        const curAov = curPurchases ? curRevenue / curPurchases : 0;
        const prevAov = prevPurchases ? prevRevenue / prevPurchases : 0;
        const dayCount = current.length || 1;

        return {
            labels: current.map((r) => window.I18N.formatDayLabel(r.date)),
            series: {
                users: current.map((r) => r.users),
                sessions: current.map((r) => r.sessions),
                purchases: current.map((r) => r.purchases),
                revenue: current.map((r) => r.revenue),
                cvr: current.map((r) => (r.sessions ? (r.purchases / r.sessions) * 100 : 0))
            },
            kpi: {
                users: { value: curUsers, delta: pctDelta(curUsers, prevUsers), daily: curUsers / dayCount },
                sessions: { value: curSessions, delta: pctDelta(curSessions, prevSessions), daily: curSessions / dayCount },
                purchases: { value: curPurchases, delta: pctDelta(curPurchases, prevPurchases), daily: curPurchases / dayCount },
                revenue: { value: curRevenue, delta: pctDelta(curRevenue, prevRevenue), daily: curRevenue / dayCount },
                aov: { value: curAov, delta: pctDelta(curAov, prevAov), previous: prevAov },
                // CVR change is reported in percentage POINTS (deltaPts),
                // which is how it's usually read — "6.07% -> 6.79%" is
                // +0.72pt, not "+11.9%". delta (relative) is kept for
                // the trend arrow's direction and the insight ranking.
                cvr: {
                    value: curCvr,
                    delta: pctDelta(curCvr, prevCvr),
                    deltaPts: prevSessions ? curCvr - prevCvr : null,
                    target: CONFIG.CVR_TARGET,
                    daily: CONFIG.CVR_TARGET
                }
            }
        };
    }

    // null (not 0) when there's nothing to compare against, so the UI
    // can say "new" instead of a misleading "0.0%".
    function pctDelta(curr, prev) {
        return prev ? ((curr - prev) / prev) * 100 : null;
    }

    /* ==========================================================
       Key Insights
       Turns the KPI deltas and traffic channel breakdown that
       are already computed for the current date range into a
       few sentences, so the panel reflects whatever range/filter
       is active instead of showing fixed placeholder text.
    ========================================================== */

    // Wraps a figure in a <span> so ui.js's renderInsights (which
    // inserts these strings via innerHTML) can visually emphasize it
    // with color — green/red for a clear direction, blue for a
    // neutral highlight like a share-of-total. Kept as a tiny helper
    // here rather than in ui.js since this is where the sentiment
    // ("is this good or bad") is actually known.
    function highlight(text, sentiment) {
        return `<span class="insightNum ${sentiment}">${text}</span>`;
    }

    // hasCompareData: skip every delta-dependent sentence (revenue
    // change, biggest mover, CVR change) when the comparison window
    // has no underlying data — see hasDataInRange — rather than
    // reporting a misleading "decreased by 0.0%" derived from an
    // all-zero previous period.
    function buildInsights(kpi, channels, hasCompareData = true) {
        const insights = [];

        if (hasCompareData && kpi && kpi.revenue && kpi.revenue.delta !== null) {
            const d = kpi.revenue.delta;
            const figure = highlight(`${Math.abs(d).toFixed(1)}%`, d >= 0 ? "pos" : "neg");
            const direction = window.I18N.t(d >= 0 ? "insight.increased" : "insight.decreased");
            insights.push(window.I18N.t("insight.revenueChange", { direction, figure }));
        }

        if (channels && channels.length) {
            const totalRevenue = channels.reduce((sum, c) => sum + c.revenue, 0);
            const realChannels = channels.filter((c) => !NOT_A_CHANNEL.has(c.label));
            const pool = realChannels.length ? realChannels : channels;
            const topByRevenue = pool.reduce((a, b) => (b.revenue > a.revenue ? b : a), pool[0]);
            const share = totalRevenue ? Math.round((topByRevenue.revenue / totalRevenue) * 100) : 0;
            const label = `<strong>${escapeHtml(window.I18N.channelLabel(topByRevenue.label))}</strong>`;
            insights.push(window.I18N.t("insight.topChannelRevenue", { label, figure: highlight(share + "%", "neutral") }));

            const notSet = channels.find((c) => c.label === "(not set)");
            if (notSet) {
                const totalSessions = channels.reduce((sum, c) => sum + c.sessions, 0);
                const notSetShare = totalSessions ? Math.round((notSet.sessions / totalSessions) * 100) : 0;
                if (notSetShare >= 5) {
                    const figure = highlight(notSetShare + "%", "neg");
                    const notSetLabel = `<strong>${escapeHtml(window.I18N.channelLabel("(not set)"))}</strong>`;
                    insights.push(window.I18N.t("insight.notSetShare", { figure, notSet: notSetLabel }));
                }
            }
        }

        if (hasCompareData && kpi) {
            const movers = [
                { key: "users", labelKey: "insight.mover.users" },
                { key: "sessions", labelKey: "insight.mover.sessions" },
                { key: "purchases", labelKey: "insight.mover.purchases" }
            ];
            let biggest = null;
            movers.forEach(({ key, labelKey }) => {
                const d = kpi[key] ? kpi[key].delta : null;
                if (d === null) return;
                if (!biggest || Math.abs(d) > Math.abs(biggest.delta)) biggest = { labelKey, delta: d };
            });
            if (biggest) {
                const figure = highlight(`${Math.abs(biggest.delta).toFixed(1)}%`, biggest.delta >= 0 ? "pos" : "neg");
                const direction = window.I18N.t(biggest.delta >= 0 ? "insight.increased" : "insight.decreased");
                insights.push(window.I18N.t("insight.moverChange", { label: window.I18N.t(biggest.labelKey), direction, figure }));
            }
        }

        if (hasCompareData && kpi && kpi.cvr && kpi.cvr.delta !== null) {
            const d = kpi.cvr.delta;
            const figure = highlight(`${kpi.cvr.value.toFixed(2)}%`, d >= 0 ? "pos" : "neg");
            const direction = window.I18N.t(d >= 0 ? "insight.cvrImproved" : "insight.cvrDeclined");
            insights.push(window.I18N.t("insight.cvrChange", { direction, figure }));
        }

        return insights;
    }

    /* ==========================================================
       New / Repeat Insights
       Runs on the FULL New/Repeat history (not just the 12 months
       shown in the table), since the year-over-year and trend
       comparisons below need to look back further than the visible
       window.
    ========================================================== */

    function buildNewRepeatInsights(rows) {
        const insights = [];
        if (!rows || rows.length < 2) return insights;

        const latest = rows[rows.length - 1];
        const orderShare = (r) => (r.newOrders + r.repeatOrders)
            ? (r.newOrders / (r.newOrders + r.repeatOrders)) * 100
            : 0;
        const latestShare = orderShare(latest);
        const period = `<strong>${latest.period}</strong>`;
        const shareText = highlight(latestShare.toFixed(1) + "%", "neutral");

        // New customer share of orders, with YoY comparison once a
        // full year of history is available.
        if (rows.length > 12) {
            const yearAgo = rows[rows.length - 13];
            const diff = latestShare - orderShare(yearAgo);
            const figure = highlight(`${Math.abs(diff).toFixed(1)} ${window.I18N.t("unit.pts")}`, diff >= 0 ? "pos" : "neg");
            const direction = window.I18N.t(diff >= 0 ? "newRepeatInsight.up" : "newRepeatInsight.down");
            insights.push(window.I18N.t("newRepeatInsight.newShareYoy", { share: shareText, period, direction, figure }));
        } else {
            insights.push(window.I18N.t("newRepeatInsight.newShare", { share: shareText, period }));
        }

        // Repeat customers' share of revenue — often a different
        // number than their share of orders, since basket sizes differ.
        const repeatRevenueShare = latest.totalRevenue ? (latest.repeatRevenue / latest.totalRevenue) * 100 : 0;
        insights.push(window.I18N.t("newRepeatInsight.repeatRevenueShare", {
            figure: highlight(repeatRevenueShare.toFixed(1) + "%", "neutral"),
            period
        }));

        // AOV comparison between new and repeat customers this month.
        const newAov = latest.newOrders ? latest.newRevenue / latest.newOrders : 0;
        const repeatAov = latest.repeatOrders ? latest.repeatRevenue / latest.repeatOrders : 0;
        if (newAov && repeatAov) {
            const repeatHigher = repeatAov >= newAov;
            const pctDiff = repeatHigher
                ? ((repeatAov - newAov) / newAov) * 100
                : ((newAov - repeatAov) / repeatAov) * 100;
            const higher = Math.round(repeatHigher ? repeatAov : newAov).toLocaleString("en-US");
            const lower = Math.round(repeatHigher ? newAov : repeatAov).toLocaleString("en-US");
            if (pctDiff < 2) {
                insights.push(window.I18N.t("newRepeatInsight.aovSame", { higher, lower }));
            } else {
                const figure = highlight(`${pctDiff.toFixed(1)}%`, "neutral");
                const who = window.I18N.t(repeatHigher ? "newRepeatInsight.repeat" : "newRepeatInsight.new");
                const otherWho = window.I18N.t(repeatHigher ? "newRepeatInsight.newLower" : "newRepeatInsight.repeatLower");
                insights.push(window.I18N.t("newRepeatInsight.aovDiff", { who, otherWho, figure, higher, lower }));
            }
        }

        // Recent direction: average new-customer share over the last
        // 3 months vs the 3 months before that.
        if (rows.length >= 6) {
            const avgShare = (arr) => arr.reduce((sum, r) => sum + orderShare(r), 0) / arr.length;
            const trendDiff = avgShare(rows.slice(-3)) - avgShare(rows.slice(-6, -3));
            if (Math.abs(trendDiff) >= 1) {
                const figure = highlight(`${Math.abs(trendDiff).toFixed(1)} ${window.I18N.t("unit.pts")}`, trendDiff >= 0 ? "pos" : "neg");
                const direction = window.I18N.t(trendDiff >= 0 ? "newRepeatInsight.trendingUp" : "newRepeatInsight.trendingDown");
                insights.push(window.I18N.t("newRepeatInsight.trend", { direction, figure }));
            }
        }

        return insights;
    }

    /* ==========================================================
       Anomaly Detection
       Flags any day within the selected range whose value sits
       far outside that same range's own average (z-score based,
       so "far outside" is relative to the period, not a fixed
       number) — a simple stand-in for "something happened here"
       without needing an external events calendar.
    ========================================================== */

    const ANOMALY_Z_THRESHOLD = 2;
    const ANOMALY_MIN_DAYS = 5;

    const ANOMALY_METRIC_I18N_KEYS = {
        users: "kpi.totalUsers",
        sessions: "kpi.sessions",
        purchases: "kpi.purchases",
        revenue: "kpi.revenue",
        cvr: "kpi.cvr"
    };

    const ANOMALY_FORMATTERS = {
        users: (v) => Math.round(v).toLocaleString("en-US"),
        sessions: (v) => Math.round(v).toLocaleString("en-US"),
        purchases: (v) => Math.round(v).toLocaleString("en-US"),
        revenue: (v) => "¥" + Math.round(v).toLocaleString("en-US"),
        cvr: (v) => v.toFixed(2) + "%"
    };

    // Today's row is still accumulating live traffic, so it always
    // reads as a drop relative to any finished day — not a real
    // anomaly. Strip it before anomaly detection only; KPI totals
    // still include today, since "This Month" etc. should naturally
    // include today-so-far like any other dashboard.
    function excludeToday(labels, series) {
        const todayLabel = window.I18N.formatDayLabel(new Date());
        if (!labels.length || labels[labels.length - 1] !== todayLabel) {
            return { labels, series };
        }
        const trimmedSeries = {};
        Object.keys(series).forEach((key) => {
            trimmedSeries[key] = series[key].slice(0, -1);
        });
        return { labels: labels.slice(0, -1), series: trimmedSeries };
    }

    function detectAnomalies(labels, series) {
        const anomalies = [];

        Object.keys(series || {}).forEach((key) => {
            const values = series[key] || [];
            const n = values.length;
            if (n < ANOMALY_MIN_DAYS) return;

            const mean = values.reduce((a, b) => a + b, 0) / n;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            if (!stdDev) return;

            const format = ANOMALY_FORMATTERS[key] || ((v) => v);

            values.forEach((v, i) => {
                const z = (v - mean) / stdDev;
                if (Math.abs(z) >= ANOMALY_Z_THRESHOLD) {
                    anomalies.push({
                        key,
                        index: i,
                        value: v,
                        mean,
                        metric: window.I18N.t(ANOMALY_METRIC_I18N_KEYS[key] || key),
                        date: labels[i],
                        valueText: format(v),
                        meanText: format(mean),
                        z,
                        direction: z > 0 ? "spike" : "drop"
                    });
                }
            });
        });

        anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
        return anomalies;
    }

    function buildAnomalyInsights(labels, series) {
        const trimmed = excludeToday(labels, series);
        return detectAnomalies(trimmed.labels, trimmed.series)
            .slice(0, 2)
            .map((a) => {
                const verb = window.I18N.t(a.direction === "spike" ? "anomaly.spike" : "anomaly.drop");
                const figure = highlight(a.valueText, a.direction === "spike" ? "pos" : "neg");
                return window.I18N.t("anomaly.sentence", {
                    metric: a.metric,
                    verb,
                    date: a.date,
                    figure,
                    mean: a.meanText
                });
            });
    }

    /* ==========================================================
       Traffic Sources Anomaly Detection
       Same z-score method as the KPI-level detector just above
       (detectAnomalies), but run once per channel/platform's OWN
       daily sessions series rather than the property-wide total —
       flags a channel that swung unusually for ITSELF, which the
       KPI-level detector can miss entirely (a channel going from
       40 to 90 sessions barely moves the property-wide total, but
       is exactly the swing worth investigating on its own terms —
       this is the "where did that day's anomaly come from at the
       channel level" counterpart to the landing-page spike/source
       drill-down).

       channels should be trafficCurrent.channels (deriveTrafficBreakdown's
       output) — just used here as the current period's set of
       labels to check; each label's own daily series is rebuilt
       via buildChannelTrend so the detector always looks at the
       exact same grouping (platform/channel) currently on screen.
    ========================================================== */

    const CHANNEL_ANOMALY_MIN_MEAN = 20; // sessions/day

    function buildChannelAnomalyInsights(sourceRows, channels, groupBy, range) {
        if (!channels || !channels.length || !range) return [];

        const anomalies = [];
        channels.forEach((c) => {
            const trend = buildChannelTrend(sourceRows, c.label, groupBy, range);
            const trimmed = excludeToday(trend.labels, { sessions: trend.series.sessions.current });
            const values = trimmed.series.sessions;
            const n = values.length;
            if (n < ANOMALY_MIN_DAYS) return;

            const mean = values.reduce((a, b) => a + b, 0) / n;
            // Tiny channels swing wildly in relative terms (2 -> 6
            // sessions is a "spike" by z-score) — skip them.
            if (mean < CHANNEL_ANOMALY_MIN_MEAN) return;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            if (!stdDev) return;

            // Always locate this channel's single most extreme day (same
            // "report the most extreme day" approach as
            // buildLandingPageDailySeries) — only kept below if it clears
            // ANOMALY_Z_THRESHOLD, same bar the KPI-level detector uses.
            let bestZ = null;
            let bestIdx = null;
            values.forEach((v, i) => {
                const z = (v - mean) / stdDev;
                if (bestZ === null || Math.abs(z) > Math.abs(bestZ)) {
                    bestZ = z;
                    bestIdx = i;
                }
            });
            if (bestIdx === null || Math.abs(bestZ) < ANOMALY_Z_THRESHOLD) return;

            anomalies.push({
                channel: c.label,
                date: trimmed.labels[bestIdx],
                value: values[bestIdx],
                mean,
                z: bestZ,
                direction: bestZ > 0 ? "spike" : "drop"
            });
        });

        anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

        // Same "anomaly.sentence" template the KPI-level insights use
        // (just {metric} standing in for the channel name here) — one
        // consistent sentence shape for "something unusual happened"
        // everywhere in the app, rather than a second phrasing to
        // maintain in both languages.
        return anomalies.slice(0, 2).map((a) => {
            const verb = window.I18N.t(a.direction === "spike" ? "anomaly.spike" : "anomaly.drop");
            const figure = highlight(Math.round(a.value).toLocaleString("en-US"), a.direction === "spike" ? "pos" : "neg");
            const sentence = window.I18N.t("anomaly.sentence", {
                metric: `<strong>${escapeHtml(window.I18N.channelLabel(a.channel))}</strong>`,
                verb,
                date: a.date,
                figure,
                mean: Math.round(a.mean).toLocaleString("en-US")
            });
            return { ...a, sentence };
        });
    }

    /* ==========================================================
       Briefing (Overview)
       Turns everything already computed for the selected period
       into (1) a one-line headline + supporting sentence and
       (2) a ranked list of "stories" — what changed, why it
       matters, and where to look next. Each story carries its own
       small series for a sparkline and an `action` the UI can hand
       back to app.js for the click-through, so the Overview reads
       top to bottom like a morning briefing instead of a grid of
       numbers the reader has to interpret themselves.

       Scores are deliberately simple and fixed per story type
       (tracking problems > conversion problems > spikes > FYIs),
       nudged by size, so the ordering is predictable and easy to
       tune here rather than emerging from an opaque formula.
    ========================================================== */

    const BRIEF_MIN_CHANNEL_SESSIONS = 300;
    // Buckets that aren't acquisition channels — never "the top channel"
    // and never a "converts well / doesn't convert" story. Internal /
    // Payment sessions are mid-checkout by definition, so their CVR is
    // meaningless as a channel metric.
    const NOT_A_CHANNEL = new Set(["(not set)", "Direct", "Internal / Payment"]);   // ignore tiny channels for efficiency stories
    const BRIEF_LOW_CVR_RATIO = 0.4;          // < 40% of site CVR = "not converting"
    const BRIEF_HIGH_CVR_RATIO = 2;           // >= 2x site CVR = "high-efficiency"
    const BRIEF_AOV_MOVE_PCT = 10;            // AOV change worth mentioning

    function fmtYenShort(v) {
        if (Math.abs(v) >= 1e6) return "¥" + (v / 1e6).toFixed(1) + "M";
        if (Math.abs(v) >= 1e4) return "¥" + Math.round(v / 1e3).toLocaleString("en-US") + "k";
        return "¥" + Math.round(v).toLocaleString("en-US");
    }
    const fmtInt = (v) => Math.round(v).toLocaleString("en-US");
    const fmtPctSigned = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";

    // input: {
    //   kpi, hasCompareData, labels, series,        — from filterDailyRange
    //   channels,                                   — deriveTrafficBreakdown(current).channels
    //   comparisonRows,                             — buildTrafficComparison()
    //   channelAnomalies,                           — buildChannelAnomalyInsights()
    //   risingPage, pageSpikes,                     — landing-page detectors
    //   sourceRows, groupBy, range                  — for per-channel sparklines
    // }
    function buildBriefing(input) {
        const t = window.I18N.t;
        const chLabel = (l) => escapeHtml(window.I18N.channelLabel(l));
        const { kpi, hasCompareData, channels = [], comparisonRows = [], range } = input;
        const stories = [];

        // (1) Nothing in the window yet (e.g. "Today" before the first
        // export lands) — say so instead of "Revenue ¥0, −100%" and a
        // "CVR 0.00% below target" lead story.
        if (!kpi.sessions || !kpi.sessions.value) {
            return { headline: { main: t("brief.headline.empty"), dek: "" }, stories: [] };
        }
        // A partial day (Today, or the 1st of the month) compared against
        // full days isn't a fair fight — keep the numbers, drop the
        // comparisons that would read as a collapse.
        const fairCompare = hasCompareData && !(range && range.partial);

        const channelSpark = (label) => {
            if (!input.sourceRows || !range) return null;
            const trend = buildChannelTrend(input.sourceRows, label, input.groupBy, range);
            return { values: trend.series.sessions.current, compare: trend.series.sessions.previous, labels: trend.labels };
        };

        const siteCvr = kpi.cvr.value;
        const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
        const totalSessions = channels.reduce((s, c) => s + c.sessions, 0);

        // ---- 1. Tracking gap: unattributed sessions ----
        const notSetRow = comparisonRows.find((r) => r.label === "(not set)");
        // Skipped on a partial day: GA4 reports the freshest hours as
        // "(not set)" until attribution is processed (often 70%+ of
        // today), which is lag, not a broken tracker.
        if (notSetRow && notSetRow.current && totalSessions && !(range && range.partial)) {
            const cur = notSetRow.current.sessions;
            const prev = notSetRow.previous ? notSetRow.previous.sessions : 0;
            const share = (cur / totalSessions) * 100;
            const growth = prev ? ((cur - prev) / prev) * 100 : null;
            const jumped = growth !== null && growth >= 100 && cur >= 200;
            if (share >= 5 || jumped) {
                stories.push({
                    id: "tracking",
                    tone: "alert",
                    kicker: t("brief.kicker.tracking"),
                    title: jumped
                        ? t("brief.tracking.jumpTitle", { prev: fmtInt(prev), cur: fmtInt(cur) })
                        : t("brief.tracking.shareTitle", { share: share.toFixed(0) }),
                    body: t("brief.tracking.body", { share: share.toFixed(1) }),
                    stat: jumped ? fmtPctSigned(growth) : share.toFixed(0) + "%",
                    spark: channelSpark("(not set)"),
                    action: { type: "channel", channel: "(not set)" },
                    score: 95 + Math.min(share, 20)
                });
            }
        }

        // ---- 2. CVR vs target ----
        if (kpi.cvr && kpi.cvr.target && fairCompare) {
            const gap = kpi.cvr.value - kpi.cvr.target;
            const below = gap < 0;
            stories.push({
                id: "cvrTarget",
                tone: below ? "bad" : "good",
                kicker: t("brief.kicker.conversion"),
                title: t(below ? "brief.cvr.belowTitle" : "brief.cvr.aboveTitle", {
                    cvr: kpi.cvr.value.toFixed(2), target: kpi.cvr.target.toFixed(2)
                }),
                body: kpi.cvr.deltaPts !== null && hasCompareData
                    ? t("brief.cvr.body", {
                        pts: (kpi.cvr.deltaPts >= 0 ? "+" : "−") + Math.abs(kpi.cvr.deltaPts).toFixed(2),
                        vs: t(range && range.isYoy ? "brief.vs.yoy" : "brief.vs.prev")
                    })
                    : "",
                stat: (gap >= 0 ? "+" : "−") + Math.abs(gap).toFixed(2) + "pt",
                spark: { values: input.series.cvr, target: kpi.cvr.target },
                action: { type: "metric", metric: "cvr" },
                score: below ? 80 + Math.min(Math.abs(gap) * 10, 15) : 25
            });
        }

        // ---- 3. Channel efficiency: traffic that doesn't convert / converts unusually well ----
        if (siteCvr > 0) {
            const eligible = channels.filter((c) => c.sessions >= BRIEF_MIN_CHANNEL_SESSIONS && !NOT_A_CHANNEL.has(c.label));
            const weak = eligible
                .filter((c) => c.cvr < siteCvr * BRIEF_LOW_CVR_RATIO)
                .sort((a, b) => b.sessions - a.sessions)[0];
            if (weak) {
                const row = comparisonRows.find((r) => r.label === weak.label);
                const prev = row && row.previous ? row.previous.sessions : 0;
                const growth = prev ? ((weak.sessions - prev) / prev) * 100 : null;
                stories.push({
                    id: "weakChannel",
                    tone: "bad",
                    kicker: t("brief.kicker.channel"),
                    title: t("brief.weak.title", { label: chLabel(weak.label), cvr: weak.cvr.toFixed(2) }),
                    body: t(growth !== null && growth > 20 ? "brief.weak.bodyGrowing" : "brief.weak.body", {
                        sessions: fmtInt(weak.sessions),
                        growth: growth !== null ? fmtPctSigned(growth) : "",
                        revenue: fmtYenShort(weak.revenue),
                        site: siteCvr.toFixed(2)
                    }),
                    stat: weak.cvr.toFixed(2) + "%",
                    spark: channelSpark(weak.label),
                    action: { type: "channel", channel: weak.label },
                    score: 70 + Math.min((weak.sessions / Math.max(totalSessions, 1)) * 100, 15)
                });
            }
            const strong = eligible
                .filter((c) => c.cvr >= siteCvr * BRIEF_HIGH_CVR_RATIO)
                .sort((a, b) => b.revenue - a.revenue)[0];
            if (strong) {
                stories.push({
                    id: "strongChannel",
                    tone: "good",
                    kicker: t("brief.kicker.channel"),
                    title: t("brief.strong.title", { label: chLabel(strong.label), cvr: strong.cvr.toFixed(2) }),
                    body: t("brief.strong.body", {
                        site: siteCvr.toFixed(2),
                        revenue: fmtYenShort(strong.revenue),
                        share: totalRevenue ? ((strong.revenue / totalRevenue) * 100).toFixed(0) : "0"
                    }),
                    stat: (strong.cvr / siteCvr).toFixed(1) + "×",
                    spark: channelSpark(strong.label),
                    action: { type: "channel", channel: strong.label },
                    score: 40
                });
            }
        }

        // ---- 4. Day-level spikes/drops in the headline metrics ----
        const trimmed = excludeToday(input.labels || [], {
            sessions: (input.series || {}).sessions || [],
            revenue: (input.series || {}).revenue || [],
            purchases: (input.series || {}).purchases || []
        });
        const seenDays = new Set();
        const dayStories = {}; // date label -> story, so channel spikes on the same day can explain it
        detectAnomalies(trimmed.labels, trimmed.series).forEach((a) => {
            // One story per day — a revenue spike usually comes with a
            // purchases spike on the same day; that's one event.
            if (seenDays.has(a.date) || seenDays.size >= 2) return;
            seenDays.add(a.date);
            const isRevenue = a.key === "revenue";
            const fmt = isRevenue ? fmtYenShort : fmtInt;
            const spike = a.direction === "spike";
            stories.push(dayStories[a.date] = {
                id: "dayAnomaly-" + a.date,
                tone: spike ? "good" : "bad",
                kicker: t("brief.kicker.day"),
                title: t(spike ? "brief.day.spikeTitle" : "brief.day.dropTitle", { date: a.date, metric: a.metric }),
                body: t("brief.day.body", { value: fmt(a.value), mean: fmt(a.mean) }),
                stat: (a.value / (a.mean || 1)).toFixed(1) + "×",
                spark: { values: trimmed.series[a.key], highlight: a.index },
                action: { type: "metric", metric: a.key },
                score: 55 + Math.min(Math.abs(a.z) * 4, 15)
            });
        });

        // ---- 5. Channel-level spikes (skip channels already covered above) ----
        // A channel spiking on the same day as a site-wide spike is the
        // EXPLANATION of that spike, not a separate story — fold it in
        // as "driven by …" instead of listing it again below.
        const covered = new Set(stories.filter((s) => s.action && s.action.channel).map((s) => s.action.channel));
        const drivers = {};
        (input.channelAnomalies || []).forEach((a) => {
            if (a.direction === "spike" && dayStories[a.date]) {
                (drivers[a.date] = drivers[a.date] || []).push(a);
                return;
            }
            if (covered.has(a.channel)) return;
            const spike = a.direction === "spike";
            const spark = channelSpark(a.channel);
            stories.push({
                id: "channelAnomaly-" + a.channel,
                tone: spike ? "info" : "bad",
                kicker: t("brief.kicker.channel"),
                title: t(spike ? "brief.chDay.spikeTitle" : "brief.chDay.dropTitle", { date: a.date, label: chLabel(a.channel) }),
                body: t("brief.day.body", { value: fmtInt(a.value), mean: fmtInt(a.mean) }),
                stat: (a.value / (a.mean || 1)).toFixed(1) + "×",
                spark: spark ? { ...spark, highlight: spark.labels.indexOf(a.date) } : null,
                action: { type: "channel", channel: a.channel },
                score: 45 + Math.min(Math.abs(a.z) * 3, 10)
            });
        });

        Object.keys(drivers).forEach((date) => {
            const story = dayStories[date];
            const list = drivers[date].map((a) => t("brief.day.driverItem", {
                label: chLabel(a.channel), mean: fmtInt(a.mean), value: fmtInt(a.value)
            })).join(t("brief.dek.sep"));
            story.body += " " + t("brief.day.drivers", { list });
            // Clicking now opens the biggest driver's channel trend —
            // the most useful next step for "why did this day spike".
            story.action = { type: "channel", channel: drivers[date][0].channel };
        });

        // ---- 6. Average order value ----
        if (fairCompare && kpi.aov && kpi.aov.delta !== null && Math.abs(kpi.aov.delta) >= BRIEF_AOV_MOVE_PCT) {
            const up = kpi.aov.delta > 0;
            stories.push({
                id: "aov",
                tone: up ? "good" : "bad",
                kicker: t("brief.kicker.basket"),
                title: t(up ? "brief.aov.upTitle" : "brief.aov.downTitle", { pct: fmtPctSigned(kpi.aov.delta) }),
                body: t("brief.aov.body", { prev: fmtYenShort(kpi.aov.previous), cur: fmtYenShort(kpi.aov.value) }),
                stat: fmtYenShort(kpi.aov.value),
                spark: null,
                action: { type: "view", view: "sales" },
                score: 50
            });
        }

        // ---- 7. Landing pages: the 7-day riser + today/yesterday spikes, one story each ----
        if (input.risingPage) {
            const r = input.risingPage;
            stories.push({
                id: "risingPage",
                tone: "info",
                kicker: t("brief.kicker.page"),
                title: t("brief.rise.title", { title: escapeHtml(shortPageTitle(r.pageTitle)) }),
                body: t("brief.rise.body", { prev: fmtInt(r.previous), cur: fmtInt(r.current) }),
                stat: "+" + Math.round(r.changePct) + "%",
                spark: { values: (r.dailySessions || []).map((d) => d.sessions), highlight: (r.dailySessions || []).findIndex((d) => d.date === r.spikeDate) },
                action: { type: "page", insight: r },
                score: 52
            });
        }
        const spikes = (input.pageSpikes || []).filter((p) => !input.risingPage || p.pageTitle !== input.risingPage.pageTitle);
        if (spikes.length) {
            const top = spikes[0];
            stories.push({
                id: "pageSpikes",
                tone: "info",
                kicker: t("brief.kicker.page"),
                title: spikes.length === 1
                    ? t("brief.spikes.oneTitle", { title: escapeHtml(shortPageTitle(top.pageTitle)) })
                    : t("brief.spikes.manyTitle", { n: spikes.length }),
                body: spikes.slice(0, 3).map((p) => t("brief.spikes.item", {
                    title: escapeHtml(shortPageTitle(p.pageTitle)), value: fmtInt(p.spikeValue), mean: fmtInt(p.baseline)
                })).join("<br>"),
                stat: fmtInt(top.spikeValue),
                spark: { values: (top.dailySessions || []).map((d) => d.sessions), highlight: (top.dailySessions || []).findIndex((d) => d.date === top.spikeDate) },
                action: { type: "page", insight: top },
                score: 48
            });
        }

        stories.sort((a, b) => b.score - a.score);

        return { headline: buildHeadline(input, stories), stories };
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // Product titles all end in "｜トータルヘルスデザイン公式ショップWEB本店"
    // (or " | Thd公式ブログ") — the store suffix is noise in a headline.
    function shortPageTitle(title) {
        return String(title || "").split(/[｜|]/)[0].trim() || title;
    }

    function buildHeadline(input, stories) {
        const t = window.I18N.t;
        const { kpi, channels = [] } = input;
        const hasCompareData = input.hasCompareData && !(input.range && input.range.partial);
        const rev = kpi.revenue;

        let main;
        if (hasCompareData && rev.delta !== null) {
            main = t(rev.delta >= 0 ? "brief.headline.up" : "brief.headline.down", {
                revenue: `<span class="hlNum">${fmtYenShort(rev.value)}</span>`,
                delta: `<span class="hlDelta ${rev.delta >= 0 ? "pos" : "neg"}">${fmtPctSigned(rev.delta)}</span>`,
                vs: t(input.range && input.range.isYoy ? "brief.vs.yoy" : "brief.vs.prev")
            });
        } else {
            main = t("brief.headline.flat", { revenue: `<span class="hlNum">${fmtYenShort(rev.value)}</span>` });
        }

        const parts = [];
        const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
        const top = channels.filter((c) => !NOT_A_CHANNEL.has(c.label)).sort((a, b) => b.revenue - a.revenue)[0];
        if (top && totalRevenue) {
            parts.push(t("brief.dek.topChannel", {
                label: window.I18N.channelLabel(top.label),
                share: Math.round((top.revenue / totalRevenue) * 100)
            }));
        }
        if (hasCompareData && kpi.purchases.delta !== null && kpi.aov && kpi.aov.delta !== null) {
            parts.push(t("brief.dek.drivers", {
                orders: fmtPctSigned(kpi.purchases.delta),
                aov: fmtPctSigned(kpi.aov.delta)
            }));
        }
        const firstWarning = stories.find((s) => s.tone === "alert" || s.tone === "bad");
        if (firstWarning) parts.push(t("brief.dek.watch", { title: firstWarning.title }));

        return { main, dek: parts.join(t("brief.dek.sep")) };
    }

    /* ==========================================================
       Traffic tree — one table instead of the old "by platform" /
       "by channel" dropdown, which showed the same traffic sliced
       two ways with neither complete:
         channel  (GA4-style: Paid Search, Direct, …)
           └ platform (Google Ads, Yahoo Ads, …) — skipped when a
             channel has only one platform, since that row would just
             repeat its parent
               └ source / medium (the raw GA4 value)
       Channels too small to read (< 0.5% of sessions in both
       periods) are folded into one "small sources" group, so a
       single 1-session email doesn't get a "100% CVR" row of its own.
       Every node carries {groupBy, label} so a click can filter the
       Session Source table / channel trend to exactly that slice.
    ========================================================== */

    const TREE_SMALL_SHARE = 0.005;

    function buildTrafficTree(currentRows, previousRows) {
        const emptyTotals = () => ({ sessions: 0, users: 0, purchases: 0, revenue: 0 });
        const nodes = new Map(); // id -> node
        const roots = [];

        const node = (id, level, groupBy, label, parent) => {
            let n = nodes.get(id);
            if (!n) {
                n = { id, level, groupBy, label, cur: emptyTotals(), prev: emptyTotals(), children: [] };
                nodes.set(id, n);
                (parent ? parent.children : roots).push(n);
            }
            return n;
        };
        const add = (rows, period) => {
            (rows || []).forEach((r) => {
                const ch = classifyForGroupBy(r, "channel");
                const pl = classifyForGroupBy(r, "platform");
                const cN = node("c:" + ch, "channel", "channel", ch, null);
                const pN = node("p:" + ch + "|" + pl, "platform", "platform", pl, cN);
                const sN = node("s:" + r.sourceMedium, "source", "source", r.sourceMedium, pN);
                [cN, pN, sN].forEach((n) => {
                    n[period].sessions += r.sessions;
                    n[period].users += r.users;
                    n[period].purchases += r.purchases;
                    n[period].revenue += r.revenue;
                });
            });
        };
        add(currentRows, "cur");
        add(previousRows, "prev");

        const finish = (n) => {
            ["cur", "prev"].forEach((p) => {
                n[p].cvr = n[p].sessions ? (n[p].purchases / n[p].sessions) * 100 : 0;
            });
            n.children.sort((a, b) => b.cur.sessions - a.cur.sessions || b.prev.sessions - a.prev.sessions);
            n.children.forEach(finish);
            // A channel with a single platform: lift the sources up a level.
            if (n.level === "channel" && n.children.length === 1) {
                n.alsoPlatform = n.children[0].label; // so a platform-level filter (e.g. from the briefing) still finds this row
                n.children = n.children[0].children;
            }
            // A platform with a single source that IS the platform's only
            // traffic still keeps its source row — the raw value is useful.
        };
        roots.forEach(finish);
        roots.sort((a, b) => b.cur.sessions - a.cur.sessions || b.prev.sessions - a.prev.sessions);

        const totalCur = roots.reduce((s, n) => s + n.cur.sessions, 0) || 1;
        const totalPrev = roots.reduce((s, n) => s + n.prev.sessions, 0) || 1;
        const big = [];
        const small = [];
        roots.forEach((n) => {
            // AI assistants stay visible however small — it's a trend to watch.
            const tiny = n.label !== "AI Assistants" &&
                n.cur.sessions / totalCur < TREE_SMALL_SHARE && n.prev.sessions / totalPrev < TREE_SMALL_SHARE;
            (tiny ? small : big).push(n);
        });
        if (small.length >= 2) {
            const g = { id: "g:small", level: "group", groupBy: null, label: "__small__", cur: emptyTotals(), prev: emptyTotals(), children: small };
            small.forEach((n) => ["cur", "prev"].forEach((p) => {
                ["sessions", "users", "purchases", "revenue"].forEach((k) => { g[p][k] += n[p][k]; });
            }));
            ["cur", "prev"].forEach((p) => { g[p].cvr = g[p].sessions ? (g[p].purchases / g[p].sessions) * 100 : 0; });
            big.push(g);
        } else {
            big.push(...small);
        }
        return big;
    }

    // Depth-first list of every node, for CSV export.
    function flattenTrafficTree(tree) {
        const out = [];
        const walk = (n, depth) => { out.push({ ...n, depth }); n.children.forEach((c) => walk(c, depth + 1)); };
        (tree || []).forEach((n) => walk(n, 0));
        return out;
    }

    /* ==========================================================
       Per-day-per-source rows -> Session Source table +
       Traffic Sources doughnuts. Aggregates matching rows within
       an arbitrary [start, end] window into one row per
       sourceMedium — used for both the current and the previous
       period so the two are built the exact same way.
    ========================================================== */

    function filterSourcesByDates(sourceRows, start, end) {
        const inWindow = sourceRows.filter((r) => inRange(r.date, start, end));

        const totals = {};
        inWindow.forEach((r) => {
            if (!totals[r.sourceMedium]) {
                totals[r.sourceMedium] = {
                    sourceMedium: r.sourceMedium,
                    sessions: 0, users: 0, purchases: 0, revenue: 0,
                    channel: r.channel || null
                };
            }
            const t = totals[r.sourceMedium];
            t.sessions += r.sessions;
            t.users += r.users;
            t.purchases += r.purchases;
            t.revenue += r.revenue;
        });

        return Object.values(totals)
            .map((t) => ({ ...t, cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0 }))
            .sort((a, b) => b.sessions - a.sessions);
    }

    /* ==========================================================
       Per-day-per-path rows -> Top Landing Pages. Same shape as
       filterSourcesByDates: aggregates matching rows within an
       arbitrary [start, end] window into one row per path, so the
       list responds to whatever date range is selected instead of
       always showing one fixed snapshot.
    ========================================================== */

    // Top Landing Pages intentionally does NOT follow the dashboard's
    // date-range picker — the underlying GA4 export only ever holds a
    // trailing 30-day window (data volume gets too large otherwise),
    // so this always aggregates the most recent 30 days available in
    // whatever's loaded, regardless of what range is selected
    // elsewhere. Grouped by pageTitle rather than landingPage, since
    // landingPage is a generic template (e.g. "/smartphone/detail.html")
    // shared by hundreds of different products — the actual page
    // identity only shows up in pageTitle/the query string.
    function resolveLast30DayWindow(landingRows) {
        if (!landingRows || !landingRows.length) return null;
        const maxDate = landingRows.reduce((max, r) => (r.date > max ? r.date : max), landingRows[0].date);
        const end = new Date(maxDate);
        const start = new Date(maxDate);
        start.setDate(start.getDate() - 29);
        return { start, end, startStr: start.toISOString().slice(0, 10), endStr: maxDate };
    }

    function aggregateLandingPages(landingRows, device = "all", limit = 10, excludeSystem = true) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return [];

        const inWindow = landingRows.filter((r) =>
            r.date >= win.startStr && r.date <= win.endStr &&
            (device === "all" || r.device === device) &&
            (!excludeSystem || r.pageType !== "system")
        );

        // Same first-half/second-half split used by the momentum
        // insight, computed once here so every row in the list can
        // show its own trend badge, not just whichever single page
        // moved the most.
        const allDates = Array.from(new Set(inWindow.map((r) => r.date))).sort();
        const midIdx = Math.floor(allDates.length / 2);
        const firstHalfDates = new Set(allDates.slice(0, midIdx));
        const secondHalfDates = new Set(allDates.slice(midIdx));

        const totals = {};
        inWindow.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            if (!totals[key]) {
                totals[key] = { pageTitle: key, landingPage: r.landingPage, pageType: r.pageType, sessions: 0, purchases: 0, revenue: 0, firstHalfSessions: 0, secondHalfSessions: 0 };
            }
            const t = totals[key];
            t.sessions += r.sessions;
            t.purchases += r.purchases;
            t.revenue += r.revenue;
            if (firstHalfDates.has(r.date)) t.firstHalfSessions += r.sessions;
            if (secondHalfDates.has(r.date)) t.secondHalfSessions += r.sessions;
        });

        return Object.values(totals)
            .map((t) => {
                // Null (not just 0%) when there isn't enough of a first-half
                // base to make a % change meaningful — the UI skips the
                // badge entirely in that case rather than showing a
                // misleadingly precise number off a tiny denominator.
                const trend = t.firstHalfSessions >= 5
                    ? ((t.secondHalfSessions - t.firstHalfSessions) / t.firstHalfSessions) * 100
                    : null;
                return { ...t, cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0, trend };
            })
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, limit);
    }

    // Text insights for the Top Landing Pages card — runs on the
    // FULL 30-day window (not just the top-N shown in the list),
    // since the product-vs-system split needs every row to be
    // meaningful, and always ignores the device filter so it reads
    // as an overall summary regardless of which device view is open.
    function buildLandingPageInsights(landingRows) {
        const insights = [];
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return insights;

        const inWindow = landingRows.filter((r) => r.date >= win.startStr && r.date <= win.endStr);
        if (!inWindow.length) return insights;

        const contentRows = inWindow.filter((r) => r.pageType !== "system");

        const byTitle = {};
        contentRows.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            if (!byTitle[key]) byTitle[key] = { pageTitle: key, sessions: 0, pc: 0, sp: 0 };
            const t = byTitle[key];
            t.sessions += r.sessions;
            if (r.device === "PC") t.pc += r.sessions;
            if (r.device === "Smartphone") t.sp += r.sessions;
        });
        const ranked = Object.values(byTitle).sort((a, b) => b.sessions - a.sessions);
        if (!ranked.length) return insights;

        // Only look among pages with real traffic — the long tail of
        // one-session hits would just add noise to both signals below.
        const candidates = ranked.slice(0, 10);

        // 1. Momentum: split the 30-day window in half by date and
        // compare each candidate page's sessions, second half vs
        // first. Surfaces whether a page is still gaining traction or
        // fading — something to actually act on (keep pushing it, or
        // go find out why interest dropped), unlike a static "here's
        // your top page" fact.
        const allDates = Array.from(new Set(inWindow.map((r) => r.date))).sort();
        const midIdx = Math.floor(allDates.length / 2);
        const firstHalfDates = new Set(allDates.slice(0, midIdx));
        const secondHalfDates = new Set(allDates.slice(midIdx));

        let biggestMover = null;
        candidates.forEach((p) => {
            const rows = contentRows.filter((r) => (r.pageTitle || "(not set)") === p.pageTitle);
            const firstHalf = rows.filter((r) => firstHalfDates.has(r.date)).reduce((s, r) => s + r.sessions, 0);
            const secondHalf = rows.filter((r) => secondHalfDates.has(r.date)).reduce((s, r) => s + r.sessions, 0);
            if (firstHalf < 5) return; // too small a base for a % swing to mean anything
            const change = ((secondHalf - firstHalf) / firstHalf) * 100;
            if (!biggestMover || Math.abs(change) > Math.abs(biggestMover.change)) {
                biggestMover = { pageTitle: p.pageTitle, change };
            }
        });
        if (biggestMover && Math.abs(biggestMover.change) >= 20) {
            const key = biggestMover.change >= 0 ? "landingInsight.rising" : "landingInsight.cooling";
            insights.push(window.I18N.t(key, {
                title: `<strong>${escapeHtml(biggestMover.pageTitle)}</strong>`,
                figure: highlight(Math.abs(biggestMover.change).toFixed(0) + "%", biggestMover.change >= 0 ? "pos" : "neg")
            }));
        }

        // 2. Device mismatch: among the same candidates, flag one whose
        // PC/Smartphone split is meaningfully more lopsided than the
        // overall content-traffic split — a concrete "go check how
        // this looks on the other device" candidate, rather than a
        // generic overall split nobody can act on.
        const totalPc = contentRows.filter((r) => r.device === "PC").reduce((s, r) => s + r.sessions, 0);
        const totalSp = contentRows.filter((r) => r.device === "Smartphone").reduce((s, r) => s + r.sessions, 0);
        const overallSpShare = (totalPc + totalSp) ? (totalSp / (totalPc + totalSp)) * 100 : 0;

        let biggestMismatch = null;
        candidates.forEach((p) => {
            const total = p.pc + p.sp;
            if (total < 20) return; // needs enough volume for the split to be meaningful
            const spShare = (p.sp / total) * 100;
            const diff = Math.abs(spShare - overallSpShare);
            if (!biggestMismatch || diff > biggestMismatch.diff) {
                biggestMismatch = { pageTitle: p.pageTitle, spShare, diff };
            }
        });
        if (biggestMismatch && biggestMismatch.diff >= 25) {
            const deviceLabel = biggestMismatch.spShare > overallSpShare
                ? window.I18N.t("landing.smartphone")
                : window.I18N.t("landing.pc");
            const figure = Math.max(biggestMismatch.spShare, 100 - biggestMismatch.spShare);
            insights.push(window.I18N.t("landingInsight.deviceMismatch", {
                title: `<strong>${escapeHtml(biggestMismatch.pageTitle)}</strong>`,
                device: deviceLabel,
                figure: highlight(figure.toFixed(0) + "%", "neutral")
            }));
        }

        // 3. Single-day spike: for each candidate page, build its own
        // daily session series across the window and flag a day that's
        // abnormal relative to THAT PAGE's own typical day (z-score
        // against its own mean/stdDev) — same method as the daily
        // KPI anomaly detector, just scoped per page instead of per
        // metric. This is a different question from the momentum
        // signal above: momentum looks for a sustained shift over two
        // weeks, this looks for one unusual day (a press mention, a
        // social share, a flash sale) that a half-window comparison
        // could easily wash out or miss entirely.
        let biggestSpike = null;
        candidates.forEach((p) => {
            const byDate = {};
            contentRows
                .filter((r) => (r.pageTitle || "(not set)") === p.pageTitle)
                .forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + r.sessions; });

            const values = allDates.map((d) => byDate[d] || 0);
            const n = values.length;
            if (n < 5) return;

            const mean = values.reduce((a, b) => a + b, 0) / n;
            if (mean < 3) return; // needs a real baseline — not near-zero noise

            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            if (!stdDev) return;

            values.forEach((v, i) => {
                const z = (v - mean) / stdDev;
                if (z >= 2 && (!biggestSpike || z > biggestSpike.z)) {
                    biggestSpike = { pageTitle: p.pageTitle, date: allDates[i], value: v, mean, z };
                }
            });
        });
        if (biggestSpike) {
            insights.push(window.I18N.t("landingInsight.spike", {
                title: `<strong>${escapeHtml(biggestSpike.pageTitle)}</strong>`,
                date: biggestSpike.date,
                figure: highlight(Math.round(biggestSpike.value).toLocaleString("en-US"), "pos"),
                mean: Math.round(biggestSpike.mean).toLocaleString("en-US")
            }));
        }

        return insights;
    }

    /* ==========================================================
       Landing Page Detail — shared helpers
       Both the Overview "rising page" insight and clicking any row
       in the Top Landing Pages list need the same two things: a
       page's daily-sessions series across the 30-day window (with
       its single standout day picked out), and its this-week vs.
       last-week totals. Pulled out here so both call sites stay in
       sync instead of drifting apart.
    ========================================================== */

    function sumSessionsByTitle(rows) {
        const map = {};
        rows.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            map[key] = (map[key] || 0) + r.sessions;
        });
        return map;
    }

    // This-week / last-week windows, anchored to the most recent date
    // actually present in the data (not "today"), same anchoring
    // approach resolveLast30DayWindow already uses.
    function weekWindowsFor(win) {
        const maxDate = new Date(win.endStr);
        const curStart = new Date(maxDate);
        curStart.setDate(curStart.getDate() - 6);
        const prevEnd = new Date(curStart);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - 6);
        return {
            curStartStr: curStart.toISOString().slice(0, 10),
            prevStartStr: prevStart.toISOString().slice(0, 10),
            prevEndStr: prevEnd.toISOString().slice(0, 10)
        };
    }

    // One page's daily series across the full 30-day window, plus the
    // single day that stands out most (highest z-score, even if it
    // doesn't clear the ANOMALY_Z_THRESHOLD used elsewhere — here we
    // always want *a* day to point to, not just a statistically
    // extreme one). `rows` should already be scoped to whatever
    // device/page-type filter the caller wants applied.
    function buildLandingPageDailySeries(rows, win, pageTitle) {
        const allDates = [];
        for (let d = new Date(win.start); d <= win.end; d.setDate(d.getDate() + 1)) {
            allDates.push(d.toISOString().slice(0, 10));
        }
        const byDate = {};
        rows
            .filter((r) => (r.pageTitle || "(not set)") === pageTitle)
            .forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + r.sessions; });

        const dailySessions = allDates.map((d) => ({ date: d, sessions: byDate[d] || 0 }));
        const values = dailySessions.map((d) => d.sessions);
        const n = values.length;
        const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
        const variance = n ? values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n : 0;
        const stdDev = Math.sqrt(variance);

        let spikeDate = null;
        let spikeValue = null;
        let spikeZ = null;
        values.forEach((v, i) => {
            const z = stdDev ? (v - mean) / stdDev : 0;
            if (spikeZ === null || z > spikeZ) {
                spikeZ = z;
                spikeDate = allDates[i];
                spikeValue = v;
            }
        });

        return { dailySessions, mean, spikeDate, spikeValue };
    }

    /* ==========================================================
       Overview "Rising Landing Page" Insight
       A focused early-warning signal, deliberately separate from
       the Landing Pages tab's own momentum/spike insights above
       (buildLandingPageInsights): this looks ONLY at the most
       recent 7 days vs. the 7 days right before that — not the
       30-day half-window split used there — and ONLY surfaces a
       page whose sessions at least doubled. The point is "is
       something unusual happening RIGHT NOW", checkable at a
       glance from Overview, rather than a general momentum read.

       A minimum previous-week session floor keeps a 1session->3
       session blip from reading as a "300% rise". Content pages
       only (see classifyLandingPageType) — a spike on a checkout
       or login page isn't the kind of anomaly this is hunting for.
    ========================================================== */

    const RISING_PAGE_MIN_PREV_SESSIONS = 10;
    const RISING_PAGE_THRESHOLD_PCT = 100;

    /* ==========================================================
       Overview "Today/Yesterday Spike" Insights
       A different question again from both the signal above (best
       riser over a rolling 7 days) and buildLandingPageInsights'
       own single-day-spike signal (the ONE biggest spike anywhere
       in the last 30 days): this checks specifically whether TODAY
       or YESTERDAY — the two most recent dates actually present in
       the data, since GA4's own processing lag means "today" here
       is whatever the freshest row is, not necessarily today's real
       calendar date — was a spike day for ANY content page, and
       surfaces every page that qualifies rather than only the
       single biggest one. A spike from three days ago is old news
       by the time the rolling-7-day riser signal would catch it;
       the point here is "is something unusual happening right now",
       for as many pages as that's actually true of today.
    ========================================================== */

    const TODAY_YESTERDAY_SPIKE_Z_THRESHOLD = 2;
    const TODAY_YESTERDAY_SPIKE_MIN_MEAN = 5; // needs a real baseline, not near-zero noise
    // A spike also has to be big in absolute terms — 8 sessions vs a
    // usual 3 clears the z-score bar but isn't worth anyone's time,
    // and at the old thresholds ~80 pages qualified on a normal day.
    const TODAY_YESTERDAY_SPIKE_MIN_SESSIONS = 30;
    const TODAY_YESTERDAY_SPIKE_MIN_RATIO = 2; // at least 2x the page's usual day

    function buildTodayYesterdaySpikeInsights(landingRows) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return [];

        const contentRows = landingRows.filter((r) => r.date >= win.startStr && r.date <= win.endStr && r.pageType !== "system");
        if (!contentRows.length) return [];

        const todayStr = win.endStr;
        const yesterdayDate = new Date(win.endStr);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

        const allDates = [];
        for (let d = new Date(win.start); d <= win.end; d.setDate(d.getDate() + 1)) {
            allDates.push(d.toISOString().slice(0, 10));
        }

        const byTitle = {};
        contentRows.forEach((r) => {
            const key = r.pageTitle || "(not set)";
            if (!byTitle[key]) byTitle[key] = {};
            byTitle[key][r.date] = (byTitle[key][r.date] || 0) + r.sessions;
        });

        const found = [];
        Object.keys(byTitle).forEach((pageTitle) => {
            const byDate = byTitle[pageTitle];
            const values = allDates.map((d) => byDate[d] || 0);
            const n = values.length;
            if (n < 5) return;

            const mean = values.reduce((a, b) => a + b, 0) / n;
            if (mean < TODAY_YESTERDAY_SPIKE_MIN_MEAN) return;

            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            if (!stdDev) return;

            const dailySessions = allDates.map((d) => ({ date: d, sessions: byDate[d] || 0 }));

            [["today", todayStr], ["yesterday", yesterdayStr]].forEach(([dayLabel, dateStr]) => {
                const value = byDate[dateStr] || 0;
                const z = (value - mean) / stdDev;
                if (z >= TODAY_YESTERDAY_SPIKE_Z_THRESHOLD &&
                    value >= TODAY_YESTERDAY_SPIKE_MIN_SESSIONS &&
                    value >= mean * TODAY_YESTERDAY_SPIKE_MIN_RATIO) {
                    found.push({ pageTitle, dayLabel, date: dateStr, value, mean, dailySessions });
                }
            });
        });

        // One entry per page: a page that spiked both days used to be
        // listed twice. Keep whichever day was the bigger jump.
        const bestByPage = {};
        found.forEach((f) => {
            const prev = bestByPage[f.pageTitle];
            if (!prev || f.value / f.mean > prev.value / prev.mean) bestByPage[f.pageTitle] = f;
        });
        found.length = 0;
        found.push(...Object.values(bestByPage));

        // Today's spikes first, then yesterday's; within each day, the
        // most surprising (furthest above its own typical day) first.
        found.sort((a, b) => {
            if (a.dayLabel !== b.dayLabel) return a.dayLabel === "today" ? -1 : 1;
            return (b.value / b.mean) - (a.value / a.mean);
        });

        // Shaped to match buildRisingLandingPageInsight's return value
        // (pageTitle/dailySessions/spikeDate/spikeValue/current/
        // previous) so the exact same click-through — jump to Landing
        // Pages, open the highlight panel, render the mini chart, open
        // that day's source breakdown — works for these too with no
        // separate handler needed. spikeSummary:true tells
        // renderLandingRisingPanel to show "spiked on {date}" phrasing
        // instead of the rising-insight's "this week vs last week" one,
        // since that framing would be wrong for a single-day spike.
        return found.map((f) => ({
            pageTitle: f.pageTitle,
            spikeDate: f.date,
            spikeValue: f.value,
            dailySessions: f.dailySessions,
            current: f.value,
            baseline: f.mean,
            spikeSummary: true,
            sentence: window.I18N.t(f.dayLabel === "today" ? "landingInsight.spikeToday" : "landingInsight.spikeYesterday", {
                title: `<strong>${escapeHtml(f.pageTitle)}</strong>`,
                figure: highlight(Math.round(f.value).toLocaleString("en-US"), "pos"),
                mean: Math.round(f.mean).toLocaleString("en-US")
            })
        }));
    }

    function buildRisingLandingPageInsight(landingRows) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win) return null;

        const { curStartStr, prevStartStr, prevEndStr } = weekWindowsFor(win);

        const contentRows = landingRows.filter((r) => r.pageType !== "system");
        const curRows = contentRows.filter((r) => r.date >= curStartStr && r.date <= win.endStr);
        const prevRows = contentRows.filter((r) => r.date >= prevStartStr && r.date <= prevEndStr);

        const curMap = sumSessionsByTitle(curRows);
        const prevMap = sumSessionsByTitle(prevRows);

        // Single biggest riser clearing both the noise-floor and the
        // 100%+ threshold — ties broken by whichever change % is
        // largest, so this reads as "the one thing most worth a look"
        // rather than a list that could get noisy in a busy week.
        let best = null;
        Object.keys(curMap).forEach((title) => {
            const current = curMap[title];
            const previous = prevMap[title] || 0;
            if (previous < RISING_PAGE_MIN_PREV_SESSIONS) return;
            const changePct = ((current - previous) / previous) * 100;
            if (changePct < RISING_PAGE_THRESHOLD_PCT) return;
            if (!best || changePct > best.changePct) {
                best = { pageTitle: title, current, previous, changePct };
            }
        });
        if (!best) return null;

        const { dailySessions, mean, spikeDate, spikeValue } = buildLandingPageDailySeries(contentRows, win, best.pageTitle);

        const sentence = window.I18N.t("landingInsight.overviewRising", {
            title: `<strong>${escapeHtml(best.pageTitle)}</strong>`,
            figure: highlight(`+${Math.round(best.changePct)}%`, "pos"),
            previous: Math.round(best.previous).toLocaleString("en-US"),
            current: Math.round(best.current).toLocaleString("en-US")
        });

        return {
            pageTitle: best.pageTitle,
            current: best.current,
            previous: best.previous,
            changePct: best.changePct,
            sentence,
            dailySessions,
            mean,
            spikeDate,
            spikeValue
        };
    }

    /* ==========================================================
       Landing Page Detail (any page, on demand)
       Powers clicking a row in the Top Landing Pages list: same
       week-over-week comparison and daily-series/spike-day lookup
       as the rising-page insight above, but for whichever specific
       page was clicked — no threshold, no content-only restriction
       (a system page can be clicked too if it's visible in the
       list), and scoped to whichever device filter is currently
       selected so the numbers shown match the row the person
       clicked. changePct is null (not 0) when there's no previous-
       week data to compare against, so the UI can say "no data"
       instead of a misleading "+∞%" or "0%".
    ========================================================== */

    function buildLandingPageDetail(landingRows, pageTitle, device) {
        const win = resolveLast30DayWindow(landingRows);
        if (!win || !pageTitle) return null;

        const { curStartStr, prevStartStr, prevEndStr } = weekWindowsFor(win);
        const scoped = landingRows.filter((r) => !device || device === "all" || r.device === device);

        const curRows = scoped.filter((r) => r.date >= curStartStr && r.date <= win.endStr);
        const prevRows = scoped.filter((r) => r.date >= prevStartStr && r.date <= prevEndStr);

        const current = sumSessionsByTitle(curRows)[pageTitle] || 0;
        const previous = sumSessionsByTitle(prevRows)[pageTitle] || 0;
        const changePct = previous > 0 ? ((current - previous) / previous) * 100 : null;

        const { dailySessions, mean, spikeDate, spikeValue } = buildLandingPageDailySeries(scoped, win, pageTitle);

        return { pageTitle, current, previous, changePct, dailySessions, mean, spikeDate, spikeValue };
    }

    /* ==========================================================
       Day/Page Source Breakdown
       Answers "where did THIS day's sessions for THIS page come
       from" — powers clicking a bar in the landing-page detail
       mini chart (buildLandingPageMiniChart's onClick, wired in
       app.js). Reuses classifyForGroupBy so the breakdown groups
       the exact same way as the Traffic Sources tab (platform or
       channel, whichever the person currently has selected there),
       rather than introducing a third, inconsistent grouping.

       Reads from the same landingRows every other Landing Pages
       function uses (sourceMedium is just another column on that
       feed) — not a separate dataset. Returns null (not an empty
       array) when there's no matching row for that exact day/page,
       so the UI can show a distinct "no data" state instead of a
       misleading empty list.
    ========================================================== */

    function buildDayPageSourceBreakdown(landingRows, pageTitle, date, groupBy) {
        if (!landingRows || !landingRows.length || !pageTitle || !date) return null;

        const dayRows = landingRows.filter((r) => r.date === date && r.pageTitle === pageTitle);
        if (!dayRows.length) return null;

        const totals = {};
        let total = 0;
        dayRows.forEach((r) => {
            const label = classifyForGroupBy(r, groupBy);
            totals[label] = (totals[label] || 0) + r.sessions;
            total += r.sessions;
        });
        if (!total) return null;

        const breakdown = Object.entries(totals)
            .map(([label, sessions]) => ({ label, sessions, pct: (sessions / total) * 100 }))
            .sort((a, b) => b.sessions - a.sessions);

        return { date, pageTitle, total, breakdown };
    }

    // Second-level drill-down for the panel above: given a group label
    // the person clicked ("Referral (Other)", "Direct", etc. — one of
    // buildDayPageSourceBreakdown's own labels for that same
    // date/page/groupBy), returns the raw sourceMedium rows that
    // rolled up into it — this is the actual "p01.mul-pay.jp /
    // referral" / "youtube.com / referral" level needed to trace an
    // anomaly back to its real origin, not just its category.
    function buildDayPageSourceDetail(landingRows, pageTitle, date, groupBy, groupLabel) {
        if (!landingRows || !landingRows.length || !pageTitle || !date || !groupLabel) return null;

        const rows = landingRows.filter((r) =>
            r.date === date && r.pageTitle === pageTitle && classifyForGroupBy(r, groupBy) === groupLabel
        );
        if (!rows.length) return null;

        const totals = {};
        rows.forEach((r) => {
            const key = r.sourceMedium || "(not set)";
            if (!totals[key]) totals[key] = { sourceMedium: key, sessions: 0, purchases: 0, revenue: 0 };
            totals[key].sessions += r.sessions;
            totals[key].purchases += r.purchases;
            totals[key].revenue += r.revenue;
        });

        return Object.values(totals)
            .map((t) => ({ ...t, cvr: t.sessions ? (t.purchases / t.sessions) * 100 : 0 }))
            .sort((a, b) => b.sessions - a.sessions);
    }

    /* ==========================================================
       Current vs previous period, merged into one row per
       channel/platform so the two can be shown side by side
       (and so a channel that only appears in one period still
       shows up, with the other side reading "—").
    ========================================================== */

    function buildTrafficComparison(currentChannels, previousChannels) {
        const map = {};

        (currentChannels || []).forEach((c) => {
            map[c.label] = { label: c.label, current: c, previous: null };
        });
        (previousChannels || []).forEach((c) => {
            if (!map[c.label]) map[c.label] = { label: c.label, current: null, previous: c };
            else map[c.label].previous = c;
        });

        return Object.values(map).sort((a, b) => {
            const aSessions = a.current ? a.current.sessions : 0;
            const bSessions = b.current ? b.current.sessions : 0;
            return bSessions - aSessions;
        });
    }

    // Builds a merged current-vs-previous daily trend for one
    // channel/platform, for the doughnut-click drill-down. The two
    // windows are aligned by DAY OFFSET within their own period (day
    // 1 of current next to day 1 of previous), not by calendar date —
    // since "This Month" vs "Last Month" cover different calendar
    // days entirely, aligning by offset is what makes the two lines
    // actually comparable side by side, same idea GA4's own
    // date-range-comparison charts use.
    // toLocaleDateString is slow, and the per-channel trends format the
    // same few hundred dates once per channel per render (~15k calls
    // for "This Year") — cache by language + date key.
    const dayLabelCache = new Map();
    function dayLabel(key, date) {
        const k = window.I18N.getLang() + "|" + key;
        let v = dayLabelCache.get(k);
        if (v === undefined) {
            v = window.I18N.formatDayLabel(date);
            dayLabelCache.set(k, v);
        }
        return v;
    }

    function buildChannelTrend(sourceRows, channelKey, groupBy, range) {
        const filtered = sourceRows.filter((r) => classifyForGroupBy(r, groupBy) === channelKey);

        const byDate = {};
        filtered.forEach((r) => {
            if (!byDate[r.date]) byDate[r.date] = { users: 0, sessions: 0, purchases: 0, revenue: 0 };
            const d = byDate[r.date];
            d.users += r.users;
            d.sessions += r.sessions;
            d.purchases += r.purchases;
            d.revenue += r.revenue;
        });

        const spanDays = Math.round((range.end - range.start) / 86400000) + 1;
        const labels = [];
        const previousLabels = [];
        const series = {
            users: { current: [], previous: [] },
            sessions: { current: [], previous: [] },
            purchases: { current: [], previous: [] },
            revenue: { current: [], previous: [] },
            cvr: { current: [], previous: [] }
        };

        for (let i = 0; i < spanDays; i++) {
            const curDate = new Date(range.start);
            curDate.setDate(curDate.getDate() + i);
            const prevDate = new Date(range.prevStart);
            prevDate.setDate(prevDate.getDate() + i);

            // Local-date keys: range dates are local midnights, and
            // toISOString() converts to UTC first — in Japan (UTC+9)
            // that turned Oct 13 into "2026-10-12", shifting every
            // channel trend and channel anomaly by one day.
            const curKey = toLocalDateKey(curDate);
            const prevKey = toLocalDateKey(prevDate);
            const cur = byDate[curKey] || { users: 0, sessions: 0, purchases: 0, revenue: 0 };
            const prev = byDate[prevKey] || { users: 0, sessions: 0, purchases: 0, revenue: 0 };

            labels.push(dayLabel(curKey, curDate));
            previousLabels.push(dayLabel(prevKey, prevDate));

            series.users.current.push(cur.users);
            series.users.previous.push(prev.users);
            series.sessions.current.push(cur.sessions);
            series.sessions.previous.push(prev.sessions);
            series.purchases.current.push(cur.purchases);
            series.purchases.previous.push(prev.purchases);
            series.revenue.current.push(cur.revenue);
            series.revenue.previous.push(prev.revenue);
            series.cvr.current.push(cur.sessions ? (cur.purchases / cur.sessions) * 100 : 0);
            series.cvr.previous.push(prev.sessions ? (prev.purchases / prev.sessions) * 100 : 0);
        }

        return { labels, previousLabels, series };
    }

    /* ==========================================================
       Monthly Business Performance
       Company's fiscal "month" runs 21st of the previous calendar
       month through the 20th of the named month — e.g. the "Feb
       2026" bucket is 2026-01-21 ~ 2026-02-20. Any day from the
       21st onward rolls forward into the following calendar
       month's bucket; the 1st-20th stay in their own calendar
       month. Built straight from daily GA4 rows so it always
       reflects whatever's actually loaded (live or dummy).
    ========================================================== */

    function businessMonthOf(dateStr) {
        const d = parseLocalDate(dateStr);
        let month = d.getMonth(); // 0-indexed
        let year = d.getFullYear();
        if (d.getDate() >= 21) {
            month += 1;
            if (month > 11) { month = 0; year += 1; }
        }
        return { year, month };
    }

    function businessMonthLabel(year, month) {
        return window.I18N.formatMonth(year, month);
    }

    function buildBusinessMonths(dailyRows, monthsToShow = 12) {
        const buckets = {};

        (dailyRows || []).forEach((r) => {
            const { year, month } = businessMonthOf(r.date);
            const key = `${year}-${month}`;
            if (!buckets[key]) buckets[key] = { year, month, revenue: 0, orders: 0, users: 0, sessions: 0 };
            const b = buckets[key];
            b.revenue += r.revenue;
            b.orders += r.purchases;
            b.users += r.users;
            b.sessions += r.sessions;
        });

        const sortedKeys = Object.keys(buckets).sort((a, b) => {
            const A = buckets[a], B = buckets[b];
            return (A.year * 12 + A.month) - (B.year * 12 + B.month);
        });

        const rows = sortedKeys.map((key, i) => {
            const b = buckets[key];
            const prev = i > 0 ? buckets[sortedKeys[i - 1]] : null;
            return {
                month: businessMonthLabel(b.year, b.month),
                revenue: b.revenue,
                orders: b.orders,
                users: b.users,
                cvr: b.sessions ? (b.orders / b.sessions) * 100 : 0,
                trend: prev && prev.revenue ? ((b.revenue - prev.revenue) / prev.revenue) * 100 : 0
            };
        });

        return rows.slice(-monthsToShow);
    }

    /* ==========================================================
       Ads Performance
       Spend is matched to GA4 sessions/revenue two ways:
       - Platform-level (robust, always on): reuses the exact same
         classifyPlatform() vendor split that already powers the
         Traffic tab's "Ad Platform" grouping — ad spend tagged
         platform "Google"/"Meta" lines up with GA4 rows that
         classify as "Google Ads"/"Meta Ads", with no dependency
         on UTM campaign naming being consistent. This is what the
         top-line Spend/ROAS/CPA KPIs are built from.
       - Campaign-level (finer, best-effort): only where BOTH the
         ad spend feed and the GA4 sources feed carry a matching
         campaign name (case/whitespace-insensitive). Spend with no
         matching GA4 campaign still shows up in the table — as an
         unmatched row, not silently dropped — since that itself is
         useful signal that a campaign's UTM tagging needs a look.
    ========================================================== */

    const AD_PLATFORMS = ["Google", "Meta"];

    function buildAdPerformance(adSpendRows, sourceRows, range) {
        const spendInRange = (adSpendRows || []).filter((r) => inRange(r.date, range.start, range.end));
        const sourcesInRange = (sourceRows || []).filter((r) => inRange(r.date, range.start, range.end));

        const totals = AD_PLATFORMS.map((platform) => {
            const platformSpendRows = spendInRange.filter((r) => r.platform === platform);
            const spend = platformSpendRows.reduce((s, r) => s + r.spend, 0);
            const impressions = platformSpendRows.reduce((s, r) => s + r.impressions, 0);
            const clicks = platformSpendRows.reduce((s, r) => s + r.clicks, 0);

            const adLabel = `${platform} Ads`;
            const matchingSources = sourcesInRange.filter((r) => classifyPlatform(r.sourceMedium) === adLabel);
            const sessions = matchingSources.reduce((s, r) => s + r.sessions, 0);
            const purchases = matchingSources.reduce((s, r) => s + r.purchases, 0);
            const revenue = matchingSources.reduce((s, r) => s + r.revenue, 0);

            return {
                platform,
                spend, impressions, clicks,
                ctr: impressions ? (clicks / impressions) * 100 : 0,
                cpc: clicks ? spend / clicks : 0,
                sessions, purchases, revenue,
                cvr: sessions ? (purchases / sessions) * 100 : 0,
                roas: spend ? revenue / spend : null,
                cpa: purchases ? spend / purchases : null
            };
        }).filter((t) => t.spend > 0 || t.sessions > 0);

        const blendedSpend = totals.reduce((s, t) => s + t.spend, 0);
        const blendedRevenue = totals.reduce((s, t) => s + t.revenue, 0);
        const blendedPurchases = totals.reduce((s, t) => s + t.purchases, 0);

        const campaignSpend = {};
        spendInRange.forEach((r) => {
            const name = r.campaign || "(unnamed)";
            const key = `${r.platform}::${name}`;
            if (!campaignSpend[key]) campaignSpend[key] = { platform: r.platform, campaign: name, spend: 0, impressions: 0, clicks: 0 };
            campaignSpend[key].spend += r.spend;
            campaignSpend[key].impressions += r.impressions;
            campaignSpend[key].clicks += r.clicks;
        });

        const campaignGA4 = {};
        sourcesInRange.forEach((r) => {
            if (!r.campaign) return;
            const key = r.campaign.trim().toLowerCase();
            if (!campaignGA4[key]) campaignGA4[key] = { sessions: 0, purchases: 0, revenue: 0 };
            campaignGA4[key].sessions += r.sessions;
            campaignGA4[key].purchases += r.purchases;
            campaignGA4[key].revenue += r.revenue;
        });

        const campaigns = Object.values(campaignSpend).map((row) => {
            const matched = campaignGA4[row.campaign.trim().toLowerCase()];
            const sessions = matched ? matched.sessions : 0;
            const purchases = matched ? matched.purchases : 0;
            const revenue = matched ? matched.revenue : 0;
            return {
                platform: row.platform,
                campaign: row.campaign,
                spend: row.spend,
                impressions: row.impressions,
                clicks: row.clicks,
                ctr: row.impressions ? (row.clicks / row.impressions) * 100 : 0,
                cpc: row.clicks ? row.spend / row.clicks : 0,
                sessions, purchases, revenue,
                roas: row.spend ? revenue / row.spend : null,
                cpa: purchases ? row.spend / purchases : null,
                matched: !!matched
            };
        }).sort((a, b) => b.spend - a.spend);

        const byDate = {};
        spendInRange.forEach((r) => {
            if (!byDate[r.date]) byDate[r.date] = { spend: 0, revenue: 0 };
            byDate[r.date].spend += r.spend;
        });
        sourcesInRange.forEach((r) => {
            if (!AD_PLATFORMS.some((p) => classifyPlatform(r.sourceMedium) === `${p} Ads`)) return;
            if (!byDate[r.date]) byDate[r.date] = { spend: 0, revenue: 0 };
            byDate[r.date].revenue += r.revenue;
        });
        const sortedDates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));

        return {
            totals,
            campaigns,
            blendedSpend,
            blendedRevenue,
            blendedRoas: blendedSpend ? blendedRevenue / blendedSpend : null,
            blendedCpa: blendedPurchases ? blendedSpend / blendedPurchases : null,
            trend: {
                labels: sortedDates,
                spend: sortedDates.map((d) => byDate[d].spend),
                revenue: sortedDates.map((d) => byDate[d].revenue)
            }
        };
    }

    // Per-order detail for the selected range, most recent first —
    // deliberately just filter+sort here; collapsing to a "Show
    // All"-able slice is the UI's job (same split as landing pages).
    function buildTransactionsList(transactionRows, range) {
        return (transactionRows || [])
            .filter((r) => inRange(r.date, range.start, range.end))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    /* ==========================================================
       Moving Average
       Simple trailing-window average (default 7 days) used as an
       optional overlay on the trend chart to smooth out day-to-day
       noise. Early points use whatever days are available so the
       line still starts at index 0 instead of leaving a gap.
    ========================================================== */

    function computeMovingAverage(values, windowSize) {
        const w = windowSize || 7;
        const out = [];
        for (let i = 0; i < values.length; i++) {
            const from = Math.max(0, i - w + 1);
            const slice = values.slice(from, i + 1);
            out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
        return out;
    }

    THD.data = {
        CONFIG,
        loadDailyGA4,
        loadSources,
        loadNewRepeat,
        loadLandingPages,
        buildDayPageSourceBreakdown,
        buildDayPageSourceDetail,
        classifySourceChannel,
        classifyPlatform,
        classifyForGroupBy,
        listAvailableChannels,
        buildDailyRowsFromSources,
        deriveTrafficBreakdown,
        buildInsights,
        buildNewRepeatInsights,
        detectAnomalies,
        buildAnomalyInsights,
        buildChannelAnomalyInsights,
        buildBriefing,
        setLatestDataDate,
        parseLocalDate,
        resolveRange,
        hasDataInRange,
        filterDailyRange,
        filterSourcesByDates,
        resolveLast30DayWindow,
        classifyLandingPageType,
        aggregateLandingPages,
        buildLandingPageInsights,
        buildRisingLandingPageInsight,
        buildTodayYesterdaySpikeInsights,
        buildLandingPageDetail,
        buildTrafficComparison,
        buildTrafficTree,
        flattenTrafficTree,
        buildChannelTrend,
        computeMovingAverage,
        buildBusinessMonths,
        loadAdSpend,
        loadTransactions,
        buildAdPerformance,
        buildTransactionsList
    };

})(window.THD);
