/**
 * Skill Types for the game
 */
export declare enum SkillType {
    FIRE = "FIRE",
    WATER = "WATER",
    EARTH = "EARTH",
    WIND = "WIND",
    LIGHT = "LIGHT",
    DARK = "DARK"
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
    power: number;
    description: string;
}
/**
 * Zone System - boosts specific skill odds
 * Duration is RANDOM (2-5 turns) and server-managed
 */
export interface Zone {
    id: string;
    boostedType: SkillType;
    boostMultiplier: number;
    duration: number;
    currentTurn: number;
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
    hp: number;
    mp: number;
    activeZone: {
        type: '強攻のゾーン' | '集中のゾーン' | '乱舞のゾーン' | '博打のゾーン' | 'none';
        remainingTurns: number;
    };
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
export declare enum SocketEvent {
    CONNECT = "connect",
    DISCONNECT = "disconnect",
    JOIN_GAME = "joinGame",
    GAME_START = "gameStart",
    USE_SKILL = "useSkill",
    TURN_UPDATE = "turnUpdate",
    ZONE_CHANGE = "zoneChange",
    GAME_OVER = "gameOver",
    ERROR = "error"
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
//# sourceMappingURL=types.d.ts.map