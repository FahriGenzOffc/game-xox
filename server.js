const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static('public'));

// Simple download stubs (demo)
app.post('/download/tiktok', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });
    res.json({
        title: `TikTok Video from ${url}`,
        downloadUrl: url
    });
});

app.post('/download/instagram', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });
    res.json({
        title: `Instagram content from ${url}`,
        downloadUrl: url,
        type: 'video'
    });
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinGameRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], board: Array(9).fill(null), currentPlayer: 0, ended: false };
        }
        if (rooms[roomId].players.length < 2) {
            rooms[roomId].players.push(socket.id);
            socket.join(roomId);
            socket.currentRoom = roomId;
            socket.emit('gameJoined', { roomId, playerIndex: rooms[roomId].players.length - 1 });
            if (rooms[roomId].players.length === 2) {
                io.to(roomId).emit('gameStart');
            }
        } else {
            socket.emit('roomFull');
        }
    });

    socket.on('gameMove', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];
        if (!room || room.ended) return;
        if (room.players[room.currentPlayer] === socket.id && room.board[index] === null) {
            room.board[index] = room.currentPlayer === 0 ? 'X' : 'O';
            room.currentPlayer = 1 - room.currentPlayer;
            io.to(roomId).emit('boardUpdate', { board: room.board, currentPlayer: room.currentPlayer });
            const winner = checkWinner(room.board);
            if (winner) {
                room.ended = true;
                io.to(roomId).emit('gameOver', { winner });
            } else if (room.board.every(cell => cell !== null)) {
                room.ended = true;
                io.to(roomId).emit('gameOver', { winner: 'draw' });
            }
        }
    });

    socket.on('restartGame', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.players.length < 2) return;
        room.board = Array(9).fill(null);
        room.currentPlayer = 0;
        room.ended = false;
        io.to(roomId).emit('gameStart');
        io.to(roomId).emit('boardUpdate', { board: room.board, currentPlayer: room.currentPlayer });
    });

    socket.on('joinChat', (username) => {
        const user = username || 'Anonymous';
        socket.username = user;
        socket.emit('chatHistory', chatHistory);
        socket.broadcast.emit('userJoined', user);
    });

    socket.on('sendMessage', (message) => {
        const msg = {
            username: socket.username || 'Anonymous',
            message: message,
            timestamp: new Date().toISOString()
        };
        chatHistory.push(msg);
        io.emit('newMessage', msg);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            socket.broadcast.emit('userLeft', socket.username);
        }

        // Clean up game room membership
        const roomId = socket.currentRoom;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            room.players = room.players.filter(id => id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                // Keep the room so remaining player can restart or wait for another
                room.ended = true;
            }
        }

        console.log('A user disconnected:', socket.id);
    });
});

function checkWinner(board) {
    const winPatterns = [
        [0,1,2], [3,4,5], [6,7,8],
        [0,3,6], [1,4,7], [2,5,8],
        [0,4,8], [2,4,6]
    ];
    for (let pattern of winPatterns) {
        if (board[pattern[0]] && board[pattern[0]] === board[pattern[1]] && board[pattern[1]] === board[pattern[2]]) {
            return board[pattern[0]];
        }
    }
    return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});