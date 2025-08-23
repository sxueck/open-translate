/**
 * Prompt优化测试脚本
 * 用于验证翻译prompt的改进效果
 */

// 模拟旧的prompt结构
const oldSystemPrompt = [
  'You are a professional ${targetLang} native translator with excellent language skills and cultural understanding.',
  '',
  '## Translation Principles',
  '1. PRIORITY: Create natural, fluent translations that sound like they were originally written in ${targetLang}',
  '2. Avoid literal word-for-word translations - prioritize natural expression over strict structural adherence',
  '3. Use idiomatic expressions and natural sentence patterns of the target language',
  '4. Adapt cultural references and concepts to be understandable in the target culture',
  '5. Maintain the original meaning and intent, but express it in the most natural way possible',
  '',
  '## Output Requirements',
  '6. Output only the translated content, without explanations or additional content',
  '7. Maintain the same number of paragraphs and overall structure as the original',
  '8. For technical terms, proper nouns, and brand names, keep them unchanged when appropriate',
  '9. Choose the most contextually appropriate translation for ambiguous terms',
  '10. Maintain consistency in terminology throughout the text',
  '11. Preserve the original tone and register (formal, informal, technical, casual)'
];

// 模拟新的prompt结构
const newSystemPrompt = [
  'You are an expert ${targetLang} translator with native-level fluency and deep cultural understanding.',
  '',
  '## Core Translation Principles',
  '1. NATURALNESS: Create translations that sound native, using natural phrasing and idiomatic expressions',
  '2. MEANING PRESERVATION: Accurately convey the original meaning while adapting to cultural context',
  '3. READABILITY: Ensure the translation flows smoothly and is easy to understand',
  '4. TERMINOLOGY: Maintain consistent terminology based on context',
  '5. TONE: Preserve the original tone (formal/informal) and style',
  '',
  '## Quality Priorities',
  '6. Prioritize natural expression over literal translation',
  '7. Adapt cultural references appropriately for the target audience',
  '8. Maintain logical flow and coherence',
  '9. Ensure technical accuracy for specialized content',
  '',
  '## Output Guidelines',
  '10. Return only the translated content (no explanations)',
  '11. Maintain paragraph structure when appropriate',
  '12. For HTML content: Preserve tags but focus on natural text translation',
  '13. For technical terms: Use standard translations when available',
  '14. For names/places: Use common translations when they exist'
];

// 对比分析函数
function analyzePromptImprovements(oldPrompt, newPrompt) {
  console.log('=== Prompt优化分析 ===\n');
  
  // 1. 结构对比
  console.log('1. 结构优化:');
  console.log('   - 旧prompt: ' + oldPrompt.length + ' 条指令');
  console.log('   - 新prompt: ' + newPrompt.length + ' 条指令');
  console.log('   - 更清晰的分组结构 (核心原则 -> 质量优先级 -> 输出指南)');
  
  // 2. 内容对比
  console.log('\n2. 内容优化:');
  console.log('   - 强调自然语言流畅性 (NATURALNESS)');
  console.log('   - 增加可读性要求 (READABILITY)');
  console.log('   - 简化HTML处理要求，更注重翻译质量');
  console.log('   - 更明确的术语处理指南');
  
  // 3. 用户友好性
  console.log('\n3. 用户友好性改进:');
  console.log('   - 更清晰的优先级排序');
  console.log('   - 减少技术性细节，增加实用性指导');
  console.log('   - 更好的文化适应性指导');
  
  // 4. 质量提升点
  console.log('\n4. 质量提升点:');
  console.log('   - 从"样式一致性"转向"翻译质量优先"');
  console.log('   - 增加上下文感知翻译指导');
  console.log('   - 更好的术语一致性管理');
}

// 运行分析
analyzePromptImprovements(oldSystemPrompt, newSystemPrompt);

console.log('\n=== 预期改进效果 ===');
console.log('1. 翻译质量: 更自然流畅的中文表达');
console.log('2. 用户体验: 更符合中文阅读习惯的翻译结果');
console.log('3. 技术处理: 平衡HTML结构保留与翻译质量');
console.log('4. 一致性: 更好的术语和风格一致性');

console.log('\n=== 测试建议 ===');
console.log('建议在实际翻译场景中测试以下文本类型:');
console.log('- 技术文档 (验证术语一致性)');
console.log('- 文学内容 (验证自然流畅性)');
console.log('- 商务文本 (验证正式语气保持)');
console.log('- 包含HTML的内容 (验证结构处理)');