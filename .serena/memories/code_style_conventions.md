# 代码风格和约定

## 文件命名规范
- **服务端文件**: 使用 `*.server.js` 后缀（例如：translation.server.js）
- **客户端组件**: 使用 `*.jsx` 扩展名
- **路由文件**: 在 `app/routes/` 目录下，使用点号分隔命名（例如：app._index.jsx）
- **API路由**: 以 `api.` 开头（例如：api.scan-resources.jsx）
- **测试路由**: 以 `test.` 开头
- **调试路由**: 以 `debug.` 开头

## 代码格式化
- **缩进**: 2个空格（不使用Tab）
- **引号**: JavaScript使用单引号，JSX属性使用双引号
- **分号**: 语句末尾使用分号
- **行长度**: 建议不超过100字符
- **空行**: 函数之间保留一个空行

## 注释规范
- **语言**: 使用中文注释
- **函数注释**: 重要函数添加JSDoc风格注释
- **复杂逻辑**: 添加行内注释解释
- **TODO**: 使用 `// TODO: 描述` 格式
- **FIXME**: 使用 `// FIXME: 描述` 格式

## JavaScript/React约定
```javascript
// 导入顺序
import React from 'react';  // React相关
import { useLoaderData } from '@remix-run/react';  // 框架相关
import { Card } from '@shopify/polaris';  // UI组件
import { translateResource } from '~/services/translation.server';  // 本地模块

// 函数命名
async function fetchResourceData() {}  // 异步函数
function handleSubmit() {}  // 事件处理
function validateInput() {}  // 验证函数

// 变量命名
const MAX_RETRY_COUNT = 3;  // 常量大写下划线
const userSettings = {};  // 驼峰命名
let isLoading = false;  // 布尔值以is/has开头

// React组件
export default function ComponentName() {  // 函数组件，大驼峰命名
  // Hooks在顶部
  const [state, setState] = useState();
  
  // 事件处理函数
  const handleClick = () => {};
  
  // 渲染
  return <div />;
}
```

## 错误处理
```javascript
// API路由使用 withErrorHandling 包装
export async function action({ request }) {
  return withErrorHandling(async () => {
    // 业务逻辑
  });
}

// 使用 try-catch 处理异步错误
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('操作失败:', error);
  throw new TranslationError('具体错误信息', error);
}
```

## Shopify API使用
```javascript
// 认证
const { admin, session } = await shopify.authenticate.admin(request);

// GraphQL查询
const response = await admin.graphql(`
  query {
    products(first: 10) {
      nodes {
        id
        title
      }
    }
  }
`);

// 错误重试
const result = await executeGraphQLWithRetry(admin, query, variables);
```

## 数据库操作（Prisma）
```javascript
// 导入单例
import { db } from '~/db.server';

// 查询
const resources = await db.resource.findMany({
  where: { shopId: shop.id },
  include: { translations: true }
});

// 事务
await db.$transaction([
  db.resource.create({ data: resourceData }),
  db.translation.create({ data: translationData })
]);
```

## 环境变量使用
```javascript
// 使用 process.env
const apiKey = process.env.GPT_API_KEY;

// 提供默认值
const apiUrl = process.env.GPT_API_URL || 'https://api.openai.com/v1';

// 环境判断
const isDevelopment = process.env.NODE_ENV === 'development';
```

## 测试和调试
- 测试文件命名：`test-*.js`
- 使用 console.log 进行调试，生产环境前删除
- 错误信息要具体，包含上下文

## ESLint配置
- 基于 `@remix-run/eslint-config`
- 配合 Prettier 进行格式化
- 全局变量：`shopify` 为只读

## 类型提示（JSDoc）
```javascript
/**
 * 翻译资源
 * @param {Object} resource - 资源对象
 * @param {string} resource.id - 资源ID
 * @param {string} resource.title - 资源标题
 * @param {string} targetLanguage - 目标语言
 * @returns {Promise<Object>} 翻译结果
 */
async function translateResource(resource, targetLanguage) {
  // 实现
}
```

## Git提交规范
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式化
- refactor: 重构
- test: 测试相关
- chore: 构建或辅助工具变动

示例：`fix: 修复Theme资源标题提取逻辑`