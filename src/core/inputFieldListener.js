/**
 * 文本框监听器 - 监听用户在文本框中的输入行为
 * 当用户连续快速敲击三下空格键时，自动触发翻译功能
 */
class InputFieldListener {
  constructor(options = {}) {
    this.options = {
      spaceKeyCount: 3,           // 连续空格键次数
      spaceKeyTimeout: 800,       // 空格键超时时间（毫秒）
      debounceDelay: 300,         // 防抖延迟
      minTextLength: 2,           // 最小文本长度
      maxTextLength: 5000,        // 最大文本长度
      enableAnimation: true,      // 是否启用翻译动画
      ...options
    };

    // 状态管理
    this.isEnabled = false;
    this.isTranslating = false;
    this.spaceKeyPresses = [];
    this.currentInputElement = null;
    this.translationService = null;
    this.debounceTimer = null;
    this.animationElement = null;

    // 绑定方法
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleInput = this.handleInput.bind(this);

    // 支持的输入元素选择器
    this.inputSelectors = [
      'input[type="text"]',
      'input[type="search"]',
      'input:not([type])',
      'textarea',
      '[contenteditable="true"]',
      '[contenteditable=""]'
    ];
  }

  /**
   * 初始化监听器
   */
  async initialize(translationService) {
    if (!translationService) {
      throw new Error('Translation service is required');
    }

    this.translationService = translationService;
    this.enable();
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
  }

  /**
   * 移除事件监听器
   */
  detachEventListeners() {
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('focus', this.handleFocus, true);
    document.removeEventListener('blur', this.handleBlur, true);
    document.removeEventListener('input', this.handleInput, true);
  }

  /**
   * 处理键盘按下事件
   */
  handleKeyDown(event) {
    if (!this.isEnabled || this.isTranslating) return;

    // 检查是否是空格键
    if (event.code === 'Space' && this.isValidInputElement(event.target)) {
      this.recordSpaceKeyPress();
      this.checkForTripleSpace();
    } else if (event.code !== 'Space') {
      // 非空格键重置计数
      this.resetSpaceKeyPresses();
    }
  }

  /**
   * 处理输入框获得焦点
   */
  handleFocus(event) {
    if (this.isValidInputElement(event.target)) {
      this.currentInputElement = event.target;
      this.resetSpaceKeyPresses();
    }
  }

  /**
   * 处理输入框失去焦点
   */
  handleBlur(event) {
    if (event.target === this.currentInputElement) {
      this.currentInputElement = null;
      this.resetSpaceKeyPresses();
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
      // 输入内容变化时重置空格键计数
      this.resetSpaceKeyPresses();
    }, this.options.debounceDelay);
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
   * 记录空格键按下
   */
  recordSpaceKeyPress() {
    const now = Date.now();
    this.spaceKeyPresses.push(now);

    // 清理超时的按键记录
    this.spaceKeyPresses = this.spaceKeyPresses.filter(
      timestamp => now - timestamp <= this.options.spaceKeyTimeout
    );
  }

  /**
   * 检查是否达到连续三次空格
   */
  checkForTripleSpace() {
    if (this.spaceKeyPresses.length >= this.options.spaceKeyCount) {
      this.triggerTranslation();
    }
  }

  /**
   * 重置空格键按下记录
   */
  resetSpaceKeyPresses() {
    this.spaceKeyPresses = [];
  }

  /**
   * 触发翻译功能
   */
  async triggerTranslation() {
    if (!this.currentInputElement || this.isTranslating) return;

    const text = this.getInputText(this.currentInputElement);
    
    // 验证文本内容
    if (!this.isValidText(text)) {
      this.resetSpaceKeyPresses();
      return;
    }

    try {
      this.isTranslating = true;
      this.resetSpaceKeyPresses();

      // 显示翻译动画
      this.showTranslationAnimation();

      // 自动检测语言并翻译
      const translation = await this.translateText(text);

      // 显示翻译结果
      this.showTranslationResult(translation, text);

    } catch (error) {
      this.showTranslationError(error.message);
    } finally {
      this.isTranslating = false;
      this.hideAnimation();
    }
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
   * 翻译文本
   */
  async translateText(text) {
    if (!this.translationService) {
      throw new Error('Translation service not available');
    }

    // 获取目标语言设置
    const targetLanguage = await this.getTargetLanguage();
    
    return await this.translationService.translateText(
      text.trim(),
      targetLanguage,
      'auto',
      { context: 'input-field' }
    );
  }

  /**
   * 获取目标语言设置
   */
  async getTargetLanguage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['targetLanguage'], (result) => {
        resolve(result.targetLanguage || 'zh-CN');
      });
    });
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
    this.resetSpaceKeyPresses();
    this.currentInputElement = null;
    
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
      spaceKeyPresses: this.spaceKeyPresses.length
    };
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputFieldListener;
} else if (typeof window !== 'undefined') {
  window.InputFieldListener = InputFieldListener;
}
