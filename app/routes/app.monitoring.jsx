import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Grid,
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
  RefreshIcon,} from '@shopify/polaris-icons';
import { authenticate } from '../shopify.server';
import { prisma } from '../db.server';
import { withErrorHandling } from '../utils/error-handler.server';
import { getErrorStats } from '../services/error-collector.server';

// Loader - fetch monitoring data
export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange') || '24h';
    const resourceType = url.searchParams.get('resourceType') || 'all';
    
    // Time range helper
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
    
    // Fetch monitoring data in parallel
    const [
      translationStats,
      errorStats,
      recentErrors,
      activeJobs,
      systemHealth
    ] = await Promise.all([
      // Translation stats
      prisma.translation.groupBy({
        by: ['targetLang', 'syncStatus'],
        where: {
          createdAt: { gte: since },
          ...(resourceType !== 'all' && { resource: { resourceType } })
        },
        _count: true
      }),
      
      // Error stats
      getErrorStats(null, timeRange),
      
      // {t('tables.recentErrors')}
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
      
      // Active jobs pulled from sessions
      prisma.translationSession.findMany({
        where: {
          status: { in: ['RUNNING', 'PAUSED'] },
          shopId: shop
        },
        orderBy: { updatedAt: 'desc' },
        take: 5
      }),
      
      // System health metrics
      calculateSystemHealth(since)
    ]);
    
    // Compute success rate
    const totalTranslations = translationStats.reduce((sum, stat) => sum + stat._count, 0);
    const successfulTranslations = translationStats
      .filter(stat => stat.syncStatus === 'synced')
      .reduce((sum, stat) => sum + stat._count, 0);
    const successRate = totalTranslations > 0 
      ? ((successfulTranslations / totalTranslations) * 100).toFixed(1)
      : 0;
    
    // Group stats by language
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
  }, 'load monitoring data');
};

// Compute system health
async function calculateSystemHealth(since) {
  const [
    avgTranslationTime,
    queueLength,
    apiErrorRate
  ] = await Promise.all([
    // Avg translation time (simulated)
    Promise.resolve(1250),
    
    // {t('health.queueLength')}
    prisma.translation.count({
      where: { syncStatus: 'pending' }
    }),
    
    // {t('health.apiErrorRate')}
    prisma.errorLog.groupBy({
      by: ['errorType'],
      where: {
        createdAt: { gte: since },
        errorType: { in: ['API', 'SHOPIFY', 'TRANSLATION'] }
      },
      _count: true
    })
  ]);
  
  const totalApiCalls = 1000; // simulated total calls
  const apiErrors = apiErrorRate.reduce((sum, err) => sum + err._count, 0);
  const errorRate = (apiErrors / totalApiCalls * 100).toFixed(2);
  
  // Compute health score
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

// Main component
export default function MonitoringDashboard() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const { t } = useTranslation('monitoring');
  const [selectedTab, setSelectedTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  
  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetcher.load(`/app/monitoring?timeRange=${data.timeRange}&resourceType=${data.resourceType}`);
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, data.timeRange, data.resourceType]);
  
  // Health badge renderer
  const getHealthBadge = (status) => {
    const badges = {
      healthy: <Badge tone="success">Healthy</Badge>,
      warning: <Badge tone="warning">Warning</Badge>,
      critical: <Badge tone="critical">Critical</Badge>
    };
    return badges[status] || badges.warning;
  };
  
  // Severity badge
  const getSeverityBadge = (severity) => {
    const tones = ['info', 'attention', 'warning', 'critical', 'critical'];
    return <Badge tone={tones[severity - 1] || 'info'}>L{severity}</Badge>;
  };
  
  // Error table rows
  const errorTableData = data.recentErrors.map(error => [
    new Date(error.createdAt).toLocaleString(),
    error.errorType,
    error.message.substring(0, 50) + (error.message.length > 50 ? '...' : ''),
    error.resourceType || '-',
    getSeverityBadge(error.severity),
    <Badge tone={error.status === 'resolved' ? 'success' : 'attention'}>
      {error.status}
    </Badge>,
    `${error.occurrences}`
  ]);
  
  // Jobs table rows
  const jobTableData = data.activeJobs.map(job => [
    job.id.substring(0, 8),
    new Date(job.startedAt || job.createdAt).toLocaleString(),
    <Badge tone={job.status === 'RUNNING' ? 'success' : 'warning'}>
      {job.status}
    </Badge>,
    `${job.processedCount}/${job.totalCount}`,
    <ProgressBar progress={(job.processedCount / job.totalCount) * 100} />,
    job.errorCount > 0 
      ? <Badge tone="critical">{job.errorCount} errors</Badge>
      : <Badge tone="success">No errors</Badge>
  ]);
  
  const tabs = [
    {
      id: 'overview',
      content: t('tabs.overview'),
      panelID: 'overview-panel'
    },
    {
      id: 'errors',
      content: t('tabs.errors'),
      panelID: 'errors-panel'
    },
    {
      id: 'performance',
      content: t('tabs.performance'),
      panelID: 'performance-panel'
    },
    {
      id: 'jobs',
      content: t('tabs.jobs'),
      panelID: 'jobs-panel'
    }
  ];
  
  return (
    <Page
      title={t('title')}
      titleMetadata={getHealthBadge(data.systemHealth.status)}
      secondaryActions={[
        {
          content: autoRefresh ? t('actions.stop') : t('actions.start'),
          onAction: () => setAutoRefresh(!autoRefresh),
          icon: RefreshIcon
        }
      ]}
    >
      <Layout>
        {/* System health card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">{t('health.title')}</Text>
                <Text variant="bodyLg" fontWeight="bold">
                  {t('health.score')}: {data.systemHealth.healthScore}/100
                </Text>
              </InlineStack>
              
              <Grid>
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">{t('health.successRate')}</Text>
                    <Text variant="headingLg">{data.stats.successRate}%</Text>
                    <ProgressBar progress={parseFloat(data.stats.successRate)} tone="success" />
                  </BlockStack>
                </Grid.Cell>
                
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">{t('health.apiErrorRate')}</Text>
                    <Text variant="headingLg">{data.systemHealth.apiErrorRate}%</Text>
                    <ProgressBar 
                      progress={parseFloat(data.systemHealth.apiErrorRate)} 
                      tone={parseFloat(data.systemHealth.apiErrorRate) > 5 ? "critical" : "success"}
                    />
                  </BlockStack>
                </Grid.Cell>
                
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">{t('health.queueLength')}</Text>
                    <Text variant="headingLg">{data.systemHealth.queueLength}</Text>
                    <Badge tone={data.systemHealth.queueLength > 50 ? "warning" : "success"}>
                      {data.systemHealth.queueLength > 50 ? t('health.busy') : t('health.normal')}
                    </Badge>
                  </BlockStack>
                </Grid.Cell>
                
                <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" color="subdued">{t('health.avgTranslationTime')}</Text>
                    <Text variant="headingLg">{data.systemHealth.avgTranslationTime}ms</Text>
                    <Badge tone={data.systemHealth.avgTranslationTime > 2000 ? "attention" : "success"}>
                      {data.systemHealth.avgTranslationTime > 2000 ? t('health.slow') : t('health.fast')}
                    </Badge>
                  </BlockStack>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* Stat cards */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">{t('statsCards.totalTranslations')}</Text>
                  <Text variant="headingXl">{data.stats.totalTranslations}</Text>
                  <Badge tone="info">{t('statsCards.recent', { range: data.timeRange })}</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">{t('statsCards.successTranslations')}</Text>
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
                  <Text variant="bodyMd" color="subdued">{t('statsCards.totalErrors')}</Text>
                  <Text variant="headingXl" color="critical">
                    {data.stats.totalErrors}
                  </Text>
                  <Badge tone="critical">{t('statsCards.needsAttention')}</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyMd" color="subdued">{t('tables.jobsHeading')}</Text>
                  <Text variant="headingXl">{data.activeJobs.length}</Text>
                  <Badge tone="info">{t('statsCards.inProgress')}</Badge>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>
        
        {/* Tabs content */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* Overview tab */}
              {selectedTab === 0 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <Text variant="headingMd">{t('tables.overviewHeading')}</Text>
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                      headings={t('tables.overviewHeadings')}
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
              
              {/* Errors tab */}
              {selectedTab === 1 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">{t('tables.recentErrors')}</Text>
                      <Button url="/app/errors">{t('tables.viewAll')}</Button>
                    </InlineStack>
                    
                    {data.recentErrors.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                        headings={t('tables.errorHeadings')}
                        rows={errorTableData}
                      />
                    ) : (
                      <Banner tone="success">
                        <p>{t('tables.noRecent', { range: data.timeRange })}</p>
                      </Banner>
                    )}
                    
                    <BlockStack gap="200">
                      <Text variant="headingMd">{t('tables.errorsByType')}</Text>
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
              
              {/* Performance tab */}
              {selectedTab === 2 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <Text variant="headingMd">{t('performance.title')}</Text>
                    
                    <Grid>
                      <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 6, lg: 6}}>
                        <Card sectioned>
                          <BlockStack gap="200">
                            <Text variant="headingSm">{t('performance.translation')}</Text>
                            <Text>{t('performance.avgResponse', { ms: data.systemHealth.avgTranslationTime })}</Text>
                            <Text>{t('performance.queueSpeed')}</Text>
                            <Text>{t('performance.concurrency')}</Text>
                          </BlockStack>
                        </Card>
                      </Grid.Cell>
                      
                      <Grid.Cell columnSpan={{xs: 12, sm: 6, md: 6, lg: 6}}>
                        <Card sectioned>
                          <BlockStack gap="200">
                            <Text variant="headingSm">{t('performance.api')}</Text>
                            <Text>{t('performance.errorRate', { rate: data.systemHealth.apiErrorRate })}</Text>
                            <Text>{t('performance.throttles')}</Text>
                            <Text>{t('performance.retries')}</Text>
                          </BlockStack>
                        </Card>
                      </Grid.Cell>
                    </Grid>
                    
                    <Banner tone="info" title="{t('performance.adviceTitle')}">
                      <BlockStack gap="100">
                        {parseFloat(data.systemHealth.apiErrorRate) > 2 && (
                          <Text>• {t('performance.adviceApi')}</Text>
                        )}
                        {data.systemHealth.queueLength > 50 && (
                          <Text>• {t('performance.adviceQueue')}</Text>
                        )}
                        {data.systemHealth.avgTranslationTime > 2000 && (
                          <Text>• {t('performance.adviceSlow')}</Text>
                        )}
                      </BlockStack>
                    </Banner>
                  </BlockStack>
                </Card.Section>
              )}
              
              {/* Jobs tab */}
              {selectedTab === 3 && (
                <Card.Section>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd">{t('tables.jobsHeading')}</Text>
                      <Badge>{t('tables.jobsBadge', { count: data.activeJobs.length })}</Badge>
                    </InlineStack>
                    
                    {data.activeJobs.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                        headings={t('tables.jobsHeadings')}
                        rows={jobTableData}
                      />
                    ) : (
                      <Banner>
                        <p>{t('tables.noJobs')}</p>
                      </Banner>
                    )}
                    
                    <Card sectioned>
                      <BlockStack gap="200">
                        <Text variant="headingSm">{t('tables.queueState')}</Text>
                        <Text>{t('tables.queuePending', { count: data.systemHealth.queueLength })}</Text>
                        <Text>{t('tables.queueRunning', { count: data.activeJobs.filter(j => j.status === 'RUNNING').length })}</Text>
                        <Text>{t('tables.queuePaused', { count: data.activeJobs.filter(j => j.status === 'PAUSED').length })}</Text>
                      </BlockStack>
                    </Card>
                  </BlockStack>
                </Card.Section>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
        
        {/* Auto refresh state */}
        {autoRefresh && (
          <Layout.Section>
            <Banner tone="info">
              <InlineStack gap="200" align="center">
                <Spinner size="small" />
                <Text>{t('autoRefresh', { seconds: refreshInterval/1000 })}</Text>
              </InlineStack>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
