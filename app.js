// 全域變數
let notesData = [];
let categoriesData = [];
let rolesData = []; 
let authToken = localStorage.getItem('token');

// --- 1. API 請求封裝 ---
async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const res = await fetch(`${CONFIG.API_URL}${endpoint}`, config);
        
        // 嘗試解析 JSON 回應
        let data;
        try {
            data = await res.json();
        } catch (e) {
            data = null;
        }

        // 處理 HTTP 錯誤狀態
        if (!res.ok) {
            // 401/403: Token 失效
            if (res.status === 401 || res.status === 403) {
                handleLogout(); 
                return null;
            }
            
            // 429: 請求太頻繁 (Rate Limit)
            if (res.status === 429) {
                Swal.fire('慢一點', '您的請求太頻繁，請稍後再試', 'warning');
                return null;
            }

            // 400/500: 其他後端錯誤 (顯示詳細訊息，如輸入驗證失敗)
            const msg = (data && data.message) ? data.message : '伺服器發生錯誤';
            // 如果有詳細錯誤列表 (express-validator)
            const details = (data && data.details && Array.isArray(data.details)) 
                ? data.details.map(err => err.msg).join('<br>') 
                : '';
            
            Swal.fire('操作失敗', details ? `${msg}<br><small>${details}</small>` : msg, 'error');
            return null; // 回傳 null 代表失敗
        }
        
        return data; // 回傳成功資料

    } catch (err) {
        console.error("API Error", err);
        // 這邊通常是網路完全不通，或是 CORS 被擋
        Swal.fire('連線錯誤', '無法連接伺服器，請確認後端已啟動', 'error');
        return null;
    }
}

// --- 2. 認證系統 (Auth) ---

function handleLogin() {
    const username = document.getElementById('login-username').value;
    const pwd = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;

    fetch(`${CONFIG.API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            username: username, 
            password: pwd,
            rememberMe: remember 
        })
    })
    .then(async res => {
        const data = await res.json();
        if (res.ok && data.token) {
            localStorage.setItem('token', data.token);
            authToken = data.token;
            document.getElementById('login-overlay').classList.remove('active');
            initApp();
        } else {
            // 處理登入失敗 (包含 429 Rate Limit)
            Swal.fire('登入失敗', data.message || '帳號或密碼錯誤', 'error');
        }
    })
    .catch(err => {
        console.error(err);
        Swal.fire('錯誤', '無法連接伺服器 (CORS 或網路問題)', 'error');
    });
}

function handleLogout() {
    localStorage.removeItem('token');
    location.reload(); 
}

// --- 3. 應用程式初始化 ---

async function initApp() {
    if (!authToken) {
        document.getElementById('login-overlay').classList.add('active');
        return;
    }
    
    document.getElementById('login-overlay').classList.remove('active');
    
    const [cats, roles, notes] = await Promise.all([
        apiRequest('/categories'),
        apiRequest('/roles'), 
        apiRequest('/notes')
    ]);

    // 如果 API 失敗回傳 null，給予預設空陣列避免報錯
    categoriesData = cats || CONFIG.DEFAULT_CATEGORIES || [];
    rolesData = roles || []; 
    notesData = notes || [];

    renderOptions();   
    applyFilters();    
    renderStats();     
    renderRoleStats(); 
}

// --- 4. 畫面渲染 (Rendering) ---

function renderOptions() {
    // 1. 類別選單
    const catSelect = document.getElementById('note-category');
    catSelect.innerHTML = '';
    categoriesData.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        catSelect.appendChild(opt);
    });

    // 2. 目標選單
    const roleSelect = document.getElementById('note-role');
    const filterSelect = document.getElementById('filter-role');
    
    roleSelect.innerHTML = '<option value="" disabled selected>請選擇目標...</option>';
    filterSelect.innerHTML = '<option value="all">所有目標</option>';

    rolesData.forEach(role => {
        const opt1 = document.createElement('option');
        opt1.value = role.name;
        opt1.textContent = role.name;
        roleSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = role.name;
        opt2.textContent = role.name;
        filterSelect.appendChild(opt2);
    });
}

function applyFilters() {
    const filterRole = document.getElementById('filter-role').value;
    const container = document.getElementById('notes-container');
    container.innerHTML = '';

    let filteredNotes = [...notesData].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filterRole !== 'all') {
        filteredNotes = filteredNotes.filter(n => n.role === filterRole);
    }

    if (filteredNotes.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">沒有符合條件的筆記</div>';
        return;
    }

    filteredNotes.forEach(note => {
        const catConfig = categoriesData.find(c => c.name === note.category) || { color: '#ccc' };
        const timeDisplay = note.startTime ? `🕒 ${note.startTime} - ${note.endTime}` : '';
        const syncIcon = note.eventId ? `<span title="已同步至行事曆">📅</span>` : '';

        const card = document.createElement('div');
        card.className = 'note-card';
        card.style.borderLeftColor = catConfig.color;
        
        // --- 安全渲染內容 (Secure Content Rendering) ---
        // 建立一個 div 來放內容，設定 white-space 處理換行
        const contentDiv = document.createElement('div');
        contentDiv.className = 'note-content';
        // 直接設定樣式，確保換行正常顯示 (取代原本的 .replace(/\n/g, '<br>'))
        contentDiv.style.whiteSpace = 'pre-wrap'; 
        contentDiv.style.wordBreak = 'break-word';
        contentDiv.style.marginTop = '8px';
        contentDiv.style.color = '#444';
        contentDiv.textContent = note.content; // 🌟 使用 textContent 防止 XSS

        // Header 與 Meta 資訊仍使用 innerHTML (因包含按鈕與 ICON，且內容受控)
        const headerHtml = `
            <div class="note-header">
                <span>${syncIcon} <b>${note.date}</b> ${timeDisplay}</span>
                <div class="note-actions">
                    <button onclick="editNote('${note.id}')" title="編輯">✏️</button>
                    <button onclick="deleteNote('${note.rowIndex}')" title="刪除">🗑️</button>
                </div>
            </div>
            <div class="note-meta" style="color:${catConfig.color}; font-size:0.9em; font-weight:bold;">
                ${note.category} <span style="color:#666; font-weight:normal">| 🎯 ${note.role || '未設定'}</span>
            </div>
        `;
        
        card.innerHTML = headerHtml;
        card.appendChild(contentDiv); // 將安全的內容 div 加入卡片
        container.appendChild(card);
    });
}

window.switchStats = (type) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    if(type === 'category') {
        document.getElementById('stats-container').style.display = 'grid';
        document.getElementById('role-stats-container').style.display = 'none';
    } else {
        document.getElementById('stats-container').style.display = 'none';
        document.getElementById('role-stats-container').style.display = 'grid';
    }
}

function renderStats() {
    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    categoriesData.forEach(cat => {
        const count = notesData.filter(n => n.category === cat.name && n.date.startsWith(currentMonth)).length;
        const target = parseInt(cat.target) || 10;
        const percentage = Math.min((count / target) * 100, 100);

        const item = document.createElement('div');
        item.className = 'stat-item';
        item.innerHTML = `
            <small>${cat.name}</small>
            <div style="font-weight:bold;">${count}/${target}</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%; background-color: ${cat.color}"></div>
            </div>
        `;
        container.appendChild(item);
    });
}

function renderRoleStats() {
    const container = document.getElementById('role-stats-container');
    container.innerHTML = '';
    const currentMonth = new Date().toISOString().slice(0, 7);

    rolesData.forEach(role => {
        const count = notesData.filter(n => n.role === role.name && n.date.startsWith(currentMonth)).length;
        const target = parseInt(role.target) || 5;
        const percentage = Math.min((count / target) * 100, 100);
        const barColor = '#7b9acc'; 

        const item = document.createElement('div');
        item.className = 'stat-item';
        item.innerHTML = `
            <small style="font-weight:bold; color:#555;">${role.name}</small>
            <div style="font-size:0.85em; color:#999; margin-bottom:2px;">${role.description || ''}</div>
            <div style="font-weight:bold;">${count}/${target}</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%; background-color: ${barColor}"></div>
            </div>
        `;
        container.appendChild(item);
    });
}

// --- 5. 表單互動邏輯 ---

const modal = document.getElementById('note-modal');
const form = document.getElementById('note-form');
const syncCheckbox = document.getElementById('note-sync');
const calOptions = document.getElementById('calendar-options');

syncCheckbox.addEventListener('change', (e) => {
    calOptions.style.display = e.target.checked ? 'block' : 'none';
    if(e.target.checked && !document.getElementById('note-start-time').value) {
        const now = new Date();
        const nextHour = new Date(now.getTime() + 60*60*1000);
        const fmt = (d) => d.toTimeString().slice(0,5); 
        document.getElementById('note-start-time').value = fmt(now);
        document.getElementById('note-end-time').value = fmt(nextHour);
    }
});

document.getElementById('add-btn').onclick = () => {
    form.reset();
    document.getElementById('note-date').valueAsDate = new Date();
    document.getElementById('note-rowIndex').value = ''; 
    syncCheckbox.checked = false;
    calOptions.style.display = 'none';
    document.getElementById('note-recurrence').value = 'none';
    if(rolesData.length > 0) document.getElementById('note-role').value = "";
    document.getElementById('modal-title').innerText = '新增筆記';
    modal.style.display = 'block';
};

document.querySelector('.close').onclick = () => modal.style.display = 'none';

window.onclick = (event) => {
    if (event.target == modal) modal.style.display = "none";
    if (event.target == settingsModal) settingsModal.style.display = "none";
}

form.onsubmit = async (e) => {
    e.preventDefault();
    
    const rowIndex = document.getElementById('note-rowIndex').value;
    const id = rowIndex ? notesData.find(n => n.rowIndex == rowIndex).id : Date.now().toString();
    
    const noteData = {
        id: id,
        date: document.getElementById('note-date').value,
        category: document.getElementById('note-category').value,
        role: document.getElementById('note-role').value, 
        content: document.getElementById('note-content').value,
        syncToCalendar: syncCheckbox.checked,
        startTime: document.getElementById('note-start-time').value,
        endTime: document.getElementById('note-end-time').value,
        recurrence: document.getElementById('note-recurrence').value
    };

    // 🌟 修正：先取得 API 結果，確認成功才關閉視窗
    let result;
    if (rowIndex) {
        result = await apiRequest(`/notes/${rowIndex}`, 'PUT', noteData);
    } else {
        result = await apiRequest('/notes', 'POST', noteData);
    }

    // 如果回傳 null，代表失敗 (api function 已顯示錯誤訊息)，直接中斷
    if (!result) return;

    modal.style.display = 'none';
    initApp(); 
    Swal.fire({ title: '成功', text: '紀錄已儲存', icon: 'success', timer: 1500, showConfirmButton: false });
};

window.editNote = (id) => {
    const note = notesData.find(n => n.id === id);
    if (!note) return;
    
    document.getElementById('note-rowIndex').value = note.rowIndex;
    document.getElementById('note-date').value = note.date;
    document.getElementById('note-category').value = note.category;
    document.getElementById('note-content').value = note.content;
    document.getElementById('note-role').value = note.role || "";

    const hasTime = note.startTime && note.endTime;
    if (hasTime || note.eventId) {
        syncCheckbox.checked = true;
        calOptions.style.display = 'block';
        document.getElementById('note-start-time').value = note.startTime;
        document.getElementById('note-end-time').value = note.endTime;
        document.getElementById('note-recurrence').value = 'none'; 
    } else {
        syncCheckbox.checked = false;
        calOptions.style.display = 'none';
        document.getElementById('note-start-time').value = '';
        document.getElementById('note-end-time').value = '';
    }
    
    document.getElementById('modal-title').innerText = '編輯筆記';
    modal.style.display = 'block';
};

window.deleteNote = async (rowIndex) => {
    const result = await Swal.fire({
        title: '確定刪除？',
        text: '若有同步行事曆，該事件也會一併刪除',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '刪除',
        cancelButtonColor: '#ff6b6b'
    });

    if (result.isConfirmed) {
        const apiRes = await apiRequest(`/notes/${rowIndex}`, 'DELETE');
        if(apiRes) {
            initApp();
            Swal.fire({ title: '已刪除', icon: 'success', timer: 1000, showConfirmButton: false });
        }
    }
};

// --- 6. 帳號設定 (Settings) ---

const settingsModal = document.getElementById('settings-modal');

function openSettings() {
    document.getElementById('setting-old-pwd').value = '';
    document.getElementById('setting-new-pwd').value = '';
    settingsModal.style.display = 'block';
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

async function changePassword() {
    const oldPwd = document.getElementById('setting-old-pwd').value;
    const newPwd = document.getElementById('setting-new-pwd').value;

    if (!oldPwd || !newPwd) {
        Swal.fire('提示', '請填寫所有欄位', 'warning');
        return;
    }

    const res = await fetch(`${CONFIG.API_URL}/user/password`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
    });

    const data = await res.json();

    if (res.ok) {
        Swal.fire('成功', '密碼已更新，請重新登入', 'success').then(() => {
            handleLogout();
        });
    } else {
        Swal.fire('失敗', data.message || '更新失敗', 'error');
    }
}

// 綁定全域函式
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.changePassword = changePassword;
window.editNote = editNote;
window.deleteNote = deleteNote;
window.switchStats = switchStats;
window.applyFilters = applyFilters;

if(authToken) initApp();
else document.getElementById('login-overlay').classList.add('active');