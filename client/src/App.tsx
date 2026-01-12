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
        onUseSkill={handleUseSkill}
        onActivateZone={handleActivateZone}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-8 text-blue-400">
          Yubifuru - 1v1 Battle Game
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Game Panel */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Server Status:</span>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  isConnected ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {!hasJoined ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Enter Your Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your username..."
                    onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                  />
                </div>
                <button
                  onClick={handleJoinGame}
                  disabled={!isConnected || !username.trim()}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition"
                >
                  Join Game
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-green-400 mb-2">✓ Joined as {username}</p>
                <p className="text-gray-400 text-sm">Waiting for opponent...</p>
                <div className="mt-4 animate-pulse">
                  <div className="h-2 bg-blue-600 rounded"></div>
                </div>
              </div>
            )}
          </div>

          {/* Log Panel */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-blue-400">📋 Event Logs</h2>
            <div className="bg-gray-900 rounded p-4 h-96 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-500 italic">No events yet...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="text-gray-300 mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Zone System: Random skill boosts (2-5 turns)</p>
          <p className="mt-1">Server-managed random skills</p>
        </div>
      </div>
    </div>
  )
}

export default App
