module.exports = {
  apps: [
    {
      name: 'translate-onewind',
      script: 'npm',
      args: 'run start',
      cwd: '/root/shopify-translate',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DOTENV_CONFIG_PATH: '.env.onewind'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/root/shopify-translate/logs/onewind-error.log',
      out_file: '/root/shopify-translate/logs/onewind-out.log',
      log_file: '/root/shopify-translate/logs/onewind-combined.log',
      time: true
    },
    {
      name: 'translate-daui',
      script: 'npm',
      args: 'run start',
      cwd: '/root/shopify-translate',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        DOTENV_CONFIG_PATH: '.env.daui'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/root/shopify-translate/logs/daui-error.log',
      out_file: '/root/shopify-translate/logs/daui-out.log',
      log_file: '/root/shopify-translate/logs/daui-combined.log',
      time: true
    },
    {
      name: 'translate-sshvdt',
      script: 'npm',
      args: 'run start',
      cwd: '/root/shopify-translate',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        DOTENV_CONFIG_PATH: '.env.sshvdt'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/root/shopify-translate/logs/sshvdt-error.log',
      out_file: '/root/shopify-translate/logs/sshvdt-out.log',
      log_file: '/root/shopify-translate/logs/sshvdt-combined.log',
      time: true
    }
  ]
};