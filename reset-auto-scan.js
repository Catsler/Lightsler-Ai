// 重置自动扫描状态
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetAutoScan() {
  console.log("🔄 重置自动扫描状态\n");
  console.log("========================================\n");

  try {
    // 1. 清除数据库中的扫描历史（如果有）
    console.log("📝 清除扫描历史记录...");
    try {
      const deleted = await prisma.scanHistory.deleteMany({});
      console.log(`  ✅ 已删除 ${deleted.count} 条扫描历史`);
    } catch (error) {
      console.log("  ℹ️ 扫描历史表不存在或已清空");
    }

    // 2. 清除资源的扫描状态
    console.log("\n📦 重置资源扫描状态...");
    const resources = await prisma.resource.updateMany({
      where: {
        status: { in: ['scanned', 'scanning'] }
      },
      data: {
        status: 'pending'
      }
    });
    console.log(`  ✅ 已重置 ${resources.count} 条资源状态`);

    // 3. 清除翻译会话
    console.log("\n💬 清除翻译会话...");
    try {
      const sessions = await prisma.translationSession.deleteMany({});
      console.log(`  ✅ 已删除 ${sessions.count} 条翻译会话`);
    } catch (error) {
      console.log("  ℹ️ 翻译会话表不存在或已清空");
    }

    console.log("\n========================================");
    console.log("✅ 自动扫描状态已重置！");
    console.log("\n注意事项:");
    console.log("1. 浏览器端的localStorage需要在应用中手动清除");
    console.log("2. 可以在浏览器控制台运行以下命令清除:");
    console.log("   localStorage.removeItem('scanHistory')");
    console.log("   localStorage.removeItem('selectedLanguage')");
    console.log("   localStorage.clear() // 清除所有localStorage");
    console.log("\n3. 或者在应用中添加清除按钮:");
    console.log("   - 打开开发者工具 (F12)");
    console.log("   - 进入 Application/Storage 标签");
    console.log("   - 找到 Local Storage");
    console.log("   - 删除相关的键值");
    console.log("\n4. 重新加载应用后，自动扫描将重新触发");

  } catch (error) {
    console.error("❌ 重置失败:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行重置
resetAutoScan();