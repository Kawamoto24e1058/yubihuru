import { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import type { GameStartData, PlayerData } from './types'

// ゾーン効果の説明データ
const ZONE_DESCRIPTIONS = {
  '強攻のゾーン': {
    emoji: '🔥',
    effect: '高威力・自傷アリ',
    details: '威力50以上の技のみ出現\n20%の確率で反動ダメージ',
  },
  '集中のゾーン': {
    emoji: '🎯',
    effect: '回復・補助のみ',
    details: '回復・最大HP増加・補助技のみ出現\n安全に成長できる',
  },
  '乱舞のゾーン': {
    emoji: '🌪️',
    effect: '攻撃のみ・MP停止',
    details: '攻撃技のみ出現\nMP回復が完全に停止',
  },
  '博打のゾーン': {
    emoji: '🎰',
    effect: '超必殺or無効',
    details: '50%で威力200のギガインパクト\n50%で何もしない',
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
  const [showZoneTooltip, setShowZoneTooltip] = useState(false)
  
  // 技名表示用
  const [showImpact, setShowImpact] = useState(false)
  const [impactText, setImpactText] = useState('')
  const [screenShake, setScreenShake] = useState(false)
  const [isUltraSkill, setIsUltraSkill] = useState(false) // 虹色演出用

  // 嫌がらせ演出用
  const [opponentInkEffect, setOpponentInkEffect] = useState(false)
  const [opponentShakeEffect, setOpponentShakeEffect] = useState(false)
  const [inkSplashes, setInkSplashes] = useState<Array<{id: number, x: number, y: number, size: number}>>([])
  const [specialVictoryText, setSpecialVictoryText] = useState<string | null>(null) // 'BAN' or '役満'

  // フィニッシュ・インパクト演出用
  const [showFinishText, setShowFinishText] = useState(false)
  const [victoryResult, setVictoryResult] = useState<'WINNER' | 'LOSER' | null>(null)

  // 麻雀役システム用
  const [doraSkill, setDoraSkill] = useState<string>('') // ドラ表示用
  const [yakumanFreeze, setYakumanFreeze] = useState(false) // 役満フリーズ演出
  const [isDoraTurn, setIsDoraTurn] = useState(false) // ドラが該当した時の金縁表示

  // ラストアタック・インパクト用
  const [lastAttackGrayscale, setLastAttackGrayscale] = useState(false) // グレースケール
  const [lastAttackFlash, setLastAttackFlash] = useState(false) // 画面フラッシュ
  const [shouldApplyFinalDamage, setShouldApplyFinalDamage] = useState(false) // HP最終反映フラグ
  const [mobileZoneInfoOpen, setMobileZoneInfoOpen] = useState(false) // スマホ向けゾーン説明
  const [fatalFlash, setFatalFlash] = useState(false)
  const [fatalWarning, setFatalWarning] = useState(false)
  const [glassBreak, setGlassBreak] = useState(false)
  const [slowMotion, setSlowMotion] = useState(false)
  const [buffedDamage, setBuffedDamage] = useState<number | null>(null)

  // 相手のactiveEffectを監視
  useEffect(() => {
    if (!opponentData?.state.activeEffect) return

    if (opponentData.state.activeEffect === 'ink') {
      setOpponentInkEffect(true)
      // ランダムなインクのしぶき生成（5〜10個）
      const splashCount = Math.floor(Math.random() * 6) + 5
      const newSplashes = Array.from({ length: splashCount }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100, // 0-100%
        y: Math.random() * 100,
        size: Math.random() * 300 + 150 // 150-450px
      }))
      setInkSplashes(newSplashes)
      
      // 効果期間終了時に消す
      const duration = (opponentData.state.activeEffectTurns ?? 3) * 2000 + 1000
      const timer = setTimeout(() => {
        setOpponentInkEffect(false)
        setInkSplashes([])
      }, duration)
      return () => clearTimeout(timer)
    } else if (opponentData.state.activeEffect === 'shake') {
      setOpponentShakeEffect(true)
      
      // 効果期間終了時に消す
      const duration = (opponentData.state.activeEffectTurns ?? 2) * 2000 + 1000
      const timer = setTimeout(() => {
        setOpponentShakeEffect(false)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [opponentData?.state.activeEffect, opponentData?.state.activeEffectTurns])

  // 試合終了・リセット時の演出フラグ掃除
  useEffect(() => {
    if (!gameStarted) {
      setSpecialVictoryText(null)
      setVictoryResult(null)
      setOpponentInkEffect(false)
      setOpponentShakeEffect(false)
      setInkSplashes([])
      setYakumanFreeze(false)
      setLastAttackGrayscale(false)
      setLastAttackFlash(false)
      setShowImpact(false)
      setIsDoraTurn(false)
      setShowFinishText(false)
      setFatalFlash(false)
      setFatalWarning(false)
      setGlassBreak(false)
      setSlowMotion(false)
      setBuffedDamage(null)
    }

    if (isGameOver) {
      const timer = setTimeout(() => {
        setSpecialVictoryText(null)
        setVictoryResult(null)
        setOpponentInkEffect(false)
        setOpponentShakeEffect(false)
        setInkSplashes([])
        setYakumanFreeze(false)
        setLastAttackGrayscale(false)
        setLastAttackFlash(false)
        setShowImpact(false)
        setIsDoraTurn(false)
        setShowFinishText(false)
        setFatalFlash(false)
        setFatalWarning(false)
        setGlassBreak(false)
        setSlowMotion(false)
        setBuffedDamage(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [gameStarted, isGameOver])

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

      // 既存プレイヤーIDがあれば再接続を試行
      const savedId = localStorage.getItem('yubihuru_player_id')
      if (savedId) {
        newSocket.emit('reconnect', { playerId: savedId })
      }
    })

    // 永続IDを受信
    newSocket.on('player_id', (data: { playerId: string }) => {
      localStorage.setItem('yubihuru_player_id', data.playerId)
    })

    newSocket.on('waiting', () => {
      setIsWaiting(true)
    })

    newSocket.on('opponent_reconnected', () => {
      setLogs(prev => [`🔌 相手が再接続しました`, ...prev].slice(0, 10))
    })

    // 再接続成功: 最新ゲーム状態を反映
    newSocket.on('reconnect_success', (data: any) => {
      console.log('Reconnected with state:', data)
      setIsWaiting(false)
      setGameStarted(true)
      setIsGameOver(false)
      setWinner(null)
      setZoneBanner(null)
      setIsProcessing(false)

      const mySocketId = newSocket.id || ''
      const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
      const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1

      setMyData(me)
      setOpponentData(opponent)
      setCurrentTurnId(data.gameState.currentTurnPlayerId)
      setLogs(prev => [`🔁 再接続しました`, ...prev].slice(0, 10))
    })

    newSocket.on('reconnect_failed', (data: any) => {
      console.warn('Reconnect failed', data)
      setLogs(prev => [`❌ 再接続に失敗しました`, ...prev].slice(0, 10))
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
      setSpecialVictoryText(null)
      setVictoryResult(null)
      setOpponentInkEffect(false)
      setOpponentShakeEffect(false)
      setInkSplashes([])
      setYakumanFreeze(false)
      setLastAttackGrayscale(false)
      setLastAttackFlash(false)
      setShowImpact(false)
      setIsDoraTurn(false)
      setShowFinishText(false)
      setFatalFlash(false)
      setFatalWarning(false)
      setGlassBreak(false)
      setSlowMotion(false)
      setBuffedDamage(null)
      
      // ドラをランダム選択（麻雀システム）
      const allSkillNames = ['パンチ', 'キック', 'ヒール', '火炎弾', '氷結魔法', 'ポイズン', 'シールド', 
        'MP吸収', 'HP吸収', 'ギガ・インパクト', '等価交換', '借金取り', '指が折れる', '飯テロ',
        '断幺九', '清一色', '国士無双', '九蓮宝燈']
      const randomDora = allSkillNames[Math.floor(Math.random() * allSkillNames.length)]
      setDoraSkill(randomDora)
      
      const mySocketId = newSocket.id || ''
      const me = data.player1.socketId === mySocketId ? data.player1 : data.player2
      const opponent = data.player1.socketId === mySocketId ? data.player2 : data.player1
      if (me.playerId) {
        localStorage.setItem('yubihuru_player_id', me.playerId)
      }
      
      // サーバーがプレイヤー1から始める
      setCurrentTurnId(data.player1.socketId)
      
      setMyData(me)
      setOpponentData(opponent)
      setLogs([`⚔️ バトル開始！ vs ${opponent.username}`])
    })

    newSocket.on('battle_update', (data: any) => {
      console.log('Battle update:', data)
      setLogs(prev => [data.message, ...prev].slice(0, 10))
      
      // 役満フリーズ演出（国士無双・九蓮宝燈）
      if (data.skillEffect === 'yakuman-freeze') {
        setYakumanFreeze(true)
        setTimeout(() => {
          setYakumanFreeze(false)
        }, 3000) // 3秒間のフリーズ
      }
      
      // 特殊勝利を検知（出禁 or 数え役満）
      if (data.message && data.message.includes('出禁')) {
        setSpecialVictoryText('BAN')
        setFatalFlash(true)
        setFatalWarning(true)
        setSlowMotion(true)
        setTimeout(() => setSlowMotion(false), 1000)
        setTimeout(() => setFatalWarning(false), 900)
        setTimeout(() => setFatalFlash(false), 900)
        setTimeout(() => setGlassBreak(true), 250)
        setTimeout(() => setGlassBreak(false), 1250)
      } else if (data.message && data.message.includes('役満')) {
        setSpecialVictoryText('役満')
      }
      
      // 技名を即座に表示
      const skillName = data.skillName || '技'
      setImpactText(skillName)
      setShowImpact(true)

      // バフ付き攻撃の場合、ダメージを記録して後で巨大化表示
      if (data.wasBuffedAttack && data.damage > 0) {
        setBuffedDamage(data.damage)
        setTimeout(() => setBuffedDamage(null), 1200)
      }

      if (data.wasBuffedAttack && data.damage && data.damage > 0) {
        setBuffedDamage(data.damage)
        setTimeout(() => setBuffedDamage(null), 900)
      }
      
      // ドラ該当時は金縁表示
      if (doraSkill && skillName === doraSkill) {
        setIsDoraTurn(true)
        setTimeout(() => setIsDoraTurn(false), 1200)
      }
      
      // パワー150以上で超必殺演出（虹色）
      if (data.skillPower && data.skillPower >= 150) {
        setIsUltraSkill(true)
        setScreenShake(true)
        
        // 白黒反転フラッシュ
        const filterOverlay = document.createElement('div')
        filterOverlay.style.cssText = `
          position: fixed;
          inset: 0;
          background: white;
          opacity: 0;
          pointer-events: none;
          z-index: 9999;
          animation: inverseFlash 0.2s ease-out;
        `
        document.body.appendChild(filterOverlay)
        setTimeout(() => filterOverlay.remove(), 200)
        
        setTimeout(() => {
          setScreenShake(false)
        }, 200)
        
        // 1.2秒表示後に消える
        setTimeout(() => {
          setShowImpact(false)
          setIsUltraSkill(false)
        }, 1200)
      } else {
        // 通常技は0.8秒表示
        setTimeout(() => {
          setShowImpact(false)
        }, 800)
      }
      
      const mySocketId = newSocket.id || ''
      if (data.gameState) {
        const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
        const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
        
        const prevHp = myData?.state.hp ?? me.state.hp
        const newHp = me.state.hp
        const prevHpOpponent = opponentData?.state.hp ?? opponent.state.hp
        const newHpOpponent = opponent.state.hp

        // 【フィニッシュ・インパクト】相手HP=0を検知
        if (newHpOpponent <= 0 && prevHpOpponent > 0) {
          console.log('🎬 ラストアタック・インパクト開始！');
          
          // Phase 1: スローモーション演出（グレースケール + 画面フラッシュ）を即座に開始
          setLastAttackGrayscale(true)
          setLastAttackFlash(true)
          
          // Phase 2: 1.5秒後にドカン音と共にHPを最終反映
          setTimeout(() => {
            console.log('🎬 1.5秒経過 - ドカン！HP最終反映');
            setShouldApplyFinalDamage(true)
            setShowFinishText(true) // ドカン音表示
            
            // Phase 3: 1.0秒後にWINNER表示
            setTimeout(() => {
              console.log('🎬 WINNER表示');
              setVictoryResult('WINNER')
              
              // Phase 4: グレースケール解除（WINNER表示は続ける）
              setLastAttackGrayscale(false)
            }, 1000)
          }, 1500)
          
          return // HP反映を遅延させるため、ここでreturn
        }

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
        
        // ラストアタック演出中は相手HPの更新を遅延
        if (shouldApplyFinalDamage) {
          setMyData(me)
          setOpponentData(opponent)
          setShouldApplyFinalDamage(false)
        } else if (newHpOpponent > 0 || prevHpOpponent <= 0) {
          // 相手がまだ生きているか、既に死んでいる場合は通常更新
          setMyData(me)
          setOpponentData(opponent)
        }
        // newHpOpponent <= 0 && prevHpOpponent > 0 かつ shouldApplyFinalDamage === false の場合はスキップ（演出中）
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
      
      // 勝敗結果を表示
      const mySocketId = newSocket.id || ''
      const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
      setVictoryResult(me.username === data.winner ? 'WINNER' : 'LOSER')
      
      // グレースケール解除
      setLastAttackGrayscale(false)
      setLastAttackFlash(false)
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
    // 立直・ロン・ツモ（一撃必殺）
    if (log.includes('立直') || log.includes('ロン') || log.includes('ツモ') || log.includes('一撃必殺')) {
      return 'text-red-600 font-black text-lg animate-pulse'
    }
    // ギガインパクト（超必殺技）は特別な色
    if (log.includes('ギガインパクト')) {
      return 'text-red-600 font-black text-lg animate-pulse'
    }
    // ネタ技・何もしない・運命に見放された
    if (log.includes('何も起こらなかった') || log.includes('運命に見放された') || log.includes('謝罪') || log.includes('土下座') || log.includes('遺憾')) {
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

  // ログを虹色で表示するカスタム要素（技名などが含まれる場合）
  const renderLogWithRainbow = (log: string) => {
    // 技名パターンを抽出：「XXXが〇〇を使用！」や「XXXは△△で〇〇のダメージ」など
    // シンプルに、複数の単語が連続している部分を技名と判定
    // スキップする単語を除外して処理
    const skillNames = [
      'ギガインパクト', '立直', 'ロン', 'ツモ', '一撃必殺',
      '何も起こらなかった', '運命に見放された', '謝罪', '土下座', 'HEAL'
    ]
    
    for (const skillName of skillNames) {
      if (log.includes(skillName)) {
        const parts = log.split(skillName)
        return (
          <span>
            {parts[0]}
            <span style={{
              background: 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              WebkitTextStroke: '3px black',
              fontWeight: 900
            }}>
              {skillName}
            </span>
            {parts[1]}
          </span>
        )
      }
    }
    return log
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
      <div className={`min-h-screen bg-yellow-50 p-4 transition-all relative ${isShaking ? 'animate-shake' : ''} ${screenShake ? 'scale-110 rotate-3' : ''} ${opponentShakeEffect ? 'animate-window-shake' : ''} ${lastAttackGrayscale ? 'filter grayscale' : ''} ${slowMotion ? 'animate-slow-motion' : ''}`}>
        {/* 必殺技演出：3回フラッシュ（BAN用） */}
        {fatalFlash && (
          <>
            <div className="pointer-events-none absolute inset-0 z-[100] bg-white opacity-0 animate-fatal-flash" />
            <div className="pointer-events-none absolute inset-0 z-[100] bg-white opacity-0 animate-fatal-flash" style={{ animationDelay: '0.15s' }} />
            <div className="pointer-events-none absolute inset-0 z-[100] bg-white opacity-0 animate-fatal-flash" style={{ animationDelay: '0.3s' }} />
          </>
        )}

        {/* 警告バナー（BAN用） */}
        {fatalWarning && (
          <div className="pointer-events-none absolute top-1/4 left-0 right-0 z-[101] flex items-center justify-center animate-warning-banner">
            <div className="bg-black text-yellow-400 border-8 border-yellow-400 shadow-[0_0_40px_rgba(255,255,0,0.8)] px-12 py-6 text-6xl font-black tracking-widest uppercase">
              ⚠️ WARNING ⚠️
            </div>
          </div>
        )}

        {/* ガラス割れオーバーレイ（BAN用） */}
        {glassBreak && (
          <div className="pointer-events-none absolute inset-0 z-[102] animate-glass-shatter" style={{
            backgroundImage: 'radial-gradient(circle at center, transparent 0%, transparent 30%, rgba(255,255,255,0.9) 100%)',
          }}>
            {/* ガラス破片エフェクト（SVG） */}
            <svg className="absolute inset-0 w-full h-full opacity-80">
              <defs>
                <filter id="shatter">
                  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="5" result="turbulence"/>
                  <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="50" xChannelSelector="R" yChannelSelector="G"/>
                </filter>
              </defs>
              <rect width="100%" height="100%" fill="rgba(255,255,255,0.3)" filter="url(#shatter)"/>
            </svg>
          </div>
        )}

        {/* バフ付きダメージ表示（3倍サイズ） */}
        {buffedDamage !== null && (
          <div className="pointer-events-none absolute inset-0 z-[55] flex items-center justify-center">
            <p 
              className="text-[24vw] font-black select-none animate-buffed-damage"
              style={{
                WebkitTextStroke: '6px black',
                fontWeight: 900,
                color: '#FF4444'
              }}
            >
              {buffedDamage}
            </p>
          </div>
        )}

        {/* ラストアタック：グレースケール + 画面フラッシュ */}
        {lastAttackFlash && (
          <div className="pointer-events-none absolute inset-0 z-[90] bg-white opacity-0 animate-last-attack-flash" />
        )}
        
        {/* フィニッシュ・インパクト演出 */}
        {showFinishText && (
          <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
            <p 
              className="text-[180px] font-black select-none animate-finish-impact"
              style={{
                WebkitTextStroke: '4px black',
                fontWeight: 900,
                color: '#FF0000'
              }}
            >
              ドゴォォォォン！！
            </p>
          </div>
        )}
        
        {/* 勝敗結果表示 */}
        {victoryResult && (
          <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-black/30">
            <p 
              className="text-[250px] font-black select-none animate-victory-slam scale-150"
              style={{
                WebkitTextStroke: '6px black',
                fontWeight: 900,
                color: victoryResult === 'WINNER' ? '#FFD700' : '#888888'
              }}
            >
              {victoryResult}
            </p>
          </div>
        )}
        
        {/* 役満フリーズ演出 */}
        {yakumanFreeze && (
          <div className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center bg-black/60">
            <p 
              className="text-[300px] font-black select-none animate-yakuman-pulse"
              style={{
                WebkitTextStroke: '6px black',
                fontWeight: 900,
                color: '#FFD700'
              }}
            >
              役満
            </p>
          </div>
        )}
        
        {/* ドラ表示（右上） */}
        {doraSkill && gameStarted && !isGameOver && (
          <div className="absolute top-4 right-4 z-30">
            <p 
              className={`text-2xl font-black ${isDoraTurn ? 'animate-dora-glow' : ''}`}
              style={{
                WebkitTextStroke: isDoraTurn ? '3px gold' : '3px black',
                fontWeight: 900,
                color: isDoraTurn ? '#FFD700' : '#FFFFFF'
              }}
            >
              ドラ：{doraSkill}
            </p>
          </div>
        )}
        
        {/* 相手のインクこぼし演出 */}
        {opponentInkEffect && (
          <div className="pointer-events-none absolute inset-0 z-40">
            {inkSplashes.map(splash => (
              <div
                key={splash.id}
                className="absolute rounded-full opacity-80 mix-blend-multiply"
                style={{
                  left: `${splash.x}%`,
                  top: `${splash.y}%`,
                  width: `${splash.size}px`,
                  height: `${splash.size}px`,
                  backgroundColor: '#000',
                  filter: 'blur(30px)',
                  transform: 'translate(-50%, -50%)',
                  animation: 'ink-fade 2s ease-out forwards'
                }}
              />
            ))}
          </div>
        )}
        
        {/* 特殊勝利の演出 */}
        {specialVictoryText && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-50 animate-pulse">
            <p 
              className="text-[200px] font-black select-none"
              style={{
                color: specialVictoryText === 'BAN' ? '#FF0000' : '#FFD700',
                WebkitTextStroke: specialVictoryText === 'BAN' ? '4px black' : '3px black',
                fontWeight: 900,
                animation: 'victory-bounce 0.5s ease-out'
              }}
            >
              {specialVictoryText}
            </p>
          </div>
        )}
        
        {/* 技名表示 */}
        {showImpact && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-50">
            {/* 技名テキスト */}
            <p 
              className={`text-[8vw] font-black tracking-tighter leading-none select-none ${isUltraSkill ? 'animate-rainbow-glow' : 'text-white'}`}
              style={{
                WebkitTextStroke: '3px black',
                fontWeight: 900
              }}
            >
              {impactText}
            </p>
          </div>
        )}
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

        <div className="w-full mx-auto space-y-2 md:space-y-4 flex flex-col md:flex-row gap-2 md:gap-4 pb-40 md:pb-0">
          {/* 相手側（スマホ時は上部、PC時は左） */}
          <div className="w-full md:w-1/3 order-1">
            {/* 相手ステータス */}
            <div className="space-y-2">
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 md:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-black text-xs md:text-sm">OPPONENT</p>
                  {opponentData.state.status.poison && (
                    <span className="bg-purple-600 text-white text-xs font-black px-2 py-1 rounded">☠️ 毒</span>
                  )}
                  {opponentData.state.isRiichi && (
                    <span className="bg-red-600 text-white text-xs font-black px-2 py-1 rounded animate-pulse">🀄 立直</span>
                  )}
                </div>
                <p className="font-black text-lg md:text-xl mb-2 md:mb-3">{opponentData.username}</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>HP</span>
                      <span>{opponentData.state.hp}/{opponentData.state.maxHp}</span>
                    </div>
                    <div className={`h-3 md:h-4 border-2 border-black bg-gray-200 ${opponentMaxHpExpand ? 'animate-expand-bar' : ''}`}>
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
                    <div className="h-2 md:h-3 border-2 border-black bg-gray-200">
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
          </div>

          {/* 中央（ログ + 技名） */}
          <div className="w-full md:w-1/3 order-3 md:order-2 flex flex-col gap-2 md:gap-4">
            {/* ログ */}
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 md:p-6 flex-1 md:flex-none md:h-auto">
              <h3 className="font-black text-sm md:text-xl mb-2 md:mb-4 border-b-4 border-black pb-1 md:pb-2">BATTLE LOG</h3>
              <div className="space-y-1 md:space-y-2 max-h-32 md:max-h-48 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-gray-400 font-bold text-xs md:text-sm">待機中...</p>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className={`font-bold text-xs md:text-sm py-1 border-b-2 border-gray-200 ${getLogColor(log)}`}>
                      {renderLogWithRainbow(log)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 自分側（スマホ時は下部（固定前）、PC時は右） */}
          <div className="w-full md:w-1/3 order-2 md:order-3">
            {/* 自分ステータス */}
            <div className="space-y-2 relative">
              <div className={`bg-white border-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 md:p-4 transition-all ${
                `${myZoneBorder} ${isMyTurn ? 'animate-pulse' : ''}`
              } ${isShaking ? 'animate-shake' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-xs md:text-sm">YOU {isMyTurn && '⭐'}</p>
                    {myData.state.status.poison && (
                      <span className="bg-purple-600 text-white text-xs font-black px-2 py-1 rounded">☠️ 毒</span>
                    )}
                    {myData.state.isRiichi && (
                      <span className="bg-red-600 text-white text-xs font-black px-2 py-1 rounded animate-pulse">🀄 立直</span>
                    )}
                  </div>
                  {healFlash && (
                    <span className="text-green-600 font-black text-xs animate-flash">✨ HEAL</span>
                  )}
                </div>
                <p className="font-black text-lg md:text-xl mb-2 md:mb-3">{myData.username}</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>HP</span>
                      <span>{myData.state.hp}/{myData.state.maxHp}</span>
                    </div>
                    <div className={`h-3 md:h-4 border-2 border-black bg-gray-200 ${myMaxHpExpand ? 'animate-expand-bar' : ''}`}>
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
                    <div className="h-2 md:h-3 border-2 border-black bg-gray-200">
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

          {/* スマホ時のボタンエリア（下部固定） */}
          <div className="order-5 md:hidden fixed bottom-0 left-0 right-0 p-4 bg-yellow-50 border-t-4 border-black space-y-3 max-h-[35vh] overflow-y-auto">
            {/* ターン表示 */}
            {!isMyTurn && (
              <div className="bg-orange-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-2 text-center">
                <p className="font-black text-sm animate-pulse">⏳ 相手の行動を待っています...</p>
              </div>
            )}
            {isProcessing && isMyTurn && (
              <div className="bg-blue-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-2 text-center">
                <p className="font-black text-sm animate-pulse">⚡ 演出中...</p>
              </div>
            )}

            {/* 指を振るボタン */}
            <button
              onClick={handleUseSkill}
              disabled={mySocketId !== currentTurnId || isProcessing}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-6 font-black text-lg ${
                mySocketId === currentTurnId && !isProcessing
                  ? 'bg-pink-500 hover:bg-pink-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {mySocketId !== currentTurnId ? '相手の行動を待っています...' : isProcessing ? '⏳ WAITING...' : (myData.state.isBuffed ? '✨ 指を振る（威力2倍中！）' : '✨ 指を振る')}
            </button>

            {/* 現在のゾーン効果表示 */}
            {myData.state.activeZone.type !== 'none' && (
              <div className="bg-yellow-300 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{ZONE_DESCRIPTIONS[myData.state.activeZone.type].emoji}</span>
                  <div>
                    <p className="font-black text-xs">{myData.state.activeZone.type}</p>
                    <p className="text-xs font-bold text-red-600">残り {myData.state.activeZone.remainingTurns} ターン</p>
                  </div>
                </div>
                <p className="text-xs font-bold whitespace-pre-wrap leading-tight">
                  {ZONE_DESCRIPTIONS[myData.state.activeZone.type].details}
                </p>
              </div>
            )}

            {/* ゾーン選択ドロップダウン + ?アイコン（スマホ） */}
            <div className="flex items-center gap-2">
              <select
                value={selectedZoneType}
                onChange={(e) => setSelectedZoneType(e.target.value as any)}
                disabled={mySocketId !== currentTurnId || isProcessing}
                className="flex-1 px-2 py-2 border-2 border-black font-bold text-xs bg-white"
              >
                <option value="強攻のゾーン">🔥 強攻のゾーン</option>
                <option value="集中のゾーン">🎯 集中のゾーン</option>
                <option value="乱舞のゾーン">🌪️ 乱舞のゾーン</option>
                <option value="博打のゾーン">🎰 博打のゾーン</option>
              </select>
              <button
                type="button"
                onClick={() => setMobileZoneInfoOpen(true)}
                className="w-10 h-10 shrink-0 border-3 border-black bg-white font-black text-base rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                ?
              </button>
            </div>

            {/* ゾーン展開ボタン */}
            <button
              onClick={handleActivateZone}
              disabled={mySocketId !== currentTurnId || isProcessing || myData.state.mp < 5}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-3 font-black text-sm ${
                mySocketId === currentTurnId && !isProcessing && myData.state.mp >= 5
                  ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {mySocketId !== currentTurnId ? '相手の行動を待っています...' : isProcessing ? '⏳ WAITING...' : '🌀 ゾーン展開'}
              {mySocketId === currentTurnId && !isProcessing && <span className="block text-xs">(MP 5消費)</span>}
            </button>
          </div>

          {/* PC版：下部アクション */}
          <div className="hidden md:block space-y-4">
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

            {/* PC版：2列グリッド */}
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
                {mySocketId !== currentTurnId ? '相手の行動を待っています...' : isProcessing ? '⏳ WAITING...' : (myData.state.isBuffed ? '✨ 指を振る（威力2倍中！）' : '✨ 指を振る')}
              </button>

              {/* ゾーン展開エリア */}
              <div className="space-y-3">
                {/* 現在のゾーン効果表示 */}
                {myData.state.activeZone.type !== 'none' && (
                  <div className="bg-yellow-300 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{ZONE_DESCRIPTIONS[myData.state.activeZone.type].emoji}</span>
                      <div>
                        <p className="font-black text-sm">{myData.state.activeZone.type}</p>
                        <p className="text-xs font-bold text-red-600">残り {myData.state.activeZone.remainingTurns} ターン</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold whitespace-pre-wrap leading-tight">
                      {ZONE_DESCRIPTIONS[myData.state.activeZone.type].details}
                    </p>
                  </div>
                )}

                {/* ゾーン選択ドロップダウン */}
                <select
                  value={selectedZoneType}
                  onChange={(e) => setSelectedZoneType(e.target.value as any)}
                  disabled={mySocketId !== currentTurnId || isProcessing}
                  className="w-full px-3 py-2 border-2 border-black font-bold text-sm bg-white"
                >
                  <option value="強攻のゾーン">🔥 強攻のゾーン</option>
                  <option value="集中のゾーン">🎯 集中のゾーン</option>
                  <option value="乱舞のゾーン">🌪️ 乱舞のゾーン</option>
                  <option value="博打のゾーン">🎰 博打のゾーン</option>
                </select>

                {/* ゾーン展開ボタン（ツールチップ付き） */}
                <div className="relative">
                  <button
                    onClick={handleActivateZone}
                    onMouseEnter={() => setShowZoneTooltip(true)}
                    onMouseLeave={() => setShowZoneTooltip(false)}
                    disabled={mySocketId !== currentTurnId || isProcessing || myData.state.mp < 5}
                    className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-4 font-black text-lg ${
                      mySocketId === currentTurnId && !isProcessing && myData.state.mp >= 5
                        ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {mySocketId !== currentTurnId ? '相手の行動を待っています...' : isProcessing ? '⏳ WAITING...' : '🌀 ゾーン展開'}
                    {mySocketId === currentTurnId && !isProcessing && <span className="block text-xs">(MP 5消費)</span>}
                  </button>

                  {/* ツールチップ：全ゾーン説明 */}
                  {showZoneTooltip && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
                      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">❗</span>
                          <p className="font-black text-sm">ゾーン効果一覧</p>
                        </div>
                        {Object.entries(ZONE_DESCRIPTIONS).map(([zoneName, zone]) => (
                          <div key={zoneName} className="border-2 border-black p-2 bg-yellow-50">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{zone.emoji}</span>
                              <p className="font-black text-xs">{zoneName}</p>
                            </div>
                            <p className="text-xs font-bold text-gray-700 whitespace-pre-wrap leading-tight">
                              {zone.details}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* スマホ用ゾーン説明モーダル */}
        {mobileZoneInfoOpen && (
          <div className="fixed inset-0 z-[120] md:hidden bg-black/70 flex items-center justify-center px-4">
            <div className="w-full max-w-sm bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{ZONE_DESCRIPTIONS[selectedZoneType].emoji}</span>
                  <p className="font-black text-base" style={{ WebkitTextStroke: '2px black' }}>{selectedZoneType}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileZoneInfoOpen(false)}
                  className="w-10 h-10 border-3 border-black bg-yellow-200 font-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                  aria-label="close zone info"
                >
                  ×
                </button>
              </div>
              <p className="text-sm font-bold whitespace-pre-wrap leading-tight">{ZONE_DESCRIPTIONS[selectedZoneType].details}</p>
              <button
                type="button"
                onClick={() => setMobileZoneInfoOpen(false)}
                className="w-full border-4 border-black bg-blue-400 hover:bg-blue-300 font-black py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
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
