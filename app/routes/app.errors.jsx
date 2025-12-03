/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars, no-console */
import { useState, useEffect, useCallback } from "react";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  Select,
  TextField,
  Filters,
  Modal,
  TextContainer,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Tabs,
  EmptyState,
  Spinner,
  Pagination,
  Icon,
  Tooltip,
  ButtonGroup,
  ProgressBar
} from "@shopify/polaris";
import {
  RefreshIcon,
  ExportIcon,
  ArrowUpIcon,
  ArrowDownIcon,} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useTranslation } from "react-i18next";

/**
 * Load error data
 */
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  // Parse query params
  const page = parseInt(url.searchParams.get("page") || "1");
  const status = url.searchParams.get("status") || "all";
  const errorType = url.searchParams.get("type") || "all";
  const severity = url.searchParams.get("severity") || "all";
  const timeRange = url.searchParams.get("timeRange") || "24h";
  const tab = url.searchParams.get("tab") || "list";
  
  // Build API request
  const params = new URLSearchParams({
    action: tab === "list" ? "list" : tab,
    page: page.toString(),
    pageSize: "20",
    timeRange
  });
  
  if (status !== "all") params.append("status", status);
  if (errorType !== "all") params.append("errorType", errorType);
  if (severity !== "all") params.append("severity", severity);
  
  // Fetch data with error handling
  const [errorResponse, statsResponse] = await Promise.all([
    fetch(`${url.origin}/api/errors?${params}`)
      .then(async r => {
        if (!r.ok) {
          console.error(`API error: ${r.status} ${r.statusText}`);
          return { data: { errors: [], pagination: {} } };
        }
        const contentType = r.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Response is not JSON");
          return { data: { errors: [], pagination: {} } };
        }
        const text = await r.text();
        if (!text) {
          console.error("Empty response");
          return { data: { errors: [], pagination: {} } };
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error("JSON parse failed:", e);
          return { data: { errors: [], pagination: {} } };
        }
      })
      .catch(err => {
        console.error("Request failed:", err);
        return { data: { errors: [], pagination: {} } };
      }),
    fetch(`${url.origin}/api/errors?action=stats&timeRange=${timeRange}`)
      .then(async r => {
        if (!r.ok) {
          console.error(`Stats API error: ${r.status} ${r.statusText}`);
          return { data: {} };
        }
        const contentType = r.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Stats response is not JSON");
          return { data: {} };
        }
        const text = await r.text();
        if (!text) {
          console.error("Empty stats response");
          return { data: {} };
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error("Stats JSON parse failed:", e);
          return { data: {} };
        }
      })
      .catch(err => {
        console.error("Stats request failed:", err);
        return { data: {} };
      })
  ]);
  
  return json({
    errors: errorResponse.data?.errors || [],
    pagination: errorResponse.data?.pagination || {},
    stats: statsResponse.data || {},
    filters: { page, status, errorType, severity, timeRange, tab }
  });
}

export default function ErrorDashboard() {
  const { errors, pagination, stats, filters } = useLoaderData();
  const { t } = useTranslation('errorsPage');
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State management
  const [selectedTab, setSelectedTab] = useState(filters.tab);
  const [selectedErrors, setSelectedErrors] = useState([]);
  const [detailModalActive, setDetailModalActive] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Auto refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedTab === "list" || selectedTab === "stats") {
        handleRefresh();
      }
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [selectedTab]);
  
  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetcher.load(`/app/errors?${searchParams.toString()}`);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [searchParams]);
  
  // Handle filter change
  const handleFilterChange = useCallback((key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    newParams.set("page", "1"); // reset page
    setSearchParams(newParams);
  }, [searchParams]);
  
  // Handle tab change
  const handleTabChange = useCallback((tab) => {
    setSelectedTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", tab);
    setSearchParams(newParams);
  }, [searchParams]);
  
  // Handle pagination
  const handlePageChange = useCallback((direction) => {
    const currentPage = pagination.page || 1;
    const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", newPage.toString());
    setSearchParams(newParams);
  }, [pagination, searchParams]);
  
  // Handle detail view
  const handleViewDetail = useCallback((error) => {
    setSelectedError(error);
    setDetailModalActive(true);
    
    // Fetch detail info
    fetcher.load(`/api/errors?action=detail&id=${error.id}`);
  }, []);
  
  // Handle status update
  const handleStatusUpdate = useCallback((errorId, newStatus) => {
    fetcher.submit(
      { action: "update", id: errorId, status: newStatus },
      { method: "post", action: "/api/errors" }
    );
  }, []);
  
  // Handle bulk actions
  const handleBatchAction = useCallback((action) => {
    if (selectedErrors.length === 0) return;
    
    fetcher.submit(
      { 
        action: `batch-${action}`, 
        ids: JSON.stringify(selectedErrors),
        status: action
      },
      { method: "post", action: "/api/errors" }
    );
    
    setSelectedErrors([]);
  }, [selectedErrors]);
  
  // Render severity badge
  const renderSeverityBadge = (severity) => {
    const severityConfig = {
      1: { tone: "info", label: t('filters.severity.low') },
      2: { tone: "attention", label: t('filters.severity.medium') },
      3: { tone: "warning", label: t('filters.severity.high') },
      4: { tone: "critical", label: t('filters.severity.severe') },
      5: { tone: "critical", label: t('filters.severity.fatal') }
    };
    
    const config = severityConfig[severity] || severityConfig[2];
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };
  
  // Render status badge
  const renderStatusBadge = (status) => {
    const statusConfig = {
      new: { tone: "attention", label: t('filters.status.new') },
      acknowledged: { tone: "info", label: t('filters.status.ack') },
      investigating: { tone: "warning", label: t('filters.status.investigating') },
      resolved: { tone: "success", label: t('filters.status.resolved') },
      ignored: { tone: "info-strong", label: t('filters.status.ignored') }
    };
    
    const config = statusConfig[status] || statusConfig.new;
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };
  
  // Prepare data table
  const rows = errors.map(error => [
    renderSeverityBadge(error.severity),
    <Text variant="bodyMd" fontWeight="semibold">
      {error.message.substring(0, 50)}...
    </Text>,
    <Badge>{error.errorType}</Badge>,
    renderStatusBadge(error.status),
    <Text variant="bodySm">{error.occurrences}</Text>,
    <Text variant="bodySm">
      {new Date(error.lastSeenAt).toLocaleString()}
    </Text>,
    <ButtonGroup>
      <Button size="slim" onClick={() => handleViewDetail(error)}>
        {t('actions.view')}
      </Button>
      {error.status !== "resolved" && (
        <Button 
          size="slim" 
          tone="success"
          onClick={() => handleStatusUpdate(error.id, "resolved")}
        >
          {t('actions.resolve')}
        </Button>
      )}
    </ButtonGroup>
  ]);
  
  // Tabs configuration
  const tabs = [
    {
      id: "list",
      content: t('tabs.list'),
      badge: stats.unresolved
    },
    {
      id: "stats",
      content: t('tabs.stats')
    },
    {
      id: "trends",
      content: t('tabs.trend')
    },
    {
      id: "report",
      content: t('tabs.report')
    }
  ];
  
  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle', { total: stats.total || 0, unresolved: stats.unresolved || 0 })}
      primaryAction={{
        content: t('actions.refresh'),
        icon: RefreshIcon,
        loading: isRefreshing,
        onAction: handleRefresh
      }}
      secondaryActions={[
        {
          content: t('actions.export'),
          icon: ExportIcon,
          onAction: () => {
            fetcher.load("/api/errors?action=report&includeDetails=true");
          }
        }
      ]}
    >
      {/* Stats cards */}
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm">{t('statsCards.today')}</Text>
                <Text variant="heading2xl" tone={stats.today > 10 ? "critical" : "base"}>
                  {stats.today || 0}
                </Text>
                {stats.todayTrend && (
                  <InlineStack gap="100">
                    <Icon source={stats.todayTrend > 0 ? ArrowUpIcon : ArrowDownIcon} />
                    <Text variant="bodySm">
                      {stats.todayTrend > 0
                        ? t('statsCards.todayTrendUp', { trend: Math.abs(stats.todayTrend) })
                        : t('statsCards.todayTrendDown', { trend: Math.abs(stats.todayTrend) })
                      }
                    </Text>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm">{t('statsCards.critical')}</Text>
                <Text variant="heading2xl" tone="critical">
                  {stats.critical || 0}
                </Text>
                <ProgressBar 
                  progress={(stats.critical / (stats.total || 1)) * 100} 
                  tone="critical"
                  size="small"
                />
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm">{t('statsCards.resolvedRate')}</Text>
                <Text variant="heading2xl" tone="success">
                  {stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0}%
                </Text>
                <Text variant="bodySm">
                  {stats.resolved || 0} / {stats.total || 0}
                </Text>
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm">{t('statsCards.unique')}</Text>
                <Text variant="heading2xl">
                  {stats.unique || 0}
                </Text>
                <Text variant="bodySm">
                  {t('statsCards.typeDist')}
                </Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>
        
        {/* Main content */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
              {/* Error list tab */}
              {selectedTab === "list" && (
                <BlockStack gap="400">
                  {/* Filters */}
                  <InlineStack gap="200" blockAlign="center">
                    <Select
                      label=""
                      options={[
                        { label: t('filters.status.all'), value: "all" },
                        { label: t('filters.status.new'), value: "new" },
                        { label: t('filters.status.ack'), value: "acknowledged" },
                        { label: t('filters.status.investigating'), value: "investigating" },
                        { label: t('filters.status.resolved'), value: "resolved" },
                        { label: t('filters.status.ignored'), value: "ignored" }
                      ]}
                      value={filters.status}
                      onChange={(value) => handleFilterChange("status", value)}
                    />
                    
                    <Select
                      label=""
                      options={[
                        { label: t('filters.type.all'), value: "all" },
                        { label: "API", value: "API" },
                        { label: t('filters.type.db'), value: "DB" },
                        { label: t('filters.type.validation'), value: "VALIDATION" },
                        { label: t('filters.type.network'), value: "NETWORK" },
                        { label: t('filters.type.translation'), value: "TRANSLATION" },
                        { label: "Shopify", value: "SHOPIFY" }
                      ]}
                      value={filters.errorType}
                      onChange={(value) => handleFilterChange("type", value)}
                    />
                    
                    <Select
                      label=""
                      options={[
                        { label: t('filters.severity.all'), value: "all" },
                        { label: t('filters.severity.low'), value: "1" },
                        { label: t('filters.severity.medium'), value: "2" },
                        { label: t('filters.severity.high'), value: "3" },
                        { label: t('filters.severity.severe'), value: "4" },
                        { label: t('filters.severity.fatal'), value: "5" }
                      ]}
                      value={filters.severity}
                      onChange={(value) => handleFilterChange("severity", value)}
                    />
                    
                    <Select
                      label=""
                      options={[
                        { label: t('filters.timeRange.1h'), value: "1h" },
                        { label: t('filters.timeRange.24h'), value: "24h" },
                        { label: t('filters.timeRange.7d'), value: "7d" },
                        { label: t('filters.timeRange.30d'), value: "30d" },
                        { label: t('filters.timeRange.all'), value: "all" }
                      ]}
                      value={filters.timeRange}
                      onChange={(value) => handleFilterChange("timeRange", value)}
                    />
                  </InlineStack>
                  
                  {/* Bulk actions */}
                  {selectedErrors.length > 0 && (
                    <Banner tone="info">
                      <InlineStack gap="200">
                        <Text>{t('bulk.selected', { count: selectedErrors.length })}</Text>
                        <ButtonGroup>
                          <Button size="slim" onClick={() => handleBatchAction("acknowledged")}>
                            {t('actions.confirm')}
                          </Button>
                          <Button size="slim" tone="success" onClick={() => handleBatchAction("resolved")}>
                            {t('actions.resolve')}
                          </Button>
                          <Button size="slim" onClick={() => handleBatchAction("ignored")}>
                            {t('actions.ignore')}
                          </Button>
                        </ButtonGroup>
                      </InlineStack>
                    </Banner>
                  )}
                  
                  {/* Data table */}
                  {errors.length > 0 ? (
                    <>
                      <DataTable
                        columnContentTypes={[
                          "text",
                          "text",
                          "text",
                          "text",
                          "numeric",
                          "text",
                          "text"
                        ]}
                        headings={[
                          t('table.level'),
                          t('table.message'),
                          t('table.type'),
                          t('table.status'),
                          t('table.count'),
                          t('table.last'),
                          t('table.actions')
                        ]}
                        rows={rows}
                      />
                      
                      {/* Pagination */}
                      <InlineStack align="center">
                        <Pagination
                          hasPrevious={pagination.page > 1}
                          hasNext={pagination.page < pagination.totalPages}
                          onPrevious={() => handlePageChange("prev")}
                          onNext={() => handlePageChange("next")}
                        />
                        <Text variant="bodySm">
                          {t('pagination.page', { page: pagination.page, totalPages: pagination.totalPages })}
                          {" · "}
                          {t('pagination.total', { total: pagination.total })}
                        </Text>
                      </InlineStack>
                    </>
                  ) : (
                    <EmptyState
                      heading={t('empty.heading')}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>{t('empty.description')}</p>
                    </EmptyState>
                  )}
                </BlockStack>
              )}
              
              {/* Stats tab */}
              {selectedTab === "stats" && (
                <BlockStack gap="400">
                  <StatsPanel stats={stats} timeRange={filters.timeRange} />
                </BlockStack>
              )}
              
              {/* Trends tab */}
              {selectedTab === "trends" && (
                <BlockStack gap="400">
                  <TrendsChart timeRange={filters.timeRange} />
                </BlockStack>
              )}
              
              {/* Report tab */}
              {selectedTab === "report" && (
                <BlockStack gap="400">
                  <ErrorReport timeRange={filters.timeRange} />
                </BlockStack>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
      
      {/* Error detail modal */}
      <Modal
        open={detailModalActive}
        onClose={() => setDetailModalActive(false)}
        title={selectedError ? t('detail.title', { id: selectedError.id.substring(0, 8) }) : t('detail.title', { id: '' })}
        primaryAction={{
          content: t('actions.close'),
          onAction: () => setDetailModalActive(false)
        }}
        large
      >
        <Modal.Section>
          {selectedError && (
            <ErrorDetailView 
              error={selectedError} 
              relatedErrors={fetcher.data?.data?.related}
              renderSeverityBadge={renderSeverityBadge}
              renderStatusBadge={renderStatusBadge}
            />
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

/**
 * Stats panel component
 */
function StatsPanel({ stats }) {
  const { t } = useTranslation('errorsPage');
  return (
    <BlockStack gap="400">
      <Text variant="headingMd">{t('statsPanel.title')}</Text>
      
      <Layout>
        <Layout.Section oneHalf>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingSm">{t('statsPanel.typeDist')}</Text>
              {Object.entries(stats.byType || {}).map(([type, count]) => (
                <InlineStack key={type} distribution="equalSpacing">
                  <Badge>{type}</Badge>
                  <Text>{count}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
        
        <Layout.Section oneHalf>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingSm">{t('statsPanel.severityDist')}</Text>
              {Object.entries(stats.bySeverity || {}).map(([level, count]) => (
                <InlineStack key={level} distribution="equalSpacing">
                  <Text>{t('statsPanel.levelLabel', { level: level.replace('level_', '') })}</Text>
                  <ProgressBar 
                    progress={(count / stats.total) * 100} 
                    size="small"
                  />
                  <Text>{count}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </BlockStack>
  );
}

/**
 * Trends chart component
 */
function TrendsChart({ timeRange }) {
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation('errorsPage');
  
  useEffect(() => {
    fetcher.load(`/api/errors?action=trends&timeRange=${timeRange}`);
    setLoading(false);
  }, [timeRange]);
  
  if (loading || !fetcher.data) {
    return <Spinner size="large" />;
  }
  
  const trends = fetcher.data.data;
  
  return (
    <BlockStack gap="400">
      <Text variant="headingMd">{t('trend.title')}</Text>
      
      <Card>
        <BlockStack gap="300">
          <InlineStack distribution="equalSpacing">
            <Text>{t('trend.direction', { dir: trends.trendDirection })}</Text>
            <Text>{t('trend.avgPerHour', { avg: trends.averagePerHour?.toFixed(2) })}</Text>
            <Text>{t('trend.peak', { time: trends.peakTime?.time })}</Text>
          </InlineStack>
          
          {/* Charts should be rendered with a visualization library */}
          <Banner tone="info">
            <Text>{t('trend.chartPlaceholder')}</Text>
          </Banner>
        </BlockStack>
      </Card>
      
      {/* Hotspot errors */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">{t('tabs.list')}</Text>
          {trends.hotspots?.map((hotspot, index) => (
            <InlineStack key={index} distribution="equalSpacing">
              <Text variant="bodySm">{hotspot.message}</Text>
              <Badge tone="critical">{hotspot.count}</Badge>
            </InlineStack>
          ))}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

/**
 * Error report component
 */
function ErrorReport({ timeRange }) {
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation('errorsPage');
  
  useEffect(() => {
    fetcher.load(`/api/errors?action=report&timeRange=${timeRange}&includeDetails=true`);
    setLoading(false);
  }, [timeRange]);
  
  if (loading || !fetcher.data) {
    return <Spinner size="large" />;
  }
  
  const report = fetcher.data.data;
  
  return (
    <BlockStack gap="400">
      <InlineStack distribution="equalSpacing">
        <Text variant="headingMd">{t('report.title')}</Text>
        <Button icon={ExportIcon} onClick={() => downloadReport(report)}>
          {t('report.download')}
        </Button>
      </InlineStack>
      
      {/* Report summary */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">{t('report.summary')}</Text>
          <Text>{t('report.generatedAt', { time: new Date(report.generatedAt).toLocaleString() })}</Text>
          <Text>{t('report.timeRange', { range: timeRange })}</Text>
          
          <BlockStack gap="200">
            <Text>{t('report.total', { count: report.summary.totalErrors })}</Text>
            <Text>{t('report.unique', { count: report.summary.uniqueErrors })}</Text>
            <Text>{t('report.resolved', { count: report.summary.resolvedErrors })}</Text>
            <Text>{t('report.avgResolution', { time: formatDuration(report.summary.averageResolutionTime) })}</Text>
            <Text>{t('report.critical', { count: report.summary.criticalErrors })}</Text>
          </BlockStack>
        </BlockStack>
      </Card>
      
      {/* Improvement suggestions */}
      {report.recommendations?.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">{t('report.improvements')}</Text>
            {report.recommendations.map((rec, index) => (
              <Banner key={index} tone={rec.priority === 'critical' ? 'critical' : 'warning'}>
                <BlockStack gap="100">
                  <Badge tone={rec.priority === 'critical' ? 'critical' : 'warning'}>
                    {t('report.priority', { priority: rec.priority })}
                  </Badge>
                  <Text>{rec.suggestion}</Text>
                </BlockStack>
              </Banner>
            ))}
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

/**
 * Error detail view
 */
function ErrorDetailView({ error, relatedErrors, renderSeverityBadge, renderStatusBadge }) {
  const { t } = useTranslation('errorsPage');
  return (
    <BlockStack gap="400">
      {/* Basic info */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">{t('detail.basic')}</Text>
          <InlineStack gap="200">
            {renderSeverityBadge(error.severity)}
            {renderStatusBadge(error.status)}
            <Badge>{error.errorType}</Badge>
          </InlineStack>
          
          <BlockStack gap="200">
            <Text variant="bodyMd" fontWeight="semibold">{t('detail.message')}</Text>
            <Text>{error.message}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">{t('detail.code')}</Text>
            <Text fontFamily="monospace">{error.errorCode}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">{t('detail.fingerprint')}</Text>
            <Text variant="bodySm" fontFamily="monospace">{error.fingerprint}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">{t('detail.occurrences')}</Text>
            <Text>{error.occurrences}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">{t('detail.first')}</Text>
            <Text>{new Date(error.createdAt).toLocaleString()}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">{t('detail.last')}</Text>
            <Text>{new Date(error.lastSeenAt).toLocaleString()}</Text>
          </BlockStack>
        </BlockStack>
      </Card>
      
      {/* Suggested fixes */}
      {error.suggestedFix && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">{t('detail.suggestions')}</Text>
            <Text>{error.suggestedFix}</Text>
          </BlockStack>
        </Card>
      )}
      
      {/* Stack trace */}
      {error.stackTrace && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">{t('detail.stack')}</Text>
            <pre style={{
              backgroundColor: '#f5f5f5',
              padding: '10px',
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto',
              maxHeight: '300px'
            }}>
              {error.stackTrace}
            </pre>
          </BlockStack>
        </Card>
      )}
      
      {/* Related errors */}
      {relatedErrors && relatedErrors.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">{t('detail.related')}</Text>
            {relatedErrors.map((related, index) => (
              <InlineStack key={index} distribution="equalSpacing">
                <Text variant="bodySm">{related.message.substring(0, 50)}...</Text>
                <Badge>{related.relation}</Badge>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

function formatDuration(ms) {
  if (!ms) return "N/A";
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error-report-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
