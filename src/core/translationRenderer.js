/**
 * Translation rendering and DOM manipulation
 */
class TranslationRenderer {
  constructor() {
    this.translationMode = TRANSLATION_MODES.REPLACE;
    this.originalTexts = new Map();
    this.translatedElements = new Set();
    this.styleInjected = false;

    // CSS-based translation system
    this.cssTranslations = new Map(); // element -> translation data
    this.translationStyleSheet = null;
    this.translationCounter = 0;

    this.renderedResults = new Set();

    // 失败元素追踪机制
    this.failedElements = new Map(); // elementId -> failureInfo
    this.retryQueue = new Map(); // elementId -> retryInfo
    this.maxRetryAttempts = 3;
    this.retryDelay = 2000; // 2秒基础延迟

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
   * Initialize CSS-based translation system
   */
  initializeCSSTranslationSystem() {
    if (this.translationStyleSheet) return;

    // Create a dedicated stylesheet for translations
    this.translationStyleSheet = document.createElement('style');
    this.translationStyleSheet.id = 'ot-css-translations';
    document.head.appendChild(this.translationStyleSheet);
  }

  /**
   * Apply CSS-based translation without modifying DOM structure
   */
  applyCSSTranslation(element, translation, originalText) {
    this.initializeCSSTranslationSystem();

    const translationId = `ot-trans-${++this.translationCounter}`;
    element.setAttribute('data-ot-translation-id', translationId);

    // Store translation data
    this.cssTranslations.set(element, {
      id: translationId,
      original: originalText,
      translation: translation,
      applied: true
    });

    // Add CSS rule to hide original text and show translation
    const cssRule = `
      [data-ot-translation-id="${translationId}"] {
        position: relative !important;
      }

      [data-ot-translation-id="${translationId}"] * {
        visibility: hidden !important;
      }

      [data-ot-translation-id="${translationId}"]::before {
        content: "${this.escapeCSSContent(translation)}" !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        visibility: visible !important;
        color: inherit !important;
        background: transparent !important;
        font: inherit !important;
        line-height: inherit !important;
        text-align: inherit !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow: hidden !important;
        pointer-events: none !important;
        z-index: 1 !important;
      }
    `;

    this.translationStyleSheet.textContent += cssRule;
    this.translatedElements.add(element);
  }

  /**
   * Escape CSS content for safe injection
   */
  escapeCSSContent(text) {
    if (!text) return '';

    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\A ')
      .replace(/\r/g, '')
      .replace(/\t/g, '\\9 ');
  }



  /**
   * Render translations in replace mode using CSS overlay method
   */
  renderReplaceMode(textNodes, translations) {
    // 确保在Replace模式下清理任何双语模式残留
    this.cleanupAllBilingualElements();

    // Initialize CSS translation system
    this.initializeCSSTranslationSystem();

    // Check if we're dealing with paragraph groups or individual text nodes
    if (Array.isArray(textNodes) && textNodes.length > 0 && textNodes[0].textNodes) {
      // Handle paragraph groups with CSS method
      this.renderParagraphGroupsCSSMode(textNodes, translations);
    } else {
      // Handle individual text nodes with CSS method
      textNodes.forEach((textNode, index) => {
        if (translations[index] && !translations[index].error) {
          this.replaceTextContent(textNode, translations[index]);
        }
      });
    }
  }

  /**
   * Render paragraph groups using CSS overlay method
   */
  renderParagraphGroupsCSSMode(paragraphGroups, translations) {
    paragraphGroups.forEach((group, index) => {
      const translation = translations[index];
      if (translation && !translation.error && group.container) {
        // Use CSS-based translation for the entire container
        const originalText = group.combinedText || group.container.textContent;
        this.applyCSSTranslation(group.container, translation.translation || translation, originalText);
      }
    });
  }

  /**
   * Render paragraph groups in replace mode
   */
  renderParagraphGroupsReplaceMode(paragraphGroups, translations) {
    paragraphGroups.forEach((group, index) => {
      const translation = translations[index];
      if (translation && !translation.error) {
        this.replaceParagraphGroupContent(group, translation);
      }
    });
  }

  /**
   * Replace content for a paragraph group
   */
  replaceParagraphGroupContent(group, translation) {
    if (!group.textNodes || group.textNodes.length === 0) {
      return;
    }

    const container = group.container;

    if (this.translatedElements.has(container)) {
      return;
    }

    if (!this.originalTexts.has(container)) {
      this.originalTexts.set(container, container.innerHTML);
    }

    const translationText = translation.translation || translation;
    const cleanTranslation = this.stripHtmlTags(translationText);

    if (this.isSafeForInnerHTMLReplacement(container)) {
      const sanitizedTranslation = this.sanitizeHtml(translationText);
      container.innerHTML = sanitizedTranslation;
    } else {
      this.replaceTextNodesInContainer(group.textNodes, cleanTranslation);
    }

    this.translatedElements.add(container);
  }

  /**
   * Render single translation result immediately (real-time rendering)
   */
  renderSingleResult(result, mode = null) {
    if (!result.success) {
      return;
    }

    const resultId = this.generateResultId(result);
    if (this.renderedResults.has(resultId)) {
      return;
    }

    try {
      // 检查翻译是否成功
      if (!result.success) {
        this.trackFailedElement(result);
        return;
      }

      // 如果之前失败过但现在成功了，移除失败追踪
      if (this.failedElements.has(resultId)) {
        this.removeFailedElement(resultId);
      }

      const actualMode = mode !== null ? mode : this.translationMode;

      const validMode = [TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL].includes(actualMode)
        ? actualMode
        : TRANSLATION_MODES.REPLACE;

      if (validMode === TRANSLATION_MODES.REPLACE) {
        // Handle paragraph group result
        if (result.container && result.textNodes) {
          this.replaceParagraphGroupContent(result, result);
        } else if (result.textNodes) {
          // Handle individual text nodes
          result.textNodes.forEach(textNode => {
            if (textNode.node && textNode.node.parentElement) {
              this.replaceTextContent(textNode, result.translation);
            }
          });
        }
      } else if (validMode === TRANSLATION_MODES.BILINGUAL) {
        this.ensureBilingualStyles();
        this.createParagraphBilingualDisplay(result);
      }

      this.renderedResults.add(resultId);

    } catch (error) {
      // 渲染失败也要追踪
      const failedResult = {
        ...result,
        success: false,
        error: error.message,
        failureReason: `Rendering failed: ${error.message}`
      };
      this.trackFailedElement(failedResult);
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
   * 追踪失败的翻译元素
   */
  trackFailedElement(result) {
    if (!result || !result.container) return;

    const elementId = this.generateResultId(result);
    if (!elementId) return;

    const failureInfo = {
      result: result,
      failureTime: Date.now(),
      retryCount: result.retryCount || 0,
      failureReason: result.failureReason || result.error || 'Unknown error',
      lastRetryTime: result.lastRetryTime || null
    };

    this.failedElements.set(elementId, failureInfo);

    // 如果还可以重试，添加到重试队列
    if (failureInfo.retryCount < this.maxRetryAttempts) {
      this.addToRetryQueue(elementId, failureInfo);
    }
  }

  /**
   * 添加元素到重试队列
   */
  addToRetryQueue(elementId, failureInfo) {
    const retryInfo = {
      elementId: elementId,
      failureInfo: failureInfo,
      nextRetryTime: Date.now() + this.calculateRetryDelay(failureInfo.retryCount),
      priority: this.calculateRetryPriority(failureInfo)
    };

    this.retryQueue.set(elementId, retryInfo);
  }

  /**
   * 计算重试延迟（指数退避）
   */
  calculateRetryDelay(retryCount) {
    return this.retryDelay * Math.pow(2, retryCount);
  }

  /**
   * 计算重试优先级
   */
  calculateRetryPriority(failureInfo) {
    // 基于失败原因和元素重要性计算优先级
    let priority = 1;

    // 网络错误优先级较高
    if (failureInfo.failureReason.includes('Network') ||
        failureInfo.failureReason.includes('timeout')) {
      priority += 2;
    }

    // 重试次数越少优先级越高
    priority += (this.maxRetryAttempts - failureInfo.retryCount);

    return priority;
  }

  /**
   * 移除失败元素追踪
   */
  removeFailedElement(elementId) {
    this.failedElements.delete(elementId);
    this.retryQueue.delete(elementId);
  }

  /**
   * 获取可重试的元素列表
   */
  getRetryableElements() {
    const now = Date.now();
    const retryable = [];

    for (const [, retryInfo] of this.retryQueue) {
      if (now >= retryInfo.nextRetryTime) {
        retryable.push(retryInfo);
      }
    }

    // 按优先级排序
    return retryable.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 执行失败元素的重试
   */
  async retryFailedElements(translationService, targetLanguage = 'zh-CN', sourceLanguage = 'auto') {
    if (!translationService) {
      console.warn('[TranslationRenderer] Translation service not provided for retry');
      return [];
    }

    const retryableElements = this.getRetryableElements();
    if (retryableElements.length === 0) {
      return [];
    }

    const retryResults = [];

    for (const retryInfo of retryableElements) {
      try {
        const result = await this.retryElement(retryInfo, translationService, targetLanguage, sourceLanguage);
        retryResults.push(result);

        // 添加延迟避免过于频繁的重试
        if (retryableElements.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.warn('[TranslationRenderer] Element retry failed:', error);
        retryResults.push({
          elementId: retryInfo.elementId,
          success: false,
          error: error.message
        });
      }
    }

    return retryResults;
  }

  /**
   * 重试单个元素
   */
  async retryElement(retryInfo, translationService, targetLanguage, sourceLanguage) {
    const { elementId, failureInfo } = retryInfo;
    const originalResult = failureInfo.result;

    // 更新重试计数和时间
    const updatedResult = {
      ...originalResult,
      retryCount: (originalResult.retryCount || 0) + 1,
      lastRetryTime: Date.now(),
      retryStatus: 'retrying'
    };

    try {
      // 重新翻译
      const translation = await translationService.translateText(
        originalResult.originalText,
        targetLanguage,
        sourceLanguage
      );

      // 创建成功的结果
      const successResult = {
        ...updatedResult,
        translation: translation,
        success: true,
        retryStatus: 'success',
        failureReason: null
      };

      // 重新渲染
      this.renderSingleResult(successResult, this.translationMode);

      return {
        elementId: elementId,
        success: true,
        result: successResult
      };

    } catch (error) {
      // 重试失败
      const failedResult = {
        ...updatedResult,
        success: false,
        retryStatus: 'failed',
        failureReason: error.message
      };

      // 更新失败追踪
      this.updateFailedElement(elementId, failedResult);

      console.warn(`[TranslationRenderer] Element retry failed: ${elementId}`, error);

      return {
        elementId: elementId,
        success: false,
        error: error.message,
        result: failedResult
      };
    }
  }

  /**
   * 更新失败元素信息
   */
  updateFailedElement(elementId, result) {
    const existingFailure = this.failedElements.get(elementId);
    if (!existingFailure) return;

    const updatedFailureInfo = {
      ...existingFailure,
      result: result,
      retryCount: result.retryCount,
      lastRetryTime: result.lastRetryTime,
      failureReason: result.failureReason
    };

    this.failedElements.set(elementId, updatedFailureInfo);

    // 如果还可以重试，更新重试队列
    if (result.retryCount < this.maxRetryAttempts) {
      this.addToRetryQueue(elementId, updatedFailureInfo);
    } else {
      // 达到最大重试次数，从重试队列中移除
      this.retryQueue.delete(elementId);
      console.warn(`[TranslationRenderer] Element reached max retry attempts: ${elementId}`);
    }
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
   * Replace text content using CSS overlay method (React-safe)
   */
  replaceTextContent(textNode, translation) {
    const node = textNode.node;
    const parent = node.parentElement;

    // Skip if already processed to prevent duplicate translations
    if (this.translatedElements.has(node) || this.translatedElements.has(parent)) {
      return;
    }

    // Use CSS-based translation for React safety
    return this.applyCSSBasedTranslation(node, parent, translation);
  }

  /**
   * Apply CSS-based translation that doesn't modify DOM structure
   */
  applyCSSBasedTranslation(node, parent, translation) {
    if (!node || !parent || !translation) {
      return;
    }

    // Find the best element to apply translation to
    const targetElement = this.findTranslationTarget(node, parent);
    if (!targetElement) {
      return;
    }

    // Store original text for restoration
    const originalText = targetElement.textContent;
    if (!this.originalTexts.has(targetElement)) {
      this.originalTexts.set(targetElement, originalText);
    }

    // Apply CSS-based translation
    this.applyCSSTranslation(targetElement, translation, originalText);
  }

  /**
   * Find the best element to apply CSS translation to
   */
  findTranslationTarget(textNode, parentElement) {
    // For text nodes, we need to find a suitable parent element
    if (textNode.nodeType === Node.TEXT_NODE) {
      // Check if parent element contains only this text node (or mostly text)
      const parentText = parentElement.textContent.trim();
      const nodeText = textNode.textContent.trim();

      // If the parent's text is mostly this text node, use the parent
      if (parentText === nodeText || parentText.includes(nodeText) && nodeText.length > parentText.length * 0.8) {
        return parentElement;
      }

      // Otherwise, we need to wrap the text node
      return this.wrapTextNodeForTranslation(textNode);
    }

    return parentElement;
  }

  /**
   * Wrap a text node in a span for CSS-based translation
   */
  wrapTextNodeForTranslation(textNode) {
    // Create a wrapper span
    const wrapper = document.createElement('span');
    wrapper.className = 'ot-text-wrapper';
    wrapper.style.display = 'inline';

    // Insert wrapper before the text node
    textNode.parentNode.insertBefore(wrapper, textNode);

    // Move text node into wrapper
    wrapper.appendChild(textNode);

    return wrapper;
  }

  /**
   * Diagnostic method to check translation system status
   */
  diagnoseTranslationSystem() {
    const diagnosis = {
      timestamp: new Date().toISOString(),
      cssTranslationSystemInitialized: !!this.translationStyleSheet,
      styleSheetInDOM: !!document.getElementById('ot-css-translations'),
      totalTranslations: this.cssTranslations.size,
      translatedElements: this.translatedElements.size,
      renderedResults: this.renderedResults.size,
      translationMode: this.translationMode,
      styleSheetContent: this.translationStyleSheet?.textContent?.length || 0
    };

    // Check for elements with translation IDs
    const elementsWithTranslationIds = document.querySelectorAll('[data-ot-translation-id]');
    diagnosis.elementsWithTranslationIds = elementsWithTranslationIds.length;

    // Check CSS rules
    if (this.translationStyleSheet) {
      const cssRules = this.translationStyleSheet.textContent.split('}').filter(rule => rule.trim());
      diagnosis.cssRulesCount = cssRules.length;
    }

    console.log('[TranslationRenderer] System Diagnosis:', diagnosis);

    // Log sample translation data
    if (this.cssTranslations.size > 0) {
      const sampleTranslation = Array.from(this.cssTranslations.entries())[0];
      console.log('[TranslationRenderer] Sample translation:', {
        element: sampleTranslation[0].tagName,
        data: sampleTranslation[1]
      });
    }

    return diagnosis;
  }

  /**
   * Force refresh all CSS translations
   */
  refreshCSSTranslations() {
    console.log('[TranslationRenderer] Refreshing CSS translations...');

    if (!this.translationStyleSheet) {
      console.log('[TranslationRenderer] No stylesheet found, initializing...');
      this.initializeCSSTranslationSystem();
    }

    // Rebuild all CSS rules
    let allCssRules = '';
    this.cssTranslations.forEach((data) => {
      const cssRule = `
        [data-ot-translation-id="${data.id}"] {
          position: relative !important;
        }

        [data-ot-translation-id="${data.id}"] * {
          visibility: hidden !important;
        }

        [data-ot-translation-id="${data.id}"]::before {
          content: "${this.escapeCSSContent(data.translation)}" !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          visibility: visible !important;
          color: inherit !important;
          background: transparent !important;
          font: inherit !important;
          line-height: inherit !important;
          text-align: inherit !important;
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          overflow: hidden !important;
          pointer-events: none !important;
          z-index: 1 !important;
        }
      `;
      allCssRules += cssRule;
    });

    this.translationStyleSheet.textContent = allCssRules;
    console.log('[TranslationRenderer] CSS translations refreshed, total rules:', this.cssTranslations.size);
  }

  /**
   * Remove all CSS-based translations and restore original appearance
   */
  removeCSSTranslations() {
    // Remove all translation attributes
    this.cssTranslations.forEach((_, element) => {
      element.removeAttribute('data-ot-translation-id');
    });

    // Clear the stylesheet
    if (this.translationStyleSheet) {
      this.translationStyleSheet.textContent = '';
    }

    // Clear translation data
    this.cssTranslations.clear();
    this.translatedElements.clear();
  }

  /**
   * Check if CSS-based translation is supported for this element
   */
  supportsCSSTranslation(element) {
    if (!element) return false;

    // CSS-based translation works best with block-level elements
    // or elements that can be positioned
    const computedStyle = window.getComputedStyle(element);
    const display = computedStyle.display;
    const position = computedStyle.position;

    // Works well with block, inline-block, and positioned elements
    return display !== 'none' &&
           (display.includes('block') ||
            display === 'inline-block' ||
            position !== 'static');
  }

  /**
   * Legacy method for special cases that still need DOM modification
   */
  legacyReplaceTextContent(textNode, translation) {
    const node = textNode.node;
    const parent = node.parentElement;

    // Skip if already processed to prevent duplicate translations
    if (this.translatedElements.has(node) || this.translatedElements.has(parent)) {
      return;
    }

    // Special handling for option elements in replace mode
    if (parent && parent.tagName && parent.tagName.toLowerCase() === 'option') {
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
    if (isExcludedElement(parent, [])) {
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

    if (!this.isSafeForTextReplacement(parent)) {
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

    // First, try to extract text content using DOM parsing
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = text;

      // Get text content and clean up extra whitespace
      let cleanText = tempDiv.textContent || tempDiv.innerText || '';

      // Remove excessive whitespace and normalize
      cleanText = cleanText.replace(/\s+/g, ' ').trim();

      return cleanText;
    } catch (error) {
      // Fallback: use regex to remove HTML tags
      return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  // 统一的安全检查配置
  static SECURITY_CONFIG = {
    DANGEROUS_ELEMENTS: [
      'button', 'input', 'select', 'textarea', 'form', 'script', 'style', 'iframe', 'object', 'embed'
    ],
    DANGEROUS_ATTRIBUTES: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset'],
    DANGEROUS_CLASS_PATTERNS: [
      /js-/, /react-/, /vue-/, /ng-/, /ember-/, /backbone-/,
      /component/, /widget/, /interactive/, /clickable/, /btn/, /button/,
      /header/, /nav/, /menu/, /toolbar/, /sidebar/
    ],
    // 完整的ARIA属性列表，用于无障碍功能检查
    SAFE_ARIA_ATTRIBUTES: [
      'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded', 'aria-hidden',
      'aria-live', 'aria-atomic', 'aria-relevant', 'aria-busy', 'aria-disabled',
      'aria-readonly', 'aria-required', 'aria-invalid', 'aria-checked', 'aria-selected',
      'aria-pressed', 'aria-level', 'aria-setsize', 'aria-posinset', 'aria-orientation',
      'aria-sort', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext',
      'role'
    ],
    // 危险的ARIA属性（可能影响功能）
    DANGEROUS_ARIA_ATTRIBUTES: [
      'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-flowto'
    ]
  };

  /**
   * 检查元素属性是否安全
   */
  _checkElementAttributes(element, allowDataAttributes, allowAriaAttributes) {
    for (const attr of element.attributes) {
      const attrName = attr.name;

      if (attrName.startsWith('on')) {
        return false;
      }

      if (attrName.startsWith('data-') && !allowDataAttributes) {
        return false;
      }

      if (attrName.startsWith('aria-') || attrName === 'role') {
        if (!allowAriaAttributes) {
          return false;
        }
        if (TranslationRenderer.SECURITY_CONFIG.DANGEROUS_ARIA_ATTRIBUTES.includes(attrName)) {
          return false;
        }
        if (!TranslationRenderer.SECURITY_CONFIG.SAFE_ARIA_ATTRIBUTES.includes(attrName)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 检查元素类名和ID是否安全
   */
  _checkElementIdentifiers(element) {
    const className = element.className || '';
    const id = element.id || '';

    return !TranslationRenderer.SECURITY_CONFIG.DANGEROUS_CLASS_PATTERNS.some(pattern =>
      pattern.test(className) || pattern.test(id)
    );
  }

  /**
   * 统一的安全检查方法
   */
  isSafeForReplacement(element, options = {}) {
    if (!element) return false;

    const {
      checkChildren = false,
      allowDataAttributes = false,
      allowAriaAttributes = true,
      checkInnerHTML = false
    } = options;

    // 检查元素标签
    const tagName = element.tagName.toLowerCase();
    if (TranslationRenderer.SECURITY_CONFIG.DANGEROUS_ELEMENTS.includes(tagName)) {
      return false;
    }

    // 检查危险的子元素
    if (checkInnerHTML) {
      const dangerousElements = element.querySelectorAll(
        TranslationRenderer.SECURITY_CONFIG.DANGEROUS_ELEMENTS.join(', ') +
        ', [onclick], [onload], [class*="js-"], [id*="js-"]'
      );
      if (dangerousElements.length > 0) {
        return false;
      }
    }

    // 检查属性
    if (!this._checkElementAttributes(element, allowDataAttributes, allowAriaAttributes)) {
      return false;
    }

    // 检查类名和ID
    if (!this._checkElementIdentifiers(element)) {
      return false;
    }

    // 检查是否有子元素
    if (checkChildren && element.children?.length > 0) {
      return false;
    }

    return true;
  }

  /**
   * 检查是否安全进行innerHTML替换
   */
  isSafeForInnerHTMLReplacement(container) {
    return this.isSafeForReplacement(container, {
      checkInnerHTML: true,
      allowDataAttributes: false,
      allowAriaAttributes: true
    });
  }

  /**
   * 检查是否安全进行文本替换
   */
  isSafeForTextReplacement(element) {
    return this.isSafeForReplacement(element, {
      checkChildren: true,
      allowDataAttributes: false,
      allowAriaAttributes: true
    });
  }

  replaceTextNodesInContainer(textNodes, translationText) {
    if (!textNodes || textNodes.length === 0) return;

    if (textNodes.length === 1) {
      const textNode = textNodes[0];
      if (textNode.node && textNode.node.nodeType === Node.TEXT_NODE) {
        textNode.node.textContent = translationText;
      }
      return;
    }

    const firstTextNode = textNodes[0];
    if (firstTextNode.node && firstTextNode.node.nodeType === Node.TEXT_NODE) {
      firstTextNode.node.textContent = translationText;
    }

    for (let i = 1; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      if (textNode.node && textNode.node.nodeType === Node.TEXT_NODE) {
        textNode.node.textContent = '';
      }
    }
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
        staleElements.push(element);
      }
    }

    staleElements.forEach(element => {
      this.translatedElements.delete(element);
    });

    // Clean up failed elements and retry queue
    this.cleanupFailedElements();

    this.lastCleanup = now;
  }

  /**
   * 清理失败元素追踪中的过期数据
   */
  cleanupFailedElements() {
    const staleElementIds = [];

    // 检查失败元素是否仍在DOM中
    for (const [elementId, failureInfo] of this.failedElements) {
      if (failureInfo.result && failureInfo.result.container) {
        if (!document.contains(failureInfo.result.container)) {
          staleElementIds.push(elementId);
        }
      }
    }

    // 移除过期的失败元素
    staleElementIds.forEach(elementId => {
      this.removeFailedElement(elementId);
    });

    // 清理超过最大重试次数的元素
    const expiredRetries = [];
    for (const [elementId, retryInfo] of this.retryQueue) {
      if (retryInfo.failureInfo.retryCount >= this.maxRetryAttempts) {
        expiredRetries.push(elementId);
      }
    }

    expiredRetries.forEach(elementId => {
      this.retryQueue.delete(elementId);
    });
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
    if (isExcludedElement(container, [])) {
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
   * Restore original text content (CSS-safe method)
   */
  restoreOriginalText() {
    // First, remove all CSS-based translations
    this.removeCSSTranslations();

    // Then handle any remaining DOM-based translations
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

    // Clear failure tracking data
    this.failedElements.clear();
    this.retryQueue.clear();
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
      hasOriginalTexts: this.originalTexts.size > 0,
      // 失败和重试统计
      failedElements: this.failedElements.size,
      retryQueueSize: this.retryQueue.size,
      retryableElements: this.getRetryableElements().length
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

  // Expose diagnostic methods globally for debugging
  window.diagnoseTranslation = function() {
    if (window.translationRenderer) {
      return window.translationRenderer.diagnoseTranslationSystem();
    } else {
      console.error('Translation renderer not found');
      return null;
    }
  };

  window.refreshTranslations = function() {
    if (window.translationRenderer) {
      return window.translationRenderer.refreshCSSTranslations();
    } else {
      console.error('Translation renderer not found');
      return null;
    }
  };

  window.checkTranslationElements = function() {
    const elements = document.querySelectorAll('[data-ot-translation-id]');
    console.log('Elements with translation IDs:', elements.length);
    elements.forEach((el, index) => {
      console.log(`Element ${index + 1}:`, {
        tag: el.tagName,
        id: el.id,
        className: el.className,
        translationId: el.getAttribute('data-ot-translation-id'),
        textContent: el.textContent.substring(0, 100) + '...'
      });
    });
    return elements;
  };
}
