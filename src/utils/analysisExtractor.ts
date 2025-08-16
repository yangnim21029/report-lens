interface ExtractedAnalysis {
  page: string;
  bestQuery: string;
  strategy: 'REPOST' | 'NEW POST';
  priority: {
    shortTerm: string[];
    semanticHijack: string[];
  };
  executionList: string[]; // 執行清單
  titleSuggestion?: string; // 標題建議
  newPostTopic?: string; // NEW POST 的主題方向
  bestOpportunity?: string; // 最佳劫持機會
}

export function extractAnalysisData(
  analysisText: string,
  pageData: {
    page: string;
    best_query: string;
  }
): ExtractedAnalysis {
  const strategy = determineStrategy(analysisText);
  
  // 提取實施優先級
  const priority = {
    shortTerm: [] as string[],
    semanticHijack: [] as string[]
  };
  
  const prioritySection = extractSection(
    analysisText,
    '## 實施優先級',
    '## 📝 執行清單'
  );
  
  if (prioritySection) {
    // 短期優化
    const shortTermMatch = prioritySection.match(
      /### 📈 短期優化[^#]*?(?=###|$)/s
    );
    if (shortTermMatch) {
      priority.shortTerm = extractListItems(shortTermMatch[0]);
    }
    
    // 語義劫持布局
    const semanticMatch = prioritySection.match(
      /### 🎯 語義劫持布局[^#]*?(?=###|$)/s
    );
    if (semanticMatch) {
      priority.semanticHijack = extractListItems(semanticMatch[0]);
    }
  }

  // 提取執行清單
  let executionList: string[] = [];
  const executionSection = extractSection(analysisText, '## 📝 執行清單', null);
  
  if (strategy === 'REPOST') {
    const repostMatch = executionSection.match(
      /### \[如果是 REPOST\][^#]*?(?=###|$)/s
    );
    if (repostMatch) {
      executionList = extractListItems(repostMatch[0]);
    }
  } else if (strategy === 'NEW POST') {
    const newPostMatch = executionSection.match(
      /### \[如果是 NEW POST\][^#]*?(?=###|$)/s
    );
    if (newPostMatch) {
      executionList = extractListItems(newPostMatch[0]);
    }
  }

  // 提取標題建議
  let titleSuggestion = '';
  if (executionList.length > 0) {
    const firstItem = executionList[0];
    if (strategy === 'REPOST') {
      const titleMatch = firstItem.match(/將「[^」]+」改為「([^」]+)」/);
      if (titleMatch && titleMatch[1]) {
        titleSuggestion = titleMatch[1];
      }
    }
  }
  
  // NEW POST 標題從主題提取
  if (strategy === 'NEW POST') {
    const titleMatch = analysisText.match(/新文章主題：「([^」]+)」/);
    if (titleMatch && titleMatch[1]) {
      titleSuggestion = titleMatch[1];
    }
  }

  // 提取 NEW POST 主題方向
  let newPostTopic = '';
  if (strategy === 'NEW POST') {
    const topicMatch = analysisText.match(/主題方向：([^\n]+)/);
    if (topicMatch && topicMatch[1]) {
      newPostTopic = topicMatch[1].trim();
    }
  }
  
  // 提取最佳劫持機會（可選）
  let bestOpportunity = '';
  const recommendMatch = analysisText.match(/### 推薦\s*\n([^\n#]+)/);
  if (recommendMatch && recommendMatch[1]) {
    bestOpportunity = recommendMatch[1].trim();
  }

  return {
    page: pageData.page,
    bestQuery: pageData.best_query || 'Unknown Query',
    strategy,
    priority,
    executionList,
    ...(titleSuggestion && { titleSuggestion }),
    ...(newPostTopic && { newPostTopic }),
    ...(bestOpportunity && { bestOpportunity })
  };
}

function determineStrategy(text: string): 'REPOST' | 'NEW POST' {
  // 優先從執行清單判斷（更準確）
  if (text.includes('### [如果是 NEW POST]')) return 'NEW POST';
  if (text.includes('### [如果是 REPOST]')) return 'REPOST';

  // 備用：從推薦部分判斷
  const recommendMatch = text.match(
    /### 推薦[^\n]*\n[^\n]*?(REPOST|NEW POST)/i
  );
  if (recommendMatch && recommendMatch[1]) {
    return recommendMatch[1].toUpperCase() as 'REPOST' | 'NEW POST';
  }

  // 默認為 REPOST（較保守的策略）
  return 'REPOST';
}

function extractSection(
  text: string,
  startMarker: string,
  endMarker: string | null
): string {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return '';

  const endIndex = endMarker
    ? text.indexOf(endMarker, startIndex)
    : text.length;
  return text.substring(startIndex, endIndex !== -1 ? endIndex : text.length);
}

function extractListItems(text: string): string[] {
  const items: string[] = [];

  // Match both - and numbered list items
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Match - list items
    if (trimmed.startsWith('- ')) {
      items.push(trimmed.substring(2).trim());
    }
    // Match numbered list items
    else if (/^\d+\.\s/.test(trimmed)) {
      items.push(trimmed.replace(/^\d+\.\s*/, '').trim());
    }
  }

  return items.filter(item => item.length > 0);
}

// 移除舊的提取函數，已整合到主函數中

export function formatAsMarkdown(extracted: ExtractedAnalysis): string {
  const lines: string[] = [];

  // Header
  lines.push(`📊 *SEO 分析報告*`);
  lines.push(`📍 頁面: ${extracted.page}`);
  lines.push(`🎯 Best Query: *${extracted.bestQuery}*`);
  lines.push(`📝 策略: *${extracted.strategy}*`);
  lines.push('');

  // Priority Section
  if (extracted.priority.shortTerm.length > 0) {
    lines.push('*📈 短期優化 (1天內):*');
    extracted.priority.shortTerm.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }

  if (extracted.priority.semanticHijack.length > 0) {
    lines.push('*🎯 語義劫持布局 (1週內):*');
    extracted.priority.semanticHijack.forEach(item => {
      lines.push(`• ${item}`);
    });
    lines.push('');
  }

  // Execution List
  if (extracted.executionList.length > 0) {
    lines.push(`*📝 ${extracted.strategy} 執行清單:*`);
    extracted.executionList.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}`);
    });
    lines.push('');
  }

  // Optional: Best Opportunity
  if (extracted.bestOpportunity) {
    lines.push(`*🔑 最佳機會:* ${extracted.bestOpportunity}`);
    lines.push('');
  }

  // Optional: Title Suggestion
  if (extracted.titleSuggestion) {
    lines.push(`*📰 標題建議:* "${extracted.titleSuggestion}"`);
    lines.push('');
  }

  lines.push(
    `⏰ ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
  );

  return lines.join('\n');
}

export function formatAsCSV(extracted: ExtractedAnalysis): string {
  const rows: string[][] = [];

  // 精簡的 CSV - 只保留可分析的核心數據
  rows.push([
    'URL',
    'Best Query',
    'Strategy',
    'Core Action',
    'Opportunity',
    'Title Suggestion'
  ]);

  rows.push([
    extracted.page,
    extracted.bestQuery,
    extracted.strategy,
    extracted.executionList[0] || '',
    extracted.bestOpportunity || '',
    extracted.titleSuggestion || ''
  ]);

  // Convert to CSV format
  return rows
    .map(row =>
      row
        .map(cell => {
          // Escape quotes and wrap in quotes if contains comma or quotes
          const escaped = cell.replace(/"/g, '""');
          return /[,"\n]/.test(cell) ? `"${escaped}"` : escaped;
        })
        .join(',')
    )
    .join('\n');
}

export function formatAsEmail(extracted: ExtractedAnalysis): string {
  const lines: string[] = [];

  // Subject line
  lines.push(
    `Subject: SEO Analysis - ${extracted.bestQuery} [${extracted.strategy}]`
  );
  lines.push('---');
  lines.push('');

  // Greeting
  lines.push('Hi Team,');
  lines.push('');
  lines.push(`Here's the SEO optimization analysis for the following page:`);
  lines.push(`URL: ${extracted.page}`);
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push(`Target Keyword: ${extracted.bestQuery}`);
  lines.push(`Recommended Strategy: ${extracted.strategy}`);
  lines.push('');

  // Priority Actions
  if (extracted.priority.shortTerm.length > 0) {
    lines.push('## Short-term Optimizations (Within 1 day)');
    extracted.priority.shortTerm.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}`);
    });
    lines.push('');
  }

  if (extracted.priority.semanticHijack.length > 0) {
    lines.push('## Semantic Hijacking Strategy (Within 1 week)');
    extracted.priority.semanticHijack.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}`);
    });
    lines.push('');
  }

  // Implementation Plan
  lines.push('## Implementation Plan');
  if (extracted.strategy === 'REPOST') {
    lines.push(
      'The existing content can be optimized with the following changes:'
    );
  } else {
    lines.push(
      'A new article is recommended with the following specifications:'
    );
  }
  
  if (extracted.executionList.length > 0) {
    extracted.executionList.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}`);
    });
  }
  
  // Optional elements
  if (extracted.titleSuggestion) {
    lines.push('');
    lines.push(`Suggested Title: "${extracted.titleSuggestion}"`);
  }
  
  if (extracted.newPostTopic) {
    lines.push(`Topic Direction: ${extracted.newPostTopic}`);
  }

  lines.push('');
  lines.push('Best regards,');
  lines.push('RepostLens SEO Analysis Tool');
  lines.push('');
  lines.push(
    `Generated: ${new Date().toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei'
    })}`
  );

  return lines.join('\n');
}

// Keep the old function name for backward compatibility
export const formatForGoogleChat = formatAsMarkdown;
