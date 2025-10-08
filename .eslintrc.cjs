/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "./log-persistence.server.js",
            "message": "请使用 logger.server.js 而非直接导入底层日志实现"
          },
          {
            "name": "../log-persistence.server.js",
            "message": "请使用 logger.server.js 而非直接导入底层日志实现"
          },
          {
            "name": "../../log-persistence.server.js",
            "message": "请使用 logger.server.js 而非直接导入底层日志实现"
          },
          {
            "name": "./base-logger.server.js",
            "message": "请使用 logger.server.js 而非直接导入底层日志实现"
          },
          {
            "name": "../base-logger.server.js",
            "message": "请使用 logger.server.js 而非直接导入底层日志实现"
          },
          {
            "name": "../../base-logger.server.js",
            "message": "请使用 logger.server.js 而非直接导入底层日志实现"
          }
        ]
      }
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='action'] > ArrowFunctionExpression > BlockStatement > ReturnStatement > CallExpression[callee.name='withErrorHandling'][arguments.length=1]",
        message: "请直接导出已包装的 handler：export const action = withErrorHandling(async ({ request }) => { ... });"
      },
      {
        selector: "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='loader'] > ArrowFunctionExpression > BlockStatement > ReturnStatement > CallExpression[callee.name='withErrorHandling'][arguments.length=1]",
        message: "请直接导出已包装的 handler：export const loader = withErrorHandling(async ({ request }) => { ... });"
      }
    ]
  },
  // Playwright测试文件配置
  overrides: [
    {
      files: ["tests/**/*.{ts,tsx,js,jsx}"],
      env: {
        node: true,
        browser: true,
      },
      globals: {
        test: "readonly",
        expect: "readonly",
        page: "readonly",
      },
    },
    // 服务端代码禁用 console.* 直接调用
    {
      files: ["**/*.server.js", "**/*.server.ts"],
      rules: {
        "no-console": "error"
      }
    },
    // 统一日志出口允许导入底层实现（架构层例外）
    {
      files: ["app/services/unified-logger.server.js"],
      rules: {
        "no-restricted-imports": "off"
      }
    },
    // 日志持久化底层实现允许使用console（不能调用自己）
    {
      files: ["app/services/log-persistence.server.js"],
      rules: {
        "no-console": "off"
      }
    }
  ],
};
