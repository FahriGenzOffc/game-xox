const socket = io();

// Login & auth (client-side demo)
let loggedInUser = null;

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('userGreeting').textContent = `Selamat datang, ${loggedInUser}!`;

    // Prefill chat username if user hasn't joined yet
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.value = loggedInUser;
    }
}

// Audio helpers (autoplay triggered by user interaction)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let bgGainNode = null;
let bgOscillator = null;

function playTone(frequency, duration = 0.18, volume = 0.25) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;

    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + duration);
}

function playSequence(notes = [], interval = 180) {
    let time = audioContext.currentTime;
    notes.forEach((note) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.value = note.freq;
        gain.gain.value = note.vol;
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(time);
        osc.stop(time + (note.dur ?? 0.16));
        time += interval / 1000;
    });
}

async function playLoginSound() {
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    const melody = [
        { freq: 440, vol: 0.2 },
        { freq: 550, vol: 0.2 },
        { freq: 660, vol: 0.2 },
        { freq: 880, vol: 0.2 }
    ];
    playSequence(melody, 140);
}

async function startBackgroundMusic() {
    if (bgOscillator) return;
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    bgOscillator = audioContext.createOscillator();
    bgGainNode = audioContext.createGain();

    bgOscillator.type = 'triangle';
    bgOscillator.frequency.value = 110; // low base tone

    bgGainNode.gain.value = 0.06;
    bgOscillator.connect(bgGainNode);
    bgGainNode.connect(audioContext.destination);

    bgOscillator.start();
}

function stopBackgroundMusic() {
    if (bgOscillator) {
        bgOscillator.stop();
        bgOscillator.disconnect();
        bgOscillator = null;
    }
    if (bgGainNode) {
        bgGainNode.disconnect();
        bgGainNode = null;
    }
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username) {
        document.getElementById('loginUsername').focus();
        return;
    }

    // In this demo, any password is accepted.
    loggedInUser = username;
    showApp();
    await playLoginSound();
    await startBackgroundMusic();
}

document.getElementById('loginBtn').addEventListener('click', handleLogin);

document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleLogin();
    }
});

window.addEventListener('load', () => {
    document.getElementById('loginUsername').focus();
});

// Tab switching
function showTab(tabName, evt) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(tab => tab.style.display = 'none');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName + '-tab').style.display = 'block';
    if (evt && evt.target) {
        evt.target.classList.add('active');
    }
}

// Game variables
let gameRoomId;
let gamePlayerIndex;
let playerSymbol = null;
let gameCurrentPlayer = 0;
let gameBoard = Array(9).fill(null);
let previousBoard = Array(9).fill(null);
let gameEnded = false;
let scores = { X: 0, O: 0 };
let gameAnimations = [];
const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');
const gameStatus = document.getElementById('gameStatus');
const restartBtn = document.getElementById('restartBtn');
const scoreYou = document.getElementById('scoreYou');
const scoreOpponent = document.getElementById('scoreOpponent');

// Chat variables
let chatUsername;

function setGameStatus(message) {
    gameStatus.textContent = message;
}

function updateScoreboard() {
    if (!playerSymbol) return;

    const opponentSymbol = playerSymbol === 'X' ? 'O' : 'X';
    scoreYou.textContent = `Anda (${playerSymbol}): ${scores[playerSymbol]}`;
    scoreOpponent.textContent = `Lawan (${opponentSymbol}): ${scores[opponentSymbol]}`;
}

function showRestartButton(visible) {
    restartBtn.style.display = visible ? 'inline-block' : 'none';
}

function playMoveSound() {
    playTone(520, 0.08, 0.22);
}

function playWinSound() {
    playSequence([
        { freq: 660, vol: 0.18 },
        { freq: 880, vol: 0.18 },
        { freq: 1040, vol: 0.18 },
        { freq: 1320, vol: 0.18 }
    ], 120);
}

function playDrawSound() {
    playSequence([
        { freq: 440, vol: 0.18 },
        { freq: 440, vol: 0.18 },
        { freq: 440, vol: 0.18 }
    ], 180);
}

restartBtn.addEventListener('click', () => {
    if (!gameRoomId) return;
    socket.emit('restartGame', gameRoomId);
    showRestartButton(false);
    setGameStatus('🔄 Menunggu pemain lain...');
    gameEnded = false;
});

// Game functions
document.getElementById('joinGameBtn').addEventListener('click', () => {
    gameRoomId = document.getElementById('gameRoomId').value;
    socket.emit('joinGameRoom', gameRoomId);
});

socket.on('gameJoined', (data) => {
    gameRoomId = data.roomId;
    gamePlayerIndex = data.playerIndex;
    playerSymbol = gamePlayerIndex === 0 ? 'X' : 'O';
    document.getElementById('gameSetup').style.display = 'none';
    document.getElementById('gameArea').style.display = 'block';
    updateScoreboard();
    drawGameBoard();
});

socket.on('gameStart', () => {
    gameEnded = false;
    showRestartButton(false);
    setGameStatus(`🎉 Game dimulai! Anda adalah Player ${gamePlayerIndex + 1} (${playerSymbol})`);
    startBackgroundMusic();
});

socket.on('boardUpdate', (data) => {
    previousBoard = [...gameBoard];
    gameBoard = data.board;
    gameCurrentPlayer = data.currentPlayer;
    drawGameBoard();

    if (!gameEnded && previousBoard.some((val, idx) => val !== gameBoard[idx])) {
        playMoveSound();
    }

    if (!gameEnded) {
        setGameStatus(`🔄 Giliran Player ${gameCurrentPlayer + 1}`);
    }
});

socket.on('gameOver', (data) => {
    gameEnded = true;
    if (data.winner === 'draw') {
        setGameStatus('🤝 Permainan seri!');
        playDrawSound();
    } else {
        const playerNumber = data.winner === 'X' ? 1 : 2;
        setGameStatus(`🏆 Player ${playerNumber} menang!`);
        scores[data.winner]++;
        updateScoreboard();
        playWinSound();
    }

    showRestartButton(true);
});

gameCanvas.addEventListener('click', (e) => {
    if (gameEnded) return;

    const rect = gameCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = gameCanvas.width / 3;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    const index = row * 3 + col;

    if (gameBoard[index] === null && gameCurrentPlayer === gamePlayerIndex) {
        socket.emit('gameMove', { roomId: gameRoomId, index });
        addGameParticle(x, y);
    }
});

function drawGameBoard() {
    gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    // Draw dark anime background
    const gradient = gameCtx.createRadialGradient(300, 300, 0, 300, 300, 300);
    gradient.addColorStop(0, 'rgba(44, 62, 80, 0.8)');
    gradient.addColorStop(0.5, 'rgba(52, 73, 94, 0.6)');
    gradient.addColorStop(1, 'rgba(44, 62, 80, 0.8)');
    gameCtx.fillStyle = gradient;
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    // Add dark anime patterns
    gameCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * gameCanvas.width;
        const y = Math.random() * gameCanvas.height;
        const size = Math.random() * 5 + 1;
        gameCtx.beginPath();
        gameCtx.arc(x, y, size, 0, 2 * Math.PI);
        gameCtx.fill();
    }
    
    const cellSize = gameCanvas.width / 3;
    
    // Draw grid with dark glow
    gameCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    gameCtx.lineWidth = 3;
    gameCtx.shadowColor = 'rgba(255,255,255,0.2)';
    gameCtx.shadowBlur = 5;
    for (let i = 1; i < 3; i++) {
        gameCtx.beginPath();
        gameCtx.moveTo(i * cellSize, 0);
        gameCtx.lineTo(i * cellSize, gameCanvas.height);
        gameCtx.stroke();
        gameCtx.beginPath();
        gameCtx.moveTo(0, i * cellSize);
        gameCtx.lineTo(gameCanvas.width, i * cellSize);
        gameCtx.stroke();
    }
    gameCtx.shadowBlur = 0;
    
    // Draw X and O with dark HD anime style
    for (let i = 0; i < 9; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        if (gameBoard[i] === 'X') {
            drawGameX(x, y, cellSize * 0.4);
        } else if (gameBoard[i] === 'O') {
            drawGameO(x, y, cellSize * 0.4);
        }
    }
    
    drawGameAnimations();
}

function drawGameX(x, y, size) {
    gameCtx.strokeStyle = '#9b59b6';
    gameCtx.lineWidth = 15;
    gameCtx.lineCap = 'round';
    gameCtx.shadowColor = '#9b59b6';
    gameCtx.shadowBlur = 20;
    
    gameCtx.beginPath();
    gameCtx.moveTo(x - size, y - size);
    gameCtx.lineTo(x + size, y + size);
    gameCtx.moveTo(x + size, y - size);
    gameCtx.lineTo(x - size, y + size);
    gameCtx.stroke();
    gameCtx.shadowBlur = 0;
}

function drawGameO(x, y, size) {
    gameCtx.strokeStyle = '#3498db';
    gameCtx.lineWidth = 15;
    gameCtx.lineCap = 'round';
    gameCtx.shadowColor = '#3498db';
    gameCtx.shadowBlur = 20;
    
    gameCtx.beginPath();
    gameCtx.arc(x, y, size, 0, 2 * Math.PI);
    gameCtx.stroke();
    gameCtx.shadowBlur = 0;
}

function addGameParticle(x, y) {
    for (let i = 0; i < 10; i++) {
        gameAnimations.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 30,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`
        });
    }
}

function drawGameAnimations() {
    gameAnimations.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life--;
        if (particle.life <= 0) {
            gameAnimations.splice(index, 1);
            return;
        }
        gameCtx.fillStyle = particle.color;
        gameCtx.globalAlpha = particle.life / 30;
        gameCtx.beginPath();
        gameCtx.arc(particle.x, particle.y, 5, 0, 2 * Math.PI);
        gameCtx.fill();
    });
    gameCtx.globalAlpha = 1;
}

// Chat functions
document.getElementById('joinChatBtn').addEventListener('click', () => {
    chatUsername = document.getElementById('username').value;
    if (chatUsername) {
        socket.emit('joinChat', chatUsername);
        document.getElementById('chatSetup').style.display = 'none';
        document.getElementById('chatArea').style.display = 'block';
    }
});

document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = document.getElementById('messageInput').value;
    if (message) {
        socket.emit('sendMessage', message);
        document.getElementById('messageInput').value = '';
    }
}

socket.on('chatHistory', (messages) => {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    messages.forEach(msg => {
        addChatMessage(msg);
    });
});

socket.on('newMessage', (message) => {
    addChatMessage(message);
});

socket.on('userJoined', (username) => {
    addChatMessage({
        username: 'System',
        message: `${username} joined the chat`,
        timestamp: new Date().toISOString()
    });
});

socket.on('userLeft', (username) => {
    addChatMessage({
        username: 'System',
        message: `${username} left the chat`,
        timestamp: new Date().toISOString()
    });
});

function addChatMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `<strong>${message.username}:</strong> ${message.message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Downloader functions
async function downloadTikTok() {
    const url = document.getElementById('tiktokUrl').value;
    if (!url) return;
    
    try {
        const response = await fetch('/download/tiktok', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await response.json();
        document.getElementById('tiktokResult').innerHTML = `
            <p>✅ Download berhasil!</p>
            <p><strong>Title:</strong> ${data.title}</p>
            <a href="${data.downloadUrl}" target="_blank">⬇️ Download Video</a>
        `;
    } catch (error) {
        document.getElementById('tiktokResult').innerHTML = '<p>❌ Error downloading TikTok video</p>';
    }
}

async function downloadInstagram() {
    const url = document.getElementById('instagramUrl').value;
    if (!url) return;
    
    try {
        const response = await fetch('/download/instagram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await response.json();
        document.getElementById('instagramResult').innerHTML = `
            <p>✅ Download berhasil!</p>
            <p><strong>Title:</strong> ${data.title}</p>
            <a href="${data.downloadUrl}" target="_blank">⬇️ Download ${data.type === 'image' ? 'Image' : 'Video'}</a>
        `;
    } catch (error) {
        document.getElementById('instagramResult').innerHTML = '<p>❌ Error downloading Instagram content</p>';
    }
}

// Initialize
function animate() {
    if (gameCanvas.style.display !== 'none') {
        drawGameBoard();
    }
    requestAnimationFrame(animate);
}
animate();