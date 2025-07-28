/**
 * 快速状态检查脚本
 */

console.log('🔍 检查应用状态...\n');

async function checkStatus() {
  try {
    // 检查配置
    const { config } = await import('./app/utils/config.server.js');
    console.log('✅ 配置加载成功');
    console.log(`   - 环境: ${config.nodeEnv}`);
    console.log(`   - 数据库: ${config.database.url}`);
    console.log(`   - Redis: ${config.redis.enabled ? '启用' : '禁用'}`);
    console.log(`   - 翻译API: ${config.translation.apiUrl}\n`);

    // 检查数据库
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    await prisma.$connect();
    console.log('✅ 数据库连接正常');
    
    const shopCount = await prisma.shop.count();
    const resourceCount = await prisma.resource.count();
    const translationCount = await prisma.translation.count();
    
    console.log(`   - 店铺数: ${shopCount}`);
    console.log(`   - 资源数: ${resourceCount}`);
    console.log(`   - 翻译数: ${translationCount}\n`);
    
    await prisma.$disconnect();

    // 检查队列
    const { translationQueue } = await import('./app/services/queue.server.js');
    if (translationQueue) {
      console.log('✅ 任务队列已启动');
      console.log(`   - 类型: ${translationQueue.name ? 'Bull(Redis)' : 'Memory'}\n`);
    } else {
      console.log('❌ 任务队列未配置\n');
    }

    console.log('🎉 应用状态正常，可以开始使用！');
    console.log('💡 运行命令: npm run dev');
    
  } catch (error) {
    console.error('❌ 状态检查失败:', error.message);
    process.exit(1);
  }
}

checkStatus();