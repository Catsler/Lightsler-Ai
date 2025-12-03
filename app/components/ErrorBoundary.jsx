import React from 'react';
import { Page, Card, BlockStack, Text, Button, InlineStack, Badge, Banner } from '@shopify/polaris';
import { withTranslation, useTranslation } from 'react-i18next';
import { UILogger } from '../utils/ui-helpers.js';

class ErrorBoundaryBase extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      isNetworkError: false,
      isUIError: false,
      errorCount: 0,
      lastErrorTime: null,
      canAutoRecover: false
    };
    
    // Bind methods
    this.handleReset = this.handleReset.bind(this);
    this.handleAutoRecover = this.handleAutoRecover.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Analyze error type
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';
    
    const isNetworkError = errorMessage.includes('Failed to fetch') || 
                          errorMessage.includes('NetworkError') ||
                          errorMessage.includes('fetch') ||
                          errorMessage.includes('NETWORK_ERROR');
                          
    const isUIError = errorMessage.includes('UI event handling error') ||
                     errorMessage.includes('state update error') ||
                     errorStack.includes('onClick') ||
                     errorStack.includes('onChange') ||
                     errorStack.includes('Select') ||
                     errorStack.includes('Button');
    
    // Determine if auto-recovery is possible
    const canAutoRecover = isUIError && !isNetworkError;
    
    const now = Date.now();
    
    return { 
      hasError: true, 
      isNetworkError,
      isUIError,
      canAutoRecover,
      lastErrorTime: now,
      // Increment in setState later to avoid functions in state
      errorCount: 1
    };
  }

  componentDidCatch(error, errorInfo) {
    const { t } = this.props;
    // Log error with UILogger
    UILogger.error(
      `${t('errors.boundary.captured')}: ${error.message}`,
      error,
      `ErrorBoundary-${this.props.componentName || 'Unknown'}`
    );
    
    this.setState({
      error,
      errorInfo
    });

    // Detailed error payload
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorType: this.state.isNetworkError ? 'Network' : 
                 this.state.isUIError ? 'UI' : 'General',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errorCount: this.state.errorCount
    };
    
    // Report error to server (enhanced)
    this.reportErrorToServer(errorDetails);

    // Record errors to multiple logging services
    if (window.Shopify?.analytics) {
      try {
        window.Shopify.analytics.publish('app-error', errorDetails);
      } catch (e) {
        console.error('Failed to send Shopify error log:', e);
      }
    }

    // Custom error tracking
    if (typeof window !== 'undefined' && window.trackError) {
      try {
        window.trackError(errorDetails);
      } catch (e) {
        console.error('Custom error tracking failed:', e);
      }
    }

    // If auto-recovery is possible, set a timer
    if (this.state.canAutoRecover && this.state.errorCount < 3) {
      UILogger.info(t('errors.boundary.autoRecoverTry'), 'ErrorBoundary-AutoRecover');
      setTimeout(this.handleAutoRecover, 3000);
    }
  }
  
  // Report error to server
  reportErrorToServer(errorDetails) {
    try {
      // Prepare error payload
      const errorData = {
        errorType: 'UI',
        errorCategory: this.state.isNetworkError ? 'NETWORK' : 'ERROR',
        errorCode: `UI_${errorDetails.errorType.toUpperCase()}`,
        message: errorDetails.message,
        stack: errorDetails.stack,
        stackTrace: errorDetails.stack,
        componentStack: errorDetails.componentStack,
        userAgent: errorDetails.userAgent,
        url: errorDetails.url,
        timestamp: errorDetails.timestamp,
        errorCount: errorDetails.errorCount,
        canAutoRecover: this.state.canAutoRecover,
        componentName: this.props.componentName || 'Unknown'
      };
      
      // Context information
      const context = {
        source: 'frontend',
        component: 'ErrorBoundary',
        userAgent: navigator.userAgent,
        requestUrl: window.location.href,
        sessionStorage: {
          hasData: !!window.sessionStorage.length
        },
        localStorage: {
          hasData: !!window.localStorage.length
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };
      
      // Send error to server asynchronously
      fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          action: 'collect',
          errorData: JSON.stringify(errorData),
          context: JSON.stringify(context)
        })
      })
      .then(response => {
        if (response.ok) {
          UILogger.info('Error reported to server', 'ErrorBoundary-Report');
        } else {
          UILogger.warn('Error report failed', 'ErrorBoundary-Report');
        }
      })
      .catch(err => {
        UILogger.error('Error reporting exception', err, 'ErrorBoundary-Report');
      });
      
    } catch (error) {
      console.error('Failed to prepare error report payload:', error);
    }
  }

  handleAutoRecover() {
    try {
      UILogger.info(this.props.t('errors.boundary.autoRecovering'), 'ErrorBoundary-AutoRecover');
      
      this.setState({ 
        hasError: false, 
        error: null, 
        errorInfo: null,
        isNetworkError: false,
        isUIError: false,
        canAutoRecover: false
      });
      
      // Trigger parent re-render (if provided)
      if (this.props.onRecover && typeof this.props.onRecover === 'function') {
        this.props.onRecover();
      }
      
      UILogger.info(this.props.t('errors.boundary.autoRecoverSuccess'), 'ErrorBoundary-AutoRecover');
    } catch (error) {
      UILogger.error(this.props.t('errors.boundary.autoRecoverFailed'), error, 'ErrorBoundary-AutoRecover');
    }
  }

  handleReset() {
    try {
      UILogger.info(this.props.t('errors.boundary.resetManual'), 'ErrorBoundary-Reset');
      
      this.setState({ 
        hasError: false, 
        error: null, 
        errorInfo: null,
        isNetworkError: false,
        isUIError: false,
        errorCount: 0,
        lastErrorTime: null,
        canAutoRecover: false
      });
      
      // If custom reset callback exists, use it first
      if (this.props.onReset && typeof this.props.onReset === 'function') {
        this.props.onReset();
      } else {
        // Otherwise refresh the page
        window.location.reload();
      }
    } catch (error) {
      UILogger.error(this.props.t('errors.boundary.resetFailed'), error, 'ErrorBoundary-Reset');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      const errorType = this.state.isNetworkError ? 'network' : 
                       this.state.isUIError ? 'ui' : 'general';
      
      return (
        <Page title={t('errors.boundary.pageTitle')}>
          <BlockStack gap="400">
            {/* Error status banner */}
            <Banner 
              title={
                this.state.isNetworkError ? t('errors.boundary.networkTitle') :
                this.state.isUIError ? t('errors.boundary.uiTitle') : t('errors.boundary.generalTitle')
              }
              tone="critical"
            >
              <BlockStack gap="200">
                <Text>
                  {t('errors.boundary.type')}: <Badge tone="critical">{errorType.toUpperCase()}</Badge>
                  {this.state.errorCount > 1 && (
                    <span> | {t('errors.boundary.times')}: <Badge tone="warning">{this.state.errorCount}</Badge></span>
                  )}
                </Text>
                {this.state.canAutoRecover && (
                  <Text tone="success">
                    ✨ {t('errors.boundary.autoRecoverSoon')}
                  </Text>
                )}
              </BlockStack>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {t('errors.boundary.detailsTitle')}
                </Text>
              
              {this.state.isNetworkError ? (
                <BlockStack gap="300">
                  <Text>{t('errors.boundary.networkDesc')}</Text>
                  <BlockStack gap="200">
                    <Text>• {t('errors.boundary.networkCause1')}</Text>
                    <Text>• {t('errors.boundary.networkCause2')}</Text>
                    <Text>• {t('errors.boundary.networkCause3')}</Text>
                  </BlockStack>
                  <Text as="h3" variant="headingSm">{t('errors.boundary.suggestions')}</Text>
                  <BlockStack gap="200">
                    <Text>1. {t('errors.boundary.networkStep1')}</Text>
                    <Text>2. {t('errors.boundary.networkStep2')}</Text>
                    <Text>3. {t('errors.boundary.networkStep3')}</Text>
                    <Text>4. {t('errors.boundary.networkStep4')}</Text>
                  </BlockStack>
                </BlockStack>
              ) : this.state.isUIError ? (
                <BlockStack gap="300">
                  <Text>{t('errors.boundary.uiDesc')}</Text>
                  <BlockStack gap="200">
                    <Text>• {t('errors.boundary.uiCause1')}</Text>
                    <Text>• {t('errors.boundary.uiCause2')}</Text>
                    <Text>• {t('errors.boundary.uiCause3')}</Text>
                  </BlockStack>
                  
                  <Text as="h3" variant="headingSm">{t('errors.boundary.uiAutoTitle')}</Text>
                  <BlockStack gap="200">
                    <Text>✅ {t('errors.boundary.uiAuto1')}</Text>
                    <Text>✅ {t('errors.boundary.uiAuto2')}</Text>
                    <Text>✅ {t('errors.boundary.uiAuto3')}</Text>
                  </BlockStack>
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  <Text>{t('errors.boundary.generalDesc')}</Text>
                  {this.state.error && (
                    <Card subdued>
                      <Text variant="bodyMd" as="p" fontFamily="monospace">
                        {this.state.error.toString()}
                      </Text>
                    </Card>
                  )}
                </BlockStack>
              )}
              
              <InlineStack gap="200">
                <Button onClick={this.handleReset} variant="primary">
                  {this.state.isUIError ? t('errors.boundary.resetUi') : t('errors.boundary.reloadApp')}
                </Button>
                <Button 
                  onClick={() => window.location.href = '/app/simple'} 
                  variant="secondary"
                >
                  {t('errors.boundary.useLite')}
                </Button>
                {this.state.isUIError && (
                  <Button 
                    onClick={() => window.location.reload()} 
                    variant="tertiary"
                  >
                    {t('errors.boundary.forceReload')}
                  </Button>
                )}
              </InlineStack>
              
              {/* Error statistics */}
              {this.state.errorCount > 1 && (
                <Card subdued>
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">{t('errors.boundary.statsTitle')}</Text>
                    <Text variant="bodySm">
                      • {t('errors.boundary.statsCount')}: {this.state.errorCount}
                    </Text>
                    <Text variant="bodySm">
                      • {t('errors.boundary.statsLast')} {this.state.lastErrorTime ? 
                        new Date(this.state.lastErrorTime).toLocaleString() : 
                        t('errors.boundary.unknown')}
                    </Text>
                    <Text variant="bodySm">
                      • {t('errors.boundary.statsAuto')}: {this.state.canAutoRecover ? '✅' : '❌'}
                    </Text>
                  </BlockStack>
                </Card>
              )}
              
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <Card subdued>
                  <details style={{ cursor: 'pointer' }}>
                    <summary style={{ 
                      cursor: 'pointer', 
                      padding: '10px',
                      fontWeight: 'bold'
                    }}>
                      🔧 {t('errors.boundary.devInfo')}
                    </summary>
                    <div style={{ marginTop: '10px' }}>
                      <BlockStack gap="300">
                        <div>
                          <Text as="h5" variant="headingXs">{t('errors.boundary.devStack')}</Text>
                          <pre style={{ 
                            marginTop: '5px',
                            padding: '10px', 
                            backgroundColor: '#f5f5f5',
                            overflow: 'auto',
                            fontSize: '11px',
                            border: '1px solid #ddd',
                            borderRadius: '4px'
                          }}>
                            {this.state.error && this.state.error.stack}
                          </pre>
                        </div>
                        <div>
                          <Text as="h5" variant="headingXs">{t('errors.boundary.devComponentStack')}</Text>
                          <pre style={{ 
                            marginTop: '5px',
                            padding: '10px', 
                            backgroundColor: '#f9f9f9',
                            overflow: 'auto',
                            fontSize: '11px',
                            border: '1px solid #ddd',
                            borderRadius: '4px'
                          }}>
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      </BlockStack>
                    </div>
                  </details>
                </Card>
              )}
            </BlockStack>
            </Card>
          </BlockStack>
        </Page>
      );
    }

    return this.props.children;
  }
}

// Export i18n-wrapped error boundary for route usage
export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);

// Wrapper for function components
export function withErrorBoundary(Component, options = {}) {
  const Wrapped = (props) => {
    const { t } = useTranslation();
    const {
      componentName = Component.displayName || Component.name || 'Anonymous',
      onReset = null,
      onRecover = null,
      ...boundaryProps
    } = options;

    return (
      <ErrorBoundary 
        componentName={componentName}
        onReset={onReset}
        onRecover={onRecover}
        {...boundaryProps}
        t={t}
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };

  Wrapped.displayName = `WithErrorBoundary(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}

// Hook-based error boundary for function components
export function useErrorBoundary() {
  const { t } = useTranslation();
  const [error, setError] = React.useState(null);
  
  const reportError = React.useCallback((error) => {
    UILogger.error(t('errors.boundary.hookReported'), error, 'useErrorBoundary');
    setError(error);
  }, [t]);
  
  if (error) {
    throw error;
  }
  
  return reportError;
}

// Safely execute functions outside error boundary
export function safeExecute(fn, fallback = null, context = 'Unknown') {
  try {
    return fn();
  } catch (error) {
    UILogger.error(`safeExecute caught error [${context}]`, error, 'safeExecute');
    return fallback;
  }
}

// Create component with error handling wrapper
export function createSafeComponent(Component, fallbackComponent = null) {
  return withErrorBoundary(Component, {
    componentName: Component.displayName || Component.name || 'SafeComponent',
    onReset: () => {
      UILogger.info('SafeComponent reset', 'createSafeComponent');
    }
  });
}
