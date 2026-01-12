import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  SocketEvent,
  JoinGamePayload,
  UseSkillPayload,
  GameState,
  PlayerState,
  Zone,
  SkillType,
  Skill,
} from '@yubifuru/shared/types.js';

const app = express();
const httpServer = createServer(app);

// Configure Socket.io with CORS
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Game state storage
const waitingPlayers: string[] = [];
const activeGames = new Map<string, GameState>();

// Helper function to generate random zone duration (2-5 turns)
function getRandomZoneDuration(): number {
  return Math.floor(Math.random() * 4) + 2; // Random between 2-5
}

// Helper function to create a random zone
function createRandomZone(): Zone {
  const types = Object.values(SkillType);
  const randomType = types[Math.floor(Math.random() * types.length)];
  const boostedType = types[Math.floor(Math.random() * types.length)];
  
  return {
    id: `zone-${Date.now()}`,
    type: randomType,
    boostedType,
    boostMultiplier: 2.0,
    duration: getRandomZoneDuration(), // RANDOM 2-5 turns
    currentTurn: 0,
  };
}

// Helper function to create sample skills
function createSampleSkills(): Skill[] {
  const skillTypes = Object.values(SkillType);
  return skillTypes.map((type, index) => ({
    id: `skill-${type}-${index}`,
    name: `${type} Strike`,
    type,
    damage: 20 + index * 5,
    mpCost: 10,
    description: `A powerful ${type} attack`,
  }));
}

// Helper function to create initial player state
function createPlayerState(socketId: string, username: string): PlayerState {
  return {
    id: socketId,
    username,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    activeZone: null,
    availableSkills: createSampleSkills(),
  };
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on(SocketEvent.JOIN_GAME, (payload: JoinGamePayload) => {
    console.log(`${payload.username} (${socket.id}) wants to join game`);

    if (waitingPlayers.length > 0) {
      // Match with waiting player
      const opponentId = waitingPlayers.shift()!;
      const roomId = `room-${Date.now()}`;

      // Join both players to the same room
      socket.join(roomId);
      io.sockets.sockets.get(opponentId)?.join(roomId);

      // Create game state
      const player1 = createPlayerState(opponentId, 'Player 1');
      const player2 = createPlayerState(socket.id, payload.username);
      const initialZone = createRandomZone();

      const gameState: GameState = {
        roomId,
        players: [player1, player2],
        currentTurn: 0,
        activeZone: initialZone,
        isGameOver: false,
        winner: null,
      };

      activeGames.set(roomId, gameState);

      // Notify both players that the game has started
      io.to(roomId).emit(SocketEvent.GAME_START, {
        gameState,
      });

      console.log(`Game started in room ${roomId} with zone duration: ${initialZone.duration} turns`);
    } else {
      // Add to waiting list
      waitingPlayers.push(socket.id);
      socket.emit('waiting', { message: 'Waiting for an opponent...' });
    }
  });

  socket.on(SocketEvent.USE_SKILL, (payload: UseSkillPayload) => {
    // Find the game this player is in
    let currentGame: GameState | undefined;
    let currentRoomId: string | undefined;

    activeGames.forEach((game, roomId) => {
      if (game.players.some((p) => p.id === socket.id)) {
        currentGame = game;
        currentRoomId = roomId;
      }
    });

    if (!currentGame || !currentRoomId) {
      socket.emit(SocketEvent.ERROR, { message: 'Game not found' });
      return;
    }

    // Process skill usage and update game state
    // (Simplified logic - in real implementation, validate turn, calculate damage, etc.)
    currentGame.currentTurn++;

    // Check if zone duration expired and create new zone
    if (currentGame.activeZone) {
      currentGame.activeZone.currentTurn++;
      if (currentGame.activeZone.currentTurn >= currentGame.activeZone.duration) {
        const newZone = createRandomZone();
        currentGame.activeZone = newZone;
        
        io.to(currentRoomId).emit(SocketEvent.ZONE_CHANGE, {
          zone: newZone,
        });
        
        console.log(`Zone changed! New duration: ${newZone.duration} turns`);
      }
    }

    // Broadcast updated game state
    io.to(currentRoomId).emit(SocketEvent.TURN_UPDATE, {
      gameState: currentGame,
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Remove from waiting list if present
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // Handle disconnection from active games
    activeGames.forEach((game, roomId) => {
      if (game.players.some((p) => p.id === socket.id)) {
        // Notify other player
        io.to(roomId).emit(SocketEvent.GAME_OVER, {
          winner: 'Opponent disconnected',
          finalGameState: game,
        });
        activeGames.delete(roomId);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    message: 'Yubifuru Game Server',
    status: 'running',
    activeGames: activeGames.size,
    waitingPlayers: waitingPlayers.length,
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Yubifuru server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io initialized with Zone System (random 2-5 turn durations)`);
});
