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
  // スマホ向け：heartbeat間隔を短く設定
  pingInterval: 5000,
  pingTimeout: 3000,
});

app.use(cors({
  origin: '*',
}));
app.use(express.json());

// Waiting room management
interface WaitingPlayer {
  playerId: string;
  socketId: string;
  username: string;
}

// Game state management
interface GameState {
  roomId: string;
  player1: {
    playerId: string;
    socketId: string;
    username: string;
    state: PlayerState;
  };
  player2: {
    playerId: string;
    socketId: string;
    username: string;
    state: PlayerState;
  };
  currentTurn: number;
  turnIndex: 0 | 1; // 0: player1, 1: player2
  currentTurnPlayerId: string; // 現在のターンのプレイヤーID（互換用）
  isGameOver: boolean;
  winner: string | null;
  startedAt?: number; // ゲーム開始時刻（マッチング直後の保護用）
  lastTurnChangeTime?: number; // 最後のターン変更時刻（ウォッチドッグ用）
}

const waitingRoom: WaitingPlayer[] = [];
const activeGames = new Map<string, GameState>();
// オフライン保持: playerId -> { roomId, lastSeen, username }
const offlinePlayers = new Map<string, { roomId: string; lastSeen: number; username: string; socketId: string }>();
const socketToPlayerId = new Map<string, string>();
// マッチング確認待ち: roomId -> { player1_ready, player2_ready, timeout }
const matchingWaitingRooms = new Map<string, { player1_ready: boolean; player2_ready: boolean; timeout: NodeJS.Timeout; roomData: any }>();
// ウォッチドッグ監視: roomId -> timeoutID
const watchdogTimers = new Map<string, NodeJS.Timeout>();

// Helper function to create initial player state
function createPlayerState(): PlayerState {
  return {
    hp: 500, // 初期HP 500
    maxHp: 500, // 初期最大HP 500
    mp: 0, // 初期MP 0、上限5
    isBuffed: false,
    buffTurns: 0,
    activeZone: {
      type: 'none',
      remainingTurns: 0,
    },
    status: {
      poison: null,
      mpRegenBonus: null,
    },
    isRiichi: false,
    activeEffect: 'none',
    activeEffectTurns: 0,
    riichiBombCount: 0,
    isBroken: false,
    brokenTurns: 0,
    // 反射・カウンター系の初期化
    isReflecting: false,
    isCounter: false,
    isDestinyBond: false,
  };
}

// Helper function to clean up game room and offline player data
function cleanupGameRoom(roomId: string) {
  const game = activeGames.get(roomId);
  if (game) {
    // 両プレイヤーのオフラインデータを削除
    const player1Id = Array.from(socketToPlayerId.entries()).find(([, id]) => {
      const info = offlinePlayers.get(id);
      return info && info.roomId === roomId;
    })?.[1];
    
    const player2Id = Array.from(socketToPlayerId.entries()).find(([, id]) => {
      if (id === player1Id) return false;
      const info = offlinePlayers.get(id);
      return info && info.roomId === roomId;
    })?.[1];
    
    if (player1Id) offlinePlayers.delete(player1Id);
    if (player2Id) offlinePlayers.delete(player2Id);
  }
  
  activeGames.delete(roomId);
  stopWatchdog(roomId); // ウォッチドッグをクリア
  console.log(`🗑️ Room ${roomId} cleaned up: game data and offline player info deleted`);
}

// Helper function to start watchdog for a game room (re-sync turn after 5s inactivity)
function startWatchdog(roomId: string) {
  // 既存のウォッチドッグをクリア
  const existingTimer = watchdogTimers.get(roomId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // 3秒後：警告ログを出す
  const warningTimer = setTimeout(() => {
    const game = activeGames.get(roomId);
    if (game && !game.isGameOver) {
      console.log(`⚠️ Room ${roomId}: No action for 3 seconds. Preparing reminder...`);
    }
  }, 3000);

  // 5秒後：ターン状態を再送信（3秒以上行動なし）
  const timer = setTimeout(() => {
    const game = activeGames.get(roomId);
    if (game && !game.isGameOver) {
      console.log(`⏰ Watchdog triggered for room ${roomId}: Re-syncing turn...`);
      const currentPlayer = game.turnIndex === 0 ? game.player1 : game.player2;
      game.currentTurnPlayerId = currentPlayer.playerId;
      const currentPlayerName = currentPlayer.username;
      
      // 【自動復旧】現在のターン状態をリマインド送信
      io.to(roomId).emit('turn_change', {
        turnIndex: game.turnIndex,
        currentTurnPlayerId: game.currentTurnPlayerId,
        currentTurnPlayerName: currentPlayerName,
        gameState: game, // 完全なgameStateを送信
        isReminder: true, // リマインド フラグ
      });
      
      // 【デッドロック救済】game_state_updateで強制的にボタン有効化を指示
      io.to(roomId).emit('game_state_update', {
        gameState: game,
        turnIndex: game.turnIndex,
        currentTurnPlayerId: game.currentTurnPlayerId,
        forceUnlock: true, // ボタン強制有効化フラグ
        message: `${currentPlayerName}のターン（再通知）`,
      });
      
      console.log(`✅ Turn re-synced (reminder): ${currentPlayerName} (${game.currentTurnPlayerId})`);
      console.log(`🔓 デッドロック救済: ボタン強制有効化を指示`);
    }
  }, 5000); // 5秒のウォッチドッグ

  watchdogTimers.set(roomId, timer);
  console.log(`🐕 Watchdog started for room ${roomId} (3s warning → 5s reminder)`);
}

// Helper function to stop watchdog for a game room
function stopWatchdog(roomId: string) {
  const timer = watchdogTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    watchdogTimers.delete(roomId);
    console.log(`🛑 Watchdog stopped for room ${roomId}`);
  }
}

// Helper: weighted random pick according to zone rules
function getRandomSkill(activeZone: PlayerState['activeZone'], isRiichi: boolean = false, attackerHp: number = 500, maxHp: number = 500, currentTurn: number = 1): Skill {
  // 【天和】究極のレア技：1ターン目のみ、0.01%の確率で出現
  if (currentTurn === 1) {
    const tenpaiLuck = Math.random();
    if (tenpaiLuck < 0.0001) { // 0.01%（1/10000）
      const tenpai = SKILLS.find(skill => skill.id === 131);
      console.log('🌟✨ 天和（テンホウ）が発動！究極のレア技！！！');
      return tenpai!;
    }
  }

  // 博打のゾーン判定を最初に実行
  if (activeZone.type === '博打のゾーン') {
    const random = Math.random();
    const gigaImpact = SKILLS.find(skill => skill.id === 200); // ギガインパクト
    const doNothing = SKILLS.find(skill => skill.id === 201); // 何もしない
    
    if (random < 0.3) {
      // 30%の確率でギガインパクト
      console.log('🎰 博打判定：成功（ギガインパクト発動 / 30%）');
      return gigaImpact!;
    } else {
      // 70%の確率でスカ（何も起きない）
      console.log('🎰 博打判定：失敗（スカ / 70%：何も起きない）');
      return doNothing!;
    }
  }

  // 【逆転の目】HP25%以下で起死回生の出現率UP
  const currentHpPercent = attackerHp / maxHp;
  if (currentHpPercent <= 0.25) {
    const comebackChance = Math.random();
    if (comebackChance < 0.4) { // 40%の確率で起死回生
      const comeback = SKILLS.find(skill => skill.id === 119);
      console.log('🔄 HP危機的！起死回生が出現！');
      return comeback!;
    }
  }

  // 【道連れ】HP20%以下で抽選可能（5%の確率）
  if (currentHpPercent <= 0.20) {
    const destinyBondChance = Math.random();
    if (destinyBondChance < 0.05) { // 5%の確率で道連れ
      const destinyBond = SKILLS.find(skill => skill.id === 134);
      console.log('💀 HP危機的！道連れが出現！');
      return destinyBond!;
    }
  }

  // 【特殊勝利】出禁の超レア抽選（0.15%）
  const rareLuck = Math.random();
  if (rareLuck < 0.0015) { // 0.15%
    const kinshi = SKILLS.find(skill => skill.id === 120);
    console.log('⛔ 出禁が発動！相手を場外へ！');
    return kinshi!;
  }

  // 【麻雀役満】九蓮宝燈の超超超レア抽選（0.05%）
  const chuurenLuck = Math.random();
  if (chuurenLuck < 0.0005) { // 0.05%
    const chuuren = SKILLS.find(skill => skill.id === 130);
    console.log('🀄✨ 幻の役満！九蓮宝燈が出現！');
    return chuuren!;
  }

  // 【麻雀役満】国士無双のレア抽選（0.1%）
  const kokushiLuck = Math.random();
  if (kokushiLuck < 0.001) { // 0.1%
    const kokushi = SKILLS.find(skill => skill.id === 129);
    console.log('🀄 役満！国士無双が出現！');
    return kokushi!;
  }

  // 【麻雀役】清一色の低確率抽選（2%）
  const chinItsuLuck = Math.random();
  if (chinItsuLuck < 0.02) { // 2%
    const chinItsu = SKILLS.find(skill => skill.id === 128);
    console.log('🀄 清一色が出現！');
    return chinItsu!;
  }

  // 通常技リスト（ギガインパクトと何もしないを除外 - id 200, 201）
  let availableSkills = SKILLS.filter(skill => skill.id < 200);

  // 立直状態の場合、ロン/ツモを追加
  if (isRiichi) {
    const ron = SKILLS.find(skill => skill.id === 112); // ロン
    const tsumo = SKILLS.find(skill => skill.id === 113); // ツモ
    if (ron && tsumo) {
      availableSkills = [...availableSkills, ron, tsumo];
      console.log('🀄 立直状態：ロン/ツモが出現可能！');
    }
  }

  // ゾーン効果：条件に合う技のみに絞り込む
  if (activeZone.type === '強攻のゾーン') {
    // 威力50以上の技のみ
    const powerSkills = availableSkills.filter(skill => skill.power >= 50);
    if (powerSkills.length > 0) {
      availableSkills = powerSkills;
      console.log(`🔥 強攻のゾーン: 威力50以上の技のみ抽選 (${powerSkills.length}種類)`);
    }
  } else if (activeZone.type === '集中のゾーン') {
    // 回復・最大HP増加・補助系のみ
    const supportSkills = availableSkills.filter(skill => 
      skill.type === 'heal' || 
      skill.type === 'buff' ||
      skill.effect === 'max_hp_boost' ||
      skill.effect === 'max_hp_boost_with_heal' ||
      skill.effect === 'max_hp_boost_with_damage'
    );
    if (supportSkills.length > 0) {
      availableSkills = supportSkills;
      console.log(`🎯 集中のゾーン: 回復・補助系のみ抽選 (${supportSkills.length}種類)`);
    }
  } else if (activeZone.type === '乱舞のゾーン') {
    // 攻撃技のみ
    const attackSkills = availableSkills.filter(skill => skill.type === 'attack');
    if (attackSkills.length > 0) {
      availableSkills = attackSkills;
      console.log(`🌪️ 乱舞のゾーン: 攻撃技のみ抽選 (${attackSkills.length}種類)`);
    }
  }

  // 技リストが空の場合のフォールバック（絶対に空にしない）
  if (availableSkills.length === 0) {
    console.warn('⚠️ フィルタ後の技リストが空です。全技から再抽選します。');
    availableSkills = SKILLS.filter(skill => skill.id < 200); // ギガインパクト等を除外
    if (availableSkills.length === 0) {
      // それでも空なら最低限のフォールバック技を作成
      availableSkills = [{
        id: 0,
        name: 'ゆびをふる',
        type: 'attack',
        power: 10,
        description: '基本攻撃',
        effect: 'none'
      } as Skill];
      console.warn('⚠️ SKILLS配列が完全に空です。フォールバック技を使用します。');
    }
  }

  // ランダムに1つ選択
  const randomIndex = Math.floor(Math.random() * availableSkills.length);
  let selectedSkill = availableSkills[randomIndex];
  
  // 【立直中の役昇格】通常技が選ばれた場合、役に昇格する可能性
  if (isRiichi) {
    // 役のIDリスト（タンヤオ127、清一色128、国士無双129、九蓮宝燈130）
    const yakuIds = [127, 128, 129, 130];
    const isYaku = yakuIds.includes(selectedSkill.id);
    
    // 通常技（役ではない）が選ばれた場合のみ昇格抽選
    if (!isYaku) {
      const upgradeRoll = Math.random() * 100; // 0-100の乱数
      
      if (upgradeRoll < 1) { // 1%で九蓮宝燈
        const chuuren = SKILLS.find(skill => skill.id === 130);
        if (chuuren) {
          selectedSkill = chuuren;
          console.log('🀄✨ 立直昇格！九蓮宝燈へ昇格！（1%）');
        }
      } else if (upgradeRoll < 4) { // 3%で国士無双（累計4%）
        const kokushi = SKILLS.find(skill => skill.id === 129);
        if (kokushi) {
          selectedSkill = kokushi;
          console.log('🀄 立直昇格！国士無双へ昇格！（3%）');
        }
      } else if (upgradeRoll < 9) { // 5%で清一色（累計9%）
        const chinItsu = SKILLS.find(skill => skill.id === 128);
        if (chinItsu) {
          selectedSkill = chinItsu;
          console.log('🀄 立直昇格！清一色へ昇格！（5%）');
        }
      } else if (upgradeRoll < 19) { // 10%で断幺九（累計19%）
        const tanyao = SKILLS.find(skill => skill.id === 127);
        if (tanyao) {
          selectedSkill = tanyao;
          console.log('🀄 立直昇格！断幺九へ昇格！（10%）');
        }
      }
      // 19%を超えた場合は通常技のまま
    }
  }
  
  // 最終的な安全チェック：技が選択されていない場合のフォールバック
  if (!selectedSkill) {
    console.warn('⚠️ getRandomSkill: 技が選択されませんでした。デフォルト技（パンチ）を返します。');
    selectedSkill = SKILLS.find(skill => skill.id === 1) || {
      id: 0,
      name: 'ゆびをふる',
      type: 'attack',
      power: 10,
      description: '基本攻撃',
      effect: 'none'
    } as Skill;
  }
  
  return selectedSkill;
}


// Helper function to apply skill effect
function applySkillEffect(
  skill: Skill,
  attacker: GameState['player1'],
  defender: GameState['player2'],
  riichiFieldBoost: number = 1.0
): { 
  damage: number; 
  healing: number; 
  message: string;
  isPoisonApplied?: boolean;
  isMultiHit?: boolean;
  isProtected?: boolean;
  skillType?: string;
  skillEffect?: string;
  wasBuffedAttack?: boolean;
} {
  let isPoisonApplied = false;
  let isMultiHit = false;
  let isProtected = false;
  let wasBuffedAttack = false;
  let damage = 0;
  let healing = 0;
  const logs: string[] = [];
  let resultSkillEffect: string | undefined;

  // ダメージ乱数（0.9倍～1.1倍）
  const damageVariance = () => {
    return 0.9 + Math.random() * 0.2; // 0.9 <= x <= 1.1
  };

  // ダメージ計算（基本値に乱数を適用）
  const calculateDamage = (base: number): number => {
    return Math.floor(base * damageVariance());
  };

  // ダメージ軽減（集中のゾーン）を計算する補助
  const applyDefense = (base: number) => {
    if (defender.state.activeZone.type === '集中のゾーン') {
      return Math.floor(base * 0.75);
    }
    return base;
  };

  switch (skill.type) {
    case 'attack': {
      const hadBuff = attacker.state.isBuffed;
      if (hadBuff) {
        wasBuffedAttack = true;
        attacker.state.buffTurns = (attacker.state.buffTurns ?? 1) - 1;
      }
      // 攻撃バフが乗っている場合、最終計算前に倍率適用
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
      if (hadBuff) {
        baseDamage = Math.floor(baseDamage * 2);
        // バフは一度攻撃したら消費
        if ((attacker.state.buffTurns ?? 0) <= 0) {
          attacker.state.isBuffed = false;
          attacker.state.buffTurns = 0;
        }
      }
      
      // 立直フィールド効果を適用（役のみ、相手が立直中）
      baseDamage = Math.floor(baseDamage * riichiFieldBoost);
      
      damage = applyDefense(baseDamage);
      
      // 【反射チェック】ダメージが0より大きい場合のみ反射処理
      if (damage > 0) {
        // ミラーコート：ダメージを0にして1.5倍で跳ね返す
        if (defender.state.isReflecting) {
          const reflectDamage = Math.floor(damage * 1.5);
          attacker.state.hp = Math.max(0, attacker.state.hp - reflectDamage);
          defender.state.isReflecting = false; // 反射状態解除
          logs.push(`🛡️✨ ${defender.username}のミラーコート！`);
          logs.push(`🔮 REFLECT!! ダメージを跳ね返した！`);
          logs.push(`💥 ${attacker.username}に${reflectDamage}の反射ダメージ！`);
          resultSkillEffect = 'reflect-success';
          damage = 0; // 自分はダメージを受けない
          // defenderのHPは変更しない
        }
        // カウンター：ダメージを50%軽減し、軽減前の2倍で返す
        else if (defender.state.isCounter) {
          const originalDamage = damage;
          const reducedDamage = Math.floor(damage * 0.5);
          const counterDamage = Math.floor(originalDamage * 2);
          
          defender.state.hp = Math.max(0, defender.state.hp - reducedDamage);
          attacker.state.hp = Math.max(0, attacker.state.hp - counterDamage);
          defender.state.isCounter = false; // カウンター状態解除
          
          logs.push(`⚔️🛡️ ${defender.username}のカウンター！`);
          logs.push(`🔄 COUNTER!! 攻撃を見切った！`);
          logs.push(`💢 ${defender.username}は${reducedDamage}ダメージを受けた`);
          logs.push(`⚡ ${attacker.username}に${counterDamage}の反撃ダメージ！`);
          resultSkillEffect = 'counter-success';
          damage = reducedDamage; // 軽減後のダメージを記録
        }
        else {
          // 通常のダメージ処理
          defender.state.hp = Math.max(0, defender.state.hp - damage);
        }
      } else {
        // ダメージが0の技には反射しない（反射状態も消費しない）
        defender.state.hp = Math.max(0, defender.state.hp - damage);
      }
      
      // ネタ技の特別ログ
      if (skill.id === 115) {
        logs.push(`🥚 ${attacker.username}の${skill.name}！`);
        logs.push(`🤖 全自動で卵を割る機械で攻撃... ${defender.username}に${damage}ダメージ！`);
      } else {
        logs.push(`${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ与えた！`);
      }

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
      if (skill.effect === 'riichi') {
        // 立直：isRiichiをtrueにする
        attacker.state.isRiichi = true;
        logs.push(`${attacker.username}の${skill.name}！`);
        logs.push(`🀄 立直！ 一撃必殺の準備が整った...！`);
      } else if (skill.effect === 'mp_regen_boost') {
        const amount = skill.mpRegenBonus ?? 1;
        const duration = skill.mpRegenDuration ?? 3;
        attacker.state.status.mpRegenBonus = { amount, turns: duration };
        logs.push(`${attacker.username}の${skill.name}！ しばらくMP回復量が+${amount}に！`);
      } else if (skill.effect === 'poison') {
        const dmg = skill.poisonDamage ?? 5;
        const duration = skill.poisonDuration ?? 3;
        defender.state.status.poison = { damagePerTurn: dmg, turns: duration };
        logs.push(`${attacker.username}の${skill.name}！ ${defender.username}をどく状態にした（${duration}ターン、毎ターン${dmg}ダメージ）！`);
        isPoisonApplied = true;
      } else if (skill.effect === 'charge') {
        // チャージ：次のターンの攻撃力2倍（実装はゲームロジックで行う）
        logs.push(`${attacker.username}の${skill.name}！ 次のターン攻撃力が2倍になる！`);
        attacker.state.isBuffed = true;
        attacker.state.buffTurns = 1;
      } else if (skill.effect === 'protect') {
        // まもる：次の相手の攻撃を80%カット（実装はゲームロジックで行う）
        logs.push(`${attacker.username}の${skill.name}！ 次の相手の攻撃を大きく軽減する！`);
        isProtected = true;
      } else if (skill.effect === 'max_hp_boost' && skill.maxHpBoost) {
        // 命の源：最大HPのみ増加
        const boost = skill.maxHpBoost;
        const oldMaxHp = attacker.state.maxHp;
        attacker.state.maxHp = Math.min(1000, attacker.state.maxHp + boost);
        const actualBoost = attacker.state.maxHp - oldMaxHp;
        logs.push(`💪 ${attacker.username}の最大HPが${actualBoost}増加！ (現在: ${attacker.state.maxHp}/1000)`);
      } else if (skill.effect === 'max_hp_boost_with_heal' && skill.maxHpBoost) {
        // ビルドアップ：最大HP増加 + 回復
        const boost = skill.maxHpBoost;
        const oldMaxHp = attacker.state.maxHp;
        attacker.state.maxHp = Math.min(1000, attacker.state.maxHp + boost);
        const actualBoost = attacker.state.maxHp - oldMaxHp;
        const healAmount = skill.power;
        attacker.state.hp = Math.min(attacker.state.maxHp, attacker.state.hp + healAmount);
        healing += healAmount;
        logs.push(`💪 ${attacker.username}の最大HPが${actualBoost}増加！ HPを${healAmount}回復！`);
      } else if (skill.id === 116) {
        // 強制土下座（ネタ技）
        logs.push(`${attacker.username}の${skill.name}！`);
        logs.push(`🙇‍♂️ 相手に土下座させようとしたが失敗した...`);
      } else if (skill.id === 118) {
        // 遺憾の意（ネタ技）
        logs.push(`${attacker.username}の${skill.name}！`);
        logs.push(`😐 遺憾の意を表明したが戦況は変わらない...`);
      } else {
        logs.push(`${attacker.username}の${skill.name}！ ${skill.description}`);
      }
      break;
    }

    case 'special': {
      // 高威力単発（例: ギガインパクトなど）
      if (skill.effect === 'hit_rate' && skill.hitRate) {
        const hit = Math.random();
        if (hit > skill.hitRate) {
          logs.push(`${attacker.username}の${skill.name}！ しかし、外れた！`);
          return { damage: 0, healing: 0, message: logs.join('\n'), skillType: 'special' };
        }
        // 命中時は防御補正込みで確定ダメージを与える
        const baseDamage = calculateDamage(skill.power);
        damage = applyDefense(baseDamage);
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        logs.push(`${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージ！！`);
        break;
      }

      // 【逆転の目】起死回生
      if (skill.effect === 'comeback') {
        // 威力 = (最大HP - 現在HP) * 0.8（減っているHPが多いほど強い）
        const hpDeficit = attacker.state.maxHp - attacker.state.hp;
        damage = Math.max(20, Math.floor(hpDeficit * 0.8)); // 最低威力20を保証
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        logs.push(`🔄 ${attacker.username}の${skill.name}！！！`);
        logs.push(`💫 絶望から蘇る... ${defender.username}に${damage}ダメージ！`);
      }
      // 【特殊勝利】出禁 - 即座に勝利判定
      else if (skill.effect === 'instant_win') {
        logs.push(`⛔ ${attacker.username}の${skill.name}！！！！！`);
        logs.push(`🚪 相手を強制的に場外へ！`);
        logs.push(`🏆 ${attacker.username}の勝利！`);
        defender.state.hp = 0; // 強制的にHP0にして勝利判定
      }
      // 【メタ要素】インクこぼし
      else if (skill.effect === 'ink_effect') {
        defender.state.activeEffect = 'ink';
        defender.state.activeEffectTurns = 3;
        logs.push(`🖤 ${attacker.username}の${skill.name}！`);
        logs.push(`🌑 ${defender.username}の画面がインク塗れに！（3ターン継続）`);
      }
      // 【メタ要素】ウィンドウ・シェイク
      else if (skill.effect === 'shake_effect') {
        defender.state.activeEffect = 'shake';
        defender.state.activeEffectTurns = 2;
        logs.push(`📳 ${attacker.username}の${skill.name}！`);
        logs.push(`💫 ${defender.username}のウィンドウが揺れる！（2ターン継続）`);
      }
      // 【禁術】等価交換：HPを入れ替える
      else if (skill.effect === 'hp_swap') {
        const aHp = attacker.state.hp;
        const dHp = defender.state.hp;
        attacker.state.hp = dHp;
        defender.state.hp = aHp;
        logs.push(`🧪 ${attacker.username}の${skill.name}！`);
        logs.push(`⚠️ 禁忌の術！お互いの体力が入れ替わった！`);
      }
      // 【MP取り立て】借金取り：相手MP-2/自分+2（下限0/上限5）
      else if (skill.effect === 'mp_steal_2') {
        const stolen = Math.min(2, defender.state.mp);
        defender.state.mp = Math.max(0, defender.state.mp - 2);
        attacker.state.mp = Math.min(5, attacker.state.mp + 2);
        logs.push(`💰 ${attacker.username}の${skill.name}！`);
        logs.push(`🧾 ${defender.username}からMP${stolen}を取り立てた！`);
      }
      // 【状態付与】指が折れる：3ターン行動不能
      else if (skill.effect === 'broken_finger') {
        attacker.state.isBroken = true;
        attacker.state.brokenTurns = 3;
        logs.push(`🦴 ${attacker.username}の${skill.name}！指が折れてしまった！`);
        logs.push(`⏱️ 3ターンの間、行動不能になる！`);
      }
      // 【演出】飯テロ：クライアントへ skillEffect を通知
      else if (skill.effect === 'food_terror') {
        logs.push(`🍱 ${attacker.username}の${skill.name}！`);
        logs.push(`🤤 飯テロ発動！`);
        resultSkillEffect = 'food-terror';
      }
      // 【麻雀役満】九蓮宝燈：一撃必殺
      else if (skill.effect === 'chuuren') {
        logs.push(`🀄✨ ${attacker.username}の${skill.name}！！！！！`);
        logs.push(`🌟 幻の役満！九蓮宝燈！！！`);
        logs.push(`🏆 一撃必殺！${attacker.username}の勝利！`);
        defender.state.hp = 0; // 強制的にHP0
        resultSkillEffect = 'yakuman-freeze';
      }
      // 【麻雀役満】国士無双：高威力攻撃
      else if (skill.effect === 'yakuman') {
        damage = skill.power;
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        logs.push(`🀄💥 ${attacker.username}の${skill.name}！！！！`);
        logs.push(`⚡ 役満炸裂！ ${defender.username}に${damage}ダメージ！！`);
        resultSkillEffect = 'yakuman-freeze';
      }
      // 【天和】究極のレア技：配牌で役満を作る奇跡
      else if (skill.effect === 'tenpai') {
        logs.push(`🌟✨✨✨ ${attacker.username}の${skill.name}！！！！！`);
        logs.push(`🌟 配牌で既に上がりが成立！`);
        logs.push(`🌟 天地が味方した瞬間...`);
        logs.push(`🏆 一撃必殺！${attacker.username}の勝利！`);
        defender.state.hp = 0; // 強制的にHP0で勝利確定
        resultSkillEffect = 'tenpai-ultimate'; // 天和特別演出
      }
      // 【反射】ミラーコート：次のターンに受けるダメージを1.5倍で跳ね返す
      else if (skill.effect === 'mirror_coat') {
        attacker.state.isReflecting = true;
        logs.push(`🛡️✨ ${attacker.username}の${skill.name}！`);
        logs.push(`🔮 次のダメージを跳ね返す構えを取った！`);
        resultSkillEffect = 'reflect-ready';
      }
      // 【反射】カウンター：次のダメージを50%軽減し、軽減前の2倍で返す
      else if (skill.effect === 'counter') {
        attacker.state.isCounter = true;
        logs.push(`⚔️🛡️ ${attacker.username}の${skill.name}！`);
        logs.push(`🔄 次の攻撃を見切って反撃する構え！`);
        resultSkillEffect = 'counter-ready';
      }
      // 【道連れ】次のターンに倒された時、相手も道連れにする
      else if (skill.effect === 'destiny_bond') {
        attacker.state.isDestinyBond = true;
        logs.push(`💀🔗 ${attacker.username}の${skill.name}！`);
        logs.push(`⚠️ 自分が倒された時、相手も道連れにする呪いをかけた！`);
        resultSkillEffect = 'destiny-bond-ready';
      }
      // 立直攻撃（ロン/ツモ）の処理
      else if (skill.effect === 'riichi_attack') {
        damage = skill.power;
        defender.state.hp = Math.max(0, defender.state.hp - damage);
        logs.push(`🀄💥 ${attacker.username}の${skill.name}！！！`);
        logs.push(`⚡ 立直からの一撃必殺！ ${defender.username}に${damage}ダメージ！！`);
        // 立直状態を解除
        attacker.state.isRiichi = false;
        logs.push(`🀄 立直状態が解除された`);
      }
      // 「何もしない」技の特別処理
      else if (skill.id === 201) {
        // 博打ゾーンのスカ（何も起きない）時の明確なログ
        logs.push(`💫 運が悪すぎる！何も起きなかった！`);
      }
      // ネタ技の処理
      else if (skill.id === 114) {
        logs.push(`🙇 ${attacker.username}は謝罪を見送った...`);
        logs.push(`😐 特に何も起こらなかった`);
      }
      else if (skill.id === 117) {
        logs.push(`⚡💨 ${attacker.username}は光の速さで謝罪した！`);
        logs.push(`😅 しかし効果はほぼない... ${defender.username}に1ダメージ`);
        damage = 1;
        defender.state.hp = Math.max(0, defender.state.hp - damage);
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
    skillEffect: resultSkillEffect,
    wasBuffedAttack,
  };
}

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  socket.on('joinGame', (payload: { username: string }) => {
    console.log(`🎮 ${payload.username} (${socket.id}) joining game...`);

    const playerId = uuidv4();
    socketToPlayerId.set(socket.id, playerId);
    socket.emit('player_id', { playerId });

    // Add player to waiting room
      waitingRoom.push({
        playerId,
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
            playerId: player1.playerId,
            socketId: player1.socketId,
            username: player1.username,
            state: player1State,
          },
          player2: {
            playerId: player2.playerId,
            socketId: player2.socketId,
            username: player2.username,
            state: player2State,
          },
          currentTurn: 0,
          turnIndex: 0,
          currentTurnPlayerId: player1.playerId, // 🔴 socket.id → playerId に変更（互換用）
          isGameOver: false,
          winner: null,
          startedAt: Date.now(), // マッチング直後の保護用
        };

        // Send game_start event to both clients
        const gameData = {
          roomId,
          currentTurnPlayerId: gameState.currentTurnPlayerId, // playerId ベース
          player1: {
            playerId: player1.playerId,
            socketId: player1.socketId,
            username: player1.username,
            state: player1State,
          },
          player2: {
            playerId: player2.playerId,
            socketId: player2.socketId,
            username: player2.username,
            state: player2State,
          },
        };

        // マッチング確認待ちに追加
        const ackTimeout = setTimeout(() => {
          console.log(`⚠️ ACK timeout for room ${roomId}`);
          // 一方が ACK を返さない場合は、強制的にゲーム開始
          if (matchingWaitingRooms.has(roomId)) {
            matchingWaitingRooms.delete(roomId);
            activeGames.set(roomId, gameState);
            io.to(roomId).emit('turn_change', {
              currentTurnPlayerId: gameState.currentTurnPlayerId,
              currentTurnPlayerName: player1.username,
            });
            console.log(`🚀 Game started in room ${roomId} (force start after timeout)`);
          }
        }, 5000); // 5秒のタイムアウト

        matchingWaitingRooms.set(roomId, {
          player1_ready: false,
          player2_ready: false,
          timeout: ackTimeout,
          roomData: gameData,
        });

        // 【審判ロジック】必ず最初のターンプレイヤーを明示的に指定
        gameState.currentTurnPlayerId = player1.playerId; // 🔴 socket.id → playerId に変更
        activeGames.set(roomId, gameState);
        console.log(`🎯 Initial turn set to: ${player1.username} (${player1.playerId})`);

        // 【強制フラグ方式】各プレイヤーに対して「操作許可」を明確に指名
        // Player1: 先行プレイヤー（isYourTurn: true）
        io.to(player1.socketId).emit('match_found', { 
          roomId, 
          turnIndex: gameState.turnIndex,
          currentTurnPlayerId: gameState.currentTurnPlayerId,
          isYourTurn: true,
          yourIndex: 0,
          yourOpponent: player2.username,
        });
        console.log(`✅ Player1 (${player1.username}): isYourTurn = true`);
        
        // Player2: 後攻プレイヤー（isYourTurn: false）
        io.to(player2.socketId).emit('match_found', { 
          roomId, 
          turnIndex: gameState.turnIndex,
          currentTurnPlayerId: gameState.currentTurnPlayerId,
          isYourTurn: false,
          yourIndex: 1,
          yourOpponent: player1.username,
        });
        console.log(`✅ Player2 (${player2.username}): isYourTurn = false`);
        
        // ゲームスタート通知
        io.to(roomId).emit('game_start', { ...gameData, turnIndex: gameState.turnIndex });
        
        // 【強制ターン開始】マッチング直後、初期ターンプレイヤーを確実にセットして全員に通知
        console.log(`\n⚡ ===== 強制ターン開始ロジック =====`);
        gameState.turnIndex = 0;
        gameState.currentTurnPlayerId = player1.playerId;
        console.log(`✅ 初期ターンを確定: ${player1.username} (${player1.playerId})`);
        
        io.to(roomId).emit('game_state_update', {
          gameState: gameState,
          turnIndex: gameState.turnIndex,
          currentTurnPlayerId: gameState.currentTurnPlayerId,
          message: `${player1.username}のターンです！`,
        });
        console.log(`📤 game_state_update(初期ターン) 送信完了`);
        console.log(`========================================\n`);
        
        // 【握手プロセス】通信揺らぎ対策：300msおきに最新のgameStateを5回送信
        let shakehandCount = 0;
        const shakehandInterval = setInterval(() => {
          const currentGame = activeGames.get(roomId);
          if (currentGame && shakehandCount < 5) {
            io.to(roomId).emit('game_state_sync', {
              gameState: currentGame,
              currentTurnPlayerId: currentGame.currentTurnPlayerId,
              turnIndex: currentGame.turnIndex,
            });
            console.log(`🤝 Handshake #${shakehandCount + 1}/5 for room ${roomId}`);
            shakehandCount++;
          } else {
            clearInterval(shakehandInterval);
            console.log(`✅ Handshake completed for room ${roomId}`);
          }
        }, 300); // 300msおきに送信
        
        // 【同期保証のハメ技】2秒経ってアクションがない場合、先行プレイヤーに強制通知
        const forceStartTimeout = setTimeout(() => {
          const game = activeGames.get(roomId);
          if (game && !game.isGameOver) {
            const currentPlayer = game.currentTurnPlayerId === player1.playerId ? player1 : player2;
            console.log(`⏱️ 2秒経過：先行プレイヤー(${currentPlayer.username})に強制通知`);
            io.to(currentPlayer.socketId).emit('force_turn_start', {
              message: `${currentPlayer.username}のターン！ボタンを押してください！`,
              isYourTurn: true,
              turnIndex: game.turnIndex,
              currentTurnPlayerId: game.currentTurnPlayerId,
            });
            console.log(`🚨 force_turn_start sent to ${currentPlayer.username}`);
          }
        }, 2000); // 2秒のタイムアウト
        
        // ゲーム開始時にウォッチドッグを開始（ボタンロック対策）
        startWatchdog(roomId);
        
        console.log(`📋 Matching confirmed. Waiting for battle_ready_ack from both players in room ${roomId}`);
        console.log(`   Player 1: ${player1.username} (${player1.socketId})`);
        console.log(`   Player 2: ${player2.username} (${player2.socketId})`);
      }
    } else {
      // Notify player they're in waiting room
      socket.emit('waiting', { 
        message: 'Waiting for opponent...',
        playersWaiting: waitingRoom.length,
      });
    }
  });

  // 再接続可能かチェック
  socket.on('check_reconnect', (payload: { playerId: string }) => {
    const { playerId } = payload;
    const offlineInfo = offlinePlayers.get(playerId);
    
    if (!offlineInfo) {
      socket.emit('can_reconnect', { canReconnect: false, hasActiveGame: false });
      return;
    }

    const game = activeGames.get(offlineInfo.roomId);
    if (!game) {
      offlinePlayers.delete(playerId);
      socket.emit('can_reconnect', { canReconnect: false, hasActiveGame: false });
      return;
    }

    // 有効な対戦データが存在する：hasActiveGame フラグを true で返す
    console.log(`📢 Active game found for playerId ${playerId}: ${offlineInfo.roomId}`);
    socket.emit('can_reconnect', { canReconnect: false, hasActiveGame: true });
  });

  // 再接続リクエスト
  socket.on('reconnect', (payload: { playerId: string }) => {
    const { playerId } = payload;
    const offlineInfo = offlinePlayers.get(playerId);
    if (!offlineInfo) {
      socket.emit('reconnect_failed', { message: 'No session found' });
      return;
    }

    const game = activeGames.get(offlineInfo.roomId);
    if (!game) {
      offlinePlayers.delete(playerId);
      socket.emit('reconnect_failed', { message: 'Game not found' });
      return;
    }

    // ルームへ再参加
    socket.join(offlineInfo.roomId);
    socketToPlayerId.set(socket.id, playerId);

    // ソケットIDを更新
    const previousSocketId = offlineInfo.socketId;

    if (game.player1.playerId === playerId) {
      game.player1.socketId = socket.id;
      // 🔴 currentTurnPlayerId は playerId ベースなので更新不要
      // if (game.currentTurnPlayerId === previousSocketId) {
      //   game.currentTurnPlayerId = socket.id;
      // }
    }
    if (game.player2.playerId === playerId) {
      game.player2.socketId = socket.id;
      // 🔴 currentTurnPlayerId は playerId ベースなので更新不要
      // if (game.currentTurnPlayerId === previousSocketId) {
      //   game.currentTurnPlayerId = socket.id;
      // }
    }

    offlinePlayers.delete(playerId);

    // 再接続完了通知（自身）
    socket.emit('reconnect_success', {
      gameState: game,
      roomId: offlineInfo.roomId,
    });

    // 相手へ再接続通知
    socket.to(offlineInfo.roomId).emit('opponent_reconnected', {
      playerId,
      username: offlineInfo.username,
    });
  });

  // Handle action_activate_zone event
  socket.on('action_activate_zone', (payload: { zoneType: '強攻のゾーン' | '集中のゾーン' | '乱舞のゾーン' | '博打のゾーン', playerId?: string }) => {
    const senderPlayerId = payload.playerId || '';
    console.log(`🌀 ゾーン発動リクエスト: SenderId=${senderPlayerId}, SocketId=${socket.id}, zoneType=${payload.zoneType}`);

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
      console.error(`❌ ゲーム見つからず: ${socket.id}`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (currentGame.isGameOver) {
      console.error(`❌ ゲーム終了済み: ${socket.id}`);
      socket.emit('error', { message: 'Game is already over' });
      return;
    }

    // turnIndex に基づいて行動プレイヤーを決定
    const actingIndex = currentGame.turnIndex ?? 0;
    const player = actingIndex === 0 ? currentGame.player1 : currentGame.player2;
    const nextIndex = actingIndex === 0 ? 1 : 0;
    const nextPlayer = nextIndex === 0 ? currentGame.player1 : currentGame.player2;
    currentGame.currentTurnPlayerId = player.playerId;

    console.log(`📍 ターン判定: turnIndex=${currentGame.turnIndex}, acting=${player.username}`);

    // ゾーンアクティブ化のMPコスト
    const ZONE_MP_COST = 5;

    // Check if player has enough MP (MP上限5)
    if (player.state.mp < ZONE_MP_COST) {
      socket.emit('error', { message: `Insufficient MP. Need ${ZONE_MP_COST} MP to activate zone.` });
      console.log(`❌ ${player.username}のMP不足 (${player.state.mp}/${ZONE_MP_COST})`);
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

    console.log(`✨ ${player.username}が${payload.zoneType}を${duration}ターン発動`);
    console.log(`   MP: ${player.state.mp + ZONE_MP_COST} -> ${player.state.mp}`);

    // ターンを交代（turnIndexを反転）
    currentGame.currentTurn++;
    currentGame.turnIndex = nextIndex as 0 | 1;
    currentGame.currentTurnPlayerId = nextPlayer.playerId;

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
      turnIndex: currentGame.turnIndex,
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
    });

    io.to(currentRoomId).emit('game_state_update', {
      gameState: currentGame,
      turnIndex: currentGame.turnIndex,
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
    });

    console.log(`🔄 ターン交代: ${nextPlayer.username} (${nextPlayer.socketId})`);
  });

  // Handle action_use_skill event
  socket.on('action_use_skill', (data: any = {}) => {
    const senderPlayerId = data.playerId || '';
    const senderRoomId = data.roomId || '';
    console.log(`\n⚔️ ===== 技発動リクエスト受信 =====`);
    console.log(`   SenderId (playerId): ${senderPlayerId}`);
    console.log(`   RoomId: ${senderRoomId}`);
    console.log(`   SocketId: ${socket.id}`);
    console.log(`   Received data:`, JSON.stringify(data));

    // 【修正】roomIdを直接使用してゲームを検索
    let currentGame: GameState | undefined;
    let currentRoomId: string | undefined;

    // 第1段階：送られてきたroomIdで検索
    if (senderRoomId) {
      currentGame = activeGames.get(senderRoomId);
      if (currentGame) {
        currentRoomId = senderRoomId;
        console.log(`✅ ゲーム発見（roomId指定）: Room ${currentRoomId}`);
      } else {
        console.warn(`⚠️ roomIdで見つかりませんでした: ${senderRoomId}。socket.idで検索します...`);
      }
    }

    // 第2段階：roomIdで見つからなかった場合、socket.idで検索（フォールバック）
    if (!currentGame) {
      activeGames.forEach((game, roomId) => {
        if (game.player1.socketId === socket.id || game.player2.socketId === socket.id) {
          currentGame = game;
          currentRoomId = roomId;
          console.log(`✅ ゲーム発見（socket.id検索）: Room ${currentRoomId}`);
        }
      });
    }

    if (!currentGame || !currentRoomId) {
      console.error(`❌ ゲーム見つからず: roomId=${senderRoomId}, socketId=${socket.id}`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    console.log(`✅ ゲーム確定: Room ${currentRoomId}`);
    console.log(`   Player1: ${currentGame.player1.username} (playerId: ${currentGame.player1.playerId}, socketId: ${currentGame.player1.socketId})`);
    console.log(`   Player2: ${currentGame.player2.username} (playerId: ${currentGame.player2.playerId}, socketId: ${currentGame.player2.socketId})`);

    if (currentGame.isGameOver) {
      console.error(`❌ ゲーム終了済み: ${socket.id}`);
      socket.emit('error', { message: 'Game is already over' });
      return;
    }

    // シンプルなターン管理：turnIndex を採用し、送信者に依存せず処理
    const attackerIndex = currentGame.turnIndex ?? 0;
    const attacker = attackerIndex === 0 ? currentGame.player1 : currentGame.player2;
    const defender = attackerIndex === 0 ? currentGame.player2 : currentGame.player1;
    currentGame.currentTurnPlayerId = attacker.playerId; // 互換用にプレイヤーIDも保持

    console.log(`\n📍 ===== ターン判定（turnIndexベース） =====`);
    console.log(`   turnIndex: ${currentGame.turnIndex}`);
    console.log(`   attacker: ${attacker.username} (${attacker.playerId})`);
    console.log(`   defender: ${defender.username} (${defender.playerId})`);

    // Safety: ensure opponent exists before proceeding
    if (!defender || !defender.state) {
      console.warn(`⚠️ Defender missing for socket ${socket.id}`);
      socket.emit('error', { message: 'Opponent not found' });
      return;
    }

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
        cleanupGameRoom(currentRoomId);
        return;
      }
    }

    // 【指が折れる】行動不能チェック（威力0としてターン消費）
    if (attacker.state.isBroken && attacker.state.brokenTurns && attacker.state.brokenTurns > 0) {
      const messageParts: string[] = [];
      messageParts.push(`🦴 ${attacker.username}は指が折れている！このターンは行動不能！`);

      // 行動不能ターンを進める
      attacker.state.brokenTurns--;
      if (attacker.state.brokenTurns === 0) {
        attacker.state.isBroken = false;
        messageParts.push(`🦴 ${attacker.username}の指が回復した！`);
      }

      // MP回復（乱舞ゾーン中は0、ボーナス適用）
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

      // ゾーン残りターンを進める（ターンは経過する）
      if (attacker.state.activeZone.remainingTurns > 0) {
        attacker.state.activeZone.remainingTurns--;
        if (attacker.state.activeZone.remainingTurns === 0) {
          attacker.state.activeZone.type = 'none';
          io.to(currentRoomId).emit('zone_expired', {
            username: attacker.username,
            socketId: attacker.socketId,
          });
        }
      }

      // メタ演出の残りターンも進める
      if (attacker.state.activeEffectTurns && attacker.state.activeEffectTurns > 0) {
        attacker.state.activeEffectTurns--;
        if (attacker.state.activeEffectTurns === 0) attacker.state.activeEffect = 'none';
      }
      if (defender.state.activeEffectTurns && defender.state.activeEffectTurns > 0) {
        defender.state.activeEffectTurns--;
        if (defender.state.activeEffectTurns === 0) defender.state.activeEffect = 'none';
      }

      // ターンカウントと交代（シンプルにインデックスを反転）
      currentGame.currentTurn++;
      currentGame.turnIndex = currentGame.turnIndex === 0 ? 1 : 0;
      const nextPlayer = currentGame.turnIndex === 0
        ? currentGame.player1
        : currentGame.player2;
      currentGame.currentTurnPlayerId = nextPlayer.playerId;

      // 行動不能の battle_update を送信
      const battleUpdate = {
        turn: currentGame.currentTurn,
        attacker: { username: attacker.username, socketId: attacker.socketId, state: attacker.state },
        defender: { username: defender.username, socketId: defender.socketId, state: defender.state },
        skillName: '行動不能',
        skillPower: 0,
        damage: 0,
        healing: 0,
        message: messageParts.join('\n'),
        gameState: currentGame,
      };
      io.to(currentRoomId).emit('battle_update', battleUpdate);

      io.to(currentRoomId).emit('turn_change', {
        turnIndex: currentGame.turnIndex,
        currentTurnPlayerId: currentGame.currentTurnPlayerId,
        currentTurnPlayerName: nextPlayer.username,
      });

      return;
    }

    // Get random skill: room.skills 優先、なければ共通SKILLSから抽選
    let selectedSkill: Skill | null = null;
    try {
      console.log(`🎲 技抽選開始...`);
      const roomSkills = (currentGame as any).skills as Skill[] | undefined;
      if (roomSkills && roomSkills.length > 0) {
        const randomIndex = Math.floor(Math.random() * roomSkills.length);
        selectedSkill = roomSkills[randomIndex];
        console.log(`✅ room.skills から抽選: ${selectedSkill.name}`);
      } else {
        selectedSkill = getRandomSkill(attacker.state.activeZone, attacker.state.isRiichi, attacker.state.hp, attacker.state.maxHp, currentGame.currentTurn);
      }
      
      // 技が選択されなかった場合、デフォルト技（パンチ）を使用
      if (!selectedSkill) {
        console.warn('⚠️ 技抽選で技が選択されませんでした。デフォルト技（パンチ）を使用します。');
        selectedSkill = SKILLS.find(skill => skill.id === 1) || null; // パンチ (id: 1)
        if (!selectedSkill) {
          // SKILLSリスト自体が空の場合の最終フォールバック
          selectedSkill = {
            id: 0,
            name: 'ゆびをふる',
            type: 'attack',
            power: 10,
            description: '基本攻撃',
            effect: 'none'
          } as Skill;
          console.warn('⚠️ SKILLSリストが空です。フォールバック技「ゆびをふる」を使用します。');
        }
      }
      console.log(`✅ 技抽選成功: ${selectedSkill.name} (威力: ${selectedSkill.power})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Skill selection failed';
      console.error(`❌ 技抽選エラー: ${message}`);
      
      // エラー時も確実に全プレイヤーに通知
      io.to(currentRoomId).emit('game_state_update', {
        gameState: currentGame,
        turnIndex: currentGame.turnIndex,
        currentSkill: null,
        damage: 0,
        animationStart: false,
        error: message,
      });
      socket.emit('error', { message: `技抽選に失敗しました: ${message}` });
      console.log(`📤 エラー通知を全プレイヤーに送信完了`);
      return;
    }

    console.log(`🎲 Random skill selected: ${selectedSkill.name} (${selectedSkill.type})`);
    console.log(`🎲 技決定: ${selectedSkill.name} (id: ${selectedSkill.id}, power: ${selectedSkill.power})`);
    console.log(`   Current zone: ${attacker.state.activeZone.type} (${attacker.state.activeZone.remainingTurns} turns remaining)`);
    if (attacker.state.isRiichi) {
      console.log(`   🀄 立直状態: ${attacker.username}`);
    }

    // 【特殊勝利】数え役満：立直状態でパンチ系技を3回連続成功
    const punchSkills = ['パンチ', 'ストレート', 'ジャブ', 'アッパーカット', 'フック', 'ボディブロー', 'ダッシュパンチ'];
    const isPunch = punchSkills.includes(selectedSkill.name);
    
    if (attacker.state.isRiichi && isPunch) {
      if (!attacker.state.riichiBombCount) {
        attacker.state.riichiBombCount = 0;
      }
      attacker.state.riichiBombCount++;
      console.log(`🀄 パンチ連続カウント: ${attacker.state.riichiBombCount}/3`);
      
      if (attacker.state.riichiBombCount >= 3) {
        // 数え役満成立！即勝利
        currentGame.isGameOver = true;
        currentGame.winner = attacker.username;
        
        console.log(`🏆 数え役満成立！${attacker.username}の勝利！`);
        
        io.to(currentRoomId).emit('battle_update', {
          turn: currentGame.currentTurn,
          skillName: selectedSkill.name,
          skillPower: selectedSkill.power,
          message: `🀄💥 ${attacker.username}は立直からのパンチ技を3回連続！\n\n🏆 数え役満成立！${attacker.username}の勝利！`,
          gameState: currentGame,
        });
        
        io.to(currentRoomId).emit('game_over', {
          winner: attacker.username,
          gameState: currentGame,
        });
        
        cleanupGameRoom(currentRoomId);
        return;
      }
    } else {
      // パンチ以外の技が出たらカウントリセット
      if (attacker.state.riichiBombCount && attacker.state.riichiBombCount > 0) {
        console.log(`🀄 パンチ連続カウント: リセット`);
        attacker.state.riichiBombCount = 0;
      }
    }

    // ゾーン効果によるログメッセージ生成
    let zoneEffectMessage = '';
    if (attacker.state.activeZone.type !== 'none') {
      if (attacker.state.activeZone.type === '強攻のゾーン') {
        zoneEffectMessage = `💥 ゾーン効果: 高威力技が出現！`;
      } else if (attacker.state.activeZone.type === '集中のゾーン') {
        zoneEffectMessage = `🎯 ゾーン効果: 支援技が出現！`;
      }
    }

    // 【立直フィールド効果】相手が立直中で、自分が役を引いた場合、威力1.5倍
    const yakuIds = [127, 128, 129, 130]; // 断幺九、清一色、国士無双、九蓮宝燈
    const isYakuSkill = yakuIds.includes(selectedSkill.id);
    const isOpponentRiichi = defender.state.isRiichi;
    let riichiFieldBoost = 1.0;
    let riichiFieldMessage = '';
    
    if (isOpponentRiichi && isYakuSkill && !attacker.state.isRiichi) {
      // 相手が立直中、自分は立直していない、そして役を引いた
      riichiFieldBoost = 1.5;
      riichiFieldMessage = `🀄💥 立直による場荒れ！役の威力が跳ね上がった！`;
      console.log(`🀄 立直フィールド効果: ${attacker.username}の役が1.5倍！`);
    }

    // Apply skill effect
    let result = applySkillEffect(selectedSkill, attacker, defender, riichiFieldBoost);
    const messageParts = [...preMessages];
    if (zoneEffectMessage) {
      messageParts.push(zoneEffectMessage);
    }
    if (riichiFieldMessage) {
      messageParts.push(riichiFieldMessage);
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

    // 技結果をゲーム状態に反映（UI用メタ情報）
    (currentGame as any).lastSkill = {
      name: selectedSkill.name,
      type: selectedSkill.type,
      power: selectedSkill.power,
      damage: result.damage,
      attackerId: attacker.playerId,
      defenderId: defender.playerId,
    };

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
      skillName: selectedSkill.name,
      skillPower: selectedSkill.power,
      damage: result.damage,
      healing: result.healing,
      message: result.message,
      skillEffect: result.skillEffect,
      wasBuffedAttack: result.wasBuffedAttack,
      gameState: currentGame,
    };

    io.to(currentRoomId).emit('battle_update', battleUpdate);

    // Check for game over (only while battle is active and after HP updates)
    // 2秒間のディレイを設けて、クライアント側の演出が完了するのを待つ
    if (!currentGame.isGameOver && defender.state.hp <= 0) {
      // 【道連れチェック】defenderが道連れ状態で倒された場合
      if (defender.state.isDestinyBond) {
        attacker.state.hp = 0; // 相手も強制的に0に
        currentGame.isGameOver = true;
        currentGame.winner = null; // 引き分け
        defender.state.isDestinyBond = false; // 状態解除
        
        console.log(`💀 Destiny Bond activated! Both players defeated!`);
        
        io.to(currentRoomId).emit('battle_update', {
          turn: currentGame.currentTurn,
          skillName: '道連れ',
          skillPower: 0,
          message: `💀🔗 ${defender.username}の道連れ発動！\n\n⚠️ 両者とも倒れた...！`,
          skillEffect: 'destiny-bond-activated',
          gameState: currentGame,
        });
        
        if (currentRoomId) {
          const roomIdForTimeout = currentRoomId; // TSナローイング保持用
          setTimeout(() => {
            io.to(roomIdForTimeout).emit('game_over', {
              winner: null,
              gameState: currentGame,
              isDraw: true,
            });
            cleanupGameRoom(roomIdForTimeout);
          }, 3000);
        }
        
        return;
      }
      
      currentGame.isGameOver = true;
      currentGame.winner = attacker.username;

      console.log(`🏆 Game Over! ${attacker.username} wins! (waiting 2s for client演出)`);

      // 2秒待機してから最終的な勝利イベントを送信
      const roomIdForTimeout = currentRoomId;
      setTimeout(() => {
        io.to(roomIdForTimeout).emit('game_over', {
          winner: attacker.username,
          gameState: currentGame,
        });

        // Remove game from active games
        cleanupGameRoom(roomIdForTimeout);
      }, 2000);

      return;
    }

    // Check if attacker also died (from special moves like 自爆)
    if (!currentGame.isGameOver && attacker.state.hp <= 0) {
      currentGame.isGameOver = true;
      currentGame.winner = defender.username;

      console.log(`🏆 Game Over! ${defender.username} wins! (waiting 2s for client演出)`);

      // 2秒待機してから最終的な勝利イベントを送信
      const roomIdForTimeout = currentRoomId;
      setTimeout(() => {
        io.to(roomIdForTimeout).emit('game_over', {
          winner: defender.username,
          gameState: currentGame,
        });

        cleanupGameRoom(roomIdForTimeout);
      }, 2000);

      return;
    }

    // Increment turn counter
    currentGame.currentTurn++;

    // ターンを交代（turnIndexを反転）
    currentGame.turnIndex = currentGame.turnIndex === 0 ? 1 : 0;
    const nextPlayer = currentGame.turnIndex === 0 
      ? currentGame.player1 
      : currentGame.player2;
    currentGame.currentTurnPlayerId = nextPlayer.playerId;

    // 【メタ要素】activeEffectの期間を減らす
    if (attacker.state.activeEffectTurns && attacker.state.activeEffectTurns > 0) {
      attacker.state.activeEffectTurns--;
      if (attacker.state.activeEffectTurns === 0) {
        attacker.state.activeEffect = 'none';
      }
    }
    if (defender.state.activeEffectTurns && defender.state.activeEffectTurns > 0) {
      defender.state.activeEffectTurns--;
      if (defender.state.activeEffectTurns === 0) {
        defender.state.activeEffect = 'none';
      }
    }

    // ターン変更を通知（ターンプレイヤー情報を含める）
    io.to(currentRoomId).emit('turn_change', {
      turnIndex: currentGame.turnIndex,
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
      gameState: currentGame, // 完全なgameStateを送信
    });

    // 🔴 【重要】gameState更新後、即座に全員へ新しいゲーム状態を送信
    console.log(`\n📤 ===== game_state_update 送信 =====`);
    console.log(`   Room ID: ${currentRoomId}`);
    console.log(`   技: ${selectedSkill.name}`);
    console.log(`   威力: ${selectedSkill.power}`);
    console.log(`   ダメージ: ${result.damage}`);
    console.log(`   次のターン: ${nextPlayer.username} (${nextPlayer.playerId})`);
    console.log(`   アニメーション: 有効`);
    console.log(`!!! BROADCASTING UPDATE !!! turnPlayerId=${currentGame.currentTurnPlayerId}`);
    
    io.to(currentRoomId).emit('game_state_update', {
      gameState: currentGame,
      turnIndex: currentGame.turnIndex,
      currentSkill: selectedSkill.name,
      damage: result.damage,
      animationStart: true,
    });
    
    console.log(`✅ Skill executed and state broadcasted`);
    console.log(`========================================\n`);

    // ウォッチドッグを再開（新しいターンの5秒ウォッチドッグ）
    startWatchdog(currentRoomId);

    console.log(`📊 Turn ${currentGame.currentTurn}:`);
    console.log(`   ${attacker.username}: HP ${attacker.state.hp}, MP ${attacker.state.mp}`);
    console.log(`   ${defender.username}: HP ${defender.state.hp}, MP ${defender.state.mp}`);
    console.log(`🔄 Turn changed to: ${nextPlayer.username} (${nextPlayer.playerId})`);
  });

  // マッチング準備完了を受け取る
  socket.on('battle_ready_ack', (data: { roomId: string }) => {
    const roomId = data.roomId;
    const waitingMatch = matchingWaitingRooms.get(roomId);
    
    if (!waitingMatch) {
      console.log(`⚠️ No matching waiting room found for ${roomId}`);
      return;
    }

    // どのプレイヤーからのACKか判定
    const gameData = waitingMatch.roomData;
    if (gameData.player1.socketId === socket.id) {
      waitingMatch.player1_ready = true;
      console.log(`✅ Player 1 ready: ${gameData.player1.username}`);
    } else if (gameData.player2.socketId === socket.id) {
      waitingMatch.player2_ready = true;
      console.log(`✅ Player 2 ready: ${gameData.player2.username}`);
    }

    // 両方準備できたらゲーム開始
    if (waitingMatch.player1_ready && waitingMatch.player2_ready) {
      console.log(`🚀 Both players ready! Starting game in room ${roomId}`);
      clearTimeout(waitingMatch.timeout);
      matchingWaitingRooms.delete(roomId);

      // gameState を作成して activeGames に追加
      const gameState: GameState = {
        roomId,
        player1: gameData.player1,
        player2: gameData.player2,
        currentTurn: 0,
        turnIndex: 0,
        currentTurnPlayerId: gameData.player1.playerId, // 🔁 プレイヤーIDで統一（互換用）
        isGameOver: false,
        winner: null,
        startedAt: Date.now(),
      };

      activeGames.set(roomId, gameState);

      // プレイヤーステータスを「playing」に変更（activeGamesに追加済み）
      console.log(`🎮 Players status changed to 'playing' in room ${roomId}`);

      // ターン変更通知
      io.to(roomId).emit('turn_change', {
        turnIndex: gameState.turnIndex,
        currentTurnPlayerId: gameState.currentTurnPlayerId,
        currentTurnPlayerName: gameData.player1.username,
      });

      console.log(`✅ Game officially started in room ${roomId}`);
    }
  });

  // 状態チェック（スマホ救済：待機中にバトルルームに入っているかを確認）
  socket.on('check_status', (data: any) => {
    const playerId = socketToPlayerId.get(socket.id);
    
    // activeGames の中に自分が参加しているルームを探す
    let foundRoom: GameState | null = null;
    let roomId: string | null = null;
    
    for (const [rid, gameState] of activeGames.entries()) {
      if (gameState.player1.socketId === socket.id || gameState.player2.socketId === socket.id) {
        foundRoom = gameState;
        roomId = rid;
        break;
      }
    }
    
    if (foundRoom && roomId) {
      console.log(`🔄 Status check: ${socket.id} is in active game room ${roomId}`);
      // バトルルームに入っている → 最新データを送信して強制同期
      socket.emit('battle_sync', {
        gameState: foundRoom,
        roomId: roomId
      });
    } else {
      // 待機中または未参加
      console.log(`⏳ Status check: ${socket.id} is waiting or not in game`);
    }
  });

  // 🔄 【手動同期】クライアントからの同期リクエストに応答
  socket.on('request_manual_sync', (data: { roomId: string }) => {
    const roomId = data.roomId;
    const gameState = activeGames.get(roomId);

    if (!gameState) {
      console.warn(`⚠️ Manual sync requested but game not found: ${roomId}`);
      socket.emit('manual_sync_response', {
        error: 'Game not found',
        gameState: null,
        currentTurnPlayerId: null,
      });
      return;
    }

    // クライアントに最新の同期データを送信
    socket.emit('manual_sync_response', {
      gameState,
      currentTurnPlayerId: gameState.currentTurnPlayerId,
      turnNumber: gameState.currentTurn,
    });

    console.log(`🔄 Manual sync sent to client in room ${roomId}. Current turn: ${gameState.currentTurnPlayerId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);

    const playerId = socketToPlayerId.get(socket.id);
    socketToPlayerId.delete(socket.id);

    // Remove from waiting room if present
    const waitingIndex = waitingRoom.findIndex(p => p.socketId === socket.id);
    if (waitingIndex > -1) {
      const removed = waitingRoom.splice(waitingIndex, 1)[0];
      console.log(`🚪 ${removed.username} left waiting room`);
    }

    // Handle disconnection from active games (保持して再接続を許可)
    activeGames.forEach((game, roomId) => {
      if (game.player1.socketId === socket.id || game.player2.socketId === socket.id) {
        const username = game.player1.socketId === socket.id ? game.player1.username : game.player2.username;
        const pid = game.player1.socketId === socket.id ? game.player1.playerId : game.player2.playerId;
        
        // マッチング直後（3秒以内）の切断は特別な保護
        const timeSinceStart = game.startedAt ? Date.now() - game.startedAt : Infinity;
        if (timeSinceStart < 3000) {
          console.log(`⚡ Early disconnect detected (${timeSinceStart}ms after start). Extended grace period for ${username}`);
          offlinePlayers.set(pid, { roomId, lastSeen: Date.now(), username, socketId: socket.id });
          // 相手には通知せず、静かに再接続を待つ
          return;
        }
        
        console.log(`🎮 Player disconnected from room ${roomId} (offline保持)`);
        offlinePlayers.set(pid, { roomId, lastSeen: Date.now(), username, socketId: socket.id });

        io.to(roomId).emit('opponent_disconnected', {
          message: 'Opponent has disconnected (5分以内に復帰可能)',
        });
      }
    });
  });
});

// 5分以上経過したオフラインプレイヤーをクリーンアップ
setInterval(() => {
  const now = Date.now();
  offlinePlayers.forEach((info, playerId) => {
    if (now - info.lastSeen > 5 * 60 * 1000) {
      const game = activeGames.get(info.roomId);
      if (game) {
        io.to(info.roomId).emit('opponent_disconnected', {
          message: 'Opponent did not return in time. Game ended.',
        });
        activeGames.delete(info.roomId);
      }
      offlinePlayers.delete(playerId);
      console.log(`🧹 Cleaned offline session for ${playerId}`);
    }
  });
}, 60 * 1000);

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
