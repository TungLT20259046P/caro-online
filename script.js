// ================= 1. KẾT NỐI MẠNG & API =================
let serverUrl = window.location.origin; 
if (window.location.protocol === 'file:') {
    serverUrl = 'http://localhost:3000'; 
} else if (window.location.port === '5500') {
    serverUrl = `http://${window.location.hostname}:3000`;
}

let socket = { on: () => {}, emit: () => {} }; 
const token = localStorage.getItem('caro_token');

function initSocket(validToken) {
    socket = io(serverUrl, {
        auth: { token: validToken }
    });

    socket.on('connect_error', (err) => {
        // Xử lý 2 loại lỗi từ Server
        if (err.message === 'Already logged in') {
            alert('CẢNH BÁO: Tài khoản này đang được đăng nhập ở nơi khác!');
            performSignOut();
        } else if (err.message === 'Authentication error') {
            performSignOut(); 
        }
    });

    socket.on('connect', () => {
        const username = localStorage.getItem('caro_username');
        
        // SỬA LỖI UI: Bật đúng ID của nút Icon
        const userBtn = document.getElementById('userProfileBtn');
        
        // Bật trạng thái kết nối xanh lá
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.innerText = `🟢 Đã kết nối mạng | Tên: ${username}`;
            statusEl.style.color = '#2ecc71';
        }

        console.log('Đã kết nối Socket bảo mật cho:', username);
        setupSocketEvents();
    });

    socket.on('disconnect', () => {
        // Báo đỏ khi rớt mạng
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.innerText = `🔴 Mất kết nối với Server...`;
            statusEl.style.color = '#e74c3c';
        }
        // --- CƠ CHẾ CHỐNG GIAN LẬN: CẮT CẦU ELO ---
        if (gameActive && playerRole !== null && !isOnline) {
            // Đang đánh PvE mà rớt mạng
            isRankedMatch = false; 
            statusMessage.innerText += " (Mất kết nối: Ván này không tính ELO)";
            statusMessage.style.color = "#f39c12"; // Cảnh báo vàng
        }
    });
}
// ================= LOGIC POPUP TÀI KHOẢN =================
const userProfileBtn = document.getElementById('userProfileBtn');
const userModal = document.getElementById('userModal');
const closeUserModal = document.getElementById('closeUserModal');
const btnSignOut = document.getElementById('btnSignOut');

const userInfoView = document.getElementById('userInfoView');
const userHistoryView = document.getElementById('userHistoryView');
const btnShowHistory = document.getElementById('btnShowHistory');
const btnBackToProfile = document.getElementById('btnBackToProfile');
const historyContainer = document.getElementById('historyContainer');
const userEditView = document.getElementById('userEditView');
const btnShowEditForm = document.getElementById('btnShowEditForm');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const editProfileForm = document.getElementById('editProfileForm');
const editProfileError = document.getElementById('editProfileError');

// 1. Mở Modal & Bơm trạng thái ảo
userProfileBtn.addEventListener('click', async () => {
    userModal.style.display = 'flex';
    document.getElementById('modalUsername').innerText = localStorage.getItem('caro_username');
    userInfoView.style.display = 'block';
    userEditView.style.display = 'none';
    if(userHistoryView) userHistoryView.style.display = 'none';
    
    history.pushState({ popup: 'userModal' }, "User Modal", "");

    // GỌI API LẤY DỮ LIỆU
    if (!socket.connected) return; // Đứt mạng thì ko tải được
    try {
        const res = await fetch(`${serverUrl}/api/user/profile`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('caro_token')}` }
        });
        if (res.ok) {
            const data = await res.json();
            document.getElementById('modalElo').innerText = data.elo;
            
            // CẬP NHẬT NÚT RIÊNG TƯ
            isPrivate = data.is_private; // Lưu vào biến cục bộ
            if (isPrivate) {
                btnTogglePrivacy.innerText = 'Đã ẩn';
                btnTogglePrivacy.style.backgroundColor = '#ecf0f1';
            } else {
                btnTogglePrivacy.innerText = 'Công khai';
                btnTogglePrivacy.style.backgroundColor = '#f3f4f6';
            }

            renderMatchHistoryAndMatrix(data.history);
        }
    } catch (err) { console.log('Lỗi tải Profile'); }
});

// Sự kiện nút Lịch sử
if(btnShowHistory) btnShowHistory.addEventListener('click', () => {
    userInfoView.style.display = 'none';
    userHistoryView.style.display = 'block';
    history.pushState({ popup: 'userHistory' }, "User History", "");
});
if(btnBackToProfile) btnBackToProfile.addEventListener('click', () => {
    userHistoryView.style.display = 'none';
    userInfoView.style.display = 'block';
});
// 2. Chuyển sang form Sửa & Bơm trạng thái ảo
btnShowEditForm.addEventListener('click', () => {
    if (!socket.connected) {
        alert("Bạn đang ở chế độ Offline. Vui lòng kết nối máy chủ để đổi thông tin!");
        return; 
    }
    userInfoView.style.display = 'none';
    userEditView.style.display = 'block';
    editProfileError.innerText = '';
    
    // Bơm thêm 1 lớp lịch sử ảo nữa cho màn hình "Chỉnh sửa"
    history.pushState({ popup: 'userEdit' }, "User Edit", "");
});

// 3. Đồng bộ nút X và nút Hủy thành thao tác "Quay lui" (Back)
closeUserModal.addEventListener('click', () => { history.back(); });
btnCancelEdit.addEventListener('click', () => { history.back(); });

// 4. Đăng xuất
function performSignOut() {
    localStorage.removeItem('caro_token');
    localStorage.removeItem('caro_username');
    localStorage.removeItem('caro_role'); 
    const adminBtn = document.getElementById('btnAdmin');  
    if (adminBtn) adminBtn.remove();  
    if (socket && typeof socket.disconnect === 'function') socket.disconnect();
    location.reload();
}

btnSignOut.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) performSignOut();
});

// 5. Gửi yêu cầu Cập nhật Tài khoản
editProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('newUsername').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();

    if (!newUsername && !newPassword) {
        editProfileError.style.color = '#e74c3c';
        editProfileError.innerText = 'Bạn chưa nhập thông tin gì mới!';
        return;
    }

    const currentToken = localStorage.getItem('caro_token');
    document.getElementById('btnSaveProfile').innerText = 'Đang lưu...';

    try {
        const response = await fetch(`${serverUrl}/api/auth/update`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}` // Nhét token vào Header
            },
            body: JSON.stringify({ newUsername, newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            editProfileError.style.color = '#2ecc71';
            editProfileError.innerText = 'Cập nhật thành công!';
            
            // Cập nhật lại Token và Username mới vào trình duyệt
            if (data.token) {
                localStorage.setItem('caro_token', data.token);
                localStorage.setItem('caro_username', data.username);
                localStorage.setItem('caro_role', data.role || 'user');
                checkAdminAccess(); 
                document.getElementById('modalUsername').innerText = data.username;
            }
            
            setTimeout(() => btnCancelEdit.click(), 1000); // Quay lại trang thông tin sau 1s
        } else {
            editProfileError.style.color = '#e74c3c';
            editProfileError.innerText = data.message;
        }
    } catch (error) {
        editProfileError.style.color = '#e74c3c';
        editProfileError.innerText = 'Lỗi kết nối máy chủ!';
    } finally {
        document.getElementById('btnSaveProfile').innerText = 'Lưu';
    }
});
// Hàm tính Ma trận và Render Lịch sử
function renderMatchHistoryAndMatrix(historyData) {
    // 1. TÍNH MA TRẬN
    const stats = {
        'PvP-3': { w:0, t:0 }, 'PvP-5': { w:0, t:0 },
        'PvE-E-3': { w:0, t:0 }, 'PvE-E-5': { w:0, t:0 },
        'PvE-M-3': { w:0, t:0 }, 'PvE-M-5': { w:0, t:0 },
        'PvE-H-3': { w:0, t:0 }, 'PvE-H-5': { w:0, t:0 }
    };
    historyContainer.innerHTML = '';
    if (historyData.length === 0) {
        historyContainer.innerHTML = '<p style="font-size:14px; text-align:center;">Chưa có dữ liệu trận đấu...</p>';
        return;
    }
    historyData.forEach(match => {
        // Cộng dồn tính Winrate
        let modeKey = `${match.mode}-${match.rule}`;
        if (stats[modeKey] !== undefined) {
            stats[modeKey].t++;
            if (match.result === 'WIN') stats[modeKey].w++;
        }

        // 2. VẼ LỊCH SỬ Giống VALORANT
        let colorClass = match.result === 'WIN' ? 'win' : (match.result === 'LOSE' ? 'lose' : 'draw');
        let statusText = match.result === 'WIN' ? 'THẮNG' : (match.result === 'LOSE' ? 'THUA' : 'HÒA');
        let eloText = match.elo_change > 0 ? `+${match.elo_change}` : match.elo_change;
        // Tách ghi chú xuống một hàng riêng biệt để không bao giờ bị đè lên tỉ số
        let noteHtml = match.note ? `
            <div style="color:#e74c3c; font-size:12px; text-align: right; font-style: italic; border-top: 1px dashed #ccc; padding-top: 6px; margin-top: 6px;">
                ⚠️ ${match.note}
            </div>
        ` : '';
        // Cấu trúc Flexbox mới: Chia 3 cột đều nhau (flex: 1) giúp Tỉ số luôn nằm CHÍNH GIỮA tuyệt đối
        let itemHTML = `
            <div class="history-item ${colorClass}" style="display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    
                    <div style="flex: 1; text-align: left;">
                        <span style="font-weight: bold;">${statusText}</span> <span style="font-size: 13px;">| ${match.mode}</span>
                        <div style="font-size: 12px; color: #555; margin-top: 2px;">Luật ${match.rule}</div>
                    </div>
                    <div style="flex: 1; text-align: center; font-weight: bold; font-size: 16px;">
                        ${match.score_me} - ${match.score_enemy}
                    </div>
                    <div style="flex: 1; text-align: right;">
                        <span style="font-weight: bold; font-size: 15px;">${eloText} ELO</span>
                    </div>
                </div>
                ${noteHtml}
                <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                    ${replayButtonHtml(match)}
                </div>
            </div>
        `;
        historyContainer.insertAdjacentHTML('beforeend', itemHTML);
    });

    // Cập nhật lên HTML Matrix
    for (let key in stats) {
        let formattedKey = key.toLowerCase().replace('pve-', 'pve'); 
        let el = document.getElementById(`wr-${formattedKey}`);    
        
        if (el) {
            let rate = stats[key].t === 0 ? 0 : parseFloat(((stats[key].w / stats[key].t) * 100).toFixed(2));
            el.innerText = `${rate}%`;
        }
    }
}
// ================= LOGIC TÌM KIẾM & RIÊNG TƯ =================
const btnTogglePrivacy = document.getElementById('btnTogglePrivacy');
const btnSearchUser = document.getElementById('btnSearchUser');
const searchUserInput = document.getElementById('searchUserInput');
const searchProfileModal = document.getElementById('searchProfileModal');
const closeSearchProfileModal = document.getElementById('closeSearchProfileModal');

// Nút X của hộp tìm kiếm -> Lùi về hộp Tài khoản
if (closeSearchProfileModal) {
    closeSearchProfileModal.addEventListener('click', () => { history.back(); });
}

// Hàm tính và nhồi dữ liệu chỉ cho Ma trận Tìm kiếm (Dùng ID có tiền tố s-)
function renderSearchedUserMatrix(historyData) {
    const stats = {
        'PvP-3': { w:0, t:0 }, 'PvP-5': { w:0, t:0 },
        'PvE-E-3': { w:0, t:0 }, 'PvE-E-5': { w:0, t:0 },
        'PvE-M-3': { w:0, t:0 }, 'PvE-M-5': { w:0, t:0 },
        'PvE-H-3': { w:0, t:0 }, 'PvE-H-5': { w:0, t:0 }
    };
    historyData.forEach(match => {
        let modeKey = `${match.mode}-${match.rule}`;
        if (stats[modeKey] !== undefined) {
            stats[modeKey].t++;
            if (match.result === 'WIN') stats[modeKey].w++;
        }
    });
    for (let key in stats) {
        // --- THÊM LỆNH REPLACE TƯƠNG TỰ ---
        let formattedKey = key.toLowerCase().replace('pve-', 'pve');
        let el = document.getElementById(`s-wr-${formattedKey}`);
        
        if (el) {
            let rate = stats[key].t === 0 ? 0 : parseFloat(((stats[key].w / stats[key].t) * 100).toFixed(2));
            el.innerText = `${rate}%`;
        }
    }
}
// Render khu vực Tỉ lệ thắng + Lịch sử đấu của hồ sơ người khác
// Logic: nếu private và !isAdmin → ẩn hết, hiện dòng "Tài khoản riêng tư"
//        nếu công khai HOẶC admin → hiện đầy đủ matrix + history
function renderSearchedProfile(data) {
    const matrixContainer = document.querySelector('#searchProfileModal .winrate-matrix');
    const matrixHeading = matrixContainer ? matrixContainer.previousElementSibling : null; // <h3>Tỉ lệ thắng</h3>
    const matrixHr = matrixHeading ? matrixHeading.previousElementSibling : null;          // <hr>
    const historyBlock = document.getElementById('searchedHistoryBlock');
    
    const isPrivate = data.isPrivate;
    const isAdmin = data.isAdminViewer;
    const showFullInfo = !isPrivate || isAdmin;
    
    if (!showFullInfo) {
        // Private + người thường: ẩn matrix, thay bằng dòng thông báo
        if (matrixContainer) matrixContainer.style.display = 'none';
        if (matrixHeading && matrixHeading.tagName === 'H3') matrixHeading.style.display = 'none';
        if (matrixHr && matrixHr.tagName === 'HR') matrixHr.style.display = 'none';
        
        if (historyBlock) {
            historyBlock.innerHTML = `
                <hr style="border-color: #ccc; margin: 15px 0;">
                <p style="font-size: 14px; color: #7f8c8d; margin: 20px 0; text-align: center; font-style: italic;">
                    🔒 Tài khoản này ở chế độ riêng tư
                </p>
            `;
        }
        return;
    }
    
    // Công khai HOẶC admin: hiện matrix + history đầy đủ
    if (matrixContainer) matrixContainer.style.display = '';
    if (matrixHeading && matrixHeading.tagName === 'H3') matrixHeading.style.display = '';
    if (matrixHr && matrixHr.tagName === 'HR') matrixHr.style.display = '';
    
    // Render matrix tỉ lệ thắng (dùng hàm có sẵn)
    renderSearchedUserMatrix(data.history);
    
    // Render lịch sử đấu (chỉ thêm nhãn "Admin view" nếu là admin xem private)
    const isAdminViewingPrivate = isAdmin && isPrivate;
    renderSearchedHistoryList(data.history, isAdminViewingPrivate);
}

// Render danh sách lịch sử đấu (luôn hiển thị, chỉ thêm nhãn Admin nếu cần)
function renderSearchedHistoryList(historyData, isAdminViewingPrivate) {
    const block = document.getElementById('searchedHistoryBlock');
    if (!block) return;
    
    const headingSuffix = isAdminViewingPrivate ? ' (Admin view)' : '';
    
    if (!historyData || historyData.length === 0) {
        block.innerHTML = `
            <hr style="border-color: #ccc; margin: 15px 0;">
            <h3 style="font-size: 15px; text-align: left; margin: 0 0 10px 0;">📋 Lịch sử đấu${headingSuffix}</h3>
            <p style="font-size: 13px; color: #7f8c8d; font-style: italic;">Người chơi này chưa có trận đấu nào.</p>
        `;
        return;
    }
    
    let html = `
        <hr style="border-color: #ccc; margin: 15px 0;">
        <h3 style="font-size: 15px; text-align: left; margin: 0 0 10px 0;">
            📋 Lịch sử đấu${headingSuffix} — ${historyData.length} trận
        </h3>
        <div style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 5px;">
    `;
    
    historyData.forEach(m => {
        const resultClass = m.result === 'WIN' ? 'win' : (m.result === 'LOSE' ? 'lose' : 'draw');
        const resultText = m.result === 'WIN' ? 'Thắng' : (m.result === 'LOSE' ? 'Thua' : 'Hòa');
        const resultColor = m.result === 'WIN' ? '#2ecc71' : (m.result === 'LOSE' ? '#e74c3c' : '#95a5a6');
        const time = new Date(m.created_at).toLocaleString('vi-VN');
        const eloChange = m.elo_change > 0 ? `+${m.elo_change}` : (m.elo_change || 0);
        const eloColor = m.elo_change > 0 ? '#2ecc71' : (m.elo_change < 0 ? '#e74c3c' : '#95a5a6');
        
        html += `
            <div class="history-item ${resultClass}" style="font-size: 12px;">
                <div style="text-align: left; flex: 1;">
                    <strong style="color:${resultColor};">${resultText}</strong>
                    vs <strong>${escapeHtml(m.opponent_name || '?')}</strong>
                    <span style="color:#7f8c8d;"> | ${m.mode}-${m.rule}</span>
                    <br>
                    <span style="color:#7f8c8d; font-size: 11px;">${time}</span>
                    ${m.note ? ` <span style="color:#e74c3c; font-size: 11px;">| ${escapeHtml(m.note)}</span>` : ''}
                </div>
                <div style="text-align: right;">
                    <span style="color:${eloColor}; font-weight: bold;">${eloChange} ELO</span>
                    <br>
                    <span style="color:#7f8c8d; font-size: 11px;">${m.score_me || 0} - ${m.score_enemy || 0}</span>
                    <br>
                    ${replayButtonHtml(m)}
                </div>
            </div>
        `;
    });
    html += '</div>';
    block.innerHTML = html;
}
let isPrivate = false;

// 1. GỌI API ẨN TÀI KHOẢN
if (btnTogglePrivacy) {
    btnTogglePrivacy.addEventListener('click', async () => {
        if (!socket.connected) { alert('Mất kết nối mạng!'); return; }
        
        try {
            const currentToken = localStorage.getItem('caro_token');
            const res = await fetch(`${serverUrl}/api/user/privacy`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const data = await res.json();
            
            if (res.ok) {
                isPrivate = data.is_private;
                if (isPrivate) {
                    btnTogglePrivacy.innerText = 'Đã ẩn';
                    btnTogglePrivacy.style.backgroundColor = '#ecf0f1';
                } else {
                    btnTogglePrivacy.innerText = 'Công khai';
                    btnTogglePrivacy.style.backgroundColor = '#f3f4f6';
                }
            }
        } catch (error) { console.log("Lỗi đổi quyền riêng tư", error); }
    });
}

// 2. GỌI API TÌM KIẾM NGƯỜI CHƠI
if (btnSearchUser) {
    btnSearchUser.addEventListener('click', async () => {
        const query = searchUserInput.value.trim();
        if (!query) return;
        
        btnSearchUser.innerText = '...';
        btnSearchUser.disabled = true;

        try {
            const res = await fetch(`${serverUrl}/api/user/search?username=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('caro_token')}` }
            });
            const data = await res.json();

            if (res.ok) {
                // Tên + ELO luôn hiển thị (không phụ thuộc private)
                document.getElementById('searchedUsername').innerText = data.username;
                document.getElementById('searchedElo').innerText = data.elo;
                
                // Render matrix + history dựa trên cờ isPrivate và isAdminViewer
                renderSearchedProfile(data);
                
                // Chuyển cảnh
                userModal.style.display = 'none';
                searchProfileModal.style.display = 'flex';
                
                // Bơm lịch sử ảo để Vuốt lùi (Back) chuẩn xác
                history.pushState({ popup: 'searchProfile' }, "Search Profile", "");
            } else {
                alert(data.message);
            }
        } catch (error) {
            alert('Lỗi kết nối máy chủ!');
        } finally {
            btnSearchUser.innerText = 'Tìm';
            btnSearchUser.disabled = false;
        }
    });
}
if (searchUserInput) {
    searchUserInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnSearchUser.click();
        }
    });
}
// Hàm gom toàn bộ các sự kiện Socket của Gameplay
// CHỐNG ĐĂNG KÝ TRÙNG: sự kiện 'connect' của socket.io kích hoạt lại mỗi lần
// tự kết nối lại (reconnect). Nếu không chặn, mỗi reconnect sẽ socket.on(...)
// thêm 1 lần nữa → 1 tin nhắn bị nhận 2, 3... lần. Chỉ đăng ký listener 1 lần.
let socketEventsBound = false;
function setupSocketEvents() {
    if (socketEventsBound) return;
    socketEventsBound = true;

    if (typeof setupChatSocketListeners === 'function') setupChatSocketListeners();
    if (typeof setupChallengeSocketListeners === 'function') setupChallengeSocketListeners();
    
    socket.on('room_created', (roomCode) => {   
        pvpStatus.innerText = `Đã tạo phòng! Mã của bạn là: ${roomCode}. Đợi đối thủ...`;
        pvpStatus.style.color = "#2ecc71";
    });
    socket.on('room_error', (msg) => {
    pvpStatus.innerText = msg;
    pvpStatus.style.color = "#e74c3c"; 
    });
    socket.on('match_found', (data) => {
    pvpStatus.innerText = "Đã tìm thấy đối thủ! Trận đấu bắt đầu...";
    pvpStatus.style.color = "#2ecc71";
    
    // Nếu trận này đến từ thách đấu trực tiếp (mình đang ở waiting modal),
    // đóng modal đó và clear state challenge
    if (currentSentChallengeId !== null) {
        currentSentChallengeId = null;
        if (typeof hideChallengeWaitingModal === 'function') hideChallengeWaitingModal();
    }
    
    // Đợi 1 giây rồi ẩn Popup và nhảy vào bàn cờ
    setTimeout(() => {
        pvpModal.style.display = 'none';
        startOnlineMatch(data);
        // Bơm lịch sử ảo để nút Back của trình duyệt không thoát thẳng ra ngoài game
        if (typeof pushFakeHistory === 'function') pushFakeHistory();
    }, 1000);
    });
    socket.on('receive_move', (data) => {
        // --- 3. MỞ KHÓA KHI SERVER ĐÃ XÁC NHẬN ---
        isWaitingForNetwork = false; 
        processMove(data.coords);
    });
    socket.on('opponent_surrendered', () => {
        // Khán giả: chỉ hiển thị thông báo, không tính điểm
        if (isSpectating) {
            gameActive = false;
            statusMessage.innerText = "Một người chơi đã đầu hàng. Ván đấu kết thúc.";
            statusMessage.style.color = "#f39c12";
            return;
        }
        // GUARD: Chống race condition - nếu game đã kết thúc rồi (do disconnect đến trước)
        // thì không xử lý lần thứ 2 để tránh cộng điểm/lưu ELO 2 lần
        if (!gameActive) return;

        // KIỂM TRA ĐIỀU KIỆN REMAKE (Chống Buff bẩn)
        if (scorePlayer === 0 && scoreBot === 0 && boardData.size === 0) {
            statusMessage.innerText = "Đối thủ đã hủy ván (Chưa đánh quân nào)!";
            statusMessage.style.color = "#f39c12";
            gameActive = false;
            
            finalizeMatchSession(); // Hủy ván, không lưu gì cả
        } else {
            // ĐỐI THỦ ĐẦU HÀNG HỢP LỆ (Mình được cộng điểm)
            statusMessage.innerText = "Đối thủ đã tháo chạy! BẠN THẮNG!";
            statusMessage.style.color = "#2ecc71";
            gameActive = false;
            
            scorePlayer++;
            scorePlayerEl.innerText = scorePlayer;
            syncSpectatorScore();
            finalizeMatchSession('WIN', false, 'Đối thủ Đầu hàng');
        }

        startCountdownToMenu(3); // KÍCH HOẠT ĐẾM NGƯỢC
    });
    socket.on('opponent_disconnected', () => {
        // Khán giả: chỉ hiển thị thông báo. Server sẽ gửi spectate_room_closing
        // khi CẢ HAI người chơi đã rời.
        if (isSpectating) {
            gameActive = false;
            statusMessage.innerText = "Một người chơi đã rời phòng.";
            statusMessage.style.color = "#f39c12";
            return;
        }
        isOpponentPresent = false;

        if (gameActive) {
            // NẾU CHƯA AI ĐÁNH QUÂN NÀO (Remake - Hủy ván đấu)
            if (boardData.size === 0) {
                statusMessage.innerText = "Đối thủ đã rời phòng (Chưa đánh)!";
                statusMessage.style.color = "#f39c12"; // Màu vàng
                gameActive = false;
                
                finalizeMatchSession(); // Chốt sổ theo tỉ số cũ (nếu đang ở ván 2, 3), không phạt
            } 
            // NẾU ĐANG ĐÁNH DỞ (Bị phạt AFK)
            else {
                statusMessage.innerText = "Đối thủ đã ngắt kết nối! BẠN THẮNG!";
                statusMessage.style.color = "#2ecc71";
                gameActive = false;
                scorePlayer++; scorePlayerEl.innerText = scorePlayer;
                syncSpectatorScore();

                finalizeMatchSession('WIN', false, 'Đối thủ AFK');
            }
            startCountdownToMenu(3);
        } else {
            // NẾU ĐÃ CÓ TỈ SỐ VÀ ĐANG CHỜ TÁI ĐẤU (Xem như từ chối tái đấu)
            statusMessage.innerText = "Đối thủ đã rời khỏi phòng (Từ chối tái đấu)!";
            statusMessage.style.color = "#e74c3c";
            if(restartBtn) restartBtn.style.display = 'none'; 
            
            finalizeMatchSession(); // Chốt sổ series hòa bình
            startCountdownToMenu(3);
        }
    });
    socket.on('rematch_requested', () => {
    if (!isOnline) return;
    statusMessage.innerText = "Đối thủ muốn tái đấu! Bạn có đồng ý không?";
    statusMessage.style.color = "#f1c40f";
    
    restartBtn.style.display = 'none'; // Giấu nút yêu cầu của mình đi
    btnBack.style.display = 'none'; // Giấu nút thoát
    rematchControls.style.display = 'flex'; // Hiện 2 nút Đồng Ý / Từ Chối
    });
    socket.on('rematch_declined', () => {
    if (isSpectating) return;
    statusMessage.innerText = "Đối thủ đã từ chối tái đấu!";
    statusMessage.style.color = "#e74c3c";
    finalizeMatchSession();
    startCountdownToMenu(3); // Tự động thoát về Menu
    });
    socket.on('start_rematch', () => {
        // Khán giả: reset bàn cờ cho ván mới, đảo người cầm X
        if (isSpectating) {
            specHostIsX = !specHostIsX;
            gameActive = true;
            currentPlayer = 'X';
            boardData.clear();
            historyX = [];
            historyO = [];
            winningCells = [];
            lastMoveKey = null;
            player1NameEl.innerText = `${specP1Name} (${specHostIsX ? 'X' : 'O'})`;
            player2NameEl.innerText = `${specP2Name} (${specHostIsX ? 'O' : 'X'})`;
            drawBoard();
            const turnName = specHostIsX ? specP1Name : specP2Name;
            statusMessage.innerText = `Ván mới! Lượt của ${turnName} (X)`;
            statusMessage.style.color = "#000";
            return;
        }
        // Chốt ván vừa kết thúc vào replay trước khi sang ván tái đấu
        commitCurrentGame();
        // 1. Đổi Role (X thành O, O thành X)
        playerRole = (playerRole === 'X') ? 'O' : 'X';

        // 2. Setup lại bàn cờ Canvas Vô Hạn (Xóa sạch tàn dư board và cells)
        gameActive = true;
        currentPlayer = 'X'; 
        boardData.clear();
        historyX = []; // Bổ sung
        historyO = []; // Bổ sung
        winningCells = []; // Xóa đường thắng
        lastMoveKey = null;
        drawBoard();       // Vẽ lại một bàn cờ trắng tinh

        // 3. Reset lại UI
        if(rematchControls) rematchControls.style.display = 'none';
        if(restartBtn) restartBtn.style.display = 'none';    
        if(btnBack) btnBack.style.display = 'none';
        if(btnSurrender) btnSurrender.style.display = 'block'; 

        // 4. Thông báo chuẩn xác
        if (playerRole === 'X') {
            statusMessage.innerText = "Ván mới! Bạn cầm (X) đi trước.";
            statusMessage.style.color = "#000";
        } else {
            statusMessage.innerText = "Ván mới! Đang chờ đối thủ cầm (X) đánh...";
            statusMessage.style.color = "#000";
        }
    });

    // ===== SOCKET LISTENERS CHO TÍNH NĂNG DỰ KHÁN =====
    socket.on('spectate_started', (data) => {
        startSpectating(data);
    });
    socket.on('spectate_error', (msg) => {
        const el = document.getElementById('spectateStatus');
        if (el) {
            el.innerText = msg;
            el.style.color = '#e74c3c';
        }
    });
    socket.on('spectate_room_closing', (data) => {
        if (!isSpectating) return;
        startSpectateCountdown((data && data.seconds) || 3);
    });
    socket.on('spectate_ended', () => {
        if (!isSpectating) return;
        exitSpectate();
    });
    // Cập nhật tỉ số series do người chơi đồng bộ lên
    socket.on('score_update', (data) => {
        if (!isSpectating || !data) return;
        scorePlayer = data.scoreHost || 0;
        scoreBot = data.scoreGuest || 0;
        scorePlayerEl.innerText = scorePlayer;
        scoreBotEl.innerText = scoreBot;
    });
}
// ================= 2. HỆ THỐNG DOM =================
const mainMenu = document.getElementById('mainMenu');
const gameScreen = document.getElementById('gameScreen');
const btnPvE = document.getElementById('btnPvE');
const btnBack = document.getElementById('btnBack');
const botDifficulty = document.getElementById('botDifficulty');
const botDifficultyContainer = document.getElementById('botDifficultyContainer');
const scorePlayerEl = document.getElementById('scorePlayer');
const scoreBotEl = document.getElementById('scoreBot');
const statusMessage = document.getElementById('statusMessage');
const restartBtn = document.getElementById('restartBtn');
const player1NameEl = document.getElementById('player1Name');
const player2NameEl = document.getElementById('player2Name');
const btnSurrender = document.getElementById('btnSurrender');
const rematchControls = document.getElementById('rematchControls');
const btnAcceptRematch = document.getElementById('btnAcceptRematch');
const btnDeclineRematch = document.getElementById('btnDeclineRematch');
let isOnline = false;
let isPvE = false;
const winConditionSelect = document.getElementById('winConditionSelect');

if (winConditionSelect) {
    winConditionSelect.addEventListener('change', (e) => {
        winCondition = parseInt(e.target.value);
        
        // 1. Ép khuôn bàn cờ NGAY LẬP TỨC
        if (winCondition === 3) {
            minX = -1; maxX = 1; 
            minY = -1; maxY = 1;
        } else {
            minX = -8; maxX = 8; 
            minY = -8; maxY = 8;
        }

        // 2. Dọn dẹp tàn tích
        //scorePlayer = 0; scoreBot = 0;
        //scorePlayerEl.innerText = '0'; scoreBotEl.innerText = '0';
        boardData.clear();
        historyX = []; // Bổ sung
        historyO = []; // Bổ sung
        winningCells = [];
        lastMoveKey = null;
        gameActive = false; 
        
        if (restartBtn && !isOnline) {
            restartBtn.innerText = "Bắt đầu";
        }

        // 3. Khóa Camera và Vẽ lại lưới lập tức
        resizeCanvas();
        
        statusMessage.innerText = `Đã chuyển sang Luật ${winCondition} quân. Bấm Bắt đầu!`;
        statusMessage.style.color = "#000";
    });
}

// ================= 3. XỬ LÝ MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ =================
const authScreen = document.getElementById('authScreen');
const authTitle = document.getElementById('authTitle');
const authForm = document.getElementById('authForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const btnSubmitAuth = document.getElementById('btnSubmitAuth');
const authError = document.getElementById('authError');
const authToggleText = document.getElementById('authToggleText');
const btnToggleAuth = document.getElementById('btnToggleAuth');

let isLoginMode = true; 

// 3.1. Logic chuyển đổi UI
btnToggleAuth.addEventListener('click', (e) => {
    e.preventDefault(); 
    isLoginMode = !isLoginMode; 
    
    authError.innerText = ''; 
    usernameInput.value = '';
    passwordInput.value = '';

    if (isLoginMode) {
        authTitle.innerText = 'Đăng Nhập';
        btnSubmitAuth.innerText = 'Vào Game';
        authToggleText.innerText = 'Chưa có tài khoản?';
        btnToggleAuth.innerText = 'Đăng ký ngay';
    } else {
        authTitle.innerText = 'Đăng Ký Tài Khoản';
        btnSubmitAuth.innerText = 'Tạo Tài Khoản';
        authToggleText.innerText = 'Đã có tài khoản?';
        btnToggleAuth.innerText = 'Đăng nhập ngay';
    }
});

// 3.2. Logic gửi dữ liệu lên Server
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        authError.style.color = '#e74c3c';
        authError.innerText = 'Vui lòng nhập đầy đủ thông tin!';
        return;
    }

    btnSubmitAuth.disabled = true;
    btnSubmitAuth.innerText = 'Đang xử lý...';

    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    
    try {
        const response = await fetch(`${serverUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (!isLoginMode) {
                authError.style.color = '#2ecc71'; 
                authError.innerText = 'Đăng ký thành công! Vui lòng đăng nhập.';
                btnToggleAuth.click(); 
            } else {
                localStorage.setItem('caro_token', data.token);
                localStorage.setItem('caro_username', data.username);
                localStorage.setItem('caro_role', data.role || 'user');  // ← THÊM
                
                authScreen.style.display = 'none';
                mainMenu.style.display = 'block';
                
                if (userProfileBtn) userProfileBtn.style.display = 'flex';  // ← THÊM
                checkAdminAccess();  // ← THÊM
                
                // Kích hoạt đường ống mạng ngay khi đăng nhập xong!
                initSocket(data.token);
            }
        } else {
            authError.style.color = '#e74c3c'; 
            authError.innerText = data.message || 'Có lỗi xảy ra!';
        }
    } catch (error) {
        authError.style.color = '#e74c3c';
        authError.innerText = 'Máy chủ đang tắt hoặc không phản hồi!';
    } finally {
        btnSubmitAuth.disabled = false;
        btnSubmitAuth.innerText = isLoginMode ? 'Vào Game' : 'Tạo Tài Khoản';
    }
});
// ================= 4. KIỂM TRA TRẠNG THÁI LÚC VỪA MỞ WEB =================
if (token) {
    // Nếu có token (đã đăng nhập) -> Bật Socket
    initSocket(token);
    authScreen.style.display = 'none';
    mainMenu.style.display = 'block';
    
    // HIỆN NÚT TÀI KHOẢN NGAY LẬP TỨC (DÙ SERVER ĐANG TẮT)
    if (userProfileBtn) userProfileBtn.style.display = 'flex';
    
    checkAdminAccess(); 
} else {
    // Nếu chưa có token -> Hiện màn hình Đăng nhập
    authScreen.style.display = 'flex';
    mainMenu.style.display = 'none';
    if (userProfileBtn) userProfileBtn.style.display = 'none';
}
// ================= BIẾN TRẠNG THÁI =================
let scorePlayer = 0;
let scoreBot = 0;
let playerRole = null; 
let botRole = null;
let currentPlayer = 'X'; 
let gameActive = false;
let isBotThinking = false;
let currentRoom = ""; 
let isOpponentPresent = true; 
let isRankedMatch = false;
let isWaitingForNetwork = false;
// ===== STATE CHO TÍNH NĂNG DỰ KHÁN (SPECTATOR) =====
let isSpectating = false;        // đang ở chế độ dự khán
let specP1Name = '';             // tên người tạo phòng (host)
let specP2Name = '';             // tên người vào phòng (guest)
let specHostIsX = true;          // host hiện đang cầm X hay không
let spectateCountdownTimer = null;
let amIHost = false;             // trong trận online, mình có phải người tạo phòng không

// Gửi tỉ số series tuyệt đối (host/guest) lên server để khán giả nắm được.
// Cả 2 người chơi đều gọi → server nhận giá trị giống nhau (idempotent).
function syncSpectatorScore() {
    if (!isOnline || isSpectating) return;
    if (!socket || !socket.connected || !currentRoom) return;
    const payload = amIHost
        ? { room: currentRoom, scoreHost: scorePlayer, scoreGuest: scoreBot }
        : { room: currentRoom, scoreHost: scoreBot, scoreGuest: scorePlayer };
    socket.emit('score_update', payload);
}

// ===== STATE CHO TÍNH NĂNG REPLAY (LƯU NƯỚC CỜ) =====
let replayGames = [];        // các ván đã hoàn tất trong loạt trận hiện tại
let currentGameMoves = [];   // nước cờ của ván đang đánh dở

// Chốt ván hiện tại vào danh sách (gọi khi 1 ván kết thúc, sắp sang ván mới)
function commitCurrentGame() {
    if (currentGameMoves.length > 0) {
        replayGames.push(currentGameMoves);
        currentGameMoves = [];
    }
}
// Xoá sạch dữ liệu replay (gọi khi bắt đầu một loạt trận mới)
function resetReplayCapture() {
    replayGames = [];
    currentGameMoves = [];
}
// Gửi replay lên server sau khi trận đã được ghi vào match_history
async function saveReplay(historyId) {
    commitCurrentGame(); // chốt nốt ván cuối cùng
    if (!historyId || replayGames.length === 0) return;
    try {
        const token = localStorage.getItem('caro_token');
        await fetch(`${serverUrl}/api/replay/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ matchHistoryId: historyId, moves: replayGames }),
            keepalive: true
        });
    } catch (err) { console.error('Lỗi lưu replay:', err); }
}

// Biến dành riêng cho Local PvP eSports
let localP1Name = "Người chơi 1";
let localP2Name = "Người chơi 2";
let localP1Role = 'X'; // P1 mặc định cầm X ở ván đầu

let isCtrlDown = false; // Biến theo dõi trạng thái phím Ctrl

// ================= BÀN CỜ VÔ HẠN (CANVAS CORE) =================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let cellSize = 40; // Độ rộng 1 ô lưới
let cameraOffset = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let hasDragged = false;

// Dữ liệu Bàn cờ Mới: Map lưu tọa độ "x,y" => "X" hoặc "O"
let boardData = new Map(); 
let winningCells = []; // Mảng lưu các tọa độ "x,y" tạo thành đường chiến thắng
// THÊM: lưu key "x,y" của ô vừa được đánh gần nhất (Luật 5 PvP online)
let lastMoveKey = null;
let winCondition = 5; // Mặc định là thắng 5

// --- MỚI: QUẢN LÝ LUẬT 3 TÀNG HÌNH ---
let historyX = []; // Hàng đợi lưu tọa độ các quân cờ của X
let historyO = []; // Hàng đợi lưu tọa độ các quân cờ của O
let blinkState = true; 

// Nhịp tim của Canvas: Chớp tắt quân cờ mỗi 500ms (chỉ hoạt động khi đang chơi Luật 3)
// Nếu không phải luật 3 hoặc game không active, interval vẫn check nhanh rồi return,
// không vẽ lại nên không tốn CPU.
setInterval(() => {
    if (winCondition === 3 && gameActive) {
        // Chỉ blink khi có ít nhất 3 quân của 1 bên (sắp biến mất)
        if (historyX.length === 3 || historyO.length === 3) {
            blinkState = !blinkState;
            drawBoard(); // Vẽ lại liên tục để tạo hiệu ứng
        }
    }
}, 500);

// Giới hạn Camera (Khởi đầu là khung -8 đến 8)
let minX = -8, maxX = 8, minY = -8, maxY = 8;

// Hàm cơi nới bàn cờ độc lập các hướng (Ngưỡng nguy hiểm: 2 ô, Mở rộng: 4 ô)
// Lưu ý: hàm này KHÔNG tự vẽ lại canvas - người gọi (processMove) sẽ vẽ cuối cùng
// để tránh vẽ trùng 2 lần trong cùng một bước đánh.
function expandBoardIfNeeded(x, y) {
    if (winCondition === 3) return; // KHÓA CỨNG: Luật 3 không bao giờ cơi nới bàn cờ
    
    const threshold = 2; // Ngưỡng nguy hiểm
    const expandSize = 4; // Số ô sẽ nới thêm khi chạm ngưỡng
    let isExpanded = false;
    // Chỉ nới rộng về hướng mà người chơi đánh tới
    if (x <= minX + threshold) { minX -= expandSize; isExpanded = true; }
    if (x >= maxX - threshold) { maxX += expandSize; isExpanded = true; }
    if (y <= minY + threshold) { minY -= expandSize; isExpanded = true; }
    if (y >= maxY - threshold) { maxY += expandSize; isExpanded = true; }
    if (isExpanded) {
        clampCamera();
    }
}
function resizeCanvas() {
    if (gameScreen.style.display !== 'none') {
        let size = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.65);
        if (size > 500) size = 500;
        // Khi khung chat hiển thị cạnh bàn cờ trên PC (không phải mobile),
        // thu nhỏ bàn cờ vừa đủ để chừa chỗ cho khung chat (320px + lề ~20px).
        // Bàn cờ canh giữa nên cần W ≤ innerWidth - (2 × 320 + lề) ≈ innerWidth - 700.
        if (chatCurrentRoom && !isMobileView()) {
            const maxWithChat = window.innerWidth - 700;
            if (size > maxWithChat) size = maxWithChat;
            if (size < 200) size = 200; // sàn an toàn, tránh bàn cờ kích thước âm
        }
        canvas.width = size;
        canvas.height = size;
        if (winCondition === 3) {
            cellSize = canvas.width / 3; // Lưới 3 ô lấp đầy chiều rộng
        } else {
            cellSize = 40; // Trả về mặc định 40px cho bàn cờ vô hạn
        }
        cameraOffset.x = canvas.width / 2;
        cameraOffset.y = canvas.height / 2;
        clampCamera();
        drawBoard();
        // Khung chat luôn bám sát bàn cờ sau mỗi lần đổi kích thước
        if (typeof positionChatBesideCanvas === 'function') positionChatBesideCanvas();
    }
}
window.addEventListener('resize', resizeCanvas);

// Hàm Vẽ Bàn Cờ (Đã sửa lỗi "Lưới Ma")
function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. CHỈ VẼ LƯỚI TRONG KHU VỰC GIỚI HẠN (minX -> maxX, minY -> maxY)
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Nét dọc
    for (let x = minX; x <= maxX + 1; x++) {
        let xPos = x * cellSize + cameraOffset.x;
        let yStart = minY * cellSize + cameraOffset.y;
        let yEnd = (maxY + 1) * cellSize + cameraOffset.y;
        ctx.moveTo(xPos, yStart); ctx.lineTo(xPos, yEnd);
    }
    // Nét ngang
    for (let y = minY; y <= maxY + 1; y++) {
        let yPos = y * cellSize + cameraOffset.y;
        let xStart = minX * cellSize + cameraOffset.x;
        let xEnd = (maxX + 1) * cellSize + cameraOffset.x;
        ctx.moveTo(xStart, yPos); ctx.lineTo(xEnd, yPos);
    }
    ctx.stroke();

    // 2. Vẽ Quân cờ (Màu sắc Đỏ / Xanh / Trắng chuẩn UX)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // --- THAY ĐỔI: Kích thước chữ luôn bằng 70% kích thước ô cờ ---
    let fontSize = Math.floor(cellSize * 0.7);
    ctx.font = `bold ${fontSize}px Arial`;
    // Một chút căn chỉnh quang học (Optical Adjustment) để chữ rơi vào chính tâm
    let textOffsetY = Math.floor(cellSize * 0.05); 

    boardData.forEach((player, key) => {
        const [cx, cy] = key.split(',').map(Number);
        const px = cx * cellSize + cameraOffset.x;
        const py = cy * cellSize + cameraOffset.y;
        
        if (px < -cellSize || px > canvas.width || py < -cellSize || py > canvas.height) return;
        const isWinCell = winningCells.includes(key);
        // THÊM: kiểm tra có phải nước cờ cuối không (chỉ áp dụng Luật 5 PvP online)
        const isLastMove = (winCondition === 5 && (isOnline || isPvE || isSpectating) && key === lastMoveKey && !isWinCell);
        
        if (isWinCell) {
            // Ô thuộc đường thắng → tô nền xanh lục (logic cũ, giữ nguyên)
            ctx.fillStyle = (player === 'X') ? '#e74c3c' : '#2ecc71'; 
            ctx.fillRect(px, py, cellSize, cellSize);
        } else if (isLastMove) {
            // HIGHLIGHT NƯỚC CỜ CUỐI CÙNG: viền xanh dương đè trực tiếp lên viền gốc của ô
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;
            // Vẽ rect đúng vị trí lưới — không offset, không thu nhỏ
            // Để viền xanh phủ chính xác đường lưới xám đã vẽ trước đó
            ctx.strokeRect(px + 0.5, py + 0.5, cellSize, cellSize);
        }

        if (isWinCell) {
            ctx.fillStyle = '#ffffff'; 
        } else {
            ctx.fillStyle = (player === 'X') ? '#e74c3c' : '#2ecc71'; 
            
            if (winCondition === 3 && gameActive) {
                let history = (player === 'X') ? historyX : historyO;
                if (history.length === 3 && history[0] === key) {
                    ctx.globalAlpha = blinkState ? 0.2 : 1.0; 
                }
            }
        }
        
        ctx.fillText(player, px + cellSize / 2, py + cellSize / 2 + textOffsetY);
        ctx.globalAlpha = 1.0; 
    });
}

// 4. Giới hạn Camera (Khóa CHẶT mép lưới vào mép màn hình, KHÔNG CÓ KHOẢNG TRẮNG)
function clampCamera() {
    // Ranh giới lưới cờ tính bằng Pixel (Tuyệt đối không cộng thêm padding nữa)
    const gridLeft = minX * cellSize;
    const gridRight = (maxX + 1) * cellSize;
    const gridTop = minY * cellSize;
    const gridBottom = (maxY + 1) * cellSize;

    const gridWidth = gridRight - gridLeft;
    const gridHeight = gridBottom - gridTop;
    // --- Xử lý trục X ---
    if (gridWidth >= canvas.width) {
        // Lưới to hơn màn hình -> Khóa kịch mép
        const maxOffsetX = -gridLeft;
        const minOffsetX = canvas.width - gridRight;
        if (cameraOffset.x > maxOffsetX) cameraOffset.x = maxOffsetX;
        if (cameraOffset.x < minOffsetX) cameraOffset.x = minOffsetX;
    } else {
        // Lưới nhỏ hơn màn hình -> Ép vào giữa trung tâm
        cameraOffset.x = (canvas.width - gridWidth) / 2 - gridLeft;
    }
    // --- Xử lý trục Y ---
    if (gridHeight >= canvas.height) {
        const maxOffsetY = -gridTop;
        const minOffsetY = canvas.height - gridBottom;
        if (cameraOffset.y > maxOffsetY) cameraOffset.y = maxOffsetY;
        if (cameraOffset.y < minOffsetY) cameraOffset.y = minOffsetY;
    } else {
        cameraOffset.y = (canvas.height - gridHeight) / 2 - gridTop;
    }
}
// Biến toàn cục lưu vị trí chuột (BẮT BUỘC ĐỂ NGOÀI HÀM)
let currentMousePos = { x: 0, y: 0 }; 

// 5. Bắt sự kiện Kéo / Vuốt (Mouse & Touch)
function handlePointerDown(x, y) {
    isDragging = true;
    hasDragged = false; 
    dragStart.x = x - cameraOffset.x;
    dragStart.y = y - cameraOffset.y;
}

function handlePointerMove(x, y) {
    if (!isDragging) return;
    if (winCondition === 3) return;
    
    // Sau khi đã xác định là drag (hasDragged=true) → CỨ kéo camera mỗi frame
    if (hasDragged) {
        cameraOffset.x = x - dragStart.x;
        cameraOffset.y = y - dragStart.y;
        clampCamera(); 
        drawBoard();
        return;
    }
    
    // Chưa xác định là drag → kiểm tra ngưỡng từ điểm chạm BAN ĐẦU
    // dragStart đã lưu (touchX_start - cameraOffset_old.x), 
    // nên độ di chuyển thật = |x_now - (dragStart.x + cameraOffset_old.x)|
    // Tương đương: |(x_now - cameraOffset_old.x) - dragStart.x|
    // Lúc này cameraOffset CHƯA bị update → công thức đúng
    const moveX = Math.abs(x - cameraOffset.x - dragStart.x);
    const moveY = Math.abs(y - cameraOffset.y - dragStart.y);
    
    if (moveX > 15 || moveY > 15) {
        hasDragged = true;
        // Bắt đầu kéo camera ngay từ frame này
        cameraOffset.x = x - dragStart.x;
        cameraOffset.y = y - dragStart.y;
        clampCamera(); 
        drawBoard();
    }
    // Chưa vượt ngưỡng → không làm gì → ngón tay rung nhẹ vẫn tap được
}

// --- CHẶN MENU CHUỘT PHẢI MẶC ĐỊNH ---
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
    // Hỗ trợ cả Ctrl (Windows/Linux) và Cmd/Meta (Mac)
    if ((e.key === 'Control' || e.key === 'Meta') && !e.repeat) {
        isCtrlDown = true;
        canvas.style.cursor = 'grabbing';
        
        // TỰ ĐỘNG KÍCH HOẠT: Ngay khi nhấn Ctrl, bắt đầu trạng thái kéo luôn
        // Dùng vị trí chuột hiện tại để làm điểm neo (dragStart)
        handlePointerDown(currentMousePos.x, currentMousePos.y);
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlDown = false;
        isDragging = false; // Ngừng kéo ngay khi nhả Ctrl
        canvas.style.cursor = 'grab';
    }
});

// Bảo vệ: Nếu đang giữ Ctrl mà tab bị mất tập trung (ví dụ Alt+Tab) thì tự reset
window.addEventListener('blur', () => {
    isCtrlDown = false;
    canvas.style.cursor = 'grab';
});
// --- SỰ KIỆN CHUỘT PC (Chuột phải HOẶC giữ Ctrl để kéo) ---
canvas.addEventListener('mousedown', (e) => {
    // Cho phép kéo nếu: Bấm chuột phải (button 2) HOẶC (Bấm chuột trái + Phím Ctrl đang giữ)
    if (e.button === 2 || (e.button === 0 && isCtrlDown)) { 
        handlePointerDown(e.clientX, e.clientY);
        canvas.style.cursor = 'grabbing';
    } 
    else if (e.button === 0 && !isCtrlDown) {
        hasDragged = false; 
    }
});

canvas.addEventListener('mousemove', (e) => {
    // Luôn luôn cập nhật vị trí chuột hiện tại (để phục vụ cho phím Ctrl)
    currentMousePos.x = e.clientX;
    currentMousePos.y = e.clientY;
    
    // Gọi hàm xử lý kéo bàn cờ
    handlePointerMove(e.clientX, e.clientY);
});

canvas.addEventListener('mouseup', () => {
    isDragging = false; 
    // Nếu không còn giữ Ctrl thì trả về icon xòe, nếu vẫn giữ thì để icon nắm
    canvas.style.cursor = isCtrlDown ? 'grabbing' : 'grab';
});

// --- VÁ LỖI KẸT NÚT: Double Click để giải phóng phím Ctrl ---
canvas.addEventListener('dblclick', () => {
    if (isCtrlDown) {
        isCtrlDown = false;
        canvas.style.cursor = 'grab';
        console.log("Đã giải kẹt phím Ctrl");
    }
});

// Sự kiện Click để Đánh cờ
canvas.addEventListener('click', (e) => {
    // CHỈ CHO ĐÁNH CỜ NẾU: Không phải đang kéo bàn cờ VÀ không giữ phím Ctrl
    if (!hasDragged && !isCtrlDown) {
        handleCanvasClick(e.clientX, e.clientY);
    }
});
// --- SỰ KIỆN NGÓN TAY MOBILE (Giữ nguyên logic cực mượt cũ) ---
canvas.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault();
    // Hủy timeout reset pending từ tap trước → đảm bảo lần tap mới có hasDragged đúng
    if (resetHasDraggedTimeout) {
        clearTimeout(resetHasDraggedTimeout);
        resetHasDraggedTimeout = null;
    }
    handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
    if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });
// ================= HỆ THỐNG CLICK ĐÁNH CỜ =================

function getGridCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;

    const gridX = Math.floor((pixelX - cameraOffset.x) / cellSize);
    const gridY = Math.floor((pixelY - cameraOffset.y) / cellSize);

    return { x: gridX, y: gridY };
}

// Hàm Xử lý Click chuẩn xác
function handleCanvasClick(clientX, clientY) {
    console.log('[CLICK]', {
        isCtrlDown, gameActive, isBotThinking,
        playerRole, currentPlayer,
        isWaitingForNetwork,
        hasDragged
    });
    // KHÓA TỔNG: Nếu đang nhấn Ctrl (chế độ Camera) thì tuyệt đối không cho đánh cờ
    if (isCtrlDown) return;

    // Khán giả không bao giờ được đánh cờ
    if (isSpectating) return;

    if (!gameActive || isBotThinking) return;
    if (playerRole !== null && currentPlayer !== playerRole) return;
    // --- 1.CHẶN SPAM ---
    if (isWaitingForNetwork) return; 
    const coords = getGridCoordinates(clientX, clientY);
    const key = `${coords.x},${coords.y}`;
    if (boardData.has(key) || coords.x < minX || coords.x > maxX || coords.y < minY || coords.y > maxY) {
        return; 
    }
    if (isOnline) {
        // --- 2. KHÓA NÒNG TRƯỚC KHI GỬI LÊN SERVER ---
        isWaitingForNetwork = true; 
        socket.emit('make_move', { room: currentRoom, coords: coords });
    } else {
        processMove(coords); 
    }
}

// (Listener 'click' duy nhất cho canvas đã được đăng ký ở phía trên,
//  có check đầy đủ !hasDragged && !isCtrlDown - không đăng ký lần 2 ở đây
//  để tránh gọi handleCanvasClick 2 lần mỗi cú click.)

// Biến lưu timeout reset hasDragged để có thể cancel khi cần
let resetHasDraggedTimeout = null;

canvas.addEventListener('touchend', (e) => {
    if (e.cancelable) e.preventDefault(); 
    isDragging = false; 
    console.log('[TOUCHEND]', { hasDragged, isCtrlDown });
    if (!hasDragged && !isCtrlDown && e.changedTouches.length > 0) {
        handleCanvasClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    // Reset hasDragged sau 200ms để chống ghost click, nhưng cancel timeout cũ nếu có
    if (resetHasDraggedTimeout) clearTimeout(resetHasDraggedTimeout);
    resetHasDraggedTimeout = setTimeout(() => { 
        hasDragged = false; 
        resetHasDraggedTimeout = null;
    }, 200);
});
// ================= HÀM XỬ LÝ BOT (AI) =================
function triggerBotMove() { 
    isBotThinking = true; 
    statusMessage.innerText = "Máy đang suy nghĩ...";
    statusMessage.style.color = "#f39c12";

    setTimeout(() => {
        try {
            const difficulty = document.getElementById('botDifficulty').value;
            
            // 1. Kiểm tra xem file bot.js có đang được nhúng thành công không
            if (typeof getBestMove !== 'function') {
                throw new Error("Không tải được bot.js! Kiểm tra lại thẻ <script> trong HTML.");
            }
            
            // 2. Gọi Não bộ AI
            const bestMove = getBestMove(boardData, botRole, difficulty, winCondition, historyX, historyO);
            
            // 3. LUÔN LUÔN mở khóa game
            isBotThinking = false; 

            if (bestMove) {
                processMove(bestMove);
            } else {
                statusMessage.innerText = (winCondition === 5) ? "Chưa lắp não Luật 5!" : "Hòa cờ! Máy hết nước đi.";
                gameActive = false;
                if (restartBtn) restartBtn.innerText = "Bắt đầu";
            }
        } catch (err) {
            // Hiển thị lỗi đỏ lòm lên màn hình nếu AI hỏng
            isBotThinking = false;
            statusMessage.innerText = "LỖI AI: " + err.message;
            statusMessage.style.color = "red";
            console.error("Lỗi Bot:", err);
        }
    }, 500); 
}
// ================= LOGIC ĐÁNH CỜ & KIỂM TRA CHIẾN THẮNG =================

function checkWin(coords, player) {
    // 4 hướng tia quét: Ngang, Dọc, Chéo \ , Chéo /
    const directions = [
        { dx: 1, dy: 0 }, 
        { dx: 0, dy: 1 }, 
        { dx: 1, dy: 1 }, 
        { dx: 1, dy: -1 } 
    ];
    for (let dir of directions) {
        let count = 1; // Đếm chính quân cờ vừa đặt xuống
        let winPath = [`${coords.x},${coords.y}`]; 

        // Quét về phía "tiến"
        for (let i = 1; i <= winCondition; i++) {
            let nx = coords.x + dir.dx * i;
            let ny = coords.y + dir.dy * i;
            if (boardData.get(`${nx},${ny}`) === player) {
                count++;
                winPath.push(`${nx},${ny}`);
            } else break; // Gặp ô trống hoặc cờ địch -> Ngắt tia quét
        }
        // Quét về phía "lùi"
        for (let i = 1; i <= winCondition; i++) {
            let nx = coords.x - dir.dx * i;
            let ny = coords.y - dir.dy * i;
            if (boardData.get(`${nx},${ny}`) === player) {
                count++;
                winPath.push(`${nx},${ny}`);
            } else break; 
        }
        // Nếu chuỗi cờ liên tiếp >= điều kiện thắng (Mặc định: 5)
        if (count >= winCondition) {
            winningCells = winPath; // Lưu lại để hàm drawBoard tô màu
            return true;
        }
    }
    return false;
}

// Hàm Xử lý Nước đi thực tế
function processMove(coords) {
    const key = `${coords.x},${coords.y}`;
    if (boardData.has(key)) return;
    // Ghi nước cờ phục vụ Replay (currentPlayer = người vừa đánh, chưa đổi lượt)
    currentGameMoves.push({ x: coords.x, y: coords.y, player: currentPlayer });
    // 1. Ghi quân cờ vào bộ nhớ ảo
    boardData.set(key, currentPlayer);
    // THÊM: lưu nước cờ cuối cùng để vẽ highlight
    lastMoveKey = key;
    // --- LOGIC HÀNG ĐỢI CHO LUẬT 3 ---
    if (winCondition === 3) {
        let history = (currentPlayer === 'X') ? historyX : historyO;
        history.push(key); // Nạp tọa độ mới nhất vào cuối hàng đợi
        // Nếu số cờ trên bàn > 3, lập tức bốc hơi quân cờ cũ nhất (quân đầu mảng)
        if (history.length > 3) {
            let oldestKey = history.shift();
            boardData.delete(oldestKey); // Xóa khỏi Map, hàm checkWin sẽ không nhìn thấy nó nữa!
        }
    }
    // KHÓA AN TOÀN: Đã đánh cờ thì không được phép đổi luật nữa
    if (winConditionSelect) winConditionSelect.disabled = true;
    
    // 2. Kiểm tra xem có cần "nới lề" bàn cờ không
    expandBoardIfNeeded(coords.x, coords.y);

    // 3. Phán xét thắng thua
    if (checkWin(coords, currentPlayer)) {
        gameActive = false; // Đóng băng bàn cờ

        if (isSpectating) {
            // --- CHẾ ĐỘ DỰ KHÁN ---
            // Tỉ số do người chơi đồng bộ qua sự kiện 'score_update', khán giả
            // KHÔNG tự cộng điểm ở đây (tránh đếm trùng + sai khi vào giữa series).
            const winnerIsHost = (currentPlayer === 'X') === specHostIsX;
            const winnerName = winnerIsHost ? specP1Name : specP2Name;
            statusMessage.innerText = `${winnerName} (${currentPlayer}) đã thắng ván này!`;
            statusMessage.style.color = (currentPlayer === 'X') ? '#e74c3c' : '#2ecc71';
        } else if (isOnline) {
            if (currentPlayer === playerRole) {
                statusMessage.innerText = `BẠN ĐÃ THẮNG!`;
                scorePlayer++; scorePlayerEl.innerText = scorePlayer;
            } else {
                statusMessage.innerText = `ĐỐI THỦ THẮNG!`;
                scoreBot++; scoreBotEl.innerText = scoreBot;
            }
            syncSpectatorScore();
            btnSurrender.style.display = 'none';
            btnBack.style.display = 'block';
            btnBack.innerText = "Thoát Phòng";
            restartBtn.style.display = 'block';
            restartBtn.innerText = "Yêu Cầu Đấu Lại";
        } else if (playerRole === null) {
            // --- CHẾ ĐỘ 1 MÁY (LOCAL PVP) ---
            if (currentPlayer === localP1Role) {
                scorePlayer++; scorePlayerEl.innerText = scorePlayer;
                statusMessage.innerText = `Chúc mừng ${localP1Name} (${currentPlayer}) ĐÃ THẮNG!`;
            } else {
                scoreBot++; scoreBotEl.innerText = scoreBot;
                statusMessage.innerText = `Chúc mừng ${localP2Name} (${currentPlayer}) ĐÃ THẮNG!`;
            }
            statusMessage.style.color = (currentPlayer === 'X') ? '#e74c3c' : '#2ecc71';
            restartBtn.style.display = 'block';
            restartBtn.innerText = "Làm mới Bàn cờ";
        } else {
            // --- CHẾ ĐỘ PVE (ĐÁNH MÁY) ---
            statusMessage.innerText = `Người chơi ${currentPlayer} ĐÃ THẮNG!`;
            statusMessage.style.color = (currentPlayer === 'X') ? '#e74c3c' : '#2ecc71';
            if (currentPlayer === playerRole) {
                scorePlayer++; scorePlayerEl.innerText = scorePlayer;
            } else {
                scoreBot++; scoreBotEl.innerText = scoreBot;
            }
            restartBtn.style.display = 'block';
            restartBtn.innerText = "Chơi lại";
        }
    } else {
        // 4. CHUYỂN LƯỢT
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';

        if (isSpectating) {
            const turnIsHost = (currentPlayer === 'X') === specHostIsX;
            const turnName = turnIsHost ? specP1Name : specP2Name;
            statusMessage.innerText = `Lượt của ${turnName} (${currentPlayer})`;
            statusMessage.style.color = "#000";
        } else if (isOnline) {
            statusMessage.innerText = (currentPlayer === playerRole) ? `Lượt của bạn (${playerRole})!` : `Chờ đối thủ đánh...`;
        } else if (isPvE) {
            // --- THÔNG BÁO THÂN THIỆN CHO PVE ---
            statusMessage.innerText = (currentPlayer === playerRole) ? "Đến lượt bạn!" : "Máy đang suy nghĩ...";
        } else {
            // --- THÔNG BÁO CHO LOCAL PVP ---
            statusMessage.innerText = `Chế độ 1 máy: Đến lượt ${currentPlayer} đánh!`;
        }

        if (!isOnline && isPvE && currentPlayer === botRole) {
            triggerBotMove(); 
        }
    }
    
    // 5. Yêu cầu vẽ lại màn hình để hiển thị quân cờ mới
    drawBoard();
}
// ================= ĐIỀU HƯỚNG MÀN HÌNH =================
btnPvE.addEventListener('click', () => {
    isRankedMatch = socket.connected;
    isPvE = true;
    resetReplayCapture(); // bắt đầu loạt trận PvE mới → reset dữ liệu replay
    if(rematchControls) rematchControls.style.display = 'none';
    isOnline = false; 
    btnBack.style.display = 'block'; 
    btnBack.innerText = "Quay lại";
    
    if(winConditionSelect) {
        winConditionSelect.style.display = 'block';
        winConditionSelect.disabled = false;
    }
    
    mainMenu.style.display = 'none'; 
    gameScreen.style.display = 'flex'; 
    const userBtn = document.getElementById('userProfileBtn');
    if(userBtn) userBtn.style.display = 'flex';
    gameScreen.style.flexDirection = 'column';
    gameScreen.style.alignItems = 'center';
    
    if(player1NameEl) player1NameEl.innerText = "Bạn (X)";
    if(player2NameEl) player2NameEl.innerText = "Máy (O)";
    
    if(btnSurrender) btnSurrender.style.display = 'none';
    if(restartBtn) {
        restartBtn.style.display = 'block';
        restartBtn.innerText = "Bắt đầu"; 
    }

    scorePlayer = 0; scoreBot = 0;
    scorePlayerEl.innerText = '0'; scoreBotEl.innerText = '0';
    playerRole = null; botRole = null; 

    gameActive = false; 
    boardData.clear();
    historyX = []; // Bổ sung
    historyO = []; // Bổ sung
    winningCells = [];
    drawBoard();
    
    // --- FIX LỖI MẤT HỘP CHỌN ĐỘ KHÓ PVE ---
    const botDiffContainer = document.getElementById('botDifficultyContainer');
    if(botDiffContainer) botDiffContainer.style.display = 'block'; 
    
    if(botDifficulty) {
        botDifficulty.style.display = 'inline-block';
        botDifficulty.disabled = false; 
    }
    
    statusMessage.innerText = "Vui lòng chọn độ khó và bấm 'Bắt đầu'";
    pushFakeHistory(); // Đưa vào lịch sử để chặn vuốt back
    setTimeout(resizeCanvas, 50);
});
btnBack.addEventListener('click', () => {
    // Chế độ dự khán: thoát thẳng, không hỏi xác nhận, không tính ELO
    if (isSpectating) {
        exitSpectate();
        return;
    }
    if (boardData.size > 0 || scorePlayer > 0 || scoreBot > 0) {
        let msg = gameActive ? "Ván đấu đang diễn ra. Bạn có chắc chắn muốn thoát và mất tiến trình không?" : "Bạn có chắc chắn muốn rời khỏi bàn cờ này không?";
        const confirmLeave = confirm(msg);
        if (!confirmLeave) return; // Bấm Hủy thì ở lại
        // ---> CHỐT SỔ ELO: Nếu đang chơi mà bỏ chạy -> Tự phạt chính mình AFK -3 điểm
        // Ghi đè vào chỗ kiểm tra confirmLeave
        if (gameActive) {
                // Kim bài miễn tử AFK cho chế độ PvE
                if (isPvE || boardData.size === 0) {
                    finalizeMatchSession(); 
                } else {
                    // --- BỔ SUNG: Cộng 1 điểm ván thắng cho đối thủ trước khi chốt sổ ---
                    scoreBot++; 
                    finalizeMatchSession('LOSE', true, 'Tự thoát (AFK)');
                }
            } else {
                finalizeMatchSession();
            }
    }
    // Nếu đang đánh Online mà bấm thoát -> Gửi tín hiệu rời phòng
    if (isOnline) {
        socket.emit('leave_room', currentRoom); 
    }
    if (typeof hideChatBox === 'function') hideChatBox();
    // 1. Tắt màn hình Game và reset trạng thái
    gameScreen.style.display = 'none';
    gameActive = false; 
    isBotThinking = false; 
    statusMessage.style.color = "#000";

    // 2. LOGIC ĐIỀU HƯỚNG THÔNG MINH
    if (localStorage.getItem('caro_token')) {
        // Có tài khoản -> Về Menu chính
        mainMenu.style.display = 'block';
        // BẬT LẠI NÚT TÀI KHOẢN
        const userBtn = document.getElementById('userProfileBtn');
        if (userBtn) userBtn.style.display = 'flex';
    } else {
        // Chơi khách -> Về màn hình Đăng nhập
        authScreen.style.display = 'flex';
    }
});

// ================= LOGIC GAME (CORE) =================
// (Hàm startMatch() được định nghĩa ở phần dưới, sau hàm updateLocalScoreboardUI)

// ================= ĐIỀU KHIỂN POPUP PVP (GIAO ĐẤU ONLINE) =================
// Lấy các nút và cửa sổ từ HTML
const btnPvPOnline = document.getElementById('btnPvPOnline');
const pvpModal = document.getElementById('pvpModal');
const closeModal = document.getElementById('closeModal');
const pvpStatus = document.getElementById('pvpStatus');

// 1. Khi bấm "Đánh Online" ở màn hình chính -> Mở Popup
btnPvPOnline.addEventListener('click', () => {
    pvpModal.style.display = 'flex';
    pvpStatus.innerText = ''; // Xóa các thông báo lỗi cũ nếu có
    history.pushState({ popup: 'pvp' }, "PvP Modal", "");
});

// 2. Khi bấm dấu X -> Đóng Popup
closeModal.addEventListener('click', () => {
    pvpModal.style.display = 'none';
});

// 3. (Trải nghiệm người dùng) Bấm ra ngoài vùng đen cũng tự đóng Popup
window.addEventListener('click', (event) => {
    if (event.target === pvpModal) {
        pvpModal.style.display = 'none';
    }
});
// ================= ĐIỀU KHIỂN CÁC NÚT TRONG POPUP =================
// ================= CHẾ ĐỘ 1 MÁY (LOCAL PVP) =================
const btnLocalPvPAuth = document.getElementById('btnLocalPvPAuth');
const btnLocalPvPMenu = document.getElementById('btnLocalPvPMenu');

function startLocalPvP() {
    resetReplayCapture(); // PvP Local không lưu replay, vẫn reset cho sạch state
    if (authScreen) authScreen.style.display = 'none';
    if (mainMenu) mainMenu.style.display = 'none';
    if (pvpModal) pvpModal.style.display = 'none';
    
    
    gameScreen.style.display = 'flex';
    const userBtn = document.getElementById('userProfileBtn');
    if(userBtn) userBtn.style.display = 'flex';
    gameScreen.style.flexDirection = 'column';
    gameScreen.style.alignItems = 'center';
    
    btnBack.style.display = 'block';
    btnBack.innerText = "Quay lại";
    btnSurrender.style.display = 'none';

    if(botDifficulty) botDifficulty.style.display = 'none'; 
    if(botDifficultyContainer) botDifficultyContainer.style.display = 'none';

    if(restartBtn) {
        restartBtn.style.display = 'block';
        restartBtn.innerText = "Bắt đầu";
    }
    if(winConditionSelect) {
        winConditionSelect.style.display = 'block';
        winConditionSelect.disabled = false;
    }
    localP1Name = "Người chơi 1";
    localP2Name = "Người chơi 2";
    localP1Role = 'X'; // Reset lại ván 1: P1 luôn cầm X
    updateLocalScoreboardUI(); // Gọi hàm vẽ UI Custom
    statusMessage.innerText = "Chế độ 1 máy: X đi trước!";
    statusMessage.style.color = "#000";

    // --- KHỞI ĐỘNG GAME NGAY LẬP TỨC ---
    isOnline = false;
    isPvE = false; 
    playerRole = null; 
    gameActive = false; // KHÓA GAME LẠI, chờ bấm nút mới mở
    currentPlayer = 'X'; 
    boardData.clear(); 
    winningCells = []; 
    historyX = []; 
    historyO = [];
    
    scorePlayer = 0; scoreBot = 0;
    scorePlayerEl.innerText = '0'; scoreBotEl.innerText = '0';
    
    history.pushState({ page: 'game' }, "Game Screen", "");
    setTimeout(resizeCanvas, 100); 
}
// Hàm vẽ bảng tỉ số cho phép Custom Tên (Chuẩn eSports)
function updateLocalScoreboardUI() {
    let p2Role = (localP1Role === 'X') ? 'O' : 'X';
    
    if (player1NameEl) {
        player1NameEl.innerHTML = `<span contenteditable="true" spellcheck="false" class="edit-name" id="p1NameInput">${localP1Name}</span> (${localP1Role})`;
        document.getElementById('p1NameInput').addEventListener('blur', function() { localP1Name = this.innerText; });
    }
    
    if (player2NameEl) {
        player2NameEl.innerHTML = `<span contenteditable="true" spellcheck="false" class="edit-name" id="p2NameInput">${localP2Name}</span> (${p2Role})`;
        document.getElementById('p2NameInput').addEventListener('blur', function() { localP2Name = this.innerText; });
    }
}

// Thay thế hoàn toàn hàm startMatch() cũ
function startMatch() {
    // Chốt ván vừa rồi vào replay trước khi bắt đầu ván mới (PvE nhiều ván/loạt)
    commitCurrentGame();
    // TÍNH NĂNG MỚI: Ghi nhớ số lượng cờ TRƯỚC KHI dọn dẹp bàn cờ
    let previousBoardSize = boardData.size;
    
    gameActive = true; 
    isBotThinking = false;
    currentPlayer = 'X'; // Luật cờ quốc tế: Bắt đầu ván mới X luôn đi trước
    boardData.clear(); 
    winningCells = [];
    historyX = []; 
    historyO = [];
    
    // Đổi chữ nút bấm
    if (restartBtn && !isOnline) {
        restartBtn.innerText = isPvE ? "Chơi lại" : "Làm mới Bàn cờ";
    }

    if (botDifficulty) botDifficulty.disabled = true;

    if (!isOnline && !isPvE) {
        // ================= LOGIC CHẾ ĐỘ 1 MÁY (LOCAL PVP) =================
        // CHỈ HOÁN ĐỔI VAI TRÒ NẾU: Ván trước đó ĐÃ THỰC SỰ DIỄN RA (Có >= 1 quân cờ)
        if (previousBoardSize > 0) {
            localP1Role = (localP1Role === 'X') ? 'O' : 'X'; 
        }
        updateLocalScoreboardUI(); 

        let firstPlayerName = (localP1Role === 'X') ? localP1Name : localP2Name;
        statusMessage.innerText = `Ván mới: ${firstPlayerName} (X) đi trước!`;
        statusMessage.style.color = "#000";
        
    } else if (isPvE) {
        // ================= LOGIC CHẾ ĐỘ PVE (ĐÁNH VỚI MÁY) =================
        if (playerRole === null) {
            // VÁN ĐẦU TIÊN: Random người đi trước
            if (Math.random() < 0.5) {
                playerRole = 'X'; botRole = 'O';
                statusMessage.innerText = `Ván mở màn: Bạn là X (Đi trước). Xin mời!`;
            } else {
                playerRole = 'O'; botRole = 'X';
                statusMessage.innerText = `Ván mở màn: Bạn là O. Máy (X) đi trước!`;
            }
        } else {
            // CÁC VÁN SAU: Chỉ đổi vai trò nếu ván trước đã thực sự đánh
            if (previousBoardSize > 0) {
                if (playerRole === 'X') {
                    playerRole = 'O'; botRole = 'X';
                    statusMessage.innerText = `Lượt về: Bạn là O. Máy (X) đi trước!`;
                } else {
                    playerRole = 'X'; botRole = 'O';
                    statusMessage.innerText = `Lượt đi: Bạn là X (Đi trước). Xin mời!`;
                }
            } else {
                // Nếu spam nút "Chơi lại" khi bàn cờ trống -> Nhắc nhở lại vai trò hiện tại
                statusMessage.innerText = `Ván mới: Bạn là ${playerRole}. ${playerRole === 'X' ? 'Xin mời!' : 'Máy đi trước!'}`;
            }
        }
        // ĐỘNG HÓA NHÃN TÊN: Ai cầm X thì nằm bên trái, ai cầm O nằm bên phải
        if (playerRole === 'X') {
           statusMessage.innerText = "Ván mới: Bạn (X) đi trước!";
        } else {
            statusMessage.innerText = "Ván mới: Chờ Máy (X) đánh...";
        }
        player1NameEl.innerText = `Bạn (${playerRole})`;
        player2NameEl.innerText = `Máy (${botRole})`;
        
        statusMessage.innerText = (playerRole === 'X') ? "Ván mới: Bạn (X) đi trước!" : "Ván mới: Chờ Máy (X) đánh...";
        statusMessage.style.color = "#000";
        
        if (botRole === 'X') triggerBotMove();
    }
    drawBoard();
}

// Lắng nghe sự kiện click cho cả 2 nút
if (btnLocalPvPAuth) btnLocalPvPAuth.addEventListener('click', startLocalPvP);
if (btnLocalPvPMenu) btnLocalPvPMenu.addEventListener('click', startLocalPvP);
const btnRandomMatch = document.getElementById('btnRandomMatch');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const inputRoomCode = document.getElementById('inputRoomCode');
const pvpWinCondition = document.getElementById('pvpWinCondition');

// 1. Nút "Tìm Ngẫu Nhiên"
btnRandomMatch.addEventListener('click', () => {
    socket.emit('find_random', pvpWinCondition.value); // Bắn luật 3 hoặc 5 lên Server
    pvpStatus.innerText = `Đang tìm đối thủ (Luật ${pvpWinCondition.value} quân)...`;
    pvpStatus.style.color = "#f1c40f"; 
});

// 2. Nút "Tạo Phòng"
btnCreateRoom.addEventListener('click', () => {
    socket.emit('create_room', pvpWinCondition.value); // Chủ phòng ghim luật cho phòng này
});

// 3. Nút "Vào Phòng"
btnJoinRoom.addEventListener('click', () => {
    const numbers = inputRoomCode.value.trim();
    
    // Kiểm tra đúng định dạng: phải là chuỗi gồm đúng 4 chữ số (0-9)
    if (!/^\d{4}$/.test(numbers)) {
        pvpStatus.innerText = "Vui lòng nhập đúng 4 số phòng (VD: 5123)!";
        pvpStatus.style.color = "#e74c3c"; // Màu đỏ
        return;
    }
    
    // Kiểm tra chữ số đầu tiên (Quy định luật chơi)
    const ruleDigit = numbers.charAt(0);
    if (ruleDigit !== '3' && ruleDigit !== '5') {
        pvpStatus.innerText = "Mã không hợp lệ! Số đầu tiên phải là 3 hoặc 5.";
        pvpStatus.style.color = "#e74c3c"; 
        return;
    }
    
    // TỰ ĐỘNG ghép chữ CARO vào trước 4 con số
    const code = "CARO" + numbers;
    
    pvpStatus.innerText = "Đang kết nối vào phòng...";
    pvpStatus.style.color = "#f1c40f"; // Màu vàng
    
    // Gửi mã (ví dụ: CARO5123) lên server yêu cầu vào
    socket.emit('join_room', code);
});
inputRoomCode.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Ngăn chặn hành vi mặc định của phím Enter
        btnJoinRoom.click();    // Tự động kích hoạt nút "Vào"
    }
});

// ================= NHẬN THÔNG BÁO TỪ SERVER =================
// (Tất cả các sự kiện 'room_created', 'room_error', 'match_found' đã được
//  đăng ký gọn trong hàm setupSocketEvents() ở đầu file - không đăng ký lại tại đây
//  để tránh trigger callback nhiều lần, gây reset bàn cờ và double-count.)

// Hàm dọn dẹp bàn cờ và Setup UI cho PvP
function startOnlineMatch(data) {
    isOnline = true;
    resetReplayCapture(); // bắt đầu loạt trận PvP mới → reset dữ liệu replay
    currentRoom = data.room; // Lưu lại mã phòng
    
    mainMenu.style.display = 'none';
    gameScreen.style.display = 'flex';
    // ÉP GIẤU ICON KHI VÀO THỰC CHIẾN ONLINE
    const userBtn = document.getElementById('userProfileBtn');
    if(userBtn) userBtn.style.display = 'none';
    if (typeof showChatForRoom === 'function') showChatForRoom(data.room);
    gameScreen.style.flexDirection = 'column';
    gameScreen.style.alignItems = 'center';

    // --- CẬP NHẬT TÊN NGƯỜI CHƠI LÊN BẢNG TỈ SỐ ---
    const myName = localStorage.getItem('caro_username'); // Tên của chính mình
    const isPlayer1 = data.player1 === socket.id;
    amIHost = isPlayer1; // player1 = người tạo phòng = host
    // Nếu mình là player1 thì đối thủ là p2Name, và ngược lại
    const oppName = isPlayer1 ? data.p2Name : data.p1Name;

    // BẠN: Luôn nằm ở bên trái (player1NameEl)
    // ĐỐI THỦ: Luôn nằm ở bên phải (player2NameEl)
    player1NameEl.innerText = `${myName} (Bạn)`;
    player2NameEl.innerText = `${oppName}`;

    // Chỉ phân lại X và O dựa vào ai là người tạo phòng
    if (isPlayer1) {
        playerRole = 'X'; // Chủ phòng cầm X đi trước
    } else {
        playerRole = 'O'; // Người vào sau cầm O đi sau
    }

    // --- KIỂM SOÁT NÚT BẤM KHI PVP ---
    btnBack.style.display = 'none'; 
    btnSurrender.style.display = 'block'; 
    restartBtn.style.display = 'none';
    if(botDifficultyContainer) botDifficultyContainer.style.display = 'none';    
    botDifficulty.style.display = 'none'; 
    isOpponentPresent = true; 

    // 1. Áp dụng luật từ Server
    winCondition = data.winCondition;
    
    // 2. --- QUAN TRỌNG: Thiết lập biên giới bàn cờ để chặn đánh ra ngoài ---
    if (winCondition === 3) {
        minX = -1; maxX = 1; minY = -1; maxY = 1;
    } else {
        minX = -8; maxX = 8; minY = -8; maxY = 8;
    }

    // 3. --- CẬP NHẬT GIAO DIỆN (ZOOM & KHÓA) ---
    resizeCanvas(); // Hàm này sẽ tự động zoom to ô cờ nếu winCondition === 3
    
    // Bật thanh Dropdown Luật chơi trên Top-bar lên ĐỂ NHẮC NHỞ LUẬT
    if(winConditionSelect) {
        winConditionSelect.style.display = 'block';
        winConditionSelect.value = winCondition.toString(); // Ép hiển thị đúng luật của trận này
        winConditionSelect.disabled = true; // KHÓA CỨNG LẠI, người chơi không thể gian lận đổi luật
    }
    boardData.clear();
    historyX = []; // Bổ sung
    historyO = []; // Bổ sung
    winningCells = [];
    drawBoard();

    // Khởi động ván đấu
    gameActive = true;
    isRankedMatch = true;
    currentPlayer = 'X'; // X luôn đi trước
    scorePlayer = 0; scoreBot = 0;
    scorePlayerEl.innerText = '0'; scoreBotEl.innerText = '0';
    isWaitingForNetwork = false;

    if (playerRole === 'X') {
        statusMessage.innerText = "Trận đấu bắt đầu! Bạn (X) đi trước.";
    } else {
        statusMessage.innerText = "Đang chờ đối thủ (X) đánh...";
    }
    setTimeout(resizeCanvas, 50);
}
// ================= CHẾ ĐỘ DỰ KHÁN (SPECTATOR) =================
// Vào chế độ dự khán: dựng lại bàn cờ từ danh sách nước đi server gửi về
function startSpectating(data) {
    isSpectating = true;
    isOnline = false;
    isPvE = false;
    isRankedMatch = false;
    resetReplayCapture(); // khán giả không lưu replay, reset cho sạch state
    playerRole = null;
    botRole = null;
    currentRoom = data.room;

    specP1Name = data.p1Name || 'Người chơi 1';
    specP2Name = data.p2Name || 'Người chơi 2';
    specHostIsX = ((data.xIndex || 0) === 0);

    // Chuyển sang màn hình game
    if (mainMenu) mainMenu.style.display = 'none';
    const spectateModalEl = document.getElementById('spectateModal');
    if (spectateModalEl) spectateModalEl.style.display = 'none';
    gameScreen.style.display = 'flex';
    gameScreen.style.flexDirection = 'column';
    gameScreen.style.alignItems = 'center';

    const userBtn = document.getElementById('userProfileBtn');
    if (userBtn) userBtn.style.display = 'none';
    const banner = document.getElementById('spectateBanner');
    if (banner) banner.style.display = 'block';

    // Ẩn toàn bộ nút điều khiển của người chơi
    btnBack.style.display = 'block';
    btnBack.innerText = 'Thoát dự khán';
    if (btnSurrender) btnSurrender.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';
    if (rematchControls) rematchControls.style.display = 'none';
    if (botDifficultyContainer) botDifficultyContainer.style.display = 'none';
    if (botDifficulty) botDifficulty.style.display = 'none';

    // Áp dụng luật chơi của phòng
    winCondition = data.winCondition;
    if (winCondition === 3) {
        minX = -1; maxX = 1; minY = -1; maxY = 1;
    } else {
        minX = -8; maxX = 8; minY = -8; maxY = 8;
    }
    if (winConditionSelect) {
        winConditionSelect.style.display = 'block';
        winConditionSelect.value = winCondition.toString();
        winConditionSelect.disabled = true;
    }

    // Bảng tỉ số: host luôn ở bên trái, guest bên phải; tỉ số lấy từ server
    player1NameEl.innerText = `${specP1Name} (${specHostIsX ? 'X' : 'O'})`;
    player2NameEl.innerText = `${specP2Name} (${specHostIsX ? 'O' : 'X'})`;
    scorePlayer = data.scoreHost || 0;
    scoreBot = data.scoreGuest || 0;
    scorePlayerEl.innerText = scorePlayer;
    scoreBotEl.innerText = scoreBot;

    // Dọn bàn cờ
    boardData.clear();
    historyX = []; historyO = [];
    winningCells = []; lastMoveKey = null;
    currentPlayer = 'X';
    gameActive = true;

    // Hiện khung chat TRƯỚC khi resize để bàn cờ chừa chỗ ngay từ đầu
    // (kèm lịch sử chat cũ để khán giả không bị giấu tin nhắn trước đó)
    if (typeof showChatForRoom === 'function') showChatForRoom(data.room, true, data.chatLog);
    resizeCanvas();

    // Dựng lại toàn bộ nước đi đã diễn ra từ đầu ván
    const moves = data.moves || [];
    for (const mv of moves) {
        if (mv && mv.coords) processMove(mv.coords);
    }

    if (gameActive) {
        const turnIsHost = (currentPlayer === 'X') === specHostIsX;
        const turnName = turnIsHost ? specP1Name : specP2Name;
        statusMessage.innerText = `Đang dự khán — Lượt của ${turnName} (${currentPlayer})`;
        statusMessage.style.color = '#000';
    }

    if (typeof pushFakeHistory === 'function') pushFakeHistory();
    setTimeout(resizeCanvas, 50);
}

// Thoát chế độ dự khán, quay về Menu chính
function exitSpectate() {
    if (currentRoom && socket && socket.connected) {
        socket.emit('leave_spectate', currentRoom);
    }
    isSpectating = false;
    gameActive = false;
    currentRoom = '';
    if (spectateCountdownTimer) {
        clearInterval(spectateCountdownTimer);
        spectateCountdownTimer = null;
    }
    if (typeof hideChatBox === 'function') hideChatBox();
    const banner = document.getElementById('spectateBanner');
    if (banner) banner.style.display = 'none';
    gameScreen.style.display = 'none';
    statusMessage.style.color = '#000';
    if (mainMenu) mainMenu.style.display = 'block';
    const userBtn = document.getElementById('userProfileBtn');
    if (userBtn) userBtn.style.display = 'flex';
}

// Đếm ngược thoát phòng khi cả 2 người chơi đã rời
function startSpectateCountdown(seconds) {
    if (spectateCountdownTimer) clearInterval(spectateCountdownTimer);
    let count = seconds;
    gameActive = false;
    statusMessage.style.color = '#f1c40f';
    statusMessage.innerText = `Cả 2 người chơi đã rời phòng. Tự thoát sau ${count}s...`;
    spectateCountdownTimer = setInterval(() => {
        count--;
        if (count < 0) {
            clearInterval(spectateCountdownTimer);
            spectateCountdownTimer = null;
            exitSpectate();
        } else {
            statusMessage.innerText = `Cả 2 người chơi đã rời phòng. Tự thoát sau ${count}s...`;
        }
    }, 1000);
}

// ================= TỔNG KẾT VÀ LƯU DỮ LIỆU ELO =================
async function finalizeMatchSession(customResult = null, applyAfkPenalty = false, noteText = '') {
    // Chỉ lưu nếu là trận hợp lệ (có mạng) và không phải chơi Local 1 máy
    if (!isRankedMatch || playerRole === null || !socket.connected) return;

    // Bỏ qua nếu tỉ số 0-0 mà CHƯA ĐÁNH QUÂN NÀO (Vừa vào phòng đã thoát)
    if (scorePlayer === 0 && scoreBot === 0 && boardData.size === 0) return;

    // Tự động phân loại Thắng/Thua/Hòa dựa trên Tỉ số Series nếu không bị ép kết quả
    let finalResult = customResult;
    if (!finalResult) {
        if (scorePlayer > scoreBot) finalResult = 'WIN';
        else if (scorePlayer < scoreBot) finalResult = 'LOSE';
        else finalResult = 'DRAW';
    }

    let matchMode = 'PvP';
    let oppNameEl = document.getElementById('player2Name');
    let oppName = oppNameEl ? oppNameEl.innerText.replace(' (O)', '').replace(' (X)', '').replace('ID: ', '') : 'Unknown';

    // Đổi định dạng nếu là đánh Bot
    if (!isOnline) {
        let diff = document.getElementById('botDifficulty').value;
        matchMode = diff === 'easy' ? 'PvE-E' : (diff === 'hard' ? 'PvE-H' : 'PvE-M');
        oppName = 'Bot ' + (diff === 'easy' ? 'Dễ' : (diff === 'hard' ? 'Khó' : 'TB'));
    }

    const payload = {
        opponentName: oppName,
        mode: matchMode,
        rule: winCondition,
        scoreMe: scorePlayer,
        scoreEnemy: scoreBot,
        result: finalResult,
        isAfkPenalty: applyAfkPenalty,
        noteText: noteText
    };

    try {
        const token = localStorage.getItem('caro_token');
        const res = await fetch(`${serverUrl}/api/match/record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload),
            keepalive: true
        });

        // Tắt cờ sau khi lưu thành công để tránh lưu trùng 2 lần nếu họ bấm nhiều nút
        isRankedMatch = false;

        // Lưu replay sau khi đã ghi được match_history (cần historyId từ phản hồi)
        if (res && res.ok) {
            try {
                const recData = await res.json();
                if (recData && recData.historyId) await saveReplay(recData.historyId);
            } catch (e) { console.error('Lỗi đọc historyId:', e); }
        }
    } catch (err) { console.error("Lỗi gửi ELO:", err); }
}
// Hàm đếm ngược để tự động quay về Menu sau khi trận đấu kết thúc
function startCountdownToMenu(seconds) {
    // 1. Vô hiệu hóa và giấu các nút chức năng để tránh người dùng bấm loạn
    btnSurrender.style.display = 'none';
    if(rematchControls) rematchControls.style.display = 'none';
    restartBtn.style.display = 'none';
    btnBack.style.display = 'none'; 
    botDifficulty.style.display = 'none'; 

    let count = seconds;
    statusMessage.style.color = "#f1c40f"; // Đổi chữ sang màu vàng để gây chú ý
    
    // 2. Chạy bộ đếm giây
    const interval = setInterval(() => {
        statusMessage.innerText = `Thoát ra Menu chính trong ${count}s...`;
        count--;

        // 3. Khi đếm về 0 thì thực hiện chuyển màn hình
        if (count < 0) {
            clearInterval(interval);
            
            // Quay về màn hình chính
            if (typeof hideChatBox === 'function') hideChatBox(); 
            gameScreen.style.display = 'none';
            mainMenu.style.display = 'block';
            statusMessage.style.color = "#000";
            const userBtn = document.getElementById('userProfileBtn');
            if (userBtn) userBtn.style.display = 'flex';

            // Gửi tín hiệu báo cho Server là tôi đã rời phòng để dọn dẹp bộ nhớ
            if (isOnline) {
                socket.emit('leave_room', currentRoom);
            }
        }
    }, 1000);
}
// ================= LOGIC ĐẦU HÀNG =================
btnSurrender.addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn cắm cờ trắng không?")) {
        socket.emit('surrender', currentRoom); 
        
        // KIỂM TRA ĐIỀU KIỆN REMAKE (Chống Buff bẩn)
        if (scorePlayer === 0 && scoreBot === 0 && boardData.size === 0) {
            statusMessage.innerText = "Hủy ván đấu (Chưa đánh quân nào)!";
            statusMessage.style.color = "#f39c12"; // Màu vàng
            gameActive = false;
            finalizeMatchSession(); // Hàm này sẽ tự bỏ qua không lưu ELO
        } else {
            // ĐẦU HÀNG HỢP LỆ (Bị xử thua)
            statusMessage.innerText = "Bạn đã đầu hàng. BẠN THUA!";
            statusMessage.style.color = "#e74c3c";
            gameActive = false; 
            
            scoreBot++;
            scoreBotEl.innerText = scoreBot;
            syncSpectatorScore();
            finalizeMatchSession('LOSE', false, 'Đầu hàng');
        }
        
        startCountdownToMenu(3);
    }
});

// ================= 1. BẤM YÊU CẦU TÁI ĐẤU / LÀM MỚI BÀN CỜ =================
restartBtn.addEventListener('click', () => {
    if (isOnline) {
        socket.emit('request_rematch', currentRoom);
        statusMessage.innerText = "Đang chờ đối thủ đồng ý...";
        restartBtn.style.display = 'none'; 
        btnBack.style.display = 'none'; 
    } else {
        // KHÓA AN TOÀN: Hỏi Confirm nếu ván đấu đang diễn ra và ĐÃ CÓ CỜ trên bàn
        if (gameActive && boardData.size > 0) {
            const confirmRestart = confirm("Ván đấu đang diễn ra. Bạn có chắc chắn muốn làm mới bàn cờ và chơi lại từ đầu không?");
            if (!confirmRestart) return; // Nếu bấm Hủy -> Dừng lệnh, tiếp tục đánh
        }
        
        // ÉP TRÌNH DUYỆT MỞ KHÓA LUẬT CHƠI (Can thiệp DOM trực tiếp để chống kẹt)
        const winSelect = document.getElementById('winConditionSelect');
        if (winSelect) {
            winSelect.disabled = false;
            winSelect.removeAttribute('disabled');
        }
        
        startMatch(); // Khởi động ván mới
    }
});

// ================= 3. XỬ LÝ NÚT ĐỒNG Ý / TỪ CHỐI =================
btnAcceptRematch.addEventListener('click', () => {
    socket.emit('accept_rematch', currentRoom);
    rematchControls.style.display = 'none';
});

btnDeclineRematch.addEventListener('click', () => {
    socket.emit('decline_rematch', currentRoom);
    rematchControls.style.display = 'none';
    statusMessage.innerText = "Bạn đã từ chối tái đấu!";
    finalizeMatchSession();
    startCountdownToMenu(3); // Thoát về Menu sau 3s
});
// ================= XỬ LÝ NÚT BACK CỦA ĐIỆN THOẠI/TRÌNH DUYỆT =================

// 1. Khi người chơi từ Menu nhảy vào màn hình Game (PvE hoặc PvP)
// Chúng ta sẽ "bơm" một trạng thái giả vào lịch sử trình duyệt
function pushFakeHistory() {
    history.pushState({ page: 'game' }, "Game Screen", "");
}
// Bắt sự kiện khi vào PvE
btnPvE.addEventListener('click', pushFakeHistory);
// (Sự kiện pushFakeHistory cho 'match_found' đã được nhúng trực tiếp vào
//  setupSocketEvents() bên trong handler match_found để đảm bảo chạy.)
// 2. Lắng nghe hành động vuốt Back / Bấm nút Back của trình duyệt
window.addEventListener('popstate', (event) => {

    // ƯU TIÊN TUYỆT ĐỐI 0 - Modal Replay (stack trên cùng, mở từ lịch sử đấu)
    if (isReplayOpen) {
        closeReplayModal();
        return;
    }

    // ƯU TIÊN TUYỆT ĐỐI - Admin Panel (vì có thể stack lên trên các modal khác)
    const adminModal = document.getElementById('adminModal');
    if (adminModal && adminModal.style.display === 'flex') {
        if (adminModal.dataset.view === 'logs') {
            // Đang ở logs → vuốt back về danh sách user
            loadAdminUsers();
        } else {
            // Đang ở danh sách user → đóng hẳn modal
            adminModal.style.display = 'none';
        }
        return;
    }
    // ƯU TIÊN TUYỆT ĐỐI 2 - Bảng xếp hạng ELO
    const leaderboardModal = document.getElementById('leaderboardModal');
    if (leaderboardModal && leaderboardModal.style.display === 'flex') {
        leaderboardModal.style.display = 'none';
        return;
    }
    // ƯU TIÊN TUYỆT ĐỐI 3 - Khung chat đang mở trên mobile
    if (chatContainer && chatContainer.style.display === 'flex' && isChatOpen && isMobileView()) {
        chatContainer.style.display = 'none';
        isChatOpen = false;
        return;
    }

    // ƯU TIÊN SIÊU CẤP - Xử lý Popup Tìm kiếm người chơi
    if (searchProfileModal && searchProfileModal.style.display === 'flex') {
        searchProfileModal.style.display = 'none';
        userModal.style.display = 'flex'; // Trả lại bảng Trung tâm Tài khoản
        return;
    }
    
    // ƯU TIÊN 0 - Xử lý Popup Quản lý tài khoản (Tháo gỡ từ trong ra ngoài)
    if (userModal && userModal.style.display === 'flex') {
        
        if (userEditView && userEditView.style.display === 'block') {
            // Đang ở Form Sửa -> Lùi về Xem Thông Tin
            userEditView.style.display = 'none';
            userInfoView.style.display = 'block';
        } 
        else if (userHistoryView && userHistoryView.style.display === 'block') {
            // Đang ở Lịch Sử Đấu -> Lùi về Xem Thông Tin
            userHistoryView.style.display = 'none';
            userInfoView.style.display = 'block';
        }
        else {
            // Đang ở ngoài cùng của Modal -> Đóng hẳn Modal
            userModal.style.display = 'none';
        }
        return; // Đã xử lý xong thì dừng lại, không chạy xuống dưới
    }
    // ƯU TIÊN 0 — Khung chat mở trên mobile (xử lý sớm nhất, tránh rage quit)
    if (chatContainer && chatContainer.style.display === 'flex' && isChatOpen && isMobileView()) {
        // Dùng cách giống chatCloseBtn: chỉ gọi history.back(), popstate tự đóng chat
        if (window.history && window.history.length > 1) {
            window.history.back();
        } else {
            chatContainer.style.display = 'none';
            isChatOpen = false;
        }
        return;
    }

    // ƯU TIÊN 1 - Nếu Popup PvP đang mở thì đóng Popup lại
    if (pvpModal && pvpModal.style.display === 'flex') {
        pvpModal.style.display = 'none';
        return;
    }

    // ƯU TIÊN 1.5 - Modal nhập mã dự khán
    const spectateModalEl = document.getElementById('spectateModal');
    if (spectateModalEl && spectateModalEl.style.display === 'flex') {
        spectateModalEl.style.display = 'none';
        return;
    }

    // ƯU TIÊN 2 - Nếu đang ở trong bàn cờ thì về Menu hoặc Auth
    if (gameScreen && (gameScreen.style.display === 'flex' || gameScreen.style.display === 'block')) {
        // Chế độ dự khán: thoát thẳng về Menu
        if (isSpectating) {
            exitSpectate();
            return;
        }
        if (boardData.size > 0 || scorePlayer > 0 || scoreBot > 0) {
            let msg = gameActive ? "Ván đấu đang diễn ra. Bạn có chắc chắn muốn thoát và mất tiến trình không?" : "Bạn có chắc chắn muốn rời khỏi bàn cờ này không?";
            const confirmLeave = confirm(msg);
            if (!confirmLeave) {
                pushFakeHistory();
                return; 
            }
            // ---> CHỐT SỔ ELO: Nếu đang chơi mà bỏ chạy -> Tự phạt chính mình AFK -3 điểm
            if (gameActive) {
                // Kim bài miễn tử AFK cho chế độ PvE
                if (isPvE || boardData.size === 0) {
                    finalizeMatchSession(); 
                } else {
                    // --- BỔ SUNG: Cộng 1 điểm ván thắng cho đối thủ trước khi chốt sổ ---
                    scoreBot++; 
                    finalizeMatchSession('LOSE', true, 'Tự thoát (AFK)');
                }
            } else {
                finalizeMatchSession();
            }
        }
        // --- CÁC LỆNH DƯỚI ĐÂY PHẢI NẰM NGOÀI KHỐI IF TRÊN ĐỂ LUÔN ĐƯỢC CHẠY ---
        if (isOnline) {
            socket.emit('leave_room', currentRoom);
        }
        if (typeof hideChatBox === 'function') hideChatBox();
        gameScreen.style.display = 'none';
        gameActive = false; 
        isBotThinking = false; 
        statusMessage.style.color = "#000";

        // Thay vì ép chết về mainMenu, ta kiểm tra token
        if (localStorage.getItem('caro_token')) {
            mainMenu.style.display = 'block';
            // BẬT LẠI NÚT TÀI KHOẢN KHI VUỐT BACK
            const userBtn = document.getElementById('userProfileBtn');
            if (userBtn) userBtn.style.display = 'flex';
        } else {
            authScreen.style.display = 'flex';
        }
    }
});
window.addEventListener('beforeunload', (e) => {
    // Chỉ hiện cảnh báo nếu game đang diễn ra (chưa ai thắng).
    // Khán giả thoát thì không cần cảnh báo.
    if (gameActive && !isSpectating) {
        // Gửi thông báo đến trình duyệt yêu cầu chặn lại
        e.preventDefault();
        // Cần gán một chuỗi rỗng vào e.returnValue để kích hoạt hộp thoại của Chrome/Edge
        e.returnValue = ''; 
    }
});
// ================= BẮT SỰ KIỆN TẮT TAB / ĐÓNG TRÌNH DUYỆT (RAGE QUIT) =================
// Dùng 'pagehide' thay vì 'unload' sẽ bắt chính xác hơn 100% trên cả PC và Mobile
window.addEventListener('pagehide', () => {
    if (isRankedMatch && !isPvE && playerRole !== null && gameActive && boardData.size > 0) {
        const token = localStorage.getItem('caro_token');
        if (!token) return;

        let oppNameEl = document.getElementById('player2Name');
        let oppName = oppNameEl ? oppNameEl.innerText.replace(' (O)', '').replace(' (X)', '').replace('ID: ', '') : 'Unknown';

        // Chuẩn bị án phạt
        const payload = JSON.stringify({
            opponentName: oppName,
            mode: 'PvP',
            rule: winCondition,
            scoreMe: scorePlayer,
            scoreEnemy: scoreBot + 1, // --- BỔ SUNG +1 TẠI ĐÂY ---
            result: 'LOSE',       // Xử thua ngay lập tức
            isAfkPenalty: true,   // Kích hoạt án phạt trừ thêm 3 ELO
            noteText: 'Rage Quit (Thoát Web)' 
        });

        // Bắn phát súng cuối cùng lên Server ở dưới nền (Dù web đã đóng)
        fetch(`${serverUrl}/api/match/record`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: payload,
            keepalive: true // Phép thuật giúp duy trì kết nối vài mili-giây cuối cùng
        }).catch(err => {
            // Ém lỗi đi nếu trình duyệt không hỗ trợ, không cho hiện đỏ lòm console
        });
    }
});
// =====================================================================
// BẢNG XẾP HẠNG ELO
// =====================================================================
document.getElementById('btnLeaderboard').addEventListener('click', async () => {
    const modal = document.getElementById('leaderboardModal');
    const content = document.getElementById('leaderboardContent');
    modal.style.display = 'flex';
    if (typeof pushFakeHistory === 'function') pushFakeHistory();
    content.innerHTML = '<p>Đang tải...</p>';
    
    try {
        const res = await fetch(`${serverUrl}/api/leaderboard?limit=100`);
        const data = await res.json();
        
        if (!Array.isArray(data) || data.length === 0) {
            content.innerHTML = '<p>Chưa có dữ liệu xếp hạng.</p>';
            return;
        }
        
        let html = `
            <table style="width:100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="background: #2c3e50; color: white;">
                        <th style="padding: 8px;">#</th>
                        <th style="padding: 8px; text-align: left;">Người chơi</th>
                        <th style="padding: 8px;">ELO</th>
                        <th style="padding: 8px;">Trận</th>
                        <th style="padding: 8px;">Winrate</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(p => {
            // Top 3 có icon huy chương
            let rankCell = p.rank;
            if (p.rank === 1) rankCell = '🥇';
            else if (p.rank === 2) rankCell = '🥈';
            else if (p.rank === 3) rankCell = '🥉';
            
            // Highlight nếu là chính mình
            const isMe = p.username === localStorage.getItem('caro_username'); 
            const rowStyle = isMe 
                ? 'background:#fef3c7; font-weight: bold;' 
                : (p.rank % 2 === 0 ? 'background:#f9fafb;' : '');
            
            html += `
                <tr style="${rowStyle} border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 8px; text-align: center;">${rankCell}</td>
                    <td style="padding: 8px;">${escapeHtml(p.username)} ${isMe ? '(Bạn)' : ''}</td>
                    <td style="padding: 8px; text-align: center; font-weight: bold; color: #f59e0b;">${p.elo}</td>
                    <td style="padding: 8px; text-align: center;">${p.total_matches}</td>
                    <td style="padding: 8px; text-align: center;">${p.winrate}%</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        content.innerHTML = html;
    } catch (err) {
        content.innerHTML = `<p style="color:red;">Lỗi: ${err.message}</p>`;
    }
});

// =====================================================================
// DỰ KHÁN (SPECTATOR) - Step 3.3 Phần C
// =====================================================================
const btnSpectate = document.getElementById('btnSpectate');
const spectateModal = document.getElementById('spectateModal');
const closeSpectateModal = document.getElementById('closeSpectateModal');
const inputSpectateCode = document.getElementById('inputSpectateCode');
const btnDoSpectate = document.getElementById('btnDoSpectate');
const spectateStatus = document.getElementById('spectateStatus');

// Mở modal nhập mã phòng dự khán
if (btnSpectate) {
    btnSpectate.addEventListener('click', () => {
        if (spectateModal) spectateModal.style.display = 'flex';
        if (spectateStatus) spectateStatus.innerText = '';
        if (inputSpectateCode) inputSpectateCode.value = '';
        if (typeof pushFakeHistory === 'function') pushFakeHistory();
    });
}

// Đóng modal
if (closeSpectateModal) {
    closeSpectateModal.addEventListener('click', () => {
        if (spectateModal) spectateModal.style.display = 'none';
    });
}
window.addEventListener('click', (event) => {
    if (event.target === spectateModal) spectateModal.style.display = 'none';
});

// Gửi yêu cầu dự khán
function doSpectate() {
    const numbers = (inputSpectateCode.value || '').trim();
    if (!/^\d{4}$/.test(numbers)) {
        spectateStatus.innerText = 'Vui lòng nhập đúng 4 số phòng (VD: 5123)!';
        spectateStatus.style.color = '#e74c3c';
        return;
    }
    const ruleDigit = numbers.charAt(0);
    if (ruleDigit !== '3' && ruleDigit !== '5') {
        spectateStatus.innerText = 'Mã không hợp lệ! Số đầu tiên phải là 3 hoặc 5.';
        spectateStatus.style.color = '#e74c3c';
        return;
    }
    if (!socket || !socket.connected) {
        spectateStatus.innerText = 'Mất kết nối server!';
        spectateStatus.style.color = '#e74c3c';
        return;
    }
    spectateStatus.innerText = 'Đang vào phòng dự khán...';
    spectateStatus.style.color = '#f1c40f';
    socket.emit('spectate_room', 'CARO' + numbers);
}

if (btnDoSpectate) btnDoSpectate.addEventListener('click', doSpectate);
if (inputSpectateCode) {
    inputSpectateCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            doSpectate();
        }
    });
}

// Helper: chống XSS khi render tên user
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// =====================================================================
// ADMIN PANEL - Chỉ hiện nếu role === 'admin'
// =====================================================================

// Kiểm tra role sau khi đăng nhập, thêm nút Admin nếu là admin
function checkAdminAccess() {
    const role = localStorage.getItem('caro_role');
    if (role === 'admin') {
        // Tạo nút admin trên top bar nếu chưa có
        if (!document.getElementById('btnAdmin')) {
            const adminBtn = document.createElement('button');
            adminBtn.id = 'btnAdmin';
            adminBtn.className = 'user-icon-btn';
            adminBtn.style.cssText = 'right: 80px; background-color: #dc2626;';
            adminBtn.innerHTML = '⚙️';
            adminBtn.title = 'Admin Panel';
            adminBtn.onclick = () => {
                document.getElementById('adminModal').style.display = 'flex';
                loadAdminUsers();
                // Bơm fake history để vuốt back đóng admin modal thay vì thoát web
                if (typeof pushFakeHistory === 'function') pushFakeHistory();
            };
            document.body.appendChild(adminBtn);
            const adminInput = document.getElementById('adminSearchInput');
            if (adminInput) {
                adminInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        loadAdminUsers();
                    }
                });
            }
        }
    }
}

// Gọi sau khi đăng nhập thành công

async function loadAdminUsers() {
    const adminModal = document.getElementById('adminModal');
    if (adminModal) adminModal.dataset.view = 'users';
    const search = document.getElementById('adminSearchInput').value.trim();
    const list = document.getElementById('adminUserList');
    list.innerHTML = '<p>Đang tải...</p>';
    
    try {
        const res = await fetch(`${serverUrl}/api/admin/users?search=${encodeURIComponent(search)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('caro_token')}` }
        });
        if (!res.ok) {
            const err = await res.json();
            list.innerHTML = `<p style="color:red;">${err.message}</p>`;
            return;
        }
        const data = await res.json();
        
        if (data.users.length === 0) {
            list.innerHTML = '<p>Không tìm thấy user nào.</p>';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        data.users.forEach(u => {
            const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
            const banLabel = isBanned 
                ? (new Date(u.banned_until).getFullYear() >= 9999 
                    ? '🚫 BAN VĨNH VIỄN' 
                    : `🚫 Ban đến ${new Date(u.banned_until).toLocaleString('vi-VN')}`)
                : '✅ OK';
            const roleColor = u.role === 'admin' ? '#dc2626' : '#374151';
            let matrixHtml = '';
            if (u.role !== 'admin') {
                const stats = {
                    'PvP-3': {w:0,t:0}, 'PvP-5': {w:0,t:0},
                    'PvE-E-3': {w:0,t:0}, 'PvE-E-5': {w:0,t:0},
                    'PvE-M-3': {w:0,t:0}, 'PvE-M-5': {w:0,t:0},
                    'PvE-H-3': {w:0,t:0}, 'PvE-H-5': {w:0,t:0}
                };
                (u.history || []).forEach(m => {
                    const k = `${m.mode}-${m.rule}`;
                    if (stats[k] !== undefined) {
                        stats[k].t++;
                        if (m.result === 'WIN') stats[k].w++;
                    }
                });
                const wr = (k) => stats[k].t === 0 
                    ? '<span style="color:#9ca3af;">--</span>' 
                    : `${((stats[k].w/stats[k].t)*100).toFixed(2)}%`;
                matrixHtml = `
                    <div class="admin-matrix-grid">
                        <div style="background:#2c3e50; color:white;">Chế độ</div>
                        <div style="background:#2c3e50; color:white;">PvE-E</div>
                        <div style="background:#2c3e50; color:white;">PvE-M</div>
                        <div style="background:#2c3e50; color:white;">PvE-H</div>
                        <div style="background:#e74c3c; color:white;">PvP</div>
                        <div style="background:#34495e; color:white;">Luật 3</div>
                        <div style="background:#ecf0f1;">${wr('PvE-E-3')}</div>
                        <div style="background:#ecf0f1;">${wr('PvE-M-3')}</div>
                        <div style="background:#ecf0f1;">${wr('PvE-H-3')}</div>
                        <div style="background:#ecf0f1;">${wr('PvP-3')}</div>
                        <div style="background:#34495e; color:white;">Luật 5</div>
                        <div style="background:#ecf0f1;">${wr('PvE-E-5')}</div>
                        <div style="background:#ecf0f1;">${wr('PvE-M-5')}</div>
                        <div style="background:#ecf0f1;">${wr('PvE-H-5')}</div>
                        <div style="background:#ecf0f1;">${wr('PvP-5')}</div>
                    </div>
                `;
            }
            html += `
                <div class="admin-user-card">
                    <div class="admin-grid">
                        
                        <!-- KHỐI 1: Tên + Trạng thái + ELO -->
                        <div class="admin-info">
                            <div>
                                <strong style="font-size: 14px;">${escapeHtml(u.username)}</strong>
                                <span style="font-size: 11px; color: #6b7280;"> (ID: ${u.user_id})</span>
                            </div>
                            ${u.role === 'admin' ? '<div style="margin-top: 3px;"><span style="background:#dc2626; color:white; padding:2px 6px; border-radius:4px; font-size: 11px; font-weight: bold;">ADMIN</span></div>' : ''}
                            <div style="font-size: 12px; margin-top: 4px;">Trạng thái: ${banLabel}</div>
                            ${u.ban_reason ? `<div style="font-size:11px; color:#dc2626;">Lý do: ${escapeHtml(u.ban_reason)}</div>` : ''}
                            <div style="font-size: 13px; margin-top: 4px;">ELO: <strong style="color:#f59e0b;">${u.elo}</strong></div>
                        </div>
                        
                        <!-- KHỐI 2: Ma trận tỉ lệ thắng -->
                        <div class="admin-matrix">
                            ${u.role === 'admin' 
                                ? '<div style="text-align: center; color: #9ca3af; font-style: italic; font-size: 13px;">— Không có thống kê cho admin —</div>'
                                : matrixHtml}
                        </div>
                        
                        <!-- KHỐI 3: 3 nút -->
                        <div class="admin-actions">
                            ${u.role !== 'admin' ? `
                                <button class="btn-small" onclick="adminBanUser(${u.user_id}, '${escapeHtml(u.username)}')" style="background:#fee2e2;">Ban</button>
                                <button class="btn-small" onclick="adminUnbanUser(${u.user_id})" style="background:#d1fae5;">Unban</button>
                                <button class="btn-small" onclick="adminBuffElo(${u.user_id})" style="background:#fef3c7;">±ELO</button>
                            ` : `
                                <button class="btn-small" onclick="adminBuffElo(${u.user_id})" style="background:#fef3c7;">±ELO</button>
                            `}
                        </div>
                        
                    </div>
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = `<p style="color:red;">Lỗi: ${err.message}</p>`;
    }
}

async function adminBanUser(userId, username) {
    const choice = prompt(
        `Ban user "${username}":\n` +
        `Nhập số giờ ban (vd: 1, 24, 720)\n` +
        `Hoặc nhập -1 để ban VĨNH VIỄN:`,
        '24'
    );
    if (choice === null) return;
    const hours = parseInt(choice);
    if (isNaN(hours)) return alert('Số giờ không hợp lệ!');
    
    const reason = prompt('Lý do ban:', 'Vi phạm điều khoản');
    if (reason === null) return;
    
    try {
        const res = await fetch(`${serverUrl}/api/admin/ban`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('caro_token')}`
            },
            body: JSON.stringify({ userId, durationHours: hours, reason })
        });
        const data = await res.json();
        alert(data.message);
        loadAdminUsers();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function adminUnbanUser(userId) {
    if (!confirm('Gỡ ban user này?')) return;
    try {
        const res = await fetch(`${serverUrl}/api/admin/ban`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('caro_token')}`
            },
            body: JSON.stringify({ userId, durationHours: 0, reason: 'Gỡ ban' })
        });
        const data = await res.json();
        alert(data.message);
        loadAdminUsers();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function adminBuffElo(userId) {
    const delta = prompt('Nhập số ELO cộng/trừ (vd: 500, -100):', '100');
    if (delta === null) return;
    const d = parseInt(delta);
    if (isNaN(d)) return alert('Số không hợp lệ!');
    
    const reason = prompt('Lý do:', 'Test');
    if (reason === null) return;
    
    try {
        const res = await fetch(`${serverUrl}/api/admin/buff-elo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('caro_token')}`
            },
            body: JSON.stringify({ userId, deltaElo: d, reason })
        });
        const data = await res.json();
        alert(`OK! ELO mới: ${data.newElo}`);
        loadAdminUsers();
    } catch (err) {
        alert('Lỗi: ' + err.message);
    }
}

async function loadAdminLogs() {
    const adminModal = document.getElementById('adminModal');
    if (adminModal) adminModal.dataset.view = 'logs';
    if (typeof pushFakeHistory === 'function') pushFakeHistory();
    const list = document.getElementById('adminUserList');
    list.innerHTML = '<p>Đang tải lịch sử...</p>';
    
    try {
        const res = await fetch(`${serverUrl}/api/admin/logs?limit=100`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('caro_token')}` }
        });
        const logs = await res.json();
        
        if (logs.length === 0) {
            list.innerHTML = '<p>Chưa có lịch sử nào.</p>';
            return;
        }
        
        let html = '<h3>📜 Lịch sử hành động admin (100 gần nhất)</h3>';
        html += '<div style="display: flex; flex-direction: column; gap: 6px;">';
        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleString('vi-VN');
            const actionColor = {
                'BAN': '#dc2626', 'UNBAN': '#16a34a',
                'BUFF_ELO': '#f59e0b', 'DELETE_USER': '#7f1d1d',
                'RESET_PASSWORD': '#3b82f6'
            }[log.action_type] || '#374151';
            
            html += `
                <div style="border-left: 4px solid ${actionColor}; padding: 8px 12px; background: #f9fafb; font-size: 13px;">
                    <span style="color: ${actionColor}; font-weight: bold;">${log.action_type}</span>
                    bởi <strong>${escapeHtml(log.admin_name || 'Unknown')}</strong>
                    → <strong>${escapeHtml(log.target_name || 'Deleted user')}</strong>
                    <br>
                    <span style="font-size: 12px; color: #6b7280;">${time}</span> — ${escapeHtml(log.detail || '')}
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = `<p style="color:red;">Lỗi: ${err.message}</p>`;
    }
}
// Nút X của admin modal: nếu đang xem logs → quay lại danh sách user
// Nếu đang ở danh sách user → đóng hẳn modal
function handleAdminClose() {
    const adminModal = document.getElementById('adminModal');
    if (!adminModal) return;
    
    if (adminModal.dataset.view === 'logs') {
        // Đang xem logs → quay lại danh sách user
        loadAdminUsers();
    } else {
        // Đang ở danh sách user → đóng hẳn modal
        adminModal.style.display = 'none';
    }
}
// =====================================================================
// PHÍM ESC = nút X / nút Back
// Logic giống popstate handler, nhưng kích hoạt bằng phím Escape trên desktop
// =====================================================================
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    
    // Nếu đang gõ trong input/textarea, đừng can thiệp
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
        // Cho phép user thoát focus khỏi input bằng ESC
        document.activeElement.blur();
        return;
    }
    
    // ƯU TIÊN 0 — Modal Replay (stack trên cùng)
    if (isReplayOpen) {
        if (window.history && window.history.length > 1) window.history.back();
        else closeReplayModal();
        return;
    }

    // ƯU TIÊN 1 — Admin Panel
    const adminModal = document.getElementById('adminModal');
    if (adminModal && adminModal.style.display === 'flex') {
        handleAdminClose();
        return;
    }
    
    // ƯU TIÊN 2 — Modal hồ sơ người chơi khác
    if (searchProfileModal && searchProfileModal.style.display === 'flex') {
        searchProfileModal.style.display = 'none';
        userModal.style.display = 'flex'; // Trả về Trung tâm Tài khoản
        return;
    }
    
    // ƯU TIÊN 3 — Trung tâm tài khoản (xử lý cả các view con)
    if (userModal && userModal.style.display === 'flex') {
        if (userEditView && userEditView.style.display === 'block') {
            userEditView.style.display = 'none';
            userInfoView.style.display = 'block';
        } else if (userHistoryView && userHistoryView.style.display === 'block') {
            userHistoryView.style.display = 'none';
            userInfoView.style.display = 'block';
        } else {
            userModal.style.display = 'none';
        }
        return;
    }
    
    // ƯU TIÊN 4 — Bảng xếp hạng
    const leaderboardModal = document.getElementById('leaderboardModal');
    if (leaderboardModal && leaderboardModal.style.display === 'flex') {
        leaderboardModal.style.display = 'none';
        return;
    }
    
    // ƯU TIÊN 5 — Popup PvP
    if (pvpModal && pvpModal.style.display === 'flex') {
        pvpModal.style.display = 'none';
        return;
    }

    // ƯU TIÊN 6 — Modal nhập mã dự khán
    const spectateModalEsc = document.getElementById('spectateModal');
    if (spectateModalEsc && spectateModalEsc.style.display === 'flex') {
        spectateModalEsc.style.display = 'none';
        return;
    }
});
// =====================================================================
// KHUNG CHAT PvP - Step 3.1
// =====================================================================
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatRoomCode = document.getElementById('chatRoomCode');
const chatToggleBtn = document.getElementById('chatToggleBtn');
const chatCloseBtn = document.getElementById('chatCloseBtn');
const chatUnreadDot = document.getElementById('chatUnreadDot');

let isChatOpen = false;       // mobile only - desktop luôn hiện
let chatHasUnread = false;
let chatCurrentRoom = null;   // mã phòng đang chat

// Helper: kiểm tra có phải mobile không (dùng cùng breakpoint 900px như CSS)
function isMobileView() {
    // Dùng innerWidth thay vì matchMedia cho tương thích tốt hơn với Edge DevTools
    return window.innerWidth <= 900;
}

// Hiện khung chat (gọi khi vào trận PvP online hoặc khi dự khán).
// chatHistory: mảng tin nhắn cũ của phòng (chỉ dùng khi khán giả vào giữa trận).
function showChatForRoom(roomCode, isSpectate, chatHistory) {
    chatCurrentRoom = roomCode;
    if (chatRoomCode) chatRoomCode.innerText = roomCode || '--';
    if (chatMessages) chatMessages.innerHTML = '';

    if (isMobileView()) {
        if (chatToggleBtn) chatToggleBtn.style.display = 'flex';
        if (chatContainer) {
            chatContainer.style.display = 'none';
            // Xoá vị trí inline của layout desktop để CSS popup mobile có hiệu lực
            chatContainer.style.left = '';
            chatContainer.style.top = '';
        }
        isChatOpen = false;
    } else {
        if (chatContainer) chatContainer.style.display = 'flex';
        if (chatToggleBtn) chatToggleBtn.style.display = 'none';
        // ===== THÊM: Tính lại vị trí cạnh bàn cờ =====
        // Đợi 1 tick để gameScreen render xong rồi mới tính
        setTimeout(positionChatBesideCanvas, 50);
    }

    // Dựng lại toàn bộ tin nhắn cũ của phòng (cho khán giả vào giữa trận)
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        const myUsername = localStorage.getItem('caro_username');
        for (const m of chatHistory) {
            if (m.isSystem) {
                appendChatSystem(m.text);
            } else {
                appendChatMessage(m.username, m.text, {
                    isSpectator: m.isSpectator,
                    isSelf: (m.username === myUsername)
                });
            }
        }
        appendChatSystem('— Tin nhắn cũ ở trên —');
    }

    appendChatSystem(isSpectate
        ? `Bạn đang dự khán phòng ${roomCode}`
        : `🎮 Trận bắt đầu! Mã phòng: ${roomCode}`);
}
// Tính lại vị trí khung chat sao cho nằm cạnh phải bàn cờ
function positionChatBesideCanvas() {
    if (!chatContainer || isMobileView()) return; // mobile dùng layout khác
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    chatContainer.style.left = (rect.right + 20) + 'px';
    chatContainer.style.top = rect.top + 'px';
}

// Ẩn khung chat (gọi khi rời trận PvP)
function hideChatBox() {
    if (chatContainer) chatContainer.style.display = 'none';
    if (chatToggleBtn) chatToggleBtn.style.display = 'none';
    chatCurrentRoom = null;
    chatHasUnread = false;
    if (chatUnreadDot) chatUnreadDot.style.display = 'none';
}

// Toggle chat trên mobile
if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
        if (!isChatOpen) {
            // MỞ chat → bơm lịch sử ảo để vuốt back đóng chat
            isChatOpen = true;
            if (chatContainer) {
                // Bỏ vị trí inline desktop nếu còn sót → dùng đúng CSS popup mobile
                chatContainer.style.left = '';
                chatContainer.style.top = '';
                chatContainer.style.display = 'flex';
            }
            chatHasUnread = false;
            if (chatUnreadDot) chatUnreadDot.style.display = 'none';
            if (chatInput) chatInput.focus();
            if (typeof pushFakeHistory === 'function') pushFakeHistory();
        } else {
            // ĐÓNG chat
            isChatOpen = false;
            if (chatContainer) chatContainer.style.display = 'none';
        }
    });
}

// Nút X trên mobile (chỉ đóng khung chat, không thoát phòng)
if (chatCloseBtn) {
    chatCloseBtn.addEventListener('click', () => {
        // KHÔNG tự set display='none' ở đây — để popstate handler tự xử lý
        // Lý do: nếu set 'none' trước rồi mới back(), popstate firing sẽ thấy
        // display='none' → bỏ qua khối chat → tụt xuống xử lý gameScreen → RAGE QUIT
        // Cách đúng: chỉ gọi history.back(), popstate sẽ tự đóng chat khi thấy display='flex'
        if (window.history && window.history.length > 1) {
            window.history.back();
        } else {
            // Fallback hiếm gặp: nếu không có history thì tự đóng
            if (chatContainer) chatContainer.style.display = 'none';
            isChatOpen = false;
        }
    });
}

// Khi resize từ mobile sang desktop hoặc ngược lại
window.addEventListener('resize', () => {
    if (!chatCurrentRoom) return;  // không trong trận thì kệ
    if (isMobileView()) {
        if (chatToggleBtn) chatToggleBtn.style.display = 'flex';
        if (chatContainer) {
            // Xoá vị trí inline desktop → trả khung chat về layout popup mobile
            chatContainer.style.left = '';
            chatContainer.style.top = '';
            if (!isChatOpen) chatContainer.style.display = 'none';
        }
    } else {
        if (chatToggleBtn) chatToggleBtn.style.display = 'none';
        if (chatContainer) chatContainer.style.display = 'flex';
        positionChatBesideCanvas();
    }
});

// Append tin nhắn vào khung
function appendChatMessage(username, text, opts = {}) {
    if (!chatMessages) return;
    const msg = document.createElement('div');
    msg.className = 'chat-msg' + (opts.isSpectator ? ' spectator' : '') + (opts.isSelf ? ' self' : '');
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.innerText = username;
    
    const textSpan = document.createElement('span');
    textSpan.innerText = ': ' + text;
    
    msg.appendChild(nameSpan);
    msg.appendChild(textSpan);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Đánh dấu chưa đọc nếu chat đang đóng (mobile)
    if (isMobileView() && !isChatOpen) {
        chatHasUnread = true;
        if (chatUnreadDot) chatUnreadDot.style.display = 'block';
    }
}

function appendChatSystem(text) {
    if (!chatMessages) return;
    const msg = document.createElement('div');
    msg.className = 'chat-msg system';
    msg.innerText = '— ' + text + ' —';
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Xử lý lệnh /code, /help
function handleChatCommand(text) {
    const cmd = text.trim().toLowerCase();
    if (cmd === '/code') {
        appendChatSystem(`Mã phòng hiện tại: ${chatCurrentRoom || '?'}`);
        return true;
    }
    if (cmd === '/help') {
        appendChatSystem(`Lệnh khả dụng: /code (xem mã phòng), /help (xem lệnh)`);
        return true;
    }
    return false;
}

// Gửi tin nhắn
function sendChatMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    
    // Xử lý command
    if (text.startsWith('/')) {
        if (handleChatCommand(text)) {
            chatInput.value = '';
            return;
        }
        // Lệnh không hợp lệ → hiện thông báo
        appendChatSystem(`Lệnh "${text}" không tồn tại. Gõ /help để xem danh sách.`);
        chatInput.value = '';
        return;
    }
    
    // Kiểm tra socket và phòng
    if (!socket || !socket.connected) {
        appendChatSystem('⚠️ Mất kết nối server');
        return;
    }
    if (!chatCurrentRoom) {
        appendChatSystem('⚠️ Không có phòng để chat');
        return;
    }
    
    socket.emit('chat_message', {
        room: chatCurrentRoom,
        text: text
    });
    chatInput.value = '';
}

if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
        // Không cho ESC đóng modal nào — ESC chỉ blur khỏi input
    });
}

// Cài đặt socket listeners cho chat (gọi 1 lần khi initSocket)
function setupChatSocketListeners() {
    if (!socket) return;
    
    socket.on('chat_received', (data) => {
        // Tin nhắn hệ thống (khán giả vào/rời phòng...)
        if (data.isSystem) {
            appendChatSystem(data.text);
            return;
        }
        const myUsername = localStorage.getItem('caro_username');
        const isSelf = (data.username === myUsername);
        appendChatMessage(data.username, data.text, {
            isSpectator: data.isSpectator,
            isSelf: isSelf
        });
    });
    
    socket.on('chat_error', (msg) => {
        appendChatSystem('⚠️ ' + msg);
    });
}
// =====================================================================
// THÁCH ĐẤU TRỰC TIẾP - Step 3.3
// =====================================================================

// State client cho challenge
let currentSentChallengeId = null;       // id challenge mình vừa gửi
let currentReceivedChallengeId = null;   // id challenge người khác gửi đến mình
let challengeCountdownTimer = null;      // setInterval cho đếm ngược

// Helper: dừng đếm ngược
function stopChallengeCountdown() {
    if (challengeCountdownTimer) {
        clearInterval(challengeCountdownTimer);
        challengeCountdownTimer = null;
    }
}

// Helper: chạy đếm ngược 30s, update vào element chỉ định
function startChallengeCountdown(elementId, onTimeout) {
    stopChallengeCountdown();
    let seconds = 30;
    const el = document.getElementById(elementId);
    if (el) el.innerText = seconds;
    challengeCountdownTimer = setInterval(() => {
        seconds--;
        if (el) el.innerText = seconds;
        if (seconds <= 0) {
            stopChallengeCountdown();
            if (onTimeout) onTimeout();
        }
    }, 1000);
}

// ===== GỬI LỜI MỜI =====
const btnSendChallenge = document.getElementById('btnSendChallenge');
const challengeTargetInput = document.getElementById('challengeTargetInput');
if (btnSendChallenge) {
    btnSendChallenge.addEventListener('click', () => {
        const target = (challengeTargetInput.value || '').trim();
        if (!target) {
            pvpStatus.innerText = 'Vui lòng nhập tên đối thủ!';
            pvpStatus.style.color = '#e74c3c';
            return;
        }
        const rule = document.getElementById('pvpWinCondition').value;
        if (!socket || !socket.connected) {
            pvpStatus.innerText = 'Mất kết nối server!';
            pvpStatus.style.color = '#e74c3c';
            return;
        }
        socket.emit('send_challenge', { targetUsername: target, rule: rule });
    });
}

// Enter trong ô tên đối thủ → click Gửi
if (challengeTargetInput) {
    challengeTargetInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (btnSendChallenge) btnSendChallenge.click();
        }
    });
}

// ===== POPUP: ĐANG CHỜ ĐỐI THỦ (phía người gửi) =====
const challengeWaitingModal = document.getElementById('challengeWaitingModal');
const btnCancelChallenge = document.getElementById('btnCancelChallenge');

function showChallengeWaitingModal(targetUsername, rule) {
    document.getElementById('challengeWaitingTarget').innerText = targetUsername;
    document.getElementById('challengeWaitingRule').innerText = `Luật ${rule} quân`;
    challengeWaitingModal.style.display = 'flex';
    if (typeof pushFakeHistory === 'function') pushFakeHistory();
    startChallengeCountdown('challengeWaitingCountdown', () => {
        // Timeout đã xử lý ở server, client chỉ cần đợi event challenge_timeout
    });
}

function hideChallengeWaitingModal() {
    challengeWaitingModal.style.display = 'none';
    stopChallengeCountdown();
}

// THÊM: Đổi nội dung waiting modal thành trạng thái kết quả, tự đóng sau 2s
// Dùng khi đối thủ từ chối, timeout, hoặc disconnect — không xài alert() để tránh giật trên mobile
function showChallengeResult(title, message, color) {
    if (!challengeWaitingModal) return;
    // Đảm bảo modal đang hiển thị (trường hợp event đến quá muộn)
    if (challengeWaitingModal.style.display !== 'flex') {
        challengeWaitingModal.style.display = 'flex';
    }
    
    // Dừng đếm ngược
    stopChallengeCountdown();
    
    // Thay nội dung trong modal
    const content = challengeWaitingModal.querySelector('.modal-content');
    if (content) {
        content.innerHTML = `
            <h2 style="color: ${color}; margin-top: 0;">${title}</h2>
            <p style="font-size: 15px;">${message}</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">Tự đóng sau <span id="autoCloseCountdown">2</span>s...</p>
        `;
    }
    
    // Đếm ngược 2s rồi tự đóng
    let sec = 2;
    const cdEl = document.getElementById('autoCloseCountdown');
    const interval = setInterval(() => {
        sec--;
        if (cdEl) cdEl.innerText = sec;
        if (sec <= 0) {
            clearInterval(interval);
            challengeWaitingModal.style.display = 'none';
            // Phục hồi nội dung gốc của modal để lần sau dùng lại
            restoreChallengeWaitingModalContent();
        }
    }, 1000);
}

// Phục hồi nội dung gốc của challengeWaitingModal sau khi đã đổi (cho các lần dùng sau)
function restoreChallengeWaitingModalContent() {
    const content = challengeWaitingModal.querySelector('.modal-content');
    if (!content) return;
    content.innerHTML = `
        <h2 style="color: #000; margin-top: 0;">⏳ Đang chờ phản hồi...</h2>
        <p>Đã gửi thách đấu đến<br><b id="challengeWaitingTarget" style="color: #e67e22;">--</b></p>
        <p>Luật: <b id="challengeWaitingRule" style="color: #000;">--</b></p>
        <p style="color: #6b7280; font-size: 13px;">Còn lại: <span id="challengeWaitingCountdown">30</span>s</p>
        <button id="btnCancelChallenge" class="btn-primary" style="background-color: #6b7280; margin-top: 10px;">Hủy lời mời</button>
    `;
    // Re-bind sự kiện click cho nút Hủy mới (vì element cũ đã bị thay)
    const newBtnCancel = document.getElementById('btnCancelChallenge');
    if (newBtnCancel) {
        newBtnCancel.addEventListener('click', () => {
            if (currentSentChallengeId && socket && socket.connected) {
                socket.emit('cancel_challenge', { challengeId: currentSentChallengeId });
            }
            currentSentChallengeId = null;
            hideChallengeWaitingModal();
        });
    }
}

if (btnCancelChallenge) {
    btnCancelChallenge.addEventListener('click', () => {
        if (currentSentChallengeId && socket && socket.connected) {
            socket.emit('cancel_challenge', { challengeId: currentSentChallengeId });
        }
        currentSentChallengeId = null;
        hideChallengeWaitingModal();
    });
}

// ===== POPUP: NHẬN LỜI MỜI (phía người nhận) =====
const challengeReceivedModal = document.getElementById('challengeReceivedModal');
const btnAcceptChallenge = document.getElementById('btnAcceptChallenge');
const btnDeclineChallenge = document.getElementById('btnDeclineChallenge');

function showChallengeReceivedModal(challengeId, fromUsername, rule) {
    currentReceivedChallengeId = challengeId;
    document.getElementById('challengeFromUsername').innerText = fromUsername;
    document.getElementById('challengeReceivedRule').innerText = `Luật ${rule} quân`;
    challengeReceivedModal.style.display = 'flex';
    if (typeof pushFakeHistory === 'function') pushFakeHistory();
    startChallengeCountdown('challengeReceivedCountdown', () => {
        hideChallengeReceivedModal();
        currentReceivedChallengeId = null;
    });
}

function hideChallengeReceivedModal() {
    challengeReceivedModal.style.display = 'none';
    stopChallengeCountdown();
}

if (btnAcceptChallenge) {
    btnAcceptChallenge.addEventListener('click', () => {
        if (!currentReceivedChallengeId || !socket || !socket.connected) return;
        
        // Nếu đang trong PvE hoặc Local PvP, kết thúc trận trước rồi mới accept
        if (gameActive && (isPvE || (!isOnline && playerRole !== null))) {
            // Kết thúc PvE/Local: cộng/trừ ELO bình thường (không phải afk penalty)
            // Đơn giản nhất: finalize ngay với tỉ số hiện tại
            finalizeBeforeChallenge();
        }
        
        socket.emit('accept_challenge', { challengeId: currentReceivedChallengeId });
        currentReceivedChallengeId = null;
        hideChallengeReceivedModal();
    });
}

if (btnDeclineChallenge) {
    btnDeclineChallenge.addEventListener('click', () => {
        if (currentReceivedChallengeId && socket && socket.connected) {
            socket.emit('decline_challenge', { challengeId: currentReceivedChallengeId });
        }
        currentReceivedChallengeId = null;
        hideChallengeReceivedModal();
    });
}

// Kết thúc trận PvE/Local trước khi accept challenge (không phạt AFK)
function finalizeBeforeChallenge() {
    // Tắt game state, xóa bàn cờ, đóng UI trận
    gameActive = false;
    isBotThinking = false;
    boardData.clear();
    historyX = [];
    historyO = [];
    winningCells = [];
    lastMoveKey = null;
    
    // Nếu là PvE, ghi nhận trận đang chơi (nếu có quân) là HÒA / không tính
    // Đơn giản: skip ghi DB vì series chưa kết thúc proper
    // → ELO không đổi cho trận dở dang này
    
    // Reset UI
    if (gameScreen) gameScreen.style.display = 'none';
    isOnline = false;
    isPvE = false;
    isRankedMatch = false;
    playerRole = null;
    botRole = null;
}

// ===== SOCKET LISTENERS CHO CHALLENGE =====
function setupChallengeSocketListeners() {
    if (!socket) return;
    
    // Server đã nhận lời mời và đang chờ → hiện popup waiting cho mình
    socket.on('challenge_sent', (data) => {
        currentSentChallengeId = data.challengeId;
        // Đóng pvpModal trước
        if (pvpModal) pvpModal.style.display = 'none';
        showChallengeWaitingModal(data.targetUsername, data.rule);
    });
    
    // Có người gửi lời mời tới mình
    socket.on('challenge_received', (data) => {
        // Nếu đang trong trận PvP online → bỏ qua, server đã chặn nhưng phòng hờ
        if (isOnline && gameActive) return;
        
        showChallengeReceivedModal(data.challengeId, data.fromUsername, data.rule);
    });
    
    // Người nhận từ chối
    socket.on('challenge_declined', (data) => {
        currentSentChallengeId = null;
        // Đổi nội dung modal thành "đã từ chối" rồi tự đóng sau 2 giây
        showChallengeResult('❌ Đã từ chối', `${data.targetUsername} đã từ chối lời mời của bạn.`, '#e74c3c');
    });
    
    // Người nhận không phản hồi trong 30s
    socket.on('challenge_timeout', (data) => {
        currentSentChallengeId = null;
        showChallengeResult('⏰ Hết thời gian', `${data.targetUsername} không phản hồi lời mời (hết 30s).`, '#f39c12');
    });
    
    // Lời mời bị hủy (do người gửi hủy, hoặc server timeout cho người nhận)
    socket.on('challenge_cancelled', (data) => {
        if (data && data.challengeId === currentReceivedChallengeId) {
            currentReceivedChallengeId = null;
            hideChallengeReceivedModal();
        }
        // Cũng dọn waiting modal nếu liên quan
        if (data && data.challengeId === currentSentChallengeId) {
            currentSentChallengeId = null;
            hideChallengeWaitingModal();
        }
    });
    
    // Lỗi từ server (target offline, đang bận, spam, ...)
    socket.on('challenge_error', (msg) => {
        if (pvpStatus) {
            pvpStatus.innerText = msg;
            pvpStatus.style.color = '#e74c3c';
        } else {
            alert(msg);
        }
    });
}
// Nút Thách đấu trong hồ sơ người chơi khác
const btnChallengeFromProfile = document.getElementById('btnChallengeFromProfile');
if (btnChallengeFromProfile) {
    btnChallengeFromProfile.addEventListener('click', () => {
        const targetName = document.getElementById('searchedUsername').innerText.trim();
        if (!targetName || targetName === '...') {
            alert('Không tìm thấy tên người chơi!');
            return;
        }
        const rule = document.getElementById('challengeRuleFromProfile').value;
        if (!socket || !socket.connected) {
            alert('Mất kết nối server!');
            return;
        }
        // Đóng các modal đang mở để khỏi che
        const searchProfileModalEl = document.getElementById('searchProfileModal');
        const userModalEl = document.getElementById('userModal');
        if (searchProfileModalEl) searchProfileModalEl.style.display = 'none';
        if (userModalEl) userModalEl.style.display = 'none';

        socket.emit('send_challenge', { targetUsername: targetName, rule: rule });
    });
}

// =====================================================================
// TÍNH NĂNG REPLAY (XEM LẠI TRẬN ĐẤU)
// =====================================================================

// HTML nút "Xem lại" cho 1 dòng lịch sử đấu
function replayButtonHtml(match) {
    if (!match) return '';
    const id = match.history_id;
    if (match.has_replay) {
        return `<button class="btn-replay" onclick="openReplay(${id})">📼 Xem lại</button>`;
    }
    // Không có replay: phân biệt "hết hạn" (quá 30 ngày) vs "không có dữ liệu"
    const created = match.created_at ? new Date(match.created_at).getTime() : 0;
    const expired = created && (Date.now() - created > 30 * 24 * 60 * 60 * 1000);
    if (expired) {
        return `<button class="btn-replay" disabled title="Replay đã hết hạn (quá 30 ngày)">📼 Hết hạn</button>`;
    }
    return `<button class="btn-replay" disabled title="Trận này không có dữ liệu replay">📼 Không có</button>`;
}

// ===== STATE CHO MODAL REPLAY =====
let isReplayOpen = false;
let replayData = null;          // { moves: [[{x,y,player}],...], rule, mode, opponent_name, result }
let replayGameIndex = 0;        // đang xem ván thứ mấy
let replayMoveIndex = 0;        // đang ở nước thứ mấy (0 = bàn trống)
let replayPlaying = false;
let replaySpeed = 1;
let replayTimer = null;
let replaySnapshot = null;      // lưu state game hiện tại để khôi phục khi đóng
let replayCanvasOrigParent = null;
let replayCanvasOrigNext = null;

// Mở replay từ nút trong lịch sử đấu
async function openReplay(historyId) {
    try {
        const token = localStorage.getItem('caro_token');
        const res = await fetch(`${serverUrl}/api/replay/${historyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.message || 'Không tải được replay!');
            return;
        }
        openReplayModal(data);
    } catch (err) {
        alert('Lỗi kết nối khi tải replay!');
    }
}

// Mở modal replay với dữ liệu đã tải
function openReplayModal(data) {
    if (isReplayOpen) closeReplayModal(); // phòng trường hợp mở chồng

    let moves = data.moves;
    if (typeof moves === 'string') {
        try { moves = JSON.parse(moves); } catch (e) { moves = []; }
    }
    if (!Array.isArray(moves) || moves.length === 0) {
        alert('Replay rỗng hoặc lỗi dữ liệu!');
        return;
    }

    replayData = {
        moves: moves,
        rule: data.rule,
        mode: data.mode,
        opponent_name: data.opponent_name,
        result: data.result
    };
    replayGameIndex = 0;
    replayMoveIndex = 0;
    replayPlaying = false;
    replaySpeed = 1;
    const speedSel = document.getElementById('rpSpeed');
    if (speedSel) speedSel.value = '1';

    // Tiêu đề
    const resultText = data.result === 'WIN' ? 'Thắng'
        : (data.result === 'LOSE' ? 'Thua' : 'Hòa');
    const titleEl = document.getElementById('replayTitle');
    if (titleEl) {
        titleEl.innerText = `📼 Replay — vs ${data.opponent_name || '?'} | Luật ${data.rule} | ${resultText}`;
    }

    // Snapshot state game hiện tại để khôi phục khi đóng modal
    replaySnapshot = {
        boardData: new Map(boardData),
        historyX: [...historyX],
        historyO: [...historyO],
        winningCells: [...winningCells],
        winCondition: winCondition,
        minX: minX, maxX: maxX, minY: minY, maxY: maxY,
        cameraX: cameraOffset.x, cameraY: cameraOffset.y,
        cellSize: cellSize,
        lastMoveKey: lastMoveKey,
        gameActive: gameActive,
        canvasW: canvas.width, canvasH: canvas.height
    };
    gameActive = false; // chặn click đặt quân khi đang xem replay

    // Chuyển #gameCanvas vào trong modal
    replayCanvasOrigParent = canvas.parentNode;
    replayCanvasOrigNext = canvas.nextSibling;
    const slot = document.getElementById('replayCanvasSlot');
    if (slot) slot.appendChild(canvas);

    isReplayOpen = true;
    document.getElementById('replayModal').style.display = 'flex';
    if (typeof pushFakeHistory === 'function') pushFakeHistory();

    renderReplayGameTabs();
    replaySelectGame(0);
}

// Vẽ các tab chọn ván (chỉ hiện khi loạt trận có > 1 ván)
function renderReplayGameTabs() {
    const tabs = document.getElementById('replayGameTabs');
    if (!tabs || !replayData) return;
    if (replayData.moves.length <= 1) {
        tabs.style.display = 'none';
        tabs.innerHTML = '';
        return;
    }
    tabs.style.display = 'flex';
    tabs.innerHTML = '';
    replayData.moves.forEach((g, i) => {
        const b = document.createElement('button');
        b.className = 'replay-game-tab' + (i === replayGameIndex ? ' active' : '');
        b.innerText = `Ván ${i + 1}`;
        b.addEventListener('click', () => replaySelectGame(i));
        tabs.appendChild(b);
    });
}

// Chọn 1 ván để xem
function replaySelectGame(idx) {
    replayPause();
    replayGameIndex = idx;
    replayMoveIndex = 0;
    document.querySelectorAll('#replayGameTabs .replay-game-tab').forEach((b, i) => {
        b.classList.toggle('active', i === idx);
    });
    const game = replayData.moves[replayGameIndex] || [];
    winCondition = replayData.rule;
    replayComputeBounds(game);
    replaySizeCanvas(game);
    const slider = document.getElementById('replaySlider');
    if (slider) { slider.max = game.length; slider.value = 0; }
    replayRenderFrame();
}

// Tính biên bàn cờ ôm trọn các nước của ván
function replayComputeBounds(game) {
    if (replayData.rule === 3) {
        minX = -1; maxX = 1; minY = -1; maxY = 1;
        return;
    }
    if (!game.length) {
        minX = -8; maxX = 8; minY = -8; maxY = 8;
        return;
    }
    const xs = game.map(m => m.x), ys = game.map(m => m.y);
    minX = Math.min(...xs) - 3; maxX = Math.max(...xs) + 3;
    minY = Math.min(...ys) - 3; maxY = Math.max(...ys) + 3;
}

// Đặt kích thước canvas + camera cho modal replay
function replaySizeCanvas(game) {
    const size = Math.min(360, window.innerWidth - 70);
    canvas.width = size;
    canvas.height = size;
    if (replayData.rule === 3) {
        cellSize = size / 3;
        cameraOffset.x = canvas.width / 2;
        cameraOffset.y = canvas.height / 2;
    } else {
        cellSize = 40;
        let cx = 0, cy = 0;
        if (game.length) {
            cx = game.reduce((s, m) => s + m.x, 0) / game.length;
            cy = game.reduce((s, m) => s + m.y, 0) / game.length;
        }
        cameraOffset.x = canvas.width / 2 - cx * cellSize;
        cameraOffset.y = canvas.height / 2 - cy * cellSize;
    }
    clampCamera();
}

// Dựng lại boardData ở trạng thái sau k nước của ván hiện tại
function replayBuildBoard(k) {
    const game = replayData.moves[replayGameIndex] || [];
    boardData.clear();
    historyX = []; historyO = [];
    winningCells = [];
    lastMoveKey = null;
    const n = Math.max(0, Math.min(k, game.length));
    for (let i = 0; i < n; i++) {
        const mv = game[i];
        const key = `${mv.x},${mv.y}`;
        boardData.set(key, mv.player);
        lastMoveKey = key;
        if (replayData.rule === 3) {
            const hist = (mv.player === 'X') ? historyX : historyO;
            hist.push(key);
            if (hist.length > 3) boardData.delete(hist.shift());
        }
    }
    // Tô đường thắng nếu nước cuối hiển thị tạo thành chuỗi thắng
    if (n > 0) {
        const last = game[n - 1];
        checkWin({ x: last.x, y: last.y }, last.player);
    }
}

// Vẽ lại khung hình replay theo replayMoveIndex
function replayRenderFrame() {
    if (!replayData) return;
    replayBuildBoard(replayMoveIndex);
    drawBoard();
    const game = replayData.moves[replayGameIndex] || [];
    const counter = document.getElementById('replayCounter');
    if (counter) counter.innerText = `Nước ${replayMoveIndex} / ${game.length}`;
    const slider = document.getElementById('replaySlider');
    if (slider && Number(slider.value) !== replayMoveIndex) slider.value = replayMoveIndex;
}

// Nhảy tới nước thứ k
function replaySetMove(k) {
    const game = replayData.moves[replayGameIndex] || [];
    replayMoveIndex = Math.max(0, Math.min(k, game.length));
    replayRenderFrame();
}
function replayNext()  { replaySetMove(replayMoveIndex + 1); }
function replayPrev()  { replaySetMove(replayMoveIndex - 1); }
function replayFirst() { replaySetMove(0); }
function replayLast()  {
    const game = replayData.moves[replayGameIndex] || [];
    replaySetMove(game.length);
}

// Phát tự động
function replayPlay() {
    const game = replayData.moves[replayGameIndex] || [];
    if (replayMoveIndex >= game.length) replaySetMove(0); // ở cuối → phát lại từ đầu
    replayPlaying = true;
    updateReplayPlayBtn();
    replayScheduleTick();
}
function replayPause() {
    replayPlaying = false;
    if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; }
    updateReplayPlayBtn();
}
function replayScheduleTick() {
    if (replayTimer) clearTimeout(replayTimer);
    replayTimer = setTimeout(() => {
        if (!replayPlaying) return;
        const game = replayData.moves[replayGameIndex] || [];
        if (replayMoveIndex >= game.length) { replayPause(); return; }
        replaySetMove(replayMoveIndex + 1);
        const game2 = replayData.moves[replayGameIndex] || [];
        if (replayMoveIndex >= game2.length) { replayPause(); return; }
        replayScheduleTick();
    }, 1000 / replaySpeed);
}
function updateReplayPlayBtn() {
    const b = document.getElementById('rpPlay');
    if (b) b.innerText = replayPlaying ? '⏸ Dừng' : '▶ Phát';
}

// Đóng modal replay: trả #gameCanvas + khôi phục state game
function closeReplayModal() {
    if (!isReplayOpen) return;
    replayPause();
    const modal = document.getElementById('replayModal');
    if (modal) modal.style.display = 'none';

    // Trả #gameCanvas về đúng vị trí cũ trong #gameScreen
    if (replayCanvasOrigParent) {
        replayCanvasOrigParent.insertBefore(canvas, replayCanvasOrigNext);
    }
    // Khôi phục toàn bộ state game đã snapshot
    if (replaySnapshot) {
        boardData = replaySnapshot.boardData;
        historyX = replaySnapshot.historyX;
        historyO = replaySnapshot.historyO;
        winningCells = replaySnapshot.winningCells;
        winCondition = replaySnapshot.winCondition;
        minX = replaySnapshot.minX; maxX = replaySnapshot.maxX;
        minY = replaySnapshot.minY; maxY = replaySnapshot.maxY;
        cameraOffset.x = replaySnapshot.cameraX;
        cameraOffset.y = replaySnapshot.cameraY;
        cellSize = replaySnapshot.cellSize;
        lastMoveKey = replaySnapshot.lastMoveKey;
        gameActive = replaySnapshot.gameActive;
        canvas.width = replaySnapshot.canvasW;
        canvas.height = replaySnapshot.canvasH;
    }
    isReplayOpen = false;
    replayData = null;
    replaySnapshot = null;
    // Vẽ lại bàn cờ game nếu đang ở màn chơi
    if (gameScreen && gameScreen.style.display !== 'none') {
        drawBoard();
    }
}

// ===== WIRING NÚT ĐIỀU KHIỂN MODAL REPLAY =====
(function setupReplayControls() {
    const closeBtn = document.getElementById('closeReplayModal');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        if (window.history && window.history.length > 1) window.history.back();
        else closeReplayModal();
    });
    const rpFirst = document.getElementById('rpFirst');
    const rpPrev  = document.getElementById('rpPrev');
    const rpPlay  = document.getElementById('rpPlay');
    const rpNext  = document.getElementById('rpNext');
    const rpLast  = document.getElementById('rpLast');
    const rpSpeed = document.getElementById('rpSpeed');
    const slider  = document.getElementById('replaySlider');

    if (rpFirst) rpFirst.addEventListener('click', () => { replayPause(); replayFirst(); });
    if (rpPrev)  rpPrev.addEventListener('click',  () => { replayPause(); replayPrev();  });
    if (rpNext)  rpNext.addEventListener('click',  () => { replayPause(); replayNext();  });
    if (rpLast)  rpLast.addEventListener('click',  () => { replayPause(); replayLast();  });
    if (rpPlay)  rpPlay.addEventListener('click',  () => {
        if (replayPlaying) replayPause(); else replayPlay();
    });
    if (rpSpeed) rpSpeed.addEventListener('change', (e) => {
        replaySpeed = parseFloat(e.target.value) || 1;
        if (replayPlaying) replayScheduleTick(); // áp tốc độ mới ngay lập tức
    });
    if (slider) slider.addEventListener('input', (e) => {
        replayPause();
        replaySetMove(parseInt(e.target.value) || 0);
    });
})();