// ================= 1. KHỞI TẠO MÁY CHỦ =================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const activeUsers = new Map();
// Đặt một "chìa khóa" bảo mật cho JWT (Bạn có thể đổi chuỗi này thành bất kỳ gì)
const JWT_SECRET = 'HUST_CARO_SECRET_KEY';
// =====================================================================
// MIDDLEWARE: Xác thực token và kiểm tra role
// =====================================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Thiếu token!' });
    }
    try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, username, role }
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn!' });
    }
}

async function verifyAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Chỉ admin mới được truy cập!' });
    }
    next();
}

// Hàm hỗ trợ: Ghi log hành động của admin (audit trail)
async function logAdminAction(adminId, actionType, targetUserId, detail) {
    try {
        await db.query(
            'INSERT INTO admin_logs (admin_id, action_type, target_user_id, detail) VALUES (?, ?, ?, ?)',
            [adminId, actionType, targetUserId, detail]
        );
    } catch (err) {
        console.error('Lỗi ghi log admin:', err);
    }
}
const app = express();

// Cho phép tất cả các nguồn (trình duyệt) được phép kết nối vào server này
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const server = http.createServer(app);

// Cấu hình Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});
// ================= 2. CÁC API HTTP (ĐĂNG KÝ / ĐĂNG NHẬP) =================
// ================= API: ĐĂNG KÝ TÀI KHOẢN =================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        // 1. Kiểm tra xem tên đăng nhập đã có ai dùng chưa
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Tên đăng nhập đã có người sử dụng!' });
        }
        // 2. Băm mật khẩu (Mức độ salt = 10)
        const hashedPassword = await bcrypt.hash(password, 10);
        // 3. Lưu tài khoản mới vào Database
        await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
        res.status(201).json({ message: 'Đăng ký thành công!' });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({ message: 'Lỗi server nội bộ!' });
    }
});

// ================= API: ĐĂNG NHẬP =================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // 1. Tìm tài khoản trong Database
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(400).json({ message: 'Tài khoản không tồn tại!' });
        }
        const user = users[0];
        // Kiểm tra ban
        if (user.banned_until) {
            const now = new Date();
            const banUntil = new Date(user.banned_until);
            if (banUntil > now) {
                // Format thời gian còn lại cho người dùng dễ hiểu
                const diffMs = banUntil - now;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffHours / 24);
                let timeLeft = diffDays > 0 ? `${diffDays} ngày` : `${diffHours} giờ`;
                if (banUntil.getFullYear() >= 9999) timeLeft = 'vĩnh viễn';
                
                return res.status(403).json({ 
                    message: `Tài khoản bị cấm ${timeLeft}. Lý do: ${user.ban_reason || 'Vi phạm điều khoản'}` 
                });
            }
        }
        // KIỂM TRA ĐĂNG NHẬP TRÙNG
        if (activeUsers.has(user.user_id)) {
            return res.status(403).json({ message: 'Tài khoản đang online ở một thiết bị khác!' });
        }
        // 2. So sánh mật khẩu bạn nhập với mật khẩu đã băm trong DB
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Sai mật khẩu!' });
        }
        // 3. Tạo vé thông hành (JWT Token) có thời hạn 24 giờ
        const token = jwt.sign(
            { userId: user.user_id, username: user.username, role: user.role || 'user' }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        // 4. Trả vé về cho Frontend
        res.status(200).json({ 
            message: 'Đăng nhập thành công!',
            token: token,
            username: user.username,
            role: user.role || 'user'
        });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ message: 'Lỗi server nội bộ!' });
    }
});
// ================= API: CẬP NHẬT TÀI KHOẢN =================
app.put('/api/auth/update', async (req, res) => {
    try {
        // 1. Xác thực Token HTTP (Lấy chìa khóa từ Header)
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: 'Chưa xác thực!' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const { newUsername, newPassword } = req.body;
        // 2. Nếu có đổi tên -> Kiểm tra trùng lặp gắt gao bằng LOWER()
        if (newUsername) {
            const [existing] = await db.query(
                'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND user_id != ?', 
                [newUsername, userId]
            );
            if (existing.length > 0) {
                return res.status(400).json({ message: 'Tên này đã có người sử dụng!' });
            }
        }
        // 3. Tiến hành cập nhật
        if (newUsername && newPassword) {
            const hashed = await bcrypt.hash(newPassword, 10);
            await db.query('UPDATE users SET username = ?, password_hash = ? WHERE user_id = ?', [newUsername, hashed, userId]);
        } else if (newUsername) {
            await db.query('UPDATE users SET username = ? WHERE user_id = ?', [newUsername, userId]);
        } else if (newPassword) {
            const hashed = await bcrypt.hash(newPassword, 10);
            await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hashed, userId]);
        }
        // 4. Nếu đổi tên, phải cấp lại Token mới cho người dùng
        const [updatedUser] = await db.query('SELECT * FROM users WHERE user_id = ?', [userId]);
        const newToken = jwt.sign(
            { userId: updatedUser[0].user_id, username: updatedUser[0].username, role: updatedUser[0].role || 'user' }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        res.status(200).json({ 
            message: 'Cập nhật thành công!', 
            token: newToken, 
            username: updatedUser[0].username,
            role: updatedUser[0].role || 'user'
        });
    } catch (error) {
        console.error('Lỗi cập nhật:', error);
        res.status(500).json({ message: 'Token hết hạn hoặc lỗi Server!' });
    }
});
// ================= API 1: LẤY HỒ SƠ & LỊCH SỬ ĐẤU (Bản thân) =================
app.get('/api/user/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: 'Chưa xác thực!' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Bổ sung lấy thêm trạng thái is_private
        const [users] = await db.query('SELECT elo, is_private FROM users WHERE user_id = ?', [decoded.userId]);
        if (users.length === 0) return res.status(404).json({ message: 'Không tìm thấy user' });

        // Dọn replay quá 30 ngày (tiện thể khi user mở lịch sử — không cần cron riêng)
        try {
            await db.query('DELETE FROM match_replays WHERE created_at < NOW() - INTERVAL 30 DAY');
        } catch (e) { console.error('Lỗi dọn replay cũ:', e.message); }

        // has_replay: dòng lịch sử này có replay xem lại được không
        const [history] = await db.query(`
            SELECT mh.*, EXISTS(
                SELECT 1 FROM match_replays r WHERE r.match_history_id = mh.history_id
            ) AS has_replay
            FROM match_history mh
            WHERE mh.user_id = ? ORDER BY mh.created_at DESC LIMIT 50
        `, [decoded.userId]);

        res.status(200).json({ elo: users[0].elo, is_private: users[0].is_private, history: history });
    } catch (error) { res.status(500).json({ message: 'Lỗi lấy dữ liệu!' }); }
});

// ================= API 2: BẬT/TẮT QUYỀN RIÊNG TƯ =================
app.put('/api/user/privacy', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: 'Chưa xác thực!' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // Đọc trạng thái hiện tại và đảo ngược nó (TRUE thành FALSE, FALSE thành TRUE)
        const [users] = await db.query('SELECT is_private FROM users WHERE user_id = ?', [decoded.userId]);
        const newStatus = !users[0].is_private;

        await db.query('UPDATE users SET is_private = ? WHERE user_id = ?', [newStatus, decoded.userId]);
        res.status(200).json({ is_private: newStatus, message: 'Cập nhật quyền riêng tư thành công!' });
    } catch (error) { res.status(500).json({ message: 'Lỗi server!' }); }
});

// ================= API 3: TÌM KIẾM NGƯỜI CHƠI  =================
app.get('/api/user/search', async (req, res) => {
    try {
        const searchName = req.query.username;
        if (!searchName) return res.status(400).json({ message: 'Vui lòng nhập tên!' });
        
        // Kiểm tra người gọi có phải admin không
        let isAdmin = false;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
                isAdmin = (decoded.role === 'admin');
            } catch (e) { /* token sai thì coi như không admin */ }
        }

        const [users] = await db.query('SELECT user_id, username, elo, is_private FROM users WHERE LOWER(username) = LOWER(?)', [searchName]);
        if (users.length === 0) return res.status(404).json({ message: 'Không tìm thấy người chơi này!' });
        
        const targetUser = users[0];
        const isPrivate = !!targetUser.is_private;
        
        // KHÔNG còn chặn 403 nữa: ELO + username luôn công khai
        // History chỉ lấy nếu user công khai HOẶC người gọi là admin
        let history = [];
        if (!isPrivate || isAdmin) {
            const [rows] = await db.query(`
                SELECT mh.*, EXISTS(
                    SELECT 1 FROM match_replays r WHERE r.match_history_id = mh.history_id
                ) AS has_replay
                FROM match_history mh
                WHERE mh.user_id = ? ORDER BY mh.created_at DESC LIMIT 50
            `, [targetUser.user_id]);
            history = rows;
        }
        
        res.status(200).json({ 
            username: targetUser.username, 
            elo: targetUser.elo, 
            history: history,           // rỗng nếu private và không phải admin
            isPrivate: isPrivate,       // FE biết để render khu vực matrix/history phù hợp
            isAdminViewer: isAdmin
        });
    } catch (error) { 
        res.status(500).json({ message: 'Lỗi server!' }); 
    }
});
// ================= API 4: GHI NHẬN KẾT QUẢ & TÍNH ELO =================
app.post('/api/match/record', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: 'Chưa xác thực!' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;

        // Nhận dữ liệu từ ván đấu do Client gửi lên
        const { opponentName, mode, rule, scoreMe, scoreEnemy, result, isAfkPenalty, noteText } = req.body;

        // 1. Đọc ELO hiện tại của người chơi
        const [users] = await db.query('SELECT elo FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({message: 'Không tìm thấy tài khoản'});
        let currentElo = users[0].elo;

        /// 2. THUẬT TOÁN TÍNH ELO (Cộng dồn theo chênh lệch tỉ số)
        const baseElo = (parseInt(rule) === 3) ? 1 : 2; // Luật 3 = 1 ELO/ván, Luật 5 = 2 ELO/ván
        const scoreDiff = parseInt(scoreMe) - parseInt(scoreEnemy); // Tính khoảng cách tỉ số
        
        // Nếu thắng (ví dụ 2-0): scoreDiff = 2 -> eloChange = +2 (Luật 3) hoặc +4 (Luật 5)
        // Nếu thua (ví dụ 0-2): scoreDiff = -2 -> eloChange = -2 (Luật 3) hoặc -4 (Luật 5)
        // Nếu hòa (ví dụ 1-1): scoreDiff = 0 -> eloChange = 0
        let eloChange = scoreDiff * baseElo;

        //XỬ LÝ CỜ AFK (Phạt người bỏ cuộc hoặc đầu hàng)
        let finalNote = noteText || null;
        if (isAfkPenalty) {
            eloChange -= 3; // Trừ thẳng 3 điểm án phạt
            finalNote = finalNote ? finalNote + ' | Bị phạt AFK/FF' : 'Bị phạt AFK/FF';
        }

        // 4. CƠ CHẾ ANTI-FARM (Chặn cày ELO với Bot khi đã >= 1000)
        // Hệ thống xét ELO "trước" khi cộng. Nếu lúc bắt đầu là 999 thì vẫn cho qua.
        if (mode.startsWith('PvE') && currentElo >= 1000 && result === 'WIN') {
            eloChange = 0;
            finalNote = finalNote ? finalNote + ' | Max ELO PvE' : 'Max ELO PvE';
        }

        // 5. Cập nhật ELO mới (Khóa đáy: Không để ELO rớt xuống dưới 0)
        let newElo = currentElo + eloChange;
        if (newElo < 0) newElo = 0;

        // 6. GHI DỮ LIỆU VÀO DATABASE MYSQL
        await db.query('UPDATE users SET elo = ? WHERE user_id = ?', [newElo, userId]);
        
        const [insertResult] = await db.query(`
            INSERT INTO match_history (user_id, opponent_name, mode, rule, score_me, score_enemy, result, elo_change, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, opponentName, mode, rule, scoreMe, scoreEnemy, result, eloChange, finalNote]);

        // Trả kết quả về cho Client để báo cáo
        // historyId: dùng cho client lưu replay (link replay vào đúng dòng lịch sử)
        res.status(200).json({
            message: 'Đã lưu kết quả!',
            newElo: newElo,
            eloChange: eloChange,
            historyId: insertResult.insertId
        });
        
    } catch (error) {
        console.error("Lỗi ghi nhận ELO:", error);
        res.status(500).json({ message: 'Lỗi máy chủ khi tính ELO!' });
    }
});
// ================= MIDDLEWARE: BẢO VỆ CỔNG SOCKET =================
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error')); 
        // KIỂM TRA BẢO MẬT: Chặn nếu tài khoản đã có Socket khác đang kết nối
        if (activeUsers.has(decoded.userId) && activeUsers.get(decoded.userId) !== socket.id) {
            return next(new Error('Already logged in'));
        }
        socket.user = decoded; 
        activeUsers.set(decoded.userId, socket.id); // Ghi danh vào danh sách Online
        next(); 
    });
}); 
// ================= 3. QUẢN LÝ KẾT NỐI VÀ GHÉP TRẬN =================
// Phân tách hàng chờ: 1 ghế cho Luật 3, 1 ghế cho Luật 5
let waitingPlayers = { '3': null, '5': null }; 
// Cuốn sổ lưu trữ luật của các phòng kín
const roomsData = new Map();

// Kiểm tra sau khi 1 người rời phòng: nếu cả 2 người chơi đã rời mà vẫn còn
// khán giả, đếm ngược 3s rồi đẩy khán giả ra và xóa phòng.
function handlePlayerLeftRoom(roomCode) {
    const roomInfo = roomsData.get(roomCode);
    if (!roomInfo) return;
    const ioRoom = io.sockets.adapter.rooms.get(roomCode);
    if (!ioRoom) return;
    const players = roomInfo.players || [];
    const playersPresent = players.filter(pid => ioRoom.has(pid));
    const spectators = (roomInfo.spectators || []).filter(sid => ioRoom.has(sid));
    if (playersPresent.length === 0 && spectators.length > 0 && !roomInfo.closeTimer) {
        io.to(roomCode).emit('spectate_room_closing', { seconds: 3 });
        roomInfo.closeTimer = setTimeout(() => {
            const currentInfo = roomsData.get(roomCode);
            if (currentInfo) {
                for (const sid of (currentInfo.spectators || [])) {
                    const ss = io.sockets.sockets.get(sid);
                    if (ss) {
                        ss.emit('spectate_ended', { reason: 'Cả hai người chơi đã rời phòng.' });
                        ss.leave(roomCode);
                    }
                }
            }
            roomsData.delete(roomCode);
            console.log(`[Cleanup] Đã đóng phòng dự khán: ${roomCode}`);
        }, 3000);
    }
}

// Lưu 1 tin nhắn vào lịch sử chat của phòng để khán giả vào giữa trận xem
// được toàn bộ tin nhắn cũ. Lịch sử lưu trong roomInfo (RAM) và tự động bị
// xoá cùng phòng khi hết trận (roomsData.delete) — không cần dọn thủ công.
function logRoomChat(roomInfo, payload) {
    if (!roomInfo) return;
    if (!roomInfo.chatLog) roomInfo.chatLog = [];
    roomInfo.chatLog.push(payload);
}
// ===== STATE CHO TÍNH NĂNG THÁCH ĐẤU TRỰC TIẾP =====
// Map<challengeId, {fromSocketId, fromUsername, toSocketId, toUsername, rule, timeoutHandle}>
const activeChallenges = new Map();
// Map<userId, timestamp> — chống spam: 1 lời mời/5 giây/user
const lastChallengeTime = new Map();
let challengeIdCounter = 1;
// Tìm socket theo username (case-insensitive)
function findSocketByUsername(username) {
    for (const [userId, socketId] of activeUsers.entries()) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock && sock.user && sock.user.username.toLowerCase() === username.toLowerCase()) {
            return sock;
        }
    }
    return null;
}

// Hủy challenge (dọn dẹp state + clear timeout)
function cancelChallenge(challengeId, reason) {
    const ch = activeChallenges.get(challengeId);
    if (!ch) return;
    if (ch.timeoutHandle) clearTimeout(ch.timeoutHandle);
    activeChallenges.delete(challengeId);
    return ch;
}

io.on('connection', (socket) => {
    console.log(`[+] Người chơi [${socket.user.username}] vừa truy cập...`);

    // CHỨC NĂNG 1: TÌM TRẬN NGẪU NHIÊN (CÓ LỌC LUẬT CHƠI)
    // CHỨC NĂNG 1: TÌM TRẬN NGẪU NHIÊN (CÓ LỌC LUẬT CHƠI)
    socket.on('find_random', (winCondition) => {
        // Validate cứng: chỉ chấp nhận '3' hoặc '5'
        const condition = (String(winCondition) === '3') ? '3' : '5';
        if (waitingPlayers[condition] !== null && waitingPlayers[condition].id !== socket.id) {
            const opponent = waitingPlayers[condition];
            
            // ===== SỬA: tạo mã phòng 4 số như create_room =====
            const roomCode = generateUniqueRoomCode(condition);
            roomsData.set(roomCode, {
                winCondition: parseInt(condition),
                players: [opponent.id, socket.id],
                playerNames: [opponent.user.username, socket.user.username],
                moves: [],  // Lưu các nước đi để spectator vào giữa trận thấy được
                historyX: [],
                historyO: [],
                spectators: [],   // Danh sách socket khán giả
                xIndex: 0,        // playerNames[xIndex] là người đang cầm X
                scoreHost: 0,     // tỉ số series của người tạo phòng (playerNames[0])
                scoreGuest: 0,    // tỉ số series của người vào phòng (playerNames[1])
                createdAt: Date.now()
            });
            
            socket.join(roomCode);
            opponent.join(roomCode);
            
            io.to(roomCode).emit('match_found', { 
                room: roomCode, 
                player1: opponent.id, 
                player2: socket.id,
                p1Name: opponent.user.username,
                p2Name: socket.user.username,   
                winCondition: parseInt(condition) 
            });
            waitingPlayers[condition] = null;
        } else {
            waitingPlayers[condition] = socket;
        }
    });

    // Hàm hỗ trợ: tạo mã phòng duy nhất, đầu số CHỈ là 3 hoặc 5
    function generateUniqueRoomCode(rule) {
        // Cứng rắn: chỉ chấp nhận '3' hoặc '5', mặc định '5'
        const safeRule = (String(rule) === '3') ? '3' : '5';
        
        for (let attempt = 0; attempt < 50; attempt++) {
            const random3 = Math.floor(100 + Math.random() * 900);
            const code = 'CARO' + safeRule + random3;
            if (!roomsData.has(code) && !io.sockets.adapter.rooms.has(code)) {
                return code;
            }
        }
        return 'CARO' + safeRule + Date.now().toString().slice(-3);
    }

    // CHỨC NĂNG 2: TẠO PHÒNG
    socket.on('create_room', (winCondition) => {
        // Validate cứng: chỉ chấp nhận '3' hoặc '5'
        const rule = (String(winCondition) === '3') ? '3' : '5';
        const roomCode = generateUniqueRoomCode(rule);
        roomsData.set(roomCode, {
            winCondition: parseInt(rule),
            players: [socket.id],
            playerNames: [socket.user.username],
            moves: [],
            historyX: [],
            historyO: [],
            spectators: [],
            xIndex: 0,
            scoreHost: 0,
            scoreGuest: 0,
            createdAt: Date.now()
        });

        socket.join(roomCode);
        socket.emit('room_created', roomCode);
    });

    // CHỨC NĂNG 3: VÀO PHÒNG
    socket.on('join_room', (roomCode) => {
        // Validate format: phải là CARO + (3 hoặc 5) + 3 chữ số
        if (typeof roomCode !== 'string' || !/^CARO[35]\d{3}$/.test(roomCode)) {
            socket.emit('room_error', 'Mã phòng không đúng định dạng!');
            return;
        }
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (room && room.size === 1) {
            const hostId = [...room.keys()][0]; 
            if (hostId === socket.id) {
                socket.emit('room_error', 'Không thể tự vào phòng của chính mình!');
                return; 
            }
            
            socket.join(roomCode);
            const roomInfo = roomsData.get(roomCode) || { winCondition: 5 };
            
            // Cập nhật players của phòng (cho spectator dùng sau)
            roomInfo.players = [hostId, socket.id];
            const hostSocket = io.sockets.sockets.get(hostId);
            const hostName = hostSocket ? hostSocket.user.username : 'Unknown';
            roomInfo.playerNames = [hostName, socket.user.username];
            roomsData.set(roomCode, roomInfo);

            io.to(roomCode).emit('match_found', { 
                room: roomCode, 
                player1: hostId, 
                player2: socket.id,
                p1Name: hostName,
                p2Name: socket.user.username,
                winCondition: roomInfo.winCondition 
            });
        } else if (room && room.size >= 2) {
            socket.emit('room_error', 'Phòng này đã đầy người chơi!');
        } else {
            socket.emit('room_error', 'Mã phòng không tồn tại!');
        }
    });
    // CHỨC NĂNG 3.5: DỰ KHÁN (SPECTATOR)
    socket.on('spectate_room', (roomCode) => {
        if (typeof roomCode !== 'string' || !/^CARO[35]\d{3}$/.test(roomCode)) {
            socket.emit('spectate_error', 'Mã phòng không đúng định dạng!');
            return;
        }
        const roomInfo = roomsData.get(roomCode);
        if (!roomInfo) {
            socket.emit('spectate_error', 'Phòng không tồn tại hoặc trận đã kết thúc!');
            return;
        }
        // Phòng phải đã ghép đủ 2 người chơi (có trận đấu)
        if (!roomInfo.players || roomInfo.players.length < 2) {
            socket.emit('spectate_error', 'Phòng này chưa có trận đấu để dự khán!');
            return;
        }
        // Không cho người chơi của chính phòng đó tự dự khán
        if (roomInfo.players.includes(socket.id)) {
            socket.emit('spectate_error', 'Bạn đang là người chơi trong phòng này!');
            return;
        }
        // Phải còn ít nhất 1 người chơi đang trong phòng
        const ioRoom = io.sockets.adapter.rooms.get(roomCode);
        const playersPresent = roomInfo.players.filter(pid => ioRoom && ioRoom.has(pid));
        if (playersPresent.length === 0) {
            socket.emit('spectate_error', 'Cả hai người chơi đã rời phòng!');
            return;
        }

        socket.join(roomCode);
        if (!roomInfo.spectators) roomInfo.spectators = [];
        if (!roomInfo.spectators.includes(socket.id)) roomInfo.spectators.push(socket.id);
        socket.isSpectator = true;

        // Gửi toàn bộ state hiện tại cho khán giả (gửi bản sao mảng moves)
        const xIdx = roomInfo.xIndex || 0;
        socket.emit('spectate_started', {
            room: roomCode,
            winCondition: roomInfo.winCondition,
            p1Name: roomInfo.playerNames[0],
            p2Name: roomInfo.playerNames[1],
            xIndex: xIdx,
            scoreHost: roomInfo.scoreHost || 0,
            scoreGuest: roomInfo.scoreGuest || 0,
            chatLog: [...(roomInfo.chatLog || [])],  // toàn bộ tin nhắn cũ trong phòng
            moves: [...(roomInfo.moves || [])]
        });

        // Chat log: báo cho cả phòng biết có khán giả vào
        const joinMsg = {
            username: 'Hệ thống',
            text: `${socket.user.username} đã vào dự khán`,
            isSystem: true,
            timestamp: Date.now()
        };
        io.to(roomCode).emit('chat_received', joinMsg);
        logRoomChat(roomInfo, joinMsg);
    });

    // CHỨC NĂNG 3.6: KHÁN GIẢ RỜI PHÒNG
    socket.on('leave_spectate', (roomCode) => {
        const roomInfo = roomsData.get(roomCode);
        if (roomInfo && roomInfo.spectators) {
            roomInfo.spectators = roomInfo.spectators.filter(id => id !== socket.id);
        }
        socket.leave(roomCode);
        socket.isSpectator = false;
        const leaveMsg = {
            username: 'Hệ thống',
            text: `${socket.user.username} đã rời khỏi phòng dự khán`,
            isSystem: true,
            timestamp: Date.now()
        };
        io.to(roomCode).emit('chat_received', leaveMsg);
        logRoomChat(roomInfo, leaveMsg);
        // Nếu phòng đã trống hẳn thì dọn dẹp
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (!room || room.size === 0) {
            if (roomInfo && roomInfo.closeTimer) clearTimeout(roomInfo.closeTimer);
            roomsData.delete(roomCode);
        }
    });

    // CHỨC NĂNG 3.7: ĐỒNG BỘ TỈ SỐ SERIES CHO KHÁN GIẢ
    // Người chơi gửi tỉ số tuyệt đối (host/guest); server lưu lại để khán giả
    // vào sau biết tỉ số, đồng thời phát cho các khán giả đang xem.
    socket.on('score_update', (data) => {
        if (!data || typeof data.room !== 'string') return;
        const roomInfo = roomsData.get(data.room);
        if (!roomInfo || !roomInfo.players || !roomInfo.players.includes(socket.id)) return;
        roomInfo.scoreHost = parseInt(data.scoreHost) || 0;
        roomInfo.scoreGuest = parseInt(data.scoreGuest) || 0;
        for (const sid of (roomInfo.spectators || [])) {
            const ss = io.sockets.sockets.get(sid);
            if (ss) ss.emit('score_update', {
                scoreHost: roomInfo.scoreHost,
                scoreGuest: roomInfo.scoreGuest
            });
        }
    });

    // CHỨC NĂNG 4: NHẬN NƯỚC ĐI VÀ PHÁT CHO NGƯỜI KIA
    socket.on('make_move', (data) => {
        // Lưu nước đi vào state phòng (cho spectator vào giữa trận có thể replay)
        const roomInfo = roomsData.get(data.room);
        if (roomInfo) {
            // Khán giả không được phép đánh cờ
            if (roomInfo.players && !roomInfo.players.includes(socket.id)) return;
            if (!roomInfo.moves) roomInfo.moves = [];
            roomInfo.moves.push(data);
        }
        io.to(data.room).emit('receive_move', data);
    });
    // CHỨC NĂNG 4.5: CHAT TRONG PHÒNG
    socket.lastChatTime = 0; // throttle 1 tin/giây
    socket.on('chat_message', (data) => {
        const { room, text } = data;
        if (!room || !text) return;
        
        // Anti-spam: throttle 1 tin/giây
        const now = Date.now();
        if (now - socket.lastChatTime < 1000) {
            socket.emit('chat_error', 'Đừng spam, đợi 1 giây!');
            return;
        }
        socket.lastChatTime = now;
        
        // Validate độ dài
        const trimmed = String(text).trim().slice(0, 200);
        if (!trimmed) return;
        
        // Kiểm tra socket có thực sự ở trong phòng đó không (chống forge)
        if (!socket.rooms.has(room)) {
            socket.emit('chat_error', 'Bạn không ở trong phòng này!');
            return;
        }
        
        // Xác định role: player hay spectator
        const roomInfo = roomsData.get(room);
        const isPlayer = roomInfo && roomInfo.players && roomInfo.players.includes(socket.id);
        
        // Broadcast cho tất cả socket trong room (kể cả mình)
        const chatPayload = {
            username: socket.user.username,
            text: trimmed,
            isSpectator: !isPlayer,
            timestamp: now
        };
        io.to(room).emit('chat_received', chatPayload);
        logRoomChat(roomInfo, chatPayload);
    });

    // CHỨC NĂNG 4.6: YÊU CẦU MÃ PHÒNG (cho lệnh /code)
    socket.on('get_room_code', (roomCode) => {
        // Echo lại mã phòng (client biết rồi nhưng cần để hiển thị lệnh /code)
        socket.emit('room_code_info', { roomCode });
    });

    // CHỨC NĂNG 5: XỬ LÝ ĐẦU HÀNG
    socket.on('surrender', (roomCode) => {
        // Báo cho người còn lại trong phòng biết đối thủ đã đầu hàng
        socket.to(roomCode).emit('opponent_surrendered');
    });

    // CHỨC NĂNG 6A: YÊU CẦU ĐẤU LẠI
    socket.on('request_rematch', (roomCode) => {
        // Chỉ gửi thư mời tái đấu cho người còn lại trong phòng (không gửi cho chính mình)
        socket.to(roomCode).emit('rematch_requested'); 
    });

    // CHỨC NĂNG 6B: ĐỐI THỦ ĐỒNG Ý
    socket.on('accept_rematch', (roomCode) => {
        // Dọn nước đi của ván cũ + đảo người cầm X để khán giả vào sau thấy đúng
        const roomInfo = roomsData.get(roomCode);
        if (roomInfo) {
            roomInfo.moves = [];
            roomInfo.historyX = [];
            roomInfo.historyO = [];
            roomInfo.xIndex = 1 - (roomInfo.xIndex || 0);
        }
        // Cả 2 sẽ cùng nhận được lệnh bắt đầu ván mới
        io.to(roomCode).emit('start_rematch');
    });

    // CHỨC NĂNG 6C: ĐỐI THỦ TỪ CHỐI
    socket.on('decline_rematch', (roomCode) => {
        // Báo cho người yêu cầu biết là đã bị từ chối
        socket.to(roomCode).emit('rematch_declined'); 
    });

    // CHỨC NĂNG 7: RỜI PHÒNG
    socket.on('leave_room', (roomCode) => {
        socket.to(roomCode).emit('opponent_disconnected');
        socket.leave(roomCode);

        // Nếu room còn ai → giữ lại, nếu trống → xóa khỏi roomsData
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (!room || room.size === 0) {
            const info = roomsData.get(roomCode);
            if (info && info.closeTimer) clearTimeout(info.closeTimer);
            roomsData.delete(roomCode);
        } else {
            // Còn người trong phòng (có thể là khán giả) → kiểm tra cần đóng phòng không
            handlePlayerLeftRoom(roomCode);
        }
    });
    // CHỨC NĂNG 8: THÁCH ĐẤU TRỰC TIẾP
    socket.on('send_challenge', (data) => {
        const targetUsername = String(data.targetUsername || '').trim();
        const rule = (String(data.rule) === '3') ? '3' : '5';

        if (!targetUsername) {
            socket.emit('challenge_error', 'Vui lòng nhập tên đối thủ!');
            return;
        }

        // Không cho tự thách đấu chính mình
        if (targetUsername.toLowerCase() === socket.user.username.toLowerCase()) {
            socket.emit('challenge_error', 'Không thể tự thách đấu chính mình!');
            return;
        }

        // Anti-spam: 1 lời mời / 5 giây / user
        const lastTime = lastChallengeTime.get(socket.user.userId) || 0;
        if (Date.now() - lastTime < 5000) {
            socket.emit('challenge_error', 'Bạn vừa gửi lời mời, đợi vài giây!');
            return;
        }

        // Tìm target socket
        const targetSocket = findSocketByUsername(targetUsername);
        if (!targetSocket) {
            socket.emit('challenge_error', `Người chơi "${targetUsername}" không online!`);
            return;
        }

        // Kiểm tra target có đang trong trận PvP online không
        // Nếu rooms.size > 1 (ngoài socketID room mặc định) → đang trong phòng PvP
        let targetInPvP = false;
        for (const r of targetSocket.rooms) {
            if (r !== targetSocket.id && /^CARO[35]\d{3}$/.test(r)) {
                targetInPvP = true;
                break;
            }
        }
        if (targetInPvP) {
            socket.emit('challenge_error', `${targetUsername} đang trong trận PvP, không thể nhận thách đấu!`);
            return;
        }

        // Tạo challenge
        const challengeId = challengeIdCounter++;
        lastChallengeTime.set(socket.user.userId, Date.now());

        // Timeout 30 giây — tự hủy nếu không phản hồi
        const timeoutHandle = setTimeout(() => {
            const ch = cancelChallenge(challengeId);
            if (ch) {
                const fromSock = io.sockets.sockets.get(ch.fromSocketId);
                const toSock = io.sockets.sockets.get(ch.toSocketId);
                if (fromSock) fromSock.emit('challenge_timeout', { targetUsername: ch.toUsername });
                if (toSock) toSock.emit('challenge_cancelled', { challengeId });
            }
        }, 30000);

        activeChallenges.set(challengeId, {
            fromSocketId: socket.id,
            fromUsername: socket.user.username,
            toSocketId: targetSocket.id,
            toUsername: targetSocket.user.username,
            rule: rule,
            timeoutHandle: timeoutHandle
        });

        // Gửi cho người nhận
        targetSocket.emit('challenge_received', {
            challengeId: challengeId,
            fromUsername: socket.user.username,
            rule: parseInt(rule)
        });
        // Báo cho người gửi
        socket.emit('challenge_sent', {
            challengeId: challengeId,
            targetUsername: targetSocket.user.username,
            rule: parseInt(rule)
        });
    });

    socket.on('accept_challenge', (data) => {
        const challengeId = data.challengeId;
        const ch = activeChallenges.get(challengeId);
        if (!ch) {
            socket.emit('challenge_error', 'Lời mời không tồn tại hoặc đã hết hạn!');
            return;
        }
        // Bảo mật: chỉ người được mời mới được chấp nhận
        if (ch.toSocketId !== socket.id) {
            socket.emit('challenge_error', 'Lời mời này không dành cho bạn!');
            return;
        }

        clearTimeout(ch.timeoutHandle);
        activeChallenges.delete(challengeId);

        const fromSocket = io.sockets.sockets.get(ch.fromSocketId);
        if (!fromSocket) {
            socket.emit('challenge_error', 'Người gửi đã offline!');
            return;
        }

        // Tạo phòng mới như random match
        const roomCode = generateUniqueRoomCode(ch.rule);
        roomsData.set(roomCode, {
            winCondition: parseInt(ch.rule),
            players: [fromSocket.id, socket.id],
            playerNames: [fromSocket.user.username, socket.user.username],
            moves: [],
            historyX: [],
            historyO: [],
            spectators: [],
            xIndex: 0,
            scoreHost: 0,
            scoreGuest: 0,
            createdAt: Date.now()
        });
        fromSocket.join(roomCode);
        socket.join(roomCode);

        // Gửi match_found cho cả 2 (giống flow random match)
        io.to(roomCode).emit('match_found', {
            room: roomCode,
            player1: fromSocket.id,
            player2: socket.id,
            p1Name: fromSocket.user.username,
            p2Name: socket.user.username,
            winCondition: parseInt(ch.rule)
        });
    });

    socket.on('decline_challenge', (data) => {
        const challengeId = data.challengeId;
        const ch = activeChallenges.get(challengeId);
        if (!ch) return;
        if (ch.toSocketId !== socket.id) return;

        clearTimeout(ch.timeoutHandle);
        activeChallenges.delete(challengeId);

        const fromSocket = io.sockets.sockets.get(ch.fromSocketId);
        if (fromSocket) {
            fromSocket.emit('challenge_declined', { targetUsername: ch.toUsername });
        }
    });

    socket.on('cancel_challenge', (data) => {
        const challengeId = data.challengeId;
        const ch = activeChallenges.get(challengeId);
        if (!ch) return;
        if (ch.fromSocketId !== socket.id) return; // chỉ người gửi mới được cancel

        clearTimeout(ch.timeoutHandle);
        activeChallenges.delete(challengeId);

        const toSocket = io.sockets.sockets.get(ch.toSocketId);
        if (toSocket) {
            toSocket.emit('challenge_cancelled', { challengeId });
        }
    });

    // KHI NGƯỜI CHƠI CHUẨN BỊ THOÁT (Tắt tab, mất mạng)
    // Dùng 'disconnecting' thay vì 'disconnect' để kịp lấy mã phòng trước khi bị xóa
    socket.on('disconnecting', () => {
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                // Chỉ báo "đối thủ rớt mạng" nếu socket này là NGƯỜI CHƠI của phòng,
                // tránh trường hợp khán giả thoát lại làm người chơi tưởng đối thủ rời.
                const info = roomsData.get(room);
                const isPlayer = info && info.players && info.players.includes(socket.id);
                if (isPlayer) {
                    socket.to(room).emit('opponent_disconnected');
                }
            }
        }
    });

    // KHI NGƯỜI CHƠI ĐÃ THOÁT HẲN
    socket.on('disconnect', () => {
        // Dọn các challenge liên quan đến socket này
        for (const [chId, ch] of activeChallenges.entries()) {
            if (ch.fromSocketId === socket.id || ch.toSocketId === socket.id) {
                clearTimeout(ch.timeoutHandle);
                activeChallenges.delete(chId);
                // Báo cho bên còn lại
                const otherId = (ch.fromSocketId === socket.id) ? ch.toSocketId : ch.fromSocketId;
                const otherSock = io.sockets.sockets.get(otherId);
                if (otherSock) otherSock.emit('challenge_cancelled', { challengeId: chId });
            }
        }
        
        console.log(`[-] Người chơi ${socket.id} đã thoát.`);
        if (waitingPlayers['3'] && waitingPlayers['3'].id === socket.id) waitingPlayers['3'] = null;
        if (waitingPlayers['5'] && waitingPlayers['5'].id === socket.id) waitingPlayers['5'] = null; 
        
        if (socket.user && socket.user.userId) {
            activeUsers.delete(socket.user.userId);
        }
        
        // Dọn các phòng mà người này đang ở (nếu phòng trống)
        // socket.rooms đã bị clear lúc này, nhưng roomsData vẫn còn → kiểm tra
        for (const [code, info] of roomsData.entries()) {
            // Nếu socket này là khán giả → gỡ khỏi danh sách + ghi chat log
            let wasSpectator = false;
            if (info.spectators && info.spectators.includes(socket.id)) {
                info.spectators = info.spectators.filter(id => id !== socket.id);
                wasSpectator = true;
            }
            const room = io.sockets.adapter.rooms.get(code);
            if (!room || room.size === 0) {
                if (info.closeTimer) clearTimeout(info.closeTimer);
                roomsData.delete(code);
                console.log(`[Cleanup] Đã xóa phòng trống: ${code}`);
            } else {
                if (wasSpectator && socket.user) {
                    const dcMsg = {
                        username: 'Hệ thống',
                        text: `${socket.user.username} đã rời khỏi phòng dự khán`,
                        isSystem: true,
                        timestamp: Date.now()
                    };
                    io.to(code).emit('chat_received', dcMsg);
                    logRoomChat(info, dcMsg);
                }
                // Có thể người chơi vừa thoát → kiểm tra cần đóng phòng dự khán không
                handlePlayerLeftRoom(code);
            }
        }
    });
});
// =====================================================================
// ADMIN APIs - Tất cả đều require verifyToken + verifyAdmin
// =====================================================================

// GET /api/admin/users - Lấy danh sách tất cả user (có phân trang)
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const search = req.query.search || '';
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const [users] = await db.query(`
            SELECT user_id, username, role, elo, banned_until, ban_reason, created_at
            FROM users
            WHERE username LIKE ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [`%${search}%`, limit, offset]);
        
        // ===== THÊM: Lấy lịch sử của từng user (trừ admin) để tính matrix =====
        const userIds = users.filter(u => u.role !== 'admin').map(u => u.user_id);
        let historiesByUser = {};
        if (userIds.length > 0) {
            const [histories] = await db.query(
                `SELECT user_id, mode, rule, result FROM match_history WHERE user_id IN (?) ORDER BY created_at DESC`,
                [userIds]
            );
            for (const h of histories) {
                if (!historiesByUser[h.user_id]) historiesByUser[h.user_id] = [];
                historiesByUser[h.user_id].push(h);
            }
        }
        // Gắn history vào mỗi user
        users.forEach(u => { u.history = historiesByUser[u.user_id] || []; });
        // ===== HẾT PHẦN THÊM =====
        
        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM users WHERE username LIKE ?',
            [`%${search}%`]
        );
        
        res.json({ users, total: countResult[0].total });
    } catch (err) {
        console.error('Lỗi GET /api/admin/users:', err);
        res.status(500).json({ message: 'Lỗi server!' });
    }
});
// GET /api/admin/user/:userId - Chi tiết 1 user (kể cả khi user ẩn thông tin)
app.get('/api/admin/user/:userId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const targetId = parseInt(req.params.userId);
        const [users] = await db.query(
            'SELECT * FROM users WHERE user_id = ?', [targetId]
        );
        if (users.length === 0) return res.status(404).json({ message: 'Không tìm thấy user!' });
        
        // Lấy thêm 20 trận gần nhất (kèm cờ has_replay)
        const [history] = await db.query(`
            SELECT mh.*, EXISTS(
                SELECT 1 FROM match_replays r WHERE r.match_history_id = mh.history_id
            ) AS has_replay
            FROM match_history mh
            WHERE mh.user_id = ?
            ORDER BY mh.created_at DESC
            LIMIT 20
        `, [targetId]);
        
        const user = users[0];
        delete user.password_hash; // Không trả về hash mật khẩu
        
        res.json({ user, recentMatches: history });
    } catch (err) {
        console.error('Lỗi GET /api/admin/user/:userId:', err);
        res.status(500).json({ message: 'Lỗi server!' });
    }
});

// POST /api/admin/ban - Ban một user
// Body: { userId, durationHours, reason }
// durationHours = 0 → unban; durationHours = -1 → vĩnh viễn
app.post('/api/admin/ban', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { userId, durationHours, reason } = req.body;
        const targetId = parseInt(userId);
        
        // Không cho admin tự ban mình
        if (targetId === req.user.userId) {
            return res.status(400).json({ message: 'Không thể tự ban chính mình!' });
        }
        
        // Không cho ban admin khác
        const [target] = await db.query('SELECT role FROM users WHERE user_id = ?', [targetId]);
        if (target.length === 0) return res.status(404).json({ message: 'User không tồn tại!' });
        if (target[0].role === 'admin') {
            return res.status(403).json({ message: 'Không thể ban admin khác!' });
        }
        
        let banUntil = null;
        let actionType = 'UNBAN';
        let detail = `Lý do: ${reason || 'Không nêu'}`;
        
        if (durationHours === -1) {
            // Vĩnh viễn = năm 9999
            banUntil = '9999-12-31 23:59:59';
            actionType = 'BAN';
            detail = `Vĩnh viễn. ${detail}`;
        } else if (durationHours > 0) {
            const d = new Date();
            d.setHours(d.getHours() + durationHours);
            banUntil = d.toISOString().slice(0, 19).replace('T', ' ');
            actionType = 'BAN';
            detail = `${durationHours}h. ${detail}`;
        }
        
        await db.query(
            'UPDATE users SET banned_until = ?, ban_reason = ? WHERE user_id = ?',
            [banUntil, reason || null, targetId]
        );
        
        // Force kick nếu user đó đang online
        const targetSocket = Array.from(activeUsers.entries())
            .find(([uid]) => uid === targetId);
        if (targetSocket) {
            const socketId = targetSocket[1];
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('force_disconnect', { reason: 'Bạn đã bị ban bởi admin' });
                socket.disconnect(true);
            }
            activeUsers.delete(targetId);
        }
        
        await logAdminAction(req.user.userId, actionType, targetId, detail);
        
        res.json({ 
            message: durationHours === 0 ? 'Đã gỡ ban!' : 'Đã ban thành công!',
            banned_until: banUntil
        });
    } catch (err) {
        console.error('Lỗi POST /api/admin/ban:', err);
        res.status(500).json({ message: 'Lỗi server!' });
    }
});

// POST /api/admin/buff-elo - Cộng/trừ ELO cho user (để test)
app.post('/api/admin/buff-elo', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { userId, deltaElo, reason } = req.body;
        const targetId = parseInt(userId);
        const delta = parseInt(deltaElo);
        
        if (isNaN(delta)) return res.status(400).json({ message: 'deltaElo phải là số!' });
        
        await db.query(
            'UPDATE users SET elo = GREATEST(0, elo + ?) WHERE user_id = ?',
            [delta, targetId]
        );
        
        const [updated] = await db.query('SELECT elo FROM users WHERE user_id = ?', [targetId]);
        
        await logAdminAction(
            req.user.userId, 'BUFF_ELO', targetId, 
            `Delta: ${delta}. Lý do: ${reason || 'Test'}`
        );
        
        res.json({ message: 'OK', newElo: updated[0].elo });
    } catch (err) {
        console.error('Lỗi POST /api/admin/buff-elo:', err);
        res.status(500).json({ message: 'Lỗi server!' });
    }
});

// GET /api/admin/logs - Xem lịch sử hành động admin
app.get('/api/admin/logs', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const [logs] = await db.query(`
            SELECT 
                l.log_id, l.action_type, l.detail, l.created_at,
                a.username AS admin_name,
                u.username AS target_name
            FROM admin_logs l
            LEFT JOIN users a ON l.admin_id = a.user_id
            LEFT JOIN users u ON l.target_user_id = u.user_id
            ORDER BY l.created_at DESC
            LIMIT ?
        `, [limit]);
        res.json(logs);
    } catch (err) {
        console.error('Lỗi GET /api/admin/logs:', err);
        res.status(500).json({ message: 'Lỗi server!' });
    }
});

// =====================================================================
// LEADERBOARD API - Public (không cần admin)
// =====================================================================

// GET /api/leaderboard - Top 100 ELO cao nhất
app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 200);
        const [rows] = await db.query(`
            SELECT 
                user_id, username, elo,
                (SELECT COUNT(*) FROM match_history WHERE user_id = u.user_id AND result = 'WIN') AS wins,
                (SELECT COUNT(*) FROM match_history WHERE user_id = u.user_id) AS total_matches
            FROM users u
            WHERE banned_until IS NULL OR banned_until < NOW()
            ORDER BY elo DESC, user_id ASC
            LIMIT ?
        `, [limit]);
        
        // Thêm rank cho mỗi user
        const ranked = rows.map((u, idx) => ({
            ...u,
            rank: idx + 1,
            winrate: u.total_matches > 0 
                ? Math.round((u.wins / u.total_matches) * 100) 
                : 0
        }));
        
        res.json(ranked);
    } catch (err) {
        console.error('Lỗi GET /api/leaderboard:', err);
        res.status(500).json({ message: 'Lỗi server!' });
    }
});
// =====================================================================
// REPLAY API - Tính năng Xem lại trận đấu
// =====================================================================

// POST /api/replay/save - Client lưu replay sau khi trận kết thúc
// Body: { matchHistoryId, moves }  (moves = mảng-của-mảng, mỗi phần tử 1 ván)
app.post('/api/replay/save', verifyToken, async (req, res) => {
    try {
        const { matchHistoryId, moves } = req.body;
        const historyId = parseInt(matchHistoryId);
        if (!historyId || !Array.isArray(moves) || moves.length === 0) {
            return res.status(400).json({ message: 'Dữ liệu replay không hợp lệ!' });
        }
        // Giới hạn kích thước chống lạm dụng (vài trăm KB là quá dư cho 1 trận)
        const movesJson = JSON.stringify(moves);
        if (movesJson.length > 500000) {
            return res.status(400).json({ message: 'Replay quá lớn!' });
        }
        // Lấy dòng match_history để xác thực chủ sở hữu + mode/rule (tin DB, không tin client)
        const [rows] = await db.query(
            'SELECT user_id, mode, rule FROM match_history WHERE history_id = ?',
            [historyId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy trận đấu!' });
        }
        const mh = rows[0];
        if (mh.user_id !== req.user.userId) {
            return res.status(403).json({ message: 'Bạn không sở hữu trận đấu này!' });
        }
        const validModes = ['PvP', 'PvE-E', 'PvE-M', 'PvE-H'];
        if (!validModes.includes(mh.mode)) {
            return res.status(400).json({ message: 'Chế độ này không hỗ trợ replay!' });
        }
        // Mỗi match_history chỉ 1 replay (UNIQUE key) → insert hoặc ghi đè
        await db.query(`
            INSERT INTO match_replays (match_history_id, user_id, mode, rule, moves)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE moves = VALUES(moves), mode = VALUES(mode), rule = VALUES(rule)
        `, [historyId, mh.user_id, mh.mode, mh.rule, movesJson]);

        res.status(201).json({ message: 'Đã lưu replay!' });
    } catch (err) {
        console.error('Lỗi POST /api/replay/save:', err);
        res.status(500).json({ message: 'Lỗi server khi lưu replay!' });
    }
});

// GET /api/replay/:matchHistoryId - Lấy replay để xem lại
app.get('/api/replay/:matchHistoryId', verifyToken, async (req, res) => {
    try {
        const historyId = parseInt(req.params.matchHistoryId);
        if (!historyId) return res.status(400).json({ message: 'ID không hợp lệ!' });

        const [rows] = await db.query(`
            SELECT r.moves, r.mode, r.rule, r.created_at,
                   h.opponent_name, h.result, h.user_id AS owner_id,
                   u.is_private AS owner_private
            FROM match_replays r
            JOIN match_history h ON r.match_history_id = h.history_id
            JOIN users u ON h.user_id = u.user_id
            WHERE r.match_history_id = ?
        `, [historyId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Replay không tồn tại hoặc đã hết hạn!' });
        }
        const rp = rows[0];

        // Quyền xem: chính chủ / admin / hoặc chủ để hồ sơ công khai
        const isOwner = rp.owner_id === req.user.userId;
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin && rp.owner_private) {
            return res.status(403).json({ message: 'Người chơi này để hồ sơ riêng tư!' });
        }

        res.status(200).json({
            moves: rp.moves,            // mysql2 tự parse cột JSON
            mode: rp.mode,
            rule: rp.rule,
            opponent_name: rp.opponent_name,
            result: rp.result,
            created_at: rp.created_at
        });
    } catch (err) {
        console.error('Lỗi GET /api/replay:', err);
        res.status(500).json({ message: 'Lỗi server khi tải replay!' });
    }
});

    // ================= 4. BẬT ĐIỆN CHO MÁY CHỦ =================
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n======================================`);
    console.log(`MÁY CHỦ GAME CARO ĐÃ KHỞI ĐỘNG!`);
    console.log(`Đang phát sóng tại: http://localhost:${PORT}`);
    console.log(`======================================\n`);
});