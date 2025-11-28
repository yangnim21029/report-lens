// ============================================================
// 2_PageLens.js - PageLens HTML 標籤審計完整功能模組
// ============================================================
// 此檔案包含 PageLens 的所有功能：WordPress 集成、HTML 審計、SEO 檢測
// 依賴: 0_Common.js (Config, Utils, ApiClient, SheetHelper)
// ============================================================

// ============================================================
// PageLensConfig - PageLens 專用配置
// ============================================================
var PageLensConfig = (function () {
    'use strict';

    var WORDPRESS_SITE_MAP = {
        'pretty.presslogic.com': 'GS_HK',
        'girlstyle.com': 'GS_TW',
        'girlstyle.com/sg': 'GS_SG',
        'girlstyle.com/in': 'GS_IN',
        'girlstyle.com/kr': 'GS_KR',
        'girlstyle.com/my': 'GS_MY',
        'holidaysmart.io': 'HS_HK',
        'holidaysmart.io/tw': 'HS_TW',
        'holidaysmart.io/sg': 'HS_SG',
        'urbanlifehk.com': 'UL_HK',
        'poplady-mag.com': 'POP_HK',
        'topbeautyhk.com': 'TOP_HK',
        'mensdoor.presslogic.com': 'MD_HK',
        'thekdaily.com': 'KD_HK',
        'businessfocus.io': 'BF_HK',
        'mamidaily.com': 'MD_HK',
        'thepetcity.co': 'PET_HK'
    };

    var WORDPRESS_SUBPATH_MAP = {
        'girlstyle.com/sg': 'GS_SG',
        'girlstyle.com/my': 'GS_MY',
        'girlstyle.com/tw': 'GS_TW',
        'holidaysmart.io/hk': 'HS_HK',
        'holidaysmart.io/tw': 'HS_TW'
    };

    var ISSUE_DESCRIPTIONS = {
        'H1_MISSING': '缺少 H1 標籤',
        'MULTIPLE_H1': '多個 H1 標籤',
        'H1_KEYWORD_MISSING': 'H1 缺少 Target Keyword',
        'H2_SYNONYMS_MISSING': 'H2 缺少相關關鍵字',
        'IMAGES_MISSING_ALT': '圖片缺少 Alt 文字',
        'KEYWORD_MISSING_FIRST_PARAGRAPH': '首段缺少關鍵字',
        'KEYWORD_DENSITY_LOW': '關鍵字密度異常',
        'META_DESCRIPTION_NEEDS_IMPROVEMENT': 'Meta Description 缺少關鍵字',
        'META_DESCRIPTION_MISSING': 'Meta Description 長度問題',
        'TITLE_NEEDS_IMPROVEMENT': 'Meta Title 長度問題',
        'TITLE_MISSING': 'Meta Title 缺少關鍵字',
        'CONTENT_LENGTH_SHORT': '內容過短'
    };

    return {
        HEADER_ROW_NUMBER: 2,
        URL_HEADER_CANDIDATES: ['url', 'URL', 'Url'],
        PASS_HEADER: 'HtmlTagPassTime',
        SUGGESTION_HEADER: 'HtmlTagSuggestion',
        FOCUS_KEYWORD_HEADER: 'FocusKeyword',
        TRACKING_KEYWORD_HEADER: 'TrackingKeyword',
        // ⭐ 配置要批次處理的 Sheet 清單（可自行修改）
        TARGET_SHEETS: [
            'Sheet1',     // 範例：修改為實際的 Sheet 名稱
            'Sheet2',     // 範例：修改為實際的 Sheet 名稱
            // 'Sheet3',  // 可以添加更多
        ],
        WORDPRESS_SITE_MAP: WORDPRESS_SITE_MAP,
        WORDPRESS_SUBPATH_MAP: WORDPRESS_SUBPATH_MAP,
        ISSUE_DESCRIPTIONS: ISSUE_DESCRIPTIONS,
        DEFAULT_CONTENT_SELECTORS: ['main', 'article', '.content', '.post-content', '.entry-content', '.article-content', '#content', '#main', '.pl-main-article'],
        DEFAULT_EXCLUDE_SELECTORS: ['script', 'style', 'nav', 'header', 'footer', 'aside', '.sidebar', '.menu', '.navigation', '.comments', '.related-posts']
    };
})();

// ============================================================
// WordPressService - WordPress API 集成服務
// ============================================================
var WordPressService = (function () {
    'use strict';

    /**
     * 解析 WordPress URL
     */
    function parseUrl(articleUrl) {
        if (!articleUrl) {
            throw new Error('文章 URL 不可為空');
        }

        // 嘗試多種變體
        var candidates = [
            articleUrl,
            articleUrl.trim(),
            articleUrl.replace(/\s+/g, ''),
            encodeURI(articleUrl)
        ];

        for (var i = 0; i < candidates.length; i++) {
            var variant = candidates[i].trim();
            if (!variant) continue;

            try {
                var parsed = parseUrlManually(variant);
                if (parsed) {
                    Utils.log('[WordPressService.parseUrl] 成功: ' + variant);

                    var pathname = parsed.pathname.replace(/\/+$/, '');
                    var host = parsed.hostname.toLowerCase();
                    var normalizedPath = (host + pathname).toLowerCase();

                    // 檢查子路徑映射
                    var siteCode = null;
                    var subPathKeys = Object.keys(PageLensConfig.WORDPRESS_SUBPATH_MAP);
                    for (var j = 0; j < subPathKeys.length; j++) {
                        if (normalizedPath.indexOf(subPathKeys[j]) === 0) {
                            siteCode = PageLensConfig.WORDPRESS_SUBPATH_MAP[subPathKeys[j]];
                            break;
                        }
                    }

                    // 檢查主機映射
                    if (!siteCode) {
                        siteCode = PageLensConfig.WORDPRESS_SITE_MAP[host];
                    }

                    if (!siteCode) {
                        throw new Error('無法從 URL 判斷站點代碼: ' + articleUrl);
                    }

                    // 提取文章 ID
                    var idMatch = pathname.match(/\/(\d+)(?=\/|$)/);
                    if (!idMatch) {
                        throw new Error('無法從 URL 擷取文章 ID: ' + articleUrl);
                    }

                    return {
                        resourceId: idMatch[1],
                        siteCode: siteCode
                    };
                }
            } catch (error) {
                Utils.log('[WordPressService.parseUrl] 變體失敗: ' + variant + ' - ' + error.message);
            }
        }

        throw new Error('無法解析文章 URL: ' + articleUrl);
    }

    function parseUrlManually(urlString) {
        if (!urlString || typeof urlString !== 'string') {
            return null;
        }

        var urlPattern = /^(https?):\/\/([^\/\s]+)(\/[^\s]*)?$/i;
        var match = urlString.match(urlPattern);

        if (!match) {
            return null;
        }

        return {
            protocol: match[1].toLowerCase() + ':',
            hostname: match[2].toLowerCase(),
            pathname: match[3] || '/',
            href: urlString
        };
    }

    /**
     * 獲取 WordPress 文章內容
     */
    function fetchArticle(resourceId, siteCode) {
        var endpoint = Config.API_ENDPOINTS.WP_CONTENT_API + '/' + resourceId + '?site=' + siteCode;

        var response = ApiClient.get(endpoint);
        var json = response.json();

        if (!json) {
            throw new Error('WordPress Article API 返回無效數據');
        }

        return json.data || json;
    }

    /**
     * 獲取 WordPress SEO 數據
     */
    function fetchSeo(articleUrl) {
        var payload = { url: articleUrl };

        var response = ApiClient.post(Config.API_ENDPOINTS.WP_SEO_API, payload);
        var json = response.json();

        if (!json) {
            throw new Error('WordPress SEO API 返回無效數據');
        }

        return json.data || json;
    }

    /**
     * 從 SEO 數據提取關鍵字
     */
    function extractKeywords(seoData) {
        if (!seoData) {
            return {
                focusKeyword: '',
                relatedKeywords: []
            };
        }

        var focusKeyword = '';
        var relatedKeywords = [];

        // 嘗試多種格式
        if (typeof seoData.focusKeyphrase === 'string' && seoData.focusKeyphrase.trim()) {
            var terms = seoData.focusKeyphrase.split('-').map(function (w) { return w.trim(); }).filter(Boolean);
            if (terms.length > 0) {
                focusKeyword = terms[0];
                relatedKeywords = terms.slice(1);
            }
        }

        if (!focusKeyword && typeof seoData.focusKeyphrase === 'object' && seoData.focusKeyphrase && seoData.focusKeyphrase.focus) {
            focusKeyword = seoData.focusKeyphrase.focus;
            relatedKeywords = seoData.focusKeyphrase.related || [];
        }

        if (!focusKeyword && seoData.keyphrase) {
            focusKeyword = Array.isArray(seoData.keyphrase) ? seoData.keyphrase[0] : seoData.keyphrase;
        }

        if (relatedKeywords.length === 0 && Array.isArray(seoData.relatedKeyphrase)) {
            relatedKeywords = seoData.relatedKeyphrase;
        }

        return {
            focusKeyword: focusKeyword || '',
            relatedKeywords: relatedKeywords.filter(Boolean)
        };
    }

    /**
     * 構建 HTML 文檔
     */
    function buildHtmlDocument(articleData, seoData, language) {
        var title = (seoData && seoData.title) || (articleData && articleData.title) || '';
        var description = (seoData && seoData.description) || '';
        var h1 = (articleData && articleData.title) || title;
        var bodyContent = (articleData && (articleData.post_content || articleData.content)) || '';

        var escapedTitle = Utils.escapeHtml(title);
        var escapedDescription = Utils.escapeHtml(description);

        return '<!DOCTYPE html>\n' +
            '<html lang="' + (language || 'zh_TW') + '">\n' +
            '<head>\n' +
            '  <meta charset="UTF-8">\n' +
            '  <title>' + escapedTitle + '</title>\n' +
            '  <meta name="description" content="' + escapedDescription + '">\n' +
            '</head>\n' +
            '<body>\n' +
            '  <h1>' + h1 + '</h1>\n' +
            '  ' + bodyContent + '\n' +
            '</body>\n' +
            '</html>';
    }

    return {
        parseUrl: parseUrl,
        fetchArticle: fetchArticle,
        fetchSeo: fetchSeo,
        extractKeywords: extractKeywords,
        buildHtmlDocument: buildHtmlDocument
    };
})();

// ============================================================
// HtmlTagAuditService - HTML 標籤審計服務
// ============================================================
var HtmlTagAuditService = (function () {
    'use strict';

    /**
     * 調用 PageLens analyze API
     */
    function analyze(url, focusKeyword, relatedKeywords, language) {
        Utils.log('[HtmlTagAuditService.analyze] URL: ' + url);

        var urlInfo = WordPressService.parseUrl(url);
        var articleData = WordPressService.fetchArticle(urlInfo.resourceId, urlInfo.siteCode);
        var seoData = WordPressService.fetchSeo(url);

        var keywords = WordPressService.extractKeywords(seoData);
        var resolvedFocusKeyword = focusKeyword || keywords.focusKeyword || '';
        var resolvedRelatedKeywords = (relatedKeywords && relatedKeywords.length > 0) ? relatedKeywords : keywords.relatedKeywords;

        var pageDetails = {
            url: url,
            title: (seoData && seoData.title) || (articleData && articleData.title) || '',
            description: (seoData && seoData.description) || '',
            language: language || Config.CONSTANTS.DEFAULT_LANGUAGE,
            author: (articleData && articleData.author && (articleData.author.display_name || articleData.author.displayName)) || '',
            publishedDate: (articleData && (articleData.post_date || articleData.publishedDate)) || '',
            category: 'WordPress Article'
        };

        var htmlContent = WordPressService.buildHtmlDocument(articleData, seoData, language);

        // 限制 HTML 長度
        var maxHtmlLength = 500000;
        if (htmlContent.length > maxHtmlLength) {
            Utils.log('[HtmlTagAuditService.analyze] HTML 過長，截斷至 ' + maxHtmlLength);
            htmlContent = htmlContent.substring(0, maxHtmlLength) + '</body></html>';
        }

        var payload = {
            htmlContent: htmlContent,
            pageDetails: pageDetails,
            focusKeyword: resolvedFocusKeyword,
            relatedKeywords: resolvedRelatedKeywords,
            options: {
                contentSelectors: PageLensConfig.DEFAULT_CONTENT_SELECTORS,
                excludeSelectors: PageLensConfig.DEFAULT_EXCLUDE_SELECTORS,
                assessmentConfig: {
                    enableAllSEO: true,
                    enableAllReadability: false
                }
            }
        };

        var response = ApiClient.post(Config.API_ENDPOINTS.PAGE_LENS_ANALYZE, payload);
        var json = response.json();

        if (!json || !json.success) {
            throw new Error('PageLens analyze 失敗: ' + (json && json.error ? json.error : '未知錯誤'));
        }

        return json;
    }

    /**
     * 提取 HTML 標籤問題
     */
    function extractIssues(result) {
        var issues = (result.report && result.report.detailedIssues) || [];

        // 排除可讀性問題
        var excludedReadability = ['FLESCH_READING_EASE', 'PARAGRAPH_LENGTH_LONG', 'SENTENCE_LENGTH_LONG', 'SUBHEADING_DISTRIBUTION_POOR'];
        var seoIssues = [];
        for (var i = 0; i < issues.length; i++) {
            var issueId = issues[i].id || issues[i].name;
            if (excludedReadability.indexOf(issueId) === -1) {
                seoIssues.push(issues[i]);
            }
        }

        var badIssues = [];
        var goodIssues = [];
        for (var i = 0; i < seoIssues.length; i++) {
            var rating = seoIssues[i].rating || seoIssues[i].status;
            if (rating === 'bad') {
                badIssues.push(seoIssues[i]);
            } else if (rating === 'good') {
                goodIssues.push(seoIssues[i]);
            }
        }

        var groupedSuggestions = groupIssuesByTag(badIssues, goodIssues);
        var allPassed = badIssues.length === 0;

        return {
            pass: allPassed,
            suggestions: groupedSuggestions
        };
    }

    /**
     * 按標籤分組問題
     */
    function groupIssuesByTag(badIssues, goodIssues) {
        var groups = {
            'H1': [],
            'H2': [],
            'Meta': [],
            'Image': [],
            'Keyword': [],
            'Content': [],
            'Other': []
        };

        // 處理問題項目
        for (var i = 0; i < badIssues.length; i++) {
            var issueId = badIssues[i].id || badIssues[i].name;
            var description = '❌ ' + getIssueDescription(issueId, badIssues[i].details || {});
            var group = getIssueGroup(issueId);
            groups[group].push(description);
        }

        // 處理通過項目（限制數量）
        var maxPassItemsPerGroup = 3;
        for (var i = 0; i < goodIssues.length; i++) {
            var issueId = goodIssues[i].id || goodIssues[i].name;
            var group = getIssueGroup(issueId);

            var passCount = 0;
            for (var j = 0; j < groups[group].length; j++) {
                if (groups[group][j].indexOf('✅') === 0) passCount++;
            }

            if (passCount < maxPassItemsPerGroup) {
                var description = '✅ ' + getPassDescription(issueId);
                groups[group].push(description);
            }
        }

        // 組合結果
        var result = [];
        var groupNames = ['H1', 'H2', 'Meta', 'Image', 'Keyword', 'Content', 'Other'];
        for (var i = 0; i < groupNames.length; i++) {
            var groupName = groupNames[i];
            if (groups[groupName].length > 0) {
                result.push('【' + groupName + '】');
                result = result.concat(groups[groupName]);
            }
        }

        return result;
    }

    function getIssueGroup(issueId) {
        if (issueId.indexOf('H1') !== -1) return 'H1';
        if (issueId.indexOf('H2') !== -1) return 'H2';
        if (issueId.indexOf('META') !== -1 || issueId.indexOf('TITLE') !== -1) return 'Meta';
        if (issueId.indexOf('IMAGE') !== -1) return 'Image';
        if (issueId.indexOf('KEYWORD') !== -1 || issueId.indexOf('DENSITY') !== -1) return 'Keyword';
        if (issueId.indexOf('CONTENT') !== -1) return 'Content';
        return 'Other';
    }

    function getIssueDescription(assessmentId, details) {
        var description = PageLensConfig.ISSUE_DESCRIPTIONS[assessmentId];

        if (assessmentId === 'META_DESCRIPTION_MISSING' && details) {
            if (details.pixelWidth === 0) description = 'Meta Description 缺失';
            else if (details.pixelWidth > 960) description = 'Meta Description 過長';
            else if (details.pixelWidth < 600) description = 'Meta Description 過短';
        }

        if (assessmentId === 'TITLE_NEEDS_IMPROVEMENT' && details) {
            if (details.pixelWidth === 0) description = 'Meta Title 缺失';
            else if (details.pixelWidth > 600) description = 'Meta Title 過長';
            else if (details.pixelWidth < 150) description = 'Meta Title 過短';
        }

        if (assessmentId === 'KEYWORD_DENSITY_LOW' && details && details.density !== undefined) {
            var densityRaw = Number(details.density);
            var optimal = (details.standards && details.standards.optimal) || {};
            var minOptimal = isNaN(Number(optimal.min)) ? 2.5 : Number(optimal.min);
            var maxOptimal = isNaN(Number(optimal.max)) ? 15 : Number(optimal.max);
            var derivedDensity = null;

            // 如果上游提供關鍵字出現次數與總詞數，嘗試推算百分比，避免舊版/新版本單位不同
            if (!isNaN(Number(details.keywordOccurrences)) && !isNaN(Number(details.totalWords)) && Number(details.totalWords) > 0) {
                var keywordLength = isNaN(Number(details.keywordWordLength)) ? 1 : Math.max(1, Number(details.keywordWordLength));
                derivedDensity = (Number(details.keywordOccurrences) * keywordLength / Number(details.totalWords)) * 100;
            }

            var densityPercent;
            if (!isNaN(densityRaw)) {
                // 新版 API 已以百分比返回；若數值過小且推算值較合理，採用推算值
                densityPercent = densityRaw <= 1 && derivedDensity && derivedDensity > 1.5 ? derivedDensity : densityRaw;
            } else if (derivedDensity !== null) {
                densityPercent = derivedDensity;
            }

            if (densityPercent !== undefined && densityPercent !== null) {
                var rangeText = minOptimal + '%-' + maxOptimal + '%';
                if (densityPercent < minOptimal) description = '關鍵字密度過低（' + densityPercent.toFixed(1) + '%，建議 ' + rangeText + '）';
                else if (densityPercent > maxOptimal) description = '關鍵字密度過高（' + densityPercent.toFixed(1) + '%，建議 ' + rangeText + '）';
                else description = '關鍵字密度適中（' + densityPercent.toFixed(1) + '%）';
            }
        }

        return description || '未知問題';
    }

    function getPassDescription(assessmentId) {
        var passDescriptions = {
            'H1_MISSING': 'H1 標籤正常',
            'MULTIPLE_H1': '單一 H1 標籤',
            'H1_KEYWORD_MISSING': 'H1 包含關鍵字',
            'H2_SYNONYMS_MISSING': 'H2 包含相關關鍵字',
            'IMAGES_MISSING_ALT': '圖片 Alt 文字完整',
            'KEYWORD_MISSING_FIRST_PARAGRAPH': '首段包含關鍵字',
            'KEYWORD_DENSITY_LOW': '關鍵字密度適中（2.5%-15%）',
            'META_DESCRIPTION_NEEDS_IMPROVEMENT': 'Meta Description 包含關鍵字',
            'META_DESCRIPTION_MISSING': 'Meta Description 長度適中',
            'TITLE_NEEDS_IMPROVEMENT': 'Meta Title 長度適中',
            'TITLE_MISSING': 'Meta Title 包含關鍵字',
            'CONTENT_LENGTH_SHORT': '內容長度充足'
        };

        return passDescriptions[assessmentId] || '檢測通過';
    }

    return {
        analyze: analyze,
        extractIssues: extractIssues
    };
})();

// ============================================================
// PageLensHtmlTagAudit - 主命名空間（保留向後兼容）
// ============================================================
var PageLensHtmlTagAudit = (function () {
    'use strict';

    /**
     * 分析單個 WordPress 文章（當前 Sheet）
     */
    function analyzeWpArticle() {
        return processBatchAnalysis(false);
    }

    /**
     * 初始化分析欄位（當前 Sheet）
     */
    function initializeAnalysisColumns() {
        return processBatchAnalysis(true);
    }

    /**
     * ⭐ 批次處理多個 Sheet（根據 PageLensConfig.TARGET_SHEETS）
     */
    function analyzeMultipleSheets(isInitMode) {
        var targetSheets = PageLensConfig.TARGET_SHEETS;

        if (!targetSheets || targetSheets.length === 0) {
            SheetHelper.showAlert('請先在 PageLensConfig.TARGET_SHEETS 中配置要處理的 Sheet 名稱清單', 'PageLens');
            return '未配置 TARGET_SHEETS';
        }

        var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        var totalProcessed = 0;
        var totalSkipped = 0;
        var failedSheets = [];

        Utils.log('[PageLens] 開始批次處理 ' + targetSheets.length + ' 個 Sheet');

        for (var i = 0; i < targetSheets.length; i++) {
            var sheetName = targetSheets[i];

            try {
                Utils.log('[PageLens] 正在處理 Sheet: ' + sheetName);

                var sheet = spreadsheet.getSheetByName(sheetName);
                if (!sheet) {
                    Utils.log('[PageLens] ⚠️ Sheet 不存在: ' + sheetName);
                    failedSheets.push(sheetName + ' (不存在)');
                    continue;
                }

                // 臨時切換到該 Sheet 進行處理
                spreadsheet.setActiveSheet(sheet);

                var result = processBatchAnalysis(isInitMode);

                // 解析結果統計
                if (result && typeof result === 'string') {
                    var match = result.match(/處理:\s*(\d+),\s*跳過:\s*(\d+)/);
                    if (match) {
                        totalProcessed += parseInt(match[1]);
                        totalSkipped += parseInt(match[2]);
                    }
                }

                Utils.log('[PageLens] ✅ Sheet 完成: ' + sheetName);

            } catch (e) {
                Utils.log('[PageLens] ❌ Sheet 處理失敗: ' + sheetName + ' - ' + e.message);
                failedSheets.push(sheetName + ' (' + e.message + ')');
            }
        }

        // 總結報告
        var summary = '批次處理完成！\n' +
            '總共處理: ' + totalProcessed + ' 列\n' +
            '總共跳過: ' + totalSkipped + ' 列\n' +
            '成功 Sheet: ' + (targetSheets.length - failedSheets.length) + '/' + targetSheets.length;

        if (failedSheets.length > 0) {
            summary += '\n\n失敗的 Sheet:\n' + failedSheets.join('\n');
        }

        SheetHelper.showAlert(summary, 'PageLens 批次處理結果');

        return summary;
    }

    /**
     * 批次分析處理（單一 Sheet）
     */
    function processBatchAnalysis(isInitMode) {
        var sheet = SheetHelper.getActiveSheet();
        var dataRange = sheet.getDataRange();
        var values = dataRange.getValues();

        if (values.length === 0) {
            SheetHelper.showAlert('工作表沒有任何資料', 'PageLens');
            return '工作表為空';
        }

        var headerRowIndex = PageLensConfig.HEADER_ROW_NUMBER - 1;

        // 檢查是否有足夠的行數
        if (values.length <= headerRowIndex) {
            SheetHelper.showAlert('工作表資料不足，至少需要 ' + (headerRowIndex + 1) + ' 列（包含表頭）', 'PageLens');
            return '資料行數不足';
        }

        var headers = values[headerRowIndex];

        // 檢查 headers 是否有效
        if (!headers || !Array.isArray(headers)) {
            SheetHelper.showAlert('無法讀取表頭（第 ' + PageLensConfig.HEADER_ROW_NUMBER + ' 列），請確認 Sheet 格式正確', 'PageLens');
            return '表頭格式錯誤';
        }

        var urlColIndex = SheetHelper.findColumnIndex(headers, PageLensConfig.URL_HEADER_CANDIDATES);
        var passColIndex = SheetHelper.findColumnIndex(headers, [PageLensConfig.PASS_HEADER]);
        var suggestionColIndex = SheetHelper.findColumnIndex(headers, [PageLensConfig.SUGGESTION_HEADER]);

        if (urlColIndex === -1) {
            SheetHelper.showAlert('找不到 URL 欄位，請確認表頭包含以下其中之一：' + PageLensConfig.URL_HEADER_CANDIDATES.join(', '), 'PageLens');
            return '找不到 URL 欄位';
        }
        if (passColIndex === -1) {
            SheetHelper.showAlert('找不到 ' + PageLensConfig.PASS_HEADER + ' 欄位', 'PageLens');
            return '找不到 PassTime 欄位';
        }
        if (suggestionColIndex === -1) {
            SheetHelper.showAlert('找不到 ' + PageLensConfig.SUGGESTION_HEADER + ' 欄位', 'PageLens');
            return '找不到 Suggestion 欄位';
        }

        var processedCount = 0;
        var skippedCount = 0;

        for (var rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
            var targetUrl = String(values[rowIndex][urlColIndex] || '').trim();
            if (!targetUrl) continue;

            var passValue = String(values[rowIndex][passColIndex] || '').trim();
            var suggestionValue = String(values[rowIndex][suggestionColIndex] || '').trim();

            var shouldProcess = false;
            if (isInitMode) {
                // 初始化模式：處理 HtmlTagSuggestion 為空的行
                shouldProcess = !suggestionValue;
            } else {
                // 正常模式：跳過已經 pass 的行
                shouldProcess = (passValue !== 'pass');
            }

            if (!shouldProcess) {
                skippedCount++;
                continue;
            }

            // 處理此行
            try {
                Utils.log('[PageLensHtmlTagAudit] 處理第 ' + (rowIndex + 1) + ' 列: ' + targetUrl);

                var result = HtmlTagAuditService.analyze(targetUrl, '', [], Config.CONSTANTS.DEFAULT_LANGUAGE);
                var issueSummary = HtmlTagAuditService.extractIssues(result);

                writeIssueSummary(sheet, rowIndex + 1, passColIndex + 1, suggestionColIndex + 1, issueSummary);

                processedCount++;

                if (processedCount % 5 === 0) {
                    SpreadsheetApp.flush();
                    Utils.log('[PageLensHtmlTagAudit] 已處理 ' + processedCount + ' 列');
                }

            } catch (e) {
                Utils.log('[PageLensHtmlTagAudit] 第 ' + (rowIndex + 1) + ' 列處理失敗: ' + e.message);
                sheet.getRange(rowIndex + 1, suggestionColIndex + 1).setValue('錯誤: ' + e.message);
            }
        }

        SpreadsheetApp.flush();

        var message = '處理完成！處理: ' + processedCount + ', 跳過: ' + skippedCount;
        SheetHelper.showToast(message, 'PageLens', 5);

        return message;
    }

    /**
     * 寫入問題摘要到 Sheet
     */
    function writeIssueSummary(sheet, rowNumber, passColNumber, suggestionColNumber, issueSummary) {
        var passTimeRange = sheet.getRange(rowNumber, passColNumber);
        var suggestionRange = sheet.getRange(rowNumber, suggestionColNumber);

        if (issueSummary.pass) {
            // 通過：寫入 'pass'
            suggestionRange.setValue('pass');

            // 只在首次通過時寫入時間
            if (!passTimeRange.getValue()) {
                passTimeRange.setValue(new Date());
            }
        } else {
            // 不通過：寫入建議
            var suggestionText = issueSummary.suggestions.join('\n');

            // 檢查長度限制
            var maxLength = 45000;
            if (suggestionText.length > maxLength) {
                suggestionText = suggestionText.substring(0, maxLength) + '\n...(內容過長已截斷)';
            }

            suggestionRange.setValue(suggestionText);
        }
    }

    return {
        analyzeWpArticle: analyzeWpArticle,
        initializeAnalysisColumns: initializeAnalysisColumns,
        analyzeMultipleSheets: analyzeMultipleSheets  // ⭐ 新增：批次處理多個 Sheet
    };
})();

// ============================================================
// 向後兼容的全局函數（供菜單調用）
// ============================================================
function PageLens_RunAnalyzeWpArticle() {
    return PageLensHtmlTagAudit.analyzeWpArticle();
}

function PageLens_InitializeColumns() {
    return PageLensHtmlTagAudit.initializeAnalysisColumns();
}

// ⭐ 新增：批次處理多個 Sheet（正常模式）
function PageLens_RunAnalyzeAllSheets() {
    return PageLensHtmlTagAudit.analyzeMultipleSheets(false);
}

// ⭐ 新增：批次處理多個 Sheet（初始化模式）
function PageLens_InitializeAllSheets() {
    return PageLensHtmlTagAudit.analyzeMultipleSheets(true);
}

// ============================================================
// 模組載入完成
// ============================================================
Utils.log('2_PageLens.js 已載入 - PageLens 功能可用');
