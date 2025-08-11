/**
 * Core translation service that handles API communication
 */
class TranslationService {
  constructor() {
    this.defaultConfig = {
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      customModel: '',
      temperature: 0.3,
      maxTokens: 2000,
      timeout: 30000
    };
    this.availableModels = [];
  }

  /**
   * Initialize service with user configuration
   */
  async initialize() {
    const config = await this.getStoredConfig();
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Get stored configuration from Chrome storage
   */
  async getStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['translationConfig', 'batchSize'], (result) => {
        const config = result.translationConfig || {};
        // Add batchSize to config if available
        if (result.batchSize) {
          config.batchSize = result.batchSize;
        }
        resolve(config);
      });
    });
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    await chrome.storage.sync.set({ translationConfig: this.config });
  }

  /**
   * Get available models from API
   */
  async getAvailableModels() {
    if (!this.config.apiKey) {
      throw new Error('API key not configured');
    }

    try {
      const baseUrl = this.config.apiUrl.replace('/chat/completions', '');
      const modelsUrl = `${baseUrl}/models`;

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        this.availableModels = data.data.map(model => ({
          id: model.id,
          name: model.id,
          owned_by: model.owned_by || 'unknown'
        }));
        return this.availableModels;
      } else {
        throw new Error('Invalid models response format');
      }
    } catch (error) {
      console.error('Failed to fetch available models:', error);
      // Return default models if API call fails
      return [
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', owned_by: 'openai' },
        { id: 'gpt-4', name: 'GPT-4', owned_by: 'openai' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', owned_by: 'openai' }
      ];
    }
  }

  /**
   * Get current model name (custom or selected)
   */
  getCurrentModel() {
    return this.config.customModel && this.config.customModel.trim()
      ? this.config.customModel.trim()
      : this.config.model;
  }

  /**
   * Translate text using configured API
   */
  async translateText(text, targetLanguage = 'zh-CN', sourceLanguage = 'auto') {
    if (!this.config.apiKey) {
      throw new Error('API key not configured');
    }

    const prompt = this.buildTranslationPrompt(text, targetLanguage, sourceLanguage);
    
    try {
      const response = await this.makeAPIRequest(prompt);
      return this.extractTranslation(response);
    } catch (error) {
      console.error('Translation failed:', error);
      throw error;
    }
  }

  /**
   * Build translation prompt for API
   */
  buildTranslationPrompt(text, targetLanguage, sourceLanguage) {
    const languageMap = {
      'zh-CN': 'Simplified Chinese',
      'zh-TW': 'Traditional Chinese',
      'en': 'English',
      'ja': 'Japanese',
      'ko': 'Korean',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'ru': 'Russian'
    };

    const targetLang = languageMap[targetLanguage] || targetLanguage;
    const sourceLang = sourceLanguage === 'auto' ? 'the source language' : (languageMap[sourceLanguage] || sourceLanguage);
    const prompt = this.buildContextualPrompt(text, targetLang, sourceLang);

    return prompt;
  }

  /**
   * Build contextual translation prompt with language-specific optimizations
   */
  buildContextualPrompt(text, targetLang, sourceLang) {
    const baseInstructions = [
      `You are a professional translator. Translate the following text from ${sourceLang} to ${targetLang}.`,
      '',
      'Requirements:',
      '1. Maintain the original meaning, tone, and context accurately',
      '2. Use natural, fluent language that sounds native to the target language',
      '3. Preserve technical terms, proper nouns, and brand names when appropriate',
      '4. Keep the same formatting structure (line breaks, spacing, punctuation style)',
      '5. For ambiguous terms, choose the most contextually appropriate translation',
      '6. Only return the translation without any additional text, explanation, or commentary'
    ];

    // Add language-specific instructions
    const specificInstructions = this.getLanguageSpecificInstructions(targetLang, sourceLang);

    // Add technical content instructions if needed
    const technicalInstructions = this.getTechnicalInstructions(text);

    const fullInstructions = [...baseInstructions, ...specificInstructions, ...technicalInstructions];

    return `${fullInstructions.join('\n')}

Text to translate:
${text}

Translation:`;
  }

  /**
   * Get language-specific translation instructions
   */
  getLanguageSpecificInstructions(targetLang, sourceLang) {
    const instructions = [];

    // Chinese-specific instructions
    if (targetLang.includes('Chinese')) {
      instructions.push('');
      instructions.push('Chinese-specific requirements:');
      instructions.push('- Use appropriate Chinese expressions and idioms when suitable');
      instructions.push('- Maintain formal/informal tone based on context');
      if (targetLang === 'Simplified Chinese') {
        instructions.push('- Use simplified Chinese characters and mainland China conventions');
        instructions.push('- Prefer commonly used modern Chinese expressions');
      } else {
        instructions.push('- Use traditional Chinese characters and Taiwan/Hong Kong conventions');
      }
    }

    // English-specific instructions
    if (targetLang === 'English') {
      instructions.push('');
      instructions.push('English-specific requirements:');
      instructions.push('- Use American English spelling and conventions unless context suggests otherwise');
      instructions.push('- Maintain appropriate register (formal/informal) based on source text');
      instructions.push('- Use natural English sentence structures and idiomatic expressions');
    }

    // Japanese-specific instructions
    if (targetLang === 'Japanese') {
      instructions.push('');
      instructions.push('Japanese-specific requirements:');
      instructions.push('- Use appropriate levels of politeness (keigo) based on context');
      instructions.push('- Choose between hiragana, katakana, and kanji appropriately');
      instructions.push('- Maintain natural Japanese sentence flow and particle usage');
    }

    return instructions;
  }

  /**
   * Get technical content specific instructions
   */
  getTechnicalInstructions(text) {
    const instructions = [];

    if (this.containsTechnicalContent(text)) {
      instructions.push('');
      instructions.push('Technical content requirements:');
      instructions.push('- Preserve technical terminology and maintain consistency');
      instructions.push('- Keep code snippets, URLs, and technical identifiers unchanged');
      instructions.push('- Maintain proper formatting for technical elements');
    }

    return instructions;
  }

  /**
   * Detect if text contains technical content
   */
  containsTechnicalContent(text) {
    const technicalPatterns = [
      /\b(API|HTTP|JSON|XML|CSS|HTML|JavaScript|Python|Java|SQL)\b/i,
      /\b(function|class|method|variable|parameter|return)\b/i,
      /[{}[\]();]/,
      /https?:\/\//,
      /\w+\.\w+\(/,
      /\$\w+/,
      /@\w+/
    ];

    return technicalPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Make API request to translation service
   */
  async makeAPIRequest(prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.getCurrentModel(),
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Extract translation from API response
   */
  extractTranslation(response) {
    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Invalid API response format');
    }

    return response.choices[0].message.content.trim();
  }

  /**
   * Batch translate multiple text segments
   */
  async batchTranslate(textSegments, targetLanguage = 'zh-CN', sourceLanguage = 'auto') {
    const results = [];
    const batchSize = this.config.batchSize || 5; // Use configured batch size

    for (let i = 0; i < textSegments.length; i += batchSize) {
      const batch = textSegments.slice(i, i + batchSize);
      const batchPromises = batch.map(text =>
        this.translateText(text, targetLanguage, sourceLanguage)
          .catch(error => ({ error: error.message, originalText: text }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < textSegments.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Translate paragraph groups with concurrent processing and real-time progress
   */
  async translateParagraphGroups(paragraphGroups, targetLanguage = 'zh-CN', sourceLanguage = 'auto', progressCallback = null) {
    const results = [];
    const concurrency = this.config.batchSize || 3;
    const totalGroups = paragraphGroups.length;

    // Process paragraph groups in batches with real-time rendering
    for (let i = 0; i < paragraphGroups.length; i += concurrency) {
      const batch = paragraphGroups.slice(i, i + concurrency);

      const batchPromises = batch.map(async (group, batchIndex) => {
        try {
          const translation = await this.translateText(
            group.combinedText,
            targetLanguage,
            sourceLanguage
          );

          const result = {
            id: group.id,
            container: group.container,
            textNodes: group.textNodes,
            originalText: group.combinedText,
            translation: translation,
            success: true,
            batchIndex: i + batchIndex,
            totalGroups: totalGroups
          };

          if (progressCallback && typeof progressCallback === 'function') {
            try {
              await progressCallback(result, i + batchIndex + 1, totalGroups);
            } catch (callbackError) {
              console.warn('Progress callback error:', callbackError);
            }
          }

          return result;
        } catch (error) {
          console.error(`Translation failed for paragraph ${group.id}:`, error);
          const result = {
            id: group.id,
            container: group.container,
            textNodes: group.textNodes,
            originalText: group.combinedText,
            error: error.message,
            success: false,
            batchIndex: i + batchIndex,
            totalGroups: totalGroups
          };

          if (progressCallback && typeof progressCallback === 'function') {
            try {
              await progressCallback(result, i + batchIndex + 1, totalGroups);
            } catch (callbackError) {
              console.warn('Progress callback error:', callbackError);
            }
          }

          return result;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (i + concurrency < paragraphGroups.length) {
        const delay = this.calculateBatchDelay(concurrency);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * Calculate optimal delay between batches based on performance
   */
  calculateBatchDelay(batchSize) {
    const baseDelay = 500;
    const sizeMultiplier = Math.min(batchSize / 3, 2);
    return Math.floor(baseDelay * sizeMultiplier);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationService;
} else if (typeof window !== 'undefined') {
  window.TranslationService = TranslationService;
}
