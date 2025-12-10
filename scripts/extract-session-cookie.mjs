#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const targetUrl =
  args.url || process.env.PLAYWRIGHT_TARGET_URL || process.env.AUTH_URL || '';
const output = args.output || 'tmp/session-cookie.json';
const headless = String(args.headless ?? 'false').toLowerCase() === 'true';
const userDataDir = args.userDataDir || process.env.PLAYWRIGHT_USER_DATA_DIR;
const waitSeconds = Number(args.waitSeconds || 60);

// 新增：使用真实 Chrome 浏览器配置
const useChrome = String(args.useChrome ?? 'false').toLowerCase() === 'true';
const chromeProfile = args.chromeProfile || process.env.CHROME_PROFILE || 'Profile 1';
const chromeUserDataDir = args.chromeUserDataDir ||
  process.env.CHROME_USER_DATA_DIR ||
  path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');

// 查找 Chrome 可执行文件路径
function findChromeExecutable() {
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

if (!targetUrl) {
  console.error(
    '❌ 缺少目标 URL。请通过 --url= 或环境变量 PLAYWRIGHT_TARGET_URL / AUTH_URL 指定 Shopify 应用入口。'
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

async function waitForSessionCookies(context) {
  const deadline = Date.now() + waitSeconds * 1000;
  const wanted = new Set(['_shopify_app_session', '_shopify_s']);

  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    const sessionCookies = cookies.filter((c) => wanted.has(c.name));
    if (sessionCookies.length > 0) return sessionCookies;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return [];
}

let browser;
let context;

async function run() {
  console.log(`🚀 打开浏览器获取 Session Cookie: ${targetUrl}`);

  if (useChrome) {
    // 使用真实 Chrome 浏览器和用户 Profile
    const chromePath = findChromeExecutable();
    if (!chromePath) {
      console.error('❌ 未找到 Chrome 浏览器，请安装 Google Chrome');
      process.exit(1);
    }

    const profilePath = path.join(chromeUserDataDir, chromeProfile);
    if (!fs.existsSync(profilePath)) {
      console.error(`❌ Chrome Profile 不存在: ${profilePath}`);
      process.exit(1);
    }

    console.log(`📂 使用 Chrome Profile: ${chromeProfile} (${chromeUserDataDir})`);
    console.log(`🌐 Chrome 路径: ${chromePath}`);

    // 使用 channel: 'chrome' 启动真实 Chrome（会使用默认 Profile）
    // 注意：这需要关闭所有 Chrome 窗口
    console.log('⚠️ 请确保已关闭所有 Chrome 窗口，否则会启动失败');
    console.log('💡 如果 Chrome 正在运行，脚本会尝试连接到已有实例...');

    try {
      // 尝试使用 channel: 'chrome' 启动真实安装的 Chrome
      context = await chromium.launchPersistentContext(chromeUserDataDir, {
        channel: 'chrome',
        headless: false, // 真实 Chrome 必须非 headless
        viewport: { width: 1280, height: 720 },
        args: [
          `--profile-directory=${chromeProfile}`,
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });
      console.log('✅ 已启动真实 Chrome 浏览器');
    } catch (err) {
      console.error('❌ 无法启动 Chrome，请确保已关闭所有 Chrome 窗口');
      console.error('   错误信息:', err.message);
      console.error('');
      console.error('💡 解决方案：');
      console.error('   1. 完全关闭 Chrome（包括后台进程）');
      console.error('   2. 或者使用以下命令手动启动带调试端口的 Chrome：');
      console.error(`      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --profile-directory="${chromeProfile}"`);
      console.error('   3. 然后在打开的 Chrome 中手动访问: ' + targetUrl);
      console.error('   4. 登录后，Cookie 会被自动保存');
      process.exit(1);
    }

    console.log('✅ 已加载 Chrome Profile，请在浏览器中完成登录');
    console.log('💡 如果已经登录，页面会直接显示 Shopify App');
  } else if (userDataDir) {
    // 持久化上下文（保留登录状态）
    context = await chromium.launchPersistentContext(path.resolve(userDataDir), {
      headless,
      viewport: { width: 1280, height: 720 }
    });
  } else {
    // 临时上下文
    browser = await chromium.launch({ headless });
    context = await browser.newContext();
  }

  const page = context.pages()[0] || (await context.newPage());

  if (!headless && !useChrome) {
    console.log('💡 请在打开的浏览器中完成 Shopify 登录 / 授权，脚本会等待 Session Cookie 出现（默认 60 秒）。');
  }

  await page.goto(targetUrl, { waitUntil: 'load' });

  const cookies = await waitForSessionCookies(context);

  if (cookies.length === 0) {
    console.error('❌ 未能在限定时间内获取 Shopify 会话 Cookie，请检查是否已完成登录。');
    if (browser) {
      await browser.close();
    } else {
      await context.close();
    }
    process.exit(2);
  }

  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const payload = {
    targetUrl,
    retrievedAt: new Date().toISOString(),
    cookieHeader,
    cookies
  };

  fs.writeFileSync(path.resolve(output), JSON.stringify(payload, null, 2));
  console.log(`✅ 已写入 Cookie（未在终端展示）-> ${output}`);
  console.log('🔒 安全警告: Cookie 文件包含敏感会话令牌，请勿提交到版本控制！');
  console.log(`ℹ️ Cookie 条目数: ${cookies.length}, Cookie 字符串长度: ${cookieHeader.length}`);

  if (browser) {
    await browser.close();
  } else {
    await context.close();
  }
}

run()
  .catch(async (err) => {
    console.error('❌ 提取 Session Cookie 失败:', err);
    if (context?.close) await context.close().catch(() => { });
    if (browser?.close) await browser.close().catch(() => { });
    process.exit(1);
  });
