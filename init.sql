-- =====================================================================
-- INIT SQL — GAME CARO (HUST Project III)
-- Schema khởi tạo đầy đủ cho MySQL 8.0+
--
-- HƯỚNG DẪN SỬ DỤNG:
--   1. Đảm bảo MySQL đang chạy (mặc định cổng 3306)
--   2. Mở terminal/CMD ở thư mục chứa file này, chạy:
--        mysql -u root -p < init.sql
--      Hoặc trong mysql prompt:
--        mysql> source /duong/dan/toi/init.sql
--   3. Sửa lại user/password/database trong file db.js cho khớp:
--        host: 'localhost'
--        user: 'root'
--        password: '<mat khau MySQL cua ban>'
--        database: 'caro_game_db'
--
-- File này tạo MỚI hoàn toàn 4 bảng của hệ thống:
--   users          — tài khoản + xếp hạng + trạng thái cấm
--   match_history  — lịch sử ván đấu (PvE + PvP online)
--   match_replays  — nước cờ để xem lại trận (tự xoá sau 30 ngày)
--   admin_logs     — nhật ký hành động quản trị (audit trail)
-- =====================================================================

-- 1) TẠO DATABASE
CREATE DATABASE IF NOT EXISTS `caro_game_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `caro_game_db`;

-- Xoá theo thứ tự ngược của khoá ngoại (con xoá trước, cha sau)
DROP TABLE IF EXISTS `match_replays`;
DROP TABLE IF EXISTS `admin_logs`;
DROP TABLE IF EXISTS `match_history`;
DROP TABLE IF EXISTS `users`;

-- =====================================================================
-- 2) BẢNG users — TÀI KHOẢN, XẾP HẠNG, TRẠNG THÁI CẤM
-- =====================================================================
-- Các cột:
--   user_id        : khoá chính, tự tăng
--   username       : tên đăng nhập (UNIQUE — không trùng)
--   role           : 'user' (mặc định) hoặc 'admin'
--                    Vai trò được nhúng vào JWT để phân quyền ở mọi API
--   banned_until   : thời điểm hết hạn cấm. NULL = không bị cấm.
--                    Mốc năm 9999 = cấm vĩnh viễn (quy ước trong code).
--   ban_reason     : lý do cấm (do admin nhập), hiển thị khi user đăng nhập.
--   password_hash  : mật khẩu đã băm bằng bcrypt (salt=10), độ dài ~60 ký tự
--                    để 255 dự phòng các thuật toán băm dài hơn về sau.
--   elo            : điểm xếp hạng, mặc định 0; code không cho rớt xuống dưới 0.
--   is_private     : 0 = công khai, 1 = ẩn lịch sử đấu với người lạ
--                    (admin vẫn xem được, theo quy tắc kiểm duyệt).
--   created_at     : thời điểm tạo tài khoản (auto).
--
-- Index phụ:
--   idx_users_elo    : phục vụ truy vấn Bảng xếp hạng (ORDER BY elo DESC)
--   idx_users_banned : phục vụ lọc tài khoản bị cấm khỏi xếp hạng
-- =====================================================================
CREATE TABLE `users` (
  `user_id`       INT NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(50) NOT NULL,
  `role`          ENUM('user','admin') DEFAULT 'user',
  `banned_until`  DATETIME DEFAULT NULL,
  `ban_reason`    VARCHAR(255) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `elo`           INT DEFAULT 0,
  `is_private`    TINYINT(1) DEFAULT 0,
  `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_users_elo`    (`elo` DESC),
  KEY `idx_users_banned` (`banned_until`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Thông tin tài khoản, xếp hạng ELO và trạng thái cấm';

-- =====================================================================
-- 3) BẢNG match_history — LỊCH SỬ ĐẤU (1 dòng / 1 series / 1 user)
-- =====================================================================
-- Mỗi loạt trận PvE hoặc PvP online kết thúc sẽ insert 1 dòng vào đây
-- cho user đang ghi nhận. Bảng này là nguồn dữ liệu để tính Winrate
-- Matrix và Bảng xếp hạng. PvP Local KHÔNG ghi vào đây (cùng máy).
--
-- Các cột:
--   history_id     : khoá chính
--   user_id        : FK -> users.user_id
--   opponent_name  : tên đối thủ tại thời điểm trận đấu
--                    PvE: "Bot Dễ" / "Bot TB" / "Bot Khó"
--                    PvP: username của đối thủ
--   mode           : 'PvP' / 'PvE-E' / 'PvE-M' / 'PvE-H'
--   rule           : 3 (luật 3 quân) hoặc 5 (luật 5 quân)
--   score_me       : số ván thắng của user trong series
--   score_enemy    : số ván thắng của đối thủ trong series
--   result         : 'WIN' / 'LOSE' / 'DRAW' (kết quả tổng của series)
--   elo_change     : biến thiên ELO; có thể bị trừ thêm 3 nếu phạt AFK/FF
--   note           : ghi chú đặc biệt (AFK, đầu hàng, Max ELO PvE...)
--   created_at     : thời điểm kết thúc trận
-- =====================================================================
CREATE TABLE `match_history` (
  `history_id`    INT NOT NULL AUTO_INCREMENT,
  `user_id`       INT NOT NULL,
  `opponent_name` VARCHAR(50) DEFAULT NULL,
  `mode`          VARCHAR(20) DEFAULT NULL,
  `rule`          INT DEFAULT NULL,
  `score_me`      INT DEFAULT NULL,
  `score_enemy`   INT DEFAULT NULL,
  `result`        VARCHAR(10) DEFAULT NULL,
  `elo_change`    INT DEFAULT NULL,
  `note`          VARCHAR(255) DEFAULT NULL,
  `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  CONSTRAINT `fk_history_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Lịch sử ván đấu — nguồn dữ liệu tính Winrate Matrix và ELO ranking';

-- =====================================================================
-- 4) BẢNG match_replays — NƯỚC CỜ ĐỂ XEM LẠI TRẬN (REPLAY)
-- =====================================================================
-- Mỗi replay liên kết tới đúng 1 dòng match_history (1-1, UNIQUE key).
-- Cột moves lưu mảng-của-mảng JSON, mỗi phần tử là 1 ván trong series:
--   [
--     [ {"x":0,"y":0,"player":"X"}, {"x":1,"y":0,"player":"O"}, ... ],
--     [ ... ván 2 ... ]
--   ]
--
-- Vòng đời:
--   - Client gửi sau khi trận đã ghi xong vào match_history.
--   - Tự xoá khi match_history bị xoá (ON DELETE CASCADE).
--   - Tự xoá khi quá 30 ngày: server chạy DELETE WHERE created_at <
--     NOW() - INTERVAL 30 DAY mỗi lần user mở danh sách lịch sử đấu
--     (không cần cron riêng, đủ tốt cho quy mô đồ án).
-- =====================================================================
CREATE TABLE `match_replays` (
  `replay_id`        INT NOT NULL AUTO_INCREMENT,
  `match_history_id` INT NOT NULL,
  `user_id`          INT NOT NULL,
  `mode`             ENUM('PvP','PvE-E','PvE-M','PvE-H') NOT NULL,
  `rule`             INT NOT NULL,
  `moves`            JSON NOT NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`replay_id`),
  -- Mỗi dòng match_history chỉ có tối đa 1 replay
  UNIQUE KEY `uk_replay_history` (`match_history_id`),
  -- Lấy nhanh replay của 1 user theo thời gian
  KEY `idx_replays_user` (`user_id`, `created_at`),
  -- Phục vụ dọn replay quá 30 ngày
  KEY `idx_replays_created` (`created_at`),
  CONSTRAINT `fk_replay_history`
    FOREIGN KEY (`match_history_id`) REFERENCES `match_history`(`history_id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_replay_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Nước cờ để xem lại (replay) các trận PvE và PvP online';

-- =====================================================================
-- 5) BẢNG admin_logs — NHẬT KÝ HÀNH ĐỘNG QUẢN TRỊ (AUDIT TRAIL)
-- =====================================================================
-- Mọi hành động quản trị (ban, unban, buff ELO, ...) đều ghi 1 dòng
-- vào đây qua hàm logAdminAction() trong server.js. Phục vụ truy vết
-- trách nhiệm và ngăn ngừa lạm quyền.
--
-- Các cột:
--   log_id          : khoá chính
--   admin_id        : user_id của admin thực hiện
--   action_type     : loại hành động
--   target_user_id  : đối tượng bị tác động
--   detail          : mô tả chi tiết (lý do ban, số ELO delta, ...)
--   created_at      : thời điểm hành động
-- =====================================================================
CREATE TABLE `admin_logs` (
  `log_id`         INT NOT NULL AUTO_INCREMENT,
  `admin_id`       INT NOT NULL,
  `action_type`    ENUM('BAN','UNBAN','BUFF_ELO','DELETE_USER','RESET_PASSWORD') NOT NULL,
  `target_user_id` INT NOT NULL,
  `detail`         VARCHAR(500) DEFAULT NULL,
  `created_at`     DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_admin_created` (`admin_id`, `created_at`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Nhật ký hành động quản trị (audit trail)';

-- =====================================================================
-- 6) (TUỲ CHỌN) TẠO TÀI KHOẢN MẪU ĐỂ TEST
-- =====================================================================
-- Mật khẩu mẫu: 123456 (đã băm bằng bcrypt salt=10)
-- Bỏ comment 3 dòng dưới để tạo sẵn 1 admin và 2 user thường.
-- =====================================================================
-- INSERT INTO `users` (`username`, `password_hash`, `role`, `elo`) VALUES
--   ('admin', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', 0),
--   ('demo1', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'user',  0),
--   ('demo2', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'user',  0);

-- =====================================================================
-- KIỂM TRA NHANH (bỏ comment để chạy thử sau khi import)
-- =====================================================================
-- SHOW TABLES;
-- DESCRIBE users;
-- DESCRIBE match_history;
-- DESCRIBE match_replays;
-- DESCRIBE admin_logs;
