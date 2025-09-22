# 阿里云轻量服务器部署文件索引

> **更新时间**: 2025年9月22日
> **文件总数**: 17个核心部署文件

## 📋 文件分类

### 🚀 主要部署脚本
| 文件名 | 功能描述 | 使用场景 |
|--------|----------|----------|
| `deploy-fix-to-server.sh` | **主要部署脚本** - 完整的修复部署工具 | 部署所有修复和优化到轻量服务器 |
| `sync-to-server.sh` | 代码同步脚本 - 本地到服务器 | 增量同步代码变更 |
| `start-multi-shop.sh` | 多店铺启动脚本 | 启动Shop1和Shop2应用 |

### ⚙️ PM2配置文件
| 文件名 | 环境 | 说明 |
|--------|------|------|
| `ecosystem.config.js` | 基础配置 | 标准PM2配置，适用于基本部署 |
| `ecosystem-optimized.config.js` | 4GB优化配置 | 针对4GB内存服务器优化 |
| `ecosystem-prod.config.js` | 生产环境 | 轻量级生产环境配置 |

### 📖 文档和指南
| 文件名 | 内容 |
|--------|------|
| `DEPLOYMENT.md` | **核心部署文档** - 完整部署指南 |
| `deploy-checklist.md` | 部署检查清单 - 确保每步正确 |
| `轻量服务器稳定操作说明.md` | VPN绕过和连接指南 |

### 🔧 工具脚本
| 文件名 | 功能 |
|--------|------|
| `check-server-status.sh` | 服务器状态检查 |
| `monitor-apps.sh` | 应用监控工具 |
| `restart-pm2-apps.sh` | PM2应用重启 |

### 📄 配置文件
| 文件名 | 用途 |
|--------|------|
| `.env.template` | 环境变量模板 |
| `shop1-env.txt` | Shop1环境变量参考 |
| `shop2-env.txt` | Shop2环境变量参考 |
| `shop1-shopify.app.toml` | Shop1 Shopify配置 |
| `shop2-shopify.app.toml` | Shop2 Shopify配置 |

## 🚀 快速部署流程

### 1. 首次完整部署
```bash
# 使用主要部署脚本
./deploy-fix-to-server.sh
```

### 2. 日常代码同步
```bash
# 增量同步代码
./sync-to-server.sh
```

### 3. 应用管理
```bash
# 检查状态
./check-server-status.sh

# 重启应用
./restart-pm2-apps.sh

# 启动多店铺
./start-multi-shop.sh
```

## 🔍 文件使用优先级

### 高优先级（必需）
- ✅ `deploy-fix-to-server.sh` - 主要部署工具
- ✅ `DEPLOYMENT.md` - 核心文档
- ✅ `ecosystem-optimized.config.js` - 4GB服务器配置
- ✅ `.env.template` - 环境配置模板

### 中优先级（推荐）
- 🔶 `sync-to-server.sh` - 日常同步
- 🔶 `deploy-checklist.md` - 部署检查
- 🔶 `check-server-status.sh` - 状态监控
- 🔶 `轻量服务器稳定操作说明.md` - 连接指南

### 低优先级（辅助）
- 🔸 `monitor-apps.sh` - 监控工具
- 🔸 `restart-pm2-apps.sh` - 重启工具
- 🔸 `start-multi-shop.sh` - 启动工具
- 🔸 店铺配置文件 - 参考配置

## 📚 关键概念

### 店铺隔离架构
- **Shop1 (Fynony)**: 端口3001, /var/www/app1-fynony
- **Shop2 (OneWind)**: 端口3002, /var/www/app2-onewind
- **数据隔离**: Redis前缀、内存缓存、队列分离

### 服务器规格
- **内存**: 4GB (已升级)
- **存储**: 50GB (已升级)
- **架构**: 多租户Shopify应用
- **连接**: 绕过VPN使用静态路由

### 核心技术栈
- **运行时**: Node.js + PM2
- **框架**: Remix + React
- **数据库**: SQLite + Prisma
- **队列**: Railway Redis + Bull
- **缓存**: 内存缓存 + Redis

## 🔧 故障排查

### 常用命令
```bash
# 检查PM2状态
pm2 list

# 查看应用日志
pm2 logs

# 重启特定应用
pm2 restart shop1
pm2 restart shop2

# 查看内存使用
free -h

# 检查端口占用
netstat -tlnp | grep -E '3001|3002'
```

### 问题解决
1. **连接问题** → 检查VPN绕过配置
2. **内存不足** → 使用优化配置文件
3. **端口冲突** → 检查PM2进程状态
4. **Redis连接** → 验证Railway Redis配置

## 📝 维护记录

- **2025-09-22**: 创建统一部署目录，清理重复文件
- **2025-09-22**: 服务器升级到4GB内存 + 50GB存储
- **2025-09-22**: 部署Railway Redis，优化多店铺隔离
- **2025-09-22**: 修复OneWind和Fynony店铺翻译显示问题

---

**📞 技术支持**: 如需协助，请参考DEPLOYMENT.md获取详细指导