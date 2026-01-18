// API 設定
const CONFIG = {
  API_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000/api'  // 本地開發用的後端地址
        : 'https://你的專案名稱.zeabur.app/api', // 請填入你在 Zeabur 部署後的後端網址

  DEFAULT_CATEGORIES: [
        { name: '工作', color: '#ffadad', target: 20 },
        { name: '學習', color: '#ffd6a5', target: 10 },
        { name: '生活', color: '#fdffb6', target: 15 },
        { name: '運動', color: '#caffbf', target: 12 }
    ]
};