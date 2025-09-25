module.exports = {
  apps: [
    {
      name: 'shop1-fynony',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/app1-fynony',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',  // 提升到1.5GB
      min_uptime: '10s',
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        SHOP_ID: 'shop1',
        SHOP_PREFIX: 'shop1',
        
        // 优化后的内存配置
        NODE_OPTIONS: '--max-old-space-size=1536 --max-semi-space-size=128',
        
        // 增强的队列配置
        QUEUE_CONCURRENCY: '5',        // 从2提升到5
        MAX_CACHE_SIZE: '2000',        // 从500提升到2000
        CACHE_TTL: '3600',
        
        // 系统优化
        UV_THREADPOOL_SIZE: '8',       // 从4提升到8
        
        // Redis配置
        REDIS_URL: 'redis://default:gedTtMvRpnZNccvqCpgjBdDycKIiLOFR@nozomi.proxy.rlwy.net:39953',
        REDIS_ENABLED: 'true'
      },
      error_file: '/var/www/logs/shop1-fynony-error.log',
      out_file: '/var/www/logs/shop1-fynony-out.log',
      log_file: '/var/www/logs/shop1-fynony-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'shop2-onewind', 
      script: 'npm',
      args: 'start',
      cwd: '/var/www/app2-onewind',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',  // 提升到1.5GB
      min_uptime: '10s',
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        SHOP_ID: 'shop2',
        SHOP_PREFIX: 'shop2',
        
        // 优化后的内存配置
        NODE_OPTIONS: '--max-old-space-size=1536 --max-semi-space-size=128',
        
        // 增强的队列配置
        QUEUE_CONCURRENCY: '5',        // 从2提升到5
        MAX_CACHE_SIZE: '2000',        // 从500提升到2000
        CACHE_TTL: '3600',
        
        // 系统优化
        UV_THREADPOOL_SIZE: '8',       // 从4提升到8
        
        // Redis配置
        REDIS_URL: 'redis://default:gedTtMvRpnZNccvqCpgjBdDycKIiLOFR@nozomi.proxy.rlwy.net:39953',
        REDIS_ENABLED: 'true'
      },
      error_file: '/var/www/logs/shop2-onewind-error.log',
      out_file: '/var/www/logs/shop2-onewind-out.log',
      log_file: '/var/www/logs/shop2-onewind-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
