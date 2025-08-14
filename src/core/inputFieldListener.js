/**
 * 文本框监听器 - 监听用户在文本框中的输入行为
 * 支持多种触发方式：快捷键组合、右键菜单等
 */
class InputFieldListener {
  constructor(options = {}) {
    this.options = {
      triggerKey: 'F2',           // 默认触发键
      ctrlKey: false,             // 是否需要Ctrl键
      altKey: false,              // 是否需要Alt键
      shiftKey: false,            // 是否需要Shift键
      debounceDelay: 300,         // 防抖延迟
      minTextLength: 2,           // 最小文本长度
      maxTextLength: 5000,        // 最大文本长度
      enableAnimation: true,      // 是否启用翻译动画
      autoDetectPageLanguage: true, // 自动检测页面语言
      defaultTargetLanguage: 'en', // 默认目标语言
      ...options
    };

    // 状态管理
    this.isEnabled = false;
    this.isTranslating = false;
    this.currentInputElement = null;
    this.translationService = null;
    this.debounceTimer = null;
    this.animationElement = null;
    this.pageLanguage = null;
    this.languageDetectionCache = new Map();

    // 绑定方法
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    // 支持的输入元素选择器
    this.inputSelectors = [
      'input[type="text"]',
      'input[type="search"]',
      'input[type="email"]',
      'input[type="url"]',
      'input:not([type])',
      'textarea',
      '[contenteditable="true"]',
      '[contenteditable=""]'
    ];

    // 语言检测正则表达式
    this.languagePatterns = {
      'zh': /[\u4e00-\u9fff\u3400-\u4dbf]/,
      'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
      'ko': /[\uac00-\ud7af]/,
      'ar': /[\u0600-\u06ff]/,
      'th': /[\u0e00-\u0e7f]/,
      'ru': /[\u0400-\u04ff]/,
      'en': /^[a-zA-Z\s\d\p{P}]+$/u
    };
  }

  /**
   * 初始化监听器
   */
  async initialize(translationService) {
    if (!translationService) {
      throw new Error('Translation service is required');
    }

    this.translationService = translationService;

    // 加载用户配置
    await this.loadUserSettings();

    // 检测页面语言
    await this.detectPageLanguage();

    this.enable();
  }

  /**
   * 加载用户设置
   */
  async loadUserSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'inputFieldTriggerKey',
        'inputFieldCtrlKey',
        'inputFieldAltKey',
        'inputFieldShiftKey',
        'autoDetectPageLanguage',
        'defaultTargetLanguage'
      ], (result) => {
        this.options.triggerKey = result.inputFieldTriggerKey || 'F2';
        this.options.ctrlKey = result.inputFieldCtrlKey || false;
        this.options.altKey = result.inputFieldAltKey || false;
        this.options.shiftKey = result.inputFieldShiftKey || false;
        this.options.autoDetectPageLanguage = result.autoDetectPageLanguage !== false;
        this.options.defaultTargetLanguage = result.defaultTargetLanguage || 'en';
        resolve();
      });
    });
  }

  /**
   * 启用监听器
   */
  enable() {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.attachEventListeners();
  }

  /**
   * 禁用监听器
   */
  disable() {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this.detachEventListeners();
    this.cleanup();
  }

  /**
   * 附加事件监听器
   */
  attachEventListeners() {
    // 使用事件委托监听所有输入元素
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('focus', this.handleFocus, true);
    document.addEventListener('blur', this.handleBlur, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('contextmenu', this.handleContextMenu, true);
  }

  /**
   * 移除事件监听器
   */
  detachEventListeners() {
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('focus', this.handleFocus, true);
    document.removeEventListener('blur', this.handleBlur, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('contextmenu', this.handleContextMenu, true);
  }

  /**
   * 处理键盘按下事件
   */
  handleKeyDown(event) {
    if (!this.isEnabled || this.isTranslating) return;

    // 检查是否是配置的触发键组合
    if (this.isValidInputElement(event.target) && this.isTriggerKeyPressed(event)) {
      event.preventDefault();
      this.triggerTranslation();
    }
  }

  /**
   * 检查是否按下了触发键组合
   */
  isTriggerKeyPressed(event) {
    const keyMatch = event.code === this.options.triggerKey || event.key === this.options.triggerKey;
    const ctrlMatch = event.ctrlKey === this.options.ctrlKey;
    const altMatch = event.altKey === this.options.altKey;
    const shiftMatch = event.shiftKey === this.options.shiftKey;

    return keyMatch && ctrlMatch && altMatch && shiftMatch;
  }

  /**
   * 处理输入框获得焦点
   */
  handleFocus(event) {
    if (this.isValidInputElement(event.target)) {
      this.currentInputElement = event.target;
    }
  }

  /**
   * 处理输入框失去焦点
   */
  handleBlur(event) {
    if (event.target === this.currentInputElement) {
      this.currentInputElement = null;
      this.hideAnimation();
    }
  }

  /**
   * 处理输入事件（防抖）
   */
  handleInput(event) {
    if (!this.isValidInputElement(event.target)) return;

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      // 可以在这里添加其他输入处理逻辑
    }, this.options.debounceDelay);
  }

  /**
   * 处理右键菜单事件
   */
  handleContextMenu(event) {
    if (this.isValidInputElement(event.target)) {
      this.currentInputElement = event.target;
      // 可以在这里添加自定义右键菜单项
    }
  }

  /**
   * 检查元素是否为有效的输入元素
   */
  isValidInputElement(element) {
    if (!element) return false;

    // 检查是否匹配支持的输入元素
    return this.inputSelectors.some(selector => {
      try {
        return element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * 检测页面语言
   */
  async detectPageLanguage() {
    if (!this.options.autoDetectPageLanguage) {
      this.pageLanguage = this.options.defaultTargetLanguage;
      return;
    }

    try {
      // 检查缓存
      const url = window.location.hostname;
      if (this.languageDetectionCache.has(url)) {
        this.pageLanguage = this.languageDetectionCache.get(url);
        return;
      }

      // 检测方法1: HTML lang属性
      const htmlLang = document.documentElement.lang;
      if (htmlLang && htmlLang.length >= 2) {
        const detectedLang = this.normalizeLanguageCode(htmlLang);
        this.pageLanguage = detectedLang;
        this.languageDetectionCache.set(url, detectedLang);
        return;
      }

      // 检测方法2: 分析页面文本内容
      const pageText = this.extractPageText();
      const detectedLang = this.detectTextLanguage(pageText);

      this.pageLanguage = detectedLang || this.options.defaultTargetLanguage;
      this.languageDetectionCache.set(url, this.pageLanguage);

    } catch (error) {
      console.warn('Page language detection failed:', error);
      this.pageLanguage = this.options.defaultTargetLanguage;
    }
  }

  /**
   * 提取页面文本用于语言检测
   */
  extractPageText() {
    const textElements = document.querySelectorAll('h1, h2, h3, p, title, meta[name="description"]');
    let text = '';

    textElements.forEach(el => {
      if (el.tagName === 'META') {
        text += el.getAttribute('content') + ' ';
      } else {
        text += el.textContent + ' ';
      }
    });

    return text.substring(0, 1000); // 限制文本长度
  }

  /**
   * 检测文本语言
   */
  detectTextLanguage(text) {
    if (!text || text.trim().length < 10) return null;

    const scores = {};

    // 计算各语言的匹配分数
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      const matches = text.match(pattern);
      if (matches) {
        scores[lang] = matches.length;
      }
    }

    // 找到得分最高的语言
    let maxScore = 0;
    let detectedLang = null;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    return this.normalizeLanguageCode(detectedLang);
  }

  /**
   * 标准化语言代码
   */
  normalizeLanguageCode(langCode) {
    if (!langCode) return null;

    const code = langCode.toLowerCase().substring(0, 2);
    const mapping = {
      'zh': 'zh-CN',
      'ja': 'ja',
      'ko': 'ko',
      'en': 'en',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'ru': 'ru',
      'ar': 'ar',
      'th': 'th'
    };

    return mapping[code] || code;
  }

  /**
   * 触发翻译功能
   */
  async triggerTranslation() {
    if (!this.currentInputElement || this.isTranslating) return;

    const text = this.getInputText(this.currentInputElement);

    // 验证文本内容
    if (!this.isValidText(text)) {
      return;
    }

    try {
      this.isTranslating = true;

      // 显示翻译动画
      this.showTranslationAnimation();

      // 智能选择目标语言并翻译
      const translation = await this.translateTextWithSmartLanguage(text);

      // 显示翻译结果
      this.showTranslationResult(translation, text);

    } catch (error) {
      this.showTranslationError(error.message);
    } finally {
      this.isTranslating = false;
    }
  }

  /**
   * 智能语言翻译
   */
  async translateTextWithSmartLanguage(text) {
    if (!this.translationService) {
      throw new Error('Translation service not available');
    }

    // 检测输入文本的语言
    const inputLanguage = this.detectTextLanguage(text);

    // 确定目标语言
    const targetLanguage = this.determineTargetLanguage(inputLanguage);

    return await this.translationService.translateText(
      text.trim(),
      targetLanguage,
      'auto',
      {
        context: 'input-field',
        inputLanguage: inputLanguage,
        pageLanguage: this.pageLanguage
      }
    );
  }

  /**
   * 确定目标语言
   */
  determineTargetLanguage(inputLanguage) {
    // 如果没有检测到输入语言，使用页面语言或默认语言
    if (!inputLanguage) {
      return this.pageLanguage || this.options.defaultTargetLanguage;
    }

    // 如果启用了页面语言检测
    if (this.options.autoDetectPageLanguage && this.pageLanguage) {
      // 如果输入语言与页面语言不同，翻译到页面语言
      if (inputLanguage !== this.pageLanguage) {
        return this.pageLanguage;
      }
    }

    // 如果输入语言与页面语言相同，或者没有页面语言，使用默认目标语言
    return this.options.defaultTargetLanguage;
  }

  /**
   * 获取输入元素的文本内容
   */
  getInputText(element) {
    if (element.contentEditable === 'true' || element.contentEditable === '') {
      return element.textContent || element.innerText || '';
    }
    return element.value || '';
  }

  /**
   * 验证文本是否有效
   */
  isValidText(text) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmedText = text.trim();
    return trimmedText.length >= this.options.minTextLength && 
           trimmedText.length <= this.options.maxTextLength;
  }

  /**
   * 更新用户设置
   */
  async updateSettings(newSettings) {
    Object.assign(this.options, newSettings);

    // 重新检测页面语言（如果设置改变了）
    if (newSettings.autoDetectPageLanguage !== undefined ||
        newSettings.defaultTargetLanguage !== undefined) {
      await this.detectPageLanguage();
    }
  }

  /**
   * 显示翻译动画
   */
  showTranslationAnimation() {
    if (!this.options.enableAnimation || !this.currentInputElement) return;

    this.hideAnimation();

    const rect = this.currentInputElement.getBoundingClientRect();
    this.animationElement = document.createElement('div');
    this.animationElement.className = 'ot-input-translation-loading';
    this.animationElement.innerHTML = `
      <div class="ot-loading-spinner"></div>
      <span class="ot-loading-text">翻译中...</span>
    `;

    // 设置动画元素位置
    Object.assign(this.animationElement.style, {
      position: 'fixed',
      top: `${rect.bottom + 5}px`,
      left: `${rect.left}px`,
      zIndex: '10000',
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '8px 12px',
      fontSize: '12px',
      color: '#666',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    });

    document.body.appendChild(this.animationElement);
    this.injectAnimationStyles();
  }

  /**
   * 注入动画样式
   */
  injectAnimationStyles() {
    if (document.getElementById('ot-input-animation-styles')) return;

    const style = document.createElement('style');
    style.id = 'ot-input-animation-styles';
    style.textContent = `
      .ot-loading-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #007bff;
        border-radius: 50%;
        animation: ot-spin 1s linear infinite;
      }
      
      @keyframes ot-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .ot-input-translation-result {
        max-width: 300px;
        word-wrap: break-word;
        line-height: 1.4;
      }
      
      .ot-translation-actions {
        margin-top: 8px;
        display: flex;
        gap: 8px;
      }
      
      .ot-translation-btn {
        padding: 4px 8px;
        border: 1px solid #ddd;
        background: #f8f9fa;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        color: #666;
      }
      
      .ot-translation-btn:hover {
        background: #e9ecef;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 显示翻译结果
   */
  showTranslationResult(translation, originalText) {
    if (!this.currentInputElement) return;

    this.hideAnimation();

    const rect = this.currentInputElement.getBoundingClientRect();
    this.animationElement = document.createElement('div');
    this.animationElement.className = 'ot-input-translation-result';
    this.animationElement.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; color: #333;">翻译结果：</div>
      <div style="color: #555;">${this.escapeHtml(translation)}</div>
      <div class="ot-translation-actions">
        <button class="ot-translation-btn" data-action="copy">复制</button>
        <button class="ot-translation-btn" data-action="replace">替换</button>
        <button class="ot-translation-btn" data-action="close">关闭</button>
      </div>
    `;

    Object.assign(this.animationElement.style, {
      position: 'fixed',
      top: `${rect.bottom + 5}px`,
      left: `${rect.left}px`,
      zIndex: '10000',
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '12px',
      fontSize: '13px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      maxWidth: '300px'
    });

    // 添加按钮事件监听
    this.animationElement.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'copy') {
        this.copyToClipboard(translation);
      } else if (action === 'replace') {
        this.replaceInputText(translation);
        this.hideAnimation();
      } else if (action === 'close') {
        this.hideAnimation();
      }
    });

    document.body.appendChild(this.animationElement);

    // 5秒后自动隐藏
    setTimeout(() => this.hideAnimation(), 5000);
  }

  /**
   * 显示翻译错误
   */
  showTranslationError(errorMessage) {
    if (!this.currentInputElement) return;

    this.hideAnimation();

    const rect = this.currentInputElement.getBoundingClientRect();
    this.animationElement = document.createElement('div');
    this.animationElement.innerHTML = `
      <div style="color: #dc3545;">翻译失败：${this.escapeHtml(errorMessage)}</div>
    `;

    Object.assign(this.animationElement.style, {
      position: 'fixed',
      top: `${rect.bottom + 5}px`,
      left: `${rect.left}px`,
      zIndex: '10000',
      background: '#fff',
      border: '1px solid #dc3545',
      borderRadius: '4px',
      padding: '8px 12px',
      fontSize: '12px',
      color: '#dc3545',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    });

    document.body.appendChild(this.animationElement);

    // 3秒后自动隐藏
    setTimeout(() => this.hideAnimation(), 3000);
  }

  /**
   * 隐藏动画元素
   */
  hideAnimation() {
    if (this.animationElement) {
      this.animationElement.remove();
      this.animationElement = null;
    }
  }

  /**
   * 复制文本到剪贴板
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showBriefMessage('已复制到剪贴板');
    } catch (error) {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showBriefMessage('已复制到剪贴板');
    }
  }

  /**
   * 替换输入框文本
   */
  replaceInputText(newText) {
    if (!this.currentInputElement) return;

    if (this.currentInputElement.contentEditable === 'true' || 
        this.currentInputElement.contentEditable === '') {
      this.currentInputElement.textContent = newText;
    } else {
      this.currentInputElement.value = newText;
    }

    // 触发input事件
    this.currentInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    this.showBriefMessage('文本已替换');
  }

  /**
   * 显示简短消息
   */
  showBriefMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    Object.assign(messageEl.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '10001',
      background: '#28a745',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: '4px',
      fontSize: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    });

    document.body.appendChild(messageEl);
    setTimeout(() => messageEl.remove(), 2000);
  }

  /**
   * HTML转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.hideAnimation();
    this.currentInputElement = null;
    this.languageDetectionCache.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * 获取监听器状态
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isTranslating: this.isTranslating,
      currentInputElement: !!this.currentInputElement,
      pageLanguage: this.pageLanguage,
      triggerKey: this.options.triggerKey,
      autoDetectPageLanguage: this.options.autoDetectPageLanguage,
      defaultTargetLanguage: this.options.defaultTargetLanguage
    };
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputFieldListener;
} else if (typeof window !== 'undefined') {
  window.InputFieldListener = InputFieldListener;
}
