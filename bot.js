// =========================================================================
// TRẠM CHỈ HUY AI (BOT.JS) - ĐIỀU PHỐI NÃO BỘ THEO LUẬT CHƠI
// =========================================================================

function getBestMove(boardData, botRole, difficulty, winCondition, historyX, historyO) {
    if (winCondition === 3) {
        return getMove3x3(boardData, botRole, difficulty, historyX, historyO);
    } else {
        return getMove5x5(boardData, botRole, difficulty);
    }
}

// =========================================================================
// NÃO BỘ 1: TIC-TAC-TOE TÀNG HÌNH (LUẬT 3 QUÂN - MAX 3 TRÊN BÀN)
// =========================================================================
function getMove3x3(boardData, botRole, difficulty, historyX, historyO) {
    const humanRole = (botRole === 'X') ? 'O' : 'X';
    
    // 1. Lấy danh sách các ô còn trống trong khu vực [-1, 1]
    let emptyCells = [];
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            if (!boardData.has(`${x},${y}`)) emptyCells.push({x, y});
        }
    }

    if (emptyCells.length === 0) return null;

    // ================= MỨC DỄ: ĐÁNH NGẪU NHIÊN =================
    if (difficulty === 'easy') {
        return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }

    // --- HÀM HỖ TRỢ: Giả lập đánh 1 nước cờ (Bao gồm cả việc xóa cờ cũ) ---
    function simulateMove(board, histX, histO, move, player) {
        let newBoard = new Map(board);
        let newHX = [...histX];
        let newHO = [...histO];
        let key = `${move.x},${move.y}`;
        
        newBoard.set(key, player);
        if (player === 'X') {
            newHX.push(key);
            if (newHX.length > 3) newBoard.delete(newHX.shift());
        } else {
            newHO.push(key);
            if (newHO.length > 3) newBoard.delete(newHO.shift());
        }
        return { newBoard, newHX, newHO };
    }

    // --- HÀM HỖ TRỢ: Kiểm tra xem bàn cờ giả lập có ai thắng không ---
    function checkWinSim(board, player) {
        const lines = [
            // Ngang
            ['-1,-1','0,-1','1,-1'], ['-1,0','0,0','1,0'], ['-1,1','0,1','1,1'],
            // Dọc
            ['-1,-1','-1,0','-1,1'], ['0,-1','0,0','0,1'], ['1,-1','1,0','1,1'],
            // Chéo
            ['-1,-1','0,0','1,1'], ['1,-1','0,0','-1,1']
        ];
        for (let line of lines) {
            if (board.get(line[0]) === player && board.get(line[1]) === player && board.get(line[2]) === player) {
                return true;
            }
        }
        return false;
    }

    // ================= MỨC TRUNG BÌNH: SƠ ĐỒ THUẬT TOÁN RULE-BASED =================
    // (Chính là sơ đồ của bạn: Tìm nước thắng -> Tìm nước chặn -> Ngẫu nhiên)
    if (difficulty === 'medium') {
        // Ưu tiên 1: Tìm nước đi để MÌNH THẮNG ngay lập tức
        for (let move of emptyCells) {
            let sim = simulateMove(boardData, historyX, historyO, move, botRole);
            if (checkWinSim(sim.newBoard, botRole)) return move;
        }
        // Ưu tiên 2: Tìm nước đi để CHẶN ĐỊCH thắng vào hiệp sau
        for (let move of emptyCells) {
            let sim = simulateMove(boardData, historyX, historyO, move, humanRole);
            if (checkWinSim(sim.newBoard, humanRole)) return move;
        }
        // Ưu tiên 3: Chiếm giữa nếu rảnh, không thì ngẫu nhiên
        let center = emptyCells.find(c => c.x === 0 && c.y === 0);
        if (center) return center;
        return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }

    // ================= MỨC KHÓ: MINIMAX CÓ GIẢ LẬP HÀNG ĐỢI =================
    if (difficulty === 'hard') {
        let bestScore = -Infinity;
        let bestMove = emptyCells[0];

        // Do thuật toán Minimax chạy rất nặng, ta chỉ cần nhìn trước 5 bước (Depth 5) là đủ để Bot bất bại ở 3x3
        for (let move of emptyCells) {
            let sim = simulateMove(boardData, historyX, historyO, move, botRole);
            // Gọi đệ quy Minimax
            let score = minimax(sim.newBoard, sim.newHX, sim.newHO, 5, false, humanRole, botRole);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return bestMove;

        function minimax(board, hX, hO, depth, isMaximizing, hRole, bRole) {
            // Ai thắng thì trả về điểm
            if (checkWinSim(board, bRole)) return 10 + depth; // Bot thắng (+10)
            if (checkWinSim(board, hRole)) return -10 - depth; // Human thắng (-10)
            if (depth === 0) return 0; // Hết tầm nhìn (Hòa)

            let availCells = [];
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    if (!board.has(`${x},${y}`)) availCells.push({x, y});
                }
            }
            if (availCells.length === 0) return 0;

            if (isMaximizing) {
                let maxEval = -Infinity;
                for (let move of availCells) {
                    let sim = simulateMove(board, hX, hO, move, bRole);
                    let ev = minimax(sim.newBoard, sim.newHX, sim.newHO, depth - 1, false, hRole, bRole);
                    maxEval = Math.max(maxEval, ev);
                }
                return maxEval;
            } else {
                let minEval = Infinity;
                for (let move of availCells) {
                    let sim = simulateMove(board, hX, hO, move, hRole);
                    let ev = minimax(sim.newBoard, sim.newHX, sim.newHO, depth - 1, true, hRole, bRole);
                    minEval = Math.min(minEval, ev);
                }
                return minEval;
            }
        }
    }

    // FALLBACK AN TOÀN: Nếu difficulty không khớp 'easy'/'medium'/'hard' (lỗi UI),
    // không trả về undefined gây crash processMove. Đánh ngẫu nhiên cho chắc.
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

// =========================================================================
// NÃO BỘ 2: GOMOKU AI (LUẬT 5 QUÂN VÔ HẠN)
// =========================================================================
function getMove5x5(boardData, botRole, difficulty) {
    const humanRole = (botRole === 'X') ? 'O' : 'X';
    
    // 1. Tìm các ô tiềm năng (xung quanh quân cờ đã đánh)
    let candidateCells = getCandidates(boardData);
    if (candidateCells.length === 0) return { x: 0, y: 0 };

    // ================= MỨC DỄ: THAM LAM NGẪU NHIÊN =================
    if (difficulty === 'easy') {
        return candidateCells[Math.floor(Math.random() * candidateCells.length)];
    }

    // ================= MỨC TRUNG BÌNH: ĐÁNH THEO ĐIỂM (HEURISTIC) =================
    if (difficulty === 'medium') {
        return findBestMoveHeuristic(boardData, botRole, humanRole, candidateCells, 1.0);
    }

    // ================= MỨC KHÓ: ƯU TIÊN PHÒNG THỦ CAO =================
    if (difficulty === 'hard') {
        // Tăng hệ số phòng thủ lên 1.2 để Bot cực kỳ lỳ lợm, khó bị đánh bại
        return findBestMoveHeuristic(boardData, botRole, humanRole, candidateCells, 1.2);
    }

    // FALLBACK AN TOÀN
    return candidateCells[Math.floor(Math.random() * candidateCells.length)];
}

// --- HÀM TRỢ GIÚP 1: TÌM CÁC Ô LÂN CẬN ---
// Quét xung quanh các quân đã đánh trong bán kính 1 ô (8 ô lân cận) để giảm số ứng viên,
// giúp Bot phản hồi nhanh hơn khi bàn cờ có nhiều quân. Heuristic vẫn đủ tốt vì
// các nước đi quan trọng luôn nằm ngay sát quân đã có.
function getCandidates(boardData) {
    let cells = new Set();
    boardData.forEach((val, key) => {
        const [cx, cy] = key.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                let nx = cx + dx, ny = cy + dy;
                if (!boardData.has(`${nx},${ny}`)) cells.add(`${nx},${ny}`);
            }
        }
    });
    return Array.from(cells).map(k => {
        const [x, y] = k.split(',').map(Number);
        return { x, y };
    });
}

// --- HÀM TRỢ GIÚP 2: CHẤM ĐIỂM THẾ CỜ (TỪ AI.JS GỐC) ---
function findBestMoveHeuristic(boardData, bRole, hRole, candidates, defFactor) {
    let bestMove = candidates[0];
    let maxScore = -Infinity;

    for (let move of candidates) {
        let attack = evaluate(boardData, move.x, move.y, bRole);
        let defense = evaluate(boardData, move.x, move.y, hRole);
        let score = attack + (defense * defFactor) + (Math.random() * 2);

        if (score > maxScore) {
            maxScore = score;
            bestMove = move;
        }
    }
    return bestMove;
}

// --- HÀM TRỢ GIÚP 3: THANG ĐIỂM PATTERN ---
function evaluate(boardData, x, y, player) {
    let total = 0;
    const dirs = [{dx:1, dy:0}, {dx:0, dy:1}, {dx:1, dy:1}, {dx:1, dy:-1}];
    for (let d of dirs) {
        let count = 1, open = 0;
        for (let i = 1; i <= 4; i++) {
            let p = boardData.get(`${x+d.dx*i},${y+d.dy*i}`);
            if (p === player) count++; else if (!p) { open++; break; } else break;
        }
        for (let i = 1; i <= 4; i++) {
            let p = boardData.get(`${x-d.dx*i},${y-d.dy*i}`);
            if (p === player) count++; else if (!p) { open++; break; } else break;
        }
        if (count >= 5) total += 100000;
        else if (count === 4) total += (open === 2) ? 10000 : 1000;
        else if (count === 3) total += (open === 2) ? 1000 : 100;
        else if (count === 2) total += (open === 2) ? 100 : 10;
    }
    return total;
}