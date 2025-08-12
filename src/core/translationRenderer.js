/**
 * Translation rendering and DOM manipulation
 */
class TranslationRenderer {
  constructor() {
    this.translationMode = 'replace'; // 'replace' or 'bilingual'
    this.originalTexts = new Map();
    this.translatedElements = new Set();
    this.styleInjected = false;

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
    if (!['replace', 'paragraph-bilingual'].includes(mode)) {
      this.translationMode = 'replace';
      return;
    }

    this.translationMode = mode;
  }

  /**
   * Render translations in replace mode
   */
  renderReplaceMode(textNodes, translations) {
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

    try {
      // 优先使用传入的模式，否则使用当前设置的模式
      const actualMode = mode !== null ? mode : this.translationMode;

      // 确保模式有效，默认使用替换模式以保持向后兼容
      const validMode = ['replace', 'paragraph-bilingual'].includes(actualMode)
        ? actualMode
        : 'replace';

      if (validMode === 'replace') {
        result.textNodes.forEach(textNode => {
          // Additional validation before processing
          if (textNode.node && textNode.node.parentElement) {
            this.replaceTextContent(textNode, result.translation);
          }
        });
      } else if (validMode === 'paragraph-bilingual') {
        this.ensureBilingualStyles();
        this.createParagraphBilingualDisplay(result);
      }

    } catch (error) {
    }
  }
  /**
   * Ensure bilingual styles are injected
   */
  ensureBilingualStyles() {
    if (!this.styleInjected || !document.getElementById(CSS_CLASSES.STYLE_ID)) {
      this.injectBilingualStyles();
      this.styleInjected = true;
    }
  }

  /**
   * Replace text content directly (with memory management)
   */
  replaceTextContent(textNode, translation) {
    const node = textNode.node;
    const parent = node.parentElement;

    // Skip if already processed or if node is in a bilingual container
    if (this.translatedElements.has(parent) ||
        parent.classList.contains('ot-bilingual-container') ||
        parent.querySelector('.ot-bilingual-container')) {
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

    // Store original text for restoration
    if (!this.originalTexts.has(node)) {
      this.originalTexts.set(node, node.textContent);

      // Trigger cleanup if cache is getting too large
      if (this.originalTexts.size > this.maxCacheSize) {
        this.performMemoryCleanup();
      }
    }

    // Replace text content
    node.textContent = translation;
    this.translatedElements.add(parent);
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

    // Create translated content section only
    const translatedSection = document.createElement('div');
    translatedSection.className = 'ot-paragraph-translated';

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

    // Add accessibility support
    container.setAttribute('aria-label', `Original: ${originalText}. Translation: ${result.translation}`);
    container.setAttribute('role', 'group');

    // 在原文后面直接添加翻译内容，不修改原文
    container.appendChild(translatedSection);

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
    const dangerousElements = tempDiv.querySelectorAll('script, style, iframe, object, embed');
    dangerousElements.forEach(el => el.remove());

    // Remove dangerous attributes
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
      const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];
      dangerousAttrs.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });

      // Remove javascript: links
      if (el.hasAttribute('href') && el.getAttribute('href').startsWith('javascript:')) {
        el.removeAttribute('href');
      }
    });

    return tempDiv.innerHTML;
  }

  /**
   * Inject CSS styles for bilingual mode
   */
  injectBilingualStyles() {
    const styleId = CSS_CLASSES.STYLE_ID;
    if (document.getElementById(styleId)) return;

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

      /* 译文样式 - 使用无衬线字体和优化间距 */
      .ot-paragraph-translated {
        margin-top: 8px;
        padding: 0;
        color: inherit;
        font-family: BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans';
        font-size: inherit;
        font-weight: 350;
        font-style: normal;
        line-height: 1.6;
        letter-spacing: 0.02em;
        text-decoration: inherit;
        opacity: 0.92;
      }

      /* 原文样式调整 - 保持原有字体但优化间距 */
      .ot-paragraph-bilingual:not(.ot-paragraph-translated) {
        line-height: 1.5;
        margin-bottom: 2px;
      }

      /* 响应式调整 */
      @media (max-width: 768px) {
        .ot-paragraph-bilingual {
          margin: 0;
          padding: 0;
        }

        .ot-paragraph-translated {
          margin-top: 8px;
          line-height: 1.5;
          font-size: 0.95em;
          font-weight: 350;
        }
      }

      @media (max-width: 480px) {
        .ot-paragraph-translated {
          margin-top: 4px;
          line-height: 1.45;
          font-size: 0.9em;
        }
      }

      /* 深色模式适配 */
      @media (prefers-color-scheme: dark) {
        .ot-paragraph-translated {
          opacity: 0.95;
        }
      }

      /* 高对比度模式适配 */
      @media (prefers-contrast: high) {
        .ot-paragraph-translated {
          opacity: 1;
          font-weight: 350;
        }
      }

      /* 仅显示原文模式 */
      .ot-paragraph-bilingual.ot-original-only .ot-paragraph-translated {
        display: none !important;
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
        } else if (typeof originalContent === 'string') {
          // Restore text content for text nodes
          element.textContent = originalContent;
        }
      }
    });

    // Remove any remaining bilingual containers that might not have been tracked
    document.querySelectorAll('.ot-paragraph-bilingual').forEach(container => {
      const translatedSection = container.querySelector('.ot-paragraph-translated');
      if (translatedSection) {
        translatedSection.remove();
      }

      // Remove bilingual classes and attributes
      container.classList.remove('ot-paragraph-bilingual');
      container.removeAttribute('data-original-lang');
      container.removeAttribute('data-translated-lang');
      container.removeAttribute('aria-label');
      container.removeAttribute('role');
    });

    // Clear tracking data
    this.originalTexts.clear();
    this.translatedElements.clear();

    // Remove injected styles
    const style = document.getElementById('open-translate-bilingual-styles');
    if (style) {
      style.remove();
      this.styleInjected = false;
    }
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
  }

  /**
   * Check if page has been translated
   */
  isTranslated() {
    return this.translatedElements.size > 0 ||
           document.querySelectorAll('.ot-paragraph-bilingual').length > 0;
  }

  /**
   * Get translation statistics
   */
  getTranslationStats() {
    return {
      translatedElements: this.translatedElements.size,
      paragraphBilingualContainers: document.querySelectorAll('.ot-paragraph-bilingual').length,
      mode: this.translationMode,
      hasOriginalTexts: this.originalTexts.size > 0
    };
  }

  /**
   * Update translation mode and re-render if needed
   */
  async switchMode(newMode, textNodes, translations) {
    // 验证新模式的有效性
    if (!['replace', 'paragraph-bilingual'].includes(newMode)) {
      return;
    }

    // 如果模式相同，无需切换
    if (this.translationMode === newMode) {
      return;
    }

    const oldMode = this.translationMode;

    // 先恢复原始状态
    this.restoreOriginalText();

    // 设置新模式
    this.setMode(newMode);

    // 根据新模式重新渲染
    if (newMode === 'replace' && textNodes && translations) {
      this.renderReplaceMode(textNodes, translations);
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
             !mutation.target.parentElement.closest('.ot-bilingual-container');
    }
    
    if (mutation.type === 'childList') {
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

      /* 译文字体优化 - 根据检测到的语言环境选择最佳无衬线字体 */
      .ot-paragraph-translated {
        font-family: ${this.getOptimalSansSerifFont()};
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
    // 简单的亮度检测
    const bgColor = siteStyles.backgroundColor;
    let isDark = false;

    if (bgColor && bgColor !== 'transparent') {
      // 简化的亮度检测
      isDark = bgColor.includes('rgb') &&
               (bgColor.includes('0, 0, 0') ||
                bgColor.includes('rgba(0, 0, 0') ||
                bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/) &&
                bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)[1] < 128);
    }

    return `
      .ot-paragraph-translated {
        opacity: ${isDark ? '0.95' : '0.92'};
      }
    `;
  }

  /**
   * 生成间距调整样式
   */
  generateSpacingAdjustments(siteStyles) {
    const fontSize = siteStyles.fontSize;
    let marginTop = '8px';
    let lineHeight = '1.6';

    if (fontSize) {
      const size = parseFloat(fontSize);
      if (size <= 12) {
        marginTop = '6px';
        lineHeight = '1.5';
      } else if (size >= 18) {
        marginTop = '10px';
        lineHeight = '1.65';
      }
    }

    return `
      .ot-paragraph-translated {
        margin-top: ${marginTop};
        line-height: ${lineHeight};
      }
    `;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationRenderer;
} else if (typeof window !== 'undefined') {
  window.TranslationRenderer = TranslationRenderer;
}
