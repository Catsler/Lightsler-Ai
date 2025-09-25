/**
 * PM2 生态系统配置文件
 * 支持多店铺部署，每个店铺独立的Node.js进程
 * 优化内存使用和错误恢复
 */

module.exports = {
  apps: [
    {
      name: 'shop1-fynony',
      script: 'npm',
      args: 'start',
      cwd: '/Users/elie/Downloads/translate/Lightsler-Ai',

      // 环境变量
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1536', // 1.5GB内存限制
        SHOP_ID: 'shop1',
        SHOP_PREFIX: 'shop1',
        PORT: 3001,

        // 如果有店铺特定的配置
        SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY_SHOP1 || process.env.SHOPIFY_API_KEY,
        SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET_SHOP1 || process.env.SHOPIFY_API_SECRET,

        // Redis配置（共享）
        REDIS_URL: process.env.REDIS_URL,
        REDIS_ENABLED: 'true',

        // 队列优化
        QUEUE_CONCURRENCY: '2',
        MAX_CACHE_SIZE: '500',
        CACHE_TTL: '3600',

        // 翻译服务配置
        GPT_API_KEY: process.env.GPT_API_KEY,
        GPT_API_URL: process.env.GPT_API_URL || 'https://api.cursorai.art/v1',

        // 性能优化
        ENABLE_PRODUCT_RELATED_TRANSLATION: 'true',
        UV_THREADPOOL_SIZE: '4'
      },

      // PM2配置
      instances: 1, // 单实例，避免资源竞争
      exec_mode: 'fork', // fork模式，cluster模式在这个场景下不适用

      // 内存和CPU限制
      max_memory_restart: '1800M', // 1.8GB内存重启
      min_uptime: '10s', // 最小运行时间
      max_restarts: 10, // 最大重启次数

      // 自动重启策略
      autorestart: true,
      watch: false, // 生产环境不启用文件监控

      // 日志配置
      log_file: './logs/shop1-fynony-combined.log',
      out_file: './logs/shop1-fynony-out.log',
      error_file: './logs/shop1-fynony-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 进程监控
      listen_timeout: 8000,
      kill_timeout: 5000,

      // 环境特定配置
      env_development: {
        NODE_ENV: 'development',
        NODE_OPTIONS: '--max-old-space-size=1024', // 开发环境1GB
        PORT: 3001
      },

      env_production: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1536', // 生产环境1.5GB
        PORT: 3001
      }
    },

    {
      name: 'shop2-onewind',
      script: 'npm',
      args: 'start',
      cwd: '/Users/elie/Downloads/translate/Lightsler-Ai',

      // 环境变量
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1536', // 1.5GB内存限制
        SHOP_ID: 'shop2',
        SHOP_PREFIX: 'shop2',
        PORT: 3002,

        // 如果有店铺特定的配置
        SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY_SHOP2 || process.env.SHOPIFY_API_KEY,
        SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET_SHOP2 || process.env.SHOPIFY_API_SECRET,

        // Redis配置（共享，使用不同DB）
        REDIS_URL: process.env.REDIS_URL,
        REDIS_ENABLED: 'true',

        // 队列优化
        QUEUE_CONCURRENCY: '2',
        MAX_CACHE_SIZE: '500',
        CACHE_TTL: '3600',

        // 翻译服务配置
        GPT_API_KEY: process.env.GPT_API_KEY,
        GPT_API_URL: process.env.GPT_API_URL || 'https://api.cursorai.art/v1',

        // 性能优化
        ENABLE_PRODUCT_RELATED_TRANSLATION: 'true',
        UV_THREADPOOL_SIZE: '4'
      },

      // PM2配置
      instances: 1,
      exec_mode: 'fork',

      // 内存和CPU限制
      max_memory_restart: '1800M',
      min_uptime: '10s',
      max_restarts: 10,

      // 自动重启策略
      autorestart: true,
      watch: false,

      // 日志配置
      log_file: './logs/shop2-onewind-combined.log',
      out_file: './logs/shop2-onewind-out.log',
      error_file: './logs/shop2-onewind-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 进程监控
      listen_timeout: 8000,
      kill_timeout: 5000,

      // 环境特定配置
      env_development: {
        NODE_ENV: 'development',
        NODE_OPTIONS: '--max-old-space-size=1024',
        PORT: 3002
      },

      env_production: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1536',
        PORT: 3002
      }
    }
  ],

  deploy: {
    production: {
      user: 'root',
      host: 'your-server-ip', // 替换为实际服务器IP
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/lightsler-ai.git', // 替换为实际仓库
      path: '/root/lightsler-ai',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run setup && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    }
  }
};

/**
 * 使用方法：
 *
 * # 启动所有应用
 * pm2 start ecosystem.config.js
 *
 * # 启动特定环境
 * pm2 start ecosystem.config.js --env production
 *
 * # 启动单个应用
 * pm2 start ecosystem.config.js --only shop1-fynony
 *
 * # 重载配置
 * pm2 reload ecosystem.config.js
 *
 * # 监控
 * pm2 monit
 *
 * # 查看日志
 * pm2 logs shop1-fynony
 * pm2 logs shop2-onewind
 *
 * # 保存PM2配置
 * pm2 save
 *
 * # 设置开机自启
 * pm2 startup
 */