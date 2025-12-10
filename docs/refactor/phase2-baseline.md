# Phase 2 Baseline (2025-12-09)

## 文件体量
| 文件 | 行数 |
| --- | --- |
| app/services/translation/core.server.js | 2864 |
| translateText 函数 | 176（core.server.js:1030-1205） |

## 测试状态
- `npm run test -- --coverage`：PASS（2025-12-09）
  - 测试集：`test:api-contracts`（Node Test）+ `test:services`（Vitest）
  - 备注：npm 报 unknown project/env config（auto-install-peers/shamefully-hoist）；dotenv 多次注入；缺少 `ENCRYPTION_KEY` 时使用临时密钥（非生产）；`prisma.$use` 不可用时 SoftDelete middleware 跳过。
- 覆盖率（Vitest v8）：Branches 49.55%、Functions 24.07%、Lines 12.27%（coverage/index.html）；当前 JSON summary 未生成分支数据，后续可用 json-summary/lcov 细化。

## 手工基准（待补充）
| 场景 | 输入 | 期望/现状 | 状态 |
| --- | --- | --- | --- |
| 纯文本 | \"Hello world\" | 输出中文，不跳过 | ☐ |
| HTML | `<p>Hello <b>world</b></p>` | 标签保留/还原正确 | ☐ |
| 品牌词 | \"iPhone 15 Pro\" | 品牌词保持不译 | ☐ |
| Liquid+品牌词 | `{{ product.title }} iPhone` | 占位符保留，品牌词保持 | ☐ |
| 长文本 | >5000 字符 | 无截断，分片合并一致 | ☐ |
| 计费 | 100 字符 | 扣减符合现有口径 | ☐ |

## 后续动作（建议）
- 如需基线覆盖率，执行 `npm run test -- --coverage` 或等效命令，记录分支覆盖率。
- 补全手工基准的实际输出截图/摘要，作为 Phase 2 拆分后的对比锚点。
