import React from 'react';
import { Page, Card, BlockStack, Text, Button, InlineStack } from '@shopify/polaris';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      isNetworkError: false
    };
  }

  static getDerivedStateFromError(error) {
    // 检查是否是网络相关错误
    const isNetworkError = error.message?.includes('Failed to fetch') || 
                          error.message?.includes('NetworkError') ||
                          error.message?.includes('fetch');
    
    return { 
      hasError: true, 
      isNetworkError 
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('错误边界捕获到错误:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // 记录错误到日志服务（如果需要）
    if (window.Shopify?.analytics) {
      try {
        window.Shopify.analytics.publish('app-error', {
          error: error.toString(),
          stack: errorInfo.componentStack
        });
      } catch (e) {
        console.error('无法发送错误日志:', e);
      }
    }
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      isNetworkError: false 
    });
    // 刷新页面
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Page title="应用遇到错误">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                {this.state.isNetworkError ? '网络连接错误' : '应用运行错误'}
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
                  重新加载应用
                </Button>
                <Button 
                  onClick={() => window.location.href = '/app/simple'} 
                  variant="secondary"
                >
                  使用简化版
                </Button>
              </InlineStack>
              
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details style={{ marginTop: '20px' }}>
                  <summary style={{ cursor: 'pointer' }}>开发者调试信息</summary>
                  <pre style={{ 
                    marginTop: '10px', 
                    padding: '10px', 
                    backgroundColor: '#f5f5f5',
                    overflow: 'auto',
                    fontSize: '12px'
                  }}>
                    {this.state.error && this.state.error.stack}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </BlockStack>
          </Card>
        </Page>
      );
    }

    return this.props.children;
  }
}

// 包装函数，用于函数组件
export function withErrorBoundary(Component) {
  return function WithErrorBoundaryComponent(props) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}