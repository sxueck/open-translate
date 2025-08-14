/**
 * Smart Content Extractor using Mozilla Readability.js
 * Provides intelligent content identification for translation
 */

class SmartContentExtractor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.fallbackExtractor = options.fallbackExtractor;
    this.readabilityOptions = {
      charThreshold: options.charThreshold || 300,
      classesToPreserve: options.classesToPreserve || [],
      keepClasses: false,
      serializer: el => el,
      ...options.readabilityOptions
    };
    
    this.cache = new Map();
    this.cacheTimeout = 30000;
  }

  /**
   * Extract main content using Readability algorithm
   */
  async extractMainContent(document, options = {}) {
    if (!this.enabled) {
      return this.fallbackExtractor ? 
        this.fallbackExtractor.extract(options.mode, document, options) : 
        null;
    }

    try {
      const cacheKey = this.generateCacheKey(document, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const result = await this.performReadabilityExtraction(document, options);
      this.setCache(cacheKey, result);
      
      return result;
    } catch (error) {
      console.warn('Smart content extraction failed, falling back to default:', error);
      return this.fallbackExtractor ? 
        this.fallbackExtractor.extract(options.mode, document, options) : 
        null;
    }
  }

  /**
   * Check if document is suitable for Readability processing
   */
  isProbablyReaderable(document, options = {}) {
    if (!this.enabled || typeof window.isProbablyReaderable !== 'function') {
      return false;
    }

    try {
      return window.isProbablyReaderable(document, {
        minContentLength: options.minContentLength || 140,
        minScore: options.minScore || 20,
        visibilityChecker: options.visibilityChecker
      });
    } catch (error) {
      console.warn('isProbablyReaderable check failed:', error);
      return false;
    }
  }

  /**
   * Perform Readability extraction with fallback
   */
  async performReadabilityExtraction(document, options = {}) {
    if (!window.Readability) {
      throw new Error('Readability library not loaded');
    }

    const documentClone = document.cloneNode(true);
    const reader = new window.Readability(documentClone, this.readabilityOptions);
    
    const article = reader.parse();
    if (!article || !article.content) {
      throw new Error('Readability failed to extract content');
    }

    return this.convertReadabilityResult(article, options);
  }

  /**
   * Convert Readability result to TextExtractor format
   */
  convertReadabilityResult(article, options = {}) {
    const contentElement = this.createElementFromHTML(article.content);
    
    if (options.mode === 'paragraph') {
      return this.extractParagraphsFromElement(contentElement, options);
    } else if (options.mode === 'structured') {
      return this.extractStructuredFromElement(contentElement, options);
    } else {
      return this.extractTextNodesFromElement(contentElement, options);
    }
  }

  /**
   * Create DOM element from HTML string
   */
  createElementFromHTML(htmlString) {
    const container = document.createElement('div');
    container.innerHTML = htmlString;
    return container;
  }

  /**
   * Extract text nodes from Readability content
   */
  extractTextNodesFromElement(element, options = {}) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return this.isValidTextNode(node) ? 
            NodeFilter.FILTER_ACCEPT : 
            NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      if (hasSignificantText(node.textContent)) {
        textNodes.push({
          node: node,
          text: node.textContent.trim(),
          parent: node.parentElement,
          originalText: node.textContent,
          id: this.generateNodeId(node),
          source: 'readability'
        });
      }
    }

    return textNodes;
  }

  /**
   * Extract paragraphs from Readability content
   */
  extractParagraphsFromElement(element, options = {}) {
    const textNodes = this.extractTextNodesFromElement(element, options);
    return this.groupTextNodesByParagraph(textNodes, options);
  }

  /**
   * Extract structured content from Readability content
   */
  extractStructuredFromElement(element, options = {}) {
    const textNodes = this.extractTextNodesFromElement(element, options);
    return {
      text: textNodes.map(node => node.text).join(' '),
      structure: this.analyzeContentStructure(element),
      textNodes: textNodes,
      source: 'readability'
    };
  }

  /**
   * Group text nodes by paragraph containers
   */
  groupTextNodesByParagraph(textNodes, options = {}) {
    const paragraphGroups = new Map();
    const maxGroupSize = options.maxGroupSize || PERFORMANCE.BATCH_SIZE;

    textNodes.forEach(textNode => {
      const paragraph = this.findParagraphContainer(textNode.parent);
      const paragraphId = this.getElementId(paragraph);

      if (!paragraphGroups.has(paragraphId)) {
        paragraphGroups.set(paragraphId, {
          id: paragraphId,
          container: paragraph,
          textNodes: [],
          combinedText: '',
          priority: this.getParagraphPriority(paragraph),
          source: 'readability'
        });
      }

      const group = paragraphGroups.get(paragraphId);
      group.textNodes.push(textNode);
      group.combinedText += (group.combinedText ? ' ' : '') + textNode.text;
    });

    const groups = Array.from(paragraphGroups.values());
    
    return groups.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return this.getDocumentOrder(a.container) - this.getDocumentOrder(b.container);
    });
  }

  /**
   * Analyze content structure for better understanding
   */
  analyzeContentStructure(element) {
    const structure = {
      headings: [],
      paragraphs: 0,
      lists: 0,
      images: 0,
      links: 0
    };

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const tagName = node.tagName.toLowerCase();
      
      if (tagName.match(/^h[1-6]$/)) {
        structure.headings.push({
          level: parseInt(tagName.charAt(1)),
          text: node.textContent.trim(),
          element: node
        });
      } else if (tagName === 'p') {
        structure.paragraphs++;
      } else if (['ul', 'ol'].includes(tagName)) {
        structure.lists++;
      } else if (tagName === 'img') {
        structure.images++;
      } else if (tagName === 'a') {
        structure.links++;
      }
    }

    return structure;
  }

  /**
   * Check if text node is valid for translation
   */
  isValidTextNode(node) {
    if (!node || !node.parentElement) return false;
    
    const parent = node.parentElement;
    const tagName = parent.tagName.toLowerCase();
    
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return false;
    }
    
    if (parent.closest('.ot-bilingual-container, .ot-paragraph-bilingual')) {
      return false;
    }
    
    return true;
  }

  /**
   * Find paragraph container for grouping
   */
  findParagraphContainer(element) {
    const paragraphElements = [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'li', 'td', 'th', 'blockquote', 'div', 'article', 'section'
    ];

    let current = element;
    while (current && current !== document.body) {
      if (paragraphElements.includes(current.tagName.toLowerCase())) {
        return current;
      }
      current = current.parentElement;
    }

    return element;
  }

  /**
   * Get paragraph priority for sorting
   */
  getParagraphPriority(element) {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName.match(/^h[1-6]$/)) {
      return parseInt(tagName.charAt(1));
    }
    
    if (['p', 'blockquote'].includes(tagName)) {
      return 10;
    }
    
    if (['li', 'td', 'th'].includes(tagName)) {
      return 15;
    }
    
    return 20;
  }

  /**
   * Generate unique element ID
   */
  getElementId(element) {
    if (element.id) return element.id;
    
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
   * Get document order for sorting
   */
  getDocumentOrder(element) {
    let order = 0;
    let current = element;
    
    while (current && current.previousElementSibling) {
      order++;
      current = current.previousElementSibling;
    }
    
    return order;
  }

  /**
   * Generate node ID
   */
  generateNodeId(node) {
    const parent = node.parentElement;
    const siblings = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    const index = siblings.indexOf(node);
    return `readability-${parent.tagName.toLowerCase()}-${index}-${Date.now()}`;
  }

  /**
   * Cache management
   */
  generateCacheKey(document, options) {
    const url = document.location ? document.location.href : 'unknown';
    const mode = options.mode || 'simple';
    const hash = this.simpleHash(document.documentElement.outerHTML.substring(0, 1000));
    return `${url}-${mode}-${hash}`;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
    
    if (this.cache.size > 50) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Enable/disable smart content extraction
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.clearCache();
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartContentExtractor;
} else if (typeof window !== 'undefined') {
  window.SmartContentExtractor = SmartContentExtractor;
}
