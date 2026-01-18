import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  PlayerState,
  Skill,
} from './types';
import { SKILLS } from './data/skills';

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
  pingInterval: 3000, // 3秒ごとにping
  pingTimeout: 10000, // 10秒でタイムアウト
  transports: ['websocket', 'polling'],
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

// Bump matching data
interface BumpData {
  username: string;
  timestamp: number;
  lat: number;
  lng: number;
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
  currentTurnPlayerId: string; // 現在のターンのプレイヤーID
  turnIndex: 0 | 1; // 0 = player1, 1 = player2
  shakeTurns: number; // 画面揺れが続くターン数（0=揺れなし）
  riichiPlayerId?: string | null; // 立直中のプレイヤーID（強制解除用）
  isGameOver: boolean;
  winner: string | null;
  startedAt?: number; // ゲーム開始時刻（マッチング直後の保護用）
}

const waitingRoom: WaitingPlayer[] = [];
const activeGames = new Map<string, GameState>();
// オフライン保持: playerId -> { roomId, lastSeen, username }
const offlinePlayers = new Map<string, { roomId: string; lastSeen: number; username: string; socketId: string }>();
const socketToPlayerId = new Map<string, string>();
// マッチング確認待ち: roomId -> { player1_ready, player2_ready, timeout }
const matchingWaitingRooms = new Map<string, { player1_ready: boolean; player2_ready: boolean; timeout: ReturnType<typeof setTimeout>; roomData: any }>();

// 【飯テロ】画像URLリスト
const FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80", // ピザ
  "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80", // ケーキ
  "https://images.unsplash.com/photo-1553621042-f6e147245754?w=800&q=80", // 寿司
  "https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=800&q=80", // ラーメン
  "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80"  // ステーキ
];

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
  };
}

// Helper: weighted random pick according to zone rules
function getRandomSkill(activeZone: PlayerState['activeZone'], isRiichi: boolean = false, attackerHp: number = 500, maxHp: number = 500, currentTurn: number = 1): Skill {
  // 【天和】究極のレア技：ゲーム開始直後の1ターン目のみ、0.01%の確率で出現
  // ※ currentTurn は累計ターン数（1から開始）
  if (currentTurn === 1) {
    const tenpaiLuck = Math.random();
    if (tenpaiLuck < 0.0001) { // 0.01%（1/10000）
      const tenpai = SKILLS.find((skill: Skill) => skill.id === 131);
      console.log('🌟✨ 天和（テンホウ）が発動！究極のレア技！！！');
      return tenpai!;
    }
  }

  // 博打のゾーン判定を最初に実行
  if (activeZone.type === '博打のゾーン') {
    const random = Math.random();
    const gigaImpact = SKILLS.find((skill: Skill) => skill.id === 200); // ギガインパクト
    const doNothing = SKILLS.find((skill: Skill) => skill.id === 201); // 何もしない
    
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
      const comeback = SKILLS.find((skill: Skill) => skill.id === 119);
      console.log('🔄 HP危機的！起死回生が出現！');
      return comeback!;
    }
  }

    // 【一撃必殺】超激レア抽選（0.1%）
    const ichigekiLuck = Math.random();
    if (ichigekiLuck < 0.001) { // 0.1%
      const ichigeki = SKILLS.find((skill: Skill) => skill.id === 120); // id:120 = 出禁/一撃必殺
      if (ichigeki) {
        console.log('💥 一撃必殺（超激レア0.1%）が発動！');
        return ichigeki;
      }
    }

  // 【麻雀役満】九蓮宝燈の超超超レア抽選（0.05%）
  const chuurenLuck = Math.random();
  if (chuurenLuck < 0.0005) { // 0.05%
    const chuuren = SKILLS.find((skill: Skill) => skill.id === 130);
    console.log('🀄✨ 幻の役満！九蓮宝燈が出現！');
    return chuuren!;
  }

  // 【麻雀役満】国士無双のレア抽選（0.1%）
  const kokushiLuck = Math.random();
  if (kokushiLuck < 0.001) { // 0.1%
    const kokushi = SKILLS.find((skill: Skill) => skill.id === 129);
    console.log('🀄 役満！国士無双が出現！');
    return kokushi!;
  }

  // 【麻雀役】清一色の低確率抽選（2%）
  const chinItsuLuck = Math.random();
  if (chinItsuLuck < 0.02) { // 2%
    const chinItsu = SKILLS.find((skill: Skill) => skill.id === 128);
    console.log('🀄 清一色が出現！');
    return chinItsu!;
  }

  // 通常技リスト（ギガインパクト、何もしない、天和を除外 - id 200, 201, 131）
  // 天和（id:131）は1ターン目の特殊抽選でのみ出現
  let availableSkills = SKILLS.filter((skill: Skill) => 
    skill.id < 200 && skill.id !== 131 // 天和を除外
  );

  // 立直状態の場合、ロン/ツモを追加
  if (isRiichi) {
    const ron = SKILLS.find((skill: Skill) => skill.id === 112); // ロン
    const tsumo = SKILLS.find((skill: Skill) => skill.id === 113); // ツモ
    if (ron && tsumo) {
      availableSkills = [...availableSkills, ron, tsumo];
      console.log('🀄 立直状態：ロン/ツモが出現可能！');
    }
  }

  // ゾーン効果：条件に合う技のみに絞り込む
  if (activeZone.type === '強攻のゾーン') {
    // 威力50以上の技のみ
    const powerSkills = availableSkills.filter((skill: Skill) => skill.power >= 50);
    if (powerSkills.length > 0) {
      availableSkills = powerSkills;
      console.log(`🔥 強攻のゾーン: 威力50以上の技のみ抽選 (${powerSkills.length}種類)`);
    }
  } else if (activeZone.type === '集中のゾーン') {
    // 回復・最大HP増加・補助系のみ
    const supportSkills = availableSkills.filter((skill: Skill) => 
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
    const attackSkills = availableSkills.filter((skill: Skill) => skill.type === 'attack');
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
function applySkillEffect(
  skill: Skill,
  attacker: GameState['player1'],
  defender: GameState['player2'],
  isAttackerRiichi: boolean = false,
  isOpponentRiichi: boolean = false
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
    return Math.max(1, Math.floor(base * damageVariance())); // 最低1ダメージを保証
  };

  // ダメージ軽減（集中のゾーン）を計算する補助
  const applyDefense = (base: number) => {
    let damage = base;
    if (defender.state.activeZone.type === '集中のゾーン') {
      damage = Math.floor(base * 0.75);
    }
    return Math.max(1, damage); // 最低1ダメージを保証
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
      damage = applyDefense(baseDamage);
      defender.state.hp = Math.max(0, defender.state.hp - damage);
      
      // 攻撃ログを追加
      console.log(`⚔️ [ダメージログ] ${attacker.username} → ${defender.username}: ${damage}ダメージ (${skill.name})`);
      
      // ネタ技の特別ログ
      if (skill.id === 115) {
        logs.push(`🥚 ${attacker.username}の${skill.name}！`);
        logs.push(`🤖 全自動で卵を割る機械で攻撃... ${defender.username}に${damage}ダメージ！`);
      } else {
        logs.push(`${attacker.username}の${skill.name}！ ${defender.username}に${damage}ダメージを与えた！`);
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
        // 新計算式：(maxHP - currentHP) * 2.5 + 30
        const maxHp = Number(attacker.state.maxHp) || 100;
        const currentHp = Number(attacker.state.hp) || 0;
        const rawDamage = (maxHp - currentHp) * 2.5 + 30;
        damage = Math.max(1, Math.floor(rawDamage)); // 最低1ダメージを保証
        
        // デバッグログ
        console.log(`🔄 起死回生発動計算:`);
        console.log(`   攻撃者: ${attacker.username}`);
        console.log(`   防御者: ${defender.username}`);
        console.log(`   現在HP: ${currentHp}`);
        console.log(`   最大HP: ${maxHp}`);
        console.log(`   失ったHP: ${maxHp - currentHp}`);
        console.log(`   計算式: (${maxHp} - ${currentHp}) * 2.5 + 30 = ${rawDamage}`);
        console.log(`   最終ダメージ: ${damage}`);
        
        defender.state.hp = Math.max(0, Number(defender.state.hp) - damage);
        logs.push(`🔄 ${attacker.username}の${skill.name}！！！`);
        logs.push(`💫 絶望から蘇る... ${defender.username}に${damage}ダメージ！`);
        
        // 攻撃ログを追加
        console.log(`⚔️ [ダメージログ] ${attacker.username} → ${defender.username}: ${damage}ダメージ (起死回生)`);
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
        // 博打ゾーン의スカ（何も起きない）時の明確なログ
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

  // 【立直システム】排他的なダメージ計算
  const YAKU_NAMES = ['断幺九', '清一色', '国士無双', '九蓮宝燈'];
  const isYaku = YAKU_NAMES.includes(skill.name);

  // 特殊技（起死回生、天和など）は立直ボーナスをスキップ
  const SPECIAL_SKILLS_SKIP_RIICHI = ['起死回生', '天和', '出禁', '九蓮宝燈'];
  const shouldSkipRiichiBonus = SPECIAL_SKILLS_SKIP_RIICHI.includes(skill.name);

  // 立直中の計算ロジック（特殊技以外）
  if (isAttackerRiichi && damage > 0 && !shouldSkipRiichiBonus) {
    if (isYaku) {
      // ケースA: 役の場合
      // ・ダメージを 1.5倍 にする
      // ・「裏ドラ（追加ダメージ）」は加算しない
      const finalDamage = Math.floor(damage * 1.5);
      const yakuBonus = finalDamage - damage;
      damage = finalDamage;
      defender.state.hp = Math.max(0, defender.state.hp - yakuBonus);
      console.log(`🀄 役ボーナス適用: 1.5倍 -> ${finalDamage}`);
      logs.push(`🀄 役が確定！ダメージが1.5倍に！ ${yakuBonus}の追加ダメージ！`);
    } else {
      // ケースB: 通常技の場合
      // ・ダメージ倍率はかけない（1.0倍）
      // ・「裏ドラ（ランダム追加ダメージ 10〜50）」を加算する
        const uraDora = Math.floor(Math.random() * 41) + 10; // 10〜50の範囲
      damage += uraDora;
      defender.state.hp = Math.max(0, defender.state.hp - uraDora);
      console.log(`🀄 裏ドラ適用: +${uraDora} -> ${damage}`);
      logs.push(`🀄 裏ドラが発動！ さらに${uraDora}ダメージ！`);
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

io.on('connection', (socket: Socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // 共通：技発動処理（手動/自動どちらもここで実行）
  function processUseSkill(actingSocketId: string, roomIdHint?: string, options: { isAuto?: boolean } = {}) {
    const actingSocket = io.sockets.sockets.get(actingSocketId);
    console.log(`⚔️ ${actingSocketId} used a skill${options.isAuto ? ' (auto)' : ''}`);

    // 対象ゲームを特定
    let currentGame: GameState | undefined;
    let currentRoomId: string | undefined;

    if (roomIdHint) {
      const hinted = activeGames.get(roomIdHint);
      if (hinted && (hinted.player1.socketId === actingSocketId || hinted.player2.socketId === actingSocketId)) {
        currentGame = hinted;
        currentRoomId = roomIdHint;
      }
    }

    if (!currentGame || !currentRoomId) {
      activeGames.forEach((game, roomId) => {
        if (game.player1.socketId === actingSocketId || game.player2.socketId === actingSocketId) {
          currentGame = game;
          currentRoomId = roomId;
        }
      });
    }

    if (!currentGame || !currentRoomId) {
      actingSocket?.emit('error', { message: 'Game not found' });
      return;
    }

    if (currentGame.isGameOver) {
      actingSocket?.emit('error', { message: 'Game is already over' });
      return;
    }

    // ターンチェック
    if (currentGame.currentTurnPlayerId !== actingSocketId) {
      console.log(`❌ ${actingSocketId} tried to use skill on opponent's turn`);
      actingSocket?.emit('error', { message: 'Not your turn!' });
      return;
    }

    const isPlayer1 = currentGame.player1.socketId === actingSocketId;
    const attacker = isPlayer1 ? currentGame.player1 : currentGame.player2;
    const defender = isPlayer1 ? currentGame.player2 : currentGame.player1;

    if (!defender || !defender.state) {
      console.warn(`⚠️ Defender missing for socket ${actingSocketId}`);
      actingSocket?.emit('error', { message: 'Opponent not found' });
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

    // 【指が折れる】行動不能チェック
    if (attacker.state.isBroken && attacker.state.brokenTurns && attacker.state.brokenTurns > 0) {
      const messageParts: string[] = [];
      messageParts.push(`🦴 ${attacker.username}は指が折れている！このターンは行動不能！`);

      attacker.state.brokenTurns--;
      if (attacker.state.brokenTurns === 0) {
        attacker.state.isBroken = false;
        messageParts.push(`🦴 ${attacker.username}の指が回復した！`);
      }

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

      if (attacker.state.activeEffectTurns && attacker.state.activeEffectTurns > 0) {
        attacker.state.activeEffectTurns--;
        if (attacker.state.activeEffectTurns === 0) attacker.state.activeEffect = 'none';
      }
      if (defender.state.activeEffectTurns && defender.state.activeEffectTurns > 0) {
        defender.state.activeEffectTurns--;
        if (defender.state.activeEffectTurns === 0) defender.state.activeEffect = 'none';
      }

      // ターン交代処理
      currentGame.currentTurn++;
      const nextPlayer = currentGame.currentTurnPlayerId === currentGame.player1.socketId 
        ? currentGame.player2 
        : currentGame.player1;
      currentGame.currentTurnPlayerId = nextPlayer.socketId;

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

      // クライアントへの明確な通知
      io.to(currentRoomId).emit('skill_effect', {
        skill: { name: '骨折', effect: 'broken', type: 'status' },
        message: `${attacker.username}は骨折していて動けない！`,
        target: attacker.username
      });

      io.to(currentRoomId).emit('turn_change', {
        currentTurnPlayerId: currentGame.currentTurnPlayerId,
        currentTurnPlayerName: nextPlayer.username,
      });

      console.log(`🔄 ${attacker.username} is broken, turn switched to ${nextPlayer.username}`);
      console.log(`📊 Game state after broken turn: turn=${currentGame.currentTurn}, currentPlayer=${nextPlayer.username}`);
      return;
    }

    const selectedSkill = getRandomSkill(attacker.state.activeZone, attacker.state.isRiichi, attacker.state.hp, attacker.state.maxHp, currentGame.currentTurn);
    console.log(`🎲 Random skill selected: ${selectedSkill.name} (${selectedSkill.type})`);
    console.log(`   Current zone: ${attacker.state.activeZone.type} (${attacker.state.activeZone.remainingTurns} turns remaining)`);
    if (attacker.state.isRiichi) {
      console.log(`   🀄 立直状態: ${attacker.username}`);
    }

    // 【立直中の役昇格ロジック】
    // 立直中かつ弱い技（威力40以下）が出た場合、確率で役に昇格
    let upgradedSkill = selectedSkill;
    let riichiResolved = false; // 役が確定したかどうか
    if (attacker.state.isRiichi && selectedSkill.power <= 40) {
      const upgradeRoll = Math.random();
      
      if (upgradeRoll < 0.01) {
        // 1%: 九蓮宝燈（威力999, rainbow）
        const chuuren = SKILLS.find((skill: Skill) => skill.id === 130);
        if (chuuren) {
          upgradedSkill = chuuren;
          riichiResolved = true;
          console.log(`🀄✨ 立直昇格: 九蓮宝燈！（1%）`);
        }
      } else if (upgradeRoll < 0.04) {
        // 3%: 国士無双（威力130, flash）
        const kokushi = SKILLS.find((skill: Skill) => skill.id === 129);
        if (kokushi) {
          upgradedSkill = kokushi;
          riichiResolved = true;
          console.log(`🀄✨ 立直昇格: 国士無双！（3%）`);
        }
      } else if (upgradeRoll < 0.09) {
        // 5%: 清一色（威力80, blue）
        const chinItsu = SKILLS.find((skill: Skill) => skill.id === 128);
        if (chinItsu) {
          upgradedSkill = chinItsu;
          riichiResolved = true;
          console.log(`🀄✨ 立直昇格: 清一色！（5%）`);
        }
      } else if (upgradeRoll < 0.19) {
        // 10%: 断幺九（威力40, yellow）
        const tanYao = SKILLS.find((skill: Skill) => skill.id === 127);
        if (tanYao) {
          upgradedSkill = tanYao;
          riichiResolved = true;
          console.log(`🀄✨ 立直昇格: 断幺九！（10%）`);
        }
      } else {
        console.log(`🀄 立直中だが昇格せず（~81%）`);
      }
    }

    const punchSkills = ['パンチ', 'ストレート', 'ジャブ', 'アッパーカット', 'フック', 'ボディブロー', 'ダッシュパンチ'];
    const isPunch = punchSkills.includes(upgradedSkill.name);
    
    if (attacker.state.isRiichi && isPunch) {
      if (!attacker.state.riichiBombCount) {
        attacker.state.riichiBombCount = 0;
      }
      attacker.state.riichiBombCount++;
      console.log(`🀄 パンチ連続カウント: ${attacker.state.riichiBombCount}/3`);
      
      if (attacker.state.riichiBombCount >= 3) {
        currentGame.isGameOver = true;
        currentGame.winner = attacker.username;
        
        console.log(`🏆 数え役満成立！${attacker.username}の勝利！`);
        
        io.to(currentRoomId).emit('battle_update', {
          turn: currentGame.currentTurn,
          skillName: upgradedSkill.name,
          skillPower: upgradedSkill.power,
          message: `🀄💥 ${attacker.username}は立直からのパンチ技を3回連続！\n\n🏆 数え役満成立！${attacker.username}の勝利！`,
          gameState: currentGame,
        });
        
        io.to(currentRoomId).emit('game_over', {
          winner: attacker.username,
          gameState: currentGame,
        });
        
        activeGames.delete(currentRoomId);
        return;
      }
    } else {
      if (attacker.state.riichiBombCount && attacker.state.riichiBombCount > 0) {
        console.log(`🀄 パンチ連続カウント: リセット`);
        attacker.state.riichiBombCount = 0;
      }
    }

    let zoneEffectMessage = '';
    if (attacker.state.activeZone.type !== 'none') {
      if (attacker.state.activeZone.type === '強攻のゾーン') {
        zoneEffectMessage = `💥 ゾーン効果: 高威力技が出現！`;
      } else if (attacker.state.activeZone.type === '集中のゾーン') {
        zoneEffectMessage = `🎯 ゾーン効果: 支援技が出現！`;
      }
    }

    let result = applySkillEffect(upgradedSkill, attacker, defender, attacker.state.isRiichi, defender.state.isRiichi);
    const messageParts = [...preMessages];
    if (zoneEffectMessage) {
      messageParts.push(zoneEffectMessage);
    }
    messageParts.push(result.message);

    if (attacker.state.activeZone.type === '強攻のゾーン') {
      const selfDamageChance = Math.random();
      if (selfDamageChance < 0.2) {
        const selfDamage = Math.floor(result.damage * 0.2) || 10;
        attacker.state.hp = Math.max(0, attacker.state.hp - selfDamage);
        messageParts.push(`💢 強攻の反動！ ${attacker.username}は${selfDamage}ダメージを受けた！`);
        console.log(`💢 強攻の反動: ${attacker.username} -${selfDamage} HP`);
      }
    }

    result.message = messageParts.join('\n');

    console.log(`🧪 HP after action -> ${attacker.username}: ${attacker.state.hp}, ${defender.username}: ${defender.state.hp}`);

    let regenAmount = attacker.state.activeZone.type === '乱舞のゾーン' ? 0 : attacker.state.isRiichi ? 0 : 1;
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
    if (attacker.state.isRiichi) {
      console.log(`💧 ${attacker.username} MP: ${attacker.state.mp} (max 5) - 立直中のため回復停止`);
    } else {
      console.log(`💧 ${attacker.username} MP: ${attacker.state.mp} (max 5)`);
    }

    if (attacker.state.activeZone.remainingTurns > 0) {
      attacker.state.activeZone.remainingTurns--;
      console.log(`⏱️ Zone turns remaining: ${attacker.state.activeZone.remainingTurns}`);
      
      if (attacker.state.activeZone.remainingTurns === 0) {
        attacker.state.activeZone.type = 'none';
        console.log(`🔄 ${attacker.username} zone expired!`);
        
        io.to(currentRoomId).emit('zone_expired', {
          username: attacker.username,
          socketId: attacker.socketId,
        });
      }
    }

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
      skill: upgradedSkill,
      skillName: upgradedSkill.name,
      skillPower: upgradedSkill.power,
      damage: result.damage,
      healing: result.healing,
      message: result.message,
      skillEffect: result.skillEffect,
      wasBuffedAttack: result.wasBuffedAttack,
      gameState: currentGame,
    } as any;

    // 【飯テロ】画像URLをランダムに選んで追加
    if (upgradedSkill.effect === 'food_terror' || upgradedSkill.name === '飯テロ') {
      const foodImageUrl = FOOD_IMAGES[Math.floor(Math.random() * FOOD_IMAGES.length)];
      battleUpdate.extraImage = foodImageUrl;
      console.log(`🍱 飯テロ発動！画像URL: ${foodImageUrl}`);
      console.log(`🍱 飯テロスキル詳細: name="${upgradedSkill.name}", effect="${upgradedSkill.effect}"`);
    }

    io.to(currentRoomId).emit('battle_update', battleUpdate);
    io.to(currentRoomId).emit('skill_effect', {
      skill: upgradedSkill,
      attacker: { username: attacker.username, socketId: attacker.socketId },
      defender: { username: defender.username, socketId: defender.socketId },
      turn: currentGame.currentTurn,
    });

    // 【画面揺れ】shake_effect が発動した場合、shakeTurns を 4 に設定
    if (upgradedSkill.effect === 'shake_effect') {
      currentGame.shakeTurns = 4;
      console.log(`📳 shake_effect detected: shakeTurns set to 4`);
    }

    // ★【絶対確実なゲーム終了判定】
    // 1. HPのマイナス補正（0で止める）
    if (attacker.state.hp < 0) attacker.state.hp = 0;
    if (defender.state.hp < 0) defender.state.hp = 0;

    // 2. ゲーム終了判定（HPが0になったら即座に終了プロセスへ）
    if (attacker.state.hp === 0 || defender.state.hp === 0) {
      if (!currentGame.isGameOver) {
        console.log("🏆 Game Over Condition Met!");
        currentGame.isGameOver = true; // 二重発動防止
        
        // 勝者判定: HPが残っている方、両方0なら攻撃側の勝ち
        let winnerName: string;
        if (attacker.state.hp > 0 && defender.state.hp === 0) {
          winnerName = attacker.username;
        } else if (defender.state.hp > 0 && attacker.state.hp === 0) {
          winnerName = defender.username;
        } else {
          winnerName = attacker.username; // 相打ちは攻撃側勝利
        }
        
        console.log(`🏆 Winner: ${winnerName}`);

        const roomIdForTimeout = currentRoomId;
        const gameStateSnapshot = currentGame;
        
        // 最新のHP状態（0になった状態）を送信
        io.to(roomIdForTimeout).emit('game_state_update', gameStateSnapshot);
        
        // 4秒後にリザルト画面へ遷移させる
        setTimeout(() => {
          gameStateSnapshot.winner = winnerName;
          
          console.log(`🏁 Sending game_over event. Winner: ${winnerName}`);
          io.to(roomIdForTimeout).emit('game_state_update', gameStateSnapshot);
          io.to(roomIdForTimeout).emit('game_over', { 
            winner: winnerName,
            gameState: gameStateSnapshot 
          });
          activeGames.delete(roomIdForTimeout);
        }, 4000);
        
        return; // ここで処理終了（ターン交代させない）
      }
      return; // 既に終了処理中の場合も抜ける
    }

    // ★【ゲームが続いている場合のみ以下を実行】
    // 3. ターン交代処理
    currentGame.currentTurn++;

    const nextPlayer = currentGame.currentTurnPlayerId === currentGame.player1.socketId 
      ? currentGame.player2 
      : currentGame.player1;
    currentGame.currentTurnPlayerId = nextPlayer.socketId;

    // 4. エフェクトターン数の減算
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

    // 5. ターン変更通知
    io.to(currentRoomId).emit('turn_change', {
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
    });

    currentGame.turnIndex = currentGame.turnIndex === 0 ? 1 : 0;
    console.log(`🔄 ターン交代: ${currentGame.turnIndex} -> ${nextPlayer.username}`);

    // 6. 画面揺れターン数の減算
    if (currentGame.shakeTurns > 0) {
      currentGame.shakeTurns--;
      console.log(`📳 shakeTurns decremented to ${currentGame.shakeTurns}`);
    }

    // 7. 役が出た場合の立直強制終了
    const yakuNames = ['断幺九', '清一色', '国士無双', '九蓮宝燈'];
    if (yakuNames.includes(upgradedSkill.name)) {
      const roomId = currentRoomId as string;
      [currentGame.player1, currentGame.player2].forEach((p: any) => {
        if (p.state.isRiichi) {
          p.state.isRiichi = false;
          p.state.riichiBombCount = 0;
          io.to(roomId).emit('riichi_cleared', {
            username: p.username,
            socketId: p.socketId,
            yakuName: upgradedSkill.name,
          });
        }
      });
      currentGame.riichiPlayerId = null;
      console.log(`役「${upgradedSkill.name}」が出たため、立直状態を強制解除`);
    }

    // 8. ゲーム状態の更新通知
    io.to(currentRoomId).emit('game_state_update', currentGame);

    // 9. 立直昇格による立直解除
    if (riichiResolved) {
      attacker.state.isRiichi = false;
      attacker.state.riichiBombCount = 0;
      console.log(`🀄 立直解除: 役が確定したため立直状態を解除`);
      io.to(currentRoomId).emit('riichi_cleared', {
        username: attacker.username,
        socketId: attacker.socketId,
        yakuName: upgradedSkill.name,
      });
    }

    // 10. デバッグログ
    console.log(`📊 Turn ${currentGame.currentTurn}:`);
    console.log(`   ${attacker.username}: HP ${attacker.state.hp}, MP ${attacker.state.mp}`);
    console.log(`   ${defender.username}: HP ${defender.state.hp}, MP ${defender.state.mp}`);

    // 11. 立直中の自動ツモ切りスケジュール
    scheduleAutoTsumoIfRiichi(currentRoomId);
  }

  // 立直中の自動ツモ切り（AUTO発動）をスケジュールする
  function scheduleAutoTsumoIfRiichi(roomId: string) {
    const game = activeGames.get(roomId);
    if (!game || game.isGameOver) return;

    const currentId = game.currentTurnPlayerId;
    const currentPlayer = game.player1.socketId === currentId ? game.player1 : game.player2;
    if (!currentPlayer.state.isRiichi) return;

    setTimeout(() => {
      const latest = activeGames.get(roomId);
      if (!latest || latest.isGameOver) return;
      // ターンが進んでいたら中断
      if (latest.currentTurnPlayerId !== currentId) return;

      console.log(`🀄 AUTO ツモ切り発動: ${currentPlayer.username}`);

      // 自動で技を実行し、ターン反転と同期を行う
      processUseSkill(currentId, roomId, { isAuto: true });
    }, 2000);
  }

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
          currentTurnPlayerId: player1.socketId, // player1が最初のターン
          turnIndex: 0, // player1 from start
          shakeTurns: 0, // 初期値：揺れなし
          isGameOver: false,
          winner: null,
          startedAt: Date.now(), // マッチング直後の保護用
        };

        // Send game_start event to both clients
        const gameData = {
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

        // マッチング確立を通知（winner/gameOverリセット用）
        io.to(roomId).emit('match_found', { roomId });
        
        // ゲームスタート通知
        io.to(roomId).emit('game_start', gameData);
        
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
      socket.emit('can_reconnect', { canReconnect: false });
      return;
    }

    const game = activeGames.get(offlineInfo.roomId);
    if (!game) {
      offlinePlayers.delete(playerId);
      socket.emit('can_reconnect', { canReconnect: false });
      return;
    }

    // 有効な対戦データが存在する
    socket.emit('can_reconnect', { canReconnect: true });
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
      if (game.currentTurnPlayerId === previousSocketId) {
        game.currentTurnPlayerId = socket.id;
      }
    }
    if (game.player2.playerId === playerId) {
      game.player2.socketId = socket.id;
      if (game.currentTurnPlayerId === previousSocketId) {
        game.currentTurnPlayerId = socket.id;
      }
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

    // ★重要1: ゾーン発動直後の状態をクライアントに通知（演出が動く）
    io.to(currentRoomId).emit('game_state_update', currentGame);

    // Send zone_activated event to both players
    io.to(currentRoomId).emit('zone_activated', {
      username: player.username,
      socketId: player.socketId,
      zoneType: payload.zoneType,
      duration: duration,
      remainingTurns: duration,
      playerState: player.state,
    });

    // ★重要2: ターン交代処理
    const nextPlayer = currentGame.currentTurnPlayerId === currentGame.player1.socketId 
      ? currentGame.player2 
      : currentGame.player1;
    currentGame.currentTurnPlayerId = nextPlayer.socketId;
    currentGame.turnIndex = currentGame.turnIndex === 0 ? 1 : 0;

    // ターン変更を通知
    io.to(currentRoomId).emit('turn_change', {
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
    });

    console.log(`🔄 Turn changed to: ${nextPlayer.username} (${nextPlayer.socketId})`);

    // ゲーム状態の最終同期
    io.to(currentRoomId).emit('game_state_update', currentGame);

    // 立直中なら自動ツモ切りをスケジュール
    scheduleAutoTsumoIfRiichi(currentRoomId);
  });

  // Handle action_riichi event - 立直発動（MP 5 消費）
  socket.on('action_riichi', () => {
    console.log(`🀄 ${socket.id} attempting to activate riichi (立直)`);

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
      console.log(`❌ ${socket.id} tried to activate riichi on opponent's turn`);
      socket.emit('error', { message: 'Not your turn!' });
      return;
    }

    // Determine which player is activating riichi
    const isPlayer1 = currentGame.player1.socketId === socket.id;
    const player = isPlayer1 ? currentGame.player1 : currentGame.player2;

    // 立直のMPコスト
    const RIICHI_MP_COST = 5;

    // Check if already in riichi state
    if (player.state.isRiichi) {
      socket.emit('error', { message: 'Already in riichi state!' });
      console.log(`❌ ${player.username} is already in riichi state`);
      return;
    }

    // Check if player has enough MP
    if (player.state.mp < RIICHI_MP_COST) {
      socket.emit('error', { message: `Insufficient MP. Need ${RIICHI_MP_COST} MP to activate riichi.` });
      console.log(`❌ ${player.username} has insufficient MP (${player.state.mp}/${RIICHI_MP_COST})`);
      return;
    }

    // Deduct MP cost
    player.state.mp -= RIICHI_MP_COST;

    // Activate riichi state
    player.state.isRiichi = true;
    player.state.riichiBombCount = 0; // パンチ連続カウントをリセット
    currentGame.riichiPlayerId = player.playerId;

    console.log(`🀄 ${player.username} activated riichi! (MP: ${player.state.mp + RIICHI_MP_COST} -> ${player.state.mp})`);
    console.log(`   立直中: MP自然回復停止、役の最低保証と裏ドラ判定が有効`);

    // Send riichi_activated event to both players
    io.to(currentRoomId).emit('riichi_activated', {
      username: player.username,
      socketId: player.socketId,
      playerState: player.state,
    });

    // ターンを交代（立直発動もターンを消費）
    const nextPlayer = currentGame.currentTurnPlayerId === currentGame.player1.socketId 
      ? currentGame.player2 
      : currentGame.player1;
    currentGame.currentTurnPlayerId = nextPlayer.socketId;

    // turnIndexを反転
    currentGame.turnIndex = currentGame.turnIndex === 0 ? 1 : 0;

    // ターン変更を通知
    io.to(currentRoomId).emit('turn_change', {
      currentTurnPlayerId: currentGame.currentTurnPlayerId,
      currentTurnPlayerName: nextPlayer.username,
    });

    console.log(`🔄 Turn changed to: ${nextPlayer.username} (${nextPlayer.socketId})`);

    // game_state_updateを送信してターン交代を同期
    io.to(currentRoomId).emit('game_state_update', currentGame);

    // 立直中なら自動ツモ切りをスケジュール
    scheduleAutoTsumoIfRiichi(currentRoomId);
  });

  // Handle action_use_skill event
  socket.on('action_use_skill', () => {
    processUseSkill(socket.id);
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
        currentTurnPlayerId: gameData.player1.socketId,
        turnIndex: 0, // player1 from start
        shakeTurns: 0, //
        // 初期値：揺れなし
        riichiPlayerId: null,
        isGameOver: false,
        winner: null,
        startedAt: Date.now(),
      };

      activeGames.set(roomId, gameState);

      // プレイヤーステータスを「playing」に変更（activeGamesに追加済み）
      console.log(`🎮 Players status changed to 'playing' in room ${roomId}`);

      // ターン変更通知
      io.to(roomId).emit('turn_change', {
        currentTurnPlayerId: gameState.currentTurnPlayerId,
        currentTurnPlayerName: gameData.player1.username,
      });

      console.log(`✅ Game officially started in room ${roomId}`);
    }
  });

  // 【スマホ救済】状態チェック：待機中にバトルルームに入っているかを確認
  socket.on('check_status', () => {
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
      socket.emit('force_battle_sync', {
        gameState: foundRoom,
        roomId: roomId,
        status: 'playing'
      });
    } else {
      // 待機中または未参加
      console.log(`⏳ Status check: ${socket.id} is waiting or not in game`);
      socket.emit('status_response', {
        status: 'waiting',
        gameState: null,
        roomId: null
      });
    }
  });

  // 【スマホ衝突マッチング】関連
  const bumpWaiters = new Map<string, { data: BumpData; timeoutId: ReturnType<typeof setTimeout> }>();
  const BUMP_MATCH_WINDOW_MS = 3000; // 衝撃検知の許容時間差（3秒）
  const BUMP_MATCH_DISTANCE_THRESHOLD = 0.001; // 許容距離（約100m）

  // 【スマホ衝突マッチング】bump_attempt ハンドラー
  socket.on('bump_attempt', (data: BumpData) => {
    const playerId = socketToPlayerId.get(socket.id);
    if (!playerId) {
      console.log('❌ Bump attempt without playerId');
      return;
    }

    // 既に自分が待機リストにいたら、多重送信なので無視
    if (bumpWaiters.has(socket.id)) {
      console.log(`⏩ Bump attempt from ${data.username} ignored due to already waiting.`);
      return;
    }

    const { username, timestamp, lat, lng } = data;
    console.log(`🤜 Bump attempt from ${username} (${socket.id}) at (${lat}, ${lng}), timestamp: ${timestamp}`);

    // 待機リストから条件に合う相手を検索
    let matchedOpponentId: string | null = null;
    let matchedOpponentData: { data: BumpData; timeoutId: ReturnType<typeof setTimeout> } | null = null;

    for (const [opponentSocketId, waiter] of bumpWaiters.entries()) {
      const timeDiff = Math.abs(timestamp - waiter.data.timestamp);
      const latDiff = Math.abs(lat - waiter.data.lat);
      const lngDiff = Math.abs(lng - waiter.data.lng);

      console.log(`   - Comparing with ${waiter.data.username}: timeDiff=${timeDiff}ms, distDiff=${(latDiff + lngDiff).toFixed(5)}`);

      if (timeDiff < BUMP_MATCH_WINDOW_MS && latDiff < BUMP_MATCH_DISTANCE_THRESHOLD && lngDiff < BUMP_MATCH_DISTANCE_THRESHOLD) {
        matchedOpponentId = opponentSocketId;
        matchedOpponentData = waiter;
        break;
      }
    }

    if (matchedOpponentId && matchedOpponentData) {
      // --- マッチング成功 ---
      const opponent = matchedOpponentData;
      bumpWaiters.delete(matchedOpponentId);
      clearTimeout(opponent.timeoutId);

      const opponentSocket = io.sockets.sockets.get(matchedOpponentId);
      if (!opponentSocket) {
        console.log(`❌ Matched opponent ${matchedOpponentId} not found, but was in waiters list. Aborting match.`);
        return; // 相手のソケットが消えていたら中止
      }

      console.log(`✅ Bump match success! ${username} (${socket.id}) <-> ${opponent.data.username} (${matchedOpponentId})`);

      const roomId = `bump_${uuidv4()}`;

      // ゲーム状態作成
      const player1 = {
        playerId,
        socketId: socket.id,
        username: username || 'Player1',
      };
      const player2 = {
        playerId: socketToPlayerId.get(matchedOpponentId) || 'unknown',
        socketId: matchedOpponentId,
        username: opponent.data.username,
      };

      const gameState: GameState = {
        roomId,
        player1: {
          ...player1,
          state: createPlayerState(),
        },
        player2: {
          ...player2,
          state: createPlayerState(),
        },
        currentTurn: 1,
        currentTurnPlayerId: socket.id, // 先にバンプした方が先攻（要調整）
        turnIndex: 0,
        shakeTurns: 0,
        isGameOver: false,
        winner: null,
        startedAt: Date.now(),
      };

      activeGames.set(roomId, gameState);

      // 両者にマッチング成功通知
      socket.emit('match_success', {
        roomId,
        opponentName: player2.username,
        gameState,
      });
      opponentSocket.emit('match_success', {
        roomId,
        opponentName: player1.username,
        gameState,
      });

      // ルームに参加
      socket.join(roomId);
      opponentSocket.join(roomId);

      console.log(`🎮 Bump match game started in room ${roomId}`);
    } else {
      // --- マッチング相手が見つからない -> 待機リストに追加 ---
      console.log(`⏳ No match found for ${username}, adding to bump waiting list.`);
      const timeoutId = setTimeout(() => {
        bumpWaiters.delete(socket.id);
        console.log(`⌛️ Bump wait timed out for ${username}. Removed from list.`);
      }, BUMP_MATCH_WINDOW_MS + 500); // 許容時間より少し長く待つ

      bumpWaiters.set(socket.id, { data, timeoutId });
    }
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

app.get('/', (req: Request, res: Response) => {
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
