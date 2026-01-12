/**
 * Skill Types for the game
 */
export var SkillType;
(function (SkillType) {
    SkillType["FIRE"] = "FIRE";
    SkillType["WATER"] = "WATER";
    SkillType["EARTH"] = "EARTH";
    SkillType["WIND"] = "WIND";
    SkillType["LIGHT"] = "LIGHT";
    SkillType["DARK"] = "DARK";
})(SkillType || (SkillType = {}));
/**
 * Socket Event Types
 */
export var SocketEvent;
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
})(SocketEvent || (SocketEvent = {}));
//# sourceMappingURL=types.js.map