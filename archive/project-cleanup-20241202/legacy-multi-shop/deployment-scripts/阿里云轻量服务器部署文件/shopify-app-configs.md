# Shopify 应用配置备份

## App1 - Lightsler AI (Fynony)
- **店铺**: https://admin.shopify.com/store/sshvdt-ai
- **应用URL**: https://fynony.ease-joy.fun
- **Client ID**: `f97170933cde079c914f7df7e90cd806`
- **Client Secret**: `cd9481b3d050e30b40fa1a21e081025a`
- **Redis DB**: `/11`
- **shopify.app.toml**: `client_id = "f97170933cde079c914f7df7e90cd806"`

## App2 - Lightsler AI (OneWind)
- **店铺**: https://admin.shopify.com/store/onewindoutdoors
- **应用URL**: https://onewind.ease-joy.fun
- **Client ID**: `8102af9807fd9df0b322a44f500a1d0e`
- **Client Secret**: `0f2fc13c5b8a126e1c5fde1200fdf266`
- **Redis DB**: `/12`
- **shopify.app.toml**: `client_id = "8102af9807fd9df0b322a44f500a1d0e"`

## 共享配置
- **GPT API Key**: `sk-su9oTJ7eVzgdcNNDF5775fD84656419b83544f058bFe8f74`
- **GPT API URL**: `https://us.vveai.com/v1`
- **Redis URL**: `redis://default:gedTtMvRpnZNccvqCpgjBdDycKIiLOFR@nozomi.proxy.rlwy.net:39953`

## 部署位置
- **服务器**: root@47.79.77.128
- **App1路径**: `/var/www/app1-fynony`
- **App2路径**: `/var/www/app2-onewind`
- **PM2进程**: `shop1-fynony`, `shop2-onewind`
