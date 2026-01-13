import { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import BattleScreen from './components/BattleScreen'
import type { GameStartData } from './types'

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [username, setUsername] = useState('')
  const [hasJoined, setHasJoined] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [gameData, setGameData] = useState<GameStartData | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [lastBattleLog, setLastBattleLog] = useState<string>('')

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  useEffect(() => {
    // Connect to Socket.io server
    // Use environment variable for production deployment
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const newSocket = io(socketUrl)
    
    newSocket.on('connect', () => {
      console.log('Connected to server')
      setIsConnected(true)
      addLog('✅ サーバーに接続しました')
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setIsConnected(false)
      addLog('❌ サーバーから切断されました')
    })

    // Listen for waiting event
    newSocket.on('waiting', (data: { message: string; playersWaiting: number }) => {
      console.log('Waiting:', data)
      addLog(`⏳ ${data.message} (待機中: ${data.playersWaiting}人)`)
    })

    // Listen for game_start event
    newSocket.on('game_start', (data: GameStartData) => {
      console.log('🎮 Game started!', data)
      addLog(`🎮 ゲーム開始！ ルームID: ${data.roomId}`)
      addLog(`👤 プレイヤー1: ${data.player1.username} (HP: ${data.player1.state.hp}, MP: ${data.player1.state.mp})`)
      addLog(`👤 プレイヤー2: ${data.player2.username} (HP: ${data.player2.state.hp}, MP: ${data.player2.state.mp})`)
      setGameStarted(true)
      setGameData(data)
    })

    // Listen for battle_update event
    newSocket.on('battle_update', (data: any) => {
      console.log('⚔️ Battle update:', data)
      addLog(`⚔️ ターン ${data.turn}: ${data.message}`)
      addLog(`   ${data.attacker.username}: HP ${data.attacker.state.hp}, MP ${data.attacker.state.mp}`)
      addLog(`   ${data.defender.username}: HP ${data.defender.state.hp}, MP ${data.defender.state.mp}`)
      
      // Set last battle log for display
      setLastBattleLog(data.message)
      
      // Update game data
      setGameData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          player1: data.gameState.player1,
          player2: data.gameState.player2,
        }
      })
    })

    // Listen for game_over event
    newSocket.on('game_over', (data: any) => {
      console.log('🏆 Game over:', data)
      addLog(`🏆 ゲーム終了！ ${data.winner} の勝利！`)
    })
    // Listen for zone_activated event
    newSocket.on('zone_activated', (data: any) => {
      console.log('🌀 Zone activated:', data)
      addLog(`🌀 ${data.username} が ${data.zoneType} ゾーンを発動！ (継続: ${data.duration}ターン)`)
      
      // Update game data with new zone info
      setGameData(prev => {
        if (!prev) return prev
        const updatedData = { ...prev }
        if (data.socketId === prev.player1.socketId) {
          updatedData.player1.state = data.playerState
        } else {
          updatedData.player2.state = data.playerState
        }
        return updatedData
      })
    })

    // Listen for zone_expired event
    newSocket.on('zone_expired', (data: any) => {
      console.log('🔄 Zone expired:', data)
      addLog(`🔄 ${data.username} のゾーンが終了しました`)
    })
    // Listen for opponent disconnected
    newSocket.on('opponent_disconnected', (data: { message: string }) => {
      console.log('Opponent disconnected:', data)
      addLog(`🚪 ${data.message}`)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  const handleJoinGame = () => {
    if (socket && username.trim()) {
      socket.emit('joinGame', { username })
      setHasJoined(true)
      addLog(`🎯 マッチング開始: ${username}`)
    }
  }

  const handleUseSkill = () => {
    if (socket && gameStarted) {
      socket.emit('action_use_skill')
      addLog(`🎲 ランダムスキルを使用...`)
    }
  }

  const handleActivateZone = (zoneType: 'attack' | 'heal' | 'chaos') => {
    if (socket && gameStarted) {
      socket.emit('action_activate_zone', { zoneType })
      addLog(`🌀 ${zoneType} ゾーンを発動...`)
    }
  }

  // Render BattleScreen if game has started
  if (gameStarted && gameData && socket) {
    // Determine which player is "me"
    const mySocketId = socket.id || '';
    const myData = gameData.player1.socketId === mySocketId ? gameData.player1 : gameData.player2;
    const opponentData = gameData.player1.socketId === mySocketId ? gameData.player2 : gameData.player1;

    return (
      <BattleScreen
        myData={myData}
        opponentData={opponentData}
        lastBattleLog={lastBattleLog}
        battleLogs={logs}
        onUseSkill={handleUseSkill}
        onActivateZone={handleActivateZone}
      />
    );
  }

  return (
    <div className="min-h-screen bg-red-500 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            ⚔️ Yubifuru
          </h1>
          <p className="text-gray-400 text-lg">1v1 Battle Game</p>
        </div>
        
        <div className="bg-gray-800 bg-opacity-80 backdrop-blur rounded-2xl p-8 shadow-2xl border border-purple-500 border-opacity-30">
          {/* Connection Status */}
          <div className="flex items-center justify-center mb-6 gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-300">
              {isConnected ? 'サーバーに接続中' : 'サーバーに接続しています...'}
            </span>
          </div>

          {!hasJoined ? (
            <>
              {/* Username Input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-3 text-purple-300">
                  ユーザー名を入力
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                  className="w-full px-6 py-3 bg-gray-700 border-2 border-purple-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 text-white placeholder-gray-400"
                  placeholder="例: 戦士"
                  disabled={!isConnected}
                />
              </div>

              {/* Join Button */}
              <button
                onClick={handleJoinGame}
                disabled={!isConnected || !username.trim()}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed rounded-xl font-bold text-lg shadow-xl transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
              >
                🎮 ゲーム開始
              </button>
            </>
          ) : (
            <>
              {/* Waiting Screen */}
              <div className="text-center space-y-6">
                <div>
                  <p className="text-green-400 text-lg mb-2">✓ {username} でログイン中</p>
                  <p className="text-gray-300 text-sm">対戦相手を探しています...</p>
                </div>

                {/* Loading Animation */}
                <div className="flex justify-center items-center gap-3 my-8">
                  <div className="w-4 h-4 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-4 h-4 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-4 h-4 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>

                {/* Waiting Stats */}
                <div className="bg-gray-700 bg-opacity-50 rounded-lg p-4 space-y-2">
                  <p className="text-gray-300 text-sm">待機中のプレイヤー数</p>
                  <p className="text-3xl font-bold text-purple-400">
                    🔍 検索中...
                  </p>
                </div>

                {/* Tips */}
                <div className="bg-blue-900 bg-opacity-30 border border-blue-500 rounded-lg p-4">
                  <p className="text-sm text-blue-300">
                    💡 <strong>ゲームルール:</strong>
                  </p>
                  <ul className="text-xs text-blue-200 mt-2 space-y-1 text-left">
                    <li>• 「指を振る」: ランダムなスキルを使用</li>
                    <li>• 「ゾーン展開」: MP5を消費して能力を強化（MP足りない場合は灰色）</li>
                    <li>• HPが0になったら敗北</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Logs */}
        {logs.length > 0 && (
          <div className="mt-8 bg-gray-800 bg-opacity-50 rounded-lg p-4 border border-gray-700 max-h-40 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-2 font-semibold">📋 ログ</p>
            <div className="space-y-1">
              {logs.slice(-5).reverse().map((log, index) => (
                <p key={index} className="text-xs text-gray-400 font-mono">
                  {log}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
