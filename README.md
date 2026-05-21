# Game Caro Online - Project III (HUST) - TTKT
# MSSV: 20259046P

Hệ thống game Caro trực tuyến thời gian thực với AI tích hợp, kiến trúc full-stack.
Đồ án TTKT - Project III, Trường Công nghệ Thông tin và Truyền thông, Đại học Bách khoa Hà Nội.

---

## Tính năng

### Chế độ chơi
- **PvE (đánh với máy)** - 3 mức độ Dễ / Trung bình / Khó.
- **PvP cùng máy (Local)** - 2 người trên cùng thiết bị, có thể tùy chỉnh tên hiển thị.
- **PvP Online** - ghép trận ngẫu nhiên, tạo phòng riêng (mã `CARO3xxx` / `CARO5xxx`), hoặc thách đấu trực tiếp theo tên người chơi. *(Mặc định chỉ chạy trong mạng LAN; muốn chơi qua Internet xem mục [Phát hành ra Internet bằng ngrok](#phát-hành-ra-internet-bằng-ngrok).)*
- **Dự khán (Spectator)** - người thứ ba trở đi vào theo dõi một trận đang diễn ra qua mã phòng.

### Luật chơi
- **Luật 5 quân (Gomoku)** - bàn cờ vô hạn có thể pan/zoom; thắng khi nối đủ 5 quân liên tiếp theo hàng, cột hoặc đường chéo.
- **Luật 3 quân (Tic-Tac-Toe Tàng hình)** - bàn cờ 3×3 với cơ chế hàng đợi FIFO: mỗi người chỉ có tối đa 3 quân trên bàn cờ, quân thứ 4 sẽ làm quân đầu tiên biến mất.

### AI (Bot)
- **Luật 3:** thuật toán Minimax với độ sâu giới hạn, có giả lập hàng đợi FIFO.
- **Luật 5:** Heuristic Pattern Scoring, đánh giá thế cờ qua các mẫu 4 hướng, thu hẹp không gian tìm kiếm bằng Neighborhood Pruning.
- **3 mức độ khó** với đường cong khó được thiết kế có chủ đích để dẫn dắt người mới chơi.
- **Cơ chế chống cày ELO**: chặn người chơi đã đạt ELO ≥ 1000 cày tiếp với Bot.

### Hệ thống tài khoản & xã hội
- Đăng ký / đăng nhập với JWT + bcrypt.
- Xếp hạng ELO, tính theo công thức tuyến tính `ΔELO = (scoreMe − scoreEnemy) × BaseELO`.
- Bảng xếp hạng top 100 công khai (loại tài khoản đang bị ban).
- Lịch sử ván đấu chi tiết + ma trận tỉ lệ thắng theo mode × luật.
- Tìm kiếm người chơi, xem hồ sơ.
- Chế độ riêng tư (ẩn lịch sử đấu với người lạ).
- **Chat trong trận PvP** - kèm lệnh `/code`, `/help`; chống spam 1 tin/giây; khán giả tham gia được, tên hiển thị xanh dương kèm `[ ]`.
- **Thách đấu trực tiếp** theo username, timeout 30 giây, chống spam lời mời 5 giây.

### Replay (xem lại trận đấu)
- Tự lưu nước cờ mọi trận PvE và PvP online (PvP Local không lưu).
- Modal xem lại có slider tua nước cờ, phát tự động, tốc độ **0.5x → 4x**, tab chọn ván (cho loạt trận tái đấu).
- Tự động xoá sau **30 ngày** (giải phóng tài nguyên DB).

### Quản trị viên (Admin Panel)
- Phân quyền 2 tầng bằng middleware `verifyToken` + `verifyAdmin`.
- Cấm tài khoản đa cấp: theo giờ, vĩnh viễn (mốc năm 9999), hoặc gỡ cấm.
- Force kick tài khoản đang online ngay khi ban.
- Điều chỉnh ELO thủ công (test / xử lý sự cố).
- Audit log đầy đủ trong bảng `admin_logs`.
- Admin có quyền xem hồ sơ đầy đủ bất chấp trạng thái riêng tư của tài khoản.

### Chống gian lận
- Server là **Source of Truth** cho ghép trận, đồng bộ nước đi và tính ELO.
- Network Lock chống Ghost Click (double-tap) trong PvP.
- Bắt Rage Quit bằng `pagehide` + `keepalive` fetch - người tắt tab giữa trận vẫn bị xử thua + phạt 3 ELO.
- Highlight nước cờ cuối ở luật 5 - chống lỗi "không thấy đối thủ đi đâu" trên bàn cờ vô hạn.

---

## Tech Stack

| Tầng | Công nghệ |
|---|---|
| Frontend | HTML5 Canvas, CSS3, JavaScript thuần (Vanilla JS) |
| Realtime | Socket.IO trên WebSocket |
| Backend  | Node.js, Express |
| Auth     | JWT + bcrypt |
| Database | MySQL 8.0+ (Connection Pool qua `mysql2/promise`) |

---

## Cài đặt và chạy

### Yêu cầu
- Node.js ≥ 18
- MySQL ≥ 8.0
- npm

### Các bước
```bash
# 1. Clone repo
git clone <URL-repo-của-bạn>
cd Caro_Project

# 2. Cài dependencies
npm install

# 3. Khởi tạo database (sửa lại user/password cho khớp MySQL của bạn)
mysql -u root -p < init.sql

# 4. Sửa thông tin kết nối DB trong db.js
#    (host, user, password, database)

# 5. Khởi động server
npm start
# hoặc với hot-reload khi code thay đổi:
npm run dev

# 6. Mở trình duyệt
# http://localhost:3000
```

### Phát hành ra Internet bằng ngrok

Theo mặc định, server chỉ tiếp được khách trong **mạng LAN cùng router**:
- Trên cùng máy: `http://localhost:3000`
- Cùng mạng LAN: `http://<IPv4-của-máy-chạy-server>:3000` (ví dụ `http://192.168.1.5:3000` — lấy IPv4 bằng lệnh `ipconfig` trên Windows)

Muốn chơi PvP Online với người ở xa qua Internet, ta dùng **ngrok** tạo tunnel public cho server local. Các bước (chỉ cần làm lần đầu, lần sau bỏ bước 1-3):

1. Tải ngrok tại https://ngrok.com/download (hoặc `winget install ngrok`).
2. Đăng ký tài khoản free tại https://ngrok.com → vào Dashboard → copy authtoken.
3. Authenticate (1 lần duy nhất):
   ```bash
   ngrok config add-authtoken <PASTE-TOKEN-VÀO-ĐÂY>
   ```
4. Mở **2 terminal song song**:
   ```bash
   # Terminal 1 — server local
   npm start

   # Terminal 2 — mở tunnel public ra port 3000
   ngrok http 3000
   ```
5. ngrok in ra URL kiểu `https://abc-123.ngrok-free.app` — gửi link đó cho bạn bè, ai mở cũng vào được game.

> **Lưu ý:** Gói free đổi URL mỗi lần khởi động lại ngrok (gói trả phí cho phép URL cố định). Tắt ngrok = ngắt khỏi Internet, server local vẫn chạy bình thường trong LAN.

### Tạo tài khoản admin
Sau khi đăng ký 1 tài khoản qua giao diện, vào MySQL nâng quyền:
```sql
USE caro_game_db;
UPDATE users SET role = 'admin' WHERE username = 'tên-tài-khoản-của-bạn';
```
Đăng nhập lại, biểu tượng ⚙️ Admin Panel sẽ xuất hiện.

### Lưu ý bảo mật
File `db.js` và `server.js` đang dùng credentials mặc định cho **môi trường local**:
- Mật khẩu MySQL: `123456`
- `JWT_SECRET`: chuỗi cố định trong `server.js`

Khi triển khai thật, hãy chuyển sang biến môi trường (`.env`) và đổi mật khẩu/secret mạnh hơn.

---

## Cấu trúc dự án

```
Caro_Project/
├── server.js              # Backend: Express + Socket.IO + REST API
├── script.js              # Frontend logic (game loop, UI, socket client)
├── bot.js                 # AI: Minimax (luật 3) + Heuristic (luật 5)
├── index.html             # Trang đơn (SPA)
├── style.css              # Giao diện
├── db.js                  # Connection pool MySQL
├── init.sql               # Schema 4 bảng (chạy 1 lần khi setup là đủ)
├── package.json
└── README.md
```

---

## Special Thanks

Cảm ơn các dự án mã nguồn mở đã được tham khảo trong quá trình phát triển:

- **[sen-ltd/gomoku-ai](https://github.com/sen-ltd/gomoku-ai)** - Mã nguồn mở thuật toán Heuristic cho cờ Caro, là nguồn tham khảo cho phần AI luật 5.
- **[adavilalith/tic-tac-toe_multiplayer](https://github.com/adavilalith/tic-tac-toe_multiplayer)** - Mã nguồn tham khảo cho kiến trúc Server và kết nối Client-Server qua Socket.IO.

---

## Tác giả

- **Lê Thanh Tùng** - Sinh viên K67, MSSV 20259046P
- Trường Công nghệ Thông tin và Truyền thông, Đại học Bách khoa Hà Nội
- Giảng viên hướng dẫn: **TS. Lê Xuân Thành**
