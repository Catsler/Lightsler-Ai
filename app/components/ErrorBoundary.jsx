import React from 'react';
import { Page, Card, BlockStack, Text, Button, InlineStack, Badge, Banner } from '@shopify/polaris';
import { UILogger } from '../utils/ui-helpers.js';

export class ErrorBoundary extends React.Component {
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
    
    // 绑定方法
    this.handleReset = this.handleReset.bind(this);
    this.handleAutoRecover = this.handleAutoRecover.bind(this);
  }

  static getDerivedStateFromError(error) {
    // 分析错误类型
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';
    
    const isNetworkError = errorMessage.includes('Failed to fetch') || 
                          errorMessage.includes('NetworkError') ||
                          errorMessage.includes('fetch') ||
                          errorMessage.includes('NETWORK_ERROR');
                          
    const isUIError = errorMessage.includes('UI事件处理错误') ||
                     errorMessage.includes('状态更新错误') ||
                     errorStack.includes('onClick') ||
                     errorStack.includes('onChange') ||
                     errorStack.includes('Select') ||
                     errorStack.includes('Button');
    
    // 判断是否可以自动恢复
    const canAutoRecover = isUIError && !isNetworkError;
    
    const now = Date.now();
    
    return { 
      hasError: true, 
      isNetworkError,
      isUIError,
      canAutoRecover,
      lastErrorTime: now,
      errorCount: (prevState) => (prevState?.errorCount || 0) + 1
    };
  }

  componentDidCatch(error, errorInfo) {
    // 使用UILogger记录错误
    UILogger.error(
      `ErrorBoundary捕获错误: ${error.message}`,
      error,
      `ErrorBoundary-${this.props.componentName || 'Unknown'}`
    );
    
    this.setState({
      error,
      errorInfo
    });

    // 详细错误信息
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
    
    // 上报错误到服务器（增强版）
    this.reportErrorToServer(errorDetails);

    // 记录错误到多个日志服务
    if (window.Shopify?.analytics) {
      try {
        window.Shopify.analytics.publish('app-error', errorDetails);
      } catch (e) {
        console.error('无法发送Shopify错误日志:', e);
      }
    }

    // 自定义错误追踪
    if (typeof window !== 'undefined' && window.trackError) {
      try {
        window.trackError(errorDetails);
      } catch (e) {
        console.error('自定义错误追踪失败:', e);
      }
    }

    // 如果可以自动恢复，设置定时器
    if (this.state.canAutoRecover && this.state.errorCount < 3) {
      UILogger.info('尝试自动恢复UI错误', 'ErrorBoundary-AutoRecover');
      setTimeout(this.handleAutoRecover, 3000);
    }
  }
  
  // 新增：上报错误到服务器
  reportErrorToServer(errorDetails) {
    try {
      // 准备错误数据
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
      
      // 上下文信息
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
      
      // 异步发送错误到服务器
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
          UILogger.info('错误已上报到服务器', 'ErrorBoundary-Report');
        } else {
          UILogger.warn('错误上报失败', 'ErrorBoundary-Report');
        }
      })
      .catch(err => {
        UILogger.error('错误上报异常', err, 'ErrorBoundary-Report');
      });
      
    } catch (error) {
      console.error('准备错误上报数据失败:', error);
    }
  }

  handleAutoRecover() {
    try {
      UILogger.info('正在执行自动恢复...', 'ErrorBoundary-AutoRecover');
      
      this.setState({ 
        hasError: false, 
        error: null, 
        errorInfo: null,
        isNetworkError: false,
        isUIError: false,
        canAutoRecover: false
      });
      
      // 触发父组件重新渲染（如果有回调）
      if (this.props.onRecover && typeof this.props.onRecover === 'function') {
        this.props.onRecover();
      }
      
      UILogger.info('自动恢复成功', 'ErrorBoundary-AutoRecover');
    } catch (error) {
      UILogger.error('自动恢复失败', error, 'ErrorBoundary-AutoRecover');
    }
  }

  handleReset() {
    try {
      UILogger.info('用户手动重置应用', 'ErrorBoundary-Reset');
      
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
      
      // 如果有自定义重置回调，优先使用
      if (this.props.onReset && typeof this.props.onReset === 'function') {
        this.props.onReset();
      } else {
        // 否则刷新页面
        window.location.reload();
      }
    } catch (error) {
      UILogger.error('重置失败，强制刷新页面', error, 'ErrorBoundary-Reset');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      const errorType = this.state.isNetworkError ? 'network' : 
                       this.state.isUIError ? 'ui' : 'general';
      
      return (
        <Page title="应用遇到错误">
          <BlockStack gap="400">
            {/* 错误状态横幅 */}
            <Banner 
              title={
                this.state.isNetworkError ? '网络连接错误' :
                this.state.isUIError ? 'UI交互错误' : '应用运行错误'
              }
              tone="critical"
            >
              <BlockStack gap="200">
                <Text>
                  错误类型: <Badge tone="critical">{errorType.toUpperCase()}</Badge>
                  {this.state.errorCount > 1 && (
                    <span> | 错误次数: <Badge tone="warning">{this.state.errorCount}</Badge></span>
                  )}
                </Text>
                {this.state.canAutoRecover && (
                  <Text tone="success">
                    ✨ 系统将在3秒后尝试自动恢复此UI错误
                  </Text>
                )}
              </BlockStack>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  错误详情与解决方案
                </Text>
              
              {this.state.isNetworkError ? (
                <BlockStack gap="300">
                  <Text>应用在加载Shopify资源时遇到问题。这可能是由于：</Text>
                  <BlockStack gap="200">
                    <Text>• 浏览器扩展程序（如广告拦截器）干扰了网络请求</Text>
                    <Text>• 网络连接不稳定</Text>
                    <Text>• Shopify服务暂时不可用</Text>
                  </BlockStack>
                  
                  <Text as="h3" variant="headingSm">建议解决方案：</Text>
                  <BlockStack gap="200">
                    <Text>1. 禁用所有浏览器扩展程序，特别是广告拦截器</Text>
                    <Text>2. 使用Chrome隐身模式访问应用</Text>
                    <Text>3. 检查网络连接</Text>
                    <Text>4. 清除浏览器缓存后重试</Text>
                  </BlockStack>
                </BlockStack>
              ) : this.state.isUIError ? (
                <BlockStack gap="300">
                  <Text>UI组件交互出现错误。这通常是临时性问题：</Text>
                  <BlockStack gap="200">
                    <Text>• 按键或选择操作触发了意字义序错误</Text>
                    <Text>• 组件状态更新冲突</Text>
                    <Text>• 事件处理函数执行异常</Text>
                  </BlockStack>
                  
                  <Text as="h3" variant="headingSm">自动处理：</Text>
                  <BlockStack gap="200">
                    <Text>✅ 系统已自动记录错误详情</Text>
                    <Text>✅ 正在尝试自动恢复UI状态</Text>
                    <Text>✅ 如果问题持续，请手动重置</Text>
                  </BlockStack>
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  <Text>应用遇到了意外错误。错误信息如下：</Text>
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
                  {this.state.isUIError ? '重置UI状态' : '重新加载应用'}
                </Button>
                <Button 
                  onClick={() => window.location.href = '/app/simple'} 
                  variant="secondary"
                >
                  使用简化版
                </Button>
                {this.state.isUIError && (
                  <Button 
                    onClick={() => window.location.reload()} 
                    variant="tertiary"
                  >
                    强制刷新页面
                  </Button>
                )}
              </InlineStack>
              
              {/* 错误统计信息 */}
              {this.state.errorCount > 1 && (
                <Card subdued>
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">错误统计</Text>
                    <Text variant="bodySm">
                      • 总错误次数: {this.state.errorCount}
                    </Text>
                    <Text variant="bodySm">
                      • 最后错误时间: {this.state.lastErrorTime ? 
                        new Date(this.state.lastErrorTime).toLocaleString('zh-CN') : 
                        '未知'}
                    </Text>
                    <Text variant="bodySm">
                      • 自动恢复能力: {this.state.canAutoRecover ? '✅ 支持' : '❌ 不支持'}
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
                      🔧 开发者调试信息
                    </summary>
                    <div style={{ marginTop: '10px' }}>
                      <BlockStack gap="300">
                        <div>
                          <Text as="h5" variant="headingXs">错误堆栈:</Text>
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
                          <Text as="h5" variant="headingXs">组件堆栈:</Text>
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

// 包装函数，用于函数组件
export function withErrorBoundary(Component, options = {}) {
  return function WithErrorBoundaryComponent(props) {
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
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook版本的错误边界（用于函数组件内部）
export function useErrorBoundary() {
  const [error, setError] = React.useState(null);
  
  const reportError = React.useCallback((error) => {
    UILogger.error('useErrorBoundary报告错误', error, 'useErrorBoundary');
    setError(error);
  }, []);
  
  if (error) {
    throw error;
  }
  
  return reportError;
}

// 安全执行函数 - 在错误边界外部使用
export function safeExecute(fn, fallback = null, context = 'Unknown') {
  try {
    return fn();
  } catch (error) {
    UILogger.error(`safeExecute捕获错误 [${context}]`, error, 'safeExecute');
    return fallback;
  }
}

// 创建带错误处理的组件
export function createSafeComponent(Component, fallbackComponent = null) {
  return withErrorBoundary(Component, {
    componentName: Component.displayName || Component.name || 'SafeComponent',
    onReset: () => {
      UILogger.info('SafeComponent重置', 'createSafeComponent');
    }
  });
}