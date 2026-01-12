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
 * Skill interface
 */
export interface Skill {
  id: string;
  name: string;
  type: SkillType;
  damage: number;
  mpCost: number;
  description: string;
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
 * Player State interface
 */
export interface PlayerState {
  id: string;
  username: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  activeZone: Zone | null;
  availableSkills: Skill[];
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
