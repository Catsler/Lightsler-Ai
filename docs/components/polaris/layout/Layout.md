# Layout 组件参考文档

**最后验证**: 2025-09-04  
**Polaris版本**: v12.27.0  
**使用频率**: ⭐⭐⭐⭐ (页面布局核心组件)

## 正确导入方式

```javascript
import { Layout } from '@shopify/polaris';
```

## 重要说明

⚠️ **Layout是Page的直接子组件**：
- Layout提供响应式的两栏或单栏布局
- Layout.Section用于定义内容区域
- secondary属性定义侧边栏
- 自动处理移动端布局响应

## 基础用法

### 单栏布局
```javascript
<Page title="页面标题">
  <Layout>
    <Layout.Section>
      <Card>
        <Text>主要内容区域</Text>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 两栏布局（主内容 + 侧边栏）
```javascript
<Page title="页面标题">
  <Layout>
    <Layout.Section>
      <Card>
        <Text>主要内容</Text>
      </Card>
    </Layout.Section>
    
    <Layout.Section secondary>
      <Card>
        <Text>侧边栏内容</Text>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 多个内容区域
```javascript
<Page title="仪表板">
  <Layout>
    <Layout.Section>
      <Card>
        <Text>顶部内容</Text>
      </Card>
    </Layout.Section>
    
    <Layout.Section>
      <Card>
        <Text>中间内容</Text>
      </Card>
    </Layout.Section>
    
    <Layout.Section secondary>
      <Card>
        <Text>侧边栏</Text>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

## 项目特定模式

### Pattern 1: 主应用布局（最常用）
```javascript
// app.jsx - 主页面布局
<Page title="多语言翻译管理">
  <Layout>
    {/* 统计概览区 */}
    <Layout.Section>
      <Grid>
        <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3}}>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">已扫描资源</Text>
              <Text variant="displayLg">{scanStats.total}</Text>
            </BlockStack>
          </Card>
        </Grid.Cell>
        {/* 更多统计卡片 */}
      </Grid>
    </Layout.Section>
    
    {/* 主要内容区 - 资源列表 */}
    <Layout.Section>
      <Card>
        <ResourceTable resources={resources} />
      </Card>
    </Layout.Section>
    
    {/* 侧边栏 - 快速操作和状态 */}
    <Layout.Section secondary>
      <BlockStack gap="400">
        <Card title="快速操作">
          <BlockStack gap="200">
            <Button fullWidth onClick={handleScan}>
              扫描资源
            </Button>
            <Button fullWidth onClick={handleTranslate}>
              开始翻译
            </Button>
          </BlockStack>
        </Card>
        
        <Card title="翻译状态">
          <BlockStack gap="200">
            <ProgressBar progress={translationProgress} />
            <Text variant="bodySm">
              {translatedCount}/{totalCount} 已完成
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Layout.Section>
  </Layout>
</Page>
```

### Pattern 2: 详情页面布局
```javascript
// 详情页 - 主内容和侧边信息
<Page title={`产品详情: ${product.title}`}>
  <Layout>
    {/* 主要翻译内容 */}
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <Text variant="headingLg">翻译内容</Text>
          {translations.map(translation => (
            <Card key={translation.lang} sectioned>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingMd">{translation.langName}</Text>
                  <Badge tone={translation.status === 'synced' ? 'success' : 'attention'}>
                    {translation.status}
                  </Badge>
                </InlineStack>
                <Text>{translation.content}</Text>
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      </Card>
    </Layout.Section>
    
    {/* 侧边栏 - 元信息和操作 */}
    <Layout.Section secondary>
      <BlockStack gap="400">
        <Card title="资源信息">
          <BlockStack gap="200">
            <Text variant="bodySm">类型: {product.resourceType}</Text>
            <Text variant="bodySm">创建: {formatDate(product.createdAt)}</Text>
            <Text variant="bodySm">更新: {formatDate(product.updatedAt)}</Text>
          </BlockStack>
        </Card>
        
        <Card title="翻译操作">
          <BlockStack gap="200">
            <Button fullWidth onClick={handleRetranslate}>
              重新翻译
            </Button>
            <Button fullWidth onClick={handleSync}>
              同步到Shopify
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Layout.Section>
  </Layout>
</Page>
```

### Pattern 3: 设置页面布局
```javascript
// 设置页面 - 表单和帮助信息
<Page title="翻译设置">
  <Layout>
    {/* 主要设置表单 */}
    <Layout.Section>
      <Card>
        <FormLayout>
          <Select
            label="默认源语言"
            options={languageOptions}
            value={settings.sourceLang}
            onChange={handleSourceLangChange}
          />
          
          <Select
            label="翻译引擎"
            options={engineOptions}
            value={settings.engine}
            onChange={handleEngineChange}
          />
          
          <TextField
            label="API密钥"
            type="password"
            value={settings.apiKey}
            onChange={handleApiKeyChange}
            helpText="用于访问翻译服务的API密钥"
          />
        </FormLayout>
      </Card>
    </Layout.Section>
    
    {/* 侧边栏 - 帮助和状态 */}
    <Layout.Section secondary>
      <BlockStack gap="400">
        <Card title="配置帮助">
          <BlockStack gap="200">
            <Text variant="bodySm">
              • 源语言：店铺的默认语言
            </Text>
            <Text variant="bodySm">
              • 翻译引擎：建议使用GPT-4获得最佳质量
            </Text>
            <Text variant="bodySm">
              • API密钥：在相应服务商控制台获取
            </Text>
          </BlockStack>
        </Card>
        
        <Card title="系统状态">
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text variant="bodySm">API连接</Text>
              <Badge tone={apiStatus === 'connected' ? 'success' : 'critical'}>
                {apiStatus}
              </Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text variant="bodySm">剩余配额</Text>
              <Text variant="bodySm">{remainingQuota}</Text>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Layout.Section>
  </Layout>
</Page>
```

### Pattern 4: 监控仪表板布局
```javascript
// 监控页面 - 全宽布局
<Page title="系统监控" fullWidth>
  <Layout>
    {/* 顶部 - 关键指标 */}
    <Layout.Section>
      <Grid>
        <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
          <Card>
            <BlockStack gap="200">
              <Text variant="bodySm">系统健康</Text>
              <Text variant="headingXl">98%</Text>
              <Badge tone="success">正常</Badge>
            </BlockStack>
          </Card>
        </Grid.Cell>
        {/* 更多指标卡片 */}
      </Grid>
    </Layout.Section>
    
    {/* 中间 - 主要图表区域 */}
    <Layout.Section>
      <Card>
        <Text variant="headingLg">翻译趋势</Text>
        <div style={{ height: 300 }}>
          {/* 图表组件 */}
        </div>
      </Card>
    </Layout.Section>
    
    {/* 底部 - 详细表格 */}
    <Layout.Section>
      <Card>
        <DataTable
          columnContentTypes={['text', 'numeric', 'text', 'text']}
          headings={['时间', '翻译数', '错误数', '状态']}
          rows={monitoringData}
        />
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### Pattern 5: 错误管理页面
```javascript
// 错误页面 - 列表和筛选
<Page title="错误日志">
  <Layout>
    {/* 主要错误列表 */}
    <Layout.Section>
      <Card>
        <DataTable
          columnContentTypes={['text', 'text', 'text', 'text', 'text']}
          headings={['时间', '类型', '消息', '严重度', '状态']}
          rows={errorData}
        />
      </Card>
    </Layout.Section>
    
    {/* 侧边栏 - 筛选和统计 */}
    <Layout.Section secondary>
      <BlockStack gap="400">
        <Card title="筛选">
          <FormLayout>
            <Select
              label="错误类型"
              options={errorTypeOptions}
              value={filters.type}
              onChange={handleTypeFilter}
            />
            
            <Select
              label="严重程度"
              options={severityOptions}
              value={filters.severity}
              onChange={handleSeverityFilter}
            />
          </FormLayout>
        </Card>
        
        <Card title="错误统计">
          <BlockStack gap="200">
            {Object.entries(errorStats).map(([type, count]) => (
              <InlineStack key={type} align="space-between">
                <Text variant="bodySm">{type}</Text>
                <Badge>{count}</Badge>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Layout.Section>
  </Layout>
</Page>
```

## Props 参考

### Layout组件
| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| children | ReactNode | - | 必需 | Layout.Section组件 |
| sectioned | boolean | false | 未使用 | 自动添加内边距 |

### Layout.Section组件
| Prop | 类型 | 默认值 | 项目使用率 | 说明 |
|------|------|--------|------------|------|
| children | ReactNode | - | 必需 | 区域内容 |
| secondary | boolean | false | 侧边栏使用 | 是否为次要区域（侧边栏） |
| fullWidth | boolean | false | 未使用 | 全宽布局 |
| oneHalf | boolean | false | 未使用 | 占一半宽度 |
| oneThird | boolean | false | 未使用 | 占三分之一宽度 |

## 响应式行为

Layout组件自动处理响应式布局：
- **桌面端**: 主内容左侧，侧边栏右侧（约3:1比例）
- **平板端**: 主内容上方，侧边栏下方
- **移动端**: 单栏垂直布局

## 项目使用统计

基于代码分析：
- **布局类型**: 单栏(40%)、两栏(50%)、多区域(10%)
- **secondary使用**: 50%的页面有侧边栏
- **典型内容**: Card(90%)、Grid(30%)、DataTable(25%)
- **嵌套深度**: Layout > Layout.Section > Card (标准模式)

## 最佳实践

1. **区域规划**:
   - 主要内容放在第一个Layout.Section
   - 辅助信息和操作放在secondary区域
   - 统计概览通常在最顶部

2. **内容组织**:
   ```javascript
   // 推荐的内容层次
   <Layout>
     <Layout.Section>          {/* 统计概览 */}
       <Grid>
         {/* 统计卡片 */}
       </Grid>
     </Layout.Section>
     
     <Layout.Section>          {/* 主要内容 */}
       <Card>
         {/* 主要功能区域 */}
       </Card>
     </Layout.Section>
     
     <Layout.Section secondary> {/* 辅助操作 */}
       <Card>
         {/* 快速操作和状态 */}
       </Card>
     </Layout.Section>
   </Layout>
   ```

3. **移动端考虑**:
   - secondary区域在移动端会移到底部
   - 重要操作不应该只放在侧边栏
   - 考虑使用全宽布局的fullWidth属性

4. **性能优化**:
   - 避免在Layout.Section中放置过重的组件
   - 侧边栏内容懒加载
   - 使用BlockStack优化区域内的垂直布局

## 常见错误

❌ **错误**: 直接在Layout下放置非Layout.Section内容
```javascript
<Layout>
  <Card>内容</Card>  {/* 错误！应该包装在Layout.Section中 */}
</Layout>
```

✅ **正确**: 始终使用Layout.Section包装
```javascript
<Layout>
  <Layout.Section>
    <Card>内容</Card>
  </Layout.Section>
</Layout>
```

❌ **错误**: 过多的secondary区域
```javascript
<Layout>
  <Layout.Section secondary>侧边栏1</Layout.Section>
  <Layout.Section secondary>侧边栏2</Layout.Section>  {/* 错误！ */}
</Layout>
```

✅ **正确**: 只使用一个secondary区域
```javascript
<Layout>
  <Layout.Section>主内容</Layout.Section>
  <Layout.Section secondary>
    <BlockStack gap="400">
      {/* 侧边栏内容1 */}
      {/* 侧边栏内容2 */}
    </BlockStack>
  </Layout.Section>
</Layout>
```

## 相关组件
- Page: Layout的父容器
- Card: Layout.Section的典型子组件  
- Grid: 响应式网格布局
- BlockStack: 垂直布局组件

## 验证命令
```bash
# 检查Layout使用
grep -r "<Layout>" app/
# 检查Layout.Section的使用
grep -r "Layout.Section" app/
```