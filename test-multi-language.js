// 多语言翻译测试脚本
import fetch from 'node-fetch';

const API_URL = 'http://localhost:54539';

// 测试数据
const testResource = {
  id: "test-multi-lang-1",
  resourceType: "product",
  title: "Premium Organic Coffee Beans",
  description: "<p>Experience the <strong>rich flavor</strong> of our premium organic coffee beans. Sourced from sustainable farms in Colombia.</p>",
  handle: "premium-organic-coffee",
  seoTitle: "Buy Premium Organic Coffee Beans Online",
  seoDescription: "Shop our selection of premium organic coffee beans from Colombia. Fresh roasted and delivered to your door."
};

// 测试不同语言
const languages = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh-CN', name: 'Chinese Simplified' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ko', name: 'Korean' }
];

async function testTranslation(language) {
  console.log(`\n🌍 Testing ${language.name} (${language.code})...`);
  
  try {
    const response = await fetch(`${API_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resources: [testResource],
        language: language.code
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Success for ${language.name}:`);
      if (result.results && result.results[0]) {
        const translation = result.results[0];
        console.log(`   Original: "${testResource.title}"`);
        console.log(`   Translated: "${translation.titleTrans || 'N/A'}"`);
      }
    } else {
      console.log(`❌ Failed for ${language.name}: ${result.message || result.error}`);
    }
    
    return { language: language.code, success: result.success, error: result.error };
  } catch (error) {
    console.log(`❌ Error for ${language.name}: ${error.message}`);
    return { language: language.code, success: false, error: error.message };
  }
}

async function checkErrorLogs() {
  try {
    const response = await fetch(`${API_URL}/api/errors?limit=10`);
    const result = await response.json();
    
    console.log('\n📊 Error Log Summary:');
    console.log(`   Total errors: ${result.total || 0}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n   Recent errors:');
      result.errors.slice(0, 5).forEach(err => {
        console.log(`   - [${err.errorType}] ${err.message}`);
      });
    }
  } catch (error) {
    console.log('Could not fetch error logs:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting Multi-Language Translation Tests');
  console.log('=' .repeat(50));
  
  // Check initial error count
  await checkErrorLogs();
  
  // Test each language
  const results = [];
  for (const language of languages) {
    const result = await testTranslation(language);
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 Test Summary:');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`   ✅ Successful: ${successful}/${languages.length}`);
  console.log(`   ❌ Failed: ${failed}/${languages.length}`);
  
  if (failed > 0) {
    console.log('\n   Failed languages:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.language}: ${r.error}`);
    });
  }
  
  // Check error logs after tests
  console.log('\n' + '='.repeat(50));
  await checkErrorLogs();
}

// Run the tests
runTests().catch(console.error);