/**
 * Error Classifier
 * Classifies errors for appropriate handling decisions
 */

class ErrorClassifier {
  /**
   * Classify an error for handling
   * Returns: { type, retryable, severity, suggestedAction }
   */
  classify(error) {
    return {
      type: this.getErrorType(error),
      retryable: this.isRetryable(error),
      severity: this.getSeverity(error),
      suggestedAction: this.getSuggestedAction(error)
    };
  }

  /**
   * Determine error type from error code
   */
  getErrorType(error) {
    const code = error.code;

    if (code === 429) return 'RATE_LIMIT';
    if (code === 401) return 'AUTH';
    if (code === 403) return 'FORBIDDEN';
    if (typeof code === 'number' && code >= 500 && code < 600) return 'SERVER_ERROR';
    if (typeof code === 'number' && code >= 400 && code < 500) return 'CLIENT_ERROR';
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT') return 'NETWORK';
    
    return 'UNKNOWN';
  }

  /**
   * Determine if error is retryable
   */
  isRetryable(error) {
    const type = this.getErrorType(error);
    const retryableTypes = ['RATE_LIMIT', 'SERVER_ERROR', 'NETWORK'];
    return retryableTypes.includes(type);
  }

  /**
   * Assess error severity
   */
  getSeverity(error) {
    const type = this.getErrorType(error);

    switch (type) {
      case 'RATE_LIMIT':
        return 'LOW';
      case 'AUTH':
      case 'FORBIDDEN':
        return 'HIGH';
      case 'SERVER_ERROR':
      case 'NETWORK':
      case 'CLIENT_ERROR':
        return 'MEDIUM';
      default:
        return 'MEDIUM';
    }
  }

  /**
   * Get suggested action for error
   */
  getSuggestedAction(error) {
    const type = this.getErrorType(error);

    switch (type) {
      case 'RATE_LIMIT':
        return 'Switch to different provider';
      case 'AUTH':
        return 'Check API key configuration';
      case 'SERVER_ERROR':
        return 'Retry with backoff';
      case 'NETWORK':
        return 'Retry with backoff';
      case 'FORBIDDEN':
        return 'Check permissions and API key';
      case 'CLIENT_ERROR':
        return 'Check request parameters';
      default:
        return 'Contact support';
    }
  }
}

module.exports = { ErrorClassifier };
