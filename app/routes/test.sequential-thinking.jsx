/**
 * Sequential Thinking 测试页面
 * 展示智能决策过程和优化效果
 */

import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  DataTable,
  ProgressBar,
  Divider,
  Select,
  Modal,
  TextContainer,
  List
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { prisma } from '../db.server';

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopId = session.shop;
  
  // 获取一些测试资源
  const resources = await prisma.resource.findMany({
    where: { shopId },
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      translations: {
        select: {
          id: true,
          targetLang: true,
          status: true
        }
      }
    }
  });
  
  // 获取最近的翻译会话
  const sessions = await prisma.translationSession.findMany({
    where: { shopId },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      totalResources: true,
      completedResources: true,
      errorRate: true,
      createdAt: true
    }
  });
  
  return json({
    shopId,
    resources,
    sessions
  });
};

export default function SequentialThinkingTest() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const [selectedResource, setSelectedResource] = useState(null);
  const [showThinkingModal, setShowThinkingModal] = useState(false);
  const [thinkingChain, setThinkingChain] = useState(null);
  const [optimizationResults, setOptimizationResults] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [testResults, setTestResults] = useState([]);
  
  // 处理fetcher响应
  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      if (fetcher.data.success) {
        if (fetcher.data.data?.analysis) {
          setThinkingChain(fetcher.data.data.analysis);
          setShowThinkingModal(true);
        }
        if (fetcher.data.data?.optimizationPlan) {
          setOptimizationResults(fetcher.data.data);
        }
        
        // 添加测试结果
        addTestResult(
          fetcher.data.message || '操作成功',
          true,
          fetcher.data.data
        );
      } else {
        addTestResult(
          fetcher.data.error || '操作失败',
          false
        );
      }
    }
  }, [fetcher.data, fetcher.state]);
  
  // 添加测试结果
  const addTestResult = (message, success, data = null) => {
    setTestResults(prev => [...prev, {
      message,
      success,
      data,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };
  
  // 分析单个资源的决策
  const analyzeResourceDecision = (resource) => {
    setSelectedResource(resource);
    
    fetcher.submit(
      {
        operation: 'analyzeDecision',
        resourceId: resource.id,
        resourceType: resource.resourceType,
        targetLanguage: selectedLanguage,
        priority: 'normal',
        userRequested: false
      },
      {
        method: 'POST',
        action: '/api/thinking-chain',
        encType: 'application/json'
      }
    );
  };
  
  // 智能批量翻译测试
  const testIntelligentTranslation = () => {
    const resourceIds = data.resources.slice(0, 5).map(r => r.id);
    
    fetcher.submit(
      {
        operation: 'intelligentTranslate',
        resourceIds,
        targetLanguage: selectedLanguage,
        options: {
          batchDelay: 1000,
          priority: 'high'
        }
      },
      {
        method: 'POST',
        action: '/api/thinking-chain',
        encType: 'application/json'
      }
    );
  };
  
  // 获取调度建议
  const getScheduleSuggestions = () => {
    const resourceIds = data.resources.map(r => r.id);
    
    fetcher.submit(
      {
        operation: 'getSchedule',
        resourceIds,
        systemStatus: {
          cpuUsage: 50,
          memoryUsage: 60
        }
      },
      {
        method: 'POST',
        action: '/api/thinking-chain',
        encType: 'application/json'
      }
    );
  };
  
  // 优化会话
  const optimizeSession = (sessionId) => {
    fetcher.submit(
      {
        operation: 'optimizeSession',
        sessionId
      },
      {
        method: 'POST',
        action: '/api/thinking-chain',
        encType: 'application/json'
      }
    );
  };
  
  // 获取优化状态
  const getOptimizationStatus = () => {
    fetcher.load('/api/thinking-chain?operation=getOptimizationStatus');
  };
  
  // 渲染思考步骤
  const renderThinkingSteps = (chain) => {
    if (!chain || !chain.thinkingChain) return null;
    
    const thoughts = chain.thinkingChain.thoughts || [];
    const decisions = chain.thinkingChain.decisions || [];
    
    return (
      <BlockStack gap="300">
        <Text variant="headingMd">思考过程</Text>
        
        {thoughts.map((thought, index) => (
          <Card key={index} sectioned>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Badge>步骤 {thought.step + 1}</Badge>
                <Text variant="bodySm" tone="subdued">
                  {new Date(thought.timestamp).toLocaleTimeString()}
                </Text>
              </InlineStack>
              <Text>{thought.thought}</Text>
              {thought.metadata?.type && (
                <Badge tone="info">{thought.metadata.type}</Badge>
              )}
            </BlockStack>
          </Card>
        ))}
        
        {decisions.length > 0 && (
          <>
            <Divider />
            <Text variant="headingMd">决策结果</Text>
            {decisions.map((decision, index) => (
              <Card key={index} sectioned>
                <BlockStack gap="200">
                  <InlineStack gap="300">
                    <Badge tone="success">决策</Badge>
                    <Badge>{decision.decision}</Badge>
                    <Badge tone="attention">
                      置信度: {(decision.confidence * 100).toFixed(0)}%
                    </Badge>
                  </InlineStack>
                  <Text>{decision.reasoning}</Text>
                </BlockStack>
              </Card>
            ))}
          </>
        )}
      </BlockStack>
    );
  };
  
  return (
    <Page
      title="Sequential Thinking 测试"
      subtitle="智能决策和优化系统演示"
      backAction={{ content: '返回', url: '/app' }}
    >
      <BlockStack gap="500">
        {/* 控制面板 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">测试控制</Text>
                
                <InlineStack gap="300">
                  <Select
                    label="目标语言"
                    options={[
                      { label: '简体中文', value: 'zh-CN' },
                      { label: '繁体中文', value: 'zh-TW' },
                      { label: '日语', value: 'ja' },
                      { label: '韩语', value: 'ko' },
                      { label: '法语', value: 'fr' },
                      { label: '德语', value: 'de' },
                      { label: '西班牙语', value: 'es' }
                    ]}
                    value={selectedLanguage}
                    onChange={setSelectedLanguage}
                  />
                  
                  <Button onClick={testIntelligentTranslation} variant="primary">
                    测试智能翻译
                  </Button>
                  
                  <Button onClick={getScheduleSuggestions}>
                    获取调度建议
                  </Button>
                  
                  <Button onClick={getOptimizationStatus}>
                    查看优化状态
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 资源列表和决策分析 */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">资源决策分析</Text>
                <Text variant="bodySm" tone="subdued">
                  点击资源查看Sequential Thinking的决策过程
                </Text>
                
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['资源标题', '类型', '翻译状态', '操作']}
                  rows={data.resources.map(resource => [
                    resource.title || resource.handle || 'N/A',
                    resource.resourceType,
                    resource.translations.length > 0 ? 
                      <Badge tone="success">已翻译</Badge> : 
                      <Badge>未翻译</Badge>,
                    <Button
                      size="slim"
                      onClick={() => analyzeResourceDecision(resource)}
                    >
                      分析决策
                    </Button>
                  ])}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* 会话优化 */}
        {data.sessions.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">翻译会话优化</Text>
                  
                  {data.sessions.map(session => (
                    <Card key={session.id} sectioned>
                      <InlineStack align="space-between">
                        <BlockStack gap="200">
                          <InlineStack gap="300">
                            <Text variant="bodyMd" fontWeight="bold">
                              会话 {session.id.slice(0, 8)}...
                            </Text>
                            <Badge tone={
                              session.status === 'COMPLETED' ? 'success' :
                              session.status === 'FAILED' ? 'critical' :
                              'info'
                            }>
                              {session.status}
                            </Badge>
                          </InlineStack>
                          
                          <InlineStack gap="400">
                            <Text variant="bodySm">
                              进度: {session.completedResources}/{session.totalResources}
                            </Text>
                            <Text variant="bodySm">
                              错误率: {(session.errorRate * 100).toFixed(1)}%
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              {new Date(session.createdAt).toLocaleDateString()}
                            </Text>
                          </InlineStack>
                          
                          <ProgressBar
                            progress={session.totalResources > 0 ? 
                              session.completedResources / session.totalResources : 0}
                            size="small"
                          />
                        </BlockStack>
                        
                        <Button
                          size="slim"
                          onClick={() => optimizeSession(session.id)}
                        >
                          优化分析
                        </Button>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
        
        {/* 优化结果展示 */}
        {optimizationResults && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">优化分析结果</Text>
                  
                  {/* 性能指标 */}
                  {optimizationResults.metrics && (
                    <Card sectioned>
                      <BlockStack gap="200">
                        <Text variant="headingSm">性能指标</Text>
                        <InlineStack gap="400">
                          <Badge>
                            成功率: {(optimizationResults.metrics.successRate * 100).toFixed(1)}%
                          </Badge>
                          <Badge>
                            平均耗时: {optimizationResults.metrics.avgTimePerResource?.toFixed(0)}ms
                          </Badge>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  )}
                  
                  {/* 优化计划 */}
                  {optimizationResults.optimizationPlan && (
                    <Card sectioned>
                      <BlockStack gap="300">
                        <Text variant="headingSm">优化计划</Text>
                        
                        {optimizationResults.optimizationPlan.immediate?.length > 0 && (
                          <BlockStack gap="200">
                            <Badge tone="critical">立即执行</Badge>
                            <List>
                              {optimizationResults.optimizationPlan.immediate.map((item, i) => (
                                <List.Item key={i}>
                                  {item.action} (影响: {item.expectedImpact})
                                </List.Item>
                              ))}
                            </List>
                          </BlockStack>
                        )}
                        
                        {optimizationResults.optimizationPlan.shortTerm?.length > 0 && (
                          <BlockStack gap="200">
                            <Badge tone="warning">短期计划</Badge>
                            <List>
                              {optimizationResults.optimizationPlan.shortTerm.map((item, i) => (
                                <List.Item key={i}>
                                  {item.action} ({item.timeline})
                                </List.Item>
                              ))}
                            </List>
                          </BlockStack>
                        )}
                      </BlockStack>
                    </Card>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
        
        {/* 测试结果日志 */}
        {testResults.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">测试结果</Text>
                  
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <BlockStack gap="200">
                      {testResults.map((result, index) => (
                        <Card key={index} sectioned>
                          <InlineStack gap="300">
                            <Badge tone={result.success ? 'success' : 'critical'}>
                              {result.success ? '成功' : '失败'}
                            </Badge>
                            <Text variant="bodySm">
                              [{result.timestamp}] {result.message}
                            </Text>
                          </InlineStack>
                          
                          {result.data && (
                            <div style={{ marginTop: '10px' }}>
                              <details>
                                <summary style={{ cursor: 'pointer' }}>
                                  <Text variant="bodySm" tone="subdued">
                                    查看详细数据
                                  </Text>
                                </summary>
                                <pre style={{
                                  marginTop: '10px',
                                  padding: '10px',
                                  backgroundColor: '#f4f6f8',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  overflow: 'auto'
                                }}>
                                  {JSON.stringify(result.data, null, 2)}
                                </pre>
                              </details>
                            </div>
                          )}
                        </Card>
                      ))}
                    </BlockStack>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
        
        {/* 思考链模态框 */}
        <Modal
          open={showThinkingModal}
          onClose={() => setShowThinkingModal(false)}
          title="Sequential Thinking 决策分析"
          primaryAction={{
            content: '关闭',
            onAction: () => setShowThinkingModal(false)
          }}
          large
        >
          <Modal.Section>
            {thinkingChain && (
              <BlockStack gap="400">
                {/* 决策摘要 */}
                <Card sectioned>
                  <BlockStack gap="200">
                    <Text variant="headingSm">决策摘要</Text>
                    <InlineStack gap="300">
                      <Badge tone={
                        thinkingChain.decision === 'skip' ? 'warning' :
                        thinkingChain.decision === 'translate' ? 'success' :
                        'info'
                      }>
                        {thinkingChain.decision === 'skip' ? '跳过' :
                         thinkingChain.decision === 'translate' ? '翻译' :
                         thinkingChain.decision}
                      </Badge>
                      <Badge>
                        置信度: {(thinkingChain.confidence * 100).toFixed(0)}%
                      </Badge>
                    </InlineStack>
                    <Text>{thinkingChain.reasoning}</Text>
                  </BlockStack>
                </Card>
                
                {/* 思考过程 */}
                {renderThinkingSteps(thinkingChain)}
                
                {/* 建议 */}
                {thinkingChain.recommendations && thinkingChain.recommendations.length > 0 && (
                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="headingSm">建议</Text>
                      <List>
                        {thinkingChain.recommendations.map((rec, i) => (
                          <List.Item key={i}>
                            <InlineStack gap="200">
                              <Badge tone={
                                rec.priority === 'high' ? 'critical' :
                                rec.priority === 'medium' ? 'warning' :
                                'info'
                              }>
                                {rec.priority}
                              </Badge>
                              <Text>{rec.message}</Text>
                            </InlineStack>
                          </List.Item>
                        ))}
                      </List>
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}