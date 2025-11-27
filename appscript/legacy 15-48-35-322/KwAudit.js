// 建立 PageLensHtmlTagAudit 命名空間以避免與其他 Apps Script 衝突
var PageLensHtmlTagAudit = (function () {
    const CONFIG = {
        baseUrl: 'https://page-lens-zeta.vercel.app',
        wordpressContentApi: 'https://article-api.presslogic.com/v1/articles',
        wordpressSeoApi: 'https://article-api.presslogic.com/v1/articles/getArticleSEO',
        headerRowNumber: 2, // 1-based header row index，可視需要調整
        urlHeaderCandidates: ['url', 'URL', 'Url'],
        passHeader: 'HtmlTagPassTime',
        suggestionHeader: 'HtmlTagSuggestion',
        focusKeywordHeader: 'FocusKeyword',
        trackingKeywordHeader: 'TrackingKeyword'
    };

    const WORDPRESS_SITE_MAP = {
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

    const WORDPRESS_SUBPATH_MAP = {
        'girlstyle.com/sg': 'GS_SG',
        'girlstyle.com/my': 'GS_MY',
        'girlstyle.com/tw': 'GS_TW',
        'holidaysmart.io/hk': 'HS_HK',
        'holidaysmart.io/tw': 'HS_TW'
    };

    const DEFAULT_CONTENT_SELECTORS = [
        'main',
        'article',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        '#content',
        '#main',
        '.pl-main-article'
    ];

    const DEFAULT_EXCLUDE_SELECTORS = [
        'script',
        'style',
        'nav',
        'header',
        'footer',
        'aside',
        '.sidebar',
        '.menu',
        '.navigation',
        '.comments',
        '.related-posts'
    ];

    const DEFAULT_LANGUAGE = 'zh_TW';

    // 簡潔的問題描述映射 (只包含 SEO 項目)
    const ISSUE_DESCRIPTIONS = {
        H1_MISSING: '缺少 H1 標籤',
        MULTIPLE_H1: '多個 H1 標籤',
        H1_KEYWORD_MISSING: 'H1 缺少 Target Keyword',
        H2_SYNONYMS_MISSING: 'H2 缺少相關關鍵字',
        IMAGES_MISSING_ALT: '圖片缺少 Alt 文字',
        KEYWORD_MISSING_FIRST_PARAGRAPH: '首段缺少關鍵字',
        KEYWORD_DENSITY_LOW: '關鍵字密度異常',
        META_DESCRIPTION_NEEDS_IMPROVEMENT: 'Meta Description 缺少關鍵字',
        META_DESCRIPTION_MISSING: 'Meta Description 長度問題',
        TITLE_NEEDS_IMPROVEMENT: 'Meta Title 長度問題',
        TITLE_MISSING: 'Meta Title 缺少關鍵字',
        CONTENT_LENGTH_SHORT: '內容過短'
    };

    // 排除的可讀性評估項目
    const EXCLUDED_READABILITY_ISSUES = [
        'FLESCH_READING_EASE',
        'PARAGRAPH_LENGTH_LONG',
        'SENTENCE_LENGTH_LONG',
        'SUBHEADING_DISTRIBUTION_POOR'
    ];

    function analyzeWpArticle() {
        return processBatchAnalysis(false); // 正常執行模式，跳過已 pass 的行
    }

    function fetchWpContentByUrl(articleUrl) {
        Logger.log(`開始抓取 WordPress 內容，輸入 URL: ${articleUrl}`);
        const details = parseWordPressUrl(articleUrl);
        Logger.log(
            `解析結果 -> resourceId=${details.resourceId}, siteCode=${details.siteCode}`
        );

        const articleData = fetchWordPressArticle(details.resourceId, details.siteCode);
        const seoData = fetchWordPressSeo(articleUrl);

        Logger.log(`抓取成功 URL: ${articleUrl}`);
        return {
            article: articleData,
            seo: seoData
        };
    }

    function callPageLensAnalyze(params) {
        const { url, focusKeyword, relatedKeywords, language } = params;
        if (!url) {
            throw new Error('URL is required');
        }

        const normalizedLanguage = language || DEFAULT_LANGUAGE;
        const { resourceId, siteCode } = parseWordPressUrl(url);

        Logger.log(`WordPress 解析 -> postId=${resourceId}, siteCode=${siteCode}`);

        const articleData = fetchWordPressArticle(resourceId, siteCode);
        const seoData = fetchWordPressSeo(url);

        const { defaultFocusKeyword, defaultRelatedKeywords } = extractKeywordsFromSeo(seoData);

        const resolvedFocusKeyword = focusKeyword || defaultFocusKeyword || '';
        const resolvedRelatedKeywords = (relatedKeywords && relatedKeywords.length > 0)
            ? relatedKeywords
            : defaultRelatedKeywords;

        const pageDetails = {
            url,
            title: seoData?.title || articleData?.title || '',
            description: seoData?.description || '',
            language: normalizedLanguage,
            author: articleData?.author?.display_name || articleData?.author?.displayName || '',
            publishedDate: articleData?.post_date || articleData?.publishedDate || '',
            category: 'WordPress Article'
        };

        let htmlContent = buildHtmlDocument({
            articleData,
            seoData,
            language: normalizedLanguage
        });

        // 限制 HTML 內容長度避免 payload 過大
        const maxHtmlLength = 500000; // 500KB 限制
        if (htmlContent.length > maxHtmlLength) {
            Logger.log(`HTML 內容過長 (${htmlContent.length} 字元)，截斷至 ${maxHtmlLength} 字元`);

            // 保留 head 部分和部分 body 內容
            const headMatch = htmlContent.match(/<head>[\s\S]*?<\/head>/i);
            const bodyStartMatch = htmlContent.match(/<body[^>]*>/i);

            if (headMatch && bodyStartMatch) {
                const headContent = headMatch[0];
                const bodyStart = bodyStartMatch[0];
                const remainingLength = maxHtmlLength - headContent.length - bodyStart.length - 100;

                const bodyContentStart = htmlContent.indexOf(bodyStart) + bodyStart.length;
                const truncatedBodyContent = htmlContent.substring(bodyContentStart, bodyContentStart + remainingLength);

                htmlContent = `<!DOCTYPE html><html lang="${normalizedLanguage}">${headContent}${bodyStart}${truncatedBodyContent}</body></html>`;
            } else {
                htmlContent = htmlContent.substring(0, maxHtmlLength) + '</body></html>';
            }
        }

        const payload = {
            htmlContent,
            pageDetails,
            focusKeyword: resolvedFocusKeyword,
            relatedKeywords: resolvedRelatedKeywords,
            options: {
                contentSelectors: DEFAULT_CONTENT_SELECTORS,
                excludeSelectors: DEFAULT_EXCLUDE_SELECTORS,
                assessmentConfig: {
                    enableAllSEO: true,
                    enableAllReadability: false // 關閉可讀性檢測減少回應大小
                }
            }
        };

        Logger.log(
            `呼叫 analyze，payload 摘要: url=${url}, language=${normalizedLanguage}, focusKeyword=${resolvedFocusKeyword || '未提供'
            }, relatedKeywords=${resolvedRelatedKeywords.join(', ') || '未提供'}, htmlLength=${htmlContent.length}`
        );

        const response = UrlFetchApp.fetch(`${CONFIG.baseUrl}/analyze`, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });

        const status = response.getResponseCode();
        const text = response.getContentText();
        Logger.log(`analyze 回應狀態: ${status}, 回應長度: ${text.length}`);

        if (status < 200 || status >= 300) {
            throw new Error(`PageLens analyze failed (${status}): ${text.substring(0, 500)}`);
        }

        const result = JSON.parse(text);
        if (!result.success) {
            throw new Error(`PageLens analyze failed: ${result.error || text.substring(0, 500)}`);
        }

        return result;
    }

    function extractHtmlTagIssues(result) {
        const issues = result.report?.detailedIssues ?? [];

        // 過濾掉可讀性問題，只保留 SEO 問題
        const seoIssues = issues.filter(issue => {
            const issueId = issue.id || issue.name;
            return !EXCLUDED_READABILITY_ISSUES.includes(issueId);
        });

        const badIssues = seoIssues.filter(issue => (issue.rating || issue.status) === 'bad');
        const goodIssues = seoIssues.filter(issue => (issue.rating || issue.status) === 'good');

        // 按標籤分組處理問題
        const groupedSuggestions = groupIssuesByTag(badIssues, goodIssues);

        const allPassed = badIssues.length === 0;

        return {
            pass: allPassed,
            suggestions: groupedSuggestions
        };
    }

    function groupIssuesByTag(badIssues, goodIssues) {
        const groups = {
            'H1': [],
            'H2': [],
            'Meta': [],
            'Image': [],
            'Keyword': [],
            'Content': [],
            'Other': []
        };

        // 處理問題項目 (優先顯示)
        badIssues.forEach(issue => {
            const issueId = issue.id || issue.name;
            const description = '❌ ' + getIssueDescription(issueId, issue.details || {});
            const group = getIssueGroup(issueId);
            groups[group].push(description);
        });

        // 處理通過項目 (限制數量避免過長)
        const maxPassItemsPerGroup = 3; // 每組最多顯示3個通過項目
        goodIssues.forEach(issue => {
            const issueId = issue.id || issue.name;
            const group = getIssueGroup(issueId);

            // 限制每組通過項目數量
            const passItemsInGroup = groups[group].filter(item => item.startsWith('✅')).length;
            if (passItemsInGroup < maxPassItemsPerGroup) {
                const description = '✅ ' + getPassDescription(issueId);
                groups[group].push(description);
            }
        });

        // 組合結果，只包含有內容的分組
        const result = [];
        let totalLength = 0;
        const maxTotalLength = 40000; // 預留安全邊界

        Object.keys(groups).forEach(groupName => {
            if (groups[groupName].length > 0) {
                const groupHeader = `【${groupName}】`;
                const groupContent = groups[groupName];

                // 估算這個分組的長度
                const groupLength = groupHeader.length + groupContent.join('\n').length + 10;

                if (totalLength + groupLength < maxTotalLength) {
                    result.push(groupHeader);
                    result.push(...groupContent);
                    totalLength += groupLength;
                } else {
                    // 如果會超長，只加入問題項目
                    const problemItems = groupContent.filter(item => item.startsWith('❌'));
                    if (problemItems.length > 0) {
                        const problemLength = groupHeader.length + problemItems.join('\n').length + 10;
                        if (totalLength + problemLength < maxTotalLength) {
                            result.push(groupHeader);
                            result.push(...problemItems);
                            totalLength += problemLength;
                        }
                    }
                }
            }
        });

        return result;
    }

    function getIssueGroup(issueId) {
        if (issueId.includes('H1')) return 'H1';
        if (issueId.includes('H2')) return 'H2';
        if (issueId.includes('META') || issueId.includes('TITLE')) return 'Meta';
        if (issueId.includes('IMAGE')) return 'Image';
        if (issueId.includes('KEYWORD') || issueId.includes('DENSITY')) return 'Keyword';
        if (issueId.includes('CONTENT')) return 'Content';
        return 'Other';
    }

    function getPassDescription(assessmentId) {
        const passDescriptions = {
            H1_MISSING: 'H1 標籤正常',
            MULTIPLE_H1: '單一 H1 標籤',
            H1_KEYWORD_MISSING: 'H1 包含關鍵字',
            H2_SYNONYMS_MISSING: 'H2 包含相關關鍵字',
            IMAGES_MISSING_ALT: '圖片 Alt 文字完整',
            KEYWORD_MISSING_FIRST_PARAGRAPH: '首段包含關鍵字',
            KEYWORD_DENSITY_LOW: '關鍵字密度適中',
            META_DESCRIPTION_NEEDS_IMPROVEMENT: 'Meta Description 包含關鍵字',
            META_DESCRIPTION_MISSING: 'Meta Description 長度適中',
            TITLE_NEEDS_IMPROVEMENT: 'Meta Title 長度適中',
            TITLE_MISSING: 'Meta Title 包含關鍵字',
            CONTENT_LENGTH_SHORT: '內容長度充足'
        };

        return passDescriptions[assessmentId] || '檢測通過';
    }

    function parseWordPressUrl(articleUrl) {
        if (!articleUrl) {
            throw new Error('文章 URL 不可為空');
        }

        const parsed = safeParseUrl(articleUrl);
        if (!parsed) {
            throw new Error(`無法解析文章 URL: ${articleUrl}`);
        }

        const pathname = parsed.pathname.replace(/\/+$/, '');
        const host = parsed.hostname.toLowerCase();
        const normalizedPath = `${host}${pathname}`.toLowerCase();

        let siteCode = null;
        const subPathKeys = Object.keys(WORDPRESS_SUBPATH_MAP).sort((a, b) => b.length - a.length);
        for (const key of subPathKeys) {
            if (normalizedPath.startsWith(key)) {
                siteCode = WORDPRESS_SUBPATH_MAP[key];
                break;
            }
        }

        if (!siteCode) {
            siteCode = WORDPRESS_SITE_MAP[host];
        }

        if (!siteCode) {
            throw new Error(`無法從 URL 判斷站點代碼: ${articleUrl}`);
        }

        const idMatch = pathname.match(/\/(\d+)(?=\/|$)/);
        if (!idMatch) {
            throw new Error(`無法從 URL 擷取文章 ID: ${articleUrl}`);
        }

        return {
            resourceId: idMatch[1],
            siteCode
        };
    }

    function safeParseUrl(articleUrl) {
        const tested = new Set();
        const candidates = [
            articleUrl,
            articleUrl.trim(),
            articleUrl.replace(/\s+/g, ''),
            encodeURI(articleUrl)
        ];

        for (const candidate of candidates) {
            const variant = (candidate || '').trim();
            if (!variant || tested.has(variant)) {
                continue;
            }
            tested.add(variant);
            try {
                const parsedUrl = parseUrlManually(variant);
                if (parsedUrl) {
                    Logger.log(`URL 解析成功: ${variant}`);
                    return parsedUrl;
                }
            } catch (error) {
                Logger.log(`URL 解析失敗 (${variant}): ${error}`);
            }
        }

        return null;
    }

    function parseUrlManually(urlString) {
        if (!urlString || typeof urlString !== 'string') {
            return null;
        }

        // Basic URL regex pattern
        const urlPattern = /^(https?):\/\/([^\/\s]+)(\/[^\s]*)?$/i;
        const match = urlString.match(urlPattern);

        if (!match) {
            return null;
        }

        const protocol = match[1].toLowerCase();
        const hostname = match[2].toLowerCase();
        const pathname = match[3] || '/';

        return {
            protocol: protocol + ':',
            hostname: hostname,
            pathname: pathname,
            href: urlString
        };
    }

    function fetchWordPressArticle(resourceId, siteCode) {
        const endpoint = `${CONFIG.wordpressContentApi}/${resourceId}?site=${siteCode}`;
        const response = UrlFetchApp.fetch(endpoint, {
            method: 'get',
            contentType: 'application/json',
            muteHttpExceptions: true
        });

        const status = response.getResponseCode();
        const text = response.getContentText();
        Logger.log(`WordPress Article API 回應 (${status}): ${endpoint}`);

        if (status < 200 || status >= 300) {
            throw new Error(`WordPress Article API returned ${status}: ${text}`);
        }

        const data = JSON.parse(text);
        return data?.data || data;
    }

    function fetchWordPressSeo(articleUrl) {
        const payload = { url: articleUrl };
        const response = UrlFetchApp.fetch(CONFIG.wordpressSeoApi, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        });

        const status = response.getResponseCode();
        const text = response.getContentText();
        Logger.log(`WordPress SEO API 回應 (${status})`);

        if (status < 200 || status >= 300) {
            throw new Error(`WordPress SEO API returned ${status}: ${text}`);
        }

        const data = JSON.parse(text);
        return data?.data || data;
    }

    function extractKeywordsFromSeo(seoData) {
        if (!seoData) {
            return {
                defaultFocusKeyword: '',
                defaultRelatedKeywords: []
            };
        }

        let focusKeyword = '';
        let relatedKeywords = [];

        if (typeof seoData.focusKeyphrase === 'string' && seoData.focusKeyphrase.trim()) {
            const terms = seoData.focusKeyphrase
                .split('-')
                .map(word => word.trim())
                .filter(Boolean);
            if (terms.length > 0) {
                focusKeyword = terms[0];
                relatedKeywords = terms.slice(1);
            }
        }

        if (!focusKeyword && typeof seoData.focusKeyphrase === 'object' && seoData.focusKeyphrase?.focus) {
            focusKeyword = seoData.focusKeyphrase.focus;
            relatedKeywords = seoData.focusKeyphrase?.related || [];
        }

        if (!focusKeyword && seoData.keyphrase) {
            focusKeyword = Array.isArray(seoData.keyphrase)
                ? seoData.keyphrase[0]
                : seoData.keyphrase;
        }

        if (!relatedKeywords.length && Array.isArray(seoData.relatedKeyphrase)) {
            relatedKeywords = seoData.relatedKeyphrase;
        }

        return {
            defaultFocusKeyword: focusKeyword || '',
            defaultRelatedKeywords: relatedKeywords.filter(Boolean)
        };
    }

    function buildHtmlDocument({ articleData, seoData, language }) {
        const title = seoData?.title || articleData?.title || '';
        const description = seoData?.description || '';
        const h1 = articleData?.title || title;
        const bodyContent = articleData?.post_content || articleData?.content || '';

        const escapedTitle = escapeHtml(title);
        const escapedDescription = escapeHtml(description);

        return `<!DOCTYPE html>
<html lang="${language || DEFAULT_LANGUAGE}">
<head>
  <meta charset="UTF-8">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}">
</head>
<body>
  <h1>${h1 || ''}</h1>
  ${bodyContent || ''}
</body>
</html>`;
    }

    function getSheetContext() {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        if (!sheet) {
            throw new Error('找不到目前作用中的工作表');
        }

        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        if (values.length === 0) {
            throw new Error('工作表沒有任何資料');
        }

        const headerRowIndex = Math.max((CONFIG.headerRowNumber || 1) - 1, 0);
        if (headerRowIndex >= values.length) {
            throw new Error(`Header row index ${CONFIG.headerRowNumber} 超出資料範圍`);
        }

        const headers = values[headerRowIndex].map(h => (h || '').toString());
        const urlColIndex = findHeaderIndex(headers, CONFIG.urlHeaderCandidates);
        const passColIndex = findHeaderByName(headers, CONFIG.passHeader);
        const suggestionColIndex = findHeaderByName(headers, CONFIG.suggestionHeader);
        const focusKeywordColIndex = findHeaderByName(headers, CONFIG.focusKeywordHeader);
        const trackingKeywordColIndex = findHeaderByName(headers, CONFIG.trackingKeywordHeader);

        if (urlColIndex === -1) {
            throw new Error(`找不到 URL 欄位，請確認欄位名稱是否為 ${CONFIG.urlHeaderCandidates.join('/')}`);
        }
        if (passColIndex === -1) {
            throw new Error(`找不到 ${CONFIG.passHeader} 欄位`);
        }
        if (suggestionColIndex === -1) {
            throw new Error(`找不到 ${CONFIG.suggestionHeader} 欄位`);
        }

        Logger.log(
            `表頭設定 -> URL=${urlColIndex}, Pass=${passColIndex}, Suggestion=${suggestionColIndex}, Focus=${focusKeywordColIndex}, Tracking=${trackingKeywordColIndex}, Language=${DEFAULT_LANGUAGE}`
        );

        return {
            sheet,
            values,
            headerRowIndex,
            urlColIndex,
            passColIndex,
            suggestionColIndex,
            focusKeywordColIndex,
            trackingKeywordColIndex
        };
    }

    /**
       * 將分析結果寫入工作表，並遵循新的邏輯：
       * - 通過時：Suggestion 欄位寫入 'pass'，Time 欄位寫入首次通過時間。
       * - 不通過時：Suggestion 欄位寫入詳細建議，Time 欄位不動。
       */
    function writeIssueSummary(sheet, rowNumber, passColNumber, suggestionColNumber, issueSummary) {
        // 1. 取得 "時間 (passColNumber)" 和 "建議 (suggestionColNumber)" 這兩個欄位的儲存格
        const passTimeRange = sheet.getRange(rowNumber, passColNumber);
        const suggestionRange = sheet.getRange(rowNumber, suggestionColNumber);

        if (issueSummary.pass) {
            // 2. 如果分析結果為 "通過"

            // 在 suggestion 欄位寫入 'pass'
            suggestionRange.setValue('pass');

            // 【關鍵】只在「首次通過」時寫入時間戳記，避免覆蓋
            // 檢查 "HtmlTagPassTime" 欄位是否為空
            if (!passTimeRange.getValue()) {
                passTimeRange.setValue(new Date());
            }

        } else {
            // 3. 如果分析結果為 "不通過"

            // 將詳細建議寫入 suggestion 欄位
            setSuggestionContent(suggestionRange, issueSummary.suggestions, rowNumber);

            // 【關鍵】這裡不再有 passTimeRange.clearContent()，
            // 因此已有的時間戳記會被完整保留。
        }
    }

    function writeIssueSummaryUpdateOnly(sheet, rowNumber, suggestionColNumber, issueSummary) {
        const suggestionRange = sheet.getRange(rowNumber, suggestionColNumber);
        // 只更新 suggestion，不動 pass 欄位
        setSuggestionContent(suggestionRange, issueSummary.suggestions, rowNumber);
    }

    function setSuggestionContent(suggestionRange, suggestions, rowNumber) {
        // 處理過長的建議內容
        let suggestionText = (suggestions || []).join('\n');

        // Google Sheets 單一儲存格限制約 50,000 字元
        const maxLength = 45000;
        if (suggestionText.length > maxLength) {
            suggestionText = suggestionText.substring(0, maxLength) + '\n...(內容過長已截斷)';
            Logger.log(`第 ${rowNumber} 行建議內容過長，已截斷至 ${maxLength} 字元`);
        }

        try {
            suggestionRange.setValue(suggestionText);
        } catch (error) {
            // 如果還是失敗，嘗試更短的版本
            const shortText = suggestionText.substring(0, 10000) + '\n...(內容已大幅截斷)';
            try {
                suggestionRange.setValue(shortText);
                Logger.log(`第 ${rowNumber} 行使用短版本建議內容`);
            } catch (secondError) {
                suggestionRange.setValue('建議內容過長，無法顯示');
                Logger.log(`第 ${rowNumber} 行建議內容寫入失敗: ${secondError.message}`);
            }
        }
    }

    function findHeaderIndex(headers, candidates) {
        const lowerCandidates = candidates.map(c => c.toLowerCase());
        for (let i = 0; i < headers.length; i++) {
            const normalizedHeader = (headers[i] || '').toString().trim().toLowerCase();
            if (lowerCandidates.includes(normalizedHeader)) {
                return i;
            }
        }
        return -1;
    }

    function findHeaderByName(headers, name) {
        const target = (name || '').toLowerCase();
        for (let i = 0; i < headers.length; i++) {
            const normalizedHeader = (headers[i] || '').toString().trim().toLowerCase();
            if (normalizedHeader === target) {
                Logger.log(target, i)
                return i;
            }
        }
        return -1;
    }

    function parseTrackingKeywords(rawValue) {
        if (!rawValue) {
            return [];
        }
        const asString = rawValue.toString();
        return asString
            .split(/\r?\n|\t|,/)
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => item.replace(/\(\d+\)$/, '').trim())
            .filter(Boolean);
    }

    function sanitizeKeyword(value) {
        if (!value) {
            return '';
        }
        return value.toString().replace(/\(\d+\)$/, '').trim();
    }

    function getIssueDescription(assessmentId, details) {
        let description = ISSUE_DESCRIPTIONS[assessmentId];

        // 特殊處理某些項目的細節
        if (assessmentId === 'META_DESCRIPTION_MISSING' && details) {
            if (details.pixelWidth === 0) {
                description = 'Meta Description 缺失';
            } else if (details.pixelWidth > 960) {
                description = 'Meta Description 過長';
            } else if (details.pixelWidth < 600) {
                description = 'Meta Description 過短';
            }
        }

        if (assessmentId === 'TITLE_NEEDS_IMPROVEMENT' && details) {
            if (details.pixelWidth === 0) {
                description = 'Meta Title 缺失';
            } else if (details.pixelWidth > 600) {
                description = 'Meta Title 過長';
            } else if (details.pixelWidth < 150) {
                description = 'Meta Title 過短';
            }
        }

        if (assessmentId === 'KEYWORD_DENSITY_LOW' && details) {
            if (details.density !== undefined) {
                if (details.density < 0.5) {
                    description = '關鍵字密度過低';
                } else if (details.density > 6.0) {
                    description = '關鍵字密度過高';
                } else if (details.density > 2.5) {
                    description = '關鍵字密度偏高';
                }
            }
        }

        return description || '未知問題';
    }

    function escapeHtml(text) {
        if (text == null) {
            return '';
        }
        return text
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function initializeAnalysisColumns() {
        return processBatchAnalysis(true); // 初始化模式，處理沒有 pass 值的行
    }

    function processBatchAnalysis(isInitMode = false) {
        const context = getSheetContext();
        const {
            sheet,
            values,
            headerRowIndex,
            urlColIndex,
            passColIndex,
            suggestionColIndex,
            focusKeywordColIndex,
            trackingKeywordColIndex
        } = context;

        let processedCount = 0;
        let skippedCount = 0;
        const batchSize = 3; // 固定批次大小為 3
        const startTime = new Date().getTime();
        const maxExecutionTime = 5 * 60 * 1000; // 5分鐘限制

        // 找到需要處理的行
        const rowsToProcess = [];
        for (let rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex++) {
            const targetUrl = (values[rowIndex][urlColIndex] || '').toString().trim();
            if (!targetUrl) {
                continue;
            }

            const passValue = (values[rowIndex][passColIndex] || '').toString().trim();
            const suggestionValue = (values[rowIndex][suggestionColIndex] || '').toString().trim();

            if (isInitMode) {
                // 初始化模式：處理 HtmlTagSuggestion 為空的行
                if (suggestionValue) {
                    skippedCount++;
                    continue;
                }
            } else {
                // 正常執行模式：跳過已經 pass 的行
                if (passValue === 'pass') {
                    skippedCount++;
                    continue;
                }
            }

            rowsToProcess.push(rowIndex);
        }

        const mode = isInitMode ? '初始化' : '正常執行';
        Logger.log(`${mode}模式：找到 ${rowsToProcess.length} 行需要處理，${skippedCount} 行已跳過`);

        // 批次處理
        for (let batchStart = 0; batchStart < rowsToProcess.length; batchStart += batchSize) {
            // 檢查執行時間
            const currentTime = new Date().getTime();
            if (currentTime - startTime > maxExecutionTime) {
                Logger.log(`執行時間超過限制，停止處理。已處理 ${processedCount} 行`);
                break;
            }

            const batchEnd = Math.min(batchStart + batchSize, rowsToProcess.length);
            const currentBatch = rowsToProcess.slice(batchStart, batchEnd);

            Logger.log(`處理批次 ${Math.floor(batchStart / batchSize) + 1}：第 ${batchStart + 1} 到 ${batchEnd} 項`);

            // 處理當前批次
            for (let i = 0; i < currentBatch.length; i++) {
                const rowIndex = currentBatch[i];
                const targetUrl = (values[rowIndex][urlColIndex] || '').toString().trim();

                const focusKeyword = focusKeywordColIndex !== -1
                    ? sanitizeKeyword(values[rowIndex][focusKeywordColIndex])
                    : '';
                const trackingKeywordRaw = trackingKeywordColIndex !== -1
                    ? values[rowIndex][trackingKeywordColIndex]
                    : '';
                const trackingKeywords = parseTrackingKeywords(trackingKeywordRaw);

                Logger.log(`[${i + 1}/${currentBatch.length}] 分析第 ${rowIndex + 1} 行: ${targetUrl}`);

                try {
                    const result = callPageLensAnalyze({
                        url: targetUrl,
                        focusKeyword,
                        relatedKeywords: trackingKeywords,
                        language: DEFAULT_LANGUAGE
                    });

                    const issues = extractHtmlTagIssues(result);

                    if (isInitMode) {
                        // 初始化模式：正常寫入 pass 狀態
                        writeIssueSummary(sheet, rowIndex + 1, passColIndex + 1, suggestionColIndex + 1, issues);
                    } else {
                        // 正常執行模式：只更新 suggestion，不覆蓋 pass
                        writeIssueSummaryUpdateOnly(sheet, rowIndex + 1, suggestionColIndex + 1, issues);
                    }

                    processedCount++;
                    Logger.log(`✅ 完成第 ${rowIndex + 1} 行 -> pass=${issues.pass}`);
                } catch (error) {
                    const message = error && error.message ? error.message : String(error);

                    if (isInitMode) {
                        writeIssueSummary(sheet, rowIndex + 1, passColIndex + 1, suggestionColIndex + 1, {
                            pass: false,
                            suggestions: [`API Error: ${message}`]
                        });
                    } else {
                        writeIssueSummaryUpdateOnly(sheet, rowIndex + 1, suggestionColIndex + 1, {
                            pass: false,
                            suggestions: [`API Error: ${message}`]
                        });
                    }

                    processedCount++;
                    Logger.log(`❌ 第 ${rowIndex + 1} 行失敗: ${message}`);
                }
            }

            // 每個批次完成後 flush
            SpreadsheetApp.flush();
            Logger.log(`批次 ${Math.floor(batchStart / batchSize) + 1} 完成，已處理 ${currentBatch.length} 行`);
        }

        Logger.log(`${mode}分析完成，共處理 ${processedCount} 行`);
        return `${mode} completed - ${processedCount} rows processed`;
    }

    return {
        analyzeWpArticle,
        fetchWpContentByUrl,
        callPageLensAnalyze,
        extractHtmlTagIssues,
        parseWordPressUrl,
        writeIssueSummary,
        initializeAnalysisColumns
    };
})();

function PageLens_RunAnalyzeWpArticle() {
    return PageLensHtmlTagAudit.analyzeWpArticle();
}

function PageLens_RunFetchWpContent() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const selection = sheet.getActiveCell();
    const url = selection ? selection.getValue() : '';
    return PageLensHtmlTagAudit.fetchWpContentByUrl(url);
}

function PageLens_InitializeColumns() {
    return PageLensHtmlTagAudit.initializeAnalysisColumns();
}


