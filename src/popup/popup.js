/**
 * Popup script for Open Translate extension
 * Handles user interactions and communication with content/background scripts
 */

// DOM elements
const elements = {
  statusIndicator: null,
  statusText: null,
  sourceLanguage: null,
  targetLanguage: null,
  modeReplace: null,
  modeBilingual: null,
  translateBtn: null,
  restoreBtn: null,
  autoTranslate: null,
  inputFieldListener: null,

  optionsBtn: null,
  loadingOverlay: null
};

// State management
let currentTab = null;
let isTranslated = false;
let isTranslating = false;

/**
 * Initialize popup
 */
async function initialize() {
  try {
    // Get DOM elements
    initializeElements();

    // Get current tab
    currentTab = await getCurrentTab();

    // Load user preferences
    await loadPreferences();

    // Set up event listeners
    setupEventListeners();

    // Update UI based on current state
    await updateUIState();

  } catch (error) {

    // Use errorHandler if available, otherwise fallback to simple error display
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'popup-initialization', {
        logToConsole: true,
        suppressNotification: true
      });
    }

    showError('Failed to initialize extension');
  }
}

/**
 * Get DOM elements
 */
function initializeElements() {
  elements.statusIndicator = document.getElementById('statusIndicator');
  elements.statusText = document.getElementById('statusText');
  elements.sourceLanguage = document.getElementById('sourceLanguage');
  elements.targetLanguage = document.getElementById('targetLanguage');
  elements.modeReplace = document.getElementById('modeReplace');
  elements.modeBilingual = document.getElementById('modeBilingual');
  elements.translateBtn = document.getElementById('translateBtn');
  elements.restoreBtn = document.getElementById('restoreBtn');
  elements.autoTranslate = document.getElementById('autoTranslate');
  elements.inputFieldListener = document.getElementById('inputFieldListener');

  elements.optionsBtn = document.getElementById('optionsBtn');
  elements.loadingOverlay = document.getElementById('loadingOverlay');
}

/**
 * Get current active tab
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Load user preferences from storage
 */
async function loadPreferences() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'sourceLanguage',
      'targetLanguage',
      'translationMode',
      'autoTranslate',
      'inputFieldListenerEnabled'
    ], (result) => {
      // Set language selections
      elements.sourceLanguage.value = result.sourceLanguage || 'auto';
      elements.targetLanguage.value = result.targetLanguage || 'zh-CN';

      // Set translation mode - 统一默认为替换模式
      const mode = result.translationMode || TRANSLATION_MODES.REPLACE;
      if (mode === TRANSLATION_MODES.REPLACE) {
        elements.modeReplace.checked = true;
      } else {
        elements.modeBilingual.checked = true;
      }

      // Set checkboxes
      elements.autoTranslate.checked = result.autoTranslate || false;
      elements.inputFieldListener.checked = result.inputFieldListenerEnabled !== false; // Default to true

      resolve();
    });
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Translation buttons
  elements.translateBtn.addEventListener('click', handleTranslate);
  elements.restoreBtn.addEventListener('click', handleRestore);

  // Language selection changes
  elements.sourceLanguage.addEventListener('change', saveLanguagePreferences);
  elements.targetLanguage.addEventListener('change', saveLanguagePreferences);

  // Mode changes
  elements.modeReplace.addEventListener('change', handleModeChange);
  elements.modeBilingual.addEventListener('change', handleModeChange);

  // Settings checkboxes
  elements.autoTranslate.addEventListener('change', saveGeneralPreferences);
  elements.inputFieldListener.addEventListener('change', handleInputFieldListenerToggle);

  // Navigation buttons
  elements.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

/**
 * Update UI state based on current translation status
 */
async function updateUIState() {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated');
    }

    // Check if current tab is valid and supports content scripts
    if (!currentTab || !currentTab.id || !isContentScriptSupported(currentTab.url)) {
      setStatus('unavailable', 'Translation not available on this page');
      elements.translateBtn.disabled = true;
      elements.restoreBtn.disabled = true;
      return;
    }

    // Get translation status from content script with timeout
    const response = await sendMessageWithTimeout(currentTab.id, {
      action: 'getStatus'
    }, 2000);

    if (response && response.success) {
      isTranslated = response.isTranslated;
      isTranslating = response.isTranslating;

      updateStatusDisplay(response);
      updateButtonStates();
    } else {
      // Content script might not be ready, but allow translation
      setStatus('ready', 'Ready to translate');
      isTranslated = false;
      isTranslating = false;
      updateButtonStates();
    }
  } catch (error) {
    handleUIStateError(error);
  }
}

/**
 * Handle errors in UI state update
 */
function handleUIStateError(error) {
  // Don't log "Receiving end does not exist" as an error since it's expected on some pages
  if (error.message && error.message.includes('Receiving end does not exist')) {
    setStatus('unavailable', 'Translation not available on this page');
    elements.translateBtn.disabled = true;
    elements.restoreBtn.disabled = true;
  } else if (error.message && error.message.includes('Extension context invalidated')) {
    setStatus('error', 'Extension needs to be reloaded');
    elements.translateBtn.disabled = true;
    elements.restoreBtn.disabled = true;
  } else if (error.message && error.message.includes('timeout')) {
    // Content script might be loading, allow translation attempt
    setStatus('ready', 'Ready to translate');
    isTranslated = false;
    isTranslating = false;
    updateButtonStates();
  } else {
    // Don't log connection errors as warnings since they're expected

    // Other errors - still allow translation attempt
    setStatus('ready', 'Ready to translate');
    isTranslated = false;
    isTranslating = false;
    updateButtonStates();
  }
}



/**
 * Send message with timeout to avoid hanging
 */
async function sendMessageWithTimeout(tabId, message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Message timeout'));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Handle translate button click
 */
async function handleTranslate() {
  if (isTranslating) return;

  try {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated. Please reload the extension.');
    }

    isTranslating = true;
    showLoading(true);
    setStatus('translating', 'Translating page...');
    updateButtonStates();



    // Check if content script is supported
    if (!isContentScriptSupported(currentTab.url)) {
      throw new Error('Translation not available on this page');
    }

    // 确保模式状态正确同步
    const currentMode = elements.modeReplace.checked ? TRANSLATION_MODES.REPLACE : TRANSLATION_MODES.BILINGUAL;

    const response = await sendMessageWithTimeout(currentTab.id, {
      action: 'translate',
      options: {
        sourceLanguage: elements.sourceLanguage.value,
        targetLanguage: elements.targetLanguage.value,
        forceRefresh: isTranslated,
        translationMode: currentMode
      }
    }, 60000);

    if (response && response.success) {
      isTranslated = response.translated;
      isTranslating = false;
      setStatus('translated', 'Page translated successfully');
      updateButtonStates();

      // Close popup after successful translation
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      throw new Error(response?.error || 'Translation failed');
    }
  } catch (error) {
    isTranslating = false;

    // Use errorHandler if available
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'popup-translation', {
        logToConsole: true,
        suppressNotification: true
      });
    }

    // Provide more specific error messages
    let errorMessage = error.message || 'Translation failed';
    if (error.message && error.message.includes('Extension context invalidated')) {
      errorMessage = 'Extension needs to be reloaded. Please reload the extension and try again.';
    } else if (error.message && error.message.includes('Receiving end does not exist')) {
      errorMessage = 'Content script not available. Please refresh the page and try again.';
    }

    setStatus('error', errorMessage);
    showError(errorMessage);
    updateButtonStates();
  } finally {
    showLoading(false);
  }
}

/**
 * Handle restore button click
 */
async function handleRestore() {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated. Please reload the extension.');
    }

    // Check if content script is supported
    if (!isContentScriptSupported(currentTab.url)) {
      throw new Error('Restore not available on this page');
    }

    showLoading(true);

    // Check current mode to determine restore behavior
    const mode = elements.modeReplace.checked ? 'replace' : 'paragraph-bilingual';

    if (mode === 'paragraph-bilingual') {
      // In bilingual mode, toggle between showing original only and showing both
      const response = await sendMessageWithTimeout(currentTab.id, {
        action: 'toggleBilingualView'
      }, 10000);

      if (response && response.success) {
        if (response.showingOriginalOnly) {
          setStatus('original-only', 'Showing original text only');
          elements.restoreBtn.textContent = 'Show Translation';
        } else {
          setStatus('translated', 'Showing bilingual view');
          elements.restoreBtn.textContent = 'Show Original Only';
        }
      } else {
        throw new Error(response?.error || 'Toggle view failed');
      }
    } else {
      // In replace mode, restore original text completely
      setStatus('restoring', 'Restoring original text...');

      const response = await sendMessageWithTimeout(currentTab.id, {
        action: 'restore'
      }, 10000);

      if (response && response.success) {
        isTranslated = false;
        isTranslating = false;
        setStatus('restored', 'Original text restored');
        updateButtonStates();

        // Close popup after successful restore
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        throw new Error(response?.error || 'Restore failed');
      }
    }

  } catch (error) {
    isTranslating = false;

    // Use errorHandler if available
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'popup-restore', {
        logToConsole: true,
        suppressNotification: true
      });
    }

    // Provide more specific error messages
    let errorMessage = error.message || 'Restore failed';
    if (error.message && error.message.includes('Extension context invalidated')) {
      errorMessage = 'Extension needs to be reloaded. Please reload the extension and try again.';
    } else if (error.message && error.message.includes('Receiving end does not exist')) {
      errorMessage = 'Content script not available. Please refresh the page and try again.';
    }

    setStatus('error', errorMessage);
    showError(errorMessage);
    updateButtonStates();
  } finally {
    showLoading(false);
  }
}

/**
 * Handle translation mode change
 */
async function handleModeChange() {
  const mode = elements.modeReplace.checked ? TRANSLATION_MODES.REPLACE : TRANSLATION_MODES.BILINGUAL;

  try {
    // 保存用户偏好
    await chrome.storage.sync.set({ translationMode: mode });

    // 立即更新按钮状态
    updateButtonStates();

    // 如果页面已翻译且支持内容脚本，发送模式切换消息
    if (isTranslated && isContentScriptSupported(currentTab.url)) {
      try {
        const response = await sendMessageWithTimeout(currentTab.id, {
          action: 'switchMode',
          mode: mode
        }, 5000);

        if (response && response.success) {
          // 更新状态显示
          setStatus('translated', `Mode switched to ${mode === TRANSLATION_MODES.REPLACE ? 'Replace' : 'Bilingual'}`);
        } else {
          setStatus('error', 'Failed to switch mode');
        }
      } catch (error) {
        setStatus('error', 'Failed to communicate with page');
      }
    }
  } catch (error) {
    setStatus('error', 'Failed to change mode');
  }
}

/**
 * Save language preferences
 */
async function saveLanguagePreferences() {
  await chrome.storage.sync.set({
    sourceLanguage: elements.sourceLanguage.value,
    targetLanguage: elements.targetLanguage.value
  });
}

/**
 * Save general preferences
 */
async function saveGeneralPreferences() {
  await chrome.storage.sync.set({
    autoTranslate: elements.autoTranslate.checked
  });
}

/**
 * Handle input field listener toggle
 */
async function handleInputFieldListenerToggle() {
  try {
    const enabled = elements.inputFieldListener.checked;

    // Save preference
    await chrome.storage.sync.set({
      inputFieldListenerEnabled: enabled
    });

    // Send message to content script to toggle the listener
    if (currentTab) {
      await chrome.tabs.sendMessage(currentTab.id, {
        action: 'toggleInputFieldListener',
        enabled: enabled
      });
    }
  } catch (error) {
    if (typeof errorHandler !== 'undefined') {
      errorHandler.handle(error, 'popup-input-field-listener-toggle', {
        logToConsole: true,
        suppressNotification: true
      });
    }
  }
}



/**
 * Update status display
 */
function updateStatusDisplay(response) {
  if (response.isTranslating) {
    setStatus('translating', 'Translating...');
  } else if (response.isTranslated) {
    setStatus('translated', 'Page is translated');
  } else {
    setStatus('ready', 'Ready to translate');
  }
}

/**
 * Set status indicator
 */
function setStatus(type, message) {
  elements.statusText.textContent = message;
  elements.statusIndicator.className = `status-indicator ${type}`;
}

/**
 * Update button states
 */
function updateButtonStates() {
  elements.translateBtn.disabled = isTranslating;
  elements.restoreBtn.disabled = !isTranslated || isTranslating;

  if (isTranslating) {
    elements.translateBtn.textContent = 'Translating...';
  } else {
    elements.translateBtn.textContent = 'Translate Page';
  }

  // Update restore button text based on mode
  if (isTranslated && !isTranslating) {
    const mode = elements.modeReplace.checked ? TRANSLATION_MODES.REPLACE : TRANSLATION_MODES.BILINGUAL;
    if (mode === TRANSLATION_MODES.BILINGUAL) {
      elements.restoreBtn.textContent = 'Show Original Only';
    } else {
      elements.restoreBtn.textContent = 'Restore Original';
    }
  } else {
    elements.restoreBtn.textContent = 'Restore Original';
  }
}

/**
 * Show/hide loading overlay
 */
function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.remove('hidden');
  } else {
    elements.loadingOverlay.classList.add('hidden');
  }
}

/**
 * Show error message
 */
function showError(message) {
  // Simple error display - could be enhanced with toast notifications
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);
