const fs = require('fs');
const path = require('path');

// 指向同目錄下的 local_db.json
const DB_PATH = path.join(__dirname, 'local_db.json');

// --- 輔助函式：讀寫 JSON 資料庫 ---

function readDb() {
    if (!fs.existsSync(DB_PATH)) {
        console.warn('⚠️ local_db.json 不存在，回傳空物件');
        return {};
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error('❌ local_db.json 格式錯誤', e);
        return {};
    }
}

function writeDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('❌ 寫入 local_db.json 失敗', e);
    }
}

// --- 1. 模擬 Google Sheets API ---

const mockSheets = {
    spreadsheets: {
        values: {
            // 讀取資料 (GET)
            get: async ({ range }) => {
                const db = readDb();
                // 解析工作表名稱，例如 "Notes!A2:H" -> "Notes"
                const sheetName = range.split('!')[0];
                const rows = db[sheetName] || [];
                
                // 模擬 Google Sheets 行為：
                // 如果 range 包含 "A2" (代表從第二列開始讀)，我們去掉第一列 (標題)
                // 這樣前端拿到的陣列才不會包含標題
                const data = range.includes('A2') ? rows.slice(1) : rows;
                
                console.log(`[MockDB] 📖 Read ${data.length} rows from ${sheetName}`);
                return { data: { values: data } };
            },
            
            // 新增資料 (APPEND)
            append: async ({ range, resource }) => {
                const db = readDb();
                const sheetName = range.split('!')[0];
                
                if (!db[sheetName]) db[sheetName] = [];
                
                // 將新資料加入陣列
                const newRow = resource.values[0];
                db[sheetName].push(newRow);
                
                writeDb(db);
                console.log(`[MockDB] ➕ Appended to ${sheetName}:`, newRow[0]); // 印出 ID
                return {};
            },
            
            // 更新資料 (UPDATE)
            update: async ({ range, resource }) => {
                // range 格式範例: "Notes!A5:H5"
                const db = readDb();
                const sheetName = range.split('!')[0];
                
                // 從 range 中抓取行號 (Row Index)
                const match = range.match(/!A(\d+)/); 
                const rowIndex = match ? parseInt(match[1]) : null;

                if (rowIndex && db[sheetName]) {
                    // Google Sheet Row 1 是標題 (Index 0)
                    // Google Sheet Row 2 是資料 (Index 1)
                    // 所以 Array Index = rowIndex - 1
                    const arrayIndex = rowIndex - 1;
                    
                    if (db[sheetName][arrayIndex]) {
                        db[sheetName][arrayIndex] = resource.values[0];
                        writeDb(db);
                        console.log(`[MockDB] ✏️ Updated Row ${rowIndex} in ${sheetName}`);
                    } else {
                        console.warn(`[MockDB] ⚠️ Row ${rowIndex} not found`);
                    }
                }
                return {};
            },

            // 刪除資料 (CLEAR)
            // 注意：在 Mock 模式下，為了讓前端列表能正確消失，我們直接將該筆資料從陣列移除
            clear: async ({ range }) => {
                const db = readDb();
                const sheetName = range.split('!')[0];
                const match = range.match(/!A(\d+)/);
                const rowIndex = match ? parseInt(match[1]) : null;

                if (rowIndex && db[sheetName]) {
                    const arrayIndex = rowIndex - 1;
                    
                    // 從陣列中移除該元素
                    // (這與真實 Sheet 的 clear 不同，真實的是留白行，但本地開發這樣比較方便測試)
                    const deleted = db[sheetName].splice(arrayIndex, 1);
                    
                    writeDb(db);
                    console.log(`[MockDB] 🗑️ Deleted Row ${rowIndex} from ${sheetName}`, deleted);
                }
                return {};
            }
        }
    }
};

// --- 2. 模擬 Google Calendar API ---

const mockCalendar = {
    events: {
        // 新增事件
        insert: async ({ resource }) => {
            console.log(`[MockCalendar] 📅 Event Created: "${resource.summary}"`);
            console.log(`               ⏰ Time: ${resource.start.dateTime} ~ ${resource.end.dateTime}`);
            
            // 回傳一個假的 Event ID
            return { 
                data: { 
                    id: `mock_event_${Date.now()}_${Math.floor(Math.random() * 1000)}` 
                } 
            };
        },
        
        // 刪除事件
        delete: async ({ eventId }) => {
            console.log(`[MockCalendar] 🗑️ Event Deleted: ${eventId}`);
            // 假裝刪除成功，回傳空物件
            return {};
        },
        
        // 更新事件
        update: async ({ eventId, resource }) => {
            console.log(`[MockCalendar] ✏️ Event Updated: ${eventId}`);
            console.log(`               📝 New Title: "${resource.summary}"`);
            
            // 回傳更新後的資料結構
            return { data: resource };
        }
    }
};

module.exports = { mockSheets, mockCalendar };