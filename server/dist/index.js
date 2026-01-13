import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
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
const waitingRoom = [];
const activeGames = new Map();
// Helper function to create initial player state
function createPlayerState() {
    return {
        hp: 500, // 初期HP 500
        maxHp: 500, // 初期最大HP 500
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
function getRandomSkill(activeZone) {
    // 博打のゾーン判定を最初に実行
    if (activeZone.type === '博打のゾーン') {
        const random = Math.random();
        const gigaImpact = SKILLS.find(skill => skill.id === 200); // ギガインパクト
        const doNothing = SKILLS.find(skill => skill.id === 201); // 何もしない
        if (random < 0.5) {
            // 50%の確率で超必殺技
            console.log('🎰 博打判定：成功（ギガインパクト発動）');
            return gigaImpact;
        }
        else {
            // 50%の確率で何もしない
            console.log('🎰 博打判定：失敗（運命に見放された）');
            return doNothing;
        }
    }
    // 通常技リスト（ギガインパクトと何もしないを除外 - id 200, 201）
    let availableSkills = SKILLS.filter(skill => skill.id < 200);
    // ゾーン効果：条件に合う技のみに絞り込む
    if (activeZone.type === '強攻のゾーン') {
        // 威力50以上の技のみ
        const powerSkills = availableSkills.filter(skill => skill.power >= 50);
        if (powerSkills.length > 0) {
            availableSkills = powerSkills;
            console.log(`🔥 強攻のゾーン: 威力50以上の技のみ抽選 (${powerSkills.length}種類)`);
        }
    }
    else if (activeZone.type === '集中のゾーン') {
        // 回復・最大HP増加・補助系のみ
        const supportSkills = availableSkills.filter(skill => skill.type === 'heal' ||
            skill.type === 'buff' ||
            skill.effect === 'max_hp_boost' ||
            skill.effect === 'max_hp_boost_with_heal' ||
            skill.effect === 'max_hp_boost_with_damage');
        if (supportSkills.length > 0) {
            availableSkills = supportSkills;
            console.log(`🎯 集中のゾーン: 回復・補助系のみ抽選 (${supportSkills.length}種類)`);
        }
    }
    else if (activeZone.type === '乱舞のゾーン') {
        // 攻撃技のみ
        const attackSkills = availableSkills.filter(skill => skill.type === 'attack');
        if (attackSkills.length > 0) {
            availableSkills = attackSkills;
            console.log(`🌪️ 乱舞のゾーン: 攻撃技のみ抽選 (${attackSkills.length}種類)`);
        }
    }
    // ランダムに1つ選択
    const randomIndex = Math.floor(Math.random() * availableSkills.length);
    return availableSkills[randomIndex];
}
// Helper function to apply skill effect
function applySkillEffect(skill, attacker, defender) {
    let isPoisonApplied = false;
    let isMultiHit = false;
    let isProtected = false;
    let damage = 0;
    let healing = 0;
    const logs = [];
    // ダメージ乱数（0.9倍～1.1倍）
    const damageVariance = () => {
        return 0.9 + Math.random() * 0.2; // 0.9 <= x <= 1.1
    };
    // ダメージ計算（基本値に乱数を適用）
    const calculateDamage = (base) => {
        return Math.floor(base * damageVariance());
    };
    // ダメージ軽減（集中のゾーン）を計算する補助
    const applyDefense = (base) => {
        if (defender.state.activeZone.type === '集中のゾーン') {
            return Math.floor(base * 0.75);
        }
        return base;
    };
    switch (skill.type) {
        case 'attack': {
            // 命中率チェック（ギガインパクト用）
            if (skill.effect === 'hit_rate' && skill.hitRate) {
                const hit = Math.random();
                if (hit > skill.hitRate) {
                    logs.push(`${attacker.username}の${skill.name}！ しかし、外れた！`);
                    return { damage: 0, healing: 0, message: logs.join('\n'), skillType: 'attack' };
                }
            }
            // 基本ダメージ計算
            let baseDamage = calculateDamage(skill.power);
            damage = applyDefense(baseDamage);
            defender.state.hp = Math.max(0, defender.state.hp - damage);
            logs.push(`${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ与えた！`);
            // ひっかく：10%で2回連続攻撃
            if (skill.effect === 'multi_hit' && skill.multiHitChance) {
                if (Math.random() < skill.multiHitChance) {
                    const secondDamage = applyDefense(calculateDamage(skill.power));
                    defender.state.hp = Math.max(0, defender.state.hp - secondDamage);
                    damage += secondDamage;
                    logs.push(`🔄 2回連続攻撃！ さらに${secondDamage}ダメージ！`);
                    isMultiHit = true;
                }
            }
            // 捨て身タックル：自分も25%ダメージ受ける
            if (skill.effect === 'self_damage' && skill.selfDamageRatio) {
                const selfDamageAmount = Math.floor(baseDamage * skill.selfDamageRatio);
                attacker.state.hp = Math.max(0, attacker.state.hp - selfDamageAmount);
                logs.push(`⚠️ 反動で${selfDamageAmount}ダメージ！`);
            }
            // ドレイン：与ダメージの50%を回復
            if (skill.effect === 'drain' && skill.drainRatio) {
                const healAmount = Math.floor(damage * skill.drainRatio);
                attacker.state.hp = Math.min(attacker.state.maxHp, attacker.state.hp + healAmount);
                healing += healAmount;
                logs.push(`🩸 ドレイン効果で${healAmount}回復！`);
            }
            // ギガドレイン：与ダメージ + 最大HP増加 + 回復
            if (skill.effect === 'max_hp_boost_with_damage' && skill.maxHpBoost) {
                const boost = skill.maxHpBoost;
                const oldMaxHp = attacker.state.maxHp;
                attacker.state.maxHp = Math.min(1000, attacker.state.maxHp + boost);
                const actualBoost = attacker.state.maxHp - oldMaxHp;
                attacker.state.hp = Math.min(attacker.state.maxHp, attacker.state.hp + actualBoost);
                healing += actualBoost;
                logs.push(`💪 最大HPが${actualBoost}増加！ HPも${actualBoost}回復！`);
            }
            // ドレインパンチ（既存lifesteal）
            if (skill.effect === 'lifesteal') {
                const ratio = skill.lifestealRatio ?? 0.5;
                const healAmount = Math.floor(damage * ratio);
                attacker.state.hp = Math.min(attacker.state.maxHp, attacker.state.hp + healAmount);
                healing += healAmount;
                logs.push(`🩸 ドレイン効果で${healAmount}回復！`);
            }
            // 反動ダメージ
            if (skill.effect === 'recoil') {
                const ratio = skill.recoilRatio ?? 0.25;
                const recoil = Math.floor(baseDamage * ratio);
                attacker.state.hp = Math.max(0, attacker.state.hp - recoil);
                logs.push(`⚠️ 反動で${recoil}ダメージ！`);
            }
            break;
        }
        case 'heal': {
            healing = skill.power;
            attacker.state.hp = Math.min(attacker.state.maxHp, attacker.state.hp + healing);
            logs.push(`${attacker.username}の${skill.name}！ HPを${healing}回復！`);
            break;
        }
        case 'buff': {
            if (skill.effect === 'mp_regen_boost') {
                const amount = skill.mpRegenBonus ?? 1;
                const duration = skill.mpRegenDuration ?? 3;
                attacker.state.status.mpRegenBonus = { amount, turns: duration };
                logs.push(`${attacker.username}の${skill.name}！ しばらくMP回復量が+${amount}に！`);
            }
            else if (skill.effect === 'poison') {
                const dmg = skill.poisonDamage ?? 5;
                const duration = skill.poisonDuration ?? 3;
                defender.state.status.poison = { damagePerTurn: dmg, turns: duration };
                logs.push(`${attacker.username}の${skill.name}！ ${defender.username}をどく状態にした（${duration}ターン、毎ターン${dmg}ダメージ）！`);
                isPoisonApplied = true;
            }
            else if (skill.effect === 'charge') {
                // チャージ：次のターンの攻撃力2倍（実装はゲームロジックで行う）
                logs.push(`${attacker.username}の${skill.name}！ 次のターン攻撃力が2倍になる！`);
            }
            else if (skill.effect === 'protect') {
                // まもる：次の相手の攻撃を80%カット（実装はゲームロジックで行う）
                logs.push(`${attacker.username}の${skill.name}！ 次の相手の攻撃を大きく軽減する！`);
                isProtected = true;
            }
            else if (skill.effect === 'max_hp_boost' && skill.maxHpBoost) {
                // 命の源：最大HPのみ増加
                const boost = skill.maxHpBoost;
                const oldMaxHp = attacker.state.maxHp;
                attacker.state.maxHp = Math.min(1000, attacker.state.maxHp + boost);
                const actualBoost = attacker.state.maxHp - oldMaxHp;
                logs.push(`💪 ${attacker.username}の最大HPが${actualBoost}増加！ (現在: ${attacker.state.maxHp}/1000)`);
            }
            else if (skill.effect === 'max_hp_boost_with_heal' && skill.maxHpBoost) {
                // ビルドアップ：最大HP増加 + 回復
                const boost = skill.maxHpBoost;
                const oldMaxHp = attacker.state.maxHp;
                attacker.state.maxHp = Math.min(1000, attacker.state.maxHp + boost);
                const actualBoost = attacker.state.maxHp - oldMaxHp;
                const healAmount = skill.power;
                attacker.state.hp = Math.min(attacker.state.maxHp, attacker.state.hp + healAmount);
                healing += healAmount;
                logs.push(`💪 ${attacker.username}の最大HPが${actualBoost}増加！ HPを${healAmount}回復！`);
            }
            else {
                logs.push(`${attacker.username}の${skill.name}！ ${skill.description}`);
            }
            break;
        }
        case 'special': {
            // 「何もしない」技の特別処理
            if (skill.id === 201) {
                logs.push(`💫 ${attacker.username}は指を振った...が何も起こらなかった！`);
                logs.push(`😱 運命に見放された...！`);
            }
            else {
                logs.push(`${attacker.username}の${skill.name}！ ${skill.description}`);
            }
            break;
        }
    }
    return {
        damage,
        healing,
        message: logs.join('\n'),
        isPoisonApplied,
        isMultiHit,
        isProtected,
        skillType: skill.type,
    };
}
io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);
    // Handle join game event
    socket.on('joinGame', (payload) => {
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
            const player1 = waitingRoom.shift();
            const player2 = waitingRoom.shift();
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
                const gameState = {
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
        }
        else {
            // Notify player they're in waiting room
            socket.emit('waiting', {
                message: 'Waiting for opponent...',
                playersWaiting: waitingRoom.length,
            });
        }
    });
    // Handle action_activate_zone event
    socket.on('action_activate_zone', (payload) => {
        console.log(`🌀 ${socket.id} activating zone: ${payload.zoneType}`);
        // Find the game this player is in
        let currentGame;
        let currentRoomId;
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
        let currentGame;
        let currentRoomId;
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
        // Safety: ensure opponent exists before proceeding
        if (!defender || !defender.state) {
            console.warn(`⚠️ Defender missing for socket ${socket.id}`);
            socket.emit('error', { message: 'Opponent not found' });
            return;
        }
        // ターン開始時の状態異常処理（毒など）
        const preMessages = [];
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
            }
            else if (attacker.state.activeZone.type === '集中のゾーン') {
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
        // 強攻のゾーン：20%の確率で自傷ダメージ
        if (attacker.state.activeZone.type === '強攻のゾーン') {
            const selfDamageChance = Math.random();
            if (selfDamageChance < 0.2) {
                const selfDamage = Math.floor(result.damage * 0.2) || 10; // 与えたダメージの20%、または最低10
                attacker.state.hp = Math.max(0, attacker.state.hp - selfDamage);
                messageParts.push(`💢 強攻の反動！ ${attacker.username}は${selfDamage}ダメージを受けた！`);
                console.log(`💢 強攻の反動: ${attacker.username} -${selfDamage} HP`);
            }
        }
        result.message = messageParts.join('\n');
        // Debug: log HP state right after damage/heal is applied
        console.log(`🧪 HP after action -> ${attacker.username}: ${attacker.state.hp}, ${defender.username}: ${defender.state.hp}`);
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
        // Check for game over (only while battle is active and after HP updates)
        if (!currentGame.isGameOver && defender.state.hp <= 0) {
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
        if (!currentGame.isGameOver && attacker.state.hp <= 0) {
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
//# sourceMappingURL=index.js.map