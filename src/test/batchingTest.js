/**
 * 智能批处理测试脚本
 * 用于验证批处理优化效果
 */

/**
 * 使用全局tokenCalculator实例进行token计算
 */
function calculateTokens(text) {
  // 如果tokenCalculator可用，使用它；否则使用简化计算
  if (typeof tokenCalculator !== 'undefined' && tokenCalculator.calculateTokens) {
    return tokenCalculator.calculateTokens(text);
  }

  // 回退到简化计算
  const words = text.trim().split(/\s+/).length;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return words + chineseChars + Math.ceil(text.length * 0.1);
}

// 模拟测试数据
const testTextSegments = [
  { text: "Hello world", length: 11 },
  { text: "How are you today?", length: 18 },
  { text: "This is a test message", length: 22 },
  { text: "Welcome to our website", length: 22 },
  { text: "Please click the button below", length: 29 },
  { text: "Thank you for your visit", length: 24 },
  { text: "Contact us for more information", length: 31 },
  { text: "Subscribe to our newsletter", length: 27 },
  { text: "Follow us on social media", length: 25 },
  { text: "Download our mobile app", length: 23 },
  { text: "This is a longer paragraph that contains more detailed information about our services and products. We offer comprehensive solutions for businesses of all sizes.", length: 155 },
  { text: "Our team consists of experienced professionals who are dedicated to providing excellent customer service and support.", length: 118 },
  { text: "We have been in business for over 10 years and have served thousands of satisfied customers worldwide.", length: 103 },
  { text: "Privacy Policy", length: 14 },
  { text: "Terms of Service", length: 16 },
  { text: "FAQ", length: 3 },
  { text: "About Us", length: 8 },
  { text: "Contact", length: 7 },
  { text: "Home", length: 4 },
  { text: "Products", length: 8 }
];

/**
 * 测试传统批处理策略
 */
function testTraditionalBatching(segments, config) {
  const { maxMergedLength = 1000, maxMergedCount = 10, shortTextThreshold = 50 } = config;
  
  // 按长度分类
  const shortTexts = segments.filter(s => s.length <= shortTextThreshold);
  const longTexts = segments.filter(s => s.length > shortTextThreshold);
  
  const batches = [];
  
  // 长文本单独处理
  longTexts.forEach(text => batches.push([text]));
  
  // 短文本合并处理
  let currentBatch = [];
  let currentLength = 0;
  
  for (const segment of shortTexts) {
    if (currentBatch.length >= maxMergedCount || currentLength + segment.length > maxMergedLength) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentLength = 0;
      }
    }
    
    currentBatch.push(segment);
    currentLength += segment.length;
  }
  
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  return batches;
}

/**
 * 模拟智能批处理策略
 */
function testSmartBatching(segments, config) {
  const { maxTokens = 2000 } = config;

  // 使用全局的token计算函数

  // 简化的批次创建
  const batches = [];
  let currentBatch = [];
  let currentTokens = 200; // 系统提示词基础token

  const maxInputTokens = Math.floor(maxTokens * 0.6); // 预留40%给响应

  for (const segment of segments) {
    const segmentTokens = calculateTokens(segment.text) + 10; // 格式开销

    if (currentTokens + segmentTokens > maxInputTokens && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 200; // 重置
    }

    currentBatch.push(segment);
    currentTokens += segmentTokens;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * 计算批处理统计信息
 */
function calculateBatchStats(batches, maxTokens = 2000) {
  // 使用全局的token计算函数

  const maxInputTokens = Math.floor(maxTokens * 0.6);

  let totalTokens = 0;
  const utilizations = [];

  batches.forEach(batch => {
    let batchTokens = 200; // 系统提示词
    batch.forEach(segment => {
      batchTokens += calculateTokens(segment.text) + 10;
    });

    totalTokens += batchTokens;
    utilizations.push(batchTokens / maxInputTokens);
  });

  return {
    totalBatches: batches.length,
    totalTokens: totalTokens,
    averageUtilization: utilizations.reduce((sum, util) => sum + util, 0) / utilizations.length,
    maxUtilization: Math.max(...utilizations),
    minUtilization: Math.min(...utilizations)
  };
}

/**
 * 运行批处理对比测试
 */
function runBatchingComparison() {
  console.log('=== 智能批处理优化测试 ===\n');
  
  const testConfig = {
    maxTokens: 8000,
    maxMergedLength: 1000,
    maxMergedCount: 10,
    shortTextThreshold: 50,
    model: 'gpt-3.5-turbo'
  };
  
  console.log('测试配置:', testConfig);
  console.log(`测试数据: ${testTextSegments.length} 个文本段落\n`);
  
  // 传统批处理测试
  console.log('--- 传统批处理策略 ---');
  const traditionalBatches = testTraditionalBatching(testTextSegments, testConfig);
  const traditionalStats = calculateBatchStats(traditionalBatches, testConfig.maxTokens);
  
  console.log(`批次数量: ${traditionalStats.totalBatches}`);
  console.log(`总Token数: ${traditionalStats.totalTokens}`);
  console.log(`平均利用率: ${(traditionalStats.averageUtilization * 100).toFixed(1)}%`);
  console.log(`最高利用率: ${(traditionalStats.maxUtilization * 100).toFixed(1)}%`);
  console.log(`最低利用率: ${(traditionalStats.minUtilization * 100).toFixed(1)}%`);
  
  // 智能批处理测试
  console.log('\n--- 智能批处理策略 ---');
  const smartBatches = testSmartBatching(testTextSegments, testConfig);
  const smartStats = calculateBatchStats(smartBatches, testConfig.maxTokens);
  
  console.log(`批次数量: ${smartStats.totalBatches}`);
  console.log(`总Token数: ${smartStats.totalTokens}`);
  console.log(`平均利用率: ${(smartStats.averageUtilization * 100).toFixed(1)}%`);
  console.log(`最高利用率: ${(smartStats.maxUtilization * 100).toFixed(1)}%`);
  console.log(`最低利用率: ${(smartStats.minUtilization * 100).toFixed(1)}%`);
  
  // 对比分析
  console.log('\n--- 优化效果对比 ---');
  const batchReduction = ((traditionalStats.totalBatches - smartStats.totalBatches) / traditionalStats.totalBatches * 100);
  const utilizationImprovement = ((smartStats.averageUtilization - traditionalStats.averageUtilization) * 100);
  
  console.log(`API调用次数减少: ${batchReduction.toFixed(1)}%`);
  console.log(`Token利用率提升: ${utilizationImprovement.toFixed(1)}%`);
  
  if (batchReduction > 0) {
    console.log(`✅ 智能批处理成功减少了 ${Math.round(batchReduction)}% 的API调用次数`);
  }
  
  if (utilizationImprovement > 0) {
    console.log(`✅ Token利用率提升了 ${utilizationImprovement.toFixed(1)}%`);
  }
  
  // 详细批次信息
  console.log('\n--- 详细批次分析 ---');
  console.log('传统批处理批次详情:');
  traditionalBatches.forEach((batch, index) => {
    const batchLength = batch.reduce((sum, segment) => sum + segment.length, 0);
    console.log(`  批次 ${index + 1}: ${batch.length} 个段落, ${batchLength} 字符`);
  });
  
  console.log('\n智能批处理批次详情:');
  smartBatches.forEach((batch, index) => {
    const batchLength = batch.reduce((sum, segment) => sum + segment.length, 0);
    const estimatedTokens = Math.ceil(batchLength * 0.75) + 200 + (batch.length * 10);
    const utilization = (estimatedTokens / (testConfig.maxTokens * 0.6) * 100).toFixed(1);
    console.log(`  批次 ${index + 1}: ${batch.length} 个段落, ${batchLength} 字符, ~${estimatedTokens} tokens (${utilization}% 利用率)`);
  });
  
  return {
    traditional: traditionalStats,
    smart: smartStats,
    improvement: {
      batchReduction: batchReduction,
      utilizationImprovement: utilizationImprovement
    }
  };
}

/**
 * 生成测试报告
 */
function generateTestReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    testData: {
      totalSegments: testTextSegments.length,
      shortSegments: testTextSegments.filter(s => s.length <= 50).length,
      longSegments: testTextSegments.filter(s => s.length > 50).length
    },
    traditional: results.traditional,
    smart: results.smart,
    improvements: results.improvement,
    recommendations: []
  };
  
  // 生成建议
  if (results.improvement.batchReduction > 20) {
    report.recommendations.push({
      type: 'high_impact',
      message: '智能批处理显著减少了API调用次数，建议启用此功能'
    });
  }
  
  if (results.improvement.utilizationImprovement > 15) {
    report.recommendations.push({
      type: 'efficiency',
      message: 'Token利用率有显著提升，有助于降低成本'
    });
  }
  
  if (results.smart.averageUtilization < 0.6) {
    report.recommendations.push({
      type: 'optimization',
      message: '考虑调整配置参数以进一步提高Token利用率'
    });
  }
  
  return report;
}

// 如果在浏览器环境中运行
if (typeof window !== 'undefined') {
  window.batchingTest = {
    runComparison: runBatchingComparison,
    generateReport: generateTestReport
  };
}

// 如果在Node.js环境中运行
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runBatchingComparison,
    generateTestReport,
    testTextSegments
  };
}

// 自动运行测试（如果直接执行此文件）
if (typeof window === 'undefined' && require.main === module) {
  const results = runBatchingComparison();
  const report = generateTestReport(results);
  console.log('\n=== 测试报告 ===');
  console.log(JSON.stringify(report, null, 2));
}
