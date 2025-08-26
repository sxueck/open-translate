/**
 * Options page script for Open Translate extension
 * Handles settings management and user preferences
 */

// DOM elements
const elements = {};

/**
 * Initialize options page
 */
async function initialize() {
  try {
    // Get DOM elements
    initializeElements();

    // Load current settings
    await loadSettings();

    // Initialize models if needed
    await initializeModelsIfNeeded();

    // Set up event listeners
    setupEventListeners();
  } catch (error) {
    errorHandler.handle(error, 'options-initialize');
    showStatusMessage(ERROR_MESSAGES.TRANSLATION_FAILED, 'error');
  }
}

/**
 * Initialize models if needed (first time setup)
 */
async function initializeModelsIfNeeded() {
  try {
    const apiUrl = elements.apiUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();

    // Check if we have valid API configuration
    if (!apiUrl || !apiKey) {
      return;
    }

    // Check if models are already cached and valid
    const isCacheValid = await configManager.isModelCacheValid(apiUrl);
    if (isCacheValid) {
      return;
    }

    // Fetch and cache models in background
    try {
      const models = await fetchAvailableModels(apiUrl, apiKey);
      await configManager.saveAvailableModels(models, apiUrl);

      // Reload models in UI
      await loadAvailableModels();
    } catch (error) {
      console.warn('Failed to initialize models:', error);
    }

  } catch (error) {
    console.warn('Model initialization error:', error);
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
  

  // Advanced Settings
  elements.smartContentEnabled = document.getElementById('smartContentEnabled');
  elements.inputFieldListenerEnabled = document.getElementById('inputFieldListenerEnabled');
  elements.inputFieldTriggerKey = document.getElementById('inputFieldTriggerKey');
  elements.inputFieldCtrlKey = document.getElementById('inputFieldCtrlKey');
  elements.inputFieldAltKey = document.getElementById('inputFieldAltKey');
  elements.inputFieldShiftKey = document.getElementById('inputFieldShiftKey');
  elements.autoDetectPageLanguage = document.getElementById('autoDetectPageLanguage');
  elements.defaultTargetLanguage = document.getElementById('defaultTargetLanguage');
  elements.excludeSelectors = document.getElementById('excludeSelectors');
  elements.batchSize = document.getElementById('batchSize');
  elements.retryAttempts = document.getElementById('retryAttempts');

  // Batch Merge Settings
  elements.enableMerge = document.getElementById('enableMerge');
  elements.shortTextThreshold = document.getElementById('shortTextThreshold');
  elements.maxMergedLength = document.getElementById('maxMergedLength');
  elements.maxMergedCount = document.getElementById('maxMergedCount');

  // Smart Batching Settings
  elements.enableSmartBatching = document.getElementById('enableSmartBatching');

  // Actions
  elements.saveSettings = document.getElementById('saveSettings');
  elements.resetSettings = document.getElementById('resetSettings');
  elements.statusMessage = document.getElementById('statusMessage');
}

/**
 * Load current settings from storage
 */
async function loadSettings() {
  try {
    const config = await configManager.loadConfig();

    // API Configuration
    const translationConfig = config.translationConfig;
    elements.apiUrl.value = translationConfig.apiUrl;
    elements.apiKey.value = translationConfig.apiKey || '';

    // Load models first, then set the selected model
    await loadAvailableModels();
    elements.model.value = translationConfig.model;

    elements.customModel.value = translationConfig.customModel || '';
    elements.temperature.value = translationConfig.temperature;
    elements.temperatureValue.textContent = elements.temperature.value;
    elements.maxTokens.value = translationConfig.maxTokens;
    elements.timeout.value = translationConfig.timeout / 1000;



    // Advanced Settings
    elements.smartContentEnabled.checked = config.smartContentEnabled !== false; // Default to true
    elements.inputFieldListenerEnabled.checked = config.inputFieldListenerEnabled !== false; // Default to true

    // Input Field Settings
    elements.inputFieldTriggerKey.value = config.inputFieldTriggerKey || 'F2';
    elements.inputFieldCtrlKey.checked = config.inputFieldCtrlKey || false;
    elements.inputFieldAltKey.checked = config.inputFieldAltKey || false;
    elements.inputFieldShiftKey.checked = config.inputFieldShiftKey || false;
    elements.autoDetectPageLanguage.checked = config.autoDetectPageLanguage !== false; // Default to true
    elements.defaultTargetLanguage.value = config.defaultTargetLanguage || 'en';

    const defaultSelectors = DOM_SELECTORS.EXCLUDE_DEFAULT.join('\n');
    const userSelectors = config.excludeSelectors || '';

    let displayContent = `# Default Exclude Selectors (built-in):\n${defaultSelectors}\n\n# User Additional Selectors:`;
    if (userSelectors) {
      displayContent += `\n${userSelectors}`;
    }

    elements.excludeSelectors.value = displayContent;
    elements.batchSize.value = config.batchSize;
    elements.retryAttempts.value = config.retryAttempts;

    if (elements.enableMerge) {
      elements.enableMerge.checked = config.enableMerge !== false; // Default to true
    }
    if (elements.shortTextThreshold) {
      elements.shortTextThreshold.value = config.shortTextThreshold || 50;
    }
    if (elements.maxMergedLength) {
      elements.maxMergedLength.value = config.maxMergedLength || 1000;
    }
    if (elements.maxMergedCount) {
      elements.maxMergedCount.value = config.maxMergedCount || 10;
    }

    // Smart Batching Settings
    if (elements.enableSmartBatching) {
      elements.enableSmartBatching.checked = config.enableSmartBatching !== false; // Default to true
    }

    // Update model selection UI
    updateModelSelectionUI();
  } catch (error) {
    errorHandler.handle(error, 'options-load-settings');
    showStatusMessage(ERROR_MESSAGES.TRANSLATION_FAILED, 'error');
  }
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
 * Collect current API configuration from form
 */
function collectApiConfig() {
  return {
    apiUrl: elements.apiUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    model: elements.model.value,
    customModel: elements.customModel.value.trim(),
    temperature: parseFloat(elements.temperature.value),
    maxTokens: parseInt(elements.maxTokens.value),
    timeout: parseInt(elements.timeout.value) * 1000
  };
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

    const config = collectApiConfig();

    if (!config.apiUrl || !config.apiKey) {
      throw new ConfigurationError(ERROR_MESSAGES.API_KEY_MISSING);
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
      const apiError = errorHandler.createAPIError(await response.text(), response.status);
      throw apiError;
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new APIError(ERROR_MESSAGES.INVALID_RESPONSE);
    }

    testResult.className = 'test-result success';
    testResult.textContent = 'Connection successful! API is working correctly.';
    testResult.classList.remove('hidden');

  } catch (error) {
    errorHandler.handle(error, 'options-test-connection');
    testResult.className = 'test-result error';
    testResult.textContent = `Connection failed: ${formatError(error)}`;
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
 * Load available models from storage or fetch from API
 */
async function loadAvailableModels() {
  const modelSelect = elements.model;
  const currentValue = modelSelect.value;

  try {
    // Try to load from storage first
    const storedModels = await configManager.loadAvailableModels();

    if (storedModels && storedModels.models && storedModels.models.length > 0) {
      populateModelSelect(storedModels.models);

      // Restore selection if it still exists
      if (Array.from(modelSelect.options).some(opt => opt.value === currentValue)) {
        modelSelect.value = currentValue;
      }
      return;
    }

    // If no stored models, try to fetch from API if credentials are available
    const apiUrl = elements.apiUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();

    if (apiUrl && apiKey) {
      const models = await fetchAvailableModels(apiUrl, apiKey);
      await configManager.saveAvailableModels(models, apiUrl);
      populateModelSelect(models);

      // Restore selection if it still exists
      if (Array.from(modelSelect.options).some(opt => opt.value === currentValue)) {
        modelSelect.value = currentValue;
      }
    } else {
      // Show empty state with instruction
      modelSelect.innerHTML = '<option value="">Please configure API settings and refresh models</option>';
    }

  } catch (error) {
    console.warn('Failed to load models:', error);
    modelSelect.innerHTML = '<option value="">Failed to load models</option>';
  }
}

/**
 * Populate model select with options
 */
function populateModelSelect(models) {
  const modelSelect = elements.model;
  modelSelect.innerHTML = '';

  if (models && models.length > 0) {
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.owned_by ? `${model.name} (${model.owned_by})` : model.name;
      modelSelect.appendChild(option);
    });
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No models available';
    modelSelect.appendChild(option);
  }
}

/**
 * Fetch available models from API
 */
async function fetchAvailableModels(apiUrl, apiKey) {
  try {
    const baseUrl = apiUrl.replace('/chat/completions', '');
    const modelsUrl = `${baseUrl}/models`;

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const apiError = errorHandler.createAPIError(await response.text(), response.status);
      throw apiError;
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      return data.data.map(model => ({
        id: model.id,
        name: model.id,
        owned_by: model.owned_by || 'unknown'
      }));
    } else {
      throw new APIError(ERROR_MESSAGES.INVALID_RESPONSE);
    }
  } catch (error) {
    errorHandler.handle(error, 'options-fetch-models', { suppressNotification: true });
    throw error;
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

    // Get API configuration for model fetching
    const apiUrl = elements.apiUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();

    if (!apiUrl || !apiKey) {
      throw new ConfigurationError(ERROR_MESSAGES.API_KEY_MISSING);
    }

    // Save current selection
    const currentValue = modelSelect.value;

    // Fetch models directly from API
    const models = await fetchAvailableModels(apiUrl, apiKey);

    // Save models to storage
    await configManager.saveAvailableModels(models, apiUrl);

    // Populate the select with new models
    populateModelSelect(models);

    // Restore selection if it still exists
    if (Array.from(modelSelect.options).some(opt => opt.value === currentValue)) {
      modelSelect.value = currentValue;
    }

    showStatusMessage('Models refreshed successfully!', 'success');

  } catch (error) {
    errorHandler.handle(error, 'options-refresh-models');
    showStatusMessage(`Failed to refresh models: ${formatError(error)}`, 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Models';
  }
}

/**
 * Extract user-defined selectors from the textarea content
 */
function extractUserSelectors(textareaValue) {
  if (!textareaValue) return '';

  const lines = textareaValue.split('\n');
  const userSelectors = [];
  let inUserSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 检查是否进入用户自定义区域
    if (trimmedLine.startsWith('#') && trimmedLine.includes('User Additional Selectors')) {
      inUserSection = true;
      continue;
    }

    // 跳过空行和其他注释行
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // 只有在用户自定义区域的选择器才会被保存
    if (inUserSection) {
      userSelectors.push(trimmedLine);
    }
  }

  return userSelectors.join('\n').trim();
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    const settings = {
      translationConfig: collectApiConfig(),
      smartContentEnabled: elements.smartContentEnabled.checked,
      inputFieldListenerEnabled: elements.inputFieldListenerEnabled.checked,
      inputFieldTriggerKey: elements.inputFieldTriggerKey.value,
      inputFieldCtrlKey: elements.inputFieldCtrlKey.checked,
      inputFieldAltKey: elements.inputFieldAltKey.checked,
      inputFieldShiftKey: elements.inputFieldShiftKey.checked,
      autoDetectPageLanguage: elements.autoDetectPageLanguage.checked,
      defaultTargetLanguage: elements.defaultTargetLanguage.value,
      excludeSelectors: extractUserSelectors(elements.excludeSelectors.value),
      batchSize: parseInt(elements.batchSize.value),
      retryAttempts: parseInt(elements.retryAttempts.value),
      enableMerge: elements.enableMerge ? elements.enableMerge.checked : true,
      shortTextThreshold: elements.shortTextThreshold ? parseInt(elements.shortTextThreshold.value) : 50,
      maxMergedLength: elements.maxMergedLength ? parseInt(elements.maxMergedLength.value) : 1000,
      maxMergedCount: elements.maxMergedCount ? parseInt(elements.maxMergedCount.value) : 10,
      // Smart Batching Settings
      enableSmartBatching: elements.enableSmartBatching ? elements.enableSmartBatching.checked : true
    };

    await configManager.saveConfig(settings);
    showStatusMessage('Settings saved successfully!', 'success');

  } catch (error) {
    errorHandler.handle(error, 'options-save-settings');
    showStatusMessage(ERROR_MESSAGES.TRANSLATION_FAILED, 'error');
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
    await configManager.resetToDefaults();
    await loadSettings();
    showStatusMessage('Settings reset to defaults successfully!', 'success');

  } catch (error) {
    errorHandler.handle(error, 'options-reset-settings');
    showStatusMessage(ERROR_MESSAGES.TRANSLATION_FAILED, 'error');
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
