/**
 * Translation rendering and DOM manipulation
 */
class TranslationRenderer {
  constructor() {
    this.translationMode = TRANSLATION_MODES.REPLACE;
    this.originalTexts = new Map();
    this.translatedElements = new Set();
    this.styleInjected = false;

    this.renderedResults = new Set();

    // Performance optimizations
    this.maxCacheSize = 1000;
    this.cleanupInterval = 300000; // 5 minutes
    this.lastCleanup = Date.now();

    // Set up periodic cleanup
    this.setupPeriodicCleanup();
  }

  /**
   * Set translation mode
   */
  setMode(mode) {
    // 验证模式有效性
    if (![TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL].includes(mode)) {
      this.translationMode = TRANSLATION_MODES.REPLACE;
      return;
    }

    this.translationMode = mode;
  }

  /**
   * Render translations in replace mode
   */
  renderReplaceMode(textNodes, translations) {
    // 确保在Replace模式下清理任何双语模式残留
    this.cleanupAllBilingualElements();

    textNodes.forEach((textNode, index) => {
      if (translations[index] && !translations[index].error) {
        this.replaceTextContent(textNode, translations[index]);
      }
    });
  }



  /**
   * Render single translation result immediately (real-time rendering)
   */
  renderSingleResult(result, mode = null) {
    if (!result.success || !result.textNodes) {
      return;
    }

    const resultId = this.generateResultId(result);
    if (this.renderedResults.has(resultId)) {
      return;
    }

    try {
      const actualMode = mode !== null ? mode : this.translationMode;

      // 确保模式有效，默认使用替换模式以保持向后兼容
      const validMode = [TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL].includes(actualMode)
        ? actualMode
        : TRANSLATION_MODES.REPLACE;

      if (validMode === TRANSLATION_MODES.REPLACE) {
        result.textNodes.forEach(textNode => {
          // Additional validation before processing
          if (textNode.node && textNode.node.parentElement) {
            this.replaceTextContent(textNode, result.translation);
          }
        });
      } else if (validMode === TRANSLATION_MODES.BILINGUAL) {
        this.ensureBilingualStyles();
        this.createParagraphBilingualDisplay(result);
      }

      this.renderedResults.add(resultId);

    } catch (error) {
    }
  }

  /**
   * 生成翻译结果的唯一标识符
   */
  generateResultId(result) {
    if (!result.container) return null;

    // 使用容器元素和原文内容生成唯一ID
    const containerId = result.container.tagName +
                       (result.container.id || '') +
                       (result.container.className || '');
    const textHash = this.simpleHash(result.originalText || '');
    return `${containerId}-${textHash}`;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
  /**
   * Ensure bilingual styles are injected
   */
  ensureBilingualStyles() {
    const styleId = CSS_CLASSES.STYLE_ID;
    const existingStyle = document.getElementById(styleId);

    // 只有在样式不存在时才注入
    if (!existingStyle) {
      this.injectBilingualStyles();
      this.styleInjected = true;
    } else if (!this.styleInjected) {
      // 如果样式存在但标记为未注入，更新标记
      this.styleInjected = true;
    }
  }

  /**
   * Replace text content directly (with memory management)
   */
  replaceTextContent(textNode, translation) {
    const node = textNode.node;
    const parent = node.parentElement;

    // Special handling for option elements in replace mode
    if (parent && parent.tagName && parent.tagName.toLowerCase() === 'option') {
      // Skip if already processed
      if (this.translatedElements.has(parent)) {
        return;
      }

      // Store original text for restoration
      if (!this.originalTexts.has(parent)) {
        this.originalTexts.set(parent, parent.textContent);
      }

      // Clean up any bilingual attributes
      parent.removeAttribute('data-ot-bilingual');
      parent.removeAttribute('data-original-text');
      parent.removeAttribute('data-translation');

      // Replace with translation
      const cleanTranslation = this.stripHtmlTags(translation);
      parent.textContent = cleanTranslation;
      this.translatedElements.add(parent);
      return;
    }

    // Skip if already processed or if node is in a bilingual container
    if (this.translatedElements.has(parent) ||
        parent.classList.contains('ot-bilingual-container') ||
        parent.classList.contains('ot-paragraph-bilingual') ||
        parent.querySelector('.ot-bilingual-container') ||
        parent.querySelector('.ot-paragraph-bilingual')) {
      return;
    }

    // 跳过链接内的短文本（可能是导航链接）
    const linkParent = parent.closest('a[href]');
    if (linkParent) {
      const text = node.textContent.trim();
      if (text.length < 20 && !/[.!?。！？]/.test(text)) {
        return;
      }
    }

    // 跳过非内容区域的文本
    if (this.isInNonContentArea(parent)) {
      return;
    }

    // 确保清理任何残留的双语模式样式和元素
    this.cleanupBilingualElements(parent);

    // 移除可能存在的双语容器
    const bilingualContainer = parent.querySelector('.ot-bilingual-container');
    if (bilingualContainer) {
      bilingualContainer.remove();
    }

    // 移除双语模式的类名
    parent.classList.remove('ot-paragraph-bilingual', 'ot-bilingual-container');

    // Store original text for restoration
    if (!this.originalTexts.has(node)) {
      this.originalTexts.set(node, node.textContent);

      // Trigger cleanup if cache is getting too large
      if (this.originalTexts.size > this.maxCacheSize) {
        this.performMemoryCleanup();
      }
    }

    // Special handling for heading elements to preserve structure
    if (this.isHeadingElement(parent)) {
      this.replaceHeadingContent(parent, node, translation);
      return;
    }

    // Ensure translation is plain text only (strip any HTML tags)
    const cleanTranslation = this.stripHtmlTags(translation);

    // Replace text content
    node.textContent = cleanTranslation;
    this.translatedElements.add(parent);
  }

  /**
   * Strip HTML tags from text to ensure plain text output in replace mode
   */
  stripHtmlTags(text) {
    if (typeof text !== 'string') {
      return String(text || '');
    }

    // Remove HTML tags and decode HTML entities
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    return tempDiv.textContent || tempDiv.innerText || '';
  }

  /**
   * Check if element is a heading element (h1-h6)
   */
  isHeadingElement(element) {
    if (!element || !element.tagName) return false;
    const tagName = element.tagName.toLowerCase();
    return /^h[1-6]$/.test(tagName);
  }

  /**
   * Replace content in heading elements while preserving structure
   */
  replaceHeadingContent(headingElement, textNode, translation) {
    // Store original content for restoration
    if (!this.originalTexts.has(headingElement)) {
      this.originalTexts.set(headingElement, headingElement.innerHTML);
    }

    // Clean translation text
    const cleanTranslation = this.stripHtmlTags(translation);

    // Check if heading has multiple text nodes or complex structure
    const allTextNodes = this.getAllTextNodes(headingElement);

    if (allTextNodes.length === 1 && allTextNodes[0] === textNode.node) {
      // Simple case: heading contains only one text node
      textNode.node.textContent = cleanTranslation;
    } else {
      // Complex case: heading has multiple text nodes or mixed content
      // Replace only the specific text node while preserving other content
      textNode.node.textContent = cleanTranslation;
    }

    this.translatedElements.add(headingElement);
  }

  /**
   * Get all text nodes within an element
   */
  getAllTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    return textNodes;
  }

  /**
   * Clean up any bilingual elements that might interfere with replace mode
   */
  cleanupBilingualElements(element) {
    // Remove any bilingual containers within the element
    const bilingualContainers = element.querySelectorAll('.ot-bilingual-container, .ot-paragraph-bilingual');
    bilingualContainers.forEach(container => {
      // Remove bilingual-specific classes
      container.classList.remove('ot-bilingual-container', 'ot-paragraph-bilingual', 'ot-original-only');

      // Remove bilingual-specific attributes
      container.removeAttribute('data-original-lang');
      container.removeAttribute('data-translated-lang');
      container.removeAttribute('aria-label');
      container.removeAttribute('role');

      // Remove translated sections
      const translatedSections = container.querySelectorAll('.ot-paragraph-translated, .ot-original-text, .ot-translated-text');
      translatedSections.forEach(section => section.remove());
    });

    // Also check the element itself
    if (element.classList.contains('ot-bilingual-container') ||
        element.classList.contains('ot-paragraph-bilingual')) {
      element.classList.remove('ot-bilingual-container', 'ot-paragraph-bilingual', 'ot-original-only');
      element.removeAttribute('data-original-lang');
      element.removeAttribute('data-translated-lang');
      element.removeAttribute('aria-label');
      element.removeAttribute('role');

      const translatedSections = element.querySelectorAll('.ot-paragraph-translated, .ot-original-text, .ot-translated-text');
      translatedSections.forEach(section => section.remove());
    }
  }

  /**
   * Clean up all bilingual elements in the entire document
   */
  cleanupAllBilingualElements() {
    // Remove all bilingual containers from the document
    const allBilingualContainers = document.querySelectorAll('.ot-bilingual-container, .ot-paragraph-bilingual');
    allBilingualContainers.forEach(container => {
      // Remove bilingual-specific classes
      container.classList.remove('ot-bilingual-container', 'ot-paragraph-bilingual', 'ot-original-only');

      // Remove bilingual-specific attributes
      container.removeAttribute('data-original-lang');
      container.removeAttribute('data-translated-lang');
      container.removeAttribute('aria-label');
      container.removeAttribute('role');

      // Remove translated sections
      const translatedSections = container.querySelectorAll('.ot-paragraph-translated, .ot-original-text, .ot-translated-text');
      translatedSections.forEach(section => section.remove());
    });

    // Remove any orphaned translated sections
    const orphanedSections = document.querySelectorAll('.ot-paragraph-translated, .ot-original-text, .ot-translated-text');
    orphanedSections.forEach(section => section.remove());

    // Clean up option elements
    const bilingualOptions = document.querySelectorAll('option[data-ot-bilingual="true"]');
    bilingualOptions.forEach(option => {
      const originalText = option.getAttribute('data-original-text');
      if (originalText) {
        option.textContent = originalText;
      }
      option.removeAttribute('data-ot-bilingual');
      option.removeAttribute('data-original-text');
      option.removeAttribute('data-translation');
    });

    // Remove injected bilingual styles
    const bilingualStyles = document.getElementById('open-translate-bilingual-styles');
    if (bilingualStyles) {
      bilingualStyles.remove();
      this.styleInjected = false;
    }
  }

  /**
   * Set up periodic cleanup to prevent memory leaks
   */
  setupPeriodicCleanup() {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        this.performMemoryCleanup();
      }, this.cleanupInterval);
    }
  }

  /**
   * Perform memory cleanup by removing stale references
   */
  performMemoryCleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;

    // Clean up originalTexts Map by removing nodes no longer in DOM
    const staleNodes = [];
    for (const [node] of this.originalTexts) {
      if (!document.contains(node)) {
        staleNodes.push(node);
      }
    }

    staleNodes.forEach(node => {
      this.originalTexts.delete(node);
    });

    // Clean up translatedElements Set
    const staleElements = [];
    for (const element of this.translatedElements) {
      if (!document.contains(element)) {
        staleElements.add(element);
      }
    }

    staleElements.forEach(element => {
      this.translatedElements.delete(element);
    });

    this.lastCleanup = now;
  }

  /**
   * Create paragraph-level bilingual display (new feature)
   */
  createParagraphBilingualDisplay(result) {
    const container = result.container;

    // 验证容器是否存在
    if (!container || !container.parentElement) {
      return;
    }

    // Special handling for option elements
    if (container && container.tagName.toLowerCase() === 'option') {
      this.createOptionBilingualDisplay(container, result);
      return;
    }

    // 跳过非内容区域的容器
    if (this.isInNonContentArea(container)) {
      return;
    }

    // Skip if already processed - 更严格的检查
    if (container.classList.contains('ot-paragraph-bilingual') ||
        container.querySelector('.ot-paragraph-bilingual') ||
        this.translatedElements.has(container)) {
      return;
    }

    // 检查容器内是否已有翻译内容
    if (container.querySelector('.ot-paragraph-translated')) {
      return;
    }

    // 跳过纯链接容器（如导航菜单）
    if (container.tagName.toLowerCase() === 'a' ||
        (container.children.length === 1 && container.children[0].tagName.toLowerCase() === 'a')) {
      const text = result.originalText.trim();
      if (text.length < 20 && !/[.!?。！？]/.test(text)) {
        return;
      }
    }

    // Store original content
    const originalContent = container.innerHTML;
    const originalText = result.originalText;

    // 标记容器为双语模式，但保持原文完全不变
    container.classList.add('ot-paragraph-bilingual');
    container.setAttribute('data-original-lang', this.detectLanguage(originalText));
    container.setAttribute('data-translated-lang', 'zh-CN');

    // Create translated content section for all elements (including headings)
    // This preserves the original HTML structure including links
    const translatedSection = document.createElement('div');
    translatedSection.className = 'ot-paragraph-translated';
    translatedSection.setAttribute('data-bilingual-mode', 'true');

    // Handle HTML content in translation if available
    if (this.containsHtmlTags(result.translation)) {
      // If translation contains HTML tags, render as HTML
      translatedSection.innerHTML = this.sanitizeHtml(result.translation);
    } else {
      // Otherwise, render as plain text
      translatedSection.textContent = result.translation;
    }

    translatedSection.setAttribute('lang', 'zh-CN');

    // 确保译文元素可见
    translatedSection.style.display = 'block';
    translatedSection.style.visibility = 'visible';
    translatedSection.style.opacity = '1';

    // 在原文后面直接添加翻译内容，不修改原文
    container.appendChild(translatedSection);

    // Add accessibility support
    container.setAttribute('aria-label', `Original: ${result.originalText}. Translation: ${result.translation}`);
    container.setAttribute('role', 'group');

    // Mark as translated
    this.translatedElements.add(container);

    // Store original content for restoration
    if (!this.originalTexts.has(container)) {
      this.originalTexts.set(container, originalContent);
    }


  }

  /**
   * Simple language detection for better styling
   */
  detectLanguage(text) {
    // 简单的语言检测逻辑
    if (/[\u4e00-\u9fff]/.test(text)) {
      return 'zh';
    } else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ja';
    } else if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko';
    } else if (/[а-яё]/i.test(text)) {
      return 'ru';
    } else {
      return 'en';
    }
  }

  /**
   * Check if text contains HTML tags
   */
  containsHtmlTags(text) {
    if (!text || typeof text !== 'string') return false;
    return /<[^>]+>/g.test(text);
  }

  /**
   * Sanitize HTML content for safe rendering
   */
  sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';

    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Remove potentially dangerous elements and attributes
    const dangerousElements = tempDiv.querySelectorAll('script, style, iframe, object, embed, form, input, button');
    dangerousElements.forEach(el => el.remove());

    // Remove dangerous attributes but preserve important ones
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
      const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset'];
      dangerousAttrs.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });

      // Remove javascript: links but preserve other href values
      if (el.hasAttribute('href')) {
        const href = el.getAttribute('href');
        if (href.startsWith('javascript:') || href.startsWith('data:') || href.startsWith('vbscript:')) {
          el.removeAttribute('href');
        }
      }

      // Remove dangerous src attributes
      if (el.hasAttribute('src')) {
        const src = el.getAttribute('src');
        if (src.startsWith('javascript:') || src.startsWith('data:') || src.startsWith('vbscript:')) {
          el.removeAttribute('src');
        }
      }
    });

    return tempDiv.innerHTML;
  }

  /**
   * Inject CSS styles for bilingual mode
   */
  injectBilingualStyles() {
    const styleId = CSS_CLASSES.STYLE_ID;

    // 双重检查，确保不会重复注入
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;

    style.textContent = `
      ${this.generateAdaptiveStyles()}

      .ot-translating {
        opacity: 1;
      }

      .ot-translated {
        opacity: 1;
      }

      /* 段落级双语对照样式 */
      .ot-paragraph-bilingual {
        margin: 0;
        padding: 0;
        background: none;
        border: none;
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        font-style: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        text-decoration: inherit;
        color: inherit;
      }

      /* 译文样式 */
      .ot-paragraph-translated {
        margin-top: 10px;
        margin-bottom: 8px;
        padding: 4px 0;
        color: inherit;
        font-family: inherit;
        font-size: inherit;
        font-weight: 350;
        font-style: inherit;
        line-height: 1.6;
        letter-spacing: 0.02em;
        text-decoration: inherit;
        background: none;
        border: none;
        border-radius: 0;
        transition: opacity 0.2s ease;
        position: relative;
      }


      /* 仅显示原文模式 */
      .ot-paragraph-bilingual.ot-original-only .ot-paragraph-translated {
        display: none !important;
      }

      /* Option元素双语样式 */
      option[data-ot-bilingual="true"] {
        font-family: inherit;
        font-size: inherit;
        line-height: normal;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* 确保select下拉框能正确显示双语文本 */
      select option {
        padding: 4px 8px;
        line-height: 1.4;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Restore original text content
   */
  restoreOriginalText() {
    // Restore bilingual containers to their original HTML content
    this.originalTexts.forEach((originalContent, element) => {
      if (element.parentElement) {
        // Check if this is a container element (has innerHTML stored)
        if (element.classList && element.classList.contains('ot-paragraph-bilingual')) {
          // Restore original HTML content for bilingual containers
          element.innerHTML = originalContent;

          // Remove bilingual classes and attributes
          element.classList.remove('ot-paragraph-bilingual');
          element.removeAttribute('data-original-lang');
          element.removeAttribute('data-translated-lang');
          element.removeAttribute('aria-label');
          element.removeAttribute('role');
        } else if (element.tagName && element.tagName.toLowerCase() === 'option') {
          // Special handling for option elements
          element.textContent = originalContent;
          element.removeAttribute('data-ot-bilingual');
          element.removeAttribute('data-original-text');
          element.removeAttribute('data-translation');
        } else if (this.isHeadingElement(element)) {
          // Special handling for heading elements - restore innerHTML to preserve structure
          element.innerHTML = originalContent;
        } else if (typeof originalContent === 'string') {
          // Restore text content for text nodes
          element.textContent = originalContent;
        }
      }
    });

    // 彻底清理所有双语模式残留
    this.cleanupAllBilingualElements();

    // Clear tracking data
    this.originalTexts.clear();
    this.translatedElements.clear();
    this.renderedResults.clear(); // 清理渲染状态跟踪
  }

  showOriginalOnly() {
    // Hide translated sections in bilingual containers
    document.querySelectorAll('.ot-paragraph-bilingual .ot-paragraph-translated').forEach(translatedSection => {
      translatedSection.style.display = 'none';
    });

    // Add a class to indicate original-only mode
    document.querySelectorAll('.ot-paragraph-bilingual').forEach(container => {
      container.classList.add('ot-original-only');
    });

    // Handle option elements - show only original text
    document.querySelectorAll('option[data-ot-bilingual="true"]').forEach(option => {
      const originalText = option.getAttribute('data-original-text');
      if (originalText) {
        option.textContent = originalText;
      }
    });
  }

  /**
   * Show both original and translated text in bilingual mode
   */
  showBilingual() {
    // Show translated sections in bilingual containers
    document.querySelectorAll('.ot-paragraph-bilingual .ot-paragraph-translated').forEach(translatedSection => {
      translatedSection.style.display = '';
    });

    // Remove original-only mode class
    document.querySelectorAll('.ot-paragraph-bilingual').forEach(container => {
      container.classList.remove('ot-original-only');
    });

    // Handle option elements - show bilingual text
    document.querySelectorAll('option[data-ot-bilingual="true"]').forEach(option => {
      const originalText = option.getAttribute('data-original-text');
      const translation = option.getAttribute('data-translation');
      if (originalText && translation) {
        option.textContent = `${originalText} ${translation}`;
      }
    });
  }

  /**
   * Check if page has been translated
   */
  isTranslated() {
    return this.translatedElements.size > 0 ||
           document.querySelectorAll('.ot-paragraph-bilingual').length > 0 ||
           document.querySelectorAll('option[data-ot-bilingual="true"]').length > 0;
  }

  /**
   * Get translation statistics
   */
  getTranslationStats() {
    return {
      translatedElements: this.translatedElements.size,
      paragraphBilingualContainers: document.querySelectorAll('.ot-paragraph-bilingual').length,
      bilingualOptions: document.querySelectorAll('option[data-ot-bilingual="true"]').length,
      mode: this.translationMode,
      hasOriginalTexts: this.originalTexts.size > 0
    };
  }

  /**
   * Update translation mode and re-render if needed
   */
  async switchMode(newMode, textNodes, translations) {
    // 验证新模式的有效性
    if (![TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL].includes(newMode)) {
      return;
    }

    // 如果模式相同，无需切换
    if (this.translationMode === newMode) {
      return;
    }

    // 先恢复原始状态
    this.restoreOriginalText();

    // 彻底清理所有翻译相关的DOM元素
    this.cleanupAllBilingualElements();
    this.translatedElements.clear();
    this.renderedResults.clear(); // 清理渲染状态跟踪

    // 设置新模式
    this.setMode(newMode);

    // 根据新模式重新渲染
    if (textNodes && translations) {
      if (newMode === TRANSLATION_MODES.REPLACE) {
        this.renderReplaceMode(textNodes, translations);
      } else if (newMode === TRANSLATION_MODES.BILINGUAL) {
        this.ensureBilingualStyles();
        // 对于双语模式，需要重新处理每个翻译结果
        translations.forEach(translation => {
          if (translation.success) {
            this.createParagraphBilingualDisplay(translation);
          }
        });
      }
    }
  }

  /**
   * Handle dynamic content changes
   */
  observeContentChanges(callback) {
    const observer = new MutationObserver((mutations) => {
      let hasTextChanges = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          // Check if changes affect translatable content
          if (this.hasTranslatableChanges(mutation)) {
            hasTextChanges = true;
          }
        }
      });
      
      if (hasTextChanges && callback) {
        callback();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return observer;
  }

  /**
   * Check if mutation affects translatable content
   */
  hasTranslatableChanges(mutation) {
    if (mutation.type === 'characterData') {
      return mutation.target.parentElement &&
             !mutation.target.parentElement.closest('.ot-bilingual-container, .ot-paragraph-bilingual, .ot-paragraph-translated');
    }

    if (mutation.type === 'childList') {
      // 忽略翻译相关的DOM变化
      const isTranslationRelated = Array.from(mutation.addedNodes).some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.classList?.contains('ot-bilingual-container') ||
         node.classList?.contains('ot-paragraph-bilingual') ||
         node.classList?.contains('ot-paragraph-translated'))
      ) || Array.from(mutation.removedNodes).some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.classList?.contains('ot-bilingual-container') ||
         node.classList?.contains('ot-paragraph-bilingual') ||
         node.classList?.contains('ot-paragraph-translated'))
      );

      if (isTranslationRelated) {
        return false;
      }

      return Array.from(mutation.addedNodes).some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        !node.classList?.contains('ot-bilingual-container')
      );
    }

    return false;
  }

  /**
   * 检查元素是否在非内容区域
   */
  isInNonContentArea(element) {
    return isExcludedElement(element, []);
  }

  /**
   * Detect site styles for better integration
   */
  detectSiteStyles() {
    const body = document.body;
    const html = document.documentElement;
    const bodyStyle = window.getComputedStyle(body);
    const htmlStyle = window.getComputedStyle(html);

    // 获取最具代表性的样式
    const backgroundColor = bodyStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
      ? bodyStyle.backgroundColor
      : htmlStyle.backgroundColor;

    const color = bodyStyle.color !== 'rgba(0, 0, 0, 0)'
      ? bodyStyle.color
      : htmlStyle.color;

    // 检测主要内容区域的样式
    const mainContent = document.querySelector('main, article, .content, .main, #content, #main') || body;
    const mainStyle = window.getComputedStyle(mainContent);

    return {
      backgroundColor: backgroundColor,
      color: color,
      fontFamily: mainStyle.fontFamily || bodyStyle.fontFamily,
      fontSize: mainStyle.fontSize || bodyStyle.fontSize,
      lineHeight: mainStyle.lineHeight || bodyStyle.lineHeight,
      // 额外的样式信息
      fontWeight: mainStyle.fontWeight || bodyStyle.fontWeight,
      letterSpacing: mainStyle.letterSpacing || bodyStyle.letterSpacing,
      textAlign: mainStyle.textAlign || bodyStyle.textAlign
    };
  }



  /**
   * Generate adaptive styles
   */
  generateAdaptiveStyles() {
    const siteStyles = this.detectSiteStyles();

    return `
      /* 自适应双语对照样式 */
      .ot-paragraph-bilingual {
        /* 继承网站原有样式但确保基础可读性 */
        font-family: ${siteStyles.fontFamily || 'inherit'};
        color: ${siteStyles.color || 'inherit'};
        background-color: ${siteStyles.backgroundColor || 'transparent'};
      }

      /* 译文字体优化 - 继承原文字体 */
      .ot-paragraph-translated {
        font-family: inherit;
      }

      /* 根据网站背景色调整译文透明度 */
      ${this.generateContrastAdjustments(siteStyles)}

      /* 针对不同字体大小的间距调整 */
      ${this.generateSpacingAdjustments(siteStyles)}
    `;
  }

  /**
   * 获取最佳无衬线字体栈
   */
  getOptimalSansSerifFont() {
    const userAgent = navigator.userAgent;
    const language = navigator.language || 'en';

    // 针对中文环境优化字体栈
    if (language.startsWith('zh')) {
      return `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', sans-serif`;
    }

    // 根据系统和语言环境选择最佳字体
    if (language.startsWith('zh')) {
      // 中文环境
      if (userAgent.includes('Mac')) {
        return `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'WenQuanYi Micro Hei', sans-serif`;
      } else if (userAgent.includes('Windows')) {
        return `'Microsoft YaHei', 'Segoe UI', 'SimHei', sans-serif`;
      } else {
        return `'Noto Sans CJK SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', sans-serif`;
      }
    } else if (language.startsWith('ja')) {
      // 日文环境
      return `'Hiragino Kaku Gothic ProN', 'Noto Sans CJK JP', 'Yu Gothic', 'Meiryo', sans-serif`;
    } else if (language.startsWith('ko')) {
      // 韩文环境
      return `'Apple SD Gothic Neo', 'Noto Sans CJK KR', 'Malgun Gothic', sans-serif`;
    } else {
      // 西文环境
      return `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`;
    }
  }

  /**
   * 生成对比度调整样式
   */
  generateContrastAdjustments(siteStyles) {
    const isDarkMode = this.isDarkMode(siteStyles);

    return `
      /* 译文透明度和对比度调整 */
      .ot-paragraph-translated {
        opacity: 0.85;
        ${isDarkMode ? 'filter: brightness(0.9);' : 'filter: brightness(1.1);'}
      }

      /* 鼠标悬停时提高可读性 */
      .ot-paragraph-bilingual:hover .ot-paragraph-translated {
        opacity: 1;
        filter: none;
      }
    `;
  }

  /**
   * 检测是否为深色模式
   */
  isDarkMode(siteStyles) {
    const bgColor = siteStyles.backgroundColor;
    if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
      return false;
    }

    // 简单的深色检测逻辑
    const rgb = bgColor.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
      return brightness < 128;
    }

    return false;
  }

  /**
   * 生成间距调整样式
   */
  generateSpacingAdjustments(siteStyles) {
    const fontSize = parseFloat(siteStyles.fontSize) || 16;
    const topSpacing = Math.max(8, fontSize * 0.5);
    const bottomSpacing = Math.max(6, fontSize * 0.375);
    const padding = Math.max(4, fontSize * 0.25);

    return `
      /* 根据字体大小动态调整间距 */
      .ot-paragraph-translated {
        margin-top: ${topSpacing}px !important;
        margin-bottom: ${bottomSpacing}px !important;
        padding: ${padding}px 0 !important;
        line-height: ${Math.max(1.5, 1.2 + fontSize * 0.025)} !important;
      }

      /* 针对小字体的特殊处理 */
      ${fontSize < 14 ? `
        .ot-paragraph-translated {
          margin-top: 6px !important;
          margin-bottom: 4px !important;
          padding: 3px 0 !important;
          line-height: 1.5 !important;
        }
      ` : ''}

      /* 针对大字体的特殊处理 */
      ${fontSize > 18 ? `
        .ot-paragraph-translated {
          margin-top: ${fontSize * 0.6}px !important;
          margin-bottom: ${fontSize * 0.45}px !important;
          padding: ${fontSize * 0.3}px 0 !important;
          line-height: 1.7 !important;
        }
      ` : ''}
    `;
  }

  /**
   * 获取用于缓存的纯文本翻译结果
   * 确保缓存中只存储纯文本，双语模式需要重新计算样式
   */
  getTranslationForCache(translation) {
    // 如果是HTML内容，提取纯文本
    if (typeof translation === 'string' && translation.includes('<')) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = translation;
      return tempDiv.textContent || tempDiv.innerText || translation;
    }
    return translation;
  }

  /**
   * 检查是否需要重新计算双语样式
   * 双语模式下即使有缓存也需要重新应用样式
   */
  shouldRecalculateBilingualStyles(mode) {
    return mode === 'paragraph-bilingual';
  }

  /**
   * Create bilingual display for option elements
   */
  createOptionBilingualDisplay(optionElement, result) {
    if (!optionElement || !result || !result.translation) {
      return;
    }

    // Skip if already processed
    if (optionElement.hasAttribute('data-ot-bilingual') ||
        this.translatedElements.has(optionElement)) {
      return;
    }

    const originalText = result.originalText.trim();
    const translation = result.translation.trim();

    // Skip very short text that might not need translation
    if (originalText.length < 2) {
      return;
    }

    // Store original text for restoration
    if (!this.originalTexts.has(optionElement)) {
      this.originalTexts.set(optionElement, optionElement.textContent);
    }

    // Create bilingual text: "Original Text 译文"
    // For very long text, truncate to prevent option overflow
    let displayOriginal = originalText;
    let displayTranslation = translation;

    const maxLength = 80; // Maximum total length for option text
    const combinedLength = originalText.length + translation.length + 1; // +1 for space

    if (combinedLength > maxLength) {
      // If combined text is too long, prioritize original text and truncate translation
      const availableForTranslation = maxLength - originalText.length - 4; // -4 for " ..."
      if (availableForTranslation > 10) {
        displayTranslation = translation.substring(0, availableForTranslation) + '...';
      } else {
        // If original is too long, truncate both
        const halfLength = Math.floor(maxLength / 2) - 2;
        displayOriginal = originalText.substring(0, halfLength) + '...';
        displayTranslation = translation.substring(0, halfLength) + '...';
      }
    }

    const bilingualText = `${displayOriginal} ${displayTranslation}`;

    // Update option text content
    optionElement.textContent = bilingualText;

    // Mark as processed
    optionElement.setAttribute('data-ot-bilingual', 'true');
    optionElement.setAttribute('data-original-text', originalText);
    optionElement.setAttribute('data-translation', translation);

    // Add to translated elements set
    this.translatedElements.add(optionElement);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationRenderer;
} else if (typeof window !== 'undefined') {
  window.TranslationRenderer = TranslationRenderer;
}
