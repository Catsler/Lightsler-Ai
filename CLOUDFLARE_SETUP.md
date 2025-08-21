# Cloudflare 隧道配置指南

## 当前状态 ✅

### 本地服务已运行（固定端口）
- **OneWind**: http://localhost:3001 ✅
- **Daui**: http://localhost:3002 ✅  
- **SSHVDT**: http://localhost:3003 ✅

### 域名配置（等待隧道）
- onewind.ease-joy.fun → localhost:3001
- daui.ease-joy.fun → localhost:3002
- sshvdt.ease-joy.fun → localhost:3003

## 需要完成的步骤

### 1. 安装 Cloudflared

**macOS (推荐使用Homebrew):**
```bash
# 如果没有Homebrew，先安装:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 然后安装cloudflared:
brew install cloudflared
```

**或者直接下载二进制文件:**
```bash
# 下载
curl -L --output cloudflared https://github.com/cloudflare/cloudflared/releases/download/2024.8.3/cloudflared-darwin-amd64

# 添加执行权限
chmod +x cloudflared

# 移动到系统路径
sudo mv cloudflared /usr/local/bin/
```

### 2. 启动 Cloudflare 隧道

安装完cloudflared后，运行：

```bash
cloudflared tunnel run --token eyJhIjoiNDcxNTkxNzQ5ZDJlZmMzODQwODIxZDgyYjJjYzRlMmQiLCJ0IjoiODZkOGZlZjgtNzg3Zi00MWQ1LWIyNjMtOTUyNjQyODJhOTA3IiwicyI6Ik5EY3hNVFpsT0RRdC5ERmpNQzAwTmpjd0xUbGxPR0l0WWpReE5EWXpOelUxT0RkayJ9
```

### 3. 验证访问

隧道启动后，可以通过以下域名访问：

- https://onewind.ease-joy.fun - OneWind店铺
- https://daui.ease-joy.fun - Daui店铺
- https://sshvdt.ease-joy.fun - SSHVDT店铺

## 快速启动命令

### 启动所有本地服务（已完成）
```bash
./start-all-shops.sh
```

### 查看服务状态
```bash
./shop-manager.sh status
```

### 查看日志
```bash
tail -f logs/onewind.log
tail -f logs/daui.log
tail -f logs/sshvdt.log
```

## 故障排查

### 如果域名无法访问

1. **检查本地服务:**
```bash
curl http://localhost:3001/
curl http://localhost:3002/
curl http://localhost:3003/
```

2. **检查Cloudflare隧道:**
- 确保cloudflared正在运行
- 检查隧道输出的错误信息
- 确认token是否正确

3. **检查Cloudflare Dashboard:**
- 登录 https://one.dash.cloudflare.com/
- 检查Zero Trust → Access → Tunnels
- 确认隧道配置正确

## 当前问题

❌ **cloudflared 未安装** - 需要手动安装才能启动隧道

## 解决方案

在终端运行以下命令安装cloudflared：

```bash
# 方法1: 使用Homebrew (推荐)
brew install cloudflared

# 方法2: 手动下载安装
curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/download/2024.8.3/cloudflared-darwin-amd64
chmod +x /tmp/cloudflared
sudo mv /tmp/cloudflared /usr/local/bin/cloudflared

# 验证安装
cloudflared version
```

安装完成后，运行隧道命令即可访问域名。