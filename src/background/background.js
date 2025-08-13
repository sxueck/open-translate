/**
 * Background script for Open Translate extension
 * Handles extension lifecycle, context menus, and cross-tab communication
 */

// Import shared modules
importScripts(
  '/src/shared/constants.js',
  '/src/shared/utils.js',
  '/src/shared/config.js',
  '/src/shared/errorHandler.js',
  '/src/shared/stateManager.js'
);

let extensionState = null;

/**
 * Initialize background script
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    extensionState = {
      activeTranslations: new Map(),
      selectedText: ''
    };

    await stateManager.initialize();

    if (details.reason === 'install') {
      await configManager.resetToDefaults();
    }

    createContextMenus();
    stateManager.setContextMenuCreated(true);

  } catch (error) {
    errorHandler.handle(error, 'background-initialization', {
      logToConsole: true,
      suppressNotification: true
    });
  }
});

/**
 * Create context menus
 */
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.TRANSLATE_PAGE,
      title: 'Translate this page',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.TRANSLATE_SELECTION,
      title: 'Translate "%s"',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.RESTORE_ORIGINAL,
      title: 'Restore original text',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'separator-1',
      type: 'separator',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.MODE_REPLACE,
      title: 'Replace mode',
      type: 'radio',
      contexts: ['page'],
      checked: true
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.MODE_BILINGUAL,
      title: 'Bilingual mode',
      type: 'radio',
      contexts: ['page']
    });
  });
}

/**
 * Handle context menu clicks using shared constants and error handling
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    switch (info.menuItemId) {
      case CONTEXT_MENU_IDS.TRANSLATE_PAGE:
        await handleTranslatePage(tab);
        break;

      case CONTEXT_MENU_IDS.TRANSLATE_SELECTION:
        await handleTranslateSelection(info.selectionText, tab);
        break;

      case CONTEXT_MENU_IDS.RESTORE_ORIGINAL:
        await handleRestoreOriginal(tab);
        break;

      case CONTEXT_MENU_IDS.MODE_REPLACE:
      case CONTEXT_MENU_IDS.MODE_BILINGUAL:
        await handleModeSwitch(info.menuItemId.replace('mode-', ''), tab);
        break;
    }
  } catch (error) {
    errorHandler.handle(error, 'context-menu-action', {
      notificationOptions: {
        title: 'Translation failed',
        message: formatError(error)
      }
    });
  }
});

/**
 * Handle page translation request using state manager
 */
async function handleTranslatePage(tab) {
  try {
    const config = await configManager.loadConfig();

    // Update tab status to translating
    stateManager.setTranslationStatus(tab.id, TRANSLATION_STATUS.TRANSLATING);

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: MESSAGE_ACTIONS.TRANSLATE,
      options: {
        targetLanguage: config.targetLanguage,
        sourceLanguage: config.sourceLanguage
      }
    });

    if (response.success) {
      stateManager.setTranslationStatus(tab.id, TRANSLATION_STATUS.TRANSLATED);


    } else {
      throw new Error(response.error || 'Translation failed');
    }
  } catch (error) {
    stateManager.setTranslationStatus(tab.id, TRANSLATION_STATUS.ERROR, error);
    throw error;
  }
}

/**
 * Handle selection translation
 */
async function handleTranslateSelection(selectionText, tab) {
  // Store selected text for future use
  if (extensionState) {
    extensionState.selectedText = selectionText;
  }

  // For now, translate the whole page when selection is clicked
  // Future enhancement: implement selection-specific translation
  await handleTranslatePage(tab);
}

/**
 * Handle restore original text using state manager
 */
async function handleRestoreOriginal(tab) {
  try {
    stateManager.setTranslationStatus(tab.id, TRANSLATION_STATUS.RESTORING);

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: MESSAGE_ACTIONS.RESTORE
    });

    if (response.success) {
      stateManager.setTranslationStatus(tab.id, TRANSLATION_STATUS.RESTORED);
      stateManager.clearTranslationData(tab.id);


    } else {
      throw new Error(response.error || 'Restore failed');
    }
  } catch (error) {
    stateManager.setTranslationStatus(tab.id, TRANSLATION_STATUS.ERROR, error);
    throw error;
  }
}

/**
 * Handle translation mode switch
 */
async function handleModeSwitch(mode, tab) {
  try {
    if (![TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL].includes(mode)) {
      throw new Error(`Invalid translation mode: ${mode}`);
    }



    await chrome.storage.sync.set({ translationMode: mode });

    chrome.contextMenus.update('mode-replace', { checked: mode === TRANSLATION_MODES.REPLACE });
    chrome.contextMenus.update('mode-bilingual', { checked: mode === TRANSLATION_MODES.BILINGUAL });

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'switchMode',
        mode: mode
      });

      if (response && response.success) {
      } else {
      }
    } catch (error) {
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ensure extensionState is initialized
  if (!extensionState) {
    extensionState = {
      activeTranslations: new Map(),
      selectedText: ''
    };
  }

  handleBackgroundMessage(message, sender, sendResponse);
  return true; // Keep message channel open
});

/**
 * Process background messages
 */
async function handleBackgroundMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'statusUpdate':
        await handleStatusUpdate(message, sender);
        sendResponse({ success: true });
        break;
        
      case 'textSelected':
        extensionState.selectedText = message.text;
        sendResponse({ success: true });
        break;
        
      case 'getTabStatus':
        const status = await getTabTranslationStatus(sender.tab?.id || message.tabId);
        sendResponse({ success: true, status });
        break;
        
      case 'updateConfig':
        await chrome.storage.sync.set({ translationConfig: message.config });
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle status updates from content scripts
 */
async function handleStatusUpdate(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  
  const status = {
    status: message.status,
    data: message.data,
    timestamp: Date.now(),
    url: message.url
  };
  
  extensionState.activeTranslations.set(tabId, status);
  
  // Update badge based on status
  await updateBadge(tabId, message.status);
}

/**
 * Update extension badge
 */
async function updateBadge(tabId, status) {
  let badgeText = '';
  let badgeColor = '#4CAF50';
  
  switch (status) {
    case 'translating':
      badgeText = '...';
      badgeColor = '#FF9800';
      break;
    case 'translated':
      badgeText = 'T';
      badgeColor = '#4CAF50';
      break;
    case 'error':
      badgeText = '!';
      badgeColor = '#F44336';
      break;
    case 'restored':
      badgeText = '';
      break;
  }
  
  await chrome.action.setBadgeText({ text: badgeText, tabId });
  await chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
}

/**
 * Get translation status for a tab
 */
async function getTabTranslationStatus(tabId) {
  if (!tabId) return null;
  
  const status = extensionState.activeTranslations.get(tabId);
  if (!status) return null;
  
  // Check if status is recent (within 1 hour)
  const isRecent = Date.now() - status.timestamp < 3600000;
  return isRecent ? status : null;
}

/**
 * Get stored configuration using config manager
 */
async function getStoredConfig() {
  return await configManager.loadConfig();
}



/**
 * Clean up inactive tabs - now handled by state manager
 */
function cleanupInactiveTabs() {
  // Cleanup is now handled automatically by the StateManager
  // This function is kept for backward compatibility
}

/**
 * Handle tab removal using state manager
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  stateManager.removeTabState(tabId);
});

/**
 * Handle tab updates using state manager
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    // Clear translation status when navigating to new page
    stateManager.removeTabState(tabId);
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
});

