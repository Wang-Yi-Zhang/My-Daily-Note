# Daily Flow - 個人每日筆記與目標管理系統

**Daily Flow** 是一個前後端分離的輕量級個人筆記工具。它結合了 Google Sheets 作為資料庫的便利性，以及 Google Calendar 的時間管理功能，協助使用者進行每日紀錄、人生角色目標設定與時間規劃。

## 🌟 功能特色

* **Google Sheets 核心**：資料直接儲存在雲端試算表，方便檢視、備份與二創。
* **行事曆同步**：可選性將筆記同步至 Google Calendar，支援時間區段與重複設定。
* **目標儀表板**：自動計算每月各類別（如工作、學習、運動）的達標率。
* **JWT 安全驗證**：後端採用 Token 驗證機制，保護 API 存取安全。
* **響應式設計**：純原生 JS/CSS 開發，支援桌面與行動裝置流暢操作。
* **Mock 開發模式**：不需連網也能使用本地 JSON 模擬資料庫進行開發。

## 📂 專案結構

```
daily-flow/
├── .gitignore                  # [設定] Git 忽略清單 (保護機敏檔案)
├── README.md                   # [文件] 專案說明
│
├── frontend/                   # [前端] 靜態網頁檔案
│   ├── index.html              # 網頁主架構 (含 Login Modal, CRUD UI)
│   ├── style.css               # 樣式表 (響應式設計)
│   ├── app.js                  # 核心邏輯 (API 呼叫, Auth, UI 渲染)
│   ├── config.js               # API URL 設定
│   └── icon.png                # (選用) 網頁 Favicon
│
└── backend/                    # [後端] Node.js 伺服器
    ├── index.js                # 程式入口 (Express, Google API, JWT)
    ├── mockService.js          # 本地模擬邏輯 (讀寫 JSON)
    ├── package.json            # NPM 依賴清單
    ├── local_db.json           # [資料] 本地模擬資料庫 (開發用)
    │
    ├── .env                    # [機敏] 環境變數 (密碼, Sheet ID)
    ├── .env.example            # [範例] 環境變數範本 (上傳 Git 用)
    │
    ├── credentials.json        # [機敏] GCP Service Account 金鑰
    └── credentials.example.json # [範例] 金鑰結構範本 (上傳 Git 用)

```

## 快速啟動

### 1. 安裝依賴
請確保已安裝 Node.js，然後執行：

```bash
cd backend
npm install
```

### 2. 環境變數設定 (.env)
```bash
PORT=3000
# 請設定一個複雜的隨機字串
JWT_SECRET=my_super_secret_key_123

# Google Sheet ID (僅在正式模式需要)
SPREADSHEET_ID=你的_GOOGLE_SHEET_ID

# 前端網址 (用於 CORS 白名單，Live Server 預設為 5500)
FRONTEND_URL=[http://127.0.0.1:5500](http://127.0.0.1:5500)

# --- 開發模式開關 ---
# true: 使用本地 local_db.json (速度快，不連 Google)
# false: 連線真實 Google API
USE_MOCK_DB=true
```
### 3. 啟動測試伺服器
```bash
# 在 backend 資料夾執行
npm run dev
```

前端請使用 VS Code 的 Live Server 開啟 frontend/index.html。

## Google Cloud 正式環境設定指南
當你準備將 USE_MOCK_DB 改為 false 時，請務必完成以下設定。

### 第一步：申請 Google Cloud 專案與憑證
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立一個新專案 (例如命名為 Daily Flow)。
3. 啟用 API：
    - 在左側選單點選「API 和服務」>「啟用 API 和服務」。
    - 搜尋並啟用 Google Sheets API。
    - 搜尋並啟用 Google Calendar API。
4. 建立服務帳號 (Service Account)：
    - 進入「憑證 (Credentials)」>「建立憑證」>「服務帳號」。
    - 填寫名稱 (例如 daily-flow-bot)，權限可選「擁有者」或略過。
    - 建立後，在服務帳號列表點選該帳號的 Email (格式如 xxx@project-id.iam.gserviceaccount.com)，複製這個 Email。
5. 下載金鑰：
    - 點選該服務帳號 >「金鑰 (Keys)」>「新增金鑰」>「建立新金鑰」> 選擇 JSON。
    - 下載檔案，重新命名為 credentials.json。
    - 將此檔案放入專案的 backend/ 資料夾中。
    - ⚠️ 注意：絕對不要將此檔案上傳到 GitHub。

### 第二步：設定 Google Sheets (資料庫)
1. 建立一個新的 Google Sheet。
2. 共用權限：點擊右上角「共用」，將剛剛複製的 服務帳號 Email 加入，並給予 「編輯者」 權限。
3. 建立工作表 (Tabs)：請依照下方規格建立三個分頁，第一列必須是標題。

#### 1. Users (使用者)

| username | password |
| ---------- | ---------- |
| admin    | 雜湊字串     |

如何產生密碼？ 在終端機執行：node -e "console.log(require('bcryptjs').hashSync('你的密碼', 10))"

#### 2. Categories (筆記類別)

| name | color   | target_count |
| ------ | --------- | -------------- |
| 工作   | #ffadad | 20           |
| 學習   | #ffd6a5 | 10           |

#### 3. Roles (人生角色/目標)

| name | target_count | description |
| ------ | -------------- | ------------- |
| 專家   | 10           | 持續精進技術      |
| 好關係  | 15           | 陪伴家人        |

#### 4. Notes (筆記資料)

| A  | B    | C        | D       | E    | F          | G        | H               |
|----|------|----------|---------|------|------------|----------|-----------------|
| id | date | category | content | role | start_time | end_time | google_event_id |

4. 取得 ID：複製網址列中的 ID (位於 /d/ 與 /edit 之間)，填入 .env 的 SPREADSHEET_ID。

### 第三步：設定 Google Calendar
1. 打開 Google Calendar。
2. 在左側「我的日曆」找到你想同步的日曆，點選「設定和共用」。
3. 在「與特定使用者共用」區塊，加入服務帳號 Email，權限設為 「進行變更及管理共用設定」。

## API 規格表
| Method | Endpoint             | Description                                         | Auth          |
|--------|----------------------|-----------------------------------------------------|---------------|
| POST   | /api/login           | 登入系統，驗證帳號密碼，回傳 Token。                               | 限制 (10次/15分)  |
| PUT    | /api/user/password   | 修改密碼，更新當前登入使用者的密碼。                                  | JWT           |
| GET    | /api/notes           | 讀取筆記，取得所有筆記資料。                                      | JWT           |
| POST   | /api/notes           | 新增筆記，建立新筆記 (含 XSS 過濾)。若有時間設定，會同步寫入 Google Calendar。 | JWT           |
| PUT    | /api/notes/:rowIndex | 編輯筆記，更新指定列資料。支援行事曆同步更新（時間異動、取消同步）。                  | JWT           |
| DELETE | /api/notes/:rowIndex | 刪除筆記，刪除指定列。若有同步，會一併刪除 Google Calendar 事件。           | JWT           |
| GET    | /api/categories      | 讀取類別，取得系統設定的類別與顏色。                                  | JWT           |
| GET    | /api/roles           | 讀取角色，取得人生角色與目標設定。                                   | JWT           |
