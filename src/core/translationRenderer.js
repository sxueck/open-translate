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
  renderSingleResult(result, mode = 'paragraph-bilingual') {
    if (!result.success || !result.textNodes) {
      return;
    }

    try {
      const actualMode = mode || this.translationMode || 'paragraph-bilingual';

      if (actualMode === 'replace') {
        result.textNodes.forEach(textNode => {
          // Additional validation before processing
          if (textNode.node && textNode.node.parentElement) {
            this.replaceTextContent(textNode, result.translation);
          }
        });
      } else if (actualMode === 'paragraph-bilingual') {
        this.ensureBilingualStyles();
        this.createParagraphBilingualDisplay(result);
      }

    } catch (error) {
      console.error('Failed to render single result:', error);
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
    console.log(`Memory cleanup completed. Removed ${staleNodes.length} stale nodes and ${staleElements.length} stale elements.`);
  }

  /**
   * Create paragraph-level bilingual display (new feature)
   */
  createParagraphBilingualDisplay(result) {
    const container = result.container;

    // Skip if already processed - 更严格的检查
    if (container.classList.contains('ot-paragraph-bilingual') ||
        container.querySelector('.ot-paragraph-bilingual') ||
        this.translatedElements.has(container)) {
      console.log('Skipping already translated container:', container);
      return;
    }

    // 检查容器内是否已有翻译内容
    if (container.querySelector('.ot-paragraph-translated')) {
      console.log('Container already has bilingual content:', container);
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
    translatedSection.textContent = result.translation;
    translatedSection.setAttribute('lang', 'zh-CN');

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
   * Inject CSS styles for bilingual mode
   */
  injectBilingualStyles() {
    const styleId = 'open-translate-bilingual-styles';
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



      .ot-paragraph-translated {
        margin-top: 4px;
        padding: 0;
        color: inherit;
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        font-style: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        text-decoration: inherit;
      }


      /* Responsive adjustments*/
      @media (max-width: 768px) {
        .ot-paragraph-bilingual {
          margin: 0;
          padding: 0;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Restore original text content
   */
  restoreOriginalText() {
    // Remove translation content from bilingual containers and restore original state
    document.querySelectorAll('.ot-paragraph-bilingual').forEach(container => {
      // 移除翻译内容
      const translatedSection = container.querySelector('.ot-paragraph-translated');
      if (translatedSection) {
        translatedSection.remove();
      }

      // 移除双语标记和属性
      container.classList.remove('ot-paragraph-bilingual');
      container.removeAttribute('data-original-lang');
      container.removeAttribute('data-translated-lang');
      container.removeAttribute('aria-label');
      container.removeAttribute('role');
    });

    // Restore replaced text nodes
    this.originalTexts.forEach((originalText, node) => {
      if (node.parentElement && typeof originalText === 'string') {
        node.textContent = originalText;
      }
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
    if (this.translationMode === newMode) return;

    // Restore original state first
    this.restoreOriginalText();
    
    // Set new mode
    this.setMode(newMode);
    
    // Re-render with new mode
    if (newMode === 'replace') {
      this.renderReplaceMode(textNodes, translations);
    } else if (newMode === 'paragraph-bilingual') {
      console.log('Switching to paragraph-bilingual mode requires re-translation');
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
   * Detect site styles for better integration
   */
  detectSiteStyles() {
    const body = document.body;
    const computedStyle = window.getComputedStyle(body);

    return {
      backgroundColor: computedStyle.backgroundColor,
      color: computedStyle.color,
      fontFamily: computedStyle.fontFamily,
      fontSize: computedStyle.fontSize,
      lineHeight: computedStyle.lineHeight
    };
  }



  /**
   * Generate adaptive styles
   */
  generateAdaptiveStyles() {
    return `
      /* 双语对照样式 */
    `;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationRenderer;
} else if (typeof window !== 'undefined') {
  window.TranslationRenderer = TranslationRenderer;
}
