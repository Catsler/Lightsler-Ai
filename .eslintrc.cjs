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
  ],
};
