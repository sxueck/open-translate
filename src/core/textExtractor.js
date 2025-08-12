/**
 * Check if text contains significant content for translation
 */
function hasSignificantText(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (trimmed.length < TEXT_PROCESSING.MIN_TEXT_LENGTH) return false;
  if (REGEX_PATTERNS.PURE_NUMBERS_SYMBOLS.test(trimmed)) return false;
  if (trimmed.length === TEXT_PROCESSING.MIN_SIGNIFICANT_LENGTH && !REGEX_PATTERNS.CHINESE_CHARS.test(trimmed)) return false;

  return true;
}

/**
 * Text extraction and DOM manipulation utilities
 */
class TextExtractor {
  constructor(options = {}) {
    // Import shared constants and utilities
    this.excludeSelectors = options.excludeSelectors || DOM_SELECTORS.EXCLUDE_DEFAULT;
    this.blockElements = DOM_SELECTORS.BLOCK_ELEMENTS;

    // Enhanced caching system
    this.nodeCache = new Map();
    this.contentHashCache = new Map(); // Cache based on content hash
    this.lastCacheTime = 0;
    this.cacheTimeout = 30000; // Increased to 30 seconds for better hit rate
    this.maxCacheSize = 100; // Increased cache size
    this.cacheStats = { hits: 0, misses: 0 }; // Cache performance tracking

    // DOM mutation observer for cache invalidation
    this.setupMutationObserver();

    // Extraction modes
    this.extractionModes = {
      SIMPLE: 'simple',           // Basic text node extraction
      PARAGRAPH: 'paragraph',     // Group by paragraphs for batch processing
      STRUCTURED: 'structured'    // Preserve document structure
    };
  }

  /**
   * Unified extraction method with different modes
   */
  extract(mode = this.extractionModes.SIMPLE, rootElement = document.body, options = {}) {
    // Generate content-based cache key for better hit rate
    const contentHash = this.generateContentHash(rootElement, mode, options);
    const cacheKey = `${mode}-${contentHash}`;

    // Check cache first for performance
    if (this.shouldUseCache()) {
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        this.cacheStats.hits++;
        return cachedResult;
      }
    }

    this.cacheStats.misses++;

    let result;
    switch (mode) {
      case this.extractionModes.PARAGRAPH:
        result = this.extractParagraphGroups(rootElement, options);
        break;
      case this.extractionModes.STRUCTURED:
        result = this.extractStructuredText(rootElement, options);
        break;
      default:
        result = this.extractTextNodes(rootElement, options);
    }

    // Cache result for performance
    this.cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Generate content-based hash for cache key
   */
  generateContentHash(rootElement, mode, options) {
    // Create a lightweight hash based on element structure and content
    const elementInfo = {
      tag: rootElement.tagName,
      id: rootElement.id,
      className: rootElement.className,
      childCount: rootElement.children.length,
      textLength: rootElement.textContent.length,
      mode: mode,
      excludeSelectors: JSON.stringify(options.excludeSelectors || [])
    };

    // Simple hash function for cache key
    return this.simpleHash(JSON.stringify(elementInfo));
  }

  /**
   * Simple hash function for generating cache keys
   */
  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Extract translatable text nodes
   */
  extractTextNodes(rootElement = document.body, options = {}) {
    const textNodes = [];
    const excludeSelectors = options.excludeSelectors || this.excludeSelectors;

    // Tree walker with filtering
    const walker = this.createOptimizedWalker(rootElement, excludeSelectors);

    let node;
    while (node = walker.nextNode()) {
      if (hasSignificantText(node.textContent)) {
        textNodes.push(this.createTextNodeInfo(node));
      }
    }

    return textNodes;
  }

  /**
   * Extract text nodes grouped by paragraphs
   */
  extractParagraphGroups(rootElement = document.body, options = {}) {
    // 优先从主要内容区域提取文本
    const mainContentElement = this.findMainContentArea(rootElement);
    const extractionRoot = mainContentElement || rootElement;

    const textNodes = this.extractTextNodes(extractionRoot, options);
    return this.groupTextNodesByParagraph(textNodes, options);
  }

  /**
   * 查找主要内容区域
   */
  findMainContentArea(rootElement = document.body) {
    // 按优先级查找主要内容区域
    for (const selector of DOM_SELECTORS.MAIN_CONTENT_SELECTORS) {
      const element = rootElement.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        return element;
      }
    }

    // 如果没有找到明确的主要内容区域，尝试启发式方法
    return this.findMainContentByHeuristics(rootElement);
  }

  /**
   * 使用启发式方法查找主要内容区域
   */
  findMainContentByHeuristics(rootElement) {
    const candidates = [];

    // 查找包含大量文本的容器
    const containers = rootElement.querySelectorAll('div, section, article');

    containers.forEach(container => {
      // 跳过明显的非内容区域
      if (this.isNonContentArea(container)) {
        return;
      }

      // 预计算所有需要的元素信息，避免重复查询
      const elementInfo = this.analyzeElementContent(container);

      // 计算内容密度分数
      const score = this.calculateContentScoreOptimized(elementInfo);

      if (score > 0) {
        candidates.push({
          element: container,
          score,
          textLength: elementInfo.textLength,
          info: elementInfo
        });
      }
    });

    // 按分数排序，返回最佳候选
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      return candidates[0].element;
    }

    return null;
  }

  /**
   * 分析元素内容，一次性获取所有需要的信息
   */
  analyzeElementContent(element) {
    const textContent = element.textContent.trim();
    const textLength = textContent.length;

    // 使用单次查询获取所有子元素信息
    const allChildren = Array.from(element.children);
    const childElements = allChildren.length;

    // 分类统计不同类型的元素
    const elementCounts = {
      paragraphs: 0,
      headings: 0,
      links: 0,
      buttons: 0,
      images: 0,
      lists: 0
    };

    // 使用 TreeWalker 高效遍历所有后代元素
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const tagName = node.tagName.toLowerCase();

      switch (tagName) {
        case 'p':
          elementCounts.paragraphs++;
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          elementCounts.headings++;
          break;
        case 'a':
          elementCounts.links++;
          break;
        case 'button':
          elementCounts.buttons++;
          break;
        case 'input':
          if (node.type === 'button' || node.type === 'submit') {
            elementCounts.buttons++;
          }
          break;
        case 'img':
          elementCounts.images++;
          break;
        case 'ul':
        case 'ol':
          elementCounts.lists++;
          break;
      }
    }

    return {
      textLength,
      childElements,
      textContent,
      ...elementCounts
    };
  }

  /**
   * 检查是否为非内容区域
   */
  isNonContentArea(element) {
    const classList = element.classList;
    const id = element.id;

    // 检查常见的非内容区域类名和ID
    const nonContentPatterns = [
      /sidebar|side-bar|nav|menu|header|footer|toolbar|banner|ad|widget|meta|tag|share|comment|related|recommend/i
    ];

    return nonContentPatterns.some(pattern =>
      pattern.test(classList.toString()) || pattern.test(id)
    );
  }

  /**
   * 优化后的内容分数计算方法
   */
  calculateContentScoreOptimized(elementInfo) {
    let score = 0;
    const { textLength, paragraphs, headings, links, buttons, images, lists } = elementInfo;

    // 文本长度权重 - 使用更精细的分级
    if (textLength > 1000) score += 5;
    else if (textLength > 500) score += 3;
    else if (textLength > 200) score += 2;
    else if (textLength > 50) score += 1;

    // 段落和标题权重
    const totalParagraphs = paragraphs + headings;
    if (totalParagraphs > 10) score += 3;
    else if (totalParagraphs > 5) score += 2;
    else if (totalParagraphs > 2) score += 1;

    // 标题额外加分
    if (headings > 0) score += Math.min(headings, 3);

    // 列表内容加分
    if (lists > 0) score += Math.min(lists * 0.5, 2);

    // 图片适量加分
    if (images > 0 && images <= 5) score += 1;

    // 减分项：链接密度过高
    const linkDensity = textLength > 0 ? links / (textLength / 100) : 0;
    if (linkDensity > 1) score -= Math.min(linkDensity, 3);

    // 减分项：按钮过多
    if (buttons > 5) score -= Math.min(buttons - 5, 2);

    // 减分项：图片过多可能是广告区域
    if (images > 10) score -= 2;

    return Math.max(score, 0); // 确保分数不为负
  }

  /**
   * 计算内容区域分数（保持向后兼容）
   */
  calculateContentScore(element, textLength, childElements) {
    // 使用优化后的方法
    const elementInfo = this.analyzeElementContent(element);
    return this.calculateContentScoreOptimized(elementInfo);
  }

  /**
   * 检查元素是否包含有意义的内容
   */
  hasSignificantContent(element) {
    const textContent = element.textContent.trim();
    return textContent.length > 100 &&
           element.querySelectorAll('p, h1, h2, h3, h4, h5, h6').length > 0;
  }

  /**
   * Create tree walker
   */
  createOptimizedWalker(rootElement, excludeSelectors) {
    return document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return this.isTranslatableTextNode(node, excludeSelectors)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );
  }

  /**
   * Create text node information object
   */
  createTextNodeInfo(node) {
    return {
      node: node,
      text: node.textContent.trim(),
      parent: node.parentElement,
      originalText: node.textContent,
      id: this.generateNodeId(node)
    };
  }

  /**
   * Generate unique ID for text node
   */
  generateNodeId(node) {
    const parent = node.parentElement;
    const siblings = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    const index = siblings.indexOf(node);
    return `${parent.tagName.toLowerCase()}-${index}-${Date.now()}`;
  }

  /**
   * Check if a text node should be translated
   */
  isTranslatableTextNode(node, excludeSelectors = this.excludeSelectors) {
    if (!node || !node.parentElement) return false;

    // 检查是否在已翻译的双语容器中
    if (node.parentElement.closest('.ot-bilingual-container') ||
        node.parentElement.closest('.ot-paragraph-bilingual')) {
      return false;
    }

    // 检查父元素是否已经被标记为已翻译
    if (node.parentElement.classList.contains('ot-paragraph-bilingual') ||
        node.parentElement.querySelector('.ot-paragraph-bilingual')) {
      return false;
    }

    // 特殊处理：允许内联代码标签中的文本被翻译
    const codeParent = node.parentElement.closest('code');
    if (codeParent) {
      // 如果是在 pre > code 结构中，则排除
      if (codeParent.closest('pre')) {
        return false;
      }
      // 内联代码标签中的文本可以翻译
      return true;
    }

    // 检查是否在非内容区域（侧边栏、导航栏等）
    if (this.isInNonContentArea(node.parentElement)) {
      return false;
    }

    const linkParent = node.parentElement.closest('a[href]');
    if (linkParent) {
      const text = node.textContent.trim();
      if (text.length < 20 && !/[.!?。！？]/.test(text)) {
        return false;
      }
    }

    // Use shared utility for better performance
    return !isExcludedElement(node.parentElement, excludeSelectors);
  }

  /**
   * 检查节点是否在非内容区域
   */
  isInNonContentArea(element) {
    // 检查是否在排除的选择器范围内
    const excludeSelectors = DOM_SELECTORS.EXCLUDE_DEFAULT;

    for (const selector of excludeSelectors) {
      try {
        if (element.closest(selector)) {
          return true;
        }
      } catch (e) {
        // 忽略无效的选择器
        continue;
      }
    }

    // 检查是否在导航相关的元素中
    const navParent = element.closest('nav, .nav, .navbar, .navigation, .menu, .breadcrumb');
    if (navParent) {
      return true;
    }

    // 检查是否在侧边栏中
    const sidebarParent = element.closest('aside, .sidebar, .side-bar, .widget, .widgets');
    if (sidebarParent) {
      return true;
    }

    // 检查是否在页眉页脚中
    const headerFooterParent = element.closest('header, footer, .header, .footer, .topbar, .top-bar');
    if (headerFooterParent) {
      return true;
    }

    return false;
  }

  /**
   * Check if element should be excluded from translation
   */
  isExcludedElement(element) {
    if (!element || !element.tagName) return true;

    const tagName = element.tagName.toLowerCase();
    
    // Check tag name exclusions
    if (this.excludeSelectors.some(selector => {
      if (selector.startsWith('[') || selector.startsWith('.')) {
        return element.matches(selector);
      }
      return tagName === selector;
    })) {
      return true;
    }

    // Check for contenteditable
    if (element.contentEditable === 'true') return true;

    // Check for input elements
    if (['input', 'textarea', 'select', 'button'].includes(tagName)) return true;

    return false;
  }

  /**
   * Setup DOM mutation observer for intelligent cache invalidation
   */
  setupMutationObserver() {
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver((mutations) => {
        let shouldInvalidateCache = false;

        for (const mutation of mutations) {
          // Invalidate cache on significant DOM changes
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            shouldInvalidateCache = true;
            break;
          }
          if (mutation.type === 'attributes' &&
              ['class', 'id', 'style'].includes(mutation.attributeName)) {
            shouldInvalidateCache = true;
            break;
          }
        }

        if (shouldInvalidateCache) {
          this.invalidateCache();
        }
      });

      // Start observing
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'style']
      });
    }
  }

  /**
   * Enhanced cache management methods
   */
  shouldUseCache() {
    return Date.now() - this.lastCacheTime < this.cacheTimeout;
  }

  cacheResult(key, result) {
    // Add timestamp for LRU eviction
    const cacheEntry = {
      data: result,
      timestamp: Date.now(),
      accessCount: 1
    };

    this.nodeCache.set(key, cacheEntry);
    this.lastCacheTime = Date.now();

    // Intelligent cache size management
    if (this.nodeCache.size > this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Get cached result with access tracking
   */
  getCachedResult(key) {
    const entry = this.nodeCache.get(key);
    if (entry) {
      entry.accessCount++;
      entry.timestamp = Date.now();
      return entry.data;
    }
    return null;
  }

  /**
   * Evict least recently used cache entries
   */
  evictLeastRecentlyUsed() {
    const entries = Array.from(this.nodeCache.entries());

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 25% of entries
    const removeCount = Math.floor(entries.length * 0.25);
    for (let i = 0; i < removeCount; i++) {
      this.nodeCache.delete(entries[i][0]);
    }
  }

  /**
   * Invalidate cache when DOM changes significantly
   */
  invalidateCache() {
    this.nodeCache.clear();
    this.contentHashCache.clear();
    if (this.documentOrderCache) {
      this.documentOrderCache.clear();
    }
    this.lastCacheTime = 0;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.invalidateCache();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache performance statistics
   */
  getCacheStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    return {
      ...this.cacheStats,
      hitRate: total > 0 ? (this.cacheStats.hits / total * 100).toFixed(2) + '%' : '0%',
      cacheSize: this.nodeCache.size
    };
  }

  /**
   * Group text nodes by their container elements
   */
  groupTextNodesByContainer(textNodes) {
    const groups = new Map();

    textNodes.forEach(textNode => {
      const container = this.findTranslationContainer(textNode.parent);
      const containerId = this.getElementId(container);

      if (!groups.has(containerId)) {
        groups.set(containerId, {
          container: container,
          textNodes: [],
          combinedText: '',
          id: containerId
        });
      }

      const group = groups.get(containerId);
      group.textNodes.push(textNode);
      group.combinedText += (group.combinedText ? ' ' : '') + textNode.text;
    });

    return Array.from(groups.values());
  }

  /**
   * Group text nodes by paragraphs for concurrent translation
   */
  groupTextNodesByParagraph(textNodes, options = {}) {
    const maxGroupSize = options.maxGroupSize || PERFORMANCE.BATCH_SIZE;
    const paragraphGroups = new Map();

    textNodes.forEach(textNode => {
      const paragraph = this.findParagraphContainer(textNode.parent);
      const paragraphId = this.getElementId(paragraph);

      if (!paragraphGroups.has(paragraphId)) {
        paragraphGroups.set(paragraphId, {
          id: paragraphId,
          container: paragraph,
          textNodes: [],
          combinedText: '',
          htmlContent: '',
          priority: this.getParagraphPriority(paragraph)
        });
      }

      const group = paragraphGroups.get(paragraphId);
      group.textNodes.push(textNode);
      group.combinedText += (group.combinedText ? ' ' : '') + textNode.text;
    });

    // Extract HTML content for each group to preserve structure
    paragraphGroups.forEach(group => {
      group.htmlContent = this.extractHtmlContent(group.container);

      // If the container has HTML content that differs significantly from plain text,
      // use the HTML content for translation to preserve structure
      if (group.htmlContent && this.shouldUseHtmlContent(group.container, group.combinedText)) {
        group.combinedText = this.extractTextFromHtml(group.htmlContent);
      }
    });

    // Convert to array and handle large groups
    const groups = Array.from(paragraphGroups.values());
    const processedGroups = [];

    groups.forEach(group => {
      if (group.textNodes.length > maxGroupSize) {
        // Split large groups for better performance
        const chunks = this.chunkArray(group.textNodes, maxGroupSize);
        chunks.forEach((chunk, index) => {
          processedGroups.push({
            id: `${group.id}-chunk-${index}`,
            container: group.container,
            textNodes: chunk,
            combinedText: chunk.map(node => node.text).join(' '),
            priority: group.priority
          });
        });
      } else {
        processedGroups.push(group);
      }
    });

    // Sort by priority (headings first, then by document order)
    return processedGroups.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return this.getDocumentOrder(a.container) - this.getDocumentOrder(b.container);
    });
  }

  /**
   * Split array into chunks of specified size
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Find appropriate container for translation grouping
   */
  findTranslationContainer(element) {
    let current = element;

    while (current && current !== document.body) {
      if (this.blockElements.includes(current.tagName.toLowerCase())) {
        return current;
      }
      current = current.parentElement;
    }

    return element;
  }

  /**
   * Find paragraph container for concurrent translation
   */
  findParagraphContainer(element) {
    let current = element;

    // Look for paragraph-level containers
    const paragraphElements = [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'li', 'td', 'th', 'blockquote', 'pre',
      'div', 'article', 'section'
    ];

    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      if (paragraphElements.includes(tagName)) {
        return current;
      }
      current = current.parentElement;
    }

    return element;
  }

  /**
   * Extract HTML content while preserving structure for translation
   */
  extractHtmlContent(container) {
    if (!container) return '';

    // Clone the container to avoid modifying the original
    const clone = container.cloneNode(true);

    // Remove any existing translation elements
    const existingTranslations = clone.querySelectorAll('.ot-paragraph-translated, .ot-bilingual-container');
    existingTranslations.forEach(el => el.remove());

    // Get the inner HTML which preserves the structure
    return clone.innerHTML.trim();
  }

  /**
   * Check if we should use HTML content instead of plain text for translation
   */
  shouldUseHtmlContent(container, plainText) {
    if (!container || !plainText) return false;

    // Check if container has significant HTML structure
    const htmlElements = container.querySelectorAll('a, code, span, strong, em, b, i, u, mark, sup, sub, small, big, tt, kbd, samp, var');
    if (htmlElements.length === 0) return false;

    // Check if any of these elements contain significant text or important attributes
    let hasSignificantHtmlText = false;
    htmlElements.forEach(el => {
      const text = el.textContent.trim();
      // Consider element significant if it has text content or important attributes like href
      if ((text.length > 0 && hasSignificantText(text)) ||
          el.hasAttribute('href') ||
          el.hasAttribute('title') ||
          el.classList.length > 0) {
        hasSignificantHtmlText = true;
      }
    });

    // Also check if the HTML content is significantly different from plain text
    const htmlContent = this.extractHtmlContent(container);
    const plainTextLength = plainText.replace(/\s+/g, ' ').trim().length;
    const htmlContentLength = htmlContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length;

    // If HTML content has significantly more structure, use HTML
    const hasStructuralDifference = htmlContent.includes('<') &&
                                   (htmlContentLength > plainTextLength * 0.8);

    return hasSignificantHtmlText || hasStructuralDifference;
  }

  /**
   * Extract text from HTML while preserving inline tags
   */
  extractTextFromHtml(htmlContent) {
    if (!htmlContent) return '';

    // Create a temporary element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Get text content but preserve important inline tags
    return this.getTextWithInlineTags(tempDiv);
  }

  /**
   * Get text content while preserving important inline HTML tags
   */
  getTextWithInlineTags(element) {
    let result = '';

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();

        // Preserve important inline tags and their nested content
        if (['a', 'code', 'span', 'strong', 'em', 'b', 'i', 'u', 'mark', 'sup', 'sub', 'small', 'big', 'tt', 'kbd', 'samp', 'var'].includes(tagName)) {
          const attributes = this.getImportantAttributes(node);
          const innerText = this.getTextWithInlineTags(node);

          if (innerText.trim()) {
            result += `<${tagName}${attributes}>${innerText}</${tagName}>`;
          }
        } else {
          // For other elements, recursively process their content
          result += this.getTextWithInlineTags(node);
        }
      }
    }

    return result;
  }

  /**
   * Get important attributes from an element
   */
  getImportantAttributes(element) {
    let attrs = '';

    // Handle standard attributes
    ['href', 'title', 'class', 'id', 'target', 'rel'].forEach(attr => {
      if (element.hasAttribute(attr)) {
        const value = element.getAttribute(attr);
        if (value) {
          attrs += ` ${attr}="${this.escapeAttributeValue(value)}"`;
        }
      }
    });

    // Handle data-* and aria-* attributes
    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
        attrs += ` ${attr.name}="${this.escapeAttributeValue(attr.value)}"`;
      }
    });

    return attrs;
  }

  /**
   * Escape attribute values to prevent HTML injection
   */
  escapeAttributeValue(value) {
    if (!value) return '';
    return value.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Get priority for paragraph ordering (lower number = higher priority)
   */
  getParagraphPriority(element) {
    const tagName = element.tagName.toLowerCase();

    // Headings get highest priority
    if (tagName.match(/^h[1-6]$/)) {
      return parseInt(tagName.charAt(1)); // h1=1, h2=2, etc.
    }

    // Important content
    if (['p', 'blockquote'].includes(tagName)) {
      return 10;
    }

    // Lists and table content
    if (['li', 'td', 'th'].includes(tagName)) {
      return 15;
    }

    // Generic containers
    return 20;
  }

  /**
   * Get document order position for element
   */
  getDocumentOrder(element) {
    if (!this.documentOrderCache) {
      this.documentOrderCache = new Map();
      this.documentOrderCounter = 0;
    }

    const elementKey = this.getElementId(element);
    if (this.documentOrderCache.has(elementKey)) {
      return this.documentOrderCache.get(elementKey);
    }

    // Use compareDocumentPosition for efficient relative positioning
    let position = this.documentOrderCounter++;

    // For more accurate positioning, use a reference-based approach
    if (this.documentOrderCache.size > 0) {
      // Find the closest cached element for relative positioning
      let bestReference = null;
      let bestDistance = Infinity;

      for (const [cachedKey, cachedPosition] of this.documentOrderCache) {
        const cachedElement = this.getCachedElement(cachedKey);
        if (cachedElement) {
          const relationship = element.compareDocumentPosition(cachedElement);

          if (relationship & Node.DOCUMENT_POSITION_PRECEDING) {
            // Current element comes after cached element
            const distance = this.estimateDistance(cachedElement, element);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestReference = { element: cachedElement, position: cachedPosition, offset: distance };
            }
          } else if (relationship & Node.DOCUMENT_POSITION_FOLLOWING) {
            // Current element comes before cached element
            const distance = this.estimateDistance(element, cachedElement);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestReference = { element: cachedElement, position: cachedPosition, offset: -distance };
            }
          }
        }
      }

      if (bestReference) {
        position = bestReference.position + bestReference.offset;
      }
    }

    this.documentOrderCache.set(elementKey, position);

    // Limit cache size for memory management
    if (this.documentOrderCache.size > 100) {
      this.cleanupDocumentOrderCache();
    }

    return position;
  }

  /**
   * Estimate distance between two elements in document order
   */
  estimateDistance(fromElement, toElement) {
    let distance = 0;
    let current = fromElement;

    // Simple heuristic: count parent-child relationships and siblings
    while (current && current !== toElement && distance < 50) {
      if (current.nextElementSibling) {
        current = current.nextElementSibling;
        distance += 1;
      } else if (current.parentElement) {
        current = current.parentElement.nextElementSibling;
        distance += 10; // Higher cost for going up the tree
      } else {
        break;
      }
    }

    return current === toElement ? distance : 50; // Max distance cap
  }

  /**
   * Get cached element by key (simplified lookup)
   */
  getCachedElement(elementKey) {
    // For performance, we'll use a simplified approach
    // In a real implementation, you might want to maintain element references
    try {
      if (elementKey.startsWith('#')) {
        return document.getElementById(elementKey.substring(1));
      }
      // For path-based keys, we'll skip the lookup to avoid performance issues
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clean up document order cache when it gets too large
   */
  cleanupDocumentOrderCache() {
    // Remove oldest entries (simple FIFO approach)
    const entries = Array.from(this.documentOrderCache.entries());
    const keepCount = 50;

    if (entries.length > keepCount) {
      this.documentOrderCache.clear();
      // Keep the most recent entries
      entries.slice(-keepCount).forEach(([key, value]) => {
        this.documentOrderCache.set(key, value);
      });
    }
  }

  /**
   * Generate unique identifier for element
   */
  getElementId(element) {
    if (element.id) return element.id;
    
    // Generate path-based identifier
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(el => el.tagName.toLowerCase() === tagName);
      const index = siblings.indexOf(current);
      
      path.unshift(`${tagName}${siblings.length > 1 ? `[${index}]` : ''}`);
      current = current.parentElement;
    }
    
    return path.join('>');
  }

  /**
   * Extract text content while preserving structure
   */
  extractStructuredText(element) {
    const result = {
      text: '',
      structure: [],
      textNodes: []
    };

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return this.isTranslatableTextNode(node) 
              ? NodeFilter.FILTER_ACCEPT 
              : NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE && hasSignificantText(node.textContent)) {
        const text = node.textContent.trim();
        result.text += (result.text ? ' ' : '') + text;
        result.textNodes.push({
          node: node,
          text: text,
          originalText: node.textContent
        });
      }
    }

    return result;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextExtractor;
} else if (typeof window !== 'undefined') {
  window.TextExtractor = TextExtractor;
}
