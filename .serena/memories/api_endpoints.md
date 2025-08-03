# API端点说明

应用提供以下REST API端点，所有端点都位于 `/api/` 路径下：

## 资源扫描
- `POST /api/scan-products` - 扫描店铺产品
  - 返回产品列表和扫描统计
  
- `POST /api/scan-collections` - 扫描店铺集合
  - 返回集合列表和扫描统计

## 翻译操作
- `POST /api/translate` - 同步翻译（直接执行）
  - 参数: `resources` (资源ID数组), `targetLanguage` (目标语言)
  - 适合小批量翻译
  
- `POST /api/translate-queue` - 异步翻译（使用队列）
  - 参数: `resources` (资源ID数组), `targetLanguage` (目标语言)
  - 适合大批量翻译，需要Redis

## 状态查询
- `GET /api/status` - 获取应用状态
- `POST /api/status` - 获取翻译统计信息

## 数据管理
- `POST /api/clear` - 清理店铺数据
  - 清除所有扫描的资源和翻译记录

## 配置信息
- `GET /api/config` - 获取应用配置信息
  - 返回Redis状态、环境信息等

## GraphQL操作
应用使用Shopify GraphQL Admin API进行：
- 产品和集合数据查询
- 翻译内容更新
- 店铺语言设置管理