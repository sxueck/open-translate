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
      temperature: 0.5,
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
      chrome.storage.sync.get([
        'translationConfig',
        'batchSize',
        'enableMerge',
        'shortTextThreshold',
        'maxMergedLength',
        'maxMergedCount'
      ], (result) => {
        const config = result.translationConfig || {};
        // Add batch and merge settings to config if available
        if (result.batchSize) {
          config.batchSize = result.batchSize;
        }
        if (result.enableMerge !== undefined) {
          config.enableMerge = result.enableMerge;
        }
        if (result.shortTextThreshold) {
          config.shortTextThreshold = result.shortTextThreshold;
        }
        if (result.maxMergedLength) {
          config.maxMergedLength = result.maxMergedLength;
        }
        if (result.maxMergedCount) {
          config.maxMergedCount = result.maxMergedCount;
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

      // Provide more specific error messages
      if (error.name === 'AbortError') {
        throw new Error('Translation request timed out. Please try again.');
      } else if (error.message.includes('Failed to fetch')) {
        throw new Error('Network error: Unable to connect to translation service. Please check your internet connection.');
      } else if (error.message.includes('API request failed: 401')) {
        throw new Error('API key is invalid or missing. Please check your settings.');
      } else if (error.message.includes('API request failed: 429')) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      } else if (error.message.includes('API request failed: 402')) {
        throw new Error('API quota exceeded. Please check your account balance.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Build translation prompt for API
   */
  buildTranslationPrompt(text, targetLanguage, sourceLanguage) {
    const targetLang = LANGUAGE_MAP[targetLanguage] || targetLanguage;
    const sourceLang = sourceLanguage === 'auto' ? 'the source language' : (LANGUAGE_MAP[sourceLanguage] || sourceLanguage);
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

    // Add HTML handling instructions if text contains HTML
    if (this.containsHtmlTags(text)) {
      baseInstructions.push('7. The text contains HTML tags. Preserve all HTML tags and their structure exactly as they appear');
      baseInstructions.push('8. Only translate the text content within HTML tags, not the tags themselves');
      baseInstructions.push('9. Maintain the exact same HTML structure in the translation');
    }

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
   * Check if text contains HTML tags
   */
  containsHtmlTags(text) {
    if (!text || typeof text !== 'string') return false;
    return /<[^>]+>/g.test(text);
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
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;

        // Try to get more detailed error information
        try {
          const errorData = await response.json();
          if (errorData.error && errorData.error.message) {
            errorMessage += ` - ${errorData.error.message}`;
          }
        } catch (parseError) {
          // Ignore JSON parsing errors for error responses
        }

        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle specific error types
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      } else if (error.message.includes('Failed to fetch')) {
        throw new Error('Network error: Failed to fetch');
      } else {
        throw error;
      }
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

      // Add minimal delay between batches to respect rate limits
      if (i + batchSize < textSegments.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  }

  /**
   * Merge and translate short text segments in batches
   */
  async batchMergeTranslate(textSegments, targetLanguage = 'zh-CN', sourceLanguage = 'auto') {
    const mergeConfig = this.getMergeConfig();
    const { shortTexts, longTexts } = this.categorizeTextsByLength(textSegments, mergeConfig.shortTextThreshold);

    const results = [];

    // Process long texts individually
    if (longTexts.length > 0) {
      const longResults = await this.batchTranslate(
        longTexts.map(item => item.text),
        targetLanguage,
        sourceLanguage
      );

      longTexts.forEach((item, index) => {
        results.push({
          ...item,
          translation: longResults[index],
          isMerged: false
        });
      });
    }

    // Process short texts with merging
    if (shortTexts.length > 0) {
      const mergedResults = await this.processMergedShortTexts(shortTexts, targetLanguage, sourceLanguage, mergeConfig);
      results.push(...mergedResults);
    }

    // Sort results back to original order
    return results.sort((a, b) => a.originalIndex - b.originalIndex);
  }

  /**
   * Get merge configuration with defaults
   */
  getMergeConfig() {
    return {
      shortTextThreshold: this.config.shortTextThreshold || 50,
      maxMergedLength: this.config.maxMergedLength || 1000,
      maxMergedCount: this.config.maxMergedCount || 10
    };
  }

  /**
   * Categorize texts by length
   */
  categorizeTextsByLength(textSegments, threshold) {
    const shortTexts = [];
    const longTexts = [];

    textSegments.forEach((text, index) => {
      const item = {
        text: text,
        originalIndex: index,
        length: text.length
      };

      if (text.length <= threshold) {
        shortTexts.push(item);
      } else {
        longTexts.push(item);
      }
    });

    return { shortTexts, longTexts };
  }

  /**
   * Process short texts with merging strategy
   */
  async processMergedShortTexts(shortTexts, targetLanguage, sourceLanguage, mergeConfig) {
    const mergedBatches = this.createMergedBatches(shortTexts, mergeConfig);
    const results = [];

    for (const batch of mergedBatches) {
      try {
        const mergedTranslation = await this.translateMergedBatch(batch, targetLanguage, sourceLanguage);
        const splitResults = this.splitMergedTranslation(batch, mergedTranslation);
        results.push(...splitResults);
      } catch (error) {
        // Fallback to individual translation on merge failure
        const fallbackResults = await this.fallbackToIndividualTranslation(batch, targetLanguage, sourceLanguage);
        results.push(...fallbackResults);
      }
    }

    return results;
  }

  /**
   * Create merged batches from short texts
   */
  createMergedBatches(shortTexts, config) {
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const item of shortTexts) {
      const itemLength = item.text.length;

      // Check if adding this item would exceed limits
      if (currentBatch.length >= config.maxMergedCount ||
          currentLength + itemLength > config.maxMergedLength) {

        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentLength = 0;
        }
      }

      currentBatch.push(item);
      currentLength += itemLength;
    }

    // Add remaining batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Translate a merged batch of short texts
   */
  async translateMergedBatch(batch, targetLanguage, sourceLanguage) {
    const mergedPrompt = this.buildMergedTranslationPrompt(batch, targetLanguage, sourceLanguage);
    const response = await this.makeAPIRequest(mergedPrompt);
    return this.extractTranslation(response);
  }

  /**
   * Build prompt for merged translation
   */
  buildMergedTranslationPrompt(batch, targetLang, sourceLang) {
    const baseInstructions = [
      `You are a professional translator. Translate the following numbered text segments from ${sourceLang} to ${targetLang}.`,
      '',
      'Requirements:',
      '1. Maintain the original meaning, tone, and context accurately for each segment',
      '2. Use natural, fluent language that sounds native to the target language',
      '3. Preserve technical terms, proper nouns, and brand names when appropriate',
      '4. Return translations in the same numbered format as the input',
      '5. Each translation should be on a separate line with its corresponding number',
      '6. Only return the numbered translations without any additional text or commentary'
    ];

    // Check if any text in the batch contains HTML
    const hasHtml = batch.some(item => this.containsHtmlTags(item.text));
    if (hasHtml) {
      baseInstructions.push('7. Some segments contain HTML tags. Preserve all HTML tags and their structure exactly');
      baseInstructions.push('8. Only translate the text content within HTML tags, not the tags themselves');
      baseInstructions.push('9. Maintain the exact same HTML structure in each translation');
    }

    const specificInstructions = this.getLanguageSpecificInstructions(targetLang, sourceLang);
    const fullInstructions = [...baseInstructions, ...specificInstructions];

    // Create numbered text segments
    const numberedTexts = batch.map((item, index) => `${index + 1}. ${item.text}`).join('\n');

    return `${fullInstructions.join('\n')}

Text segments to translate:
${numberedTexts}

Translations:`;
  }

  /**
   * Split merged translation results back to individual items
   */
  splitMergedTranslation(batch, mergedTranslation) {
    const lines = mergedTranslation.split('\n').filter(line => line.trim());
    const results = [];

    batch.forEach((item, index) => {
      const expectedNumber = index + 1;
      let translation = '';

      // Find the corresponding translation line
      const translationLine = lines.find(line => {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        return match && parseInt(match[1]) === expectedNumber;
      });

      if (translationLine) {
        const match = translationLine.match(/^(\d+)\.\s*(.+)$/);
        translation = match ? match[2].trim() : item.text;
      } else {
        // Fallback: try to get translation by index
        const fallbackLine = lines[index];
        if (fallbackLine) {
          translation = fallbackLine.replace(/^\d+\.\s*/, '').trim();
        } else {
          translation = item.text; // Ultimate fallback
        }
      }

      results.push({
        ...item,
        translation: translation,
        isMerged: true
      });
    });

    return results;
  }

  /**
   * Fallback to individual translation when merge fails
   */
  async fallbackToIndividualTranslation(batch, targetLanguage, sourceLanguage) {
    const results = [];

    for (const item of batch) {
      try {
        const translation = await this.translateText(item.text, targetLanguage, sourceLanguage);
        results.push({
          ...item,
          translation: translation,
          isMerged: false
        });
      } catch (error) {
        results.push({
          ...item,
          translation: item.text,
          error: error.message,
          isMerged: false
        });
      }
    }

    return results;
  }

  /**
   * Translate paragraph groups with concurrent processing and merge optimization
   */
  async translateParagraphGroups(paragraphGroups, targetLanguage = 'zh-CN', sourceLanguage = 'auto', progressCallback = null) {
    const enableMerge = this.config.enableMerge !== false; // Default to true

    if (enableMerge) {
      return await this.translateParagraphGroupsWithMerge(paragraphGroups, targetLanguage, sourceLanguage, progressCallback);
    } else {
      return await this.translateParagraphGroupsIndividually(paragraphGroups, targetLanguage, sourceLanguage, progressCallback);
    }
  }

  /**
   * Translate paragraph groups individually (original method)
   */
  async translateParagraphGroupsIndividually(paragraphGroups, targetLanguage = 'zh-CN', sourceLanguage = 'auto', progressCallback = null) {
    const totalGroups = paragraphGroups.length;

    // Use user configured concurrency directly without any adjustments
    const concurrency = this.config.batchSize || 5;

    // Use a semaphore-like approach for concurrency control
    const semaphore = new ConcurrencySemaphore(concurrency);
    const translationPromises = [];

    for (let i = 0; i < paragraphGroups.length; i++) {
      const group = paragraphGroups[i];

      const translationPromise = semaphore.acquire().then(async (release) => {
        try {
          const startTime = Date.now();

          const translation = await this.translateText(
            group.combinedText,
            targetLanguage,
            sourceLanguage
          );

          const processingTime = Date.now() - startTime;

          const result = {
            id: group.id,
            container: group.container,
            textNodes: group.textNodes,
            originalText: group.combinedText,
            translation: translation,
            success: true,
            batchIndex: group.batchIndex !== undefined ? group.batchIndex : i,
            totalGroups: totalGroups,
            processingTime: processingTime,
            htmlContent: group.htmlContent || ''
          };

          // Real-time progress callback
          if (progressCallback && typeof progressCallback === 'function') {
            try {
              await progressCallback(result, i + 1, totalGroups);
            } catch (callbackError) {
            }
          }

          return result;
        } catch (error) {
          const result = {
            id: group.id,
            container: group.container,
            textNodes: group.textNodes,
            originalText: group.combinedText,
            error: error.message,
            success: false,
            batchIndex: group.batchIndex !== undefined ? group.batchIndex : i,
            totalGroups: totalGroups,
            htmlContent: group.htmlContent || ''
          };

          if (progressCallback && typeof progressCallback === 'function') {
            try {
              await progressCallback(result, i + 1, totalGroups);
            } catch (callbackError) {
            }
          }

          return result;
        } finally {
          release();
        }
      });

      translationPromises.push(translationPromise);
    }

    // Wait for all translations to complete
    const allResults = await Promise.all(translationPromises);

    // Sort results back to original order for consistency
    allResults.sort((a, b) => a.batchIndex - b.batchIndex);

    return allResults;
  }

  /**
   * Translate paragraph groups with merge optimization
   */
  async translateParagraphGroupsWithMerge(paragraphGroups, targetLanguage, sourceLanguage, progressCallback) {
    const mergeConfig = this.getMergeConfig();
    const { shortGroups, longGroups } = this.categorizeGroupsByLength(paragraphGroups, mergeConfig.shortTextThreshold);

    const results = [];
    let processedCount = 0;
    const totalGroups = paragraphGroups.length;

    // Process long groups individually with concurrency
    if (longGroups.length > 0) {
      const longResults = await this.translateParagraphGroupsIndividually(longGroups, targetLanguage, sourceLanguage, (result) => {
        processedCount++;
        if (progressCallback) {
          progressCallback(result, processedCount, totalGroups);
        }
      });
      results.push(...longResults);
    }

    // Process short groups with merging
    if (shortGroups.length > 0) {
      const mergedResults = await this.processMergedParagraphGroups(shortGroups, targetLanguage, sourceLanguage, (result) => {
        processedCount++;
        if (progressCallback) {
          progressCallback(result, processedCount, totalGroups);
        }
      });
      results.push(...mergedResults);
    }

    // Sort results back to original order
    return results.sort((a, b) => a.batchIndex - b.batchIndex);
  }

  /**
   * Categorize paragraph groups by text length
   */
  categorizeGroupsByLength(paragraphGroups, threshold) {
    const shortGroups = [];
    const longGroups = [];

    paragraphGroups.forEach((group, index) => {
      const groupWithIndex = { ...group, batchIndex: index };

      if (group.combinedText.length <= threshold) {
        shortGroups.push(groupWithIndex);
      } else {
        longGroups.push(groupWithIndex);
      }
    });

    return { shortGroups, longGroups };
  }

  /**
   * Process short paragraph groups with merging
   */
  async processMergedParagraphGroups(shortGroups, targetLanguage, sourceLanguage, progressCallback) {
    const mergeConfig = this.getMergeConfig();
    const mergedBatches = this.createMergedGroupBatches(shortGroups, mergeConfig);
    const results = [];

    for (const batch of mergedBatches) {
      try {
        const mergedTranslation = await this.translateMergedGroupBatch(batch, targetLanguage, sourceLanguage);
        const splitResults = this.splitMergedGroupTranslation(batch, mergedTranslation);

        // Call progress callback for each result
        for (const result of splitResults) {
          results.push(result);
          if (progressCallback) {
            progressCallback(result, results.length, shortGroups.length);
          }
        }
      } catch (error) {
        const fallbackResults = await this.fallbackToIndividualGroupTranslation(batch, targetLanguage, sourceLanguage, progressCallback);
        results.push(...fallbackResults);
      }
    }

    return results;
  }

  /**
   * Create merged batches from short paragraph groups
   */
  createMergedGroupBatches(shortGroups, config) {
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const group of shortGroups) {
      const groupLength = group.combinedText.length;

      // Check if adding this group would exceed limits
      if (currentBatch.length >= config.maxMergedCount ||
          currentLength + groupLength > config.maxMergedLength) {

        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentLength = 0;
        }
      }

      currentBatch.push(group);
      currentLength += groupLength;
    }

    // Add remaining batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Translate a merged batch of paragraph groups
   */
  async translateMergedGroupBatch(batch, targetLanguage, sourceLanguage) {
    const mergedPrompt = this.buildMergedGroupTranslationPrompt(batch, targetLanguage, sourceLanguage);
    const response = await this.makeAPIRequest(mergedPrompt);
    return this.extractTranslation(response);
  }

  /**
   * Build prompt for merged group translation
   */
  buildMergedGroupTranslationPrompt(batch, targetLang, sourceLang) {
    const baseInstructions = [
      `You are a professional translator. Translate the following numbered text segments from ${sourceLang} to ${targetLang}.`,
      '',
      'Requirements:',
      '1. Maintain the original meaning, tone, and context accurately for each segment',
      '2. Use natural, fluent language that sounds native to the target language',
      '3. Preserve technical terms, proper nouns, and brand names when appropriate',
      '4. Return translations in the same numbered format as the input',
      '5. Each translation should be on a separate line with its corresponding number',
      '6. Only return the numbered translations without any additional text or commentary'
    ];

    // Check if any group contains HTML
    const hasHtml = batch.some(group => this.containsHtmlTags(group.combinedText));
    if (hasHtml) {
      baseInstructions.push('7. Some segments contain HTML tags. Preserve all HTML tags and their structure exactly');
      baseInstructions.push('8. Only translate the text content within HTML tags, not the tags themselves');
      baseInstructions.push('9. Maintain the exact same HTML structure in each translation');
    }

    const specificInstructions = this.getLanguageSpecificInstructions(targetLang, sourceLang);
    const fullInstructions = [...baseInstructions, ...specificInstructions];

    // Create numbered text segments from paragraph groups
    const numberedTexts = batch.map((group, index) => `${index + 1}. ${group.combinedText}`).join('\n');

    return `${fullInstructions.join('\n')}

Text segments to translate:
${numberedTexts}

Translations:`;
  }

  /**
   * Split merged group translation results back to individual groups
   */
  splitMergedGroupTranslation(batch, mergedTranslation) {
    const lines = mergedTranslation.split('\n').filter(line => line.trim());
    const results = [];

    batch.forEach((group, index) => {
      const expectedNumber = index + 1;
      let translation = '';

      // Find the corresponding translation line
      const translationLine = lines.find(line => {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        return match && parseInt(match[1]) === expectedNumber;
      });

      if (translationLine) {
        const match = translationLine.match(/^(\d+)\.\s*(.+)$/);
        translation = match ? match[2].trim() : group.combinedText;
      } else {
        // Fallback: try to get translation by index
        const fallbackLine = lines[index];
        if (fallbackLine) {
          translation = fallbackLine.replace(/^\d+\.\s*/, '').trim();
        } else {
          translation = group.combinedText; // Ultimate fallback
        }
      }

      const result = {
        id: group.id,
        container: group.container,
        textNodes: group.textNodes,
        originalText: group.combinedText,
        translation: translation,
        success: true,
        batchIndex: group.batchIndex,
        totalGroups: batch.length,
        processingTime: 0,
        isMerged: true,
        htmlContent: group.htmlContent || ''
      };

      results.push(result);
    });

    return results;
  }

  /**
   * Fallback to individual group translation when merge fails
   */
  async fallbackToIndividualGroupTranslation(batch, targetLanguage, sourceLanguage, progressCallback) {
    const results = [];

    for (const group of batch) {
      try {
        const startTime = Date.now();
        const translation = await this.translateText(group.combinedText, targetLanguage, sourceLanguage);
        const processingTime = Date.now() - startTime;

        const result = {
          id: group.id,
          container: group.container,
          textNodes: group.textNodes,
          originalText: group.combinedText,
          translation: translation,
          success: true,
          batchIndex: group.batchIndex,
          totalGroups: batch.length,
          processingTime: processingTime,
          isMerged: false,
          htmlContent: group.htmlContent || ''
        };

        results.push(result);

        if (progressCallback) {
          progressCallback(result);
        }
      } catch (error) {
        const result = {
          id: group.id,
          container: group.container,
          textNodes: group.textNodes,
          originalText: group.combinedText,
          error: error.message,
          success: false,
          batchIndex: group.batchIndex,
          totalGroups: batch.length,
          isMerged: false,
          htmlContent: group.htmlContent || ''
        };

        results.push(result);

        if (progressCallback) {
          progressCallback(result);
        }
      }
    }

    return results;
  }

  /**
   * Calculate optimal delay between batches based on performance
   */
  calculateBatchDelay(batchSize) {
    const baseDelay = 200;
    const sizeMultiplier = Math.min(batchSize / 5, 1.5);
    return Math.floor(baseDelay * sizeMultiplier);
  }
}

/**
 * Concurrency control semaphore for managing parallel translations
 */
class ConcurrencySemaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.waitingQueue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentCount < this.maxConcurrency) {
        this.currentCount++;
        resolve(() => this.release());
      } else {
        this.waitingQueue.push(() => {
          this.currentCount++;
          resolve(() => this.release());
        });
      }
    });
  }

  release() {
    this.currentCount--;
    if (this.waitingQueue.length > 0) {
      const next = this.waitingQueue.shift();
      next();
    }
  }

  getStats() {
    return {
      maxConcurrency: this.maxConcurrency,
      currentCount: this.currentCount,
      waitingCount: this.waitingQueue.length
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationService;
} else if (typeof window !== 'undefined') {
  window.TranslationService = TranslationService;
}
