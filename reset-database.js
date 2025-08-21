// 清除数据库并重置扫描状态
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log("🧹 开始清理数据库...\n");

  try {
    // 1. 清除所有翻译记录
    console.log("📝 清除翻译记录...");
    const deletedTranslations = await prisma.translation.deleteMany({});
    console.log(`  ✅ 已删除 ${deletedTranslations.count} 条翻译记录`);

    // 2. 清除所有资源记录
    console.log("\n📦 清除资源记录...");
    const deletedResources = await prisma.resource.deleteMany({});
    console.log(`  ✅ 已删除 ${deletedResources.count} 条资源记录`);

    // 3. 清除错误日志（可选）
    console.log("\n🔴 清除错误日志...");
    try {
      const deletedErrors = await prisma.errorLog.deleteMany({});
      console.log(`  ✅ 已删除 ${deletedErrors.count} 条错误日志`);
    } catch (error) {
      console.log("  ℹ️ 错误日志表不存在或无需清理");
    }

    // 4. 清除扫描历史（如果有）
    console.log("\n🔍 清除扫描历史...");
    try {
      const deletedScans = await prisma.scanHistory.deleteMany({});
      console.log(`  ✅ 已删除 ${deletedScans.count} 条扫描历史`);
    } catch (error) {
      console.log("  ℹ️ 扫描历史表不存在或无需清理");
    }

    // 5. 重置会话（如果有）
    console.log("\n💬 清除翻译会话...");
    try {
      const deletedSessions = await prisma.translationSession.deleteMany({});
      console.log(`  ✅ 已删除 ${deletedSessions.count} 条翻译会话`);
    } catch (error) {
      console.log("  ℹ️ 翻译会话表不存在或无需清理");
    }

    // 6. 获取数据库统计
    console.log("\n📊 数据库当前状态:");
    const shopCount = await prisma.shop.count();
    const resourceCount = await prisma.resource.count();
    const translationCount = await prisma.translation.count();
    
    console.log(`  - 店铺数量: ${shopCount}`);
    console.log(`  - 资源数量: ${resourceCount}`);
    console.log(`  - 翻译数量: ${translationCount}`);

    console.log("\n========================================");
    console.log("✅ 数据库清理完成！");
    console.log("\n下一步操作建议:");
    console.log("1. 运行应用重新扫描资源: npm run dev");
    console.log("2. 在应用中点击 '扫描资源' 按钮");
    console.log("3. 选择要翻译的资源类型进行翻译");

  } catch (error) {
    console.error("\n❌ 清理失败:", error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// 确认提示
console.log("⚠️ 警告：此操作将清除所有翻译和资源数据！");
console.log("店铺配置将保留，但所有翻译内容将被删除。");
console.log("\n按 Ctrl+C 取消，或等待 3 秒继续...\n");

setTimeout(() => {
  resetDatabase();
}, 3000);