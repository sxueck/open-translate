/**
 * Unified error handling system for Open Translate extension
 * Standardizes error handling across all modules
 */

/**
 * Custom error classes for different error types
 */
class TranslationError extends Error {
  constructor(message, code = 'TRANSLATION_ERROR', details = null) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class APIError extends TranslationError {
  constructor(message, statusCode = null, response = null) {
    super(message, 'API_ERROR', { statusCode, response });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

class ConfigurationError extends TranslationError {
  constructor(message, field = null) {
    super(message, 'CONFIG_ERROR', { field });
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

class NetworkError extends TranslationError {
  constructor(message, originalError = null) {
    super(message, 'NETWORK_ERROR', { originalError: originalError?.message });
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * Error handler class for centralized error management
 */
class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.notificationEnabled = true;
  }

  /**
   * Handle different types of errors with appropriate responses
   */
  handle(error, context = 'unknown', options = {}) {
    const errorInfo = this.processError(error, context);
    
    // Log error
    this.logError(errorInfo);
    
    // Show notification if enabled and not suppressed
    if (this.notificationEnabled && !options.suppressNotification) {
      this.showErrorNotification(errorInfo, options.notificationOptions);
    }
    
    // Console logging for development
    if (options.logToConsole !== false) {
      this.logToConsole(errorInfo);
    }
    
    // Report to background if needed
    if (options.reportToBackground && context !== 'background') {
      this.reportToBackground(errorInfo);
    }
    
    return errorInfo;
  }

  /**
   * Process error into standardized format
   */
  processError(error, context) {
    const errorInfo = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      context: context,
      type: error.name || 'Error',
      code: error.code || 'UNKNOWN_ERROR',
      message: (typeof formatError !== 'undefined') ? formatError(error) : (error.message || String(error)),
      details: error.details || null,
      stack: error.stack || null
    };

    // Add specific handling for different error types
    if (error instanceof APIError) {
      errorInfo.statusCode = error.statusCode;
      errorInfo.apiResponse = error.response;
    } else if (error instanceof NetworkError) {
      errorInfo.networkError = true;
      errorInfo.originalError = error.originalError?.message;
    } else if (error instanceof ConfigurationError) {
      errorInfo.configField = error.field;
    }

    return errorInfo;
  }

  /**
   * Log error to internal log
   */
  logError(errorInfo) {
    this.errorLog.unshift(errorInfo);
    
    // Maintain log size limit
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize);
    }
  }

  /**
   * Show error notification to user
   */
  showErrorNotification(errorInfo, options = {}) {
    const title = options.title || this.getErrorTitle(errorInfo);
    const message = options.message || this.getErrorMessage(errorInfo);

    console.error(`${title}: ${message}`);
  }

  /**
   * Log error to console with appropriate level
   */
  logToConsole(errorInfo) {
    const logLevel = this.getLogLevel(errorInfo);
    const logMessage = `[${errorInfo.context}] ${errorInfo.type}: ${errorInfo.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, errorInfo);
        break;
      case 'warn':
        console.warn(logMessage, errorInfo);
        break;
      default:
        console.log(logMessage, errorInfo);
    }
  }

  /**
   * Report error to background script
   */
  async reportToBackground(errorInfo) {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        await chrome.runtime.sendMessage({
          action: 'errorReport',
          error: errorInfo
        });
      }
    } catch (e) {
      console.warn('Failed to report error to background:', e);
    }
  }

  /**
   * Get appropriate error title for notification
   */
  getErrorTitle(errorInfo) {
    switch (errorInfo.type) {
      case 'APIError':
        return 'API Error';
      case 'NetworkError':
        return 'Network Error';
      case 'ConfigurationError':
        return 'Configuration Error';
      case 'TranslationError':
        return 'Translation Error';
      default:
        return 'Error';
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(errorInfo) {
    // Map technical errors to user-friendly messages
    const messageMap = {
      'API key not configured': ERROR_MESSAGES.API_KEY_MISSING,
      'Network request failed': ERROR_MESSAGES.NETWORK_ERROR,
      'Request timeout': ERROR_MESSAGES.TIMEOUT_ERROR,
      'Invalid API response': ERROR_MESSAGES.INVALID_RESPONSE,
      'Rate limit exceeded': ERROR_MESSAGES.RATE_LIMITED,
      'Quota exceeded': ERROR_MESSAGES.QUOTA_EXCEEDED
    };

    return messageMap[errorInfo.message] || errorInfo.message;
  }

  /**
   * Determine appropriate log level
   */
  getLogLevel(errorInfo) {
    if (errorInfo.type === 'NetworkError' || errorInfo.type === 'APIError') {
      return 'error';
    } else if (errorInfo.type === 'ConfigurationError') {
      return 'warn';
    }
    return 'error';
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return (typeof generateId !== 'undefined') ? generateId('err') : `err-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errorLog.slice(0, limit);
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * Enable/disable notifications
   */
  setNotificationEnabled(enabled) {
    this.notificationEnabled = enabled;
  }

  /**
   * Create error from API response
   */
  createAPIError(response, statusCode) {
    let message = ERROR_MESSAGES.TRANSLATION_FAILED;
    
    if (statusCode === 401) {
      message = ERROR_MESSAGES.API_KEY_MISSING;
    } else if (statusCode === 429) {
      message = ERROR_MESSAGES.RATE_LIMITED;
    } else if (statusCode === 402) {
      message = ERROR_MESSAGES.QUOTA_EXCEEDED;
    } else if (statusCode >= 500) {
      message = ERROR_MESSAGES.NETWORK_ERROR;
    }
    
    return new APIError(message, statusCode, response);
  }

  /**
   * Wrap async function with error handling
   */
  wrapAsync(fn, context = 'async-operation', options = {}) {
    return async (...args) => {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        this.handle(error, context, options);
        throw error;
      }
    };
  }



  /**
   * Wrap function with error handling
   */
  wrapSync(fn, context = 'sync-operation', options = {}) {
    return (...args) => {
      try {
        return fn.apply(this, args);
      } catch (error) {
        this.handle(error, context, options);
        throw error;
      }
    };
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ErrorHandler,
    TranslationError,
    APIError,
    ConfigurationError,
    NetworkError,
    errorHandler
  };
} else if (typeof window !== 'undefined') {
  window.ErrorHandler = ErrorHandler;
  window.TranslationError = TranslationError;
  window.APIError = APIError;
  window.ConfigurationError = ConfigurationError;
  window.NetworkError = NetworkError;
  window.errorHandler = errorHandler;
}
