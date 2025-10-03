import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 使用import.meta.url获取当前文件的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * 加载多店铺环境变量
 * - 先加载共享配置 (.env.shared)
 * - 再加载店铺专属配置 (shop_id/.env)
 * - 验证必需环境变量
 */
export function loadEnvironment() {
  const shopId = process.env.SHOP_ID;

  // 提供降级策略：允许无SHOP_ID的本地开发/测试环境
  if (!shopId) {
    // eslint-disable-next-line no-console
    console.warn('⚠️  SHOP_ID not set, attempting to load default .env');
    const defaultEnv = path.join(PROJECT_ROOT, '.env');
    try {
      dotenv.config({ path: defaultEnv });
      // eslint-disable-next-line no-console
      console.log('✅ Loaded default environment');
      return;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  No default .env found, proceeding with system environment');
      return;
    }
  }

  // 1. 加载共享配置（使用绝对路径）
  const sharedPath = path.join(PROJECT_ROOT, '.env.shared');
  const sharedResult = dotenv.config({ path: sharedPath });

  if (sharedResult.error) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Could not load shared config: ${sharedPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`✅ Loaded shared config: ${sharedPath}`);
  }

  // 2. 加载店铺专属配置（使用绝对路径，覆盖同名变量）
  const shopPath = path.join(PROJECT_ROOT, shopId, '.env');
  const shopResult = dotenv.config({ path: shopPath, override: true });

  if (shopResult.error) {
    throw new Error(`❌ Could not load shop config: ${shopPath}`);
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Loaded ${shopId} config: ${shopPath}`);

  // 3. 验证必需环境变量
  const required = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_APP_URL',
    'DATABASE_URL',
    'GPT_API_KEY',
    'REDIS_URL'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  }

  // 4. 验证Redis DB配置（数据隔离）
  const redisDb = process.env.REDIS_URL.split('/').pop();

  // eslint-disable-next-line no-console
  console.log(`
✅ Environment loaded for: ${shopId}
   - App URL: ${process.env.SHOPIFY_APP_URL}
   - Port: ${process.env.PORT}
   - Database: ${process.env.DATABASE_URL}
   - Redis DB: ${redisDb}
  `);

  // 确保不同店铺使用不同的Redis DB（防止数据污染）
  if (shopId === 'onewind' && redisDb !== '0') {
    throw new Error('❌ Security Error: OneWind must use Redis DB 0');
  }
  if (shopId === 'fynony' && redisDb !== '1') {
    throw new Error('❌ Security Error: Fynony must use Redis DB 1');
  }
}

// 导出函数，不再立即执行
// 应在服务器入口（如server.js或entry.server.jsx）中按条件调用
