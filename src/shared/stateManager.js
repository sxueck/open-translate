/**
 * Centralized state management for Open Translate extension
 * Eliminates scattered state management across modules
 */

/**
 * State manager for translation operations
 */
class StateManager {
  constructor() {
    this.state = {
      // Global extension state
      isInitialized: false,
      
      // Translation state per tab
      tabs: new Map(), // tabId -> TabState
      
      // Current active tab
      activeTabId: null,
      
      // Global settings
      settings: {
        translationMode: 'replace', // 统一默认为替换模式
        targetLanguage: 'zh-CN',
        sourceLanguage: 'auto',
        autoTranslate: false
      },
      
      // Extension-wide state
      contextMenuCreated: false,
      selectedText: ''
    };
    
    this.listeners = new Map(); // event -> Set of callbacks
    this.debouncedNotify = (typeof debounce !== 'undefined') ?
      debounce(this.notifyListeners.bind(this), 50) :
      this.notifyListeners.bind(this);
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    if (this.state.isInitialized) return;
    
    // Load settings from storage
    await this.loadSettings();
    
    // Set up message listeners for cross-context communication
    this.setupMessageListeners();
    
    this.state.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Get tab state, creating if doesn't exist
   */
  getTabState(tabId) {
    if (!this.state.tabs.has(tabId)) {
      this.state.tabs.set(tabId, this.createDefaultTabState());
    }
    return this.state.tabs.get(tabId);
  }

  /**
   * Create default tab state
   */
  createDefaultTabState() {
    return {
      status: (typeof TRANSLATION_STATUS !== 'undefined') ? TRANSLATION_STATUS.READY : 'ready',
      isTranslated: false,
      isTranslating: false,
      translationMode: this.state.settings.translationMode,
      textNodes: [],
      translations: [],
      originalTexts: new Map(),
      translatedElements: new Set(),
      lastTranslationTime: null,
      error: null,
      stats: {
        totalNodes: 0,
        translatedNodes: 0,
        failedNodes: 0,
        translationTime: 0
      }
    };
  }

  /**
   * Update tab state
   */
  updateTabState(tabId, updates) {
    const tabState = this.getTabState(tabId);
    Object.assign(tabState, updates);
    this.emit('tabStateChanged', { tabId, state: tabState, updates });
  }

  /**
   * Set translation status for tab
   */
  setTranslationStatus(tabId, status, error = null) {
    const tabState = this.getTabState(tabId);
    tabState.status = status;
    tabState.error = error;
    
    // Update related flags based on status
    const statusConstants = (typeof TRANSLATION_STATUS !== 'undefined') ? TRANSLATION_STATUS : {
      TRANSLATING: 'translating',
      TRANSLATED: 'translated',
      READY: 'ready',
      RESTORED: 'restored',
      ERROR: 'error'
    };

    switch (status) {
      case statusConstants.TRANSLATING:
        tabState.isTranslating = true;
        tabState.isTranslated = false;
        break;
      case statusConstants.TRANSLATED:
        tabState.isTranslating = false;
        tabState.isTranslated = true;
        tabState.lastTranslationTime = Date.now();
        break;
      case statusConstants.READY:
      case statusConstants.RESTORED:
        tabState.isTranslating = false;
        tabState.isTranslated = false;
        break;
      case statusConstants.ERROR:
        tabState.isTranslating = false;
        break;
    }
    
    this.emit('statusChanged', { tabId, status, error });
  }

  /**
   * Update translation progress
   */
  updateTranslationProgress(tabId, progress) {
    const tabState = this.getTabState(tabId);
    tabState.progress = progress;
    this.emit('progressChanged', { tabId, progress });
  }

  /**
   * Store translation data
   */
  storeTranslationData(tabId, textNodes, translations) {
    const tabState = this.getTabState(tabId);
    tabState.textNodes = textNodes;
    tabState.translations = translations;
    
    // Update stats
    tabState.stats.totalNodes = textNodes.length;
    tabState.stats.translatedNodes = translations.filter(t => !t.error).length;
    tabState.stats.failedNodes = translations.filter(t => t.error).length;
    
    this.emit('translationDataStored', { tabId, textNodes, translations });
  }

  /**
   * Clear translation data for tab
   */
  clearTranslationData(tabId) {
    const tabState = this.getTabState(tabId);
    tabState.textNodes = [];
    tabState.translations = [];
    tabState.originalTexts.clear();
    tabState.translatedElements.clear();
    tabState.stats = this.createDefaultTabState().stats;
    
    this.emit('translationDataCleared', { tabId });
  }

  /**
   * Remove tab state when tab is closed
   */
  removeTabState(tabId) {
    if (this.state.tabs.has(tabId)) {
      this.state.tabs.delete(tabId);
      this.emit('tabRemoved', { tabId });
    }
  }

  /**
   * Set active tab
   */
  setActiveTab(tabId) {
    this.state.activeTabId = tabId;
    this.emit('activeTabChanged', { tabId });
  }

  /**
   * Get active tab state
   */
  getActiveTabState() {
    if (!this.state.activeTabId) return null;
    return this.getTabState(this.state.activeTabId);
  }

  /**
   * Update global settings
   */
  updateSettings(updates) {
    Object.assign(this.state.settings, updates);
    this.saveSettings();
    this.emit('settingsChanged', { settings: this.state.settings, updates });
  }

  /**
   * Get current settings
   */
  getSettings() {
    return { ...this.state.settings };
  }

  /**
   * Set selected text
   */
  setSelectedText(text) {
    this.state.selectedText = text;
    this.emit('textSelected', { text });
  }

  /**
   * Get selected text
   */
  getSelectedText() {
    return this.state.selectedText;
  }

  /**
   * Set context menu created flag
   */
  setContextMenuCreated(created) {
    this.state.contextMenuCreated = created;
  }

  /**
   * Check if context menu is created
   */
  isContextMenuCreated() {
    return this.state.contextMenuCreated;
  }

  /**
   * Get complete state snapshot
   */
  getStateSnapshot() {
    return {
      isInitialized: this.state.isInitialized,
      activeTabId: this.state.activeTabId,
      settings: { ...this.state.settings },
      contextMenuCreated: this.state.contextMenuCreated,
      selectedText: this.state.selectedText,
      tabCount: this.state.tabs.size,
      tabs: Array.from(this.state.tabs.entries()).map(([id, state]) => ({
        id,
        status: state.status,
        isTranslated: state.isTranslated,
        isTranslating: state.isTranslating,
        stats: { ...state.stats }
      }))
    };
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      if (typeof configManager !== 'undefined') {
        const config = await configManager.loadConfig();
        this.state.settings = {
          translationMode: config.translationMode,
          targetLanguage: config.targetLanguage,
          sourceLanguage: config.sourceLanguage,
          autoTranslate: config.autoTranslate
        };
      } else {
        const result = await chrome.storage.sync.get([
          'translationMode', 'targetLanguage', 'sourceLanguage',
          'autoTranslate'
        ]);
        Object.assign(this.state.settings, result);
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings() {
    try {
      if (typeof configManager !== 'undefined') {
        await configManager.updateConfig(this.state.settings);
      } else {
        await chrome.storage.sync.set(this.state.settings);
      }
    } catch (error) {
      console.warn('Failed to save settings:', error);
    }
  }

  /**
   * Set up message listeners for cross-context communication
   */
  setupMessageListeners() {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Only handle messages that are specifically for stateManager
        const stateManagerActions = ['getState', 'getTabState', 'updateTabState', 'updateSettings'];
        if (stateManagerActions.includes(message.action)) {
          this.handleMessage(message, sender, sendResponse);
          return true; // Keep message channel open for async response
        }
        // Don't handle other messages - let them pass through to other listeners
        return false;
      });
    }
  }

  /**
   * Handle messages from other contexts
   */
  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'getState':
          sendResponse({ success: true, state: this.getStateSnapshot() });
          break;
          
        case 'getTabState':
          const tabId = message.tabId || sender.tab?.id;
          if (tabId) {
            const tabState = this.getTabState(tabId);
            sendResponse({ success: true, state: tabState });
          } else {
            sendResponse({ success: false, error: 'No tab ID provided' });
          }
          break;
          
        case 'updateTabState':
          if (message.tabId && message.updates) {
            this.updateTabState(message.tabId, message.updates);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Missing tabId or updates' });
          }
          break;
          
        case 'updateSettings':
          if (message.settings) {
            this.updateSettings(message.settings);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Missing settings' });
          }
          break;
          
        default:
          // This should not happen since we filter actions before calling this method
          sendResponse({ success: false, error: 'Unknown stateManager action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data = null) {
    this.debouncedNotify(event, data);
  }

  /**
   * Notify listeners (debounced)
   */
  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Create singleton instance
const stateManager = new StateManager();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StateManager, stateManager };
} else if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
  window.stateManager = stateManager;
}
