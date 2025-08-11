/**
 * Centralized constants for Open Translate extension
 * Eliminates hardcoded values and duplicated constants across modules
 */

// Storage keys
const STORAGE_KEYS = {
  TRANSLATION_CONFIG: 'translationConfig',
  TRANSLATION_MODE: 'translationMode',
  TARGET_LANGUAGE: 'targetLanguage',
  SOURCE_LANGUAGE: 'sourceLanguage',
  AUTO_TRANSLATE: 'autoTranslate',

  PRESERVE_FORMATTING: 'preserveFormatting',
  EXCLUDE_SELECTORS: 'excludeSelectors',
  BATCH_SIZE: 'batchSize',
  RETRY_ATTEMPTS: 'retryAttempts'
};

// Language mappings
const LANGUAGE_MAP = {
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'ru': 'Russian',
  'pt': 'Portuguese',
  'it': 'Italian',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'th': 'Thai',
  'vi': 'Vietnamese'
};

// Supported language codes
const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_MAP);

// Translation modes
const TRANSLATION_MODES = {
  REPLACE: 'replace',
  BILINGUAL: 'bilingual'
};

// API configuration
const API_DEFAULTS = {
  URL: 'https://api.openai.com/v1/chat/completions',
  MODEL: 'gpt-3.5-turbo',
  TEMPERATURE: 0.3,
  MAX_TOKENS: 2000,
  TIMEOUT: 30000
};

// Performance constants
const PERFORMANCE = {
  BATCH_SIZE: 5,
  MAX_BATCH_SIZE: 20,
  MIN_BATCH_SIZE: 1,
  BATCH_DELAY: 1000,
  RETRY_ATTEMPTS: 2,
  MAX_RETRY_ATTEMPTS: 5,
  DEBOUNCE_DELAY: 300,
  DOM_MUTATION_DELAY: 500
};

// Text processing constants
const TEXT_PROCESSING = {
  MIN_TEXT_LENGTH: 2,
  MIN_SIGNIFICANT_LENGTH: 1,
  MAX_TEXT_LENGTH: 5000,
  PARAGRAPH_SEPARATOR: '\n\n'
};

// DOM selectors
const DOM_SELECTORS = {
  EXCLUDE_DEFAULT: [
    'script',
    'style',
    'noscript',
    'iframe',
    'object',
    'embed',
    'canvas',
    'svg',
    'math',
    'code',
    'pre',
    'kbd',
    'samp',
    'var',
    '[data-translate="no"]',
    '.notranslate',
    '[translate="no"]'
  ],
  BLOCK_ELEMENTS: [
    'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'article', 'section', 'header', 'footer', 'main',
    'aside', 'nav', 'blockquote', 'pre', 'li', 'td', 'th'
  ],
  BILINGUAL_CONTAINER: '.ot-bilingual-container',
  BILINGUAL_ORIGINAL: '.ot-original',
  BILINGUAL_TRANSLATION: '.ot-translation',
  STYLE_ID: 'open-translate-bilingual-styles'
};

// Regular expressions
const REGEX_PATTERNS = {
  PURE_NUMBERS_SYMBOLS: /^[\d\s\W]*$/,
  CHINESE_CHARS: /[\u4e00-\u9fff\u3400-\u4dbf]/,
  TECHNICAL_CONTENT: [
    /\b(API|HTTP|JSON|XML|CSS|HTML|JavaScript|Python|Java|SQL)\b/i,
    /\b(function|class|method|variable|parameter|return)\b/i,
    /[{}[\]();]/,
    /https?:\/\//,
    /\w+\.\w+\(/,
    /\$\w+/,
    /@\w+/
  ],
  URL: /https?:\/\/[^\s]+/g,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
};

// Error messages
const ERROR_MESSAGES = {
  API_KEY_MISSING: 'API key not configured',
  TRANSLATION_FAILED: 'Translation failed',
  NO_TRANSLATABLE_TEXT: 'No translatable text found on this page',
  NETWORK_ERROR: 'Network error occurred',
  TIMEOUT_ERROR: 'Request timeout',
  INVALID_RESPONSE: 'Invalid API response',
  QUOTA_EXCEEDED: 'API quota exceeded',
  RATE_LIMITED: 'Rate limit exceeded'
};



// Context menu IDs
const CONTEXT_MENU_IDS = {
  TRANSLATE_PAGE: 'translate-page',
  TRANSLATE_SELECTION: 'translate-selection',
  RESTORE_ORIGINAL: 'restore-original',
  MODE_REPLACE: 'mode-replace',
  MODE_BILINGUAL: 'mode-bilingual'
};

// Message actions
const MESSAGE_ACTIONS = {
  TRANSLATE: 'translate',
  RESTORE: 'restore',
  SWITCH_MODE: 'switchMode',
  GET_STATUS: 'getStatus',
  STATUS_UPDATE: 'statusUpdate',
  TEXT_SELECTED: 'textSelected',
  GET_TAB_STATUS: 'getTabStatus',
  UPDATE_CONFIG: 'updateConfig'
};

// Translation status
const TRANSLATION_STATUS = {
  READY: 'ready',
  TRANSLATING: 'translating',
  TRANSLATED: 'translated',
  RESTORING: 'restoring',
  RESTORED: 'restored',
  ERROR: 'error'
};

// CSS classes
const CSS_CLASSES = {
  BILINGUAL_CONTAINER: 'ot-bilingual-container',
  ORIGINAL_TEXT: 'ot-original',
  TRANSLATED_TEXT: 'ot-translation',
  LOADING: 'ot-loading',
  ERROR: 'ot-error',
  HIDDEN: 'ot-hidden'
};

// Validation limits
const VALIDATION_LIMITS = {
  TEMPERATURE: { min: 0, max: 2 },
  MAX_TOKENS: { min: 1, max: 4000 },
  TIMEOUT: { min: 5000, max: 120000 },
  BATCH_SIZE: { min: 1, max: 20 },
  RETRY_ATTEMPTS: { min: 0, max: 5 }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    LANGUAGE_MAP,
    SUPPORTED_LANGUAGES,
    TRANSLATION_MODES,
    API_DEFAULTS,
    PERFORMANCE,
    TEXT_PROCESSING,
    DOM_SELECTORS,
    REGEX_PATTERNS,
    ERROR_MESSAGES,
    CONTEXT_MENU_IDS,
    MESSAGE_ACTIONS,
    TRANSLATION_STATUS,
    CSS_CLASSES,
    VALIDATION_LIMITS
  };
} else if (typeof window !== 'undefined') {
  Object.assign(window, {
    STORAGE_KEYS,
    LANGUAGE_MAP,
    SUPPORTED_LANGUAGES,
    TRANSLATION_MODES,
    API_DEFAULTS,
    PERFORMANCE,
    TEXT_PROCESSING,
    DOM_SELECTORS,
    REGEX_PATTERNS,
    ERROR_MESSAGES,
    CONTEXT_MENU_IDS,
    MESSAGE_ACTIONS,
    TRANSLATION_STATUS,
    CSS_CLASSES,
    VALIDATION_LIMITS
  });
}
