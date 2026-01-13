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
  currentTurnPlayerId: string; // 現在のターンのプレイヤーID
  isGameOver: boolean;
  winner: string | null;
}

const waitingRoom: WaitingPlayer[] = [];
const activeGames = new Map<string, GameState>();

// Helper function to create initial player state
function createPlayerState(): PlayerState {
  return {
    hp: 100,
    mp: 0, // 初期MP 0、上限5
    activeZone: {
      type: 'none',
      remainingTurns: 0,
    },
    status: {
      poison: null,
      mpRegenBonus: null,
    },
  };
}

// Helper: weighted random pick according to zone rules
function getRandomSkill(activeZone: PlayerState['activeZone']): Skill {
  const weightedPool: Skill[] = [];

  SKILLS.forEach((skill) => {
    let weight = 1;

    if (activeZone.type === '強攻のゾーン' && skill.power >= 100) {
      weight *= 3;
    }
    if (activeZone.type === '集中のゾーン' && (skill.type === 'heal' || skill.type === 'buff')) {
      weight *= 3;
    }

    for (let i = 0; i < weight; i++) {
      weightedPool.push(skill);
    }
  });

  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[randomIndex];
}


// Helper function to apply skill effect
function applySkillEffect(
  skill: Skill,
  attacker: GameState['player1'],
  defender: GameState['player2']
): { damage: number; healing: number; message: string } {
  let damage = 0;
  let healing = 0;
  const logs: string[] = [];

  // ダメージ軽減（集中のゾーン）を計算する補助
  const applyDefense = (base: number) => {
    if (defender.state.activeZone.type === '集中のゾーン') {
      return Math.floor(base * 0.75);
    }
    return base;
  };

  switch (skill.type) {
    case 'attack': {
      damage = applyDefense(skill.power);
      defender.state.hp = Math.max(0, defender.state.hp - damage);
      logs.push(`${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ与えた！`);

      if (skill.effect === 'lifesteal') {
        const ratio = skill.lifestealRatio ?? 0.5;
        const healAmount = Math.floor(damage * ratio);
        attacker.state.hp = Math.min(100, attacker.state.hp + healAmount);
        healing += healAmount;
        logs.push(`🩸 ドレイン効果で${healAmount}回復！`);
      }

      if (skill.effect === 'recoil') {
        const ratio = skill.recoilRatio ?? 0.25;
        const recoil = Math.floor(skill.power * ratio);
        attacker.state.hp = Math.max(0, attacker.state.hp - recoil);
        logs.push(`⚠️ 反動で${recoil}ダメージ！`);
      }
      break;
    }

    case 'heal': {
      healing = skill.power;
      attacker.state.hp = Math.min(100, attacker.state.hp + healing);
      logs.push(`${attacker.username}の${skill.name}！ HPを${healing}回復！`);
      break;
    }

    case 'buff': {
      if (skill.effect === 'mp_regen_boost') {
        const amount = skill.mpRegenBonus ?? 1;
        const duration = skill.mpRegenDuration ?? 3;
        attacker.state.status.mpRegenBonus = { amount, turns: duration };
        logs.push(`${attacker.username}の${skill.name}！ しばらくMP回復量が+${amount}に！`);
      } else if (skill.effect === 'poison') {
        const dmg = skill.poisonDamage ?? 10;
        const duration = skill.poisonDuration ?? 3;
        defender.state.status.poison = { damagePerTurn: dmg, turns: duration };
        logs.push(`${attacker.username}の${skill.name}！ ${defender.username}をどく状態にした（${duration}ターン、毎ターン${dmg}ダメージ）！`);
      } else {
        logs.push(`${attacker.username}の${skill.name}！ ${skill.description}`);
      }
      break;
    }

    case 'special': {
      logs.push(`${attacker.username}の${skill.name}！ ${skill.description}`);
      break;
    }
  }

  return { damage, healing, message: logs.join('\n') };
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
          currentTurnPlayerId: player1.socketId, // player1が最初のターン
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
        
        // 最初のターンを通知
        io.to(roomId).emit('turn_change', {
          currentTurnPlayerId: gameState.currentTurnPlayerId,
          currentTurnPlayerName: player1.username,
        });
        
        console.log(`🚀 Game started in room ${roomId}`);
        console.log(`   Player 1 HP: ${player1State.hp}, MP: ${player1State.mp}`);
        console.log(`   Player 2 HP: ${player2State.hp}, MP: ${player2State.mp}`);
        console.log(`   First turn: ${player1.username} (${player1.socketId})`);
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
  socket.on('action_activate_zone', (payload: { zoneType: '強攻のゾーン' | '集中のゾーン' | '乱舞のゾーン' | '博打のゾーン' }) => {
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

    // ターンチェック：自分のターンかどうか
    if (currentGame.currentTurnPlayerId !== socket.id) {
      console.log(`❌ ${socket.id} tried to activate zone on opponent's turn`);
      socket.emit('error', { message: 'Not your turn!' });
      return;
    }

    // Determine which player is activating the zone
    const isPlayer1 = currentGame.player1.socketId === socket.id;
    const player = isPlayer1 ? currentGame.player1 : currentGame.player2;

    // ゾーンアクティブ化のMPコスト
    const ZONE_MP_COST = 5;

    // Check if player has enough MP (MP上限5)
    if (player.state.mp < ZONE_MP_COST) {
      socket.emit('error', { message: `Insufficient MP. Need ${ZONE_MP_COST} MP to activate zone.` });
      console.log(`❌ ${player.username} has insufficient MP (${player.state.mp}/${ZONE_MP_COST})`);
      return;
    }

    // Deduct MP cost
    player.state.mp -= ZONE_MP_COST;

    // Set zone with random duration (1-3 turns)
    const duration = Math.floor(Math.random() * 3) + 1; // 1から3の間のランダム整数
    player.state.activeZone = {
      type: payload.zoneType,
      remainingTurns: duration,
    };

    console.log(`✨ ${player.username} activated ${payload.zoneType} for ${duration} turns`);
    console.log(`   MP: ${player.state.mp + ZONE_MP_COST} -> ${player.state.mp}`);

    // ターンを交代
    const nextPlayer = currentGame.currentTurnPlayerId === currentGame.player1.socketId 
      ? currentGame.player2 
      : currentGame.player1;
    currentGame.currentTurnPlayerId = nextPlayer.socketId;

    // Send zone_activated event to both players
    io.to(currentRoomId).emit('zone_activated', {
      username: player.username,
      socketId: player.socketId,
      zoneType: payload.zoneType,
      duration: duration,
      remainingTurns: duration,
      playerState: player.state,
    });

    // ターン変更を通知
    io.to(currentRoomId).emit('turn_change', {
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
    });

    console.log(`🔄 Turn changed to: ${nextPlayer.username} (${nextPlayer.socketId})`);
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

    // ターンチェック：自分のターンかどうか
    if (currentGame.currentTurnPlayerId !== socket.id) {
      console.log(`❌ ${socket.id} tried to use skill on opponent's turn`);
      socket.emit('error', { message: 'Not your turn!' });
      return;
    }

    // Determine attacker and defender
    const isPlayer1 = currentGame.player1.socketId === socket.id;
    const attacker = isPlayer1 ? currentGame.player1 : currentGame.player2;
    const defender = isPlayer1 ? currentGame.player2 : currentGame.player1;

    // ターン開始時の状態異常処理（毒など）
    const preMessages: string[] = [];
    if (attacker.state.status.poison) {
      const poisonDamage = attacker.state.status.poison.damagePerTurn;
      attacker.state.hp = Math.max(0, attacker.state.hp - poisonDamage);
      attacker.state.status.poison.turns -= 1;
      preMessages.push(`☠️ 毒のダメージで${poisonDamage}を受けた！`);
      if (attacker.state.status.poison.turns <= 0) {
        attacker.state.status.poison = null;
        preMessages.push('☠️ 毒が解除された！');
      }
      // 毒で戦闘不能になった場合は即終了
      if (attacker.state.hp <= 0) {
        currentGame.isGameOver = true;
        currentGame.winner = defender.username;
        io.to(currentRoomId).emit('game_over', {
          winner: defender.username,
          gameState: currentGame,
        });
        activeGames.delete(currentRoomId);
        return;
      }
    }

    // Get random skill from SKILLS array with zone effects
    const selectedSkill = getRandomSkill(attacker.state.activeZone);
    console.log(`🎲 Random skill selected: ${selectedSkill.name} (${selectedSkill.type})`);
    console.log(`   Current zone: ${attacker.state.activeZone.type} (${attacker.state.activeZone.remainingTurns} turns remaining)`);

    // ゾーン効果によるログメッセージ生成
    let zoneEffectMessage = '';
    if (attacker.state.activeZone.type !== 'none') {
      if (attacker.state.activeZone.type === '強攻のゾーン') {
        zoneEffectMessage = `💥 ゾーン効果: 高威力技が出現！`;
      } else if (attacker.state.activeZone.type === '集中のゾーン') {
        zoneEffectMessage = `🎯 ゾーン効果: 支援技が出現！`;
      }
    }

    // Apply skill effect
    let result = applySkillEffect(selectedSkill, attacker, defender);
    const messageParts = [...preMessages];
    if (zoneEffectMessage) {
      messageParts.push(zoneEffectMessage);
    }
    messageParts.push(result.message);
    result.message = messageParts.join('\n');

    // MP回復計算（乱舞ゾーン中は0、瞑想バフで加算）
    let regenAmount = attacker.state.activeZone.type === '乱舞のゾーン' ? 0 : 1;
    if (attacker.state.status.mpRegenBonus) {
      regenAmount += attacker.state.status.mpRegenBonus.amount;
      attacker.state.status.mpRegenBonus.turns -= 1;
      if (attacker.state.status.mpRegenBonus.turns <= 0) {
        attacker.state.status.mpRegenBonus = null;
      }
    }
    if (regenAmount > 0) {
      attacker.state.mp = Math.min(5, attacker.state.mp + regenAmount);
    }
    console.log(`💧 ${attacker.username} MP: ${attacker.state.mp} (max 5)`);

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

    // ターンを交代
    const nextPlayer = currentGame.currentTurnPlayerId === currentGame.player1.socketId 
      ? currentGame.player2 
      : currentGame.player1;
    currentGame.currentTurnPlayerId = nextPlayer.socketId;

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

    // ターン変更を通知
    io.to(currentRoomId).emit('turn_change', {
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
    });

    console.log(`📊 Turn ${currentGame.currentTurn}:`);
    console.log(`   ${attacker.username}: HP ${attacker.state.hp}, MP ${attacker.state.mp}`);
    console.log(`   ${defender.username}: HP ${defender.state.hp}, MP ${defender.state.mp}`);
    console.log(`🔄 Turn changed to: ${nextPlayer.username} (${nextPlayer.socketId})`);
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
