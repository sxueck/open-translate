/**
 * Content script for Open Translate extension
 * Handles page translation and user interactions
 */

// Import core modules
const textExtractor = new TextExtractor();
const translationRenderer = new TranslationRenderer();
let translationService = null;

// State management
let isTranslating = false;
let isTranslated = false;
let isNavigating = false; // 新增：标记是否正在导航
let currentTextNodes = [];
let currentTranslations = [];
let translationMode = 'paragraph-bilingual';

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

    console.log('Open Translate content script initialized');
  } catch (error) {
    console.error('Failed to initialize Open Translate:', error);

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
      'maxMergedCount'
    ], (result) => {
      translationMode = result.translationMode || 'paragraph-bilingual';
      translationRenderer.setMode(translationMode);

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
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error handling message:', error);

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

  // 检查是否正在导航，如果是则不进行翻译
  if (isNavigating) {
    throw new Error('Page is navigating, translation cancelled');
  }

  try {
    isTranslating = true;

    // Update status in popup
    notifyStatusChange('translating');

    const targetLanguage = options.targetLanguage || 'zh-CN';
    const sourceLanguage = options.sourceLanguage || 'auto';

    // Extract text nodes if not already done or if page changed
    if (!isTranslated || options.forceRefresh) {
      // Use paragraph-based extraction for better concurrent translation
      const paragraphGroups = textExtractor.extractParagraphGroups();

      if (paragraphGroups.length === 0) {
        // Check if page is still loading or has dynamic content
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
            console.log('Navigation detected, stopping translation');
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
          console.error('Failed to render translation progress:', renderError);
        }
      };

      const paragraphResults = await translationService.translateParagraphGroups(
        paragraphGroups,
        targetLanguage,
        sourceLanguage,
        progressCallback
      );

      console.log(`Translation completed: ${paragraphResults.filter(r => r.success).length}/${paragraphResults.length} successful`);
    }

    isTranslated = true;
    notifyStatusChange('translated', {
      totalTranslated: currentTranslations.length,
      mode: translationMode
    });

  } catch (error) {
    console.error('Translation failed:', error);

    // Use errorHandler if available
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'content-translation', {
        logToConsole: true,
        suppressNotification: false
      });
    }

    notifyStatusChange('error', error.message);
    throw error;
  } finally {
    isTranslating = false;
  }
}

/**
 * Handle restore original text request
 */
async function handleRestoreRequest() {
  try {
    if (translationMode === 'paragraph-bilingual') {
      // 在双语模式下，restore 应该只显示原文，不清除翻译状态
      translationRenderer.showOriginalOnly();
    } else {
      // 在替换模式下，restore 完全恢复原文并清除翻译状态
      translationRenderer.restoreOriginalText();
      isTranslated = false;
      currentTranslations = [];
    }

    notifyStatusChange('restored');
  } catch (error) {
    console.error('Restore failed:', error);
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
    console.error('Toggle bilingual view failed:', error);
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
    const oldMode = translationMode;

    // 如果模式相同，无需切换
    if (oldMode === newMode) {
      console.log(`Already in ${newMode} mode, no switch needed`);
      return;
    }

    console.log(`Switching translation mode from ${oldMode} to ${newMode}`);

    // 更新全局状态
    translationMode = newMode;
    translationRenderer.setMode(newMode);

    // 保存用户偏好
    await chrome.storage.sync.set({ translationMode: newMode });

    // 如果页面已翻译，需要重新渲染
    if (isTranslated && currentTranslations.length > 0) {
      if (newMode === 'paragraph-bilingual' && oldMode === 'replace') {
        // 从替换模式切换到双语模式需要重新翻译以获取正确的段落组信息
        console.log('Re-translating for bilingual mode');
        await handleTranslateRequest({ forceRefresh: true });
      } else if (newMode === 'replace' && oldMode === 'paragraph-bilingual') {
        // 从双语模式切换到替换模式，使用现有翻译数据
        console.log('Switching to replace mode with existing translations');
        await translationRenderer.switchMode(newMode, currentTextNodes, currentTranslations);
      } else {
        // 理论上不应该到达这里，但保留作为安全措施
        console.log('Unexpected mode switch scenario, using switchMode');
        await translationRenderer.switchMode(newMode, currentTextNodes, currentTranslations);
      }
    }

    notifyStatusChange('modeChanged', newMode);
    console.log(`Mode switch completed: ${newMode}`);
  } catch (error) {
    console.error('Mode switch failed:', error);
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
        console.log('Link clicked during translation, stopping translation process');
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
      console.warn('Extension context invalidated, cannot send status update');
      return;
    }

    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: status,
      data: data,
      url: window.location.href
    }).catch((error) => {
      // Handle different types of errors
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated:', error);
      } else if (error.message && error.message.includes('Receiving end does not exist')) {
        console.warn('Background script not available:', error);
      } else {
        console.warn('Failed to send status update:', error);
      }
    });
  } catch (error) {
    console.warn('Error in notifyStatusChange:', error);
  }
}

/**
 * Handle dynamic content changes
 */
function setupContentObserver() {
  const observer = translationRenderer.observeContentChanges(() => {
    // Debounce content changes
    clearTimeout(window.otContentChangeTimeout);
    window.otContentChangeTimeout = setTimeout(() => {
      if (isTranslated) {
        // Re-translate new content
        handleTranslateRequest({ forceRefresh: true }).catch(console.error);
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
    if (isTranslating) {
      console.log('Page hidden during translation');
    }
  } else {
    // Page is visible again, reset navigation state
    isNavigating = false;

    if (isTranslated) {
      // Verify translation state is still valid
      const stats = translationRenderer.getTranslationStats();
      if (stats.translatedElements === 0 && stats.bilingualContainers === 0) {
        isTranslated = false;
      }
    }
  }
});
