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
      'input[type="url"]',
      'input[type="tel"]',
      'input:not([type])',
      'textarea',
      '[contenteditable="true"]',
      '[contenteditable=""]',
      '[role="textbox"]',
      '[role="searchbox"]',
      '[role="combobox"]',
      'div[contenteditable]',
      'span[contenteditable]',
      'p[contenteditable]'
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
    console.log('[InputFieldListener] Initializing input field listener...');

    if (!translationService) {
      throw new Error('Translation service is required');
    }

    this.translationService = translationService;
    console.log('[InputFieldListener] Translation service assigned');

    // 验证翻译服务配置
    await this.validateTranslationService();

    // 加载用户配置
    await this.loadUserSettings();
    console.log('[InputFieldListener] User settings loaded');

    // 检测页面语言
    await this.detectPageLanguage();
    console.log('[InputFieldListener] Page language detected:', this.pageLanguage);

    this.enable();
    console.log('[InputFieldListener] Input field listener enabled');
  }

  /**
   * 验证翻译服务配置
   */
  async validateTranslationService() {
    console.log('[InputFieldListener] Validating translation service...');

    if (!this.translationService) {
      throw new Error('Translation service not available');
    }

    // 检查翻译服务是否已初始化
    if (!this.translationService.config) {
      console.warn('[InputFieldListener] Translation service config not found, attempting to initialize...');
      try {
        await this.translationService.initialize();
      } catch (error) {
        console.error('[InputFieldListener] Failed to initialize translation service:', error);
        throw new Error('Failed to initialize translation service: ' + error.message);
      }
    }

    // 检查 API 密钥
    if (!this.translationService.config.apiKey) {
      throw new Error('API key not configured. Please set up your API key in the extension settings.');
    }

    // 检查 API URL
    if (!this.translationService.config.apiUrl) {
      throw new Error('API URL not configured. Please check your extension settings.');
    }

    console.log('[InputFieldListener] Translation service validation passed:', {
      hasApiKey: !!this.translationService.config.apiKey,
      apiUrl: this.translationService.config.apiUrl,
      model: this.translationService.config.model
    });
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
    // 使用事件委托监听所有输入元素，同时在捕获和冒泡阶段都监听
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('keydown', this.handleKeyDown, false);
    document.addEventListener('focus', this.handleFocus, true);
    document.addEventListener('blur', this.handleBlur, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('contextmenu', this.handleContextMenu, true);

    // 额外监听 window 级别的键盘事件，确保不会遗漏
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  /**
   * 移除事件监听器
   */
  detachEventListeners() {
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('keydown', this.handleKeyDown, false);
    document.removeEventListener('focus', this.handleFocus, true);
    document.removeEventListener('blur', this.handleBlur, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('contextmenu', this.handleContextMenu, true);

    // 移除 window 级别的监听器
    window.removeEventListener('keydown', this.handleKeyDown, true);
  }

  /**
   * 处理键盘按下事件
   */
  handleKeyDown(event) {
    if (!this.isEnabled || this.isTranslating) return;

    // 检查是否按下了触发键组合
    if (this.isTriggerKeyPressed(event)) {
      // 获取当前焦点元素或事件目标
      const targetElement = document.activeElement || event.target;

      // 检查是否为有效的输入元素
      if (this.isValidInputElement(targetElement)) {
        event.preventDefault();
        event.stopPropagation();

        // 更新当前输入元素
        this.currentInputElement = targetElement;

        // 触发翻译
        this.triggerTranslation();
      }
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
      console.log('[InputFieldListener] Input element lost focus:', {
        isTranslating: this.isTranslating
      });

      // 如果正在翻译，不要清除当前输入元素和隐藏动画
      // 让翻译完成后再处理
      if (!this.isTranslating) {
        this.currentInputElement = null;
        this.hideAnimation();
      }
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
    const matchesSelector = this.inputSelectors.some(selector => {
      try {
        return element.matches(selector);
      } catch (e) {
        return false;
      }
    });

    if (matchesSelector) return true;

    // 额外检查：特殊情况处理
    // 1. 检查是否为可编辑元素
    if (element.isContentEditable) return true;

    // 2. 检查是否为 Google 搜索框等特殊输入框
    if (this.isSpecialInputElement(element)) return true;

    // 3. 检查父元素是否为输入容器
    if (this.isInputContainer(element)) return true;

    return false;
  }

  /**
   * 检查是否为特殊输入元素（如 Google 搜索框）
   */
  isSpecialInputElement(element) {
    // Google 搜索框
    if (element.name === 'q' || element.getAttribute('aria-label')?.includes('搜索') ||
        element.getAttribute('aria-label')?.includes('Search')) {
      return true;
    }

    // 检查 class 名称中是否包含输入相关关键词
    const className = element.className || '';
    const inputKeywords = ['search', 'input', 'textbox', 'field', 'query'];
    if (inputKeywords.some(keyword => className.toLowerCase().includes(keyword))) {
      return true;
    }

    // 检查 id 中是否包含输入相关关键词
    const id = element.id || '';
    if (inputKeywords.some(keyword => id.toLowerCase().includes(keyword))) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否为输入容器的子元素
   */
  isInputContainer(element) {
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 3;

    while (parent && depth < maxDepth) {
      // 检查父元素是否为输入容器
      if (parent.matches && this.inputSelectors.some(selector => {
        try {
          return parent.matches(selector);
        } catch (e) {
          return false;
        }
      })) {
        return true;
      }

      // 检查父元素的 role 属性
      const role = parent.getAttribute('role');
      if (role && ['textbox', 'searchbox', 'combobox'].includes(role)) {
        return true;
      }

      parent = parent.parentElement;
      depth++;
    }

    return false;
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
    if (!text || text.trim().length < 20) return null;

    const trimmedText = text.trim();
    const scores = {};
    const totalChars = trimmedText.length;

    // 计算各语言的匹配分数
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      const matches = trimmedText.match(new RegExp(pattern.source, 'g'));
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

    // 设置最低匹配阈值：至少需要有10个特征字符，或者匹配度超过40%
    const minRequiredMatches = Math.max(10, Math.floor(totalChars * 0.4));

    if (maxScore < minRequiredMatches) {
      console.log('[InputFieldListener] Language detection failed: insufficient matches', {
        maxScore,
        minRequiredMatches,
        textLength: totalChars,
        text: trimmedText.substring(0, 50) + '...'
      });
      return null;
    }

    console.log('[InputFieldListener] Language detected:', {
      detectedLang,
      maxScore,
      minRequiredMatches,
      textLength: totalChars
    });

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
      console.log('[InputFieldListener] Text validation failed:', { text, length: text?.length });
      return;
    }

    console.log('[InputFieldListener] Starting translation:', { text: text.substring(0, 50) + '...', length: text.length });

    try {
      this.isTranslating = true;

      // 显示翻译动画
      this.showTranslationAnimation();

      // 检查翻译服务状态
      if (!this.translationService) {
        throw new Error('Translation service not initialized');
      }

      console.log('[InputFieldListener] Translation service available, starting translation...');

      // 智能选择目标语言并翻译
      const translation = await this.translateTextWithSmartLanguage(text);

      console.log('[InputFieldListener] Translation completed:', {
        originalLength: text.length,
        translationLength: translation?.length,
        translation: translation?.substring(0, 100) + '...'
      });

      // 显示翻译结果
      this.showTranslationResult(translation);

    } catch (error) {
      console.error('[InputFieldListener] Translation failed:', error);
      console.error('[InputFieldListener] Error details:', {
        message: error.message,
        stack: error.stack,
        translationServiceAvailable: !!this.translationService,
        currentInputElement: !!this.currentInputElement
      });
      this.showTranslationError(error.message);
    } finally {
      this.isTranslating = false;
      console.log('[InputFieldListener] Translation process completed');

      // 如果输入框已经失去焦点，现在可以安全地清理了
      if (this.currentInputElement && document.activeElement !== this.currentInputElement) {
        console.log('[InputFieldListener] Cleaning up after translation completion - input lost focus');
        this.currentInputElement = null;
        this.hideAnimation();
      }
    }
  }

  /**
   * 智能语言翻译
   */
  async translateTextWithSmartLanguage(text) {
    if (!this.translationService) {
      throw new Error('Translation service not available');
    }

    console.log('[InputFieldListener] Starting smart language translation...', {
      textLength: text.length,
      textPreview: text.substring(0, 50) + '...'
    });

    // 检测输入文本的语言
    const inputLanguage = this.detectTextLanguage(text);
    console.log('[InputFieldListener] Detected input language:', inputLanguage);

    // 确定目标语言
    const targetLanguage = this.determineTargetLanguage(inputLanguage);
    console.log('[InputFieldListener] Target language determined:', targetLanguage);

    // 验证翻译参数
    if (!targetLanguage) {
      throw new Error('Unable to determine target language');
    }

    // 如果检测到的输入语言与目标语言相同，可能不需要翻译
    if (inputLanguage && inputLanguage === targetLanguage) {
      console.log('[InputFieldListener] Input and target languages are the same, skipping translation');
      return text.trim();
    }

    const translationOptions = {
      context: 'input-field',
      inputLanguage: inputLanguage || 'auto',
      pageLanguage: this.pageLanguage
    };

    console.log('[InputFieldListener] Translation options:', translationOptions);

    try {
      const result = await this.translationService.translateText(
        text.trim(),
        targetLanguage,
        inputLanguage || 'auto',
        translationOptions
      );

      console.log('[InputFieldListener] Translation service returned result:', {
        hasResult: !!result,
        resultType: typeof result,
        resultLength: result?.length
      });

      return result;
    } catch (error) {
      console.error('[InputFieldListener] Translation service error:', error);
      throw error;
    }
  }

  /**
   * 确定目标语言
   */
  determineTargetLanguage(inputLanguage) {
    console.log('[InputFieldListener] Determining target language:', {
      inputLanguage,
      pageLanguage: this.pageLanguage,
      autoDetectPageLanguage: this.options.autoDetectPageLanguage,
      defaultTargetLanguage: this.options.defaultTargetLanguage
    });

    // 如果没有检测到输入语言，使用智能默认策略
    if (!inputLanguage) {
      // 优先使用页面语言，但要确保不是 'auto'
      if (this.pageLanguage && this.pageLanguage !== 'auto') {
        console.log('[InputFieldListener] Using page language as target:', this.pageLanguage);
        return this.pageLanguage;
      }

      // 否则使用默认目标语言
      console.log('[InputFieldListener] Using default target language:', this.options.defaultTargetLanguage);
      return this.options.defaultTargetLanguage;
    }

    // 如果启用了页面语言检测且页面语言有效
    if (this.options.autoDetectPageLanguage && this.pageLanguage && this.pageLanguage !== 'auto') {
      // 如果输入语言与页面语言不同，翻译到页面语言
      if (inputLanguage !== this.pageLanguage) {
        console.log('[InputFieldListener] Translating to page language:', this.pageLanguage);
        return this.pageLanguage;
      }
    }

    // 如果输入语言与页面语言相同，或者没有有效的页面语言，使用默认目标语言
    console.log('[InputFieldListener] Using default target language (fallback):', this.options.defaultTargetLanguage);
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
    console.log('[InputFieldListener] Showing translation animation:', {
      enableAnimation: this.options.enableAnimation,
      hasCurrentInputElement: !!this.currentInputElement
    });

    if (!this.options.enableAnimation || !this.currentInputElement) {
      console.warn('[InputFieldListener] Cannot show animation: animation disabled or no input element');
      return;
    }

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
    console.log('[InputFieldListener] Translation animation UI element added to DOM');

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
   * 显示翻译结果 - 直接替换模式
   */
  showTranslationResult(translation) {
    console.log('[InputFieldListener] Showing translation result:', {
      hasTranslation: !!translation,
      translationLength: translation?.length,
      hasCurrentInputElement: !!this.currentInputElement
    });

    if (!this.currentInputElement) {
      console.warn('[InputFieldListener] Cannot show translation result: no current input element');
      this.hideAnimation();
      return;
    }

    if (!translation || translation.trim() === '') {
      console.warn('[InputFieldListener] Empty translation result received');
      this.showTranslationError('翻译结果为空');
      return;
    }

    try {
      // 隐藏翻译动画
      this.hideAnimation();

      // 直接替换输入框文本
      this.replaceInputText(translation);

      // 显示简短的成功提示
      this.showBriefMessage('文本已翻译并替换');

      console.log('[InputFieldListener] Text replaced directly with translation');
    } catch (error) {
      console.error('[InputFieldListener] Failed to replace text:', error);
      this.hideAnimation();
      this.showBriefMessage('文本替换失败');
    }
  }

  /**
   * 显示翻译错误
   */
  showTranslationError(errorMessage) {
    console.log('[InputFieldListener] Showing translation error:', {
      errorMessage,
      hasCurrentInputElement: !!this.currentInputElement
    });

    if (!this.currentInputElement) {
      console.warn('[InputFieldListener] Cannot show translation error: no current input element');
      return;
    }

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
    console.log('[InputFieldListener] Translation error UI element added to DOM');

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

    const element = this.currentInputElement;

    try {

      // 处理不同类型的输入元素
      if (element.isContentEditable || element.contentEditable === 'true' || element.contentEditable === '') {
        // 可编辑内容元素
        this.replaceContentEditableText(element, newText);
      } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        // 标准输入框和文本域
        this.replaceStandardInputText(element, newText);
      } else {
        // 其他特殊元素，尝试多种方法
        this.replaceSpecialElementText(element, newText);
      }

      // 触发必要的事件
      this.triggerInputEvents(element);

      // 尝试恢复光标位置到文本末尾
      this.restoreCursorPosition(element, newText.length);

      console.log('[InputFieldListener] Text replacement completed successfully');

    } catch (error) {
      console.error('[InputFieldListener] Error replacing text:', error);
      throw error; // 重新抛出错误，让调用者处理
    }
  }

  /**
   * 替换可编辑内容元素的文本
   */
  replaceContentEditableText(element, newText) {
    // 清除现有内容
    element.innerHTML = '';

    // 设置新文本
    element.textContent = newText;

    // 将光标移到末尾
    if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  /**
   * 替换标准输入框的文本
   */
  replaceStandardInputText(element, newText) {
    element.value = newText;

    // 将光标移到末尾
    if (element.setSelectionRange) {
      element.setSelectionRange(newText.length, newText.length);
    }
  }

  /**
   * 替换特殊元素的文本
   */
  replaceSpecialElementText(element, newText) {
    // 尝试多种方法
    if (element.value !== undefined) {
      element.value = newText;
    } else if (element.textContent !== undefined) {
      element.textContent = newText;
    } else if (element.innerText !== undefined) {
      element.innerText = newText;
    } else if (element.innerHTML !== undefined) {
      element.innerHTML = this.escapeHtml(newText);
    }
  }

  /**
   * 触发输入相关事件
   */
  triggerInputEvents(element) {
    const events = ['input', 'change', 'keyup'];

    events.forEach(eventType => {
      try {
        const event = new Event(eventType, {
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(event);
      } catch (error) {
        // 如果现代事件创建失败，尝试旧方法
        try {
          const event = document.createEvent('HTMLEvents');
          event.initEvent(eventType, true, true);
          element.dispatchEvent(event);
        } catch (fallbackError) {
          console.warn(`Failed to trigger ${eventType} event:`, fallbackError);
        }
      }
    });
  }

  /**
   * 恢复光标位置
   */
  restoreCursorPosition(element, position) {
    try {
      if (element.setSelectionRange && typeof element.selectionStart === 'number') {
        element.setSelectionRange(position, position);
      } else if (element.createTextRange) {
        // IE 兼容
        const range = element.createTextRange();
        range.move('character', position);
        range.select();
      }
    } catch (error) {
      console.warn('Failed to restore cursor position:', error);
    }
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
    console.log('[InputFieldListener] Cleaning up resources...');

    // 重置翻译状态
    this.isTranslating = false;

    // 隐藏动画和清理UI元素
    this.hideAnimation();

    // 清理当前输入元素引用
    this.currentInputElement = null;

    // 清理缓存
    this.languageDetectionCache.clear();

    // 清理定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('[InputFieldListener] Resource cleanup completed');
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
