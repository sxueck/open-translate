/**
 * Text extraction and DOM manipulation utilities
 */
class TextExtractor {
  constructor(options = {}) {
    // Import shared constants and utilities
    this.excludeSelectors = options.excludeSelectors || DOM_SELECTORS.EXCLUDE_DEFAULT;
    this.blockElements = DOM_SELECTORS.BLOCK_ELEMENTS;

    // Performance optimization: cache DOM queries
    this.nodeCache = new Map();
    this.lastCacheTime = 0;
    this.cacheTimeout = 5000; // 5 seconds

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
    // Check cache first for performance
    const cacheKey = `${mode}-${rootElement.tagName}-${Date.now()}`;
    if (this.shouldUseCache() && this.nodeCache.has(cacheKey)) {
      return this.nodeCache.get(cacheKey);
    }

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
        console.log(`Found main content area: ${selector}`);
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

      const textLength = container.textContent.trim().length;
      const childElements = container.children.length;

      // 计算内容密度分数
      const score = this.calculateContentScore(container, textLength, childElements);

      if (score > 0) {
        candidates.push({ element: container, score, textLength });
      }
    });

    // 按分数排序，返回最佳候选
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      console.log(`Found main content by heuristics: ${candidates[0].element.tagName}.${candidates[0].element.className}`);
      return candidates[0].element;
    }

    return null;
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
   * 计算内容区域分数
   */
  calculateContentScore(element, textLength, childElements) {
    let score = 0;

    // 文本长度权重
    if (textLength > 500) score += 3;
    else if (textLength > 200) score += 2;
    else if (textLength > 50) score += 1;

    // 段落数量权重
    const paragraphs = element.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    if (paragraphs.length > 5) score += 2;
    else if (paragraphs.length > 2) score += 1;

    // 减分项：包含太多链接或按钮
    const links = element.querySelectorAll('a');
    const buttons = element.querySelectorAll('button, input[type="button"]');
    if (links.length > textLength / 100) score -= 1;
    if (buttons.length > 5) score -= 1;

    return score;
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
   * Cache management methods
   */
  shouldUseCache() {
    return Date.now() - this.lastCacheTime < this.cacheTimeout;
  }

  cacheResult(key, result) {
    this.nodeCache.set(key, result);
    this.lastCacheTime = Date.now();

    // Limit cache size for memory management
    if (this.nodeCache.size > 10) {
      const firstKey = this.nodeCache.keys().next().value;
      this.nodeCache.delete(firstKey);
    }
  }

  clearCache() {
    this.nodeCache.clear();
    this.lastCacheTime = 0;
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
          priority: this.getParagraphPriority(paragraph)
        });
      }

      const group = paragraphGroups.get(paragraphId);
      group.textNodes.push(textNode);
      group.combinedText += (group.combinedText ? ' ' : '') + textNode.text;
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
    // Use compareDocumentPosition for better performance
    if (!this.documentOrderCache) {
      this.documentOrderCache = new Map();
    }

    const elementKey = this.getElementId(element);
    if (this.documentOrderCache.has(elementKey)) {
      return this.documentOrderCache.get(elementKey);
    }

    // Use a more efficient approach with compareDocumentPosition
    const allElements = Array.from(document.body.querySelectorAll('*'));
    const position = allElements.indexOf(element);

    this.documentOrderCache.set(elementKey, position);
    return position;
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
