/**
 * 简化Token计算器
 * 提供基础的token估算功能
 */

class TokenCalculator {
  /**
   * 简单的token估算：一个单词约等于一个token
   */
  calculateTokens(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // 简单估算：按单词数计算，中文按字符数计算
    const words = text.trim().split(/\s+/).length;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;

    // 英文单词 + 中文字符 + 一些格式开销
    return words + chineseChars + Math.ceil(text.length * 0.1);
  }

  /**
   * 计算批量翻译请求的总token数量
   */
  calculateBatchTokens(textSegments, systemPromptTokens = 0) {
    if (!Array.isArray(textSegments) || textSegments.length === 0) {
      return systemPromptTokens || 200; // 至少包含系统提示词token
    }

    let totalTokens = systemPromptTokens || 200; // 使用实际系统提示词token数量

    // 文本内容token
    for (const segment of textSegments) {
      const text = typeof segment === 'string' ? segment : segment.text || segment.combinedText || '';
      totalTokens += this.calculateTokens(text);
      totalTokens += 10; // 格式开销
    }

    return totalTokens;
  }

  /**
   * 创建最优批次
   */
  createOptimalBatches(textSegments, maxTokens, systemPromptTokens = 0) {
    if (!Array.isArray(textSegments) || textSegments.length === 0) {
      return [];
    }

    const batches = [];
    let currentBatch = [];
    const baseSystemTokens = systemPromptTokens || 200; // 使用实际系统提示词token数量
    let currentTokens = baseSystemTokens;

    // 为输出预留更多空间，输入token限制为max_tokens的50%
    const maxInputTokens = Math.floor(maxTokens * 0.5);

    for (const segment of textSegments) {
      const text = typeof segment === 'string' ? segment : segment.text || segment.combinedText || '';
      const segmentTokens = this.calculateTokens(text) + 10; // 格式开销

      // 检查单个段落是否超过限制
      if (baseSystemTokens + segmentTokens > maxInputTokens) {
        console.warn('[TokenCalculator] Single segment exceeds token limit, will be truncated:', {
          segmentTokens,
          maxInputTokens,
          baseSystemTokens,
          textPreview: text.substring(0, 100) + '...'
        });

        // 计算可用于文本的token数量
        const availableTokens = Math.max(10, maxInputTokens - baseSystemTokens - 10);

        console.log('[TokenCalculator] Available tokens for text:', availableTokens);

        // 对超长文本进行截断
        const truncatedText = this.truncateTextToTokenLimit(text, availableTokens);
        const truncatedSegment = typeof segment === 'string' ? truncatedText : { ...segment, text: truncatedText, combinedText: truncatedText };

        console.log('[TokenCalculator] Text truncated:', {
          originalLength: text.length,
          truncatedLength: truncatedText.length,
          truncatedPreview: truncatedText.substring(0, 100) + '...'
        });

        // 将截断后的段落作为单独批次
        batches.push([truncatedSegment]);
        continue;
      }

      if (currentTokens + segmentTokens > maxInputTokens && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = baseSystemTokens;
      }

      currentBatch.push(segment);
      currentTokens += segmentTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * 截断文本到指定token限制
   */
  truncateTextToTokenLimit(text, maxTokens) {
    if (!text || maxTokens <= 0) return '';

    const tokens = this.calculateTokens(text);
    if (tokens <= maxTokens) return text;

    // 如果maxTokens太小，至少保留一些文本
    if (maxTokens < 10) {
      return text.substring(0, Math.min(50, text.length)); // 至少保留50个字符
    }

    // 估算需要保留的字符比例
    const ratio = maxTokens / tokens;
    const estimatedLength = Math.max(50, Math.floor(text.length * ratio * 0.9)); // 保守估计，至少50字符

    let truncated = text.substring(0, estimatedLength);

    // 确保不在单词中间截断
    if (truncated.length < text.length && estimatedLength > 100) {
      const lastSpace = truncated.lastIndexOf(' ');
      const lastNewline = truncated.lastIndexOf('\n');
      const cutPoint = Math.max(lastSpace, lastNewline);

      if (cutPoint > estimatedLength * 0.8) {
        truncated = truncated.substring(0, cutPoint);
      }
    }

    // 验证截断后的token数量
    const truncatedTokens = this.calculateTokens(truncated);
    if (truncatedTokens > maxTokens && truncated.length > 50) {
      // 如果还是超过，进一步截断
      const newRatio = maxTokens / truncatedTokens;
      const newLength = Math.max(50, Math.floor(truncated.length * newRatio));
      truncated = truncated.substring(0, newLength);
    }

    return truncated;
  }
}

const tokenCalculator = new TokenCalculator();

// 导出实例
if (typeof module !== 'undefined' && module.exports) {
  module.exports = tokenCalculator;
} else if (typeof window !== 'undefined') {
  window.tokenCalculator = tokenCalculator;
}
