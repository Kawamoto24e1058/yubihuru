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
  };
}

// Helper function to get random skill from SKILLS array with zone effects
function getRandomSkill(activeZone: PlayerState['activeZone']): Skill {
  const zoneType = activeZone.type;
  
  if (zoneType === '強攻のゾーン') {
    // 高威力技（power >= 30）の排出率を大幅アップ
    const powerfulSkills = SKILLS.filter(s => s.type === 'attack' && s.power >= 30);
    const otherSkills = SKILLS.filter(s => !(s.type === 'attack' && s.power >= 30));
    // 高威力技を5倍に
    const weightedSkills = [
      ...powerfulSkills, ...powerfulSkills, ...powerfulSkills, 
      ...powerfulSkills, ...powerfulSkills, 
      ...otherSkills
    ];
    return weightedSkills[Math.floor(Math.random() * weightedSkills.length)];
  } else if (zoneType === '集中のゾーン') {
    // 回復・補助技の排出率がアップ
    const supportSkills = SKILLS.filter(s => s.type === 'heal' || s.type === 'buff');
    const otherSkills = SKILLS.filter(s => s.type !== 'heal' && s.type !== 'buff');
    // サポート技を3倍に
    const weightedSkills = [...supportSkills, ...supportSkills, ...supportSkills, ...otherSkills];
    return weightedSkills[Math.floor(Math.random() * weightedSkills.length)];
  } else if (zoneType === '乱舞のゾーン') {
    // 攻撃技が非常に出やすい
    const attackSkills = SKILLS.filter(s => s.type === 'attack');
    const otherSkills = SKILLS.filter(s => s.type !== 'attack');
    // 攻撃技を10倍に（非常に出やすい）
    const weightedSkills = [
      ...attackSkills, ...attackSkills, ...attackSkills, 
      ...attackSkills, ...attackSkills, ...attackSkills,
      ...attackSkills, ...attackSkills, ...attackSkills,
      ...attackSkills,
      ...otherSkills
    ];
    return weightedSkills[Math.floor(Math.random() * weightedSkills.length)];
  } else if (zoneType === '博打のゾーン') {
    // 超必殺技か何もしないのどちらか
    const ultimateSkills = SKILLS.filter(s => s.power >= 40);
    const nothingSkill = { id: 0, name: '何もしない', type: 'special' as const, power: 0, description: '何も起こらなかった' };
    // 50%で超必殺技、50%で何もしない
    if (Math.random() < 0.5) {
      return ultimateSkills[Math.floor(Math.random() * ultimateSkills.length)];
    } else {
      return nothingSkill;
    }
  } else {
    // ゾーンなしの場合は通常の抽選
    return SKILLS[Math.floor(Math.random() * SKILLS.length)];
  }
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
      
      // 防御者が集中のゾーン中の場合、ダメージを軽減（75%のダメージになる）
      if (defender.state.activeZone.type === '集中のゾーン') {
        damage = Math.floor(damage * 0.75);
        message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！（集中のゾーンで軽減）`;
      } else {
        message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！`;
      }
      
      defender.state.hp = Math.max(0, defender.state.hp - damage);
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
      if (skill.name === '何もしない') {
        message = `${attacker.username}は何もしなかった...`;
      } else if (skill.name === '自爆') {
        damage = skill.power;
        const selfDamage = Math.floor(skill.power * 0.5);
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        attacker.state.hp = Math.max(0, attacker.state.hp - selfDamage);
        message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！ 自分も${selfDamage}ダメージを受けた！`;
      } else if (skill.power > 0) {
        damage = skill.power;
        
        // 防御者が集中のゾーン中の場合、ダメージを軽減
        if (defender.state.activeZone.type === '集中のゾーン') {
          damage = Math.floor(damage * 0.75);
          message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！（集中のゾーンで軽減）`;
        } else {
          message = `${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！`;
        }
        
        defender.state.hp = Math.max(0, defender.state.hp - damage);
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
      } else if (attacker.state.activeZone.type === '乱舞のゾーン') {
        zoneEffectMessage = `🌪️ ゾーン効果: 攻撃技が激増！`;
      } else if (attacker.state.activeZone.type === '博打のゾーン') {
        if (selectedSkill.power >= 40) {
          zoneEffectMessage = `🎰 ゾーン効果: 超必殺技が出現！`;
        } else if (selectedSkill.power === 0 && selectedSkill.name === '何もしない') {
          zoneEffectMessage = `🎰 ゾーン効果: 何もしなかった...`;
        }
      }
    }

    // Apply skill effect
    let result = applySkillEffect(selectedSkill, attacker, defender);
    if (zoneEffectMessage) {
      result.message = zoneEffectMessage + '\n' + result.message;
    }

    // ゾーン効果の適用
    if (attacker.state.activeZone.type === '強攻のゾーン') {
      // 20%の確率で反動ダメージ
      if (Math.random() < 0.2) {
        const recoilDamage = Math.floor(selectedSkill.power * 0.5); // 技の威力の50%
        attacker.state.hp = Math.max(0, attacker.state.hp - recoilDamage);
        console.log(`⚠️ ${attacker.username} took ${recoilDamage} recoil damage from 強攻のゾーン!`);
        result.message += `\n反動ダメージ！${recoilDamage}ダメージを受けた！`;
      }
    } else if (attacker.state.activeZone.type === '集中のゾーン') {
      // 受けるダメージを少し軽減する（既に効果が出ている）
      // ここではログのみ
      console.log(`🛡️ ${attacker.username} is in 集中のゾーン, damage reduction applied`);
    } else if (attacker.state.activeZone.type === '乱舞のゾーン') {
      // MP回復が止まる（後で処理）
      console.log(`🌪️ ${attacker.username} is in 乱舞のゾーン, MP recovery stopped`);
    }

    // Recover MP at turn end (1 MP recovery) - ただし乱舞のゾーン中は回復しない、上限5
    if (attacker.state.activeZone.type !== '乱舞のゾーン') {
      attacker.state.mp = Math.min(5, attacker.state.mp + 1);
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
