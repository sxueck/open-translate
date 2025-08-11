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
    
    console.log('Popup initialized successfully');
  } catch (error) {
    console.error('Failed to initialize popup:', error);
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
      'autoTranslate'
    ], (result) => {
      // Set language selections
      elements.sourceLanguage.value = result.sourceLanguage || 'auto';
      elements.targetLanguage.value = result.targetLanguage || 'zh-CN';
      
      // Set translation mode
      const mode = result.translationMode || 'paragraph-bilingual';
      if (mode === 'replace') {
        elements.modeReplace.checked = true;
      } else {
        // 默认使用双语模式（包括段落级双语）
        elements.modeBilingual.checked = true;
      }
      
      // Set checkboxes
      elements.autoTranslate.checked = result.autoTranslate || false;
      
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
    // Get translation status from content script
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'getStatus'
    });

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
    // Content script not available (e.g., on chrome:// pages)
    setStatus('unavailable', 'Translation not available on this page');
    elements.translateBtn.disabled = true;
    elements.restoreBtn.disabled = true;
  }
}

/**
 * Handle translate button click
 */
async function handleTranslate() {
  if (isTranslating) return;

  try {
    isTranslating = true;
    showLoading(true);
    setStatus('translating', 'Translating page...');
    updateButtonStates();

    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'translate',
      options: {
        sourceLanguage: elements.sourceLanguage.value,
        targetLanguage: elements.targetLanguage.value
      }
    });

    if (response && response.success) {
      isTranslated = response.translated;
      isTranslating = false;
      setStatus('translated', 'Page translated successfully');
      updateButtonStates();
    } else {
      throw new Error(response?.error || 'Translation failed');
    }
  } catch (error) {
    console.error('Translation failed:', error);
    isTranslating = false;
    setStatus('error', error.message || 'Translation failed');
    showError(error.message || 'Translation failed');
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
    showLoading(true);
    setStatus('restoring', 'Restoring original text...');

    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'restore'
    });

    if (response && response.success) {
      isTranslated = false;
      isTranslating = false;
      setStatus('restored', 'Original text restored');
      updateButtonStates();
    } else {
      throw new Error(response?.error || 'Restore failed');
    }
  } catch (error) {
    console.error('Restore failed:', error);
    isTranslating = false;
    setStatus('error', error.message || 'Restore failed');
    showError(error.message || 'Restore failed');
    updateButtonStates();
  } finally {
    showLoading(false);
  }
}

/**
 * Handle translation mode change
 */
async function handleModeChange() {
  const mode = elements.modeReplace.checked ? 'replace' : 'paragraph-bilingual';

  try {
    // Save preference
    await chrome.storage.sync.set({ translationMode: mode });

    // Send mode change to content script if page is translated
    if (isTranslated) {
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'switchMode',
        mode: mode
      });

      if (!response || !response.success) {
        console.error('Failed to switch mode:', response?.error);
      }
    }
  } catch (error) {
    console.error('Mode change failed:', error);
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
  console.error('Error:', message);
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);
