/**
 * 错误仪表板页面
 * 提供错误查看、分析、管理的可视化界面
 */

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
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  SearchIcon,
  RefreshIcon,
  ExportIcon,
  FilterIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  AlertCircleIcon
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

/**
 * 加载错误数据
 */
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  // 获取查询参数
  const page = parseInt(url.searchParams.get("page") || "1");
  const status = url.searchParams.get("status") || "all";
  const errorType = url.searchParams.get("type") || "all";
  const severity = url.searchParams.get("severity") || "all";
  const timeRange = url.searchParams.get("timeRange") || "24h";
  const tab = url.searchParams.get("tab") || "list";
  
  // 构建API请求
  const params = new URLSearchParams({
    action: tab === "list" ? "list" : tab,
    page: page.toString(),
    pageSize: "20",
    timeRange
  });
  
  if (status !== "all") params.append("status", status);
  if (errorType !== "all") params.append("errorType", errorType);
  if (severity !== "all") params.append("severity", severity);
  
  // 获取数据，添加错误处理
  const [errorResponse, statsResponse] = await Promise.all([
    fetch(`${url.origin}/api/errors?${params}`)
      .then(async r => {
        if (!r.ok) {
          console.error(`API错误: ${r.status} ${r.statusText}`);
          return { data: { errors: [], pagination: {} } };
        }
        const contentType = r.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("响应不是JSON格式");
          return { data: { errors: [], pagination: {} } };
        }
        const text = await r.text();
        if (!text) {
          console.error("响应为空");
          return { data: { errors: [], pagination: {} } };
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error("JSON解析失败:", e);
          return { data: { errors: [], pagination: {} } };
        }
      })
      .catch(err => {
        console.error("请求失败:", err);
        return { data: { errors: [], pagination: {} } };
      }),
    fetch(`${url.origin}/api/errors?action=stats&timeRange=${timeRange}`)
      .then(async r => {
        if (!r.ok) {
          console.error(`统计API错误: ${r.status} ${r.statusText}`);
          return { data: {} };
        }
        const contentType = r.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("统计响应不是JSON格式");
          return { data: {} };
        }
        const text = await r.text();
        if (!text) {
          console.error("统计响应为空");
          return { data: {} };
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error("统计JSON解析失败:", e);
          return { data: {} };
        }
      })
      .catch(err => {
        console.error("统计请求失败:", err);
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

/**
 * 错误仪表板组件
 */
export default function ErrorDashboard() {
  const { errors, pagination, stats, filters } = useLoaderData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 状态管理
  const [selectedTab, setSelectedTab] = useState(filters.tab);
  const [selectedErrors, setSelectedErrors] = useState([]);
  const [detailModalActive, setDetailModalActive] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // 自动刷新
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedTab === "list" || selectedTab === "stats") {
        handleRefresh();
      }
    }, 30000); // 每30秒刷新一次
    
    return () => clearInterval(interval);
  }, [selectedTab]);
  
  // 处理刷新
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetcher.load(`/app/errors?${searchParams.toString()}`);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [searchParams]);
  
  // 处理筛选变化
  const handleFilterChange = useCallback((key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    newParams.set("page", "1"); // 重置页码
    setSearchParams(newParams);
  }, [searchParams]);
  
  // 处理标签切换
  const handleTabChange = useCallback((tab) => {
    setSelectedTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", tab);
    setSearchParams(newParams);
  }, [searchParams]);
  
  // 处理分页
  const handlePageChange = useCallback((direction) => {
    const currentPage = pagination.page || 1;
    const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", newPage.toString());
    setSearchParams(newParams);
  }, [pagination, searchParams]);
  
  // 处理错误详情查看
  const handleViewDetail = useCallback((error) => {
    setSelectedError(error);
    setDetailModalActive(true);
    
    // 获取详细信息
    fetcher.load(`/api/errors?action=detail&id=${error.id}`);
  }, []);
  
  // 处理错误状态更新
  const handleStatusUpdate = useCallback((errorId, newStatus) => {
    fetcher.submit(
      { action: "update", id: errorId, status: newStatus },
      { method: "post", action: "/api/errors" }
    );
  }, []);
  
  // 处理批量操作
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
  
  // 渲染错误严重程度徽章
  const renderSeverityBadge = (severity) => {
    const severityConfig = {
      1: { tone: "info", label: "低" },
      2: { tone: "attention", label: "中" },
      3: { tone: "warning", label: "高" },
      4: { tone: "critical", label: "严重" },
      5: { tone: "critical", label: "致命" }
    };
    
    const config = severityConfig[severity] || severityConfig[2];
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };
  
  // 渲染错误状态徽章
  const renderStatusBadge = (status) => {
    const statusConfig = {
      new: { tone: "attention", label: "新建" },
      acknowledged: { tone: "info", label: "已确认" },
      investigating: { tone: "warning", label: "调查中" },
      resolved: { tone: "success", label: "已解决" },
      ignored: { tone: "info-strong", label: "已忽略" }
    };
    
    const config = statusConfig[status] || statusConfig.new;
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };
  
  // 准备数据表格
  const rows = errors.map(error => [
    renderSeverityBadge(error.severity),
    <Text variant="bodyMd" fontWeight="semibold">
      {error.message.substring(0, 50)}...
    </Text>,
    <Badge>{error.errorType}</Badge>,
    renderStatusBadge(error.status),
    <Text variant="bodySm">{error.occurrences}</Text>,
    <Text variant="bodySm">
      {new Date(error.lastSeenAt).toLocaleString('zh-CN')}
    </Text>,
    <ButtonGroup>
      <Button size="slim" onClick={() => handleViewDetail(error)}>
        查看
      </Button>
      {error.status !== "resolved" && (
        <Button 
          size="slim" 
          tone="success"
          onClick={() => handleStatusUpdate(error.id, "resolved")}
        >
          解决
        </Button>
      )}
    </ButtonGroup>
  ]);
  
  // 标签配置
  const tabs = [
    {
      id: "list",
      content: "错误列表",
      badge: stats.unresolved
    },
    {
      id: "stats",
      content: "统计分析"
    },
    {
      id: "trends",
      content: "趋势图表"
    },
    {
      id: "report",
      content: "错误报告"
    }
  ];
  
  return (
    <Page
      title="错误监控中心"
      subtitle={`共 ${stats.total || 0} 个错误，${stats.unresolved || 0} 个待处理`}
      primaryAction={{
        content: "刷新",
        icon: RefreshIcon,
        loading: isRefreshing,
        onAction: handleRefresh
      }}
      secondaryActions={[
        {
          content: "导出报告",
          icon: ExportIcon,
          onAction: () => {
            fetcher.load("/api/errors?action=report&includeDetails=true");
          }
        }
      ]}
    >
      {/* 统计卡片 */}
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm">今日错误</Text>
                <Text variant="heading2xl" tone={stats.today > 10 ? "critical" : "base"}>
                  {stats.today || 0}
                </Text>
                {stats.todayTrend && (
                  <InlineStack gap="100">
                    <Icon source={stats.todayTrend > 0 ? ArrowUpIcon : ArrowDownIcon} />
                    <Text variant="bodySm">
                      {Math.abs(stats.todayTrend)}% {stats.todayTrend > 0 ? "上升" : "下降"}
                    </Text>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm">严重错误</Text>
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
                <Text variant="headingSm">解决率</Text>
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
                <Text variant="headingSm">独特错误</Text>
                <Text variant="heading2xl">
                  {stats.unique || 0}
                </Text>
                <Text variant="bodySm">
                  不同错误类型
                </Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>
        
        {/* 主内容区 */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
              {/* 错误列表标签 */}
              {selectedTab === "list" && (
                <BlockStack gap="400">
                  {/* 筛选器 */}
                  <InlineStack gap="200" blockAlign="center">
                    <Select
                      label=""
                      options={[
                        { label: "所有状态", value: "all" },
                        { label: "新建", value: "new" },
                        { label: "已确认", value: "acknowledged" },
                        { label: "调查中", value: "investigating" },
                        { label: "已解决", value: "resolved" },
                        { label: "已忽略", value: "ignored" }
                      ]}
                      value={filters.status}
                      onChange={(value) => handleFilterChange("status", value)}
                    />
                    
                    <Select
                      label=""
                      options={[
                        { label: "所有类型", value: "all" },
                        { label: "API", value: "API" },
                        { label: "数据库", value: "DB" },
                        { label: "验证", value: "VALIDATION" },
                        { label: "网络", value: "NETWORK" },
                        { label: "翻译", value: "TRANSLATION" },
                        { label: "Shopify", value: "SHOPIFY" }
                      ]}
                      value={filters.errorType}
                      onChange={(value) => handleFilterChange("type", value)}
                    />
                    
                    <Select
                      label=""
                      options={[
                        { label: "所有级别", value: "all" },
                        { label: "低", value: "1" },
                        { label: "中", value: "2" },
                        { label: "高", value: "3" },
                        { label: "严重", value: "4" },
                        { label: "致命", value: "5" }
                      ]}
                      value={filters.severity}
                      onChange={(value) => handleFilterChange("severity", value)}
                    />
                    
                    <Select
                      label=""
                      options={[
                        { label: "最近1小时", value: "1h" },
                        { label: "最近24小时", value: "24h" },
                        { label: "最近7天", value: "7d" },
                        { label: "最近30天", value: "30d" },
                        { label: "所有时间", value: "all" }
                      ]}
                      value={filters.timeRange}
                      onChange={(value) => handleFilterChange("timeRange", value)}
                    />
                  </InlineStack>
                  
                  {/* 批量操作 */}
                  {selectedErrors.length > 0 && (
                    <Banner tone="info">
                      <InlineStack gap="200">
                        <Text>已选择 {selectedErrors.length} 个错误</Text>
                        <ButtonGroup>
                          <Button size="slim" onClick={() => handleBatchAction("acknowledged")}>
                            确认
                          </Button>
                          <Button size="slim" tone="success" onClick={() => handleBatchAction("resolved")}>
                            解决
                          </Button>
                          <Button size="slim" onClick={() => handleBatchAction("ignored")}>
                            忽略
                          </Button>
                        </ButtonGroup>
                      </InlineStack>
                    </Banner>
                  )}
                  
                  {/* 数据表格 */}
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
                          "级别",
                          "错误消息",
                          "类型",
                          "状态",
                          "次数",
                          "最后出现",
                          "操作"
                        ]}
                        rows={rows}
                      />
                      
                      {/* 分页 */}
                      <InlineStack align="center">
                        <Pagination
                          hasPrevious={pagination.page > 1}
                          hasNext={pagination.page < pagination.totalPages}
                          onPrevious={() => handlePageChange("prev")}
                          onNext={() => handlePageChange("next")}
                        />
                        <Text variant="bodySm">
                          第 {pagination.page} / {pagination.totalPages} 页，
                          共 {pagination.total} 条记录
                        </Text>
                      </InlineStack>
                    </>
                  ) : (
                    <EmptyState
                      heading="暂无错误记录"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>当前筛选条件下没有找到错误记录</p>
                    </EmptyState>
                  )}
                </BlockStack>
              )}
              
              {/* 统计分析标签 */}
              {selectedTab === "stats" && (
                <BlockStack gap="400">
                  <StatsPanel stats={stats} timeRange={filters.timeRange} />
                </BlockStack>
              )}
              
              {/* 趋势图表标签 */}
              {selectedTab === "trends" && (
                <BlockStack gap="400">
                  <TrendsChart timeRange={filters.timeRange} />
                </BlockStack>
              )}
              
              {/* 错误报告标签 */}
              {selectedTab === "report" && (
                <BlockStack gap="400">
                  <ErrorReport timeRange={filters.timeRange} />
                </BlockStack>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
      
      {/* 错误详情模态框 */}
      <Modal
        open={detailModalActive}
        onClose={() => setDetailModalActive(false)}
        title={selectedError ? `错误详情 #${selectedError.id.substring(0, 8)}` : "错误详情"}
        primaryAction={{
          content: "关闭",
          onAction: () => setDetailModalActive(false)
        }}
        large
      >
        <Modal.Section>
          {selectedError && (
            <ErrorDetailView 
              error={selectedError} 
              relatedErrors={fetcher.data?.data?.related}
            />
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

/**
 * 统计面板组件
 */
function StatsPanel({ stats, timeRange }) {
  return (
    <BlockStack gap="400">
      <Text variant="headingMd">错误统计分析</Text>
      
      <Layout>
        <Layout.Section oneHalf>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingSm">错误类型分布</Text>
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
              <Text variant="headingSm">严重程度分布</Text>
              {Object.entries(stats.bySeverity || {}).map(([level, count]) => (
                <InlineStack key={level} distribution="equalSpacing">
                  <Text>级别 {level.replace('level_', '')}</Text>
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
 * 趋势图表组件
 */
function TrendsChart({ timeRange }) {
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  
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
      <Text variant="headingMd">错误趋势分析</Text>
      
      <Card>
        <BlockStack gap="300">
          <InlineStack distribution="equalSpacing">
            <Text>趋势方向: {trends.trendDirection}</Text>
            <Text>平均每小时: {trends.averagePerHour?.toFixed(2)}</Text>
            <Text>峰值时间: {trends.peakTime?.time}</Text>
          </InlineStack>
          
          {/* 这里应该集成图表库如recharts来显示实际图表 */}
          <Banner tone="info">
            <Text>图表功能需要集成可视化库</Text>
          </Banner>
        </BlockStack>
      </Card>
      
      {/* 热点错误 */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">热点错误（最频繁）</Text>
          {trends.hotspots?.map((hotspot, index) => (
            <InlineStack key={index} distribution="equalSpacing">
              <Text variant="bodySm">{hotspot.message}</Text>
              <Badge tone="critical">{hotspot.count}次</Badge>
            </InlineStack>
          ))}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

/**
 * 错误报告组件
 */
function ErrorReport({ timeRange }) {
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  
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
        <Text variant="headingMd">错误报告</Text>
        <Button icon={ExportIcon} onClick={() => downloadReport(report)}>
          下载报告
        </Button>
      </InlineStack>
      
      {/* 报告摘要 */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">报告摘要</Text>
          <Text>生成时间: {new Date(report.generatedAt).toLocaleString('zh-CN')}</Text>
          <Text>时间范围: {timeRange}</Text>
          
          <BlockStack gap="200">
            <Text>总错误数: {report.summary.totalErrors}</Text>
            <Text>独特错误: {report.summary.uniqueErrors}</Text>
            <Text>已解决: {report.summary.resolvedErrors}</Text>
            <Text>平均解决时间: {formatDuration(report.summary.averageResolutionTime)}</Text>
            <Text>严重错误: {report.summary.criticalErrors}</Text>
          </BlockStack>
        </BlockStack>
      </Card>
      
      {/* 改进建议 */}
      {report.recommendations?.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">改进建议</Text>
            {report.recommendations.map((rec, index) => (
              <Banner key={index} tone={rec.priority === 'critical' ? 'critical' : 'warning'}>
                <BlockStack gap="100">
                  <Badge tone={rec.priority === 'critical' ? 'critical' : 'warning'}>
                    {rec.priority}优先级
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
 * 错误详情视图组件
 */
function ErrorDetailView({ error, relatedErrors }) {
  return (
    <BlockStack gap="400">
      {/* 基本信息 */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingSm">基本信息</Text>
          <InlineStack gap="200">
            {renderSeverityBadge(error.severity)}
            {renderStatusBadge(error.status)}
            <Badge>{error.errorType}</Badge>
          </InlineStack>
          
          <BlockStack gap="200">
            <Text variant="bodyMd" fontWeight="semibold">错误消息:</Text>
            <Text>{error.message}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">错误代码:</Text>
            <Text fontFamily="monospace">{error.errorCode}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">指纹:</Text>
            <Text variant="bodySm" fontFamily="monospace">{error.fingerprint}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">发生次数:</Text>
            <Text>{error.occurrences}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">首次出现:</Text>
            <Text>{new Date(error.createdAt).toLocaleString('zh-CN')}</Text>
            
            <Text variant="bodyMd" fontWeight="semibold">最后出现:</Text>
            <Text>{new Date(error.lastSeenAt).toLocaleString('zh-CN')}</Text>
          </BlockStack>
        </BlockStack>
      </Card>
      
      {/* 建议修复方案 */}
      {error.suggestedFix && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">建议修复方案</Text>
            <Text>{error.suggestedFix}</Text>
          </BlockStack>
        </Card>
      )}
      
      {/* 错误堆栈 */}
      {error.stackTrace && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">错误堆栈</Text>
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
      
      {/* 相关错误 */}
      {relatedErrors && relatedErrors.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm">相关错误</Text>
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

// 辅助函数

function renderSeverityBadge(severity) {
  const severityConfig = {
    1: { tone: "info", label: "低" },
    2: { tone: "attention", label: "中" },
    3: { tone: "warning", label: "高" },
    4: { tone: "critical", label: "严重" },
    5: { tone: "critical", label: "致命" }
  };
  
  const config = severityConfig[severity] || severityConfig[2];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function renderStatusBadge(status) {
  const statusConfig = {
    new: { tone: "attention", label: "新建" },
    acknowledged: { tone: "info", label: "已确认" },
    investigating: { tone: "warning", label: "调查中" },
    resolved: { tone: "success", label: "已解决" },
    ignored: { tone: "info-strong", label: "已忽略" }
  };
  
  const config = statusConfig[status] || statusConfig.new;
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function formatDuration(ms) {
  if (!ms) return "N/A";
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}天`;
  if (hours > 0) return `${hours}小时`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
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