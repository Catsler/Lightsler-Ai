#!/bin/bash

echo "🚀 重启PM2应用..."

# 使用expect自动处理SSH连接
expect << 'EOF'
set timeout 30

spawn ssh -o StrictHostKeyChecking=no -i /Users/elie/Downloads/shopify.pem root@47.79.77.128

expect {
    "Connection refused" {
        puts "连接被拒绝，等待重试..."
        sleep 2
        exp_continue
    }
    "Connection closed" {
        puts "连接关闭，等待重试..."
        sleep 2
        exp_continue
    }
    -re ".*#" {
        puts "连接成功！"
    }
    timeout {
        puts "连接超时，尝试继续..."
    }
}

send "pm2 stop all\r"
expect -re ".*#"

send "pm2 start /var/www/app1-fynony/ecosystem.config.js --name app1-fynony\r"
expect -re ".*#"

send "pm2 start /var/www/app2-onewind/ecosystem.config.js --name app2-onewind\r"
expect -re ".*#"

send "pm2 save\r"
expect -re ".*#"

send "pm2 status\r"
expect -re ".*#"

send "exit\r"
expect eof
EOF

echo "✅ PM2应用重启完成！"