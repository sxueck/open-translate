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
    console.log('[TranslationService] Initializing translation service...');

    const config = await this.getStoredConfig();
    this.config = { ...this.defaultConfig, ...config };

    console.log('[TranslationService] Configuration loaded:', {
      hasApiKey: !!this.config.apiKey,
      apiUrl: this.config.apiUrl,
      model: this.config.model,
      customModel: this.config.customModel
    });

    // 验证必要的配置
    if (!this.config.apiKey) {
      console.warn('[TranslationService] API key not configured');
    }

    if (!this.config.apiUrl) {
      console.warn('[TranslationService] API URL not configured');
    }

    console.log('[TranslationService] Translation service initialized successfully');
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
  async translateText(text, targetLanguage = 'zh-CN', sourceLanguage = 'auto', options = {}) {
    console.log('[TranslationService] Starting translation:', {
      textLength: text?.length,
      targetLanguage,
      sourceLanguage,
      hasOptions: !!options,
      context: options.context
    });

    if (!this.config.apiKey) {
      console.error('[TranslationService] API key not configured');
      throw new Error('API key not configured');
    }

    // 增强选项，添加上下文信息
    const enhancedOptions = await this.enhanceTranslationOptions(options, text);
    console.log('[TranslationService] Enhanced options prepared');

    const prompt = this.buildTranslationPrompt(text, targetLanguage, sourceLanguage, enhancedOptions);
    console.log('[TranslationService] Translation prompt built, length:', prompt?.length);

    try {
      console.log('[TranslationService] Making API request...');
      const response = await this.makeAPIRequest(prompt, enhancedOptions);
      console.log('[TranslationService] API request completed successfully');

      const translation = this.extractTranslation(response);
      console.log('[TranslationService] Translation extracted:', {
        hasTranslation: !!translation,
        translationLength: translation?.length
      });

      return translation;
    } catch (error) {
      console.error('[TranslationService] Translation failed:', error);

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
   * Enhance translation options with context information
   */
  async enhanceTranslationOptions(options = {}, text = '') {
    const enhanced = { ...options };

    // Add page title if available
    if (typeof document !== 'undefined' && !enhanced.title) {
      enhanced.title = document.title || '';
    }

    enhanced.text = text;
    return enhanced;
  }

  /**
   * Build translation prompt for API
   */
  buildTranslationPrompt(text, targetLanguage, sourceLanguage, options = {}) {
    const targetLang = LANGUAGE_MAP[targetLanguage] || targetLanguage;

    // Build system and user prompts
    const systemPrompt = this.buildSystemPrompt(targetLang, options);
    const userPrompt = this.buildUserPrompt(text, targetLang);

    // Return combined prompt for backward compatibility
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Also provide separated prompts in options for APIs that support system messages
    options.systemPrompt = systemPrompt;
    options.userPrompt = userPrompt;

    return combinedPrompt;
  }

  /**
   * Build contextual translation prompt with language-specific optimizations
   */
  buildContextualPrompt(text, targetLang, options = {}) {
    const systemPrompt = this.buildSystemPrompt(targetLang, options);
    const userPrompt = this.buildUserPrompt(text, targetLang);

    return `${systemPrompt}\n\n${userPrompt}`;
  }

  /**
   * Build system prompt (role definition and rules)
   */
  buildSystemPrompt(targetLang, options = {}) {
    const baseInstructions = [
      `You are a professional ${targetLang} native translator with excellent language skills and cultural understanding.`,
      '',
      '## Translation Principles',
      '1. PRIORITY: Create natural, fluent translations that sound like they were originally written in ${targetLang}',
      '2. Avoid literal word-for-word translations - prioritize natural expression over strict structural adherence',
      '3. Use idiomatic expressions and natural sentence patterns of the target language',
      '4. Adapt cultural references and concepts to be understandable in the target culture',
      '5. Maintain the original meaning and intent, but express it in the most natural way possible',
      '',
      '## Output Requirements',
      '6. Output only the translated content, without explanations or additional content',
      '7. Maintain the same number of paragraphs and overall structure as the original',
      '8. For technical terms, proper nouns, and brand names, keep them unchanged when appropriate',
      '9. Choose the most contextually appropriate translation for ambiguous terms',
      '10. Maintain consistency in terminology throughout the text',
      '11. Preserve the original tone and register (formal, informal, technical, casual)'
    ];

    if (options.translationMode === TRANSLATION_MODES.REPLACE) {
      baseInstructions.push('12. Return only plain text translation without any HTML tags, markup, or formatting');
      baseInstructions.push('13. If the input contains HTML tags, extract and translate only the text content, ignoring all HTML markup');
      baseInstructions.push('14. CRITICAL: Do not repeat the translation multiple times - provide only one clean translation per input');
    } else if (this.containsHtmlTags(options.text || text)) {
      baseInstructions.push('12. The text contains HTML tags. Preserve ALL HTML tags, attributes, and structure EXACTLY as they appear');
      baseInstructions.push('13. Only translate the text content within HTML tags, never translate tag names, attribute names, or attribute values');
      baseInstructions.push('14. Maintain the exact same HTML structure, nesting, and tag order in the translation');
      baseInstructions.push('15. Preserve all attributes including href, class, title, data-*, aria-*, etc.');
      baseInstructions.push('16. Do not add, remove, or modify any HTML tags or attributes');
    }

    // Add context awareness section
    const contextSection = this.buildContextSection(options);

    // Add language-specific instructions
    const specificInstructions = this.getLanguageSpecificInstructions(targetLang);

    // Add technical content instructions if needed
    const technicalInstructions = this.getTechnicalInstructions(options.text || text);

    const allInstructions = [...baseInstructions, ...contextSection, ...specificInstructions, ...technicalInstructions];

    return allInstructions.join('\n');
  }

  /**
   * Build user prompt (actual translation request)
   */
  buildUserPrompt(text, targetLang) {
    // 对用户输入的文本进行基本的安全检查
    const sanitizedText = this.sanitizeTranslationText(text);

    return `Translate to ${targetLang} (output translation only):

${sanitizedText}`;
  }

  /**
   * 清理翻译文本，防止提示注入但保持翻译内容完整性
   */
  sanitizeTranslationText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // 对于翻译文本，我们需要更保守的清理，主要防止明显的提示注入
    // 但要保持文本内容的完整性
    let sanitized = text;

    // 检测并标记可能的提示注入尝试
    const suspiciousPatterns = [
      /^\s*(ignore|forget|system|assistant|user)\s*:/i,
      /^\s*##\s*(new|different|alternative)\s+(instruction|prompt|rule)/i,
      /^\s*\d+\.\s*(ignore|forget|instead|now)/i
    ];

    const hasSuspiciousContent = suspiciousPatterns.some(pattern => pattern.test(sanitized));

    if (hasSuspiciousContent) {
      // 如果检测到可疑内容，在文本前添加明确的分隔符
      sanitized = `[TEXT TO TRANSLATE]\n${sanitized}\n[END OF TEXT]`;
    }

    return sanitized;
  }

  /**
   * Build context awareness section
   */
  buildContextSection(options = {}) {
    const contextInstructions = [];

    if (options.title) {
      // 清理标题内容，防止提示注入攻击
      const sanitizedTitle = this.sanitizePromptInput(options.title);
      contextInstructions.push('');
      contextInstructions.push('## Context Awareness');
      contextInstructions.push('Document Metadata:');
      contextInstructions.push(`Title: 《${sanitizedTitle}》`);
    }

    return contextInstructions;
  }

  /**
   * 清理提示输入，防止提示注入攻击
   */
  sanitizePromptInput(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // 移除可能的提示注入模式
    return input
      // 移除多行指令分隔符
      .replace(/\n\s*##\s*/g, ' ')
      .replace(/\n\s*\d+\.\s*/g, ' ')
      // 移除角色定义尝试
      .replace(/\b(you are|act as|pretend to be|ignore previous|forget|system|assistant|user):/gi, '')
      // 移除指令关键词
      .replace(/\b(translate|output|return|respond|answer|ignore|forget|system|prompt)\s*:/gi, '')
      // 限制长度，防止过长的注入尝试
      .substring(0, 200)
      // 移除多余空格
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 验证提示内容的安全性
   */
  validatePromptSecurity(content, type) {
    if (!content || typeof content !== 'string') {
      return;
    }

    // 检测高风险的提示注入模式
    const highRiskPatterns = [
      // 角色重定义尝试
      /\b(you are now|from now on|ignore previous|forget everything|new instructions?)\b/gi,
      // 系统提示覆盖尝试
      /\b(system\s*:|assistant\s*:|user\s*:)\s*(ignore|forget|override)/gi,
      // 输出格式劫持尝试
      /\b(instead of translating|don't translate|output|return|respond with)\s*:/gi
    ];

    const hasHighRiskContent = highRiskPatterns.some(pattern => pattern.test(content));

    if (hasHighRiskContent) {
      console.warn(`[Security] Potential prompt injection detected in ${type} prompt`);
      // 在生产环境中，可以考虑记录到安全日志或采取其他措施
    }

    // 检查提示长度，防止过长的注入尝试
    if (content.length > 50000) {
      throw new Error('Prompt content too long, potential security risk');
    }
  }

  /**
   * Get language-specific translation instructions
   */
  getLanguageSpecificInstructions(targetLang) {
    const instructions = [];

    if (targetLang.includes('Chinese')) {
      instructions.push('');
      instructions.push('## Chinese Translation Excellence Guidelines:');
      instructions.push('- CRITICAL: Prioritize natural Chinese expression over literal translation');
      instructions.push('- Use authentic Chinese sentence patterns and word order');
      instructions.push('- Apply appropriate Chinese idioms, expressions, and colloquialisms when they fit naturally');
      instructions.push('- Ensure smooth, readable flow that sounds like native Chinese writing');
      instructions.push('- Use proper Chinese punctuation and formatting conventions');
      instructions.push('- Always add a space between Chinese characters and English words, numbers, or technical terms');
      instructions.push('- Choose the most natural Chinese equivalent rather than direct word substitution');
      instructions.push('- Use appropriate measure words, connectors, and sentence structures for clarity');
      instructions.push('- Adapt sentence length and complexity to match Chinese reading habits');

      if (targetLang === 'Simplified Chinese') {
        instructions.push('- Use simplified Chinese characters and mainland China linguistic conventions');
        instructions.push('- Prefer contemporary, widely-used Chinese expressions');
        instructions.push('- Follow mainland Chinese usage patterns and terminology preferences');
      } else {
        instructions.push('- Use traditional Chinese characters and Taiwan/Hong Kong conventions');
        instructions.push('- Follow traditional Chinese linguistic patterns and terminology');
      }
    }

    // English-specific instructions
    if (targetLang === 'English') {
      instructions.push('');
      instructions.push('English-specific requirements:');
      instructions.push('- Use American English spelling and conventions unless context suggests otherwise');
      instructions.push('- Maintain appropriate register (formal/informal) based on source text');
      instructions.push('- Use natural English sentence structures and idiomatic expressions');
      instructions.push('- Ensure proper grammar, punctuation, and capitalization');
      instructions.push('- Use active voice when appropriate for clarity');
      instructions.push('- Maintain consistency in terminology and style');
    }

    // Japanese-specific instructions
    if (targetLang === 'Japanese') {
      instructions.push('');
      instructions.push('Japanese-specific requirements:');
      instructions.push('- Use appropriate levels of politeness (keigo) based on context');
      instructions.push('- Choose between hiragana, katakana, and kanji appropriately');
      instructions.push('- Maintain natural Japanese sentence flow and particle usage');
      instructions.push('- Use proper Japanese punctuation and formatting');
      instructions.push('- Consider cultural context and adapt expressions accordingly');
    }

    // Korean-specific instructions
    if (targetLang === 'Korean') {
      instructions.push('');
      instructions.push('Korean-specific requirements:');
      instructions.push('- Use appropriate levels of formality based on context');
      instructions.push('- Choose between formal and informal speech patterns appropriately');
      instructions.push('- Maintain natural Korean sentence structure and word order');
      instructions.push('- Use proper Korean punctuation and formatting');
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
  async makeAPIRequest(prompt, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // 系统消息和用户消息分离，以加强 LLM 的注意力
      let messages;
      if (options.systemPrompt && options.userPrompt) {
        // 验证提示内容的安全性
        this.validatePromptSecurity(options.systemPrompt, 'system');
        this.validatePromptSecurity(options.userPrompt, 'user');

        messages = [
          {
            role: 'system',
            content: options.systemPrompt
          },
          {
            role: 'user',
            content: options.userPrompt
          }
        ];
      } else {
        // 验证组合提示的安全性
        this.validatePromptSecurity(prompt, 'combined');

        messages = [
          {
            role: 'user',
            content: prompt
          }
        ];
      }

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.getCurrentModel(),
          messages: messages,
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
  async batchMergeTranslate(textSegments, targetLanguage = 'zh-CN', sourceLanguage = 'auto', options = {}) {
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
      const mergedResults = await this.processMergedShortTexts(shortTexts, targetLanguage, sourceLanguage, mergeConfig, options);
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
  async processMergedShortTexts(shortTexts, targetLanguage, sourceLanguage, mergeConfig, options = {}) {
    const mergedBatches = this.createMergedBatches(shortTexts, mergeConfig);
    const results = [];

    for (const batch of mergedBatches) {
      try {
        const mergedTranslation = await this.translateMergedBatch(batch, targetLanguage, sourceLanguage, options);
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
  async translateMergedBatch(batch, targetLanguage, sourceLanguage, options = {}) {
    const mergedPrompt = this.buildMergedTranslationPrompt(batch, targetLanguage, sourceLanguage, options);
    const response = await this.makeAPIRequest(mergedPrompt);
    return this.extractTranslation(response);
  }

  /**
   * Build prompt for merged translation
   */
  buildMergedTranslationPrompt(batch, targetLang, sourceLang, options = {}) {
    const baseInstructions = [
      `You are a professional ${targetLang} native translator with excellent linguistic skills.`,
      '',
      'Translation Excellence Requirements:',
      '1. PRIORITY: Create natural, fluent translations that sound like native ${targetLang} writing',
      '2. Avoid literal word-for-word translations - use natural ${targetLang} expressions',
      '3. Maintain the original meaning and intent while adapting to ${targetLang} linguistic patterns',
      '4. Use idiomatic expressions and natural sentence structures of ${targetLang}',
      '5. Preserve technical terms, proper nouns, and brand names when appropriate',
      '6. Return translations in the same numbered format as the input',
      '7. Each translation should be on a separate line with its corresponding number',
      '8. Only return the numbered translations without any additional text or commentary',
      '9. Ensure excellent readability and natural flow in ${targetLang}',
      '10. When translating to Chinese, always add a space between Chinese text and English words/numbers'
    ];

    // 根据翻译模式处理HTML内容
    const hasHtml = batch.some(item => this.containsHtmlTags(item.text));
    if (options.translationMode === TRANSLATION_MODES.REPLACE) {
      if (hasHtml) {
        baseInstructions.push('11. Some segments contain HTML tags. Extract and translate only the text content, ignoring all HTML markup');
        baseInstructions.push('12. Return only plain text translations without any HTML tags, markup, or formatting');
        baseInstructions.push('13. CRITICAL: Each numbered item should have exactly ONE translation - do not repeat translations');
      } else {
        baseInstructions.push('11. Return only plain text translations without any HTML tags, markup, or formatting');
        baseInstructions.push('12. CRITICAL: Each numbered item should have exactly ONE translation - do not repeat translations');
      }
    } else if (hasHtml) {
      baseInstructions.push('11. Some segments contain HTML tags. Preserve ALL HTML tags, attributes, and structure EXACTLY as they appear');
      baseInstructions.push('12. Only translate the text content within HTML tags, never translate tag names, attribute names, or attribute values');
      baseInstructions.push('13. Maintain the exact same HTML structure, nesting, and tag order in each translation');
      baseInstructions.push('14. Preserve all attributes including href, class, title, data-*, aria-*, etc.');
      baseInstructions.push('15. Do not add, remove, or modify any HTML tags or attributes');
    }

    const specificInstructions = this.getLanguageSpecificInstructions(targetLang);
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
  async translateParagraphGroups(paragraphGroups, targetLanguage = 'zh-CN', sourceLanguage = 'auto', progressCallback = null, options = {}) {
    const enableMerge = this.config.enableMerge !== false; // Default to true

    if (enableMerge) {
      return await this.translateParagraphGroupsWithMerge(paragraphGroups, targetLanguage, sourceLanguage, progressCallback, options);
    } else {
      return await this.translateParagraphGroupsIndividually(paragraphGroups, targetLanguage, sourceLanguage, progressCallback, options);
    }
  }

  /**
   * Translate paragraph groups individually (original method)
   */
  async translateParagraphGroupsIndividually(paragraphGroups, targetLanguage = 'zh-CN', sourceLanguage = 'auto', progressCallback = null, options = {}) {
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
            sourceLanguage,
            options
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
  async translateParagraphGroupsWithMerge(paragraphGroups, targetLanguage, sourceLanguage, progressCallback, options = {}) {
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
      }, options);
      results.push(...longResults);
    }

    // Process short groups with merging
    if (shortGroups.length > 0) {
      const mergedResults = await this.processMergedParagraphGroups(shortGroups, targetLanguage, sourceLanguage, (result) => {
        processedCount++;
        if (progressCallback) {
          progressCallback(result, processedCount, totalGroups);
        }
      }, options);
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
  async processMergedParagraphGroups(shortGroups, targetLanguage, sourceLanguage, progressCallback, options = {}) {
    const mergeConfig = this.getMergeConfig();
    const mergedBatches = this.createMergedGroupBatches(shortGroups, mergeConfig);
    const results = [];

    for (const batch of mergedBatches) {
      try {
        const mergedTranslation = await this.translateMergedGroupBatch(batch, targetLanguage, options);
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
  async translateMergedGroupBatch(batch, targetLanguage, options = {}) {
    const mergedPrompt = this.buildMergedGroupTranslationPrompt(batch, targetLanguage, options);
    const response = await this.makeAPIRequest(mergedPrompt);
    return this.extractTranslation(response);
  }

  /**
   * Build prompt for merged group translation
   */
  buildMergedGroupTranslationPrompt(batch, targetLang, options = {}) {
    const systemPrompt = this.buildMultipleSystemPrompt(targetLang, options);
    const userPrompt = this.buildMultipleUserPrompt(batch, targetLang);

    return `${systemPrompt}\n\n${userPrompt}`;
  }

  /**
   * Build system prompt for multiple paragraph translation
   */
  buildMultipleSystemPrompt(targetLang, options = {}) {
    const baseInstructions = [
      `You are a professional ${targetLang} native translator with exceptional linguistic skills and cultural understanding.`,
      '',
      '## Translation Excellence Principles',
      '1. PRIORITY: Create natural, fluent translations that read like native ${targetLang} content',
      '2. Avoid literal translations - use natural ${targetLang} expressions and sentence patterns',
      '3. Adapt content to ${targetLang} linguistic and cultural conventions',
      '4. Use idiomatic expressions and natural word order of ${targetLang}',
      '5. Maintain the original meaning and intent while optimizing for ${targetLang} readability',
      '',
      '## Output Requirements',
      '6. Output only the translated content, without explanations or additional text',
      '7. Return translations in the same numbered format as the input',
      '8. Each translation should be on a separate line with its corresponding number',
      '9. Only return the numbered translations without any additional commentary',
      '10. Maintain consistency in terminology across all segments',
      '11. Ensure excellent flow and natural expression in ${targetLang}'
    ];

    // Add context awareness section
    const contextSection = this.buildContextSection(options);

    // Add input-output format examples
    const formatExamples = this.buildFormatExamples();

    // Add language-specific instructions
    const specificInstructions = this.getLanguageSpecificInstructions(targetLang);

    const allInstructions = [...baseInstructions, ...contextSection, ...formatExamples, ...specificInstructions];

    return allInstructions.join('\n');
  }

  /**
   * Build user prompt for multiple paragraph translation
   */
  buildMultipleUserPrompt(batch, targetLang) {
    // Create numbered text segments from paragraph groups
    const numberedTexts = batch.map((group, index) => `${index + 1}. ${group.combinedText}`).join('\n');

    return `Translate to ${targetLang}:

${numberedTexts}`;
  }

  /**
   * Build format examples for multiple paragraph translation
   */
  buildFormatExamples() {
    return [
      '',
      '## Input-Output Format Examples',
      '### Input Example:',
      'Paragraph A',
      '%%',
      'Paragraph B',
      '%%',
      'Paragraph C',
      '%%',
      'Paragraph D',
      '### Output Example:',
      'Translation A',
      '%%',
      'Translation B',
      '%%',
      'Translation C',
      '%%',
      'Translation D'
    ];
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
