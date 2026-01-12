import { useState, useEffect } from 'react';
import type { PlayerData } from '../types';

interface BattleScreenProps {
  myData: PlayerData;
  opponentData: PlayerData;
  lastBattleLog: string;
  battleLogs: string[];
  onUseSkill: () => void;
  onActivateZone: (zoneType: 'attack' | 'heal' | 'chaos') => void;
}

export default function BattleScreen({
  myData,
  opponentData,
  lastBattleLog,
  battleLogs,
  onUseSkill,
  onActivateZone,
}: BattleScreenProps) {
  const [showZoneMenu, setShowZoneMenu] = useState(false);
  const [damageAnimation, setDamageAnimation] = useState(false);
  const [lastHp, setLastHp] = useState(myData.state.hp);

  // Damage animation trigger
  useEffect(() => {
    if (myData.state.hp < lastHp) {
      setDamageAnimation(true);
      const timer = setTimeout(() => setDamageAnimation(false), 300);
      return () => clearTimeout(timer);
    }
    setLastHp(myData.state.hp);
  }, [myData.state.hp]);

  // Get player states
  const myState = myData.state;
  const opponentState = opponentData.state;

  // Check if zone is active
  const activeZone = myState.activeZone.type !== 'none' ? myState.activeZone : null;
  const opponentActiveZone = opponentState.activeZone.type !== 'none' ? opponentState.activeZone : null;

  // Calculate HP/MP percentages
  const myHpPercent = (myState.hp / 100) * 100;
  const myMpPercent = (myState.mp / 100) * 100;
  const opponentHpPercent = (opponentState.hp / 100) * 100;
  const opponentMpPercent = (opponentState.mp / 100) * 100;

  // Zone colors and labels
  const getZoneColor = (type: string) => {
    switch (type) {
      case 'attack': return 'bg-red-500';
      case 'heal': return 'bg-green-500';
      case 'chaos': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getZoneLabel = (type: string) => {
    switch (type) {
      case 'attack': return 'アタックゾーン';
      case 'heal': return 'ヒールゾーン';
      case 'chaos': return 'カオスゾーン';
      default: return '';
    }
  };

  const handleZoneActivation = (zoneType: 'attack' | 'heal' | 'chaos') => {
    onActivateZone(zoneType);
    setShowZoneMenu(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white flex flex-col">
      {/* Top Status Area - Opponent */}
      <div className={`p-4 bg-black bg-opacity-50 transition-all duration-300 ${damageAnimation ? 'shake' : ''}`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-2xl font-bold">
              {opponentData.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-lg">{opponentData.username}</span>
                {opponentActiveZone && (
                  <span className={`px-3 py-1 rounded-full text-xs ${getZoneColor(opponentActiveZone.type)} animate-pulse`}>
                    {getZoneLabel(opponentActiveZone.type)}展開中
                  </span>
                )}
              </div>
              {/* HP Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>HP</span>
                  <span>{opponentState.hp}/100</span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                    style={{ width: `${opponentHpPercent}%` }}
                  ></div>
                </div>
              </div>
              {/* MP Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>MP</span>
                  <span>{opponentState.mp}/100</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                    style={{ width: `${opponentMpPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Center Battle Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Active Zone Badge (if any zone is active) */}
        {(activeZone || opponentActiveZone) && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10">
            {activeZone && (
              <div className={`px-6 py-3 rounded-lg ${getZoneColor(activeZone.type)} shadow-2xl animate-pulse`}>
                <div className="text-center">
                  <div className="text-xl font-bold">{getZoneLabel(activeZone.type)}展開中</div>
                  <div className="text-sm opacity-90">（残り: {activeZone.remainingTurns}ターン）</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Battle Log Display */}
        <div className="max-w-3xl w-full flex flex-col gap-4">
          {/* Latest Action */}
          {lastBattleLog && (
            <div className={`bg-black bg-opacity-70 border-4 border-yellow-400 rounded-lg p-6 shadow-2xl transform transition-transform duration-300 ${
              damageAnimation ? 'scale-105 border-red-500' : ''
            }`}>
              <div className="text-center text-xl font-bold leading-relaxed text-yellow-300 animate-pulse">
                {lastBattleLog}
              </div>
            </div>
          )}

          {/* Battle Log History */}
          {battleLogs.length > 0 && (
            <div className="bg-black bg-opacity-50 rounded-lg p-4 border border-gray-600 max-h-48 overflow-y-auto">
              <p className="text-xs text-gray-400 font-bold mb-3 uppercase">📜 バトルログ</p>
              <div className="space-y-2">
                {battleLogs.slice().reverse().slice(0, 8).map((log, index) => (
                  <div key={index} className="text-xs text-gray-300 font-mono border-l-2 border-purple-500 pl-2 py-1">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VS Badge when no action */}
          {!lastBattleLog && (
            <div className="text-6xl font-bold text-yellow-400 opacity-30 animate-pulse">
              ⚡ VS ⚡
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Area - Player (Me) */}
      <div className="p-4 bg-black bg-opacity-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-2xl font-bold">
              {myData.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-lg">{myData.username}</span>
                {activeZone && (
                  <span className={`px-3 py-1 rounded-full text-xs ${getZoneColor(activeZone.type)} animate-pulse`}>
                    {getZoneLabel(activeZone.type)}展開中
                  </span>
                )}
              </div>
              {/* HP Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>HP</span>
                  <span>{myState.hp}/100</span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                    style={{ width: `${myHpPercent}%` }}
                  ></div>
                </div>
              </div>
              {/* MP Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>MP</span>
                  <span>{myState.mp}/100</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                    style={{ width: `${myMpPercent}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex gap-3 flex-col sm:flex-row">
            {/* Main Action Button - "指を振る" */}
            <button
              onClick={onUseSkill}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 px-6 rounded-xl shadow-2xl transform hover:scale-105 transition-all duration-200 text-xl active:scale-95"
            >
              ✨ 指を振る
            </button>

            {/* Zone Activation Button */}
            <div className="relative flex-1">
              <button
                onClick={() => setShowZoneMenu(!showZoneMenu)}
                disabled={myState.mp < 5}
                className={`w-full py-4 px-6 rounded-xl font-bold shadow-xl transition-all duration-200 ${
                  myState.mp >= 5
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 transform hover:scale-105 active:scale-95'
                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                }`}
              >
                <div className="text-center">
                  <div className="text-lg">🌀 ゾーン展開</div>
                  <div className="text-xs opacity-90">(MP 5)</div>
                </div>
              </button>

              {/* Zone Menu Popup */}
              {showZoneMenu && myState.mp >= 5 && (
                <div className="absolute bottom-full mb-2 right-0 bg-gray-800 rounded-lg shadow-2xl p-3 space-y-2 border-2 border-yellow-400">
                  <button
                    onClick={() => handleZoneActivation('attack')}
                    className="w-full bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg font-semibold transition text-sm"
                  >
                    🔥 アタックゾーン
                  </button>
                  <button
                    onClick={() => handleZoneActivation('heal')}
                    className="w-full bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg font-semibold transition text-sm"
                  >
                    ❤️ ヒールゾーン
                  </button>
                  <button
                    onClick={() => handleZoneActivation('chaos')}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 px-4 py-3 rounded-lg font-semibold transition text-sm"
                  >
                    🌀 カオスゾーン
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
