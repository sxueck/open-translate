/**
 * 简化批处理管理器
 * 基于token限制的简单批处理
 */

class SmartBatchProcessor {
  constructor(tokenCalculator) {
    this.tokenCalculator = tokenCalculator;
  }

  /**
   * 处理文本段落，创建批次
   */
  async processTextSegments(textSegments, config = {}) {
    const defaultMaxTokens = getAPIDefault('MAX_TOKENS', 8000);
    const maxTokens = config.maxTokens || defaultMaxTokens;
    const systemPromptTokens = config.systemPromptTokens || 200;

    if (!Array.isArray(textSegments) || textSegments.length === 0) {
      return { batches: [] };
    }

    console.log('[SmartBatchProcessor] Processing text segments with token limits:', {
      maxTokens,
      systemPromptTokens,
      segmentCount: textSegments.length
    });

    const batches = this.tokenCalculator.createOptimalBatches(textSegments, maxTokens, systemPromptTokens);

    console.log('[SmartBatchProcessor] Created batches:', {
      batchCount: batches.length,
      batchSizes: batches.map(batch => batch.length)
    });

    return { batches: batches };
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartBatchProcessor;
}
