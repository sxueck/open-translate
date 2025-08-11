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
        temperature: 0.3,
        maxTokens: 2000,
        timeout: 30000
      },
      translationMode: 'replace',
      targetLanguage: 'zh-CN',
      sourceLanguage: 'auto',
      autoTranslate: false,
      preserveFormatting: true,
      useLazyTranslation: true,
      excludeSelectors: 'script\nstyle\nnoscript\ncode\npre\nkbd\nsamp\nvar\n.notranslate\n[translate="no"]',
      batchSize: 5,
      retryAttempts: 2
    };

    this.storageKeys = [
      'translationConfig',
      'translationMode',
      'targetLanguage',
      'sourceLanguage',
      'autoTranslate',
      'preserveFormatting',
      'useLazyTranslation',
      'excludeSelectors',
      'batchSize',
      'retryAttempts'
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

    // Validate batch size
    if (validated.batchSize !== undefined) {
      validated.batchSize = Math.max(1, Math.min(20, parseInt(validated.batchSize) || 5));
    }

    // Validate retry attempts
    if (validated.retryAttempts !== undefined) {
      validated.retryAttempts = Math.max(0, Math.min(5, parseInt(validated.retryAttempts) || 2));
    }

    // Validate language codes
    const validLanguages = ['auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];
    if (validated.targetLanguage && !validLanguages.includes(validated.targetLanguage)) {
      validated.targetLanguage = 'zh-CN';
    }
    if (validated.sourceLanguage && !validLanguages.includes(validated.sourceLanguage)) {
      validated.sourceLanguage = 'auto';
    }

    // Validate translation mode
    const validModes = ['replace', 'bilingual'];
    if (validated.translationMode && !validModes.includes(validated.translationMode)) {
      validated.translationMode = 'replace';
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
          retryAttempts: fullConfig.retryAttempts
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
