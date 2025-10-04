module.exports = {
  apps: [
    // Fynony Worker
    {
      name: 'shop1-worker',
      script: 'worker.js',
      cwd: '/var/www/app1-fynony',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/var/www/app1-fynony/.env',
      env: {
        NODE_ENV: 'production',
        QUEUE_ROLE: 'worker',
        SHOP_ID: 'shop1'
      },
      error_file: '/var/www/app1-fynony/logs/worker-error.log',
      out_file: '/var/www/app1-fynony/logs/worker-out.log',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },

    // OneWind Worker
    {
      name: 'shop2-worker',
      script: 'worker.js',
      cwd: '/var/www/app2-onewind',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/var/www/app2-onewind/.env',
      env: {
        NODE_ENV: 'production',
        QUEUE_ROLE: 'worker',
        SHOP_ID: 'shop2'
      },
      error_file: '/var/www/app2-onewind/logs/worker-error.log',
      out_file: '/var/www/app2-onewind/logs/worker-out.log',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
