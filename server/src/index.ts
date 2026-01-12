import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  PlayerState,
  Skill,
} from './types.js';
import { SKILLS } from './data/skills.js';

const app = express();
const httpServer = createServer(app);

// Configure Socket.io with CORS
// Allow all origins for deployment (Vercel frontend + Render backend)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: '*',
}));
app.use(express.json());

// Waiting room management
interface WaitingPlayer {
  socketId: string;
  username: string;
}

// Game state management
interface GameState {
  roomId: string;
  player1: {
    socketId: string;
    username: string;
    state: PlayerState;
  };
  player2: {
    socketId: string;
    username: string;
    state: PlayerState;
  };
  currentTurn: number;
  isGameOver: boolean;
  winner: string | null;
}

const waitingRoom: WaitingPlayer[] = [];
const activeGames = new Map<string, GameState>();

// Helper function to create initial player state
function createPlayerState(): PlayerState {
  return {
    hp: 100,
    mp: 10,
    activeZone: {
      type: 'none',
      remainingTurns: 0,
    },
  };
}

// Helper function to get random skill from SKILLS array with zone boost
function getRandomSkill(activeZone: PlayerState['activeZone']): Skill {
  // ゾーンによる排出率変更
  if (activeZone.type === 'attack') {
    // 攻撃技の排出率を3倍にする
    const attackSkills = SKILLS.filter(s => s.type === 'attack');
    const otherSkills = SKILLS.filter(s => s.type !== 'attack');
    
    // 攻撃技を3回繰り返して配列に追加（3倍の確率）
    const weightedSkills = [...attackSkills, ...attackSkills, ...attackSkills, ...otherSkills];
    const randomIndex = Math.floor(Math.random() * weightedSkills.length);
    return weightedSkills[randomIndex];
  } else if (activeZone.type === 'heal') {
    // 回復技の排出率を3倍にする
    const healSkills = SKILLS.filter(s => s.type === 'heal');
    const otherSkills = SKILLS.filter(s => s.type !== 'heal');
    
    // 回復技を3回繰り返して配列に追加（3倍の確率）
    const weightedSkills = [...healSkills, ...healSkills, ...healSkills, ...otherSkills];
    const randomIndex = Math.floor(Math.random() * weightedSkills.length);
    return weightedSkills[randomIndex];
  } else {
    // ゾーンなしまたはchaosの場合は通常の抽選
    const randomIndex = Math.floor(Math.random() * SKILLS.length);
    return SKILLS[randomIndex];
  }
}

// Helper function to generate random zone duration (2-5 turns)
function getRandomZoneDuration(): number {
  return Math.floor(Math.random() * 4) + 2; // 2から5の間のランダム整数
}

// Helper function to apply skill effect
function applySkillEffect(
  skill: Skill,
  attacker: GameState['player1'],
  defender: GameState['player2']
): { damage: number; healing: number; message: string } {
  let damage = 0;
  let healing = 0;
  let message = '';

  switch (skill.type) {
    case 'attack':
      damage = skill.power;
      defender.state.hp = Math.max(0, defender.state.hp - damage);
      message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！`;
      break;

    case 'heal':
      healing = skill.power;
      attacker.state.hp = Math.min(100, attacker.state.hp + healing);
      message = `${attacker.username}の${skill.name}！ HPが${healing}回復！`;
      break;

    case 'buff':
      message = `${attacker.username}の${skill.name}！ ${skill.description}`;
      // バフは将来的に実装予定
      break;

    case 'special':
      // 特殊技は様々な効果を持つ
      if (skill.name === '自爆') {
        damage = skill.power;
        const selfDamage = Math.floor(skill.power * 0.5);
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        attacker.state.hp = Math.max(0, attacker.state.hp - selfDamage);
        message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！ 自分も${selfDamage}ダメージを受けた！`;
      } else if (skill.power > 0) {
        damage = skill.power;
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！`;
      } else {
        message = `${attacker.username}の${skill.name}！ ${skill.description}`;
      }
      break;
  }

  return { damage, healing, message };
}

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Handle join game event
  socket.on('joinGame', (payload: { username: string }) => {
    console.log(`🎮 ${payload.username} (${socket.id}) joining game...`);

    // Add player to waiting room
    waitingRoom.push({
      socketId: socket.id,
      username: payload.username,
    });

    console.log(`⏳ Waiting room: ${waitingRoom.length} player(s)`);

    // Check if we have 2 players
    if (waitingRoom.length >= 2) {
      // Get first 2 players from waiting room
      const player1 = waitingRoom.shift()!;
      const player2 = waitingRoom.shift()!;

      // Generate new room ID with UUID
      const roomId = uuidv4();

      console.log(`🎯 Creating room ${roomId}`);
      console.log(`   Player 1: ${player1.username} (${player1.socketId})`);
      console.log(`   Player 2: ${player2.username} (${player2.socketId})`);

      // Move both players to the new room
      const socket1 = io.sockets.sockets.get(player1.socketId);
      const socket2 = io.sockets.sockets.get(player2.socketId);

      if (socket1 && socket2) {
        socket1.join(roomId);
        socket2.join(roomId);

        // Generate initial player states
        const player1State = createPlayerState();
        const player2State = createPlayerState();

        // Create game state
        const gameState: GameState = {
          roomId,
          player1: {
            socketId: player1.socketId,
            username: player1.username,
            state: player1State,
          },
          player2: {
            socketId: player2.socketId,
            username: player2.username,
            state: player2State,
          },
          currentTurn: 0,
          isGameOver: false,
          winner: null,
        };

        // Store active game
        activeGames.set(roomId, gameState);

        // Send game_start event to both clients
        const gameData = {
          roomId,
          player1: {
            socketId: player1.socketId,
            username: player1.username,
            state: player1State,
          },
          player2: {
            socketId: player2.socketId,
            username: player2.username,
            state: player2State,
          },
        };

        io.to(roomId).emit('game_start', gameData);
        
        console.log(`🚀 Game started in room ${roomId}`);
        console.log(`   Player 1 HP: ${player1State.hp}, MP: ${player1State.mp}`);
        console.log(`   Player 2 HP: ${player2State.hp}, MP: ${player2State.mp}`);
      }
    } else {
      // Notify player they're in waiting room
      socket.emit('waiting', { 
        message: 'Waiting for opponent...',
        playersWaiting: waitingRoom.length,
      });
    }
  });

  // Handle action_activate_zone event
  socket.on('action_activate_zone', (payload: { zoneType: 'attack' | 'heal' | 'chaos' }) => {
    console.log(`🌀 ${socket.id} activating zone: ${payload.zoneType}`);

    // Find the game this player is in
    let currentGame: GameState | undefined;
    let currentRoomId: string | undefined;

    activeGames.forEach((game, roomId) => {
      if (game.player1.socketId === socket.id || game.player2.socketId === socket.id) {
        currentGame = game;
        currentRoomId = roomId;
      }
    });

    if (!currentGame || !currentRoomId) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (currentGame.isGameOver) {
      socket.emit('error', { message: 'Game is already over' });
      return;
    }

    // Determine which player is activating the zone
    const isPlayer1 = currentGame.player1.socketId === socket.id;
    const player = isPlayer1 ? currentGame.player1 : currentGame.player2;

    // ゾーンアクティブ化のMPコスト
    const ZONE_MP_COST = 5;

    // Check if player has enough MP
    if (player.state.mp < ZONE_MP_COST) {
      socket.emit('error', { message: `Insufficient MP. Need ${ZONE_MP_COST} MP to activate zone.` });
      console.log(`❌ ${player.username} has insufficient MP (${player.state.mp}/${ZONE_MP_COST})`);
      return;
    }

    // Deduct MP cost
    player.state.mp -= ZONE_MP_COST;

    // Set zone with random duration (2-5 turns)
    const duration = getRandomZoneDuration();
    player.state.activeZone = {
      type: payload.zoneType,
      remainingTurns: duration,
    };

    console.log(`✨ ${player.username} activated ${payload.zoneType} zone for ${duration} turns`);
    console.log(`   MP: ${player.state.mp + ZONE_MP_COST} -> ${player.state.mp}`);

    // Send zone_activated event to both players
    io.to(currentRoomId).emit('zone_activated', {
      username: player.username,
      socketId: player.socketId,
      zoneType: payload.zoneType,
      duration: duration,
      remainingTurns: duration,
      playerState: player.state,
    });
  });

  // Handle action_use_skill event
  socket.on('action_use_skill', () => {
    console.log(`⚔️ ${socket.id} used a skill`);

    // Find the game this player is in
    let currentGame: GameState | undefined;
    let currentRoomId: string | undefined;

    activeGames.forEach((game, roomId) => {
      if (game.player1.socketId === socket.id || game.player2.socketId === socket.id) {
        currentGame = game;
        currentRoomId = roomId;
      }
    });

    if (!currentGame || !currentRoomId) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (currentGame.isGameOver) {
      socket.emit('error', { message: 'Game is already over' });
      return;
    }

    // Determine attacker and defender
    const isPlayer1 = currentGame.player1.socketId === socket.id;
    const attacker = isPlayer1 ? currentGame.player1 : currentGame.player2;
    const defender = isPlayer1 ? currentGame.player2 : currentGame.player1;

    // Get random skill from SKILLS array with zone boost
    const selectedSkill = getRandomSkill(attacker.state.activeZone);
    console.log(`🎲 Random skill selected: ${selectedSkill.name} (${selectedSkill.type})`);
    console.log(`   Current zone: ${attacker.state.activeZone.type} (${attacker.state.activeZone.remainingTurns} turns remaining)`);

    // Apply skill effect
    const result = applySkillEffect(selectedSkill, attacker, defender);

    // Recover MP at turn end (1 MP recovery)
    attacker.state.mp = Math.min(100, attacker.state.mp + 1);
    console.log(`💧 ${attacker.username} MP recovered: ${attacker.state.mp}`);

    // ターン経過処理：ゾーンの残りターン数を減らす
    if (attacker.state.activeZone.remainingTurns > 0) {
      attacker.state.activeZone.remainingTurns--;
      console.log(`⏱️ Zone turns remaining: ${attacker.state.activeZone.remainingTurns}`);
      
      // remainingTurnsが0になったらゾーンを解除
      if (attacker.state.activeZone.remainingTurns === 0) {
        attacker.state.activeZone.type = 'none';
        console.log(`🔄 ${attacker.username} zone expired!`);
        
        // ゾーン解除通知を送信
        io.to(currentRoomId).emit('zone_expired', {
          username: attacker.username,
          socketId: attacker.socketId,
        });
      }
    }

    // Check for game over
    if (defender.state.hp <= 0) {
      currentGame.isGameOver = true;
      currentGame.winner = attacker.username;

      console.log(`🏆 Game Over! ${attacker.username} wins!`);

      io.to(currentRoomId).emit('game_over', {
        winner: attacker.username,
        gameState: currentGame,
      });

      // Remove game from active games
      activeGames.delete(currentRoomId);
      return;
    }

    // Check if attacker also died (from special moves like 自爆)
    if (attacker.state.hp <= 0) {
      currentGame.isGameOver = true;
      currentGame.winner = defender.username;

      console.log(`🏆 Game Over! ${defender.username} wins!`);

      io.to(currentRoomId).emit('game_over', {
        winner: defender.username,
        gameState: currentGame,
      });

      activeGames.delete(currentRoomId);
      return;
    }

    // Increment turn counter
    currentGame.currentTurn++;

    // Send battle_update event to both players
    const battleUpdate = {
      turn: currentGame.currentTurn,
      attacker: {
        username: attacker.username,
        socketId: attacker.socketId,
        state: attacker.state,
      },
      defender: {
        username: defender.username,
        socketId: defender.socketId,
        state: defender.state,
      },
      skill: selectedSkill,
      damage: result.damage,
      healing: result.healing,
      message: result.message,
      gameState: currentGame,
    };

    io.to(currentRoomId).emit('battle_update', battleUpdate);

    console.log(`📊 Turn ${currentGame.currentTurn}:`);
    console.log(`   ${attacker.username}: HP ${attacker.state.hp}, MP ${attacker.state.mp}`);
    console.log(`   ${defender.username}: HP ${defender.state.hp}, MP ${defender.state.mp}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);

    // Remove from waiting room if present
    const waitingIndex = waitingRoom.findIndex(p => p.socketId === socket.id);
    if (waitingIndex > -1) {
      const removed = waitingRoom.splice(waitingIndex, 1)[0];
      console.log(`🚪 ${removed.username} left waiting room`);
    }

    // Handle disconnection from active games
    activeGames.forEach((game, roomId) => {
      if (game.player1.socketId === socket.id || game.player2.socketId === socket.id) {
        console.log(`🎮 Player disconnected from room ${roomId}`);
        io.to(roomId).emit('opponent_disconnected', {
          message: 'Opponent has disconnected',
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
    waitingPlayers: waitingRoom.length,
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Yubifuru server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io initialized with matchmaking system`);
});
