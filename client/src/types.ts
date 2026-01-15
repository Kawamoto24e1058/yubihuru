/**
 * Skill Types for the game
 */
export const SkillType = {
  FIRE: 'FIRE',
  WATER: 'WATER',
  EARTH: 'EARTH',
  WIND: 'WIND',
  LIGHT: 'LIGHT',
  DARK: 'DARK',
} as const;

export type SkillTypeValue = typeof SkillType[keyof typeof SkillType];

/**
 * Skill interface (legacy)
 */
export interface SkillLegacy {
  id: string;
  name: string;
  type: SkillTypeValue;
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
}

/**
 * Zone System - boosts specific skill odds
 * Duration is RANDOM (2-5 turns) and server-managed
 */
export interface Zone {
  id: string;
  boostedType: SkillTypeValue; // The skill type that gets boosted in this zone
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
  isBuffed?: boolean;
  buffTurns?: number;
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
  activeEffect?: 'ink' | 'shake' | 'none'; // メタ要素：インクこぼし、ウィンドウシェイク
  activeEffectTurns?: number; // アクティブ効果の残りターン数
  riichiBombCount?: number; // 数え役満カウント用
  // 反射・カウンター系
  isReflecting: boolean; // ミラーコート待機中
  isCounter: boolean; // カウンター待機中
  isDestinyBond: boolean; // 道連れ待機中
}

/**
 * Game State interface
 */
export interface GameState {
  roomId: string;
  players: [PlayerState, PlayerState];
  currentTurn: number;
  turnIndex: number;
  activeZone: Zone | null;
  isGameOver: boolean;
  winner: string | null;
}

/**
 * Socket Event Types
 */
export const SocketEvent = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  
  // Game events
  JOIN_GAME: 'joinGame',
  GAME_START: 'gameStart',
  USE_SKILL: 'useSkill',
  TURN_UPDATE: 'turnUpdate',
  ZONE_CHANGE: 'zoneChange',
  GAME_OVER: 'gameOver',
  
  // Error events
  ERROR: 'error',
} as const;

export type SocketEventValue = typeof SocketEvent[keyof typeof SocketEvent];

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

/**
 * Client-specific interfaces
 */

/**
 * Player data for client-side rendering
 */
export interface PlayerData {
  playerId?: string;
  socketId: string;
  username: string;
  state: PlayerState;
}

/**
 * Game start data received from server
 */
export interface GameStartData {
  roomId: string;
  turnIndex: number;
  currentTurnPlayerId: string; // 初回ターンプレイヤーID
  player1: PlayerData;
  player2: PlayerData;
}
