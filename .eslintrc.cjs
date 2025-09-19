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
