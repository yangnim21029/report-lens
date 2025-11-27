// ============================================================
// 1_RepostLens.js - RepostLens 完整功能模組
// ============================================================
// 此檔案包含 RepostLens 的所有功能：報告生成、批次處理、文檔創建
// 依賴: 0_Common.js (Config, Utils, ApiClient, SheetHelper)
// ============================================================

// ============================================================
// RepostLensConfig - 模組專用配置
// ============================================================
var RepostLensConfig = (function () {
    'use strict';

    return {
        TARGET_SHEET_NAME: 'Best',
        MAX_ANALYSIS_CHARS: 16000,
        MAX_RANK_ROWS: 18,
        MAX_PREV_ROWS: 10,
        MAX_ZERO_ROWS: 10,
        MAX_COVERAGE_ROWS: 12,
        MAX_EXPLORER_LIST: 8,
        MAX_EXPLORER_TABLE_CHARS: 2500,
        MAX_ANALYZE_CELL: 45000
    };
})();

// ============================================================
// ReportService - 報告生成核心業務邏輯
// ============================================================
var ReportService = (function () {
    'use strict';

    /**
     * 調用 search/by-url API
     */
    function searchByUrl(site, pageUrl) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.SEARCH_BY_URL;
        var payload = {
            site: site,
            page: String(pageUrl || '').replace(/\s+/g, '')
        };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json) {
            throw new Error('search.by-url 返回無效數據');
        }

        return Array.isArray(json) && json.length ? json[0] : null;
    }

    /**
     * 調用 optimize/analyze API
     */
    function analyzeOptimization(searchRow) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.OPTIMIZE_ANALYZE;
        var payload = {
            page: searchRow.page,
            bestQuery: searchRow.best_query,
            bestQueryClicks: Utils.toNumberOrNull(searchRow.best_query_clicks),
            bestQueryPosition: Utils.toNumberOrNull(searchRow.best_query_position),
            prevBestQuery: searchRow.prev_best_query,
            prevBestPosition: Utils.toNumberOrNull(searchRow.prev_best_position),
            prevBestClicks: Utils.toNumberOrNull(searchRow.prev_best_clicks),
            rank4: searchRow.rank_4,
            rank5: searchRow.rank_5,
            rank6: searchRow.rank_6,
            rank7: searchRow.rank_7,
            rank8: searchRow.rank_8,
            rank9: searchRow.rank_9,
            rank10: searchRow.rank_10
        };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json || json.success !== true) {
            throw new Error('optimize.analyze 失敗');
        }

        return json;
    }

    /**
     * 調用 context-vector API
     */
    function getContextVector(pageUrl, analysisText) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.CONTEXT_VECTOR;
        var payload = {
            pageUrl: String(pageUrl || '').replace(/\s+/g, ''),
            analysisText: analysisText
        };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json || json.success !== true) {
            throw new Error('context-vector 失敗');
        }

        return {
            suggestions: Array.isArray(json.suggestions) ? json.suggestions : [],
            markdown: Utils.sanitizeMultiline(json.markdown || '')
        };
    }

    /**
     * 調用 internal-links API 取得內部連結候選
     */
    function getInternalLinks(site, keyword) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.INTERNAL_LINKS;
        var payload = {
            site: site,
            keyword: keyword,
            limit: 5,
            periodDays: 180
        };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json) {
            throw new Error('internal-links 返回無效數據');
        }

        var results = [];
        if (Array.isArray(json.results)) {
            results = json.results;
        } else if (Array.isArray(json)) {
            results = json;
        }

        return {
            tokens: json.tokens || [],
            results: results
        };
    }

    /**
     * 調用 outline API
     */
    function getOutline(analysisText) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.OUTLINE;
        var payload = {
            analyzeResult: String(analysisText || '')
        };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json || json.success !== true) {
            throw new Error('outline 失敗');
        }

        return String(json.outline || '');
    }

    /**
     * 批次調用 context-vector API
     */
    function getContextVectorBatch(items) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.CONTEXT_VECTOR_BATCH;
        var payload = { items: items };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json || json.success !== true) {
            throw new Error('context-vector-batch 失敗');
        }

        return json.results || [];
    }

    /**
     * 批次調用 outline API
     */
    function getOutlineBatch(items) {
        var endpoint = Config.API_ENDPOINTS.REPORT_API_BASE + Config.API_ENDPOINTS.OUTLINE_BATCH;
        var payload = { items: items };

        var response = ApiClient.post(endpoint, payload);
        var json = response.json();

        if (!json || json.success !== true) {
            throw new Error('outline-batch 失敗');
        }

        return json.results || [];
    }

    return {
        searchByUrl: searchByUrl,
        analyzeOptimization: analyzeOptimization,
        getContextVector: getContextVector,
        getOutline: getOutline,
        getContextVectorBatch: getContextVectorBatch,
        getOutlineBatch: getOutlineBatch,
        getInternalLinks: getInternalLinks
    };
})();

// ============================================================
// DocumentService - Google Doc 文檔操作
// ============================================================
var DocumentService = (function () {
    'use strict';

    /**
     * 創建或更新 Google Doc
     */
    function upsertDocument(docCell, docName, sections) {
        // 檢查是否已存在文檔
        var existingUrl = docCell.getValue();
        var docId = extractDocId(existingUrl);
        var doc;

        if (docId) {
            try {
                doc = DocumentApp.openById(docId);
                Utils.log('[DocumentService] 更新現有文檔: ' + docId);
            } catch (e) {
                Utils.log('[DocumentService] 無法開啟現有文檔，將創建新文檔');
                doc = null;
            }
        }

        // 如果沒有現有文檔，創建新的
        if (!doc) {
            doc = DocumentApp.create(docName);
            Utils.log('[DocumentService] 創建新文檔: ' + doc.getId());
        } else {
            doc.setName(docName);
        }

        // 清空並重新寫入內容
        var body = doc.getBody();
        body.clear();

        writeSectionsToBody(body, sections);

        doc.saveAndClose();
        return doc.getUrl();
    }

    /**
     * 從 URL 提取 Doc ID
     */
    function extractDocId(url) {
        if (!url) return '';
        var match = String(url).match(/(?:\/d\/|id=)([A-Za-z0-9_-]{10,})/);
        return match ? match[1] : '';
    }

    /**
     * 將內容段落寫入 Doc body
     */
    function writeSectionsToBody(body, sections) {
        // === Hero block ===
        var heroTitle = body.appendParagraph('SEO 優化報告');
        heroTitle.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        heroTitle.editAsText().setFontSize(24).setBold(true).setForegroundColor('#2C3E50');

        body.appendParagraph('');

        var pageLabel = body.appendParagraph('頁面');
        pageLabel.editAsText().setFontSize(11).setBold(true).setForegroundColor('#7F8C8D');

        var pageValue = body.appendParagraph(sections.heroPage || '');
        var pageText = pageValue.editAsText();
        pageText.setFontSize(14).setForegroundColor('#2980B9').setUnderline(true);
        pageText.setLinkUrl(sections.heroPageUrl || '');

        body.appendParagraph('');

        if (sections.heroKeyword) {
            var keywordLabel = body.appendParagraph('核心關鍵字');
            keywordLabel.editAsText().setFontSize(11).setBold(true).setForegroundColor('#7F8C8D');

            var keywordValue = body.appendParagraph(sections.heroKeyword);
            keywordValue.editAsText().setFontSize(16).setBold(true).setForegroundColor('#E74C3C');
        }

        // 換頁
        body.appendPageBreak();

        // Keyword summary table
        if (sections.keywordSummaryTable && sections.keywordSummaryTable.rows) {
            body.appendParagraph(sections.keywordSummaryTable.title || 'Keyword Summary')
                .setHeading(DocumentApp.ParagraphHeading.HEADING2);
            var summaryTable = body.appendTable(sections.keywordSummaryTable.rows);
            summaryTable.setBorderWidth(1).setBorderColor('#CCCCCC');
            for (var r = 0; r < summaryTable.getNumRows(); r++) {
                var row = summaryTable.getRow(r);
                row.getCell(0).setWidth(100).setBackgroundColor('#F3F3F3')
                    .editAsText().setBold(true).setFontSize(10);
                row.getCell(1).setWidth(300)
                    .editAsText().setFontSize(10);
                row.getCell(0).setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
                row.getCell(1).setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
            }
            body.appendParagraph('');
        }

        // Content adjustments table
        if (sections.adjustmentsTable && sections.adjustmentsTable.rows) {
            body.appendParagraph(sections.adjustmentsTable.title || 'Content Adjustments')
                .setHeading(DocumentApp.ParagraphHeading.HEADING2);
            var adjTableData = [sections.adjustmentsTable.headers].concat(sections.adjustmentsTable.rows);
            var adjTable = body.appendTable(adjTableData);
            adjTable.setBorderWidth(1).setBorderColor('#CCCCCC');

            var adjHeader = adjTable.getRow(0);
            for (var hc = 0; hc < adjHeader.getNumCells(); hc++) {
                var hcell = adjHeader.getCell(hc);
                hcell.setBackgroundColor('#4A90E2')
                    .editAsText().setBold(true).setFontSize(11).setForegroundColor('#FFFFFF');
                hcell.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(12);
                hcell.setWidth(hc === 0 ? 150 : 300);
            }

            for (var ar = 1; ar < adjTable.getNumRows(); ar++) {
                var arow = adjTable.getRow(ar);
                var bg = ar % 2 === 1 ? '#FFFFFF' : '#F9F9F9';
                for (var ac = 0; ac < arow.getNumCells(); ac++) {
                    var acell = arow.getCell(ac);
                    acell.setBackgroundColor(bg)
                        .editAsText().setText(sections.adjustmentsTable.rows[ar - 1][ac]).setFontSize(10);
                    acell.setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(12);
                    acell.setWidth(ac === 0 ? 150 : 300);
                }
            }
            body.appendParagraph('');
        }

        // Outline
        if (sections.outlineEntries && sections.outlineEntries.length > 0) {
            body.appendParagraph('Suggested Outline').setHeading(DocumentApp.ParagraphHeading.HEADING2);
            for (var oi = 0; oi < sections.outlineEntries.length; oi++) {
                var entry = sections.outlineEntries[oi];
                var para;
                if (entry && entry.level === 2) {
                    para = body.appendParagraph('・' + entry.text);
                    para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
                    para.editAsText().setFontSize(11).setBold(true);
                } else {
                    para = body.appendParagraph('- ' + (entry.text || entry));
                    para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
                    para.setIndentStart(20);
                    para.editAsText().setFontSize(10);
                }
            }
        }

        // Internal links as list (URL + clicks)
        if (sections.internalLinksList && sections.internalLinksList.length) {
            body.appendParagraph('');
            body.appendParagraph('Internal Link Suggestions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
            var tokensNote = sections.internalLinkTokens && sections.internalLinkTokens.length
                ? 'Tokenized: ' + sections.internalLinkTokens.join(', ')
                : '';
            if (tokensNote) {
                body.appendParagraph(tokensNote).editAsText().setFontSize(9).setForegroundColor('#7F8C8D');
            }
            for (var li = 0; li < sections.internalLinksList.length; li++) {
                var linkItem = sections.internalLinksList[li];
                var line = (li + 1) + '. ' + (linkItem.url || '') + (linkItem.clicks ? ' (Clicks: ' + linkItem.clicks + ')' : '');
                var p = body.appendParagraph(line);
                p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
                var t = p.editAsText();
                t.setFontSize(10);
                if (linkItem.url) t.setLinkUrl(linkItem.url);
            }
        }

        // Coverage table
        if (sections.coverageTable && sections.coverageTable.rows) {
            body.appendParagraph('');
            body.appendParagraph(sections.coverageTable.title || 'Keyword Data')
                .setHeading(DocumentApp.ParagraphHeading.HEADING2);
            var covData = [sections.coverageTable.headers].concat(sections.coverageTable.rows);
            var covTable = body.appendTable(covData);
            covTable.setBorderWidth(1).setBorderColor('#CCCCCC');

            var covHeader = covTable.getRow(0);
            for (var cc = 0; cc < covHeader.getNumCells(); cc++) {
                var ccell = covHeader.getCell(cc);
                ccell.setBackgroundColor('#4A90E2')
                    .editAsText().setBold(true).setFontSize(10).setForegroundColor('#FFFFFF');
                ccell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
            }

            for (var cr = 1; cr < covTable.getNumRows(); cr++) {
                var crow = covTable.getRow(cr);
                var cbg = cr % 2 === 1 ? '#FFFFFF' : '#F9F9F9';
                for (var cc2 = 0; cc2 < crow.getNumCells(); cc2++) {
                    var c2 = crow.getCell(cc2);
                    c2.setBackgroundColor(cbg)
                        .editAsText().setText(sections.coverageTable.rows[cr - 1][cc2]).setFontSize(9);
                    c2.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
                }
            }
        }
    }

    /**
     * 刪除文檔（從 cell 中的 URL）
     */
    function deleteDocument(docCell) {
        var url = docCell.getValue();
        var docId = extractDocId(url);

        if (docId) {
            try {
                DriveApp.getFileById(docId).setTrashed(true);
                Utils.log('[DocumentService] 已刪除文檔: ' + docId);
            } catch (e) {
                Utils.log('[DocumentService] 刪除文檔失敗: ' + e.message);
            }
        }
    }

    return {
        upsertDocument: upsertDocument,
        extractDocId: extractDocId,
        writeSectionsToBody: writeSectionsToBody,
        deleteDocument: deleteDocument
    };
})();

// ============================================================
// DataProcessor - 數據處理與格式化
// ============================================================
var DataProcessor = (function () {
    'use strict';

    /**
     * 準備文檔段落（整合所有數據）
     */
    function prepareDocSections(pageUrl, searchRow, outline, analyzeData, contextResult, internalLinks) {
        var linksList = [];
        if (internalLinks && internalLinks.results && internalLinks.results.length) {
            // 只要 URL 與 clicks，依 clicks 由大到小
            var sorted = internalLinks.results.slice().sort(function (a, b) {
                var ca = Number(a && a.clicks) || 0;
                var cb = Number(b && b.clicks) || 0;
                return cb - ca;
            });
            for (var i = 0; i < sorted.length; i++) {
                linksList.push({
                    url: Utils.decodeURISafe(sorted[i].page || ''),
                    clicks: Utils.formatNumber(sorted[i].clicks)
                });
            }
        }

        return {
            heroPage: Utils.decodeURISafe(pageUrl),
            heroPageUrl: String(pageUrl || ''),
            heroKeyword: searchRow && searchRow.best_query ? searchRow.best_query : '',
            keywordSummaryTable: buildKeywordSummaryTable(searchRow, analyzeData),
            coverageTable: buildCoverageTable(analyzeData),
            adjustmentsTable: buildAdjustmentsTable(contextResult),
            internalLinksTable: buildInternalLinksTable(internalLinks),
            internalLinkTokens: internalLinks && internalLinks.tokens ? internalLinks.tokens : [],
            internalLinksList: linksList,
            outlineEntries: parseOutlineEntries(outline)
        };
    }

    /**
     * 建立關鍵字摘要表格
     */
    function buildKeywordSummaryTable(searchRow, analyzeData) {
        var mainKeywords = [];
        var relatedKeywords = [];

        if (searchRow && searchRow.best_query) {
            pushUnique(mainKeywords, searchRow.best_query);
        }

        // 從 analyzeData 提取關鍵字
        if (analyzeData && analyzeData.topRankKeywords) {
            for (var i = 0; i < analyzeData.topRankKeywords.length; i++) {
                pushUnique(mainKeywords, analyzeData.topRankKeywords[i].keyword);
            }
        }

        if (analyzeData && analyzeData.rankKeywords) {
            for (var i = 0; i < analyzeData.rankKeywords.length; i++) {
                pushUnique(relatedKeywords, analyzeData.rankKeywords[i].keyword);
            }
        }

        return {
            title: 'Keyword Summary',
            rows: [
                ['頁面主要關鍵字', mainKeywords.join(', ') || '—'],
                ['相關關鍵字', relatedKeywords.join(', ') || '—']
            ]
        };
    }

    function pushUnique(list, value) {
        var text = Utils.sanitizeString(value);
        if (!text) return;

        var lower = text.toLowerCase();
        for (var i = 0; i < list.length; i++) {
            if (list[i].toLowerCase() === lower) return;
        }
        list.push(text);
    }

    /**
     * 建立覆蓋率表格
     */
    function buildCoverageTable(analyzeData) {
        if (!analyzeData || !analyzeData.keywordCoverage) return null;

        var rows = [];
        var covered = analyzeData.keywordCoverage.covered || [];

        for (var i = 0; i < covered.length; i++) {
            var row = covered[i];
            rows.push([
                row.text,
                Utils.formatNumber(row.searchVolume),
                Utils.formatNumber(row.gsc && row.gsc.clicks),
                Utils.formatNumber(row.gsc && row.gsc.impressions),
                Utils.formatNumber(row.gsc && row.gsc.avgPosition, 1),
                ''
            ]);
        }

        if (rows.length === 0) return null;

        return {
            title: 'Keyword Data Notes',
            headers: ['Keyword', 'Search Volume', 'Clicks', 'Impressions', 'Avg Position', 'Note'],
            rows: rows
        };
    }

    /**
     * 建立內部連結建議表格
     */
    function buildInternalLinksTable(internalLinks) {
        if (!internalLinks || !internalLinks.results || internalLinks.results.length === 0) return null;

        var rows = [];
        for (var i = 0; i < internalLinks.results.length; i++) {
            var link = internalLinks.results[i];
            rows.push([
                Utils.decodeURISafe(link.page || ''),
                Utils.formatNumber(link.clicks),
                Utils.formatNumber(link.impressions),
                Utils.formatNumber(link.position, 1),
                Utils.sanitizeString(link.topQuery || ''),
                Utils.sanitizeMultiline(link.matchedQueries || '')
            ]);
        }

        return {
            title: 'Internal Link Suggestions',
            headers: ['URL', 'Clicks', 'Impressions', 'Avg Position', 'Top Query', 'Matched Queries'],
            rows: rows
        };
    }

    /**
     * 建立調整建議表格
     */
    function buildAdjustmentsTable(contextResult) {
        var suggestions = contextResult && contextResult.suggestions ? contextResult.suggestions : [];

        if (!suggestions || suggestions.length === 0) return null;

        var rows = [];
        for (var i = 0; i < suggestions.length; i++) {
            var item = suggestions[i];
            var before = Utils.sanitizeString(item.before);
            var why = Utils.sanitizeString(item.whyProblemNow);
            var after = Utils.sanitizeMultiline(item.afterAdjust || item.adjustAsFollows || '');

            if (!before) continue;

            var suggestion = [why, after].filter(function (s) { return s; }).join('\n\n');
            rows.push([before, suggestion]);
        }

        if (rows.length === 0) return null;

        return {
            title: 'Content Adjustments',
            headers: ['原文片段', '修改建議'],
            rows: rows
        };
    }

    /**
     * 解析 outline 為條目列表
     */
    function parseOutlineEntries(outline) {
        if (!outline) return [];

        var lines = String(outline).split('\n');
        var entries = [];

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line) {
                entries.push(line);
            }
        }

        return entries;
    }

    /**
     * 建立調整預覽文字（用於 Sheet cell）
     */
    function buildAdjustmentsPreviewText(adjustmentsTable) {
        if (!adjustmentsTable || !adjustmentsTable.rows) return '';

        var previews = [];
        for (var i = 0; i < Math.min(3, adjustmentsTable.rows.length); i++) {
            previews.push((i + 1) + '. ' + adjustmentsTable.rows[i][0].substring(0, 50) + '...');
        }

        return previews.join('\n');
    }

    return {
        prepareDocSections: prepareDocSections,
        buildAdjustmentsPreviewText: buildAdjustmentsPreviewText
    };
})();

// ============================================================
// Helpers - Payload 縮減工具
// ============================================================
function buildCompactAnalysisPayload(freshAnalysis) {
    var compact = {
        analysis: String(freshAnalysis && freshAnalysis.analysis ? freshAnalysis.analysis : ''),
        keywordCoverage: freshAnalysis && freshAnalysis.keywordCoverage ? freshAnalysis.keywordCoverage : null,
        topRankKeywords: freshAnalysis && freshAnalysis.topRankKeywords ? freshAnalysis.topRankKeywords : null,
        rankKeywords: freshAnalysis && freshAnalysis.rankKeywords ? freshAnalysis.rankKeywords : null
    };

    var json = JSON.stringify(compact);

    // Google Sheet 單一儲存格最多 50,000 字元，保留安全餘量
    if (json.length > 48000 && compact.analysis) {
        compact.analysis = compact.analysis.slice(0, 30000);
        json = JSON.stringify(compact);
    }
    if (json.length > 48000 && compact.analysis) {
        compact.analysis = compact.analysis.slice(0, 20000);
        json = JSON.stringify(compact);
    }
    if (json.length > 48000 && compact.analysis) {
        compact.analysis = '';
        json = JSON.stringify(compact);
    }
    if (json.length > 48000) {
        json = json.slice(0, 48000);
    }

    return json;
}

// 生成簡短的人類可讀摘要（避免在 Sheet 填入冗長 JSON）
function buildAnalysisSummary(searchRow) {
    var parts = [];
    if (searchRow && searchRow.best_query) {
        parts.push('KW: ' + searchRow.best_query);
    }
    if (searchRow && searchRow.best_query_clicks) {
        parts.push('Clicks: ' + searchRow.best_query_clicks);
    }
    if (searchRow && searchRow.best_query_position) {
        parts.push('Pos: ' + searchRow.best_query_position);
    }
    var summary = parts.join(' | ');
    if (!summary) summary = '分析完成';
    if (summary.length > 80) summary = summary.slice(0, 77) + '...';
    return summary;
}

// ============================================================
// RepostLensController - 主控制器（UI 入口）
// ============================================================
var RepostLensController = (function () {
    'use strict';

    /**
     * 獲取目標 Sheet
     */
    function getTargetSheet() {
        var sheetName = RepostLensConfig.TARGET_SHEET_NAME;

        if (!sheetName) {
            SheetHelper.showAlert('請先設定 TARGET_SHEET_NAME');
            return null;
        }

        try {
            return SheetHelper.getSheetByName(sheetName);
        } catch (e) {
            SheetHelper.showAlert('找不到分頁: ' + sheetName);
            return null;
        }
    }

    /**
     * 處理單列
     */
    function processRow(sheet, rowNumber) {
        Utils.log('[processRow] 處理第 ' + rowNumber + ' 列');

        var colIndex = Config.COLUMN_INDEX;
        var urlCell = sheet.getRange(rowNumber, colIndex.URL);
        var contextCell = sheet.getRange(rowNumber, colIndex.CONTEXT_VECTOR);
        var analysisCell = sheet.getRange(rowNumber, colIndex.ANALYSIS);
        var docBodyCell = sheet.getRange(rowNumber, colIndex.DOC_BODY);
        var docLinkCell = sheet.getRange(rowNumber, colIndex.DOC_LINK);

        // 檢查是否已處理
        if (docBodyCell.getValue()) {
            Utils.log('[processRow] 跳過第 ' + rowNumber + ' 列，已處理');
            return;
        }

        var rawUrl = String(urlCell.getValue() || '').trim();
        var normalizedUrl = Utils.normalizeUrl(rawUrl);

        if (!Utils.isValidUrl(normalizedUrl)) {
            contextCell.setValue('SKIP: 非有效網址');
            return;
        }

        urlCell.setValue(normalizedUrl);

        try {
            var host = Utils.parseHostname(normalizedUrl);
            if (!host) throw new Error('URL 缺少 host');

            var site = 'sc-domain:' + host.replace(/^www\./, '');
            var searchRow = ReportService.searchByUrl(site, normalizedUrl);

            if (!searchRow) {
                contextCell.setValue('SKIP: search.by-url 無資料');
                return;
            }

            // 內部連結建議
            var internalLinks = null;
            if (searchRow.best_query) {
                try {
                    internalLinks = ReportService.getInternalLinks(site, searchRow.best_query);
                } catch (e) {
                    Utils.log('[processRow] internal-links 失敗: ' + e.message);
                }
            }

            // 獲取或生成分析
            var analysisCellValue = analysisCell.getValue();
            var analyzeData = null;
            if (analysisCellValue && /^[\\[{]/.test(String(analysisCellValue).trim())) {
                analyzeData = Utils.safeJsonParse(analysisCellValue);
            }
            var analysisText = analyzeData && analyzeData.analysis ? analyzeData.analysis : '';

            if (!analysisText) {
                var freshAnalysis = ReportService.analyzeOptimization(searchRow);
                analysisText = freshAnalysis.analysis || '';
                analyzeData = freshAnalysis;
            }

            if (!analysisText) {
                contextCell.setValue('SKIP: 無分析內容');
                return;
            }

            // 獲取 context vector 和 outline
            var contextResult = ReportService.getContextVector(normalizedUrl, analysisText);
            var outline = ReportService.getOutline(analysisText);

            // 準備文檔段落
            var sections = DataProcessor.prepareDocSections(
                normalizedUrl,
                searchRow,
                outline,
                analyzeData,
                contextResult,
                internalLinks
            );

            // 只在 Sheet 留下簡短摘要，避免佔滿儲存格
            analysisCell.setValue(buildAnalysisSummary(searchRow));
            // Sheet 中不再保留過程數據，只留簡短提示與 Doc 連結
            contextCell.setValue('');
            docBodyCell.setValue('');

            // 創建文檔
            var docName = 'RepostLens Draft - ' + (searchRow.best_query || host);
            var docUrl = DocumentService.upsertDocument(docLinkCell, docName, sections);
            docLinkCell.setValue(docUrl);

        } catch (err) {
            var message = err && err.message ? err.message : String(err);
            Utils.log('[processRow] 錯誤 row=' + rowNumber + ' ' + message);
            docBodyCell.setValue('ERROR: ' + message);
        }
    }

    /**
     * 處理整個 Sheet
     */
    function runForSheet() {
        var sheet = getTargetSheet();
        if (!sheet) return;

        var lastRow = sheet.getLastRow();
        if (lastRow < 2) {
            SheetHelper.showAlert('Sheet 沒有資料列');
            return;
        }

        SheetHelper.showToast('開始處理 ' + (lastRow - 1) + ' 列', 'RepostLens', 3);

        for (var row = 2; row <= lastRow; row++) {
            processRow(sheet, row);

            if (row < lastRow) {
                Utils.sleep(600);
            }
        }

        SheetHelper.showToast('處理完成', 'RepostLens', 5);
    }

    /**
     * 處理當前活動列
     */
    function runForActiveRow() {
        var sheet = getTargetSheet();
        if (!sheet) return;

        var activeSheet = SheetHelper.getActiveSheet();
        if (activeSheet.getName() !== sheet.getName()) {
            SheetHelper.showAlert('請切換到 ' + RepostLensConfig.TARGET_SHEET_NAME + ' 分頁');
            return;
        }

        var activeCell = activeSheet.getActiveCell();
        var row = activeCell.getRow();

        if (row < 2) {
            SheetHelper.showAlert('請選擇第2列以後的資料列');
            return;
        }

        processRow(sheet, row);
        SheetHelper.showToast('處理完成', 'RepostLens', 3);
    }

    return {
        runForSheet: runForSheet,
        runForActiveRow: runForActiveRow
    };
})();

// ============================================================
// 向後兼容的全局函數（供菜單調用）
// ============================================================
function runForSheet() {
    return RepostLensController.runForSheet();
}

function runForActiveRow() {
    return RepostLensController.runForActiveRow();
}

// ============================================================
// 模組載入完成
// ============================================================
Utils.log('1_RepostLens.js 已載入 - RepostLens功能可用');
