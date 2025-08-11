/**
 * Shared utility functions for Open Translate extension
 * Consolidates duplicate utility functions across modules
 */

/**
 * Debounce function to limit function calls
 */
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

/**
 * Throttle function to limit function execution frequency
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
}

/**
 * Check if text contains significant content for translation
 */
function hasSignificantText(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (trimmed.length < TEXT_PROCESSING.MIN_TEXT_LENGTH) return false;

  // Skip pure numbers, symbols, or whitespace
  if (REGEX_PATTERNS.PURE_NUMBERS_SYMBOLS.test(trimmed)) return false;

  // Skip single characters unless they are meaningful (e.g., Chinese characters)
  if (trimmed.length === TEXT_PROCESSING.MIN_SIGNIFICANT_LENGTH && !REGEX_PATTERNS.CHINESE_CHARS.test(trimmed)) return false;

  return true;
}

/**
 * Check if text contains technical content
 */
function containsTechnicalContent(text) {
  return REGEX_PATTERNS.TECHNICAL_CONTENT.some(pattern => pattern.test(text));
}

/**
 * Sanitize text for safe processing
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Get current tab information
 */
async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}



/**
 * Format error message for display
 */
function formatError(error) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && error.message) return error.message;
  return 'Unknown error occurred';
}

/**
 * Check if element should be excluded from translation
 */
function isExcludedElement(element, excludeSelectors = []) {
  if (!element || !element.matches) return true;

  const allSelectors = [...DOM_SELECTORS.EXCLUDE_DEFAULT, ...excludeSelectors];

  return allSelectors.some(selector => {
    try {
      return element.matches(selector);
    } catch (e) {
      return false;
    }
  });
}

/**
 * Get element's text content while preserving structure
 */
function getStructuredText(element) {
  if (!element) return '';
  
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        return hasSignificantText(node.textContent) 
          ? NodeFilter.FILTER_ACCEPT 
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const textParts = [];
  let node;
  while (node = walker.nextNode()) {
    textParts.push(node.textContent.trim());
  }

  return textParts.join(' ');
}

/**
 * Wait for specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}

/**
 * Validate language code
 */
function isValidLanguageCode(code, supportedLanguages) {
  return supportedLanguages.includes(code);
}

/**
 * Get language display name
 */
function getLanguageDisplayName(code, languageMap) {
  return languageMap[code] || code;
}

/**
 * Check if URL is valid
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Generate unique ID
 */
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Measure execution time of a function
 */
async function measureTime(fn, label = 'Operation') {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  console.log(`${label} took ${(end - start).toFixed(2)} milliseconds`);
  return result;
}

/**
 * Create safe event listener that handles errors
 */
function createSafeEventListener(handler, errorHandler = console.error) {
  return function(...args) {
    try {
      return handler.apply(this, args);
    } catch (error) {
      errorHandler(error);
    }
  };
}

/**
 * Check if extension context is valid
 */
function isExtensionContextValid() {
  try {
    return chrome && chrome.runtime && !chrome.runtime.lastError;
  } catch (e) {
    return false;
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    debounce,
    throttle,
    deepClone,
    hasSignificantText,
    containsTechnicalContent,
    sanitizeText,
    getCurrentTab,

    formatError,
    isExcludedElement,
    getStructuredText,
    sleep,
    retryWithBackoff,
    isValidLanguageCode,
    getLanguageDisplayName,
    isValidUrl,
    generateId,
    measureTime,
    createSafeEventListener,
    isExtensionContextValid
  };
} else if (typeof window !== 'undefined') {
  Object.assign(window, {
    debounce,
    throttle,
    deepClone,
    hasSignificantText,
    containsTechnicalContent,
    sanitizeText,
    getCurrentTab,

    formatError,
    isExcludedElement,
    getStructuredText,
    sleep,
    retryWithBackoff,
    isValidLanguageCode,
    getLanguageDisplayName,
    isValidUrl,
    generateId,
    measureTime,
    createSafeEventListener,
    isExtensionContextValid
  });
}
