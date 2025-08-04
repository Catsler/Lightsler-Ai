import { useState } from "react";

/**
 * 简单的UI测试页面 - 不需要任何认证
 */
export default function TestUI() {
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedType, setSelectedType] = useState('PRODUCT');
  const [message, setMessage] = useState('');
  
  const languages = [
    { label: 'Chinese (Simplified)', value: 'zh-CN' },
    { label: 'English', value: 'en' },
    { label: 'Japanese', value: 'ja' },
    { label: 'German', value: 'de' },
  ];
  
  const types = [
    { label: '产品', value: 'PRODUCT' },
    { label: '集合', value: 'COLLECTION' },
  ];
  
  const handleTest = () => {
    setMessage(`选择的语言: ${selectedLanguage}, 类型: ${selectedType}`);
  };
  
  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ marginBottom: '30px' }}>UI功能测试</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          目标语言:
        </label>
        <select 
          value={selectedLanguage} 
          onChange={(e) => setSelectedLanguage(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '10px', 
            fontSize: '16px', 
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        >
          {languages.map(lang => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          资源类型:
        </label>
        <select 
          value={selectedType} 
          onChange={(e) => setSelectedType(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '10px', 
            fontSize: '16px', 
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        >
          {types.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={handleTest}
          style={{ 
            padding: '12px 24px', 
            fontSize: '16px',
            backgroundColor: '#007cba', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          测试选择
        </button>
      </div>
      
      {message && (
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#d4edda', 
          border: '1px solid #c3e6cb', 
          borderRadius: '4px',
          color: '#155724'
        }}>
          {message}
        </div>
      )}
      
      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
        <h3>测试说明</h3>
        <ul>
          <li>选择框应该能正常切换选项</li>
          <li>按钮应该能响应点击</li>
          <li>选择后点击按钮应该显示选择的内容</li>
        </ul>
      </div>
    </div>
  );
}