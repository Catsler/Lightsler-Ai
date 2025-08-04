/**
 * 浏览器端JavaScript错误监控脚本
 * 在浏览器控制台中运行此脚本来监控应用错误
 */

(function() {
  'use strict';
  
  // 错误收集器
  class ErrorMonitor {
    constructor() {
      this.errors = [];
      this.warnings = [];
      this.interactions = [];
      this.isMonitoring = false;
      this.originalConsoleError = console.error;
      this.originalConsoleWarn = console.warn;
      
      this.initErrorCapture();
      this.initInteractionTracking();
    }

    // 初始化错误捕获
    initErrorCapture() {
      // 捕获全局错误
      window.addEventListener('error', (event) => {
        this.recordError({
          type: 'global_error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
          timestamp: new Date()
        });
      });

      // 捕获Promise未处理的拒绝
      window.addEventListener('unhandledrejection', (event) => {
        this.recordError({
          type: 'unhandled_promise',
          message: event.reason?.message || event.reason,
          promise: event.promise,
          timestamp: new Date()
        });
      });

      // 拦截console.error
      console.error = (...args) => {
        this.recordError({
          type: 'console_error',
          message: args.join(' '),
          timestamp: new Date()
        });
        this.originalConsoleError.apply(console, args);
      };

      // 拦截console.warn  
      console.warn = (...args) => {
        this.recordWarning({
          type: 'console_warn',
          message: args.join(' '),
          timestamp: new Date()
        });
        this.originalConsoleWarn.apply(console, args);
      };
    }

    // 初始化交互跟踪
    initInteractionTracking() {
      // 监听所有点击事件
      document.addEventListener('click', (event) => {
        this.recordInteraction({
          type: 'click',
          target: this.getElementInfo(event.target),
          timestamp: new Date(),
          success: true
        });
      }, true);

      // 监听change事件（select, input等）
      document.addEventListener('change', (event) => {
        this.recordInteraction({
          type: 'change',
          target: this.getElementInfo(event.target),
          value: event.target.value,
          timestamp: new Date(),
          success: true
        });
      }, true);
    }

    // 获取元素信息
    getElementInfo(element) {
      if (!element) return 'unknown';
      
      const info = {
        tagName: element.tagName?.toLowerCase(),
        id: element.id,
        className: element.className,
        textContent: element.textContent?.substring(0, 50),
        dataset: element.dataset
      };
      
      // 特殊处理Polaris组件
      if (element.closest('[data-polaris-select]')) {
        info.component = 'polaris-select';
      } else if (element.closest('button')) {
        info.component = 'button';
      } else if (element.tagName === 'SELECT') {
        info.component = 'native-select';
      }
      
      return info;
    }

    // 记录错误
    recordError(error) {
      this.errors.push(error);
      console.group('🐛 ErrorMonitor - 错误捕获');
      console.log('类型:', error.type);
      console.log('消息:', error.message);
      console.log('时间:', error.timestamp.toLocaleTimeString());
      if (error.filename) {
        console.log('文件:', error.filename + ':' + error.lineno + ':' + error.colno);
      }
      if (error.error?.stack) {
        console.log('堆栈:', error.error.stack);
      }
      console.groupEnd();
    }

    // 记录警告
    recordWarning(warning) {
      this.warnings.push(warning);
    }

    // 记录交互
    recordInteraction(interaction) {
      this.interactions.push(interaction);
      
      // 只记录最近的100个交互
      if (this.interactions.length > 100) {
        this.interactions = this.interactions.slice(-100);
      }
    }

    // 开始监控
    startMonitoring() {
      if (this.isMonitoring) {
        console.log('🔍 ErrorMonitor 已在运行中');
        return;
      }
      
      this.isMonitoring = true;
      console.log('🚀 ErrorMonitor 开始监控...');
      console.log('💡 使用 errorMonitor.getReport() 查看报告');
      console.log('💡 使用 errorMonitor.testComponents() 测试组件');
    }

    // 停止监控
    stopMonitoring() {
      this.isMonitoring = false;
      console.error = this.originalConsoleError;
      console.warn = this.originalConsoleWarn;
      console.log('⏹️ ErrorMonitor 已停止监控');
    }

    // 生成报告
    getReport() {
      const report = {
        summary: {
          errors: this.errors.length,
          warnings: this.warnings.length,
          interactions: this.interactions.length,
          monitoringTime: new Date().toLocaleString()
        },
        errors: this.errors,
        warnings: this.warnings.slice(-10), // 最近10个警告
        recentInteractions: this.interactions.slice(-20), // 最近20个交互
        componentHealth: this.analyzeComponentHealth()
      };

      console.group('📊 ErrorMonitor 报告');
      console.log('总错误数:', report.summary.errors);
      console.log('总警告数:', report.summary.warnings);
      console.log('交互次数:', report.summary.interactions);
      console.log('组件健康状况:', report.componentHealth);
      
      if (report.errors.length > 0) {
        console.group('🚨 错误详情');
        report.errors.forEach((error, i) => {
          console.log(`${i + 1}. [${error.type}] ${error.message}`);
        });
        console.groupEnd();
      }
      
      console.groupEnd();
      
      return report;
    }

    // 分析组件健康状况
    analyzeComponentHealth() {
      const health = {
        select: { working: true, issues: [] },
        button: { working: true, issues: [] },
        overall: 'healthy'
      };

      // 检查是否有与组件相关的错误
      const componentErrors = this.errors.filter(error => 
        error.message.toLowerCase().includes('select') ||
        error.message.toLowerCase().includes('button') ||
        error.message.toLowerCase().includes('onclick') ||
        error.message.toLowerCase().includes('onchange')
      );

      if (componentErrors.length > 0) {
        health.overall = 'unhealthy';
        componentErrors.forEach(error => {
          if (error.message.toLowerCase().includes('select')) {
            health.select.working = false;
            health.select.issues.push(error.message);
          }
          if (error.message.toLowerCase().includes('button') || 
              error.message.toLowerCase().includes('onclick')) {
            health.button.working = false;
            health.button.issues.push(error.message);
          }
        });
      }

      // 检查交互是否成功
      const selectInteractions = this.interactions.filter(i => 
        i.target.component === 'polaris-select' || 
        i.target.component === 'native-select'
      );
      const buttonInteractions = this.interactions.filter(i => 
        i.target.component === 'button'
      );

      if (selectInteractions.length === 0 && this.interactions.length > 10) {
        health.select.working = false;
        health.select.issues.push('没有检测到Select组件交互');
      }

      if (buttonInteractions.length === 0 && this.interactions.length > 10) {
        health.button.working = false;
        health.button.issues.push('没有检测到Button组件交互');
      }

      return health;
    }

    // 自动测试组件
    async testComponents() {
      console.log('🧪 开始自动测试组件...');
      
      const results = {
        select: false,
        button: false,
        errors: []
      };

      try {
        // 测试Select组件
        const selects = document.querySelectorAll('select, [data-polaris-select]');
        console.log(`发现 ${selects.length} 个Select组件`);
        
        if (selects.length > 0) {
          for (let i = 0; i < Math.min(selects.length, 3); i++) {
            try {
              const select = selects[i];
              
              // 触发点击事件
              select.click();
              await this.delay(500);
              
              // 如果是原生select，尝试改变值
              if (select.tagName === 'SELECT' && select.options.length > 1) {
                const originalValue = select.value;
                select.selectedIndex = select.selectedIndex === 0 ? 1 : 0;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await this.delay(500);
                
                console.log(`✅ Select测试成功: ${originalValue} -> ${select.value}`);
                results.select = true;
              }
            } catch (error) {
              results.errors.push(`Select测试失败: ${error.message}`);
            }
          }
        }

        // 测试Button组件
        const buttons = document.querySelectorAll('button');
        console.log(`发现 ${buttons.length} 个Button组件`);
        
        if (buttons.length > 0) {
          for (let i = 0; i < Math.min(buttons.length, 3); i++) {
            try {
              const button = buttons[i];
              if (!button.disabled) {
                button.click();
                await this.delay(300);
                console.log(`✅ Button测试成功: ${button.textContent?.substring(0, 20)}`);
                results.button = true;
              }
            } catch (error) {
              results.errors.push(`Button测试失败: ${error.message}`);
            }
          }
        }

      } catch (error) {
        results.errors.push(`自动测试异常: ${error.message}`);
      }

      console.group('🧪 自动测试结果');
      console.log('Select组件:', results.select ? '✅ 正常' : '❌ 异常');
      console.log('Button组件:', results.button ? '✅ 正常' : '❌ 异常');
      if (results.errors.length > 0) {
        console.log('错误:', results.errors);
      }
      console.groupEnd();

      return results;
    }

    // 延迟函数
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 清除记录
    clear() {
      this.errors = [];
      this.warnings = [];
      this.interactions = [];
      console.log('🗑️ ErrorMonitor 记录已清除');
    }
  }

  // 如果已经存在，先清理
  if (window.errorMonitor) {
    window.errorMonitor.stopMonitoring();
  }

  // 创建全局实例
  window.errorMonitor = new ErrorMonitor();
  window.errorMonitor.startMonitoring();

  // 添加便捷方法到控制台
  console.log('🎯 ErrorMonitor 已加载！使用以下命令:');
  console.log('• errorMonitor.getReport() - 查看错误报告');
  console.log('• errorMonitor.testComponents() - 自动测试组件');
  console.log('• errorMonitor.clear() - 清除记录');
  console.log('• errorMonitor.stopMonitoring() - 停止监控');

})();