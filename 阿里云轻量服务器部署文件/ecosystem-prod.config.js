module.exports = {
  apps: [
    {
      name: 'shop1-lightsler',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/app1-fynony',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        SHOP_ID: 'shop1',
        SHOP_PREFIX: 'shop1',
        NODE_OPTIONS: '--max-old-space-size=1024'
      },
      error_file: '/var/www/logs/shop1-error.log',
      out_file: '/var/www/logs/shop1-out.log',
      log_file: '/var/www/logs/shop1-combined.log'
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
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        SHOP_ID: 'shop2',
        SHOP_PREFIX: 'shop2',
        NODE_OPTIONS: '--max-old-space-size=1024'
      },
      error_file: '/var/www/logs/shop2-error.log',
      out_file: '/var/www/logs/shop2-out.log',
      log_file: '/var/www/logs/shop2-combined.log'
    }
  ]
};
