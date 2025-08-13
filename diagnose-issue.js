// 诊断脚本 - 帮助理解用户遇到的问题

console.log('=== 诊断：资源类型选择和扫描问题 ===\n');

console.log('📋 请按以下步骤操作：\n');

console.log('1. 刷新浏览器页面');
console.log('   - Mac: Cmd + Shift + R');
console.log('   - Windows: Ctrl + Shift + R\n');

console.log('2. 打开浏览器开发者工具（F12）');
console.log('   - 切换到Console标签\n');

console.log('3. 在Console中运行以下命令：');
console.log('   ```javascript');
console.log('   // 检查是否有禁用的选项');
console.log('   document.querySelectorAll("select option[disabled]").length');
console.log('   ```');
console.log('   应该返回 0\n');

console.log('4. 测试资源类型选择：');
console.log('   - 点击"资源类型"下拉框');
console.log('   - 选择"[主题] 主题设置"');
console.log('   - 检查是否成功选中\n');

console.log('5. 测试扫描功能：');
console.log('   - 点击"扫描选定类型"按钮');
console.log('   - 在Network标签查看是否有 /api/scan-resources 请求\n');

console.log('❓ 可能的问题和解决方案：\n');

console.log('问题1: 下拉框无法点击或选择');
console.log('解决: 检查是否有JavaScript错误，清理浏览器缓存\n');

console.log('问题2: 选择后值没有改变');
console.log('解决: 可能是React状态更新问题，需要检查onChange事件\n');

console.log('问题3: 点击扫描按钮没反应');
console.log('解决: 检查Console是否有错误，Network是否有请求失败\n');

console.log('问题4: Shopify嵌入式应用权限问题');
console.log('解决: 退出应用重新进入，或运行 npm run deploy 更新权限\n');

console.log('🔍 需要提供的信息：');
console.log('1. 具体是哪个操作失败了？');
console.log('2. Console中是否有错误信息？');
console.log('3. 选择资源类型后，下拉框显示的是什么？');
console.log('4. 点击扫描按钮后有什么反应？');

console.log('\n💡 如果以上都没问题，请描述：');
console.log('- 您说的"不能选择其他语言扫描"具体是指什么？');
console.log('- 是语言选择有问题，还是资源类型选择有问题？');
console.log('- 能否提供截图或更详细的错误描述？');