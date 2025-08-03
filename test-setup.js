/**
 * 简单的设置测试脚本
 */

import { initializeConfig, config } from './app/utils/config.server.js';

console.log('🔧 测试应用配置...');

try {
  // 初始化配置
  const configResult = initializeConfig();
  
  console.log('✅ 配置初始化成功');
  console.log('📋 配置摘要:');
  console.log(`- 环境: ${config.nodeEnv}`);
  console.log(`- 数据库: ${config.database.url}`);
  console.log(`- Redis启用: ${config.redis.enabled}`);
  console.log(`- 翻译API: ${config.translation.apiUrl}`);
  
  // 测试数据库连接
  console.log('\n🗄️ 测试数据库连接...');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功');
    
    // 检查表是否存在
    const sessionCount = await prisma.session.count();
    console.log(`✅ Session表正常 (${sessionCount} 条记录)`);
    
    try {
      const shopCount = await prisma.shop.count();
      console.log(`✅ Shop表正常 (${shopCount} 条记录)`);
    } catch (error) {
      console.log('⚠️ Shop表不存在，请运行数据库迁移: npx prisma migrate dev');
    }
    
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
  } finally {
    await prisma.$disconnect();
  }
  
  // 测试Redis连接（如果启用）
  if (config.redis.enabled && (config.redis.url || config.redis.host)) {
    console.log('\n🔴 测试Redis连接...');
    try {
      const Redis = await import('ioredis');
      const redis = new Redis.default(config.redis.url || {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      });
      
      await redis.ping();
      console.log('✅ Redis连接成功');
      redis.disconnect();
    } catch (error) {
      console.log('⚠️ Redis连接失败，将使用内存模式:', error.message);
    }
  } else {
    console.log('\n🔴 Redis未配置，将使用内存模式');
  }
  
  console.log('\n🎉 应用配置测试完成！');
  console.log('💡 提示: 运行 npm run dev 启动应用');
  
} catch (error) {
  console.error('❌ 配置测试失败:', error);
  process.exit(1);
}