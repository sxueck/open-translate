/**
 * Centralized configuration management for Open Translate extension
 * Eliminates duplicate configuration definitions across modules
 */

class ConfigManager {
  constructor() {
    this.defaultConfig = {
      translationConfig: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-3.5-turbo',
        customModel: '',
        temperature: 0.5,
        maxTokens: 2000,
        timeout: 30000
      },
      translationMode: TRANSLATION_MODES.REPLACE,
      targetLanguage: 'zh-CN',
      sourceLanguage: 'auto',
      autoTranslate: false,
      preserveFormatting: true,
      excludeSelectors: '',
      batchSize: 8,
      retryAttempts: 2,
      enableMerge: true,
      shortTextThreshold: 50,
      maxMergedLength: 1000,
      maxMergedCount: 10,
      smartContentEnabled: true
    };

    this.storageKeys = [
      'translationConfig',
      'translationMode',
      'targetLanguage',
      'sourceLanguage',
      'autoTranslate',
      'preserveFormatting',
      'excludeSelectors',
      'batchSize',
      'retryAttempts',
      'enableMerge',
      'shortTextThreshold',
      'maxMergedLength',
      'maxMergedCount',
      'smartContentEnabled'
    ];
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return JSON.parse(JSON.stringify(this.defaultConfig));
  }

  /**
   * Get storage keys for configuration
   */
  getStorageKeys() {
    return [...this.storageKeys];
  }

  /**
   * Load configuration from Chrome storage
   */
  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.storageKeys, (result) => {
        const config = { ...this.defaultConfig };
        
        // Merge stored values with defaults
        Object.keys(result).forEach(key => {
          if (key === 'translationConfig') {
            config.translationConfig = { ...config.translationConfig, ...result[key] };
          } else {
            config[key] = result[key];
          }
        });

        resolve(config);
      });
    });
  }

  /**
   * Save configuration to Chrome storage
   */
  async saveConfig(config) {
    const configToSave = this.validateConfig(config);
    await chrome.storage.sync.set(configToSave);
    return configToSave;
  }

  /**
   * Update specific configuration values
   */
  async updateConfig(updates) {
    const currentConfig = await this.loadConfig();
    const mergedConfig = this.mergeConfig(currentConfig, updates);
    return await this.saveConfig(mergedConfig);
  }

  /**
   * Merge configuration updates with existing config
   */
  mergeConfig(currentConfig, updates) {
    const merged = { ...currentConfig };
    
    Object.keys(updates).forEach(key => {
      if (key === 'translationConfig' && typeof updates[key] === 'object') {
        merged.translationConfig = { ...merged.translationConfig, ...updates[key] };
      } else {
        merged[key] = updates[key];
      }
    });

    return merged;
  }

  /**
   * Validate configuration values
   */
  validateConfig(config) {
    const validated = { ...config };

    // Validate translation config
    if (validated.translationConfig) {
      const tc = validated.translationConfig;
      if (tc.temperature !== undefined) {
        tc.temperature = Math.max(0, Math.min(2, parseFloat(tc.temperature) || 0.3));
      }
      if (tc.maxTokens !== undefined) {
        tc.maxTokens = Math.max(1, Math.min(4000, parseInt(tc.maxTokens) || 2000));
      }
      if (tc.timeout !== undefined) {
        tc.timeout = Math.max(5000, Math.min(120000, parseInt(tc.timeout) || 30000));
      }
    }

    // Validate batch size - only ensure it's a positive integer
    if (validated.batchSize !== undefined) {
      validated.batchSize = Math.max(1, parseInt(validated.batchSize) || 5);
    }

    // Validate merge configuration
    if (validated.enableMerge !== undefined) {
      validated.enableMerge = Boolean(validated.enableMerge);
    }

    if (validated.shortTextThreshold !== undefined) {
      validated.shortTextThreshold = Math.max(10, Math.min(200, parseInt(validated.shortTextThreshold) || 50));
    }

    if (validated.maxMergedLength !== undefined) {
      validated.maxMergedLength = Math.max(100, Math.min(5000, parseInt(validated.maxMergedLength) || 1000));
    }

    if (validated.maxMergedCount !== undefined) {
      validated.maxMergedCount = Math.max(2, Math.min(20, parseInt(validated.maxMergedCount) || 10));
    }

    // Validate retry attempts
    if (validated.retryAttempts !== undefined) {
      validated.retryAttempts = Math.max(0, Math.min(5, parseInt(validated.retryAttempts) || 2));
    }

    // Validate language codes
    const validLanguages = ['auto', ...SUPPORTED_LANGUAGES];
    if (validated.targetLanguage && !validLanguages.includes(validated.targetLanguage)) {
      validated.targetLanguage = 'zh-CN';
    }
    if (validated.sourceLanguage && !validLanguages.includes(validated.sourceLanguage)) {
      validated.sourceLanguage = 'auto';
    }

    // Validate translation mode - 统一默认为替换模式
    const validModes = [TRANSLATION_MODES.REPLACE, TRANSLATION_MODES.BILINGUAL];
    if (validated.translationMode && !validModes.includes(validated.translationMode)) {
      validated.translationMode = TRANSLATION_MODES.REPLACE;
    }

    return validated;
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults() {
    return await this.saveConfig(this.getDefaultConfig());
  }

  /**
   * Get configuration for specific component
   */
  async getComponentConfig(component) {
    const fullConfig = await this.loadConfig();
    
    switch (component) {
      case 'translator':
        return {
          ...fullConfig.translationConfig,
          batchSize: fullConfig.batchSize,
          retryAttempts: fullConfig.retryAttempts,
          enableMerge: fullConfig.enableMerge,
          shortTextThreshold: fullConfig.shortTextThreshold,
          maxMergedLength: fullConfig.maxMergedLength,
          maxMergedCount: fullConfig.maxMergedCount
        };
      case 'extractor':
        return {
          excludeSelectors: fullConfig.excludeSelectors,
          preserveFormatting: fullConfig.preserveFormatting
        };
      case 'renderer':
        return {
          translationMode: fullConfig.translationMode
        };
      default:
        return fullConfig;
    }
  }
}

// Create singleton instance
const configManager = new ConfigManager();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ConfigManager, configManager };
} else if (typeof window !== 'undefined') {
  window.ConfigManager = ConfigManager;
  window.configManager = configManager;
}
