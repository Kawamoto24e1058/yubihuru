import { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import type { GameStartData, PlayerData } from './types'

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [name, setName] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [myData, setMyData] = useState<PlayerData | null>(null)
  const [opponentData, setOpponentData] = useState<PlayerData | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [isMyTurn, setIsMyTurn] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isShaking, setIsShaking] = useState(false)

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
    const newSocket = io(socketUrl)

    newSocket.on('connect', () => {
      console.log('Connected to server')
    })

    newSocket.on('waiting', () => {
      setIsWaiting(true)
    })

    newSocket.on('game_start', (data: GameStartData) => {
      console.log('Game started!', data)
      setIsWaiting(false)
      setGameStarted(true)
      
      const mySocketId = newSocket.id || ''
      const me = data.player1.socketId === mySocketId ? data.player1 : data.player2
      const opponent = data.player1.socketId === mySocketId ? data.player2 : data.player1
      
      setMyData(me)
      setOpponentData(opponent)
      setLogs([`⚔️ バトル開始！ vs ${opponent.username}`])
    })

    newSocket.on('battle_update', (data: any) => {
      console.log('Battle update:', data)
      setLogs(prev => [data.message, ...prev].slice(0, 10))
      
      // Update player states
      const mySocketId = newSocket.id || ''
      if (data.gameState) {
        const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
        const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
        
        // Check if we took damage (shake animation)
        if (myData && me.state.hp < myData.state.hp) {
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 500)
        }
        
        setMyData(me)
        setOpponentData(opponent)
      }
      
      // Turn management: wait 2 seconds before enabling next action
      setTimeout(() => {
        setIsProcessing(false)
        setIsMyTurn(true)
      }, 2000)
    })

    newSocket.on('turn_update', (data: any) => {
      const mySocketId = newSocket.id || ''
      setIsMyTurn(data.currentTurn === mySocketId)
    })

    newSocket.on('zone_activated', (data: any) => {
      setLogs(prev => [`🌀 ${data.username} が ${data.zoneType} ゾーン発動！`, ...prev].slice(0, 10))
      
      // Update state with zone info
      const mySocketId = newSocket.id || ''
      if (data.socketId === mySocketId && myData) {
        setMyData({ ...myData, state: data.playerState })
      } else if (opponentData) {
        setOpponentData({ ...opponentData, state: data.playerState })
      }
    })

    newSocket.on('game_over', (data: any) => {
      setLogs(prev => [`🏆 ${data.winner} の勝利！`, ...prev])
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  const handleJoin = () => {
    if (socket && name.trim()) {
      socket.emit('joinGame', { username: name })
      setIsWaiting(true)
    }
  }

  const handleUseSkill = () => {
    if (socket && gameStarted && isMyTurn && !isProcessing) {
      socket.emit('action_use_skill')
      setIsMyTurn(false)
      setIsProcessing(true)
    }
  }

  const handleActivateZone = () => {
    if (socket && gameStarted && myData && myData.state.mp >= 5 && isMyTurn && !isProcessing) {
      socket.emit('action_activate_zone', { zoneType: 'attack' })
      setIsMyTurn(false)
      setIsProcessing(true)
    }
  }

  // ローディング画面
  if (isWaiting && !gameStarted) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-12 max-w-md w-full">
          <h2 className="text-4xl font-black text-center mb-4 animate-pulse">
            LOOKING FOR
            <br />
            OPPONENT...
          </h2>
          <p className="text-center font-bold">プレイヤー名: {name}</p>
        </div>
      </div>
    )
  }

  // バトル画面
  if (gameStarted && myData && opponentData) {
    const myHpPercent = (myData.state.hp / 100) * 100
    const myMpPercent = (myData.state.mp / 100) * 100
    const opponentHpPercent = (opponentData.state.hp / 100) * 100
    const opponentMpPercent = (opponentData.state.mp / 100) * 100

    return (
      <div className={`min-h-screen bg-yellow-50 p-4 transition-transform ${isShaking ? 'animate-shake' : ''}`}>
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 上部ステータス */}
          <div className="grid grid-cols-2 gap-4">
            {/* 相手 */}
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
              <p className="font-black text-sm mb-2">OPPONENT</p>
              <p className="font-black text-xl mb-3">{opponentData.username}</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>HP</span>
                    <span>{opponentData.state.hp}/100</span>
                  </div>
                  <div className="h-4 border-2 border-black bg-gray-200">
                    <div 
                      className="h-full bg-lime-400 transition-all duration-300"
                      style={{ width: `${opponentHpPercent}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>MP</span>
                    <span>{opponentData.state.mp}/100</span>
                  </div>
                  <div className="h-3 border-2 border-black bg-gray-200">
                    <div 
                      className="h-full bg-cyan-400 transition-all duration-300"
                      style={{ width: `${opponentMpPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 自分 */}
            <div className={`bg-white border-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 transition-all ${
              isMyTurn ? 'border-pink-500 animate-pulse' : 'border-black'
            }`}>
              <p className="font-black text-sm mb-2">YOU {isMyTurn && '⭐'}</p>
              <p className="font-black text-xl mb-3">{myData.username}</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>HP</span>
                    <span>{myData.state.hp}/100</span>
                  </div>
                  <div className="h-4 border-2 border-black bg-gray-200">
                    <div 
                      className="h-full bg-lime-400 transition-all duration-300"
                      style={{ width: `${myHpPercent}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>MP</span>
                    <span>{myData.state.mp}/100</span>
                  </div>
                  <div className="h-3 border-2 border-black bg-gray-200">
                    <div 
                      className="h-full bg-cyan-400 transition-all duration-300"
                      style={{ width: `${myMpPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 中央ログ */}
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
            <h3 className="font-black text-xl mb-4 border-b-4 border-black pb-2">BATTLE LOG</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-400 font-bold">待機中...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="font-bold text-sm py-1 border-b-2 border-gray-200">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 下部アクション */}
          <div className="space-y-4">
            {/* ターン表示 */}
            {!isMyTurn && !isProcessing && (
              <div className="bg-orange-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                <p className="font-black text-xl animate-pulse">⏳ 相手のターンです...</p>
              </div>
            )}
            {isProcessing && (
              <div className="bg-blue-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                <p className="font-black text-xl animate-pulse">⚡ 演出中...</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* 指を振るボタン */}
              <button
                onClick={handleUseSkill}
                disabled={!isMyTurn || isProcessing || myData.state.hp <= 0}
                className={`border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-8 font-black text-2xl ${
                  isMyTurn && !isProcessing && myData.state.hp > 0
                    ? 'bg-pink-500 hover:bg-pink-400 active:translate-x-1 active:translate-y-1 active:shadow-none'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {isProcessing ? '⏳ WAITING...' : '✨ 指を振る'}
              </button>

              {/* ゾーン展開ボタン */}
              <button
                onClick={handleActivateZone}
                disabled={!isMyTurn || isProcessing || myData.state.mp < 5 || myData.state.hp <= 0}
                className={`border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-8 font-black text-2xl ${
                  isMyTurn && !isProcessing && myData.state.mp >= 5 && myData.state.hp > 0
                    ? 'bg-purple-400 hover:bg-purple-300 active:translate-x-1 active:translate-y-1 active:shadow-none'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {isProcessing ? '⏳ WAITING...' : '🌀 ゾーン展開'}
                {!isProcessing && <span className="block text-sm">(MP 5)</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 初期画面（名前入力）
  return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full">
        <h1 className="text-6xl font-black text-center mb-8 -rotate-3">
          YUBIFURU
        </h1>
        
        <div className="space-y-6">
          <div>
            <label className="block font-black text-sm mb-2">PLAYER NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Enter your name..."
              className="w-full px-4 py-3 border-4 border-black font-bold focus:outline-none focus:ring-4 focus:ring-yellow-300"
              maxLength={20}
            />
          </div>

          <button
            onClick={handleJoin}
            className="w-full py-4 bg-blue-500 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-xl"
          >
            ⚔️ BATTLE START
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
