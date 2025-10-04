// RepostLens sheet converter script wrapped in a namespaced module
const RepostLensConverter = (() => {
  const MENU_NAME = 'RepostLens Converter';

  const createMenu = () => {
    SpreadsheetApp.getUi()
      .createMenu(MENU_NAME)
      .addItem('轉換當前分頁 → Processed Tab', 'RL_CONV_convertActiveSheet')
      .addToUi();
  };

  const convertActiveSheet = () => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getActiveSheet();
    const values = sourceSheet.getDataRange().getValues();
    if (!values || values.length < 2) {
      SpreadsheetApp.getUi().alert('當前分頁沒有資料可轉換');
      return;
    }

    const headers = values[0].map((header) => String(header || '').trim());
    if (!headers.length) {
      SpreadsheetApp.getUi().alert('找不到表頭，無法轉換');
      return;
    }

    const rows = [];
    for (let i = 1; i < values.length; i += 1) {
      const rowValues = values[i];
      if (!rowValues || !rowValues.length) continue;
      const rowObj = {};
      let hasValue = false;
      for (let c = 0; c < headers.length; c += 1) {
        const header = headers[c];
        if (!header) continue;
        const cell = rowValues[c];
        if (cell !== '' && cell !== null && cell !== undefined) hasValue = true;
        rowObj[header] = cell;
      }
      if (hasValue) rows.push(rowObj);
    }

    const processed = aggregateCustomCsvRows(rows);
    if (!processed.length) {
      SpreadsheetApp.getUi().alert('沒有找到可轉換的 URL 資料');
      return;
    }

    const targetName = sourceSheet.getName() + ' (Processed)';
    let targetSheet = ss.getSheetByName(targetName);
    if (!targetSheet) {
      targetSheet = ss.insertSheet(targetName);
    } else {
      targetSheet.clearContents();
      targetSheet.clearFormats();
    }

    const columns = getProcessedColumnsLayout();
    const headerRow = columns.map((col) => col.header);
    const output = [headerRow];
    processed.forEach((item) => {
      output.push(
        columns.map((col) => {
          try {
            const value = col.value(item);
            return value === null || value === undefined ? '' : value;
          } catch (e) {
            return '';
          }
        }),
      );
    });

    targetSheet.getRange(1, 1, output.length, headerRow.length).setValues(output);
    targetSheet.setFrozenRows(1);
    targetSheet.autoResizeColumns(1, headerRow.length);
    ss.setActiveSheet(targetSheet);
    SpreadsheetApp.getActive().toast(`轉換完成，共 ${processed.length} 筆 URL`, MENU_NAME, 5);
  };

  const aggregateCustomCsvRows = (rows) => {
    const groups = {};
    rows.forEach((row) => {
      const url = String(row['Current URL'] || row['Current URL inside'] || '').trim();
      if (!url) return;
      if (!groups[url]) groups[url] = [];
      groups[url].push(row);
    });

    const processed = [];
    Object.keys(groups).forEach((url) => {
      const keywords = groups[url];
      if (!keywords.length) return;

      const topRanking = keywords
        .filter((k) => {
          const pos = csvToFloat(k['Current position']);
          return pos >= 1 && pos <= 3;
        })
        .sort((a, b) => csvToInt(b['Current organic traffic']) - csvToInt(a['Current organic traffic']));

      const sortedByCurrentTraffic = keywords
        .slice()
        .sort((a, b) => csvToInt(b['Current organic traffic']) - csvToInt(a['Current organic traffic']));

      const bestKeyword = topRanking.length ? topRanking[0] : sortedByCurrentTraffic[0];

      const prevBestKeyword = keywords
        .slice()
        .sort((a, b) => csvToInt(b['Previous organic traffic']) - csvToInt(a['Previous organic traffic']))[0];

      const rank1to10 = keywords
        .filter((k) => {
          const pos = csvToFloat(k['Current position']);
          return pos >= 1 && pos <= 10;
        })
        .sort((a, b) => csvToFloat(a['Current position']) - csvToFloat(b['Current position']));

      const rank4to10 = keywords
        .filter((k) => {
          const pos = csvToFloat(k['Current position']);
          return pos >= 4 && pos <= 10;
        })
        .sort((a, b) => csvToFloat(a['Current position']) - csvToFloat(b['Current position']));

      const rankGroups = {};
      const rankGt10 = [];
      const items1to10 = [];
      const seenNames = {};

      keywords.forEach((kw) => {
        const keywordText = String(kw.Keyword || '(N/A)').trim();
        const clicks = csvToInt(kw['Current organic traffic']);
        const volume = csvToInt(kw.Volume);
        const position = csvToFloat(kw['Current position']);
        const entry = `${keywordText}(click: ${clicks}, impression: ${volume}, position: ${position.toFixed(1)})`;
        const rounded = Math.round(position);
        if (position >= 1 && position <= 10) {
          if (!rankGroups[rounded]) rankGroups[rounded] = [];
          rankGroups[rounded].push(entry);
          if (!seenNames[keywordText]) {
            seenNames[keywordText] = true;
            items1to10.push(`${keywordText} (SV: ${volume || 0}, Clicks: ${clicks}, Pos: ${position.toFixed(1)})`);
          }
        } else if (position > 10) {
          rankGt10.push(entry);
        }
      });

      const joinedRanks = {};
      for (let pos = 1; pos <= 10; pos += 1) {
        joinedRanks[pos] = Array.isArray(rankGroups[pos]) && rankGroups[pos].length
          ? rankGroups[pos].join(', ')
          : null;
      }

      const totalClicks = keywords.reduce((sum, k) => sum + csvToInt(k['Current organic traffic']), 0);
      const potentialTraffic = rank4to10.reduce((sum, k) => sum + csvToInt(k['Current organic traffic']), 0);

      const regionCandidates = {};
      keywords.forEach((k) => {
        const candidate = normalizeRegionCodeForCsv(String(k.Country || k.Location || ''));
        if (candidate) regionCandidates[candidate] = true;
      });
      const inferred = inferRegionFromUrlForCsv(url);
      if (inferred) regionCandidates[inferred] = true;

      const countryRaw = String(keywords[0]['Country'] || keywords[0]['Location'] || '');
      const countryRegion = normalizeRegionCodeForCsv(countryRaw);
      if (countryRegion) regionCandidates[countryRegion] = true;

      const regions = Object.keys(regionCandidates);
      const regionCode = countryRegion || (regions.length ? regions[0] : null);

      processed.push({
        page: url,
        country: countryRaw || null,
        regionCode,
        regions: regions.length ? regions : null,
        best_query: bestKeyword ? String(bestKeyword.Keyword || '').trim() || null : null,
        best_query_clicks: bestKeyword ? csvToInt(bestKeyword['Current organic traffic']) : null,
        best_query_position: bestKeyword ? csvToFloat(bestKeyword['Current position']) : null,
        best_query_volume: bestKeyword ? csvToInt(bestKeyword.Volume) : null,
        prev_best_query: prevBestKeyword ? String(prevBestKeyword.Keyword || '').trim() || null : null,
        prev_best_clicks: prevBestKeyword ? csvToInt(prevBestKeyword['Previous organic traffic']) : null,
        prev_best_position: prevBestKeyword ? csvToFloat(prevBestKeyword['Previous position']) : null,
        prev_main_keyword: prevBestKeyword ? String(prevBestKeyword.Keyword || '').trim() || null : null,
        prev_keyword_rank: prevBestKeyword ? csvToFloat(prevBestKeyword['Previous position']) : null,
        prev_keyword_traffic: prevBestKeyword ? csvToInt(prevBestKeyword['Previous organic traffic']) : null,
        total_clicks: totalClicks,
        keywords_1to10_count: rank1to10.length,
        keywords_4to10_count: rank4to10.length,
        total_keywords: keywords.length,
        keywords_1to10_ratio: keywords.length ? `${((rank1to10.length / keywords.length) * 100).toFixed(1)}%` : null,
        keywords_4to10_ratio: keywords.length ? `${((rank4to10.length / keywords.length) * 100).toFixed(1)}%` : null,
        potential_traffic: potentialTraffic,
        current_rank_1: joinedRanks[1],
        current_rank_2: joinedRanks[2],
        current_rank_3: joinedRanks[3],
        current_rank_4: joinedRanks[4],
        current_rank_5: joinedRanks[5],
        current_rank_6: joinedRanks[6],
        current_rank_7: joinedRanks[7],
        current_rank_8: joinedRanks[8],
        current_rank_9: joinedRanks[9],
        current_rank_10: joinedRanks[10],
        current_rank_gt10: rankGt10.length ? rankGt10.join(', ') : null,
        rank_1: joinedRanks[1],
        rank_2: joinedRanks[2],
        rank_3: joinedRanks[3],
        rank_4: joinedRanks[4],
        rank_5: joinedRanks[5],
        rank_6: joinedRanks[6],
        rank_7: joinedRanks[7],
        rank_8: joinedRanks[8],
        rank_9: joinedRanks[9],
        rank_10: joinedRanks[10],
        rank_items_1to10: items1to10,
      });
    });

    processed.sort((a, b) => (b.potential_traffic || 0) - (a.potential_traffic || 0));
    return processed;
  };

  const getProcessedColumnsLayout = () => [
    { header: 'URL', value: (item) => decodeURIComponentSafe(item.page || '') },
    { header: 'Country', value: (item) => item.country || '' },
    { header: 'Region Code', value: (item) => item.regionCode || '' },
    { header: 'Regions', value: (item) => (Array.isArray(item.regions) && item.regions.length ? item.regions.join(', ') : '') },
    { header: 'Best Query', value: (item) => item.best_query || '' },
    { header: 'Best Query Clicks', value: (item) => item.best_query_clicks },
    { header: 'Best Query Position', value: (item) => item.best_query_position },
    { header: 'Best Query Volume', value: (item) => item.best_query_volume },
    { header: 'Prev Best Query', value: (item) => item.prev_best_query || '' },
    { header: 'Prev Best Clicks', value: (item) => item.prev_best_clicks },
    { header: 'Prev Best Position', value: (item) => item.prev_best_position },
    { header: 'Prev Main Keyword', value: (item) => item.prev_main_keyword || '' },
    { header: 'Prev Keyword Rank', value: (item) => item.prev_keyword_rank },
    { header: 'Prev Keyword Traffic', value: (item) => item.prev_keyword_traffic },
    { header: 'Total Clicks', value: (item) => item.total_clicks },
    { header: 'Keywords 1-10 Count', value: (item) => item.keywords_1to10_count },
    { header: 'Keywords 4-10 Count', value: (item) => item.keywords_4to10_count },
    { header: 'Total Keywords', value: (item) => item.total_keywords },
    { header: 'Keywords 1-10 Ratio', value: (item) => item.keywords_1to10_ratio || '' },
    { header: 'Keywords 4-10 Ratio', value: (item) => item.keywords_4to10_ratio || '' },
    { header: 'Potential Traffic', value: (item) => item.potential_traffic },
    { header: 'Current Rank 1', value: (item) => item.current_rank_1 || '' },
    { header: 'Current Rank 2', value: (item) => item.current_rank_2 || '' },
    { header: 'Current Rank 3', value: (item) => item.current_rank_3 || '' },
    { header: 'Current Rank 4', value: (item) => item.current_rank_4 || '' },
    { header: 'Current Rank 5', value: (item) => item.current_rank_5 || '' },
    { header: 'Current Rank 6', value: (item) => item.current_rank_6 || '' },
    { header: 'Current Rank 7', value: (item) => item.current_rank_7 || '' },
    { header: 'Current Rank 8', value: (item) => item.current_rank_8 || '' },
    { header: 'Current Rank 9', value: (item) => item.current_rank_9 || '' },
    { header: 'Current Rank 10', value: (item) => item.current_rank_10 || '' },
    { header: 'Current Rank >10', value: (item) => item.current_rank_gt10 || '' },
    { header: 'Rank 1', value: (item) => item.rank_1 || '' },
    { header: 'Rank 2', value: (item) => item.rank_2 || '' },
    { header: 'Rank 3', value: (item) => item.rank_3 || '' },
    { header: 'Rank 4', value: (item) => item.rank_4 || '' },
    { header: 'Rank 5', value: (item) => item.rank_5 || '' },
    { header: 'Rank 6', value: (item) => item.rank_6 || '' },
    { header: 'Rank 7', value: (item) => item.rank_7 || '' },
    { header: 'Rank 8', value: (item) => item.rank_8 || '' },
    { header: 'Rank 9', value: (item) => item.rank_9 || '' },
    { header: 'Rank 10', value: (item) => item.rank_10 || '' },
    {
      header: 'Rank Items 1-10',
      value: (item) => (Array.isArray(item.rank_items_1to10) && item.rank_items_1to10.length ? item.rank_items_1to10.join('\n') : ''),
    },
  ];

  const csvToInt = (value) => {
    const s = String(value == null ? '' : value).replace(/[ ,]/g, '');
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const csvToFloat = (value) => {
    const s = String(value == null ? '' : value).replace(/[ ,]/g, '');
    const n = parseFloat(s);
    return Number.isNaN(n) ? 0 : n;
  };

  const inferRegionFromUrlForCsv = (url) => {
    const lower = String(url || '').toLowerCase();
    if (lower.indexOf('/hk/') > -1) return 'hk';
    if (lower.indexOf('/tw/') > -1) return 'tw';
    if (lower.indexOf('/sg/') > -1) return 'sg';
    if (lower.indexOf('/my/') > -1) return 'my';
    if (lower.indexOf('/cn/') > -1) return 'cn';
    return null;
  };

  const normalizeRegionCodeForCsv = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'hk' || v === 'hong kong' || v === 'hongkong') return 'hk';
    if (v === 'tw' || v === 'taiwan') return 'tw';
    if (v === 'sg' || v === 'singapore') return 'sg';
    if (v === 'my' || v === 'malaysia') return 'my';
    if (v === 'cn' || v === 'china' || v === 'china mainland' || v === 'mainland china') return 'cn';
    return null;
  };

  const decodeURIComponentSafe = (url) => {
    try {
      return decodeURI(String(url || ''));
    } catch (e) {
      return String(url || '');
    }
  };

  return {
    createMenu,
    convertActiveSheet,
  };
})();

function RL_CONV_onOpenMenu() {
  RepostLensConverter.createMenu();
}

function RL_CONV_convertActiveSheet() {
  RepostLensConverter.convertActiveSheet();
}
