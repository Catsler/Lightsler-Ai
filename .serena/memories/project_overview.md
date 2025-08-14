# 项目概述

## 基本信息
- **项目名称**: Lightsler AI - Shopify多语言翻译应用
- **项目类型**: Shopify嵌入式Admin应用
- **主要功能**: 批量翻译Shopify店铺资源到多种语言
- **开发语言**: JavaScript (Node.js)
- **系统平台**: Darwin (macOS)

## 核心技术栈
- **框架**: Remix v2.16.1 (全栈Web框架)
- **前端**: React v18.2.0 + Shopify Polaris v12.27.0
- **数据库**: SQLite + Prisma ORM v6.2.1
- **队列系统**: Bull + Redis（可选，自动降级到内存队列）
- **API集成**: Shopify GraphQL Admin API 2025-07
- **构建工具**: Vite v5.4.8
- **运行环境**: Node.js >=18.20

## 主要特性
1. **资源类型支持**: 20+种Shopify资源类型
   - 产品、集合、文章、博客、页面
   - 菜单、链接、筛选器
   - 主题及相关资源
   - 店铺设置和政策

2. **翻译功能**:
   - GPT API集成（支持OpenAI兼容接口）
   - 富文本HTML标签保护
   - 品牌词不翻译保护
   - 智能文本分块处理
   - URL slug优化翻译

3. **系统架构**:
   - 批量扫描和存储资源
   - 异步队列处理大批量翻译
   - 批量同步到Shopify
   - 完整的错误日志和分析系统

## 业务流程
1. **扫描阶段**: 通过GraphQL API批量获取Shopify店铺资源
2. **存储阶段**: 将资源存储到本地SQLite数据库
3. **翻译阶段**: 调用GPT API进行智能翻译（保护HTML和品牌词）
4. **同步阶段**: 通过GraphQL Mutation批量更新到Shopify店铺

## 部署和运行
- **开发模式**: 使用Shopify CLI提供隧道和认证
- **生产部署**: 支持Docker容器化部署
- **权限管理**: 通过shopify.app.toml配置
- **Webhook处理**: 支持app/uninstalled和app/scopes_update事件