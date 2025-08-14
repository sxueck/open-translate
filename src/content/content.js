/**
 * Content script for Open Translate extension
 * Handles page translation and user interactions
 */

// Import core modules
let textExtractor = null;
const translationRenderer = new TranslationRenderer();
let translationService = null;
let inputFieldListener = null;

// State management
let isTranslating = false;
let isTranslated = false;
let isNavigating = false; // 新增：标记是否正在导航
let currentTextNodes = [];
let currentTranslations = [];
let translationMode = TRANSLATION_MODES.REPLACE; // 统一默认为替换模式

/**
 * Initialize content script
 */
async function initialize() {
  try {
    translationService = new TranslationService();
    await translationService.initialize();
    await loadUserPreferences();
    setupMessageListeners();
    setupContextMenu();

    // 初始化输入框监听器
    await initializeInputFieldListener();
  } catch (error) {

    // Use errorHandler if available
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'content-initialization', {
        logToConsole: true,
        suppressNotification: true
      });
    }
  }
}

/**
 * Load user preferences from storage
 */
async function loadUserPreferences() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'translationMode',
      'targetLanguage',
      'batchSize',
      'enableMerge',
      'shortTextThreshold',
      'maxMergedLength',
      'maxMergedCount',
      'excludeSelectors',
      'preserveFormatting',
      'smartContentEnabled',
      'inputFieldListenerEnabled'
    ], (result) => {
      // 保持与初始默认值一致：如果用户没有设置，使用 REPLACE 模式
      translationMode = result.translationMode || TRANSLATION_MODES.REPLACE;
      translationRenderer.setMode(translationMode);

      // 如果是Replace模式，确保清理任何可能的双语模式残留
      if (translationMode === TRANSLATION_MODES.REPLACE) {
        translationRenderer.cleanupAllBilingualElements();
      }

      // Initialize TextExtractor with user configuration
      textExtractor = new TextExtractor({
        excludeSelectors: result.excludeSelectors || '',
        preserveFormatting: result.preserveFormatting !== false,
        smartContentEnabled: result.smartContentEnabled !== false
      });

      // Update translation service with configuration if available
      if (translationService) {
        if (result.batchSize) {
          translationService.config.batchSize = result.batchSize;
        }
        if (result.enableMerge !== undefined) {
          translationService.config.enableMerge = result.enableMerge;
        }
        if (result.shortTextThreshold) {
          translationService.config.shortTextThreshold = result.shortTextThreshold;
        }
        if (result.maxMergedLength) {
          translationService.config.maxMergedLength = result.maxMergedLength;
        }
        if (result.maxMergedCount) {
          translationService.config.maxMergedCount = result.maxMergedCount;
        }
      }

      resolve();
    });
  });
}

/**
 * 初始化输入框监听器
 */
async function initializeInputFieldListener() {
  try {
    if (!translationService) {
      return;
    }

    // 检查用户是否启用了输入框监听功能
    const result = await new Promise((resolve) => {
      chrome.storage.sync.get(['inputFieldListenerEnabled'], resolve);
    });

    const isEnabled = result.inputFieldListenerEnabled !== false; // 默认启用

    if (isEnabled) {
      inputFieldListener = new InputFieldListener({
        debounceDelay: 300,
        minTextLength: 2,
        maxTextLength: 5000,
        enableAnimation: true
      });

      await inputFieldListener.initialize(translationService);
    }
  } catch (error) {
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'input-field-listener-initialization', {
        logToConsole: true,
        suppressNotification: true
      });
    }
  }
}

/**
 * Set up message listeners for communication with popup/background
 */
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep message channel open for async responses
  });
}

/**
 * Handle messages from popup and background script
 */
async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'translate':
        await handleTranslateRequest(message.options);
        sendResponse({ success: true, translated: isTranslated });
        break;
        
      case 'restore':
        await handleRestoreRequest();
        sendResponse({ success: true, translated: isTranslated });
        break;

      case 'toggleBilingualView':
        const result = await handleToggleBilingualView();
        sendResponse({ success: true, showingOriginalOnly: result.showingOriginalOnly });
        break;

      case 'switchMode':
        await handleSwitchModeRequest(message.mode);
        sendResponse({ success: true, mode: translationMode });
        break;
        
      case 'getStatus':
        sendResponse({
          success: true,
          isTranslated: isTranslated,
          isTranslating: isTranslating,
          mode: translationMode,
          stats: translationRenderer.getTranslationStats()
        });
        break;
        
      case 'updateConfig':
        await translationService.updateConfig(message.config);
        // Reinitialize TextExtractor with updated configuration
        await loadUserPreferences();
        // 重新初始化输入框监听器
        await initializeInputFieldListener();
        sendResponse({ success: true });
        break;

      case 'toggleInputFieldListener':
        await handleToggleInputFieldListener(message.enabled);
        sendResponse({ success: true, enabled: inputFieldListener?.isEnabled || false });
        break;

      case 'updateInputFieldSettings':
        await handleUpdateInputFieldSettings(message.settings);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {

    // Use errorHandler if available
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'content-message-handling', {
        logToConsole: true,
        suppressNotification: true
      });
    }

    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle translation request
 */
async function handleTranslateRequest(options = {}) {
  if (isTranslating) {
    throw new Error('Translation already in progress');
  }

  if (isNavigating) {
    throw new Error('Page is navigating, translation cancelled');
  }

  // 确保使用正确的翻译模式
  const requestedMode = options.translationMode || translationMode;

  // 验证模式有效性并更新全局状态
  if ([TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL].includes(requestedMode)) {
    translationMode = requestedMode;
    translationRenderer.setMode(requestedMode);
  }

  try {
    isTranslating = true;

    if (contentObserver) {
      contentObserver.disconnect();
    }

    // Update status in popup
    notifyStatusChange('translating');

    const targetLanguage = options.targetLanguage || 'zh-CN';
    const sourceLanguage = options.sourceLanguage || 'auto';

    // 检查是否需要重新翻译
    const settingsChanged = window.lastTranslationSettings && (
      window.lastTranslationSettings.targetLanguage !== targetLanguage ||
      window.lastTranslationSettings.sourceLanguage !== sourceLanguage
    );

    const needsRetranslation = isTranslated && (options.forceRefresh || settingsChanged);

    if (needsRetranslation) {
      translationRenderer.restoreOriginalText();
      isTranslated = false;
      currentTranslations = [];
      currentTextNodes = [];
      if (textExtractor) {
        textExtractor.clearCache();
      }
    }

    window.lastTranslationSettings = {
      targetLanguage,
      sourceLanguage,
      translationMode
    };

    // 只在状态不一致时才清理残留元素
    if (!isTranslated) {
      const existingTranslatedElements = document.querySelectorAll('.ot-paragraph-bilingual, .ot-paragraph-translated');
      if (existingTranslatedElements.length > 0) {
        existingTranslatedElements.forEach(element => {
          if (element.classList.contains('ot-paragraph-bilingual')) {
            element.classList.remove('ot-paragraph-bilingual');
            const translatedSection = element.querySelector('.ot-paragraph-translated');
            if (translatedSection) {
              translatedSection.remove();
            }
          } else if (element.classList.contains('ot-paragraph-translated')) {
            element.remove();
          }
        });
      }
    }

    if (!isTranslated || options.forceRefresh || needsRetranslation) {
      // Ensure textExtractor is initialized
      if (!textExtractor) {
        await loadUserPreferences();
      }

      // Use paragraph-based extraction for better concurrent translation
      // Pass translation mode to ensure proper text extraction
      let paragraphGroups = textExtractor.extractParagraphGroups(document.body, {
        translationMode: translationMode
      });

      if (paragraphGroups.length === 0) {
        const hasText = document.body && document.body.textContent.trim().length > 0;
        const errorMessage = hasText
          ? 'No translatable text found on this page. The page may contain only images, videos, or non-text content.'
          : 'Page appears to be empty or still loading. Please wait and try again.';
        throw new Error(errorMessage);
      }

      // 重置翻译数据
      currentTextNodes = [];
      currentTranslations = [];

      // 实时翻译进度回调函数
      const progressCallback = async (result, completed, total) => {
        try {
          // 检查是否正在导航，如果是则停止翻译
          if (isNavigating) {
            return;
          }

          // 立即渲染单个翻译结果
          translationRenderer.renderSingleResult(result, translationMode);

          // 更新进度状态
          const progress = Math.round((completed / total) * 100);

          notifyStatusChange('translating', {
            progress: progress,
            completed: completed,
            total: total,
            currentText: result.originalText?.substring(0, 50) + '...'
          });

          // 存储翻译结果以便后续操作
          if (result.success) {
            result.textNodes.forEach((textNode, index) => {
              currentTextNodes.push(textNode);

              if (result.textNodes.length === 1) {
                // Single text node in paragraph - use full translation
                currentTranslations.push(result.translation);
              } else {
                // Multiple text nodes in paragraph - distribute translation proportionally
                const nodeTextLength = textNode.text.length;
                const totalTextLength = result.originalText.length;
                const proportion = nodeTextLength / totalTextLength;

                // Calculate position in translation based on text node position
                let currentPosition = 0;
                for (let i = 0; i < index; i++) {
                  currentPosition += result.textNodes[i].text.length / totalTextLength;
                }

                const startPos = Math.floor(currentPosition * result.translation.length);
                const endPos = Math.floor((currentPosition + proportion) * result.translation.length);

                let nodeTranslation = result.translation.substring(startPos, endPos).trim();

                // Ensure we have some translation text
                if (!nodeTranslation) {
                  nodeTranslation = result.translation;
                }

                currentTranslations.push(nodeTranslation);
              }
            });
          } else {
            // Handle failed translations - keep original text
            result.textNodes.forEach(textNode => {
              currentTextNodes.push(textNode);
              currentTranslations.push(textNode.text);
            });
          }

        } catch (renderError) {
        }
      };

      const paragraphResults = await translationService.translateParagraphGroups(
        paragraphGroups,
        targetLanguage,
        sourceLanguage,
        progressCallback,
        { translationMode: translationMode }
      );

    }

    isTranslated = true;
    notifyStatusChange('translated', {
      totalTranslated: currentTranslations.length,
      mode: translationMode
    });

  } catch (error) {
    // 检查是否已经有部分翻译成功
    const hasPartialTranslation = currentTranslations.length > 0 ||
                                  translationRenderer.getTranslationStats().translatedElements > 0;

    if (hasPartialTranslation) {
      // 如果有部分翻译成功，将状态设置为已翻译而不是错误
      isTranslated = true;
      notifyStatusChange('translated', {
        totalTranslated: currentTranslations.length,
        mode: translationMode,
        warning: error.message
      });
    } else {
      // 只有在完全没有翻译成功时才报告错误
      // Use errorHandler if available
      if (typeof errorHandler !== 'undefined') {
        errorHandler.handle(error, 'content-translation', {
          logToConsole: true,
          suppressNotification: false
        });
      }

      notifyStatusChange('error', error.message);
      throw error;
    }
  } finally {
    isTranslating = false;

    // 重新启用内容观察器
    if (!contentObserver) {
      contentObserver = setupContentObserver();
    }
  }
}

/**
 * Handle restore original text request
 */
async function handleRestoreRequest() {
  try {
    if (translationMode === 'paragraph-bilingual') {
      translationRenderer.showOriginalOnly();
    } else {
      translationRenderer.restoreOriginalText();
      isTranslated = false;
      currentTranslations = [];
    }

    notifyStatusChange('restored');
  } catch (error) {
    throw error;
  }
}

/**
 * Handle toggle bilingual view request (show original only vs show both)
 */
async function handleToggleBilingualView() {
  try {
    if (translationMode !== 'paragraph-bilingual') {
      throw new Error('Toggle view only available in bilingual mode');
    }

    // Check if currently showing original only
    const isShowingOriginalOnly = document.querySelector('.ot-paragraph-bilingual.ot-original-only') !== null;

    if (isShowingOriginalOnly) {
      // Currently showing original only, switch to show both
      translationRenderer.showBilingual();
      notifyStatusChange('bilingual-view');
      return { showingOriginalOnly: false };
    } else {
      // Currently showing both, switch to show original only
      translationRenderer.showOriginalOnly();
      notifyStatusChange('original-only-view');
      return { showingOriginalOnly: true };
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Handle translation mode switch request
 */
async function handleSwitchModeRequest(newMode) {
  if (!['replace', 'paragraph-bilingual'].includes(newMode)) {
    throw new Error(`Invalid translation mode: ${newMode}`);
  }

  try {
    // 如果模式相同，无需切换
    if (translationMode === newMode) {
      return;
    }

    const oldMode = translationMode;

    // 更新全局状态
    translationMode = newMode;
    translationRenderer.setMode(newMode);

    // 保存用户偏好
    await chrome.storage.sync.set({ translationMode: newMode });

    // 如果页面已翻译，需要重新翻译以确保模式切换正确
    if (isTranslated && currentTranslations.length > 0) {
      // 清理缓存确保重新提取和翻译
      if (textExtractor) {
        textExtractor.clearCache();
      }

      // 强制重新翻译以确保模式切换的正确性
      await handleTranslateRequest({
        forceRefresh: true,
        translationMode: newMode
      });
    }

    notifyStatusChange('modeChanged', newMode);
  } catch (error) {
    throw error;
  }
}

/**
 * 处理输入框监听器开关请求
 */
async function handleToggleInputFieldListener(enabled) {
  try {
    // 保存用户偏好
    await chrome.storage.sync.set({ inputFieldListenerEnabled: enabled });

    if (enabled) {
      // 启用输入框监听器
      if (!inputFieldListener) {
        await initializeInputFieldListener();
      } else {
        inputFieldListener.enable();
      }
    } else {
      // 禁用输入框监听器
      if (inputFieldListener) {
        inputFieldListener.disable();
      }
    }

    notifyStatusChange('inputFieldListenerToggled', { enabled });
  } catch (error) {
    throw error;
  }
}

/**
 * 处理输入框设置更新请求
 */
async function handleUpdateInputFieldSettings(settings) {
  try {
    // 保存设置到存储
    await chrome.storage.sync.set(settings);

    // 更新输入框监听器设置
    if (inputFieldListener) {
      await inputFieldListener.updateSettings(settings);
    }

    notifyStatusChange('inputFieldSettingsUpdated', settings);
  } catch (error) {
    throw error;
  }
}

/**
 * Set up context menu interactions and link click handling
 */
function setupContextMenu() {
  // Handle text selection for targeted translation
  document.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0) {
      // Store selection for potential translation
      chrome.runtime.sendMessage({
        action: 'textSelected',
        text: selection.toString().trim()
      });
    }
  });

  // 防止链接点击时进行二次翻译
  setupLinkClickHandler();
}

/**
 * 设置链接点击处理，防止二次翻译
 */
function setupLinkClickHandler() {
  document.addEventListener('click', (event) => {
    const target = event.target;

    // 检查是否点击了链接或链接内的元素
    const link = target.closest('a[href]');
    if (link && link.href) {
      // 标记页面即将跳转，暂停翻译相关操作
      isNavigating = true;

      // 如果当前正在翻译，停止翻译
      if (isTranslating) {
        isTranslating = false;
      }

      // 清理当前翻译状态，为新页面做准备
      setTimeout(() => {
        cleanup();
      }, 100);
    }
  }, true); // 使用捕获阶段确保早期处理
}

/**
 * Notify popup/background about status changes
 */
function notifyStatusChange(status, data = null) {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }

    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: status,
      data: data,
      url: window.location.href
    }).catch((error) => {
      // Handle different types of errors silently
    });
  } catch (error) {
    // Handle errors silently
  }
}

/**
 * Handle dynamic content changes
 */
function setupContentObserver() {
  const observer = translationRenderer.observeContentChanges(() => {
    // 避免在翻译过程中触发重新翻译
    if (isTranslating) {
      return;
    }

    clearTimeout(window.otContentChangeTimeout);
    window.otContentChangeTimeout = setTimeout(() => {
      if (isTranslated && !isTranslating) {
        handleTranslateRequest({ forceRefresh: true }).catch(() => {});
      }
    }, 1000);
  });

  return observer;
}

/**
 * Clean up resources
 */
function cleanup() {
  if (isTranslated) {
    translationRenderer.restoreOriginalText();
  }

  // Clear timeouts
  if (window.otContentChangeTimeout) {
    clearTimeout(window.otContentChangeTimeout);
  }

  // 清理输入框监听器
  if (inputFieldListener) {
    inputFieldListener.cleanup();
  }

  // Reset state
  isTranslating = false;
  isTranslated = false;
  isNavigating = false;
  currentTextNodes = [];
  currentTranslations = [];
}

window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

// 监听页面导航开始
window.addEventListener('beforeunload', () => {
  isNavigating = true;
  isTranslating = false;
});

// 监听历史记录变化（SPA导航）
window.addEventListener('popstate', () => {
  isNavigating = true;
  setTimeout(() => {
    isNavigating = false;
    cleanup();
  }, 500);
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Set up content observer
let contentObserver = null;
window.addEventListener('load', () => {
  contentObserver = setupContentObserver();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Page is hidden, pause any ongoing operations
  } else {
    // Page is visible again, reset navigation state
    isNavigating = false;

    if (isTranslated) {
      // Verify translation state is still valid
      const stats = translationRenderer.getTranslationStats();
      if (stats.translatedElements === 0 && stats.paragraphBilingualContainers === 0) {
        isTranslated = false;
      }
    }
  }
});
