const WebSocket = require('ws');
const wordsList = require('./words');

class WordleWebSocketServer {
    constructor() {
        this.rooms = {};
        this.wss = new WebSocket.Server({ port: 8080 });

        this.wss.on('connection', (ws) => {
            console.log('Wordle web sockets server is started.');

            ws.on('message', (message) => {
                const data = JSON.parse(message);

                switch (data.type) {
                    case 'createRoom':
                        this.handleCreateRoom(ws);
                        break;
                    case 'joinRoom':
                        this.handleJoinRoom(ws, data.roomId);
                        break;
                    case 'restart':
                        this.handleRestart(ws, data.roomId);
                        break;
                    case 'guess':
                        this.handleGuess(ws, data);
                        break;
                    default:
                        break;
                }
            });

            ws.on('close', () => {
                const roomId = this.findRoomBySocket(ws);
                if (roomId) {
                    const index = this.rooms[roomId].players.findIndex(player => player.socket === ws);
                    if (index !== -1) {
                        this.rooms[roomId].players.splice(index, 1);
                        if (this.rooms[roomId].players.length === 0) {
                            this.closeRoom(roomId);
                        }
                    }
                }
            });
        });
    }

    handleCreateRoom(ws) {
        const roomId = this.generateRoomId();
        const player1 = {
            socket: ws,
            playerId: 1
        };
        this.rooms[roomId] = {
            players: [player1],
            topic: '',
            isGameStarted: false,
            currentPlayerIndex: 1,
            guesses: [],
        };
        
        ws.send(JSON.stringify({ type: 'roomCreated', roomId }));
        ws.send(JSON.stringify({ type: 'notYourTurn', roomId }));
    }

    handleJoinRoom(ws, roomId) {
        const player2 = {
            socket: ws,
            playerId: 0
        };
        if (this.rooms[roomId] && !this.rooms[roomId].isGameStarted && this.rooms[roomId].players.length === 1) {
            this.rooms[roomId].players.push(player2);
            ws.send(JSON.stringify({ type: 'joinedRoom', roomId }));
            this.rooms[roomId].isGameStarted = true;
            this.rooms[roomId].guesses = [];
            this.startNewRound(roomId);
        } else {
            ws.send(JSON.stringify({ type: 'invalidRoom' }));
        }
    }

    handleRestart(ws, roomId) {
        if (this.rooms[roomId]) {
            const room = this.rooms[roomId];
            room.guesses = [];
    
            room.players.forEach((player) => {
                player.socket.send(JSON.stringify({ type: 'universalRestart' }));
            });
            room.players[0].socket.send(JSON.stringify({ type: 'notYourTurn'}));
            this.startNewRound(roomId);
        }
    }

    handleGuess(ws, data) {
        const roomId = data.roomId;
        const guess = data.guess.toLowerCase();
        this.rooms[roomId].guesses = [...data.guesses];

        if (this.rooms[roomId] && this.rooms[roomId].isGameStarted) {
            const currentPlayerIndex = this.rooms[roomId].currentPlayerIndex;
            const otherPlayerIndex = currentPlayerIndex ? 0 : 1;

            if (currentPlayerIndex > -1) {
                const activePlayer = this.rooms[roomId].players[currentPlayerIndex].socket;
                const inactivePlayer = this.rooms[roomId].players[otherPlayerIndex].socket;

                if (ws === activePlayer) {
                    if (guess.toLowerCase() === this.rooms[roomId].topic.toLowerCase()) {
                        activePlayer.send(JSON.stringify({ type: 'win', topic: this.rooms[roomId].topic }));
                        inactivePlayer.send(JSON.stringify({ type: 'lose', topic: this.rooms[roomId].topic }));
                    } else {
                        const updatedGuessesMessage = JSON.stringify({
                            type: 'incorrectGuess',
                            guesses: this.rooms[roomId].guesses,
                            topic: this.rooms[roomId].topic,
                        });

                        activePlayer.send(updatedGuessesMessage);
                        inactivePlayer.send(updatedGuessesMessage);
                    }

                    this.rooms[roomId].currentPlayerIndex = otherPlayerIndex;
                    this.informPlayersAboutTurn(roomId);
                } else  {
                    ws.send(JSON.stringify({ type: 'notYourTurn' }));
                }
            }
        }
    }

    informPlayersAboutTurn(roomId) {
        const currentPlayerIndex = this.rooms[roomId].currentPlayerIndex;
        const activePlayer = this.rooms[roomId].players[currentPlayerIndex].playerId;
    
        this.rooms[roomId].players.forEach((player) => {
            const isYourTurn = player.playerId === activePlayer;
            player.socket.send(JSON.stringify({ type: 'turnNotification', isYourTurn }));
        });
    }

    startNewRound(roomId) {
        this.rooms[roomId].topic = '';
        const topics = wordsList;
        const randomIndex = Math.floor(Math.random() * topics.length);
        this.rooms[roomId].topic = topics[randomIndex];

        this.rooms[roomId].players.forEach((player) => {
            player.socket.send(JSON.stringify({
                type: 'newRound',
                topic: this.rooms[roomId].topic,
                guesses: []
            }));
        });
        this.informPlayersAboutTurn(roomId);
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 7).toUpperCase();
    }

    closeRoom(roomId) {
        if (this.rooms[roomId]) {
            delete this.rooms[roomId];
        }
    }

    findRoomBySocket(socket) {
        for (const roomId in this.rooms) {
            if (this.rooms[roomId].players.some(player => player.socket === socket)) {
                return roomId;
            }
        }
        return null;
    }
}

new WordleWebSocketServer();
