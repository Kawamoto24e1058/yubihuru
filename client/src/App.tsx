import { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import type { GameStartData, PlayerData } from './types'

// ゾーン効果の説明データ
const ZONE_DESCRIPTIONS = {
  '強攻のゾーン': {
    emoji: '🔥',
    effect: '高威力・自傷アリ',
    details: '高威力技が出やすい\n20%の確率で反動ダメージ',
  },
  '集中のゾーン': {
    emoji: '🎯',
    effect: '回復・防御UP',
    details: '回復・補助技が出やすい\n受ダメージを25%軽減',
  },
  '乱舞のゾーン': {
    emoji: '🌪️',
    effect: '攻撃頻発・MP停止',
    details: '攻撃技が非常に出やすい\nMP回復が停止',
  },
  '博打のゾーン': {
    emoji: '🎰',
    effect: '超必殺or無効',
    details: '50%で超必殺技\n50%で何もしない',
  },
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [name, setName] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [myData, setMyData] = useState<PlayerData | null>(null)
  const [opponentData, setOpponentData] = useState<PlayerData | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [currentTurnId, setCurrentTurnId] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [selectedZoneType, setSelectedZoneType] = useState<'強攻のゾーン' | '集中のゾーン' | '乱舞のゾーン' | '博打のゾーン'>('強攻のゾーン')
  const [damageFlash, setDamageFlash] = useState(false)
  const [healFlash, setHealFlash] = useState(false)
  const [zoneBanner, setZoneBanner] = useState<string | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [poisonFlash, setPoisonFlash] = useState(false)
  const [shieldEffect, setShieldEffect] = useState(false)
  const [myMaxHpExpand, setMyMaxHpExpand] = useState(false)
  const [opponentMaxHpExpand, setOpponentMaxHpExpand] = useState(false)

  // HP減少時のshakeアニメーション
  useEffect(() => {
    if (myData && myData.state.hp > 0) {
      setIsShaking(true)
      const timer = setTimeout(() => setIsShaking(false), 500)
      return () => clearTimeout(timer)
    }
  }, [myData?.state.hp])

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
      
      // ゲーム状態をリセット
      setIsGameOver(false)
      setWinner(null)
      setDamageFlash(false)
      setHealFlash(false)
      setZoneBanner(null)
      setPoisonFlash(false)
      setShieldEffect(false)
      setLogs([])
      
      const mySocketId = newSocket.id || ''
      const me = data.player1.socketId === mySocketId ? data.player1 : data.player2
      const opponent = data.player1.socketId === mySocketId ? data.player2 : data.player1
      
      // サーバーがプレイヤー1から始める
      setCurrentTurnId(data.player1.socketId)
      
      setMyData(me)
      setOpponentData(opponent)
      setLogs([`⚔️ バトル開始！ vs ${opponent.username}`])
    })

    newSocket.on('battle_update', (data: any) => {
      console.log('Battle update:', data)
      setLogs(prev => [data.message, ...prev].slice(0, 10))
      
      const mySocketId = newSocket.id || ''
      if (data.gameState) {
        const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
        const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
        
        const prevHp = myData?.state.hp ?? me.state.hp
        const newHp = me.state.hp
        const prevHpOpponent = opponentData?.state.hp ?? opponent.state.hp
        const newHpOpponent = opponent.state.hp

        // ギガインパクト発動時は特大の揺れ演出（3回連続）
        if (data.message && data.message.includes('ギガインパクト')) {
          setIsShaking(true)
          setDamageFlash(true)
          setTimeout(() => setIsShaking(false), 500)
          setTimeout(() => {
            setIsShaking(true)
            setTimeout(() => setIsShaking(false), 500)
          }, 600)
          setTimeout(() => {
            setIsShaking(true)
            setTimeout(() => {
              setIsShaking(false)
              setDamageFlash(false)
            }, 500)
          }, 1200)
        }
        // 連続攻撃時は2回の画面揺れ
        else if (data.isMultiHit) {
          setIsShaking(true)
          setTimeout(() => setIsShaking(false), 500)
          setTimeout(() => {
            setIsShaking(true)
            setTimeout(() => setIsShaking(false), 500)
          }, 600)
        }

        // 被ダメージ判定（自分）- ギガインパクトと連続攻撃を除く
        if (prevHp > newHp) {
          const isGigaImpact = data.message && data.message.includes('ギガインパクト')
          if (!data.isMultiHit && !isGigaImpact) {
            setIsShaking(true)
            setDamageFlash(true)
            setTimeout(() => setIsShaking(false), 500)
            setTimeout(() => setDamageFlash(false), 500)
          }
        }

        // 回復判定（自分）
        if (newHp > prevHp) {
          setHealFlash(true)
          setTimeout(() => setHealFlash(false), 500)
        }

        // 毒ダメージ判定（自分が毒状態で、HPが減少）
        if (me.state.status.poison && prevHp > newHp && !data.isMultiHit && (prevHp - newHp) < 10) {
          setPoisonFlash(true)
          setTimeout(() => setPoisonFlash(false), 400)
        }

        // 毒が新しく付与された
        if (data.isPoisonApplied && opponent.state.status.poison) {
          setLogs(prev => [`☠️ 毒が付与されました！`, ...prev].slice(0, 10))
        }

        // まもるが発動
        if (data.isProtected) {
          setShieldEffect(true)
          setTimeout(() => setShieldEffect(false), 600)
        }

        // 最大HP増加検知（自分）
        const prevMaxHp = myData?.state.maxHp ?? me.state.maxHp
        if (me.state.maxHp > prevMaxHp) {
          setMyMaxHpExpand(true)
          setTimeout(() => setMyMaxHpExpand(false), 500)
        }

        // 最大HP増加検知（相手）
        const prevMaxHpOpponent = opponentData?.state.maxHp ?? opponent.state.maxHp
        if (opponent.state.maxHp > prevMaxHpOpponent) {
          setOpponentMaxHpExpand(true)
          setTimeout(() => setOpponentMaxHpExpand(false), 500)
        }

        // 相手が被ダメージを受けても画面揺らさない（演出過多防止）
        if (prevHpOpponent > newHpOpponent) {
          // optional: could add subtle effect later
        }
        
        setMyData(me)
        setOpponentData(opponent)
      }
      
      // Turn management: wait 2 seconds before enabling next action
      setTimeout(() => {
        setIsProcessing(false)
      }, 2000)
    })

    newSocket.on('turn_change', (data: any) => {
      setCurrentTurnId(data.currentTurnPlayerId)
      setIsProcessing(false)
      
      console.log(`🔄 Turn changed to: ${data.currentTurnPlayerName} (ID: ${data.currentTurnPlayerId})`)
      setLogs(prev => [`🔄 ${data.currentTurnPlayerName}のターン`, ...prev].slice(0, 10))
    })

    newSocket.on('zone_activated', (data: any) => {
      setLogs(prev => [`🌀 ${data.username} が ${data.zoneType} ゾーン発動！`, ...prev].slice(0, 10))
      setZoneBanner(`ZONE ACTIVATED: ${data.zoneType}`)
      setTimeout(() => setZoneBanner(null), 1000)
      
      // Update state with zone info
      const mySocketId = newSocket.id || ''
      if (data.socketId === mySocketId && myData) {
        setMyData({ ...myData, state: data.playerState })
      } else if (opponentData) {
        setOpponentData({ ...opponentData, state: data.playerState })
      }
    })

    newSocket.on('game_over', (data: any) => {
      // サーバーから勝敗が確定したときだけ表示
      console.log('Game over:', data)
      setIsGameOver(true)
      setWinner(data.winner)
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
    const mySocketId = socket?.id || ''
    if (socket && gameStarted && mySocketId === currentTurnId && !isProcessing) {
      socket.emit('action_use_skill')
      setIsProcessing(true)
    }
  }

  const handleActivateZone = () => {
    const mySocketId = socket?.id || ''
    if (socket && gameStarted && myData && myData.state.mp >= 5 && mySocketId === currentTurnId && !isProcessing) {
      socket.emit('action_activate_zone', { zoneType: selectedZoneType })
      setIsProcessing(true)
    }
  }

  // ログ色決定関数
  const getLogColor = (log: string): string => {
    // ギガインパクト（超必殺技）は特別な色
    if (log.includes('ギガインパクト')) {
      return 'text-red-600 font-black text-lg animate-pulse'
    }
    // 何もしない・運命に見放された
    if (log.includes('何も起こらなかった') || log.includes('運命に見放された')) {
      return 'text-gray-500 font-bold italic'
    }
    if (log.includes('ダメージ') || log.includes('連続攻撃') || log.includes('反動') || log.includes('外れた')) {
      return 'text-red-600 font-bold'
    }
    if (log.includes('回復') || log.includes('ドレイン') || log.includes('HEAL')) {
      return 'text-green-600 font-bold'
    }
    if (log.includes('毒') || log.includes('状態') || log.includes('ゾーン') || log.includes('効果')) {
      return 'text-yellow-600 font-bold'
    }
    if (log.includes('勝利') || log.includes('勝敗')) {
      return 'text-purple-600 font-black'
    }
    return 'text-gray-700'
  }

  const renderZoneDisplay = (zoneType: string, isActive: boolean) => {
    if (zoneType === 'none' || !isActive) return null
    
    const zoneKey = zoneType as keyof typeof ZONE_DESCRIPTIONS
    const zone = ZONE_DESCRIPTIONS[zoneKey]
    if (!zone) return null

    return (
      <div className="bg-yellow-300 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 -rotate-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-black text-sm">{zone.emoji} {zoneType}</p>
          <span className="bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] px-2 py-1 text-[10px] font-bold leading-tight">
            {zone.effect}
          </span>
        </div>
        <p className="text-xs whitespace-pre-wrap leading-tight">{zone.details}</p>
      </div>
    )
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

  // ゲーム終了画面（サーバーからの確定情報を使用）
  if (isGameOver && winner) {
    const isWinner = myData?.username === winner
    
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
        <div className={`bg-white border-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-12 max-w-md w-full text-center ${
          isWinner ? 'border-yellow-400 bg-yellow-100' : 'border-gray-400 bg-gray-100'
        }`}>
          {isWinner ? (
            <>
              <h2 className="text-6xl mb-4">🎉</h2>
              <h1 className="text-5xl font-black text-yellow-600 mb-4">YOU WIN!</h1>
              <p className="font-bold text-xl mb-8">{winner} の勝利！</p>
            </>
          ) : (
            <>
              <h2 className="text-6xl mb-4">💔</h2>
              <h1 className="text-4xl font-black text-gray-600 mb-4">YOU LOSE</h1>
              <p className="font-bold text-lg mb-8">{winner} に負けました</p>
            </>
          )}
          <button
            onClick={() => {
              setGameStarted(false)
              setIsGameOver(false)
              setWinner(null)
              setMyData(null)
              setOpponentData(null)
              setLogs([])
              setCurrentTurnId('')
              setIsProcessing(false)
              setName('')
            }}
            className="w-full py-4 bg-blue-500 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-lg"
          >
            🏠 メインメニューへ
          </button>
        </div>
      </div>
    )
  }

  // バトル画面
  if (gameStarted && myData && opponentData) {
    const mySocketId = socket?.id || ''
    const isMyTurn = mySocketId === currentTurnId
    const myHpPercent = (myData.state.hp / myData.state.maxHp) * 100
    const myMpPercent = (myData.state.mp / 5) * 100
    const opponentHpPercent = (opponentData.state.hp / opponentData.state.maxHp) * 100
    const opponentMpPercent = (opponentData.state.mp / 5) * 100

    const zoneBorderMap: Record<string, string> = {
      '強攻のゾーン': 'border-red-500',
      '集中のゾーン': 'border-emerald-500',
      '乱舞のゾーン': 'border-orange-500',
      '博打のゾーン': 'border-purple-500',
      'none': 'border-black',
    }
    const myZoneBorder = zoneBorderMap[myData.state.activeZone.type] || 'border-black'

    return (
      <div className={`min-h-screen bg-yellow-50 p-4 transition-transform relative ${isShaking ? 'animate-shake' : ''}`}>
        {/* ダメージ時の赤フラッシュ */}
        {damageFlash && (
          <div className="pointer-events-none absolute inset-0 bg-red-500/40 animate-flash" />
        )}
        {/* 毒ダメージ時の紫フラッシュ */}
        {poisonFlash && (
          <div className="pointer-events-none absolute inset-0 bg-purple-500/40 animate-poison-flash" />
        )}
        {/* ゾーンバナー */}
        {zoneBanner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-flash">
            <div className="bg-black text-yellow-50 border-4 border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] px-6 py-4 text-3xl md:text-4xl font-black tracking-wide">
              {zoneBanner}
            </div>
          </div>
        )}
        {/* シールドエフェクト */}
        {shieldEffect && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-96 h-96 border-4 border-cyan-400 rounded-full animate-shield-pulse" style={{ borderStyle: 'dashed' }} />
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-4">
          {/* 上部ステータス */}
          <div className="grid grid-cols-2 gap-4">
            {/* 相手 */}
            <div className="space-y-2">
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-black text-sm">OPPONENT</p>
                  {opponentData.state.status.poison && (
                    <span className="bg-purple-600 text-white text-xs font-black px-2 py-1 rounded">☠️ 毒</span>
                  )}
                </div>
                <p className="font-black text-xl mb-3">{opponentData.username}</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>HP</span>
                      <span>{opponentData.state.hp}/{opponentData.state.maxHp}</span>
                    </div>
                    <div className={`h-4 border-2 border-black bg-gray-200 ${opponentMaxHpExpand ? 'animate-expand-bar' : ''}`}>
                      <div 
                        className="h-full bg-lime-400 transition-all duration-500"
                        style={{ width: `${opponentHpPercent}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>MP</span>
                      <span>{opponentData.state.mp}/5</span>
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
              {renderZoneDisplay(opponentData.state.activeZone.type, true)}
            </div>

            {/* 自分 */}
            <div className="space-y-2">
              <div className={`bg-white border-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 transition-all ${
                `${myZoneBorder} ${isMyTurn ? 'animate-pulse' : ''}`
              } ${isShaking ? 'animate-shake' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm">YOU {isMyTurn && '⭐'}</p>
                    {myData.state.status.poison && (
                      <span className="bg-purple-600 text-white text-xs font-black px-2 py-1 rounded">☠️ 毒</span>
                    )}
                  </div>
                  {healFlash && (
                    <span className="text-green-600 font-black text-xs animate-flash">✨ HEAL</span>
                  )}
                </div>
                <p className="font-black text-xl mb-3">{myData.username}</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>HP</span>
                      <span>{myData.state.hp}/{myData.state.maxHp}</span>
                    </div>
                    <div className={`h-4 border-2 border-black bg-gray-200 ${myMaxHpExpand ? 'animate-expand-bar' : ''}`}>
                      <div 
                        className={`h-full transition-all duration-500 ${healFlash ? 'animate-flash bg-white' : 'bg-lime-400'}`}
                        style={{ width: `${myHpPercent}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>MP</span>
                      <span>{myData.state.mp}/5</span>
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
              {renderZoneDisplay(myData.state.activeZone.type, true)}
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
                  <div key={index} className={`font-bold text-sm py-1 border-b-2 border-gray-200 ${getLogColor(log)}`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 下部アクション */}
          <div className="space-y-4">
            {/* ターン表示 */}
            {!isMyTurn && (
              <div className="bg-orange-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                <p className="font-black text-xl animate-pulse">⏳ 相手の行動を待っています...</p>
              </div>
            )}
            {isProcessing && isMyTurn && (
              <div className="bg-blue-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                <p className="font-black text-xl animate-pulse">⚡ 演出中...</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* 指を振るボタン */}
              <button
                onClick={handleUseSkill}
                disabled={mySocketId !== currentTurnId || isProcessing}
                className={`border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-8 font-black text-2xl ${
                  mySocketId === currentTurnId && !isProcessing
                    ? 'bg-pink-500 hover:bg-pink-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {mySocketId !== currentTurnId ? '相手の行動を待っています...' : isProcessing ? '⏳ WAITING...' : '✨ 指を振る'}
              </button>

              {/* ゾーン展開エリア */}
              <div className="space-y-2">
                {/* ゾーン選択ドロップダウン */}
                <select
                  value={selectedZoneType}
                  onChange={(e) => setSelectedZoneType(e.target.value as any)}
                  disabled={mySocketId !== currentTurnId || isProcessing}
                  className="w-full px-3 py-2 border-2 border-black font-bold text-sm bg-white"
                >
                  <option value="強攻のゾーン">🔥 強攻</option>
                  <option value="集中のゾーン">🎯 集中</option>
                  <option value="乱舞のゾーン">🌪️ 乱舞</option>
                  <option value="博打のゾーン">🎰 博打</option>
                </select>

                {/* ゾーン展開ボタン */}
                <button
                  onClick={handleActivateZone}
                  disabled={mySocketId !== currentTurnId || isProcessing || myData.state.mp < 5}
                  className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-4 font-black text-lg ${
                    mySocketId === currentTurnId && !isProcessing && myData.state.mp >= 5
                      ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  {mySocketId !== currentTurnId ? '相手の行動を待っています...' : isProcessing ? '⏳ WAITING...' : '🌀 展開'}
                  {mySocketId === currentTurnId && !isProcessing && <span className="block text-xs">(MP 5)</span>}
                </button>
              </div>
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
