# TODO 任务列表

## 🚧 进行中 (In Progress)

### 资源详情页系统重构 (2025-09-10启动) - Linus哲学
**架构原则**: 消除26个特殊情况，统一为1个通用模式
**开发方式**: 多Agent并行开发
**预计完成**: 2025-09-15

#### Phase 1: 数据层重构 (并行执行) ✅ 完成
- [x] **统一资源详情API** - `backend-architect`
  - 文件: `/api/resource-detail.jsx`
  - 处理所有26种资源类型
  - 响应时间目标: < 100ms
- [ ] **数据库查询优化** - `database-optimizer`
  - 添加必要索引
  - 实现查询缓存
  - 优化contentFields JSON查询

#### Phase 2: 视图层开发 (并行执行) ✅ 完成
- [x] **通用ResourceDetail组件** - `frontend-developer`
  - 文件: `app/components/ResourceDetail.jsx`
  - 自适应不同资源类型
  - 最多3层缩进原则
- [x] **资源类型适配器系统** - `backend-architect`
  - 文件: `app/utils/resource-adapters.js`
  - 统一数据转换接口
  - 消除if/else地狱

#### Phase 3: 路由整合 (串行执行) ✅ 完成
- [x] **更新主页路由逻辑** - `code-reviewer`
  - 文件: `app/routes/app._index.jsx`
  - 统一跳转逻辑
  - 移除"开发中"提示
- [x] **创建通用详情页路由** - `frontend-developer`
  - 文件: `app/routes/app.resource.$type.$id.jsx`
  - 动态处理所有资源类型
  - 保持Theme页面兼容

#### Phase 4: Theme JSON优化 🎨
- [ ] **增强JSON可视化** - `shopify-app-architect`
  - 组件: ThemeJsonViewer
  - 树形结构展示
  - 高亮翻译字段
- [ ] **优化递归翻译** - `shopify-app-architect`
  - 减少递归深度
  - 提升翻译性能
  - 字段级编辑支持

### Theme JSON详情页开发 (2025-01-10启动)
**开发方式**: 多Agent并行开发
**预计完成**: 2025-01-13

#### Phase 1: 并行开发 (Agent分工) ✅ 完成
- [x] 创建Theme专用详情页路由 - `backend-architect`
  - `app/routes/app.theme.detail.$resourceId.jsx`
  - 实现loader函数获取资源数据
- [x] 开发JSON树形展示组件 - `frontend-developer`
  - `app/components/ThemeJsonTreeView.jsx`
  - 递归渲染、展开/折叠功能
- [x] 创建翻译对比视图组件 - `ui-ux-designer`
  - `app/components/ThemeTranslationCompare.jsx`
  - 双栏对比布局
- [x] 更新列表页跳转逻辑 - `code-reviewer`
  - Theme资源跳转到专用详情页
  - 普通资源显示开发中提示

#### Phase 2: 验证测试 ✅ 完成
- [x] 运行 `npm run lint && npm run build` 验证
  - ESLint检查通过（仅有未使用变量警告）
  - 项目构建成功
- [ ] 添加搜索过滤功能 - `frontend-developer`（后续优化）
- [ ] 实现批量编辑功能 - `ui-ux-designer`（后续优化）
- [ ] 性能优化和测试 - `performance-engineer`（后续优化）

## 📋 待办事项 (Pending)

### 高优先级
- [ ] 添加语言数据缓存过期时间管理（30分钟自动过期）
- [ ] 实现跨标签页语言数据同步功能
- [ ] 优化大数据量时的内存使用（实现 LRU 缓存淘汰）
- [ ] 添加数据持久化到 localStorage 功能

### 中优先级
- [ ] 实现语言切换时的预加载机制
- [ ] 添加数据增量更新功能（减少全量替换）
- [ ] 优化快速切换语言时的防抖处理
- [ ] 添加加载状态的骨架屏显示

### 低优先级
- [ ] 添加语言数据导出功能
- [ ] 实现批量语言操作功能
- [ ] 添加翻译进度可视化图表
- [ ] 优化移动端显示效果

## ✅ 已完成 (Completed)

### 双语展示字段完整性修复 - 2025-09-10
**实施原则**: KISS (Keep It Simple, Stupid) - 最小改动，最大效果
**改动文件**: 仅2个文件（api.resource-detail.jsx, ResourceDetail.jsx）
- [x] 修复适配器null值过滤问题 - 保留null值展示字段存在性
- [x] 导出STANDARD_TRANSLATION_MAP - 建立单一事实来源
- [x] 更新组件使用统一映射表 - 消除硬编码配置
- [x] 实现联合字段集策略 - 确保所有字段都展示
- [x] 运行 `npm run build` 验证构建成功
- [x] 创建Playwright测试脚本验证功能

### 产品选项归类与双语详情增强 - 2025-09-12（KISS）
- [x] 新增按需API：`/api/product-options`、`/api/product-metafields`（只读懒加载）
- [x] GraphQL辅助：`fetchOptionsForProduct`、`fetchMetafieldsForProduct`
- [x] 列表页：产品行支持“展开选项”，懒加载显示到该产品下（未改数据结构）
- [x] 详情页：新增“选项/Metafields”区块，按需加载并展示双语对照（无译文时显示占位）
- [x] 双语回退：对未知翻译字段启用“键值对”回退展示，保证“有原文就显示”
- [x] 列表去重：隐藏顶层 `PRODUCT_OPTION/PRODUCT_OPTION_VALUE` 资源，只保留产品行“展开选项”展示路径
- [x] 布局精简：移除右侧栏；“产品扩展”移至“资源内容”下；三按钮并入“资源内容”抬头；“元数据”移至页面底部
- [x] Playwright脚本：补充最小端到端校验（布局顺序、按钮存在、展开/收起选项与Metafields）
  - 运行前提：已通过 `shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000` 启动并登录，准备 `E2E_STORAGE_STATE`
  - 运行示例：`E2E_BASE_URL=https://translate.ease-joy.fun:3000 E2E_RESOURCE_PATH=/app/resource/product/<id>?lang=zh-CN E2E_STORAGE_STATE=playwright/.auth/admin.json npm run test:e2e`
- [x] 资源分类调整：将 `FILTER` 从“产品与集合/集合”移动至“内容管理/其他选项”，仅改配置，避免误归类

### 动态可译模块发现与模板适配 - 2025-09-12（KISS）
- [x] 路由 loader：调用 Admin GraphQL `translatableResource`，发现该资源的 `translatableContent.key` 列表
- [x] 详情模板：基于 keys 动态展示模块（标题、正文、Handle、摘要/标签、SEO 优先/回退、其他可译字段）
- [x] SEO 兼容：优先 `seo.title/seo.description`，回退 `meta_title/meta_description`
- [x] 构建校验：`npm run build` 通过（未启动项目）

### 语言级数据隔离功能 - 2025-01-10
- [x] 重构状态管理 - 将 `resources` 替换为 `allLanguagesData` 对象结构
- [x] 实现派生状态计算 - 使用 `useMemo` 优化性能
- [x] 修改 API 响应处理 - 按语言代码隔离存储数据
- [x] 优化语言切换逻辑 - 自动清空选中状态
- [x] 修改清空数据功能 - 只影响当前语言
- [x] 运行 `npm run lint` 代码质量检查
- [x] 运行 `npm run build` 构建验证
- [x] 更新项目文档

## 🐛 已知问题 (Known Issues)

- [ ] 内存使用问题 - 大量语言数据可能导致内存占用过高
- [ ] 并发请求问题 - 快速切换语言时可能产生竞态条件
- [ ] 缓存一致性 - 多标签页操作时数据可能不同步

## 💡 改进建议 (Improvement Ideas)

1. **性能优化**
   - 实现虚拟滚动处理大量资源列表
   - 使用 Web Workers 处理繁重的数据处理
   - 实现智能分页加载

2. **用户体验**
   - 添加语言切换动画过渡效果
   - 提供批量操作的撤销功能
   - 实现拖拽排序功能

3. **开发体验**
   - 添加更多的单元测试覆盖
   - 实现 E2E 测试自动化
   - 优化开发环境热重载速度

## 📝 更新记录

### 2025-09-10
- 完成双语展示字段完整性修复（KISS原则）
- 修复了null值字段被过滤的问题
- 建立了字段映射的单一事实来源
- 仅修改2个文件，保持最小改动原则

### 2025-01-10
- 完成语言级数据隔离功能的全部实现
- 修复了语言切换时的数据混乱问题
- 优化了内存使用和缓存策略

---

*使用说明：*
- 🚧 = 正在进行中的任务
- 📋 = 待办任务
- ✅ = 已完成任务
- 🐛 = 需要修复的问题
- 💡 = 未来的改进想法
