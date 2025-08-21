import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Modal, 
  Box, 
  BlockStack, 
  InlineStack,
  Text, 
  ProgressBar,
  Badge,
  Card,
  Spinner,
  Icon
} from '@shopify/polaris';
import {
  SearchIcon,
  ChartVerticalIcon,
  CheckCircleIcon,
  ClockIcon
} from '@shopify/polaris-icons';
import styles from '../styles/ScanningAnimation.module.css';

/**
 * 扫描动画组件
 * 显示扫描进度、Sequential Thinking思考链和统计结果
 */
export default function ScanningAnimation({ 
  isOpen, 
  onClose, 
  progress = 0, 
  thinkingChain = [],
  scanStats = null,
  currentPhase = 'initializing',
  currentResource = null,
  totalResources = 0,
  scannedResources = 0,
  targetLanguage = 'zh-CN'
}) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [visibleThoughts, setVisibleThoughts] = useState([]);
  const [showStats, setShowStats] = useState(false);
  
  // 平滑更新进度条
  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = progress - prev;
        if (Math.abs(diff) < 0.01) return progress;
        return prev + diff * 0.1;
      });
    }, 16);
    
    return () => clearInterval(timer);
  }, [progress]);
  
  // 逐步显示思考链
  useEffect(() => {
    if (thinkingChain.length > visibleThoughts.length) {
      const timer = setTimeout(() => {
        setVisibleThoughts(thinkingChain.slice(0, visibleThoughts.length + 1));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [thinkingChain, visibleThoughts]);
  
  // 扫描完成后自动关闭
  useEffect(() => {
    if (progress >= 100 && scanStats) {
      setShowStats(true);
      const closeTimer = setTimeout(() => {
        setIsClosing(true);
        setTimeout(onClose, 500);
      }, 5000);
      
      return () => clearTimeout(closeTimer);
    }
  }, [progress, scanStats, onClose]);
  
  // 获取阶段描述
  const getPhaseDescription = useCallback((phase) => {
    const phaseMap = {
      'initializing': '初始化扫描环境...',
      'analyzing': 'Sequential Thinking 分析中...',
      'scanning': '智能扫描资源中...',
      'optimizing': '优化扫描策略...',
      'processing': '处理扫描结果...',
      'completing': '完成扫描任务...'
    };
    return phaseMap[phase] || '处理中...';
  }, []);
  
  // 获取阶段图标
  const getPhaseIcon = useCallback((phase) => {
    const iconMap = {
      'initializing': SearchIcon,
      'analyzing': ChartVerticalIcon,
      'scanning': SearchIcon,
      'optimizing': ChartVerticalIcon,
      'processing': ClockIcon,
      'completing': CheckCircleIcon
    };
    return iconMap[phase] || SearchIcon;
  }, []);
  
  // 格式化思考内容
  const formatThought = useCallback((thought) => {
    if (typeof thought === 'string') return thought;
    return thought.content || thought.message || JSON.stringify(thought);
  }, []);
  
  // 扫描动画内容
  const scannerContent = useMemo(() => (
    <div className={styles.scannerContainer}>
      {/* 雷达扫描动画 */}
      <div className={styles.radarContainer}>
        <div className={styles.radar}>
          <div className={styles.radarLine}></div>
          <div className={styles.radarDot}></div>
          <div className={styles.radarCircle1}></div>
          <div className={styles.radarCircle2}></div>
          <div className={styles.radarCircle3}></div>
        </div>
      </div>
      
      {/* 扫描信息 */}
      <BlockStack gap="400">
        <InlineStack align="center" blockAlign="center" gap="200">
          <Icon source={getPhaseIcon(currentPhase)} />
          <Text variant="headingLg" as="h2">
            智能扫描进行中
          </Text>
        </InlineStack>
        
        <Text variant="bodyMd" tone="subdued" alignment="center">
          目标语言: {targetLanguage}
        </Text>
        
        {/* 当前阶段 */}
        <Box paddingBlockStart="200">
          <InlineStack align="center" gap="200">
            <Spinner size="small" />
            <Text variant="bodyMd">
              {getPhaseDescription(currentPhase)}
            </Text>
          </InlineStack>
        </Box>
        
        {/* 进度条 */}
        <Box paddingBlockStart="400">
          <BlockStack gap="200">
            <ProgressBar 
              progress={displayProgress / 100} 
              size="medium"
              tone="primary"
            />
            <InlineStack align="space-between">
              <Text variant="bodySm" tone="subdued">
                已扫描: {scannedResources}/{totalResources} 个资源
              </Text>
              <Text variant="bodySm" tone="subdued">
                {Math.round(displayProgress)}%
              </Text>
            </InlineStack>
          </BlockStack>
        </Box>
        
        {/* 当前资源 */}
        {currentResource && (
          <Box paddingBlockStart="200">
            <Card>
              <Text variant="bodySm" tone="subdued">
                正在处理: {currentResource.title || currentResource.handle || currentResource.name}
              </Text>
            </Card>
          </Box>
        )}
        
        {/* Sequential Thinking 思考链 */}
        {visibleThoughts.length > 0 && (
          <Box paddingBlockStart="400">
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">
                🤖 AI 思考过程
              </Text>
              <div className={styles.thinkingChain}>
                <BlockStack gap="200">
                  {visibleThoughts.slice(-3).map((thought, index) => (
                    <div 
                      key={index} 
                      className={styles.thoughtItem}
                    >
                      <InlineStack gap="200" align="start">
                        <Badge size="small" tone="info">
                          Step {visibleThoughts.indexOf(thought) + 1}
                        </Badge>
                        <Text variant="bodySm">
                          {formatThought(thought)}
                        </Text>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </div>
            </BlockStack>
          </Box>
        )}
      </BlockStack>
    </div>
  ), [
    currentPhase, 
    targetLanguage, 
    displayProgress, 
    scannedResources, 
    totalResources,
    currentResource,
    visibleThoughts,
    getPhaseDescription,
    getPhaseIcon,
    formatThought
  ]);
  
  // 统计结果内容
  const statsContent = useMemo(() => {
    if (!scanStats) return null;
    
    return (
      <div className={styles.statsContainer}>
        <BlockStack gap="400">
          <InlineStack align="center" blockAlign="center" gap="200">
            <Icon source={CheckCircleIcon} color="success" />
            <Text variant="headingLg" as="h2">
              扫描完成！
            </Text>
          </InlineStack>
          
          <Box paddingBlockStart="400">
            <BlockStack gap="300">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd">扫描统计</Text>
                  <InlineStack gap="400">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">总资源数</Text>
                      <Text variant="headingMd">{scanStats.total || 0}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">待翻译</Text>
                      <Text variant="headingMd" tone="critical">
                        {scanStats.pending || 0}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">已完成</Text>
                      <Text variant="headingMd" tone="success">
                        {scanStats.completed || 0}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Card>
              
              {scanStats.categories && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd">资源分类</Text>
                    <BlockStack gap="100">
                      {Object.entries(scanStats.categories).map(([key, count]) => (
                        <InlineStack key={key} align="space-between">
                          <Text variant="bodySm">{key}</Text>
                          <Badge>{count}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}
              
              {scanStats.duration && (
                <Text variant="bodySm" tone="subdued" alignment="center">
                  扫描耗时: {(scanStats.duration / 1000).toFixed(2)} 秒
                </Text>
              )}
            </BlockStack>
          </Box>
        </BlockStack>
      </div>
    );
  }, [scanStats]);
  
  if (!isOpen) return null;
  
  return (
    <div className={`${styles.overlay} ${isClosing ? styles.closing : ''}`}>
      <div className={styles.modalContainer}>
        <Box 
          background="bg-surface" 
          borderRadius="300" 
          padding="600"
          shadow="shadow-2xl"
          minHeight="400px"
          width="600px"
        >
          {showStats ? statsContent : scannerContent}
        </Box>
      </div>
    </div>
  );
}