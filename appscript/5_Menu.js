// ============================================================
// 5_Menu.js - 統一入口與菜單管理
// ============================================================
// 此檔案包含 Apps Script 的入口函數 onOpen() 和所有菜單註冊
// 依賴: 所有其他模組 (0-4)
// ============================================================

// ============================================================
// Apps Script 入口函數
// ============================================================
function onOpen() {
    MenuRegistry.registerAllMenus();
}

// ============================================================
// MenuRegistry - 菜單註冊管理命名空間
// ============================================================
var MenuRegistry = (function () {
    'use strict';

    /**
     * 註冊所有菜單
     */
    function registerAllMenus() {
        var ui = SpreadsheetApp.getUi();

        // RepostLens 菜單
        ui.createMenu('RepostLens')
            .addItem('處理當前列', 'runForActiveRow')
            .addItem('處理整個 Sheet', 'runForSheet')
            .addSeparator()
            .addSubMenu(ui.createMenu('觸發器管理')
                .addItem('創建自動觸發器', 'TriggerManager_CreateTrigger')
                .addItem('刪除所有觸發器', 'TriggerManager_DeleteAllTriggers')
                .addItem('列出所有觸發器', 'TriggerManager_ListTriggers'))
            .addToUi();

        // PageLens / Audit 菜單
        ui.createMenu('PageLens')
            .addItem('分析當前 Sheet', 'PageLens_RunAnalyzeWpArticle')
            .addItem('初始化當前 Sheet', 'PageLens_InitializeColumns')
            .addSeparator()
            .addItem('🔄 批次處理所有配置的 Sheet', 'PageLens_RunAnalyzeAllSheets')
            .addItem('🔄 初始化所有配置的 Sheet', 'PageLens_InitializeAllSheets')
            .addToUi();

        // 關鍵字研究菜單
        ui.createMenu('關鍵字研究')
            .addItem('Adwords 關鍵字分析', 'fetchKeywordData')
            .addItem('URL 關鍵字洞察', 'runProcessor')
            .addToUi();

        // 元數據菜單
        ui.createMenu('元數據')
            .addItem('提取作者與日期', 'processSheet')
            .addToUi();

        Utils.log('[MenuRegistry] 所有菜單已註冊');
    }

    return {
        registerAllMenus: registerAllMenus
    };
})();

// ============================================================
// TriggerManager - 觸發器管理命名空間
// ============================================================
var TriggerManager = (function () {
    'use strict';

    /**
     * 創建時間驅動觸發器
     */
    function createTimeDrivenTrigger(functionName, intervalMinutes) {
        functionName = functionName || 'runForSheet';
        intervalMinutes = intervalMinutes || 3;

        try {
            ScriptApp.newTrigger(functionName)
                .timeBased()
                .everyMinutes(intervalMinutes)
                .create();

            var message = '成功創建觸發器：每 ' + intervalMinutes + ' 分鐘執行 ' + functionName;
            Utils.log('[TriggerManager] ' + message);
            SheetHelper.showToast(message, '觸發器管理', 5);
        } catch (e) {
            var error = '創建觸發器失敗: ' + e.message;
            Utils.log('[TriggerManager] ' + error);
            SheetHelper.showAlert(error);
        }
    }

    /**
     * 刪除所有觸發器
     */
    function deleteAllTriggers() {
        try {
            var triggers = ScriptApp.getProjectTriggers();
            var count = triggers.length;

            for (var i = 0; i < triggers.length; i++) {
                ScriptApp.deleteTrigger(triggers[i]);
            }

            var message = '已刪除 ' + count + ' 個觸發器';
            Utils.log('[TriggerManager] ' + message);
            SheetHelper.showToast(message, '觸發器管理', 5);
        } catch (e) {
            var error = '刪除觸發器失敗: ' + e.message;
            Utils.log('[TriggerManager] ' + error);
            SheetHelper.showAlert(error);
        }
    }

    /**
     * 列出所有觸發器
     */
    function listTriggers() {
        try {
            var triggers = ScriptApp.getProjectTriggers();

            if (triggers.length === 0) {
                SheetHelper.showAlert('目前沒有觸發器', '觸發器列表');
                return;
            }

            var triggerList = [];
            for (var i = 0; i < triggers.length; i++) {
                var trigger = triggers[i];
                var info = (i + 1) + '. ' + trigger.getHandlerFunction();

                if (trigger.getEventType() === ScriptApp.EventType.CLOCK) {
                    info += ' (時間驅動)';
                } else if (trigger.getEventType() === ScriptApp.EventType.ON_OPEN) {
                    info += ' (開啟時)';
                }

                triggerList.push(info);
            }

            var message = '共 ' + triggers.length + ' 個觸發器:\n\n' + triggerList.join('\n');
            SheetHelper.showAlert(message, '觸發器列表');

        } catch (e) {
            var error = '列出觸發器失敗: ' + e.message;
            Utils.log('[TriggerManager] ' + error);
            SheetHelper.showAlert(error);
        }
    }

    return {
        createTimeDrivenTrigger: createTimeDrivenTrigger,
        deleteAllTriggers: deleteAllTriggers,
        listTriggers: listTriggers
    };
})();

// ============================================================
// 觸發器管理的全局函數（供菜單調用）
// ============================================================
function TriggerManager_CreateTrigger() {
    return TriggerManager.createTimeDrivenTrigger('runForSheet', 3);
}

function TriggerManager_DeleteAllTriggers() {
    return TriggerManager.deleteAllTriggers();
}

function TriggerManager_ListTriggers() {
    return TriggerManager.listTriggers();
}

// ============================================================
// 模組載入完成
// ============================================================
Utils.log('5_Menu.js 已載入 - 所有菜單與觸發器管理功能可用');
Utils.log('=====================================');
Utils.log('RepostLens Apps Script 重構版本已載入完成');
Utils.log('所有模組: 0_Common, 1_RepostLens, 2_PageLens, 3_KeywordResearch, 4_Metadata, 5_Menu');
Utils.log('=====================================');
