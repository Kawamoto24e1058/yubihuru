"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketEvent = exports.SkillType = void 0;
/**
 * Skill Types for the game
 */
var SkillType;
(function (SkillType) {
    SkillType["FIRE"] = "FIRE";
    SkillType["WATER"] = "WATER";
    SkillType["EARTH"] = "EARTH";
    SkillType["WIND"] = "WIND";
    SkillType["LIGHT"] = "LIGHT";
    SkillType["DARK"] = "DARK";
})(SkillType || (exports.SkillType = SkillType = {}));
/**
 * Socket Event Types
 */
var SocketEvent;
(function (SocketEvent) {
    // Connection events
    SocketEvent["CONNECT"] = "connect";
    SocketEvent["DISCONNECT"] = "disconnect";
    // Game events
    SocketEvent["JOIN_GAME"] = "joinGame";
    SocketEvent["GAME_START"] = "gameStart";
    SocketEvent["USE_SKILL"] = "useSkill";
    SocketEvent["TURN_UPDATE"] = "turnUpdate";
    SocketEvent["ZONE_CHANGE"] = "zoneChange";
    SocketEvent["GAME_OVER"] = "gameOver";
    // Error events
    SocketEvent["ERROR"] = "error";
})(SocketEvent || (exports.SocketEvent = SocketEvent = {}));
//# sourceMappingURL=types.js.map