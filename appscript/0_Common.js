// ============================================================
// 0_Common.js - 共用基礎設施層
// ============================================================
// 此檔案包含所有共用工具、API 客戶端、Sheet 操作輔助和配置
// 其他所有檔案都依賴此檔案，因此使用 0_ 前綴確保最先載入
// ============================================================

// ============================================================
// Config - 配置管理命名空間
// ============================================================
var Config = (function () {
    'use strict';

    // API 端點配置
    var API_ENDPOINTS = {
        REPORT_API_BASE: (function () {
            try {
                return PropertiesService.getScriptProperties().getProperty('REPORT_API_BASE') || '';
            } catch (e) {
                return '';
            }
        })(),

        // RepostLens API 端點
        CONTEXT_VECTOR: '/api/report/context-vector',
        CONTEXT_VECTOR_BATCH: '/api/report/context-vector-batch',
        OPTIMIZE_ANALYZE: '/api/optimize/analyze',
        SEARCH_BY_URL: '/api/search/by-url',
        INTERNAL_LINKS: '/api/search/internal-links',
        OUTLINE: '/api/report/outline',
        OUTLINE_BATCH: '/api/report/outline-batch',

        // PageLens API 端點
        PAGE_LENS_BASE: 'https://page-lens-zeta.vercel.app',
        PAGE_LENS_ANALYZE: 'https://page-lens-zeta.vercel.app/analyze',

        // WordPress API
        WP_CONTENT_API: 'https://article-api.presslogic.com/v1/articles',
        WP_SEO_API: 'https://article-api.presslogic.com/v1/articles/getArticleSEO',

        // Keyword API
        KEYWORD_INSIGHTS_API: 'https://keyword-lens.vercel.app/api/url/keyword-insights'
    };

    // 欄位索引配置
    var COLUMN_INDEX = {
        // RepostLens 欄位
        URL: 1,
        CONTEXT_VECTOR: 2,
        ANALYSIS: 3,
        DOC_BODY: 4,
        DOC_LINK: 5,
        REGENERATED: 6
    };

    // 常量配置
    var CONSTANTS = {
        DEBUG: true,
        DEFAULT_LANGUAGE: 'zh_TW',
        MAX_RETRIES: 3,
        RETRY_DELAY_MS: 1000,
        BATCH_SIZE: 10,
        MAX_EXECUTION_TIME_MS: 5 * 60 * 1000 // 5分鐘
    };

    return {
        API_ENDPOINTS: API_ENDPOINTS,
        COLUMN_INDEX: COLUMN_INDEX,
        CONSTANTS: CONSTANTS
    };
})();

// ============================================================
// Utils - 通用工具函數命名空間
// ============================================================
var Utils = (function () {
    'use strict';

    /**
     * 日誌輸出（僅在 DEBUG 模式）
     */
    function log(msg) {
        if (Config.CONSTANTS.DEBUG) {
            try {
                Logger.log(String(msg));
            } catch (e) {
                // 靜默失敗
            }
        }
    }

    /**
     * 截斷字符串
     */
    function truncate(str, maxLength) {
        maxLength = maxLength || 200;
        str = String(str || '');
        return str.length <= maxLength ? str : str.slice(0, maxLength) + '...';
    }

    /**
     * URL 正規化
     */
    function normalizeUrl(url) {
        if (!url || typeof url !== 'string') return '';

        var normalized = url.trim();
        // 移除多餘的空白
        normalized = normalized.replace(/\s+/g, '');

        return normalized;
    }

    /**
     * 驗證 URL 是否有效
     */
    function isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;

        var urlPattern = /^https?:\/\/.+/i;
        return urlPattern.test(url.trim());
    }

    /**
     * 從 URL 解析 hostname
     */
    function parseHostname(url) {
        if (!url) return null;

        try {
            // 手動解析 URL
            var urlPattern = /^https?:\/\/([^\/\s]+)/i;
            var match = url.match(urlPattern);

            if (match && match[1]) {
                return match[1].toLowerCase();
            }
        } catch (e) {
            log('[parseHostname] 錯誤: ' + e.message);
        }

        return null;
    }

    /**
     * 安全解析 JSON
     */
    function safeJsonParse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            log('[safeJsonParse] 解析失敗: ' + truncate(text, 100));
            return null;
        }
    }

    /**
     * 清理多行文本
     */
    function sanitizeMultiline(value) {
        if (!value) return '';
        return String(value).trim();
    }

    /**
     * 清理字符串
     */
    function sanitizeString(value) {
        if (!value) return '';
        return String(value).trim();
    }

    /**
     * 轉換為數字或 null
     */
    function toNumberOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        var num = Number(value);
        return isNaN(num) ? null : num;
    }

    /**
     * 格式化數字顯示
     */
    function formatNumber(value, decimals) {
        if (value === null || value === undefined || value === '') return '—';

        var num = Number(value);
        if (isNaN(num)) return '—';

        if (decimals !== undefined) {
            return num.toFixed(decimals);
        }

        return num.toString();
    }

    /**
     * 格式化百分比
     */
    function formatPercent(value) {
        if (value === null || value === undefined) return '—';
        var num = Number(value);
        if (isNaN(num)) return '—';
        return (num * 100).toFixed(1) + '%';
    }

    /**
     * URL 安全解碼
     */
    function decodeURISafe(url) {
        try {
            return decodeURIComponent(url);
        } catch (e) {
            return url;
        }
    }

    /**
     * HTML 轉義
     */
    function escapeHtml(text) {
        if (text == null) return '';

        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 延遲執行
     */
    function sleep(ms) {
        Utilities.sleep(ms);
    }

    return {
        log: log,
        truncate: truncate,
        normalizeUrl: normalizeUrl,
        isValidUrl: isValidUrl,
        parseHostname: parseHostname,
        safeJsonParse: safeJsonParse,
        sanitizeMultiline: sanitizeMultiline,
        sanitizeString: sanitizeString,
        toNumberOrNull: toNumberOrNull,
        formatNumber: formatNumber,
        formatPercent: formatPercent,
        decodeURISafe: decodeURISafe,
        escapeHtml: escapeHtml,
        sleep: sleep
    };
})();

// ============================================================
// ApiClient - HTTP API 調用封裝命名空間
// ============================================================
var ApiClient = (function () {
    'use strict';

    /**
     * 發送 POST 請求
     */
    function post(url, payload, options) {
        options = options || {};

        var requestOptions = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        // 合併自定義選項
        for (var key in options) {
            if (options.hasOwnProperty(key)) {
                requestOptions[key] = options[key];
            }
        }

        Utils.log('[ApiClient.post] ' + url + ' payload=' + Utils.truncate(JSON.stringify(payload), 150));

        try {
            var response = UrlFetchApp.fetch(url, requestOptions);
            return handleResponse_(response, url);
        } catch (e) {
            throw new Error('API 請求失敗: ' + url + ' - ' + e.message);
        }
    }

    /**
     * 發送 GET 請求
     */
    function get(url, options) {
        options = options || {};

        var requestOptions = {
            method: 'get',
            muteHttpExceptions: true
        };

        // 合併自定義選項
        for (var key in options) {
            if (options.hasOwnProperty(key)) {
                requestOptions[key] = options[key];
            }
        }

        Utils.log('[ApiClient.get] ' + url);

        try {
            var response = UrlFetchApp.fetch(url, requestOptions);
            return handleResponse_(response, url);
        } catch (e) {
            throw new Error('API 請求失敗: ' + url + ' - ' + e.message);
        }
    }

    /**
     * 處理 HTTP 響應（私有函數）
     */
    function handleResponse_(response, url) {
        var statusCode = response.getResponseCode();
        var responseText = response.getContentText();

        Utils.log('[ApiClient] 響應 ' + statusCode + ' - ' + Utils.truncate(responseText, 160));

        if (statusCode < 200 || statusCode >= 300) {
            throw new Error('HTTP ' + statusCode + ': ' + Utils.truncate(responseText, 200));
        }

        return {
            statusCode: statusCode,
            body: responseText,
            json: function () {
                return Utils.safeJsonParse(responseText);
            }
        };
    }

    /**
     * 帶重試的 API 調用
     */
    function postWithRetry(url, payload, options) {
        var maxRetries = Config.CONSTANTS.MAX_RETRIES;
        var retryDelay = Config.CONSTANTS.RETRY_DELAY_MS;

        for (var attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return post(url, payload, options);
            } catch (e) {
                Utils.log('[ApiClient.postWithRetry] 嘗試 ' + attempt + '/' + maxRetries + ' 失敗: ' + e.message);

                if (attempt < maxRetries) {
                    Utils.sleep(retryDelay * attempt); // 指數退避
                } else {
                    throw e; // 最後一次嘗試失敗，拋出錯誤
                }
            }
        }
    }

    return {
        post: post,
        get: get,
        postWithRetry: postWithRetry
    };
})();

// ============================================================
// SheetHelper - Sheet 操作輔助命名空間
// ============================================================
var SheetHelper = (function () {
    'use strict';

    /**
     * 獲取當前活動 Sheet
     */
    function getActiveSheet() {
        return SpreadsheetApp.getActiveSheet();
    }

    /**
     * 根據名稱獲取 Sheet
     */
    function getSheetByName(sheetName) {
        var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = spreadsheet.getSheetByName(sheetName);

        if (!sheet) {
            throw new Error('找不到 Sheet: ' + sheetName);
        }

        return sheet;
    }

    /**
     * 查找欄位索引（根據表頭名稱）
     */
    function findColumnIndex(headers, columnNames) {
        // 防禦性檢查
        if (!headers || !Array.isArray(headers) || headers.length === 0) {
            Utils.log('[SheetHelper.findColumnIndex] 錯誤: headers 無效或為空');
            return -1;
        }

        if (!Array.isArray(columnNames)) {
            columnNames = [columnNames];
        }

        var lowerColumnNames = columnNames.map(function (name) {
            return name.toLowerCase();
        });

        for (var i = 0; i < headers.length; i++) {
            var headerLower = String(headers[i] || '').trim().toLowerCase();
            if (lowerColumnNames.indexOf(headerLower) !== -1) {
                return i; // 返回 0-based 索引
            }
        }

        return -1; // 未找到
    }

    /**
     * 批次處理 Sheet 資料
     * @param {Sheet} sheet
     * @param {number} startRow - 開始行（1-based）
     * @param {number} endRow - 結束行（1-based）
     * @param {Function} processor - 處理函數 (row, rowNumber) => boolean（返回 true 繼續，false 停止）
     * @param {Object} options - 可選配置 {batchSize, showProgress}
     */
    function batchProcess(sheet, startRow, endRow, processor, options) {
        options = options || {};
        var batchSize = options.batchSize || Config.CONSTANTS.BATCH_SIZE;
        var showProgress = options.showProgress !== false;

        var processed = 0;
        var failed = 0;

        for (var row = startRow; row <= endRow; row++) {
            try {
                var shouldContinue = processor(row);

                if (shouldContinue === false) {
                    Utils.log('[SheetHelper.batchProcess] 處理中斷於第 ' + row + ' 列');
                    break;
                }

                processed++;

                // 每批次後 flush
                if (processed % batchSize === 0) {
                    SpreadsheetApp.flush();

                    if (showProgress) {
                        var progress = Math.floor((row - startRow + 1) / (endRow - startRow + 1) * 100);
                        Utils.log('[SheetHelper.batchProcess] 進度: ' + progress + '% (' + processed + '/' + (endRow - startRow + 1) + ')');
                    }
                }
            } catch (e) {
                failed++;
                Utils.log('[SheetHelper.batchProcess] 第 ' + row + ' 列處理失敗: ' + e.message);
            }
        }

        // 最後 flush
        SpreadsheetApp.flush();

        return {
            processed: processed,
            failed: failed,
            total: endRow - startRow + 1
        };
    }

    /**
     * 顯示 Toast 通知
     */
    function showToast(message, title, timeoutSeconds) {
        title = title || '通知';
        timeoutSeconds = timeoutSeconds || 3;

        try {
            SpreadsheetApp.getActive().toast(message, title, timeoutSeconds);
        } catch (e) {
            Utils.log('[SheetHelper.showToast] Toast 顯示失敗: ' + e.message);
        }
    }

    /**
     * 顯示警告對話框
     */
    function showAlert(message, title) {
        title = title || '警告';

        try {
            SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
        } catch (e) {
            Utils.log('[SheetHelper.showAlert] 警告顯示失敗: ' + e.message);
        }
    }

    return {
        getActiveSheet: getActiveSheet,
        getSheetByName: getSheetByName,
        findColumnIndex: findColumnIndex,
        batchProcess: batchProcess,
        showToast: showToast,
        showAlert: showAlert
    };
})();

// ============================================================
// 模組資訊與版本
// ============================================================
Utils.log('0_Common.js 已載入 - Config, Utils, ApiClient, SheetHelper 命名空間可用');
