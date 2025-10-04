#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Fynony环境诊断"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "1. 检查Queue DB 11状态："
node check-fynony-db11.cjs

echo ""
echo "2. SSH到服务器，模拟添加翻译任务："
ssh -i /Users/elie/Downloads/shopify.pem root@47.79.77.128 << 'ENDSSH'
cd /var/www/app1-fynony

echo "正在查询数据库中的资源..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const resources = await prisma.resource.findMany({
    take: 5,
    select: { id: true, resourceType: true, gid: true }
  });
  
  console.log('前5个资源:');
  resources.forEach(r => {
    console.log(\`  \${r.id}: \${r.resourceType} (\${r.gid})\`);
  });
  
  await prisma.\$disconnect();
}

check();
"
ENDSSH

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 诊断完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
