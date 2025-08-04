import { useState } from "react";

/**
 * 独立测试页面 - 不依赖Shopify认证
 */
export default function StandaloneTest() {
  const [selectedLanguage, setSelectedLanguage] = useState('zh-CN');
  const [selectedType, setSelectedType] = useState('PRODUCT');
  const [clickCount, setClickCount] = useState(0);
  const [logs, setLogs] = useState([]);

  const languageOptions = [
    { label: 'Chinese (Simplified)', value: 'zh-CN' },
    { label: 'English', value: 'en' },
    { label: 'Japanese', value: 'ja' },
    { label: 'German', value: 'de' },
  ];

  const typeOptions = [
    { label: '产品', value: 'PRODUCT' },
    { label: '集合', value: 'COLLECTION' },
    { label: '页面', value: 'PAGE' },
  ];

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 9)]);
  };

  const handleLanguageChange = (e) => {
    const value = e.target.value;
    setSelectedLanguage(value);
    addLog(`语言已切换到: ${languageOptions.find(opt => opt.value === value)?.label}`);
  };

  const handleTypeChange = (e) => {
    const value = e.target.value;
    setSelectedType(value);
    addLog(`类型已切换到: ${typeOptions.find(opt => opt.value === value)?.label}`);
  };

  const handleButtonClick = () => {
    setClickCount(prev => prev + 1);
    addLog(`按钮被点击 #${clickCount + 1}`);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('日志已清空');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>独立UI测试页面</h1>
      
      <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>选择框测试</h2>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>目标语言:</label>
            <select 
              value={selectedLanguage} 
              onChange={handleLanguageChange}
              style={{ padding: '8px', fontSize: '14px', minWidth: '150px' }}
            >
              {languageOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>资源类型:</label>
            <select 
              value={selectedType} 
              onChange={handleTypeChange}
              style={{ padding: '8px', fontSize: '14px', minWidth: '150px' }}
            >
              {typeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleButtonClick}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#007cba', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            测试按钮 (点击: {clickCount})
          </button>
          <button 
            onClick={clearLogs}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#666', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            清空日志
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>当前状态</h3>
        <p><strong>选中语言:</strong> {selectedLanguage} ({languageOptions.find(opt => opt.value === selectedLanguage)?.label})</p>
        <p><strong>选中类型:</strong> {selectedType} ({typeOptions.find(opt => opt.value === selectedType)?.label})</p>
        <p><strong>按钮点击次数:</strong> {clickCount}</p>
      </div>

      {logs.length > 0 && (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>操作日志</h3>
          <div style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px', fontSize: '14px' }}>
            {logs.map((log, index) => (
              <div key={index} style={{ 
                marginBottom: '5px', 
                color: index === 0 ? '#007cba' : '#333',
                fontWeight: index === 0 ? 'bold' : 'normal'
              }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}