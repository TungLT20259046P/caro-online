const mysql = require('mysql2/promise');
// Tạo một Connection Pool thay vì một Connection đơn lẻ
// Pool giúp quản lý nhiều luồng kết nối cùng lúc, tối ưu hiệu năng cho hệ thống Socket thời gian thực
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'caro_game_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test kết nối ngay khi khởi tạo
pool.getConnection()
    .then(connection => {
        console.log('✅ Đã kết nối thành công với MySQL Database!');
        connection.release(); // Nhả kết nối lại cho Pool sau khi test xong
    })
    .catch(err => {
        console.error('❌ Lỗi kết nối Database:', err.message);
    });

module.exports = pool;