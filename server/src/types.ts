/**
 * Skill Types for the game
 */
export enum SkillType {
  FIRE = 'FIRE',
  WATER = 'WATER',
  EARTH = 'EARTH',
  WIND = 'WIND',
  LIGHT = 'LIGHT',
  DARK = 'DARK',
}

/**
 * Skill interface (legacy)
 */
export interface SkillLegacy {
  id: string;
  name: string;
  type: SkillType;
  damage: number;
  mpCost: number;
  description: string;
}

/**
 * Skill interface (new battle system)
 */
export interface Skill {
  id: number;
  name: string;
  type: 'attack' | 'heal' | 'buff' | 'special';
  power: number; // ダメージ量、回復量、またはバフの場合は0
  description: string;
  effect?: 'none' | 'recoil' | 'lifesteal' | 'mp_regen_boost' | 'poison' | 'multi_hit' | 'self_damage' | 'drain' | 'charge' | 'protect' | 'hit_rate' | 'max_hp_boost' | 'max_hp_boost_with_heal' | 'max_hp_boost_with_damage' | 'riichi' | 'riichi_attack';
  recoilRatio?: number; // 自傷割合（例: 0.25なら25%）
  lifestealRatio?: number; // 与ダメージに対する回復割合
  mpRegenBonus?: number; // 追加MP回復量
  mpRegenDuration?: number; // 追加MP回復の継続ターン
  poisonDamage?: number; // どくダメージ/ターン
  poisonDuration?: number; // どくの継続ターン
  hitRate?: number; // 命中率（0-1, 例: 0.5なら50%）
  multiHitChance?: number; // 追加攻撃確率（ひっかく用）
  selfDamageRatio?: number; // 自分が受けるダメージ割合（捨て身タックル用）
  drainRatio?: number; // ドレイン回復割合
  chargeBonus?: number; // チャージ倍率
  protectRatio?: number; // カット率
  maxHpBoost?: number; // 最大HP増加量
}

/**
 * Zone System - boosts specific skill odds
 * Duration is RANDOM (2-5 turns) and server-managed
 */
export interface Zone {
  id: string;
  boostedType: SkillType; // The skill type that gets boosted in this zone
  boostMultiplier: number; // Odds multiplier for the boosted skill type
  duration: number; // Random 2-5 turns, set by server
  currentTurn: number; // Track current turn in the zone
}

/**
 * Player State interface (legacy)
 */
export interface PlayerStateLegacy {
  id: string;
  username: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  activeZone: Zone | null;
  availableSkills: SkillLegacy[];
}

/**
 * Player State interface (new battle system)
 */
export interface PlayerState {
  hp: number; // 初期値500
  maxHp: number; // 初期値500、上限1000
  mp: number; // 初期値0、上限5
  activeZone: {
    type: '強攻のゾーン' | '集中のゾーン' | '乱舞のゾーン' | '博打のゾーン' | 'none';
    remainingTurns: number;
  };
  status: {
    poison: {
      turns: number;
      damagePerTurn: number;
    } | null;
    mpRegenBonus: {
      turns: number;
      amount: number;
    } | null;
  };
  isRiichi: boolean; // 立直状態（一撃必殺準備完了）
}

/**
 * Game State interface
 */
export interface GameState {
  roomId: string;
  players: [PlayerState, PlayerState];
  currentTurn: number;
  activeZone: Zone | null;
  isGameOver: boolean;
  winner: string | null;
}

/**
 * Socket Event Types
 */
export enum SocketEvent {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  
  // Game events
  JOIN_GAME = 'joinGame',
  GAME_START = 'gameStart',
  USE_SKILL = 'useSkill',
  TURN_UPDATE = 'turnUpdate',
  ZONE_CHANGE = 'zoneChange',
  GAME_OVER = 'gameOver',
  
  // Error events
  ERROR = 'error',
}

/**
 * Socket Message Payloads
 */
export interface JoinGamePayload {
  username: string;
}

export interface UseSkillPayload {
  skillId: string;
  targetPlayerId: string;
}

export interface TurnUpdatePayload {
  gameState: GameState;
}

export interface ZoneChangePayload {
  zone: Zone;
}

export interface GameOverPayload {
  winner: string;
  finalGameState: GameState;
}
