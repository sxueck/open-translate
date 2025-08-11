/**
 * Options page script for Open Translate extension
 * Handles settings management and user preferences
 */

// DOM elements
const elements = {};

// Default configuration
const defaultConfig = {
  translationConfig: {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 2000,
    timeout: 30000
  },
  sourceLanguage: 'auto',
  targetLanguage: 'zh-CN',
  translationMode: 'replace',
  autoTranslate: false,
  preserveFormatting: true,
  excludeSelectors: 'script\nstyle\nnoscript\ncode\npre\nkbd\nsamp\nvar\n.notranslate\n[translate="no"]',
  batchSize: 5,
  retryAttempts: 2
};

/**
 * Initialize options page
 */
async function initialize() {
  try {
    // Get DOM elements
    initializeElements();
    
    // Load current settings
    await loadSettings();
    
    // Set up event listeners
    setupEventListeners();
    
    console.log('Options page initialized successfully');
  } catch (error) {
    console.error('Failed to initialize options page:', error);
    showStatusMessage('Failed to initialize settings page', 'error');
  }
}

/**
 * Get DOM elements
 */
function initializeElements() {
  // API Configuration
  elements.apiUrl = document.getElementById('apiUrl');
  elements.apiKey = document.getElementById('apiKey');
  elements.toggleApiKey = document.getElementById('toggleApiKey');
  elements.model = document.getElementById('model');
  elements.customModel = document.getElementById('customModel');
  elements.refreshModels = document.getElementById('refreshModels');
  elements.modelPriorityIndicator = document.getElementById('modelPriorityIndicator');
  elements.modelHelp = document.getElementById('modelHelp');
  elements.temperature = document.getElementById('temperature');
  elements.temperatureValue = document.getElementById('temperatureValue');
  elements.maxTokens = document.getElementById('maxTokens');
  elements.timeout = document.getElementById('timeout');
  elements.testConnection = document.getElementById('testConnection');
  elements.testResult = document.getElementById('testResult');
  
  // Translation Settings
  elements.defaultSourceLang = document.getElementById('defaultSourceLang');
  elements.defaultTargetLang = document.getElementById('defaultTargetLang');
  elements.defaultModeReplace = document.getElementById('defaultModeReplace');
  elements.defaultModeBilingual = document.getElementById('defaultModeBilingual');
  elements.autoTranslateEnabled = document.getElementById('autoTranslateEnabled');
  elements.preserveFormatting = document.getElementById('preserveFormatting');
  
  // Advanced Settings
  elements.excludeSelectors = document.getElementById('excludeSelectors');
  elements.batchSize = document.getElementById('batchSize');
  elements.retryAttempts = document.getElementById('retryAttempts');
  
  // Actions
  elements.saveSettings = document.getElementById('saveSettings');
  elements.resetSettings = document.getElementById('resetSettings');
  elements.statusMessage = document.getElementById('statusMessage');
}

/**
 * Load current settings from storage
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(Object.keys(defaultConfig), (result) => {
      // API Configuration
      const config = result.translationConfig || defaultConfig.translationConfig;
      elements.apiUrl.value = config.apiUrl || defaultConfig.translationConfig.apiUrl;
      elements.apiKey.value = config.apiKey || '';
      elements.model.value = config.model || defaultConfig.translationConfig.model;
      elements.customModel.value = config.customModel || '';
      elements.temperature.value = config.temperature || defaultConfig.translationConfig.temperature;
      elements.temperatureValue.textContent = elements.temperature.value;
      elements.maxTokens.value = config.maxTokens || defaultConfig.translationConfig.maxTokens;
      elements.timeout.value = (config.timeout || defaultConfig.translationConfig.timeout) / 1000;
      
      // Translation Settings
      elements.defaultSourceLang.value = result.sourceLanguage || defaultConfig.sourceLanguage;
      elements.defaultTargetLang.value = result.targetLanguage || defaultConfig.targetLanguage;
      
      const mode = result.translationMode || defaultConfig.translationMode;
      if (mode === 'replace') {
        elements.defaultModeReplace.checked = true;
      } else {
        elements.defaultModeBilingual.checked = true;
      }
      
      elements.autoTranslateEnabled.checked = result.autoTranslate || defaultConfig.autoTranslate;
      elements.preserveFormatting.checked = result.preserveFormatting !== false;
      
      // Advanced Settings
      elements.excludeSelectors.value = result.excludeSelectors || defaultConfig.excludeSelectors;
      elements.batchSize.value = result.batchSize || defaultConfig.batchSize;
      elements.retryAttempts.value = result.retryAttempts || defaultConfig.retryAttempts;

      // Update model selection UI
      updateModelSelectionUI();

      resolve();
    });
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // API Key toggle
  elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
  
  // Temperature slider
  elements.temperature.addEventListener('input', (e) => {
    elements.temperatureValue.textContent = e.target.value;
  });
  
  // Test connection
  elements.testConnection.addEventListener('click', testApiConnection);

  // Refresh models
  elements.refreshModels.addEventListener('click', refreshAvailableModels);

  // Model selection changes
  elements.model.addEventListener('change', updateModelSelectionUI);
  elements.customModel.addEventListener('input', updateModelSelectionUI);

  // Save settings
  elements.saveSettings.addEventListener('click', saveSettings);
  
  // Reset settings
  elements.resetSettings.addEventListener('click', resetSettings);
  
  // Status message close
  const statusClose = elements.statusMessage.querySelector('.status-close');
  statusClose.addEventListener('click', hideStatusMessage);
  
  // Auto-hide status message
  let statusTimeout;
  const showStatus = (message, type) => {
    clearTimeout(statusTimeout);
    showStatusMessage(message, type);
    statusTimeout = setTimeout(hideStatusMessage, 5000);
  };
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const isPassword = elements.apiKey.type === 'password';
  elements.apiKey.type = isPassword ? 'text' : 'password';
  
  const icon = elements.toggleApiKey.querySelector('svg path');
  if (isPassword) {
    // Show eye-off icon
    icon.setAttribute('d', 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92 1.41-1.41L3.51 1.93 2.1 3.34l2.36 2.36C4.06 6.53 3.5 7.93 3.5 9.5c0 4.39 4 7.5 9 7.5 1.59 0 3.04-.2 4.28-.57l2.92 2.92 1.41-1.41-11.7-11.7zm0 7c-.83 0-1.5-.67-1.5-1.5 0-.39.15-.74.39-1.01l1.12 1.12c-.27.24-.01.39-.01.39z');
  } else {
    // Show eye icon
    icon.setAttribute('d', 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z');
  }
}

/**
 * Test API connection
 */
async function testApiConnection() {
  const testBtn = elements.testConnection;
  const testResult = elements.testResult;

  try {
    testBtn.disabled = true;
    testBtn.innerHTML = '<span>Testing...</span>';
    testResult.classList.add('hidden');

    const config = {
      apiUrl: elements.apiUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      model: elements.model.value,
      temperature: parseFloat(elements.temperature.value),
      maxTokens: parseInt(elements.maxTokens.value),
      timeout: parseInt(elements.timeout.value) * 1000
    };

    if (!config.apiUrl || !config.apiKey) {
      throw new Error('Please enter both API URL and API key');
    }

    // Test with a simple translation request
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: `Translate the following text from English to Simplified Chinese.
Follow these guidelines:
1. Maintain the original meaning and tone
2. Use natural, fluent Chinese that sounds native
3. Only return the translation without any additional text or explanation

Text to translate:
Hello

Translation:`
          }
        ],
        temperature: config.temperature,
        max_tokens: 50
      }),
      signal: AbortSignal.timeout(config.timeout)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid API response format');
    }

    testResult.className = 'test-result success';
    testResult.textContent = 'Connection successful! API is working correctly.';
    testResult.classList.remove('hidden');

  } catch (error) {
    console.error('API test failed:', error);
    testResult.className = 'test-result error';
    testResult.textContent = `Connection failed: ${error.message}`;
    testResult.classList.remove('hidden');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

/**
 * Update model selection UI based on current values
 */
function updateModelSelectionUI() {
  const customModelValue = elements.customModel.value.trim();
  const selectedModel = elements.model.value;

  if (customModelValue) {
    // Custom model has priority
    elements.modelPriorityIndicator.textContent = '(Active)';
    elements.modelPriorityIndicator.className = 'priority-indicator active';
    elements.customModel.classList.add('active');
    elements.model.classList.add('inactive');
    elements.modelHelp.textContent = `Using custom model: "${customModelValue}" (overrides dropdown selection)`;
  } else {
    // Using dropdown selection
    elements.modelPriorityIndicator.textContent = '(Inactive)';
    elements.modelPriorityIndicator.className = 'priority-indicator inactive';
    elements.customModel.classList.remove('active');
    elements.model.classList.remove('inactive');
    elements.modelHelp.textContent = `Using selected model: "${selectedModel}" (enter custom model above to override)`;
  }
}

/**
 * Refresh available models from API
 */
async function refreshAvailableModels() {
  const refreshBtn = elements.refreshModels;
  const modelSelect = elements.model;

  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Loading...';

    // Create temporary translation service to fetch models
    const tempConfig = {
      apiUrl: elements.apiUrl.value.trim(),
      apiKey: elements.apiKey.value.trim()
    };

    if (!tempConfig.apiUrl || !tempConfig.apiKey) {
      throw new Error('Please enter API URL and API key first');
    }

    const translationService = new TranslationService();
    translationService.config = { ...translationService.defaultConfig, ...tempConfig };

    const models = await translationService.getAvailableModels();

    // Save current selection
    const currentValue = modelSelect.value;

    // Get all current default options (GPT and Claude models)
    const defaultOptions = Array.from(modelSelect.options).filter(option =>
      option.value.startsWith('gpt-') || option.value.startsWith('claude-')
    );

    // Clear all options
    modelSelect.innerHTML = '';

    // Add default options back
    defaultOptions.forEach(option => {
      modelSelect.appendChild(option.cloneNode(true));
    });

    // Add separator if we have API models
    if (models.length > 0) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '--- Available Models ---';
      modelSelect.appendChild(separator);

      // Add API models
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} (${model.owned_by})`;
        modelSelect.appendChild(option);
      });
    }

    // Restore selection if it still exists
    if (Array.from(modelSelect.options).some(opt => opt.value === currentValue)) {
      modelSelect.value = currentValue;
    }

    showStatusMessage('Models refreshed successfully!', 'success');

  } catch (error) {
    console.error('Failed to refresh models:', error);
    showStatusMessage(`Failed to refresh models: ${error.message}`, 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Models';
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    const settings = {
      translationConfig: {
        apiUrl: elements.apiUrl.value.trim(),
        apiKey: elements.apiKey.value.trim(),
        model: elements.model.value,
        customModel: elements.customModel.value.trim(),
        temperature: parseFloat(elements.temperature.value),
        maxTokens: parseInt(elements.maxTokens.value),
        timeout: parseInt(elements.timeout.value) * 1000
      },
      sourceLanguage: elements.defaultSourceLang.value,
      targetLanguage: elements.defaultTargetLang.value,
      translationMode: elements.defaultModeReplace.checked ? 'replace' : 'bilingual',
      autoTranslate: elements.autoTranslateEnabled.checked,
      preserveFormatting: elements.preserveFormatting.checked,
      excludeSelectors: elements.excludeSelectors.value.trim(),
      batchSize: parseInt(elements.batchSize.value),
      retryAttempts: parseInt(elements.retryAttempts.value)
    };

    await chrome.storage.sync.set(settings);
    showStatusMessage('Settings saved successfully!', 'success');

  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatusMessage('Failed to save settings. Please try again.', 'error');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults? This action cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set(defaultConfig);
    await loadSettings();
    showStatusMessage('Settings reset to defaults successfully!', 'success');

  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatusMessage('Failed to reset settings. Please try again.', 'error');
  }
}

/**
 * Show status message
 */
function showStatusMessage(message, type = 'success') {
  const statusMessage = elements.statusMessage;
  const statusText = statusMessage.querySelector('.status-text');

  statusText.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
}

/**
 * Hide status message
 */
function hideStatusMessage() {
  elements.statusMessage.classList.add('hidden');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);
