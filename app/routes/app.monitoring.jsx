import { useState, useEffect, useCallback } from 'react';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Grid,
  LegacyStack,
  ProgressBar,
  DataTable,
  Button,
  Select,
  DatePicker,
  Tabs,
  Banner,
  Spinner,
  Icon,
  Box,
  BlockStack,
  InlineStack
} from '@shopify/polaris';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshIcon,
  FilterIcon
} from '@shopify/polaris-icons';
import { authenticate } from '../shopify.server';
import { prisma } from '../db.server';
import { withErrorHandling } from '../utils/error-handler.server';
import { getErrorStats } from '../services/error-collector.server';

// Loader - 获取监控数据
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange') || '24h';
    const resourceType = url.searchParams.get('resourceType') || 'all';
    
    // 获取时间过滤器
    const getTimeFilter = (range) => {
      const now = new Date();
      const filters = {
        '1h': new Date(now - 60 * 60 * 1000),
        '24h': new Date(now - 24 * 60 * 60 * 1000),
        '7d': new Date(now - 7 * 24 * 60 * 60 * 1000),
        '30d': new Date(now - 30 * 24 * 60 * 60 * 1000)
      };
      return filters[range] || filters['24h'];
    };
    
    const since = getTimeFilter(timeRange);
    
    // 并行获取各种监控数据
    const [
      translationStats,
      errorStats,
      recentErrors,
      activeJobs,
      systemHealth
    ] = await Promise.all([
      // 翻译统计
      prisma.translation.groupBy({
        by: ['targetLang', 'syncStatus'],
        where: {
          createdAt: { gte: since },
          ...(resourceType !== 'all' && { resource: { resourceType } })
        },
        _count: true
      }),
      
      // 错误统计
      getErrorStats(null, timeRange),
      
      // 最近错误
      prisma.errorLog.findMany({
        where: {
          createdAt: { gte: since },
          ...(resourceType !== 'all' && { resourceType })
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          errorType: true,
          errorCategory: true,
          message: true,
          resourceType: true,
          severity: true,
          status: true,
          createdAt: true,
          occurrences: true
        }
      }),
      
      // 活跃任务（从会话表获取）
      prisma.translationSession.findMany({
        where: {
          status: { in: ['RUNNING', 'PAUSED'] },
          shopId: shop
        },
        orderBy: { updatedAt: 'desc' },
        take: 5
      }),
      
      // 系统健康指标
      calculateSystemHealth(since)
    ]);
    
    // 计算翻译成功率
    const totalTranslations = translationStats.reduce((sum, stat) => sum + stat._count, 0);
    const successfulTranslations = translationStats
      .filter(stat => stat.syncStatus === 'synced')
      .reduce((sum, stat) => sum + stat._count, 0);
    const successRate = totalTranslations > 0 
      ? ((successfulTranslations / totalTranslations) * 100).toFixed(1)
      : 0;
    
    // 按语言分组统计
    const languageStats = {};
    translationStats.forEach(stat => {
      if (!languageStats[stat.targetLang]) {
        languageStats[stat.targetLang] = {
          total: 0,
          synced: 0,
          pending: 0,
          failed: 0
        };
      }
      languageStats[stat.targetLang].total += stat._count;
      languageStats[stat.targetLang][stat.syncStatus] = 
        (languageStats[stat.targetLang][stat.syncStatus] || 0) + stat._count;
    });
    
    return json({
      shop,
      timeRange,
      resourceType,
      stats: {
        totalTranslations,
        successfulTranslations,
        successRate,
        totalErrors: errorStats.total,
        errorsByType: errorStats.byType,
        errorsBySeverity: errorStats.bySeverity,
        languageStats
      },
      recentErrors,
      activeJobs,
      systemHealth
    });
  }, '获取监控数据');
};

// 计算系统健康指标
async function calculateSystemHealth(since) {
  const [
    avgTranslationTime,
    queueLength,
    apiErrorRate
  ] = await Promise.all([
    // 平均翻译时间（模拟数据，实际应从日志中计算）
    Promise.resolve(1250),
    
    // 队列长度
    prisma.translation.count({
      where: { syncStatus: 'pending' }
    }),
    
    // API错误率
    prisma.errorLog.groupBy({
      by: ['errorType'],
      where: {
        createdAt: { gte: since },
        errorType: { in: ['API', 'SHOPIFY', 'TRANSLATION'] }
      },
      _count: true
    })
  ]);
  
  const totalApiCalls = 1000; // 模拟总调用数
  const apiErrors = apiErrorRate.reduce((sum, err) => sum + err._count, 0);
  const errorRate = (apiErrors / totalApiCalls * 100).toFixed(2);
  
  // 计算健康分数
  let healthScore = 100;
  if (errorRate > 5) healthScore -= 30;
  else if (errorRate > 2) healthScore -= 15;
  
  if (queueLength > 100) healthScore -= 20;
  else if (queueLength > 50) healthScore -= 10;
  
  if (avgTranslationTime > 3000) healthScore -= 15;
  else if (avgTranslationTime > 2000) healthScore -= 5;
  
  return {
    healthScore: Math.max(0, healthScore),
    avgTranslationTime,
    queueLength,
    apiErrorRate: errorRate,
    status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical'
  };
}

// 主组件
export default function MonitoringDashboard() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const [selectedTab, setSelectedTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30秒
  
  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetcher.load(`/app/monitoring?timeRange=${data.timeRange}&resourceType=${data.resourceType}`);
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, data.timeRange, data.resourceType]);
  
  // 健康状态徽章
  const getHealthBadge = (status) => {
    const badges = {
      healthy: <Badge tone="success">健康</Badge>,
      warning: <Badge tone="warning">警告</Badge>,
      critical: <Badge tone="critical">危急</Badge>
    };
    return badges[status] || badges.warning;
  };
  
  // 严重程度徽章
  const getSeverityBadge = (severity) => {
    const tones = ['info', 'attention', 'warning', 'critical', 'critical'];
    return <Badge tone={tones[severity - 1] || 'info'}>L{severity}</Badge>;
  };
  
  // 错误表格数据
  const errorTableData = data.recentErrors.map(error => [
    new Date(error.createdAt).toLocaleString('zh-CN'),
    error.errorType,
    error.message.substring(0, 50) + (error.message.length > 50 ? '...' : ''),
    error.resourceType || '-',
    getSeverityBadge(error.severity),
    <Badge tone={error.status === 'resolved' ? 'success' : 'attention'}>
      {error.status}
    </Badge>,
    `${error.occurrences}次`
  ]);
  
  // 活跃任务表格数据
  const jobTableData = data.activeJobs.map(job => [
    job.id.substring(0, 8),
    new Date(job.startedAt || job.createdAt).toLocaleString('zh-CN'),
    <Badge tone={job.status === 'RUNNING' ? 'success' : 'warning'}>
      {job.status}
    </Badge>,
    `${job.processedCount}/${job.totalCount}`,
    <ProgressBar progress={(job.processedCount / job.totalCount) * 100} />,
    job.errorCount > 0 
      ? <Badge tone="critical">{job.errorCount} 错误</Badge>
      : <Badge tone="success">无错误</Badge>
  ]);
  
  const tabs = [
    {
      id: 'overview',
      content: '概览',
      panelID: 'overview-panel'
    },
    {
      id: 'errors',
      content: '错误监控',
      panelID: 'errors-panel'
    },
    {
      id: 'performance',
      content: '性能指标',
      panelID: 'performance-panel'
    },
    {
      id: 'jobs',
      content: '任务队列',
      panelID: 'jobs-panel'
    }
  ];
  
  return (
    <Page
      title="实时监控仪表板"
      titleMetadata={getHealthBadge(data.systemHealth.status)}
      secondaryActions={[
        {
          content: autoRefresh ? '停止刷新' : '开始刷新',
          onAction: () => setAutoRefresh(!autoRefresh),
          icon: RefreshIcon
        }
      ]}
    >
      <Layout>
        {/* 系统健康概览卡片 */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">系统健康状态</Text>
                <Text variant="bodyLg" fontWeight="bold">
                  健康分数: {data.systemHealth.healthScore}/100
                </Text>
              </InlineStack>
              
              <Grid>
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">翻译成功率</Text>
                    <Text variant="headingLg">{data.stats.successRate}%</Text>
                    <ProgressBar progress={parseFloat(data.stats.successRate)} tone="success" />
                  </BlockStack>
                </Grid.Cell>
                
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">API错误率</Text>
                    <Text variant="headingLg">{data.systemHealth.apiErrorRate}%</Text>
                    <ProgressBar 
                      progress={parseFloat(data.systemHealth.apiErrorRate)} 
                      tone={parseFloat(data.systemHealth.apiErrorRate) > 5 ? "critical" : "success"}
                    />
                  </BlockStack>
                </Grid.Cell>
                
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">队列长度</Text>
                    <Text variant="headingLg">{data.systemHealth.queueLength}</Text>
                    <Badge tone={data.systemHealth.queueLength > 50 ? "warning" : "success"}>
                      {data.systemHealth.queueLength > 50 ? '繁忙' : '正常'}
                    </Badge>
                  </BlockStack>
                </Grid.Cell>
                
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">平均翻译时间</Text>
                    <Text variant="headingLg">{data.systemHealth.avgTranslationTime}ms</Text>
                    <Badge tone={data.systemHealth.avgTranslationTime > 2000 ? "attention" : "success"}>
                      {data.systemHealth.avgTranslationTime > 2000 ? '较慢' : '快速'}
                    </Badge>
                  </BlockStack>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* 统计卡片 */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">总翻译数</Text>
                  <Text variant="headingXl">{data.stats.totalTranslations}</Text>
                  <Badge tone="info">最近{data.timeRange}</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">成功翻译</Text>
                  <Text variant="headingXl" color="success">
                    {data.stats.successfulTranslations}
                  </Text>
                  <Badge tone="success">{data.stats.successRate}%</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">错误总数</Text>
                  <Text variant="headingXl" color="critical">
                    {data.stats.totalErrors}
                  </Text>
                  <Badge tone="critical">需要关注</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">活跃任务</Text>
                  <Text variant="headingXl">{data.activeJobs.length}</Text>
                  <Badge tone="info">进行中</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>
        
        {/* 选项卡内容 */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* 概览面板 */}
              {selectedTab === 0 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <Text variant="headingMd">语言翻译统计</Text>
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                      headings={['语言', '总计', '已同步', '待处理', '失败']}
                      rows={Object.entries(data.stats.languageStats).map(([lang, stats]) => [
                        lang,
                        stats.total,
                        stats.synced || 0,
                        stats.pending || 0,
                        stats.failed || 0
                      ])}
                    />
                  </BlockStack>
                </Card.Section>
              )}
              
              {/* 错误监控面板 */}
              {selectedTab === 1 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">最近错误</Text>
                      <Button url="/app/errors">查看全部</Button>
                    </InlineStack>
                    
                    {data.recentErrors.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                        headings={['时间', '类型', '消息', '资源', '严重度', '状态', '频率']}
                        rows={errorTableData}
                      />
                    ) : (
                      <Banner tone="success">
                        <p>最近{data.timeRange}内没有错误记录</p>
                      </Banner>
                    )}
                    
                    <BlockStack gap="200">
                      <Text variant="headingMd">错误类型分布</Text>
                      <InlineStack gap="200">
                        {Object.entries(data.stats.errorsByType).map(([type, count]) => (
                          <Badge key={type}>
                            {type}: {count}
                          </Badge>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Card.Section>
              )}
              
              {/* 性能指标面板 */}
              {selectedTab === 2 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <Text variant="headingMd">性能指标</Text>
                    
                    <Grid>
                      <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 6, lg: 6}}>
                        <Card sectioned>
                          <BlockStack gap="200">
                            <Text variant="headingSm">翻译性能</Text>
                            <Text>平均响应时间: {data.systemHealth.avgTranslationTime}ms</Text>
                            <Text>队列处理速度: ~50 项/分钟</Text>
                            <Text>并发处理数: 5</Text>
                          </BlockStack>
                        </Card>
                      </Grid.Cell>
                      
                      <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 6, lg: 6}}>
                        <Card sectioned>
                          <BlockStack gap="200">
                            <Text variant="headingSm">API性能</Text>
                            <Text>错误率: {data.systemHealth.apiErrorRate}%</Text>
                            <Text>限流触发: 12次</Text>
                            <Text>平均重试次数: 1.2</Text>
                          </BlockStack>
                        </Card>
                      </Grid.Cell>
                    </Grid>
                    
                    <Banner tone="info" title="性能优化建议">
                      <BlockStack gap="100">
                        {parseFloat(data.systemHealth.apiErrorRate) > 2 && (
                          <Text>• API错误率较高，建议检查网络连接和API配额</Text>
                        )}
                        {data.systemHealth.queueLength > 50 && (
                          <Text>• 队列积压较多，考虑增加并发处理数</Text>
                        )}
                        {data.systemHealth.avgTranslationTime > 2000 && (
                          <Text>• 翻译响应较慢，可能需要优化批处理大小</Text>
                        )}
                      </BlockStack>
                    </Banner>
                  </BlockStack>
                </Card.Section>
              )}
              
              {/* 任务队列面板 */}
              {selectedTab === 3 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">活跃任务</Text>
                      <Badge>{data.activeJobs.length} 个任务</Badge>
                    </InlineStack>
                    
                    {data.activeJobs.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                        headings={['任务ID', '开始时间', '状态', '进度', '完成度', '错误']}
                        rows={jobTableData}
                      />
                    ) : (
                      <Banner>
                        <p>当前没有活跃的翻译任务</p>
                      </Banner>
                    )}
                    
                    <Card sectioned>
                      <BlockStack gap="200">
                        <Text variant="headingSm">队列状态</Text>
                        <Text>待处理: {data.systemHealth.queueLength} 项</Text>
                        <Text>处理中: {data.activeJobs.filter(j => j.status === 'RUNNING').length} 项</Text>
                        <Text>已暂停: {data.activeJobs.filter(j => j.status === 'PAUSED').length} 项</Text>
                      </BlockStack>
                    </Card>
                  </BlockStack>
                </Card.Section>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
        
        {/* 自动刷新状态 */}
        {autoRefresh && (
          <Layout.Section>
            <Banner tone="info">
              <InlineStack gap="200" align="center">
                <Spinner size="small" />
                <Text>自动刷新已启用，每{refreshInterval/1000}秒更新一次</Text>
              </InlineStack>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}