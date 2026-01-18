require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult, param } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// --- 1. 資安中介軟體設定 (Security Middleware) ---

// A. 設定 HTTP 安全標頭
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// B. 限制 Body 大小 (防止 DoS 攻擊)
app.use(express.json({ limit: '10kb' })); 

// C. CORS 設定 (修正版：允許 Live Server 的來源)
const corsOptions = {
    origin: [
        'http://127.0.0.1:5500', // Live Server 預設 IP
        'http://localhost:5500', // Live Server 有時也會用 localhost
        'http://localhost:3000', // 本機測試
        process.env.FRONTEND_URL // 讀取 .env 設定 (以防萬一)
    ].filter(Boolean), // 過濾掉 undefined
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // 允許傳送 Token
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// E. 全域速率限制 (防止 DDoS)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 300, // 每個 IP 最多 300 次請求
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: '請求過於頻繁，請稍後再試' }
});
app.use('/api/', apiLimiter);

// F. 登入專用速率限制 (防止暴力破解)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 10, // 每個 IP 只能嘗試登入 10 次
    message: { message: '登入失敗次數過多，請 15 分鐘後再試' }
});

// --- 2. 初始化 Google Services (或 Mock Services) ---
let sheets;
let calendar;

if (process.env.USE_MOCK_DB === 'true') {
    console.log('🚧 --------------------------------------- 🚧');
    console.log('🚧  目前模式：本地開發 (Mock Mode)          🚧');
    console.log('🚧  資料來源：local_db.json                 🚧');
    console.log('🚧 --------------------------------------- 🚧');
    
    const { mockSheets, mockCalendar } = require('./mockService');
    sheets = mockSheets;
    calendar = mockCalendar;
} else {
    console.log('目前模式：正式環境 (Real Google API)');
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/calendar'
        ],
    });
    sheets = google.sheets({ version: 'v4', auth });
    calendar = google.calendar({ version: 'v3', auth });
}

// --- 3. 身份驗證 middleware (JWT) ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// --- 4. API 路由實作 ---

app.post('/api/login', 
    loginLimiter,
    [
        body('username').trim().notEmpty().withMessage('帳號不能為空').escape(),
        body('password').notEmpty().withMessage('密碼不能為空')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: '輸入格式錯誤', details: errors.array() });
        }

        const { username, password, rememberMe } = req.body;

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Users!A2:B',
            });
            
            const rows = response.data.values || [];
            const user = rows.find(row => row[0] === username);

            const authFailedMsg = '帳號或密碼錯誤';

            if (!user) return res.status(400).json({ message: authFailedMsg });

            const validPassword = await bcrypt.compare(password, user[1]);
            if (!validPassword) return res.status(400).json({ message: authFailedMsg });

            const expiresIn = rememberMe ? '365d' : '24h';
            const token = jwt.sign({ username: user[0] }, process.env.JWT_SECRET, { expiresIn });

            res.json({ token, username: user[0] });

        } catch (error) {
            console.error('Login Error:', error);
            res.status(500).json({ message: '系統錯誤' });
        }
    }
);

// 修改密碼 API
app.put('/api/user/password', 
    authenticateToken,
    [
        body('oldPassword').notEmpty(),
        body('newPassword').isLength({ min: 6 }).withMessage('新密碼至少需 6 碼')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

        const { oldPassword, newPassword } = req.body;
        const username = req.user.username;

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Users!A2:B',
            });
            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === username);

            if (rowIndex === -1) return res.status(404).json({ message: '使用者不存在' });

            const currentHash = rows[rowIndex][1];
            const valid = await bcrypt.compare(oldPassword, currentHash);
            if (!valid) return res.status(400).json({ message: '舊密碼錯誤' });

            const newHash = await bcrypt.hash(newPassword, 10);
            const actualRow = rowIndex + 2;

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Users!B${actualRow}`,
                valueInputOption: 'RAW',
                resource: { values: [[newHash]] }
            });

            res.json({ message: '密碼更新成功' });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: '更新失敗' });
        }
    }
);

// 讀取類別 (Categories)
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Categories!A2:C',
        });
        const rows = response.data.values || [];
        const categories = rows.map(row => ({
            name: row[0],
            color: row[1],
            target: row[2]
        }));
        res.json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '讀取失敗' });
    }
});

// 讀取目標 (Roles)
app.get('/api/roles', authenticateToken, async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Roles!A2:C',
        });
        const rows = response.data.values || [];
        const roles = rows.map(row => ({
            name: row[0],
            target: row[1],
            description: row[2] || ''
        }));
        res.json(roles);
    } catch (error) {
        console.error('讀取目標失敗:', error);
        res.status(500).json({ message: '讀取目標失敗' });
    }
});

// 讀取筆記 (Notes)
app.get('/api/notes', authenticateToken, async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Notes!A2:H',
        });
        
        const rows = response.data.values || [];
        const notes = rows.map((row, index) => ({
            rowIndex: index + 2,
            id: row[0],
            date: row[1],
            category: row[2],
            content: row[3],
            role: row[4] || '',
            startTime: row[5] || '',
            endTime: row[6] || '',
            eventId: row[7] || ''
        }));
        
        res.json(notes);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '讀取筆記失敗' });
    }
});

// 新增筆記 (Create)
app.post('/api/notes', 
    authenticateToken,
    [
        body('date').isISO8601().withMessage('日期格式錯誤').toDate(),
        body('category').trim().escape(),
        body('role').trim().escape(),
        body('content').trim().escape(),
        body('startTime').optional({ checkFalsy: true }).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        body('endTime').optional({ checkFalsy: true }).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: '資料格式錯誤', details: errors.array() });

        try {
            const { 
                id, date, category, content, role, 
                syncToCalendar, startTime, endTime, recurrence 
            } = req.body;

            let eventId = '';

            // --- Google Calendar 同步邏輯 ---
            if (syncToCalendar && startTime && endTime) {
                try {
                    let recurrenceRule = [];
                    if (recurrence && recurrence !== 'none') {
                        recurrenceRule = [`RRULE:FREQ=${recurrence}`];
                    }

                    const event = {
                        summary: `[${category}] ${role ? role + '-' : ''}${content.substring(0, 20)}...`,
                        description: content,
                        start: { dateTime: `${date}T${startTime}:00`, timeZone: 'Asia/Taipei' },
                        end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Asia/Taipei' },
                        recurrence: recurrenceRule.length > 0 ? recurrenceRule : undefined
                    };

                    const calResponse = await calendar.events.insert({
                        calendarId: 'primary',
                        resource: event,
                    });
                    eventId = calResponse.data.id;
                    console.log('Calendar Event Created:', eventId);

                } catch (calError) {
                    console.error('Calendar Sync Failed:', calError);
                }
            }

            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Notes!A:H',
                valueInputOption: 'RAW',
                resource: {
                    values: [[id, date, category, content, role, startTime, endTime, eventId]]
                }
            });

            res.json({ message: 'Success', eventId });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: '儲存失敗' });
        }
    }
);

// 編輯筆記 (Update)
app.put('/api/notes/:rowIndex', 
    authenticateToken,
    [
        param('rowIndex').isNumeric(),
        body('date').isISO8601(),
        body('category').trim().escape(),
        body('role').trim().escape(),
        body('content').trim().escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: '格式錯誤' });

        try {
            const { rowIndex } = req.params;
            const { 
                id, date, category, content, role,
                syncToCalendar, startTime, endTime 
            } = req.body;

            // 1. 讀取舊資料 (為了 Event ID)
            const checkRes = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `Notes!H${rowIndex}`
            });
            
            let existingEventId = '';
            if (checkRes.data.values && checkRes.data.values[0]) {
                existingEventId = checkRes.data.values[0][0];
            }

            let finalEventId = existingEventId;

            // 2. Calendar 同步處理
            if (syncToCalendar && startTime && endTime) {
                const eventBody = {
                    summary: `[${category}] ${role ? role + '-' : ''}${content.substring(0, 20)}...`,
                    description: content,
                    start: { dateTime: `${date}T${startTime}:00`, timeZone: 'Asia/Taipei' },
                    end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Asia/Taipei' }
                };

                if (existingEventId) {
                    try {
                        await calendar.events.update({
                            calendarId: 'primary',
                            eventId: existingEventId,
                            resource: eventBody
                        });
                    } catch (e) { console.error('Update Calendar Failed', e); }
                } else {
                    try {
                        const newEvt = await calendar.events.insert({
                            calendarId: 'primary',
                            resource: eventBody
                        });
                        finalEventId = newEvt.data.id;
                    } catch (e) { console.error('Insert Calendar Failed', e); }
                }
            } 
            else if ((!syncToCalendar || !startTime) && existingEventId) {
                try {
                    await calendar.events.delete({
                        calendarId: 'primary',
                        eventId: existingEventId
                    });
                    finalEventId = ''; 
                } catch (e) { console.error('Delete Calendar Failed', e); }
            }

            // 3. 更新 Sheet
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Notes!A${rowIndex}:H${rowIndex}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [[id, date, category, content, role, startTime, endTime, finalEventId]]
                }
            });

            res.json({ message: 'Updated' });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: '更新失敗' });
        }
    }
);

// 刪除筆記 (Delete)
app.delete('/api/notes/:rowIndex', authenticateToken, async (req, res) => {
    try {
        const { rowIndex } = req.params;

        // 1. 刪除日曆事件
        const checkRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `Notes!H${rowIndex}`
        });

        if (checkRes.data.values && checkRes.data.values[0]) {
            const eventId = checkRes.data.values[0][0];
            if (eventId) {
                try {
                    await calendar.events.delete({
                        calendarId: 'primary',
                        eventId: eventId
                    });
                } catch (e) {
                    console.warn('Calendar delete failed:', e.message);
                }
            }
        }

        // 2. 清空 Sheet 資料
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `Notes!A${rowIndex}:H${rowIndex}`
        });

        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '刪除失敗' });
    }
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`Secure Server running on port ${PORT}`);
    console.log(`Security headers, XSS protection, and Rate limiting enabled.`);
});