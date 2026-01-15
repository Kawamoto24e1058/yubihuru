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
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [isAnimating, setIsAnimating] = useState<boolean>(false)

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
  
  // turnIndex ターン管理用（新方式）
  const [myIndex, setMyIndex] = useState<number | null>(null)
  const [turnIndex, setTurnIndex] = useState<number>(0)
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false)
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [myPersistentId, setMyPersistentId] = useState<string | null>(null)
  
  // 立直システム用
  const [myRiichiState, setMyRiichiState] = useState(false)
  const [opponentRiichiState, setOpponentRiichiState] = useState(false)
  const [showRiichiLightning, setShowRiichiLightning] = useState(false) // 稲妻エフェクト
  
  // 技名表示用
  const [showImpact, setShowImpact] = useState(false)
  const [impactText, setImpactText] = useState('')
  const [screenShake, setScreenShake] = useState(false)
  const [isUltraSkill, setIsUltraSkill] = useState(false) // 虹色演出用

  // 嫌がらせ演出用
  const [opponentInkEffect, setOpponentInkEffect] = useState(false)
  // 画面揺れは gameState.shakeTurns で管理（サーバー側のターン数に基づく）
  // const [opponentShakeEffect, setOpponentShakeEffect] = useState(false)
  const [inkSplashes, setInkSplashes] = useState<Array<{id: number, x: number, y: number, size: number}>>([])
  const [specialVictoryText, setSpecialVictoryText] = useState<string | null>(null) // 'BAN' or '役満'
  const [skillEffect, setSkillEffect] = useState<string | null>(null)
  const [foodImage, setFoodImage] = useState<string | null>(null) // 飯テロ画像URL

  // フィニッシュ・インパクト演出用
  const [showFinishText, setShowFinishText] = useState(false)
  const [victoryResult, setVictoryResult] = useState<'WINNER' | 'LOSER' | null>(null)

  // 麻雀役システム用
  const [yakumanFreeze, setYakumanFreeze] = useState(false) // 役満フリーズ演出
  const [tenpaiUltimate, setTenpaiUltimate] = useState(false) // 天和の究極演出
  const [whiteoutFlash, setWhiteoutFlash] = useState(false) // ホワイトアウト
  const [mahjongTiles, setMahjongTiles] = useState<Array<{id: number, left: number}>>([]) // 麻雀牌フロー

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
  const [showMenu, setShowMenu] = useState(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [canReconnect, setCanReconnect] = useState(false)
  const [isCheckingReconnect, setIsCheckingReconnect] = useState(true)
  const [totalWins, setTotalWins] = useState(0) // 通算勝利数
  const [currentStreak, setCurrentStreak] = useState(0) // 連勝数
  const [shakeTurns, setShakeTurns] = useState(0) // サーバー側のターンベースの画面揺れ管理

  const gameState = { turnIndex, shakeTurns }

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
    }
  }, [opponentData?.state.activeEffect, opponentData?.state.activeEffectTurns])

  // 試合終了・リセット時の演出フラグ掃除
  useEffect(() => {
    if (!gameStarted) {
      setSpecialVictoryText(null)
      setVictoryResult(null)
      setOpponentInkEffect(false)
      setInkSplashes([])
      setYakumanFreeze(false)
      setLastAttackGrayscale(false)
      setLastAttackFlash(false)
      setShowImpact(false)
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
        setInkSplashes([])
        setYakumanFreeze(false)
        setLastAttackGrayscale(false)
        setLastAttackFlash(false)
        setShowImpact(false)
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
    const newSocket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      transports: ['websocket', 'polling']
    })

    // アプリ起動時に localStorage から保存されたユーザー名を読み込む
    const savedName = localStorage.getItem('yubihuru_user_name')
    if (savedName) {
      setName(savedName)
    }

    // アプリ起動時に localStorage から戦績を読み込む
    const savedWins = localStorage.getItem('yubihuru_total_wins')
    const savedStreak = localStorage.getItem('yubihuru_current_streak')
    if (savedWins) setTotalWins(parseInt(savedWins, 10))
    if (savedStreak) setCurrentStreak(parseInt(savedStreak, 10))

    newSocket.on('connect', () => {
      console.log('Connected to server')

      // 進行中のバトルがあるかチェック
      const activeBattle = localStorage.getItem('yubihuru_active_battle')
      if (activeBattle && !gameStarted) {
        try {
          const battleData = JSON.parse(activeBattle)
          // 5分以内のバトルなら復帰を試みる
          if (Date.now() - battleData.timestamp < 300000) {
            console.log('Active battle detected, attempting to reconnect...')
            const savedId = localStorage.getItem('yubihuru_player_id')
            if (savedId) {
              newSocket.emit('reconnect', { playerId: savedId })
              setIsWaiting(true)
              return
            }
          } else {
            // 古いバトル情報はクリア
            localStorage.removeItem('yubihuru_active_battle')
          }
        } catch (e) {
          console.error('Failed to parse active battle data:', e)
          localStorage.removeItem('yubihuru_active_battle')
        }
      }

      // 初回接続時は再接続可否のチェックのみ
      const savedId = localStorage.getItem('yubihuru_player_id')
      if (savedId && !gameStarted) {
        // 再接続可能かチェック（自動接続はしない）
        newSocket.emit('check_reconnect', { playerId: savedId })
      } else {
        setIsCheckingReconnect(false)
      }
    })

    // 永続IDを受信
    newSocket.on('player_id', (data: { playerId: string }) => {
      localStorage.setItem('yubihuru_player_id', data.playerId)
    })

    // 再接続可否の応答
    newSocket.on('can_reconnect', (data: { canReconnect: boolean }) => {
      setCanReconnect(data.canReconnect)
      setIsCheckingReconnect(false)
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
      const myIdx = data.gameState.player1.socketId === mySocketId ? 0 : 1
      const turnIdx = data.gameState.turnIndex ?? 0

      setMyData(me)
      setOpponentData(opponent)
      setMyIndex(myIdx)
      setTurnIndex(turnIdx)
      setIsMyTurn(myIdx === turnIdx)
      setLogs(prev => [`🔁 再接続しました`, ...prev].slice(0, 10))
    })

    newSocket.on('reconnect_failed', (data: any) => {
      console.warn('Reconnect failed', data)
      setLogs(prev => [`❌ 再接続に失敗しました`, ...prev].slice(0, 10))
      setCanReconnect(false)
      setIsCheckingReconnect(false)
    })

    newSocket.on('game_start', (data: GameStartData) => {
      console.log('Game started!', data)
      setIsWaiting(false)
      setGameStarted(true)
      
      // マッチング成立時、バトル情報を localStorage に保存
      localStorage.setItem('yubihuru_active_battle', JSON.stringify({
        roomId: data.roomId,
        timestamp: Date.now()
      }))
      
      // マッチング成立を確認したことをサーバーに通知
      newSocket.emit('battle_ready_ack', { roomId: data.roomId })
      
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
      setInkSplashes([])
      setYakumanFreeze(false)
      setLastAttackGrayscale(false)
      setLastAttackFlash(false)
      setShowImpact(false)
      setShowFinishText(false)
      setFatalFlash(false)
      setFatalWarning(false)
      setGlassBreak(false)
      setSlowMotion(false)
      setBuffedDamage(null)
      
      // 演出フラグをリセット（ボタンが押せるようにする）
      setIsProcessing(false)
      setIsMyTurn(false)
      
      // プレイヤーデータを設定（重要：これがないとホーム画面に戻る）
      const mySocketId = newSocket.id || ''
      const me = data.player1.socketId === mySocketId ? data.player1 : data.player2
      const opponent = data.player1.socketId === mySocketId ? data.player2 : data.player1
      
      setMyData(me)
      setOpponentData(opponent)
      
      // myIndex を確定設定（重要）
      // 自分が players[0] なら myIndex=0、players[1] なら myIndex=1
      const myIndexValue = data.player1.socketId === mySocketId ? 0 : 1
      setMyIndex(myIndexValue)
      console.log(`myIndex set to ${myIndexValue}`)
      
      // turnIndex を初期化（ゲーム開始時は常に 0 = player1）
      setTurnIndex(0)
      
      setLogs([`⚔️ バトル開始！ vs ${opponent.username}`])
    })

    // マッチング成立直後に winner と gameOver をリセット（保険）
    newSocket.on('match_found', (data: any) => {
      console.log('Match found confirmation:', data)
      setWinner(null)
      setIsGameOver(false)
    })

    const handleSkillEffect = (payload: any) => {
      const effect = payload?.skill?.effect || payload?.skillEffect || null
      if (effect) {
        setSkillEffect(effect)
      }
    }

    newSocket.on('battle_update', (data: any) => {
      console.log('Battle update:', data)
      setLogs(prev => [data.message, ...prev].slice(0, 10))

      if (data.skillEffect) {
        setSkillEffect(data.skillEffect)
      }

      // 【飯テロ】画像表示
      if (data.extraImage) {
        setFoodImage(data.extraImage)
        // 3秒後に画像を消す
        setTimeout(() => {
          setFoodImage(null)
        }, 3000)
      }
      
      // 役満フリーズ演出（国士無双・九蓮宝燈）
      if (data.skillEffect === 'yakuman-freeze') {
        setYakumanFreeze(true)
        // 九蓮宝燈は特別な長い演出時間
        const freezeDuration = data.skillName === '九蓮宝燈' ? 5000 : 3000
        setTimeout(() => {
          setYakumanFreeze(false)
        }, freezeDuration)
      }
      
      // 天和の究極演出
      if (data.skillEffect === 'tenpai-ultimate') {
        setWhiteoutFlash(true)
        // ホワイトアウト：3秒間
        setTimeout(() => setWhiteoutFlash(false), 3000)
        
        // 0.5秒後に天和テキスト表示開始
        setTimeout(() => {
          setTenpaiUltimate(true)
          // 麻雀牌アニメーション生成
          const tiles = Array.from({ length: 13 }, (_, i) => ({
            id: i,
            left: Math.random() * 100
          }))
          setMahjongTiles(tiles)
        }, 500)
        
        // 7秒後に粉砕エフェクト
        setTimeout(() => {
          setGlassBreak(true)
        }, 7000)
        
        setTimeout(() => {
          setGlassBreak(false)
          setTenpaiUltimate(false)
          setMahjongTiles([])
        }, 8000)
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
      // (削除: ドラ機能は廃止)
      
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

    newSocket.on('skill_effect', handleSkillEffect)

    newSocket.on('turn_change', (data: any) => {
      const turnIdx = data.turnIndex ?? turnIndex
      setTurnIndex(turnIdx)
      setIsProcessing(false)
      
      if (myIndex !== null) {
        setIsMyTurn(myIndex === turnIdx)
      }
      
      console.log(`🔄 Turn changed to: ${data.currentTurnPlayerName} (turnIndex: ${turnIdx})`)
      setLogs(prev => [`🔄 ${data.currentTurnPlayerName}のターン`, ...prev].slice(0, 10))
    })

    // game_state_update イベントハンドラ - turnIndex が更新された時
    newSocket.on('game_state_update', (gameState: any) => {
      console.log(`📊 game_state_update received:`, gameState)
      
      // turnIndex を更新
      setTurnIndex(gameState.turnIndex)

      // ターン進行時に演出を強制クリア（残留防止）
      setSkillEffect(null)
      setFoodImage(null)  // 飯テロ画像も同時にリセット
      setYakumanFreeze(false)  // 役満フリーズもリセット
      
      // shakeTurns を更新（画面揺れ管理用）
      setShakeTurns(gameState.shakeTurns ?? 0)
      
      if (myIndex !== null) {
        if (gameState.turnIndex === myIndex) {
          // ★自分のターンになった時は、すべての操作ロックフラグを強制解除
          setIsProcessing(false)
          setIsAnimating(false)
          setShowImpact(false)
          setIsUltraSkill(false)
          setShowFinishText(false)
          setDamageFlash(false)
          setShieldEffect(false)
          console.log(`▶️ Your turn. All operation locks cleared.`)
        } else {
          setIsProcessing(false)
          console.log(`⏸️ Not your turn anymore. isProcessing reset.`)
        }
      }
    })

    // 立直中の自動ツモ切りをサーバーから要求された場合に実行
    newSocket.on('force_auto_skill', () => {
      console.log('🀄 force_auto_skill received - auto executing action_use_skill')
      handleUseSkill()
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

    // 立直イベントハンドラ
    newSocket.on('riichi_activated', (data: any) => {
      console.log(`🀄 立直発動: ${data.username}`)
      setLogs(prev => [`🀄 ${data.username}が立直を発動！`, ...prev].slice(0, 10))
      
      // 誰が立直したか判定
      const mySocketId = newSocket.id || ''
      if (data.socketId === mySocketId) {
        setMyRiichiState(true)
        setMyData(prev => prev ? { ...prev, state: data.playerState } : null)
      } else {
        setOpponentRiichiState(true)
        setOpponentData(prev => prev ? { ...prev, state: data.playerState } : null)
      }

      // 稲妻エフェクトを一時的に表示
      setShowRiichiLightning(true)
      setTimeout(() => setShowRiichiLightning(false), 1500)
    })

    // 立直解除イベント
    newSocket.on('riichi_cleared', (data: any) => {
      console.log(`🀄 立直解除: ${data.username} が役「${data.yakuName}」を出した！`)
      setLogs(prev => [`🀄 ${data.username}が役「${data.yakuName}」を出して立直が解除！`, ...prev].slice(0, 10))
      
      const mySocketId = newSocket.id || ''
      if (data.socketId === mySocketId) {
        setMyRiichiState(false)
      } else {
        setOpponentRiichiState(false)
      }
    })

    newSocket.on('game_over', (data: any) => {
      // サーバーから勝敗が確定したときだけ表示
      console.log('Game over:', data)
      
      // ガード：ゲーム中でない場合は無視（マッチング直後の誤動作防止）
      if (!gameStarted) {
        console.warn('Ignoring game_over event: game not started')
        return
      }
      
      setIsGameOver(true)
      setWinner(data.winner)
      setLogs(prev => [`🏆 ${data.winner} の勝利！`, ...prev])
      
      // 勝敗結果を表示
      const mySocketId = newSocket.id || ''
      const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
      const isWinner = me.username === data.winner
      setVictoryResult(isWinner ? 'WINNER' : 'LOSER')
      
      // 戦績を更新・保存
      if (isWinner) {
        // 勝利時：通算勝利数と連勝数を +1
        const newTotalWins = totalWins + 1
        const newStreak = currentStreak + 1
        setTotalWins(newTotalWins)
        setCurrentStreak(newStreak)
        localStorage.setItem('yubihuru_total_wins', newTotalWins.toString())
        localStorage.setItem('yubihuru_current_streak', newStreak.toString())
      } else {
        // 敗北時：連勝数をリセット（通算勝利数は変わらない）
        setCurrentStreak(0)
        localStorage.setItem('yubihuru_current_streak', '0')
      }
      
      // バトル終了時、active_battle をクリア
      localStorage.removeItem('yubihuru_active_battle')
      // セッションを完全に破棄（復帰ボタンを無効化）
      localStorage.removeItem('yubihuru_player_id')
      
      // グレースケール解除
      setLastAttackGrayscale(false)
      setLastAttackFlash(false)
    })

    // 【スマホ救済】しつこい同期：待機中は1秒ごとにサーバーへ状態確認
    newSocket.on('force_battle_sync', (data: any) => {
      console.log('🚨 Force battle sync received:', data)
      
      // 待機中でバトルルームに入っていることが判明 → 即座に遷移
      if (data.status === 'playing' && data.gameState) {
        console.log('⚡ Forcing transition to battle screen...')
        setIsWaiting(false)
        setGameStarted(true)
        setIsGameOver(false)
        setWinner(null)
        
        const mySocketId = newSocket.id || ''
        const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
        const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
        const myIdx = data.gameState.player1.socketId === mySocketId ? 0 : 1
        const turnIdx = data.gameState.turnIndex ?? 0
        
        setMyData(me)
        setOpponentData(opponent)
        setMyIndex(myIdx)
        setTurnIndex(turnIdx)
        setIsMyTurn(myIdx === turnIdx)
        setCurrentRoomId(data.roomId)
        
        const persistentId = me.playerId || ''
        setMyPersistentId(persistentId)
        if (persistentId) {
          localStorage.setItem('yubihuru_my_player_id', persistentId)
        }
        
        setLogs([`⚔️ バトル開始！ vs ${opponent.username}`])
        console.log('✅ Force sync complete - now in battle!')
      }
    })

    newSocket.on('status_response', (data: any) => {
      // 待機中の確認応答（特に処理不要）
      console.log('📊 Status response:', data.status)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  // 【スマホ救済】待機中は1秒ごとにサーバーへ状態確認ポーリング
  useEffect(() => {
    if (!socket || !isWaiting || gameStarted) return

    console.log('🔄 Starting periodic status check (every 1s)')
    const intervalId = setInterval(() => {
      console.log('📡 Polling server status...')
      socket.emit('check_status')
    }, 1000) // 1秒ごと

    return () => {
      console.log('🛑 Stopping status check polling')
      clearInterval(intervalId)
    }
  }, [socket, isWaiting, gameStarted])

  // skillEffect が入ったら3秒後に自動でリセット（派手な演出の永続防止）
  useEffect(() => {
    if (!skillEffect) return
    const timer = setTimeout(() => setSkillEffect(null), 3000)
    return () => clearTimeout(timer)
  }, [skillEffect])

  const handleJoin = () => {
    if (socket && name.trim()) {
      // ユーザー名を localStorage に保存
      localStorage.setItem('yubihuru_user_name', name)
      socket.emit('joinGame', { username: name })
      setIsWaiting(true)
    }
  }

  const handleReconnect = () => {
    const savedId = localStorage.getItem('yubihuru_player_id')
    if (socket && savedId) {
      socket.emit('reconnect', { playerId: savedId })
      setIsWaiting(true)
    }
  }

  const handleQuitToTitle = () => {
    setShowQuitConfirm(false)
    setShowMenu(false)
    setGameStarted(false)
    setIsWaiting(false)
    setMyData(null)
    setOpponentData(null)
    setLogs([])
    setMyIndex(null)
    setTurnIndex(0)
    setIsMyTurn(false)
    // バトルから戻る際、保存されたユーザー名を復元
    const savedName = localStorage.getItem('yubihuru_user_name')
    if (savedName) {
      setName(savedName)
    }
    setIsProcessing(false)
    // IDは残す（再接続可能にする）
  }

  const handleUseSkill = () => {
    const isMyTurnByIndex = myIndex !== null && turnIndex === myIndex
    if (socket && gameStarted && isMyTurnByIndex && !isProcessing) {
      console.log(`\n✅ ===== 技発動ボタン押下 =====`)
      console.log(`   myIndex: ${myIndex}`)
      console.log(`   turnIndex: ${turnIndex}`)
      console.log(`   currentRoomId: ${currentRoomId}`)
      console.log(`   isProcessing: ${isProcessing}`)
      console.log(`   Emitting action_use_skill...`)
      
      socket.emit('action_use_skill', { roomId: currentRoomId, playerId: myPersistentId })
      setIsProcessing(true)
      
      console.log(`✅ action_use_skill emitted`)
    } else {
      console.warn(`\n⚠️ ===== 技発動ボタン押下失敗 =====`)
      if (!socket) console.warn('❌ Socket not connected')
      if (!gameStarted) console.warn('❌ Game not started')
      if (myIndex === null) console.warn('❌ myIndex is not set')
      if (turnIndex !== myIndex) console.warn(`ℹ️ Not your turn: turnIndex=${turnIndex}, myIndex=${myIndex}`)
      if (isProcessing) console.warn('❌ Already processing action')
    }
  }

  const handleActivateZone = () => {
    const isMyTurnByIndex = myIndex !== null && turnIndex === myIndex
    if (socket && gameStarted && myData && myData.state.mp >= 5 && isMyTurnByIndex && !isProcessing) {
      console.log(`✅ ゾーン発動: myIndex=${myIndex}, turnIndex=${turnIndex}, zone=${selectedZoneType}, roomId=${currentRoomId}`)
      socket.emit('action_activate_zone', { roomId: currentRoomId, zoneType: selectedZoneType, playerId: myPersistentId })
      setIsProcessing(true)
    } else {
      if (!socket) console.warn('⚠️ Socket not connected')
      if (!gameStarted) console.warn('⚠️ Game not started')
      if (!myData) console.warn('⚠️ MyData not set')
      if (myData && myData.state.mp < 5) console.warn(`⚠️ Not enough MP: ${myData.state.mp} < 5`)
      if (!isMyTurnByIndex) console.warn(`⚠️ Not your turn by index: turnIndex=${turnIndex}, myIndex=${myIndex}`)
      if (isProcessing) console.warn('⚠️ Already processing action')
    }
  }

  // 立直発動
  const handleRiichi = () => {
    const isMyTurnByIndex = myIndex !== null && turnIndex === myIndex
    if (socket && gameStarted && myData && myData.state.mp >= 3 && isMyTurnByIndex && !isProcessing && !myRiichiState) {
      console.log(`✅ 立直発動: myIndex=${myIndex}, turnIndex=${turnIndex}, MP=${myData.state.mp}, roomId=${currentRoomId}`)
      socket.emit('action_riichi', { roomId: currentRoomId, playerId: myPersistentId })
      setIsProcessing(true)
    } else {
      if (!socket) console.warn('⚠️ Socket not connected')
      if (!gameStarted) console.warn('⚠️ Game not started')
      if (!myData) console.warn('⚠️ MyData not set')
      if (myData && myData.state.mp < 3) console.warn(`⚠️ Not enough MP: ${myData.state.mp} < 3`)
      if (!isMyTurnByIndex) console.warn(`⚠️ Not your turn by index: turnIndex=${turnIndex}, myIndex=${myIndex}`)
      if (isProcessing) console.warn('⚠️ Already processing action')
      if (myRiichiState) console.warn('⚠️ Already in riichi state')
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
              setMyIndex(null)
              setTurnIndex(0)
              setIsMyTurn(false)
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
      <div className={`min-h-screen bg-yellow-50 p-4 transition-all relative ${isShaking ? 'animate-shake' : ''} ${screenShake ? 'scale-110 rotate-3' : ''} ${gameState.shakeTurns > 0 ? 'animate-window-shake' : ''} ${lastAttackGrayscale ? 'filter grayscale' : ''} ${slowMotion ? 'animate-slow-motion' : ''}`}>
        {/* メニューボタン（右上） */}
        <button
          onClick={() => setShowMenu(true)}
          className="fixed top-4 right-4 z-[110] w-12 h-12 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center"
          aria-label="メニュー"
        >
          <span className="text-2xl">⚙️</span>
        </button>

        {/* メニューモーダル */}
        {showMenu && (
          <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center px-4">
            <div className="w-full max-w-sm bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 space-y-4">
              <h3 className="text-2xl font-black text-center mb-4" style={{ WebkitTextStroke: '2px black' }}>メニュー</h3>
              <button
                onClick={() => setShowQuitConfirm(true)}
                className="w-full py-3 bg-red-500 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-red-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-lg"
              >
                🚪 タイトルに戻る（中断）
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="w-full py-3 bg-gray-300 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-200 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-lg"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* 中断確認ダイアログ */}
        {showQuitConfirm && (
          <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center px-4">
            <div className="w-full max-w-sm bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 space-y-4">
              <h3 className="text-xl font-black text-center mb-2" style={{ WebkitTextStroke: '2px black' }}>バトルを中断しますか？</h3>
              <p className="text-sm font-bold text-center text-gray-700 mb-4">
                タイトルに戻っても、5分以内なら復帰できます。
              </p>
              <button
                onClick={handleQuitToTitle}
                className="w-full py-3 bg-red-500 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-red-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-lg"
              >
                はい、中断する
              </button>
              <button
                onClick={() => setShowQuitConfirm(false)}
                className="w-full py-3 bg-blue-500 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-lg"
              >
                いいえ、続ける
              </button>
            </div>
          </div>
        )}

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
          <div 
            className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-black/60 cursor-pointer transition-opacity"
            onClick={() => {
              setYakumanFreeze(false)
              setSkillEffect(null)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setYakumanFreeze(false)
                setSkillEffect(null)
              }
            }}
          >
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

        {/* 【飯テロ】画像表示オーバーレイ */}
        {foodImage && (
          <div 
            className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/80 animate-fade-in cursor-pointer"
            onClick={() => setFoodImage(null)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setFoodImage(null)
              }
            }}
            style={{
              animation: 'fadeIn 0.3s ease-in'
            }}
          >
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img 
                src={foodImage} 
                alt="飯テロ" 
                className="max-w-2xl max-h-2xl object-cover rounded-lg shadow-2xl animate-scale-up"
                style={{
                  animation: 'scaleUp 0.4s ease-out'
                }}
              />
              <div 
                className="absolute inset-0 flex items-center justify-center text-white text-5xl font-black pointer-events-none"
                style={{
                  textShadow: '2px 2px 10px rgba(0, 0, 0, 0.8)',
                  animation: 'fadeOut 0.5s ease-in 2.5s forwards'
                }}
              >
                🤤
              </div>
            </div>
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
              }
              @keyframes scaleUp {
                from { transform: scale(0.8); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </div>
        )}
        
        {/* ホワイトアウトフラッシュ（天和用） */}
        {whiteoutFlash && (
          <div className="pointer-events-none fixed inset-0 z-[85] bg-white animate-pulse" style={{animation: 'whiteout 0.5s ease-out'}} />
        )}
        
        {/* 天和の究極演出 */}
        {tenpaiUltimate && (
          <>
            {/* 黄金の「天和」テキスト */}
            <div className="pointer-events-none absolute inset-0 z-[82] flex items-center justify-center">
              <p 
                className="text-[400px] font-black select-none"
                style={{
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  color: '#FFD700',
                  textShadow: '0 0 60px rgba(255, 215, 0, 0.8), 0 0 120px rgba(255, 215, 0, 0.4)',
                  animation: 'tenpai-appear 1s ease-out'
                }}
              >
                天和
              </p>
            </div>
            
            {/* 麻雀牌の流れアニメーション */}
            {mahjongTiles.map((tile) => (
              <div
                key={tile.id}
                className="pointer-events-none fixed z-[81]"
                style={{
                  left: `${tile.left}%`,
                  top: '-80px',
                  width: '60px',
                  height: '80px',
                  animation: `mahjong-fall 7s linear forwards`,
                  animationDelay: `${tile.id * 0.1}s`,
                  backgroundColor: '#fff',
                  border: '2px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#e74c3c',
                  borderRadius: '4px'
                }}
              >
                🀄
              </div>
            ))}
          </>
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

        {/* PC版：3カラムレイアウト（左：自分、中央：操作＋ログ、右：相手） / スマホ版：縦積み */}
        <div className="w-full max-w-[1400px] mx-auto flex flex-col md:flex-row gap-4 md:gap-6 pb-40 md:pb-0 px-2 md:px-8">
          {/* 左カラム：自分の情報（PC版） / スマホでは下部 */}
          <div className="w-full md:w-[300px] order-3 md:order-1">
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
              {renderZoneDisplay(myData.state.activeZone.type, false)}
            </div>
          </div>

          {/* 中央カラム：バトルフィールド（PC版で幅を広くとる） */}
          <div className="flex-1 order-2 space-y-4">
            {/* ターン状態表示 */}
            <div className="hidden md:block">
              {!(myIndex !== null && turnIndex === myIndex) && (
                <div className="bg-orange-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                  <p className="font-black text-xl animate-pulse">⏳ 相手の行動を待っています...</p>
                </div>
              )}
              {isProcessing && myIndex !== null && turnIndex === myIndex && (
                <div className="bg-blue-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                  <p className="font-black text-xl animate-pulse">⚡ 演出中...</p>
                </div>
              )}
            </div>

            {/* バトルログ */}
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 md:p-6">
              <h3 className="font-black text-sm md:text-xl mb-2 md:mb-4 border-b-4 border-black pb-1 md:pb-2">BATTLE LOG</h3>
              <div className="space-y-1 md:space-y-2 max-h-32 md:max-h-64 overflow-y-auto">
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

            {/* 操作パネル（PC版：横並び / スマホ版：縦積み） */}
            <div className="space-y-3 md:space-y-4">
              {/* 指を振るボタン */}
              <button
                onClick={handleUseSkill}
                disabled={gameState.turnIndex !== myIndex || isAnimating || isProcessing || myIndex === null || myData.state.isRiichi}
                className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-4 md:py-8 font-black text-lg md:text-2xl ${
                  myIndex !== null && turnIndex === myIndex && !isProcessing && !myData.state.isRiichi
                    ? 'bg-pink-500 hover:bg-pink-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {myData.state.isRiichi
                  ? '🀄 立直中...（AUTO）'
                  : myIndex !== null && turnIndex === myIndex && !isProcessing
                    ? (myData.state.isBuffed ? '✨ 指を振る（威力2倍中！）' : '✨ 指を振る')
                    : '相手の行動を待っています...'}
              </button>

              {/* PC版：ゾーン＋立直を横並び */}
              <div className="hidden md:grid md:grid-cols-2 gap-4">
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
                    </div>
                  )}

                  <select
                    value={selectedZoneType}
                    onChange={(e) => setSelectedZoneType(e.target.value as any)}
                    disabled={myIndex === null || turnIndex !== myIndex || isProcessing}
                    className="w-full px-3 py-2 border-2 border-black font-bold text-sm bg-white"
                  >
                    <option value="強攻のゾーン">🔥 強攻のゾーン</option>
                    <option value="集中のゾーン">🎯 集中のゾーン</option>
                    <option value="乱舞のゾーン">🌪️ 乱舞のゾーン</option>
                    <option value="博打のゾーン">🎰 博打のゾーン</option>
                  </select>

                  <button
                    onClick={handleActivateZone}
                    disabled={myIndex === null || turnIndex !== myIndex || isProcessing || myData.state.mp < 5}
                    className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-4 font-black text-lg ${
                      myIndex !== null && turnIndex === myIndex && !isProcessing && myData.state.mp >= 5
                        ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    🌀 ゾーン展開
                    {myIndex !== null && turnIndex === myIndex && !isProcessing && <span className="block text-xs">(MP 5消費)</span>}
                  </button>
                </div>

                {/* 立直ボタン */}
                <div>
                  <button
                    onClick={handleRiichi}
                    disabled={myIndex === null || turnIndex !== myIndex || isProcessing || myData.state.mp < 5 || myRiichiState}
                    className={`w-full h-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-4 font-black text-xl ${
                      myIndex !== null && turnIndex === myIndex && !isProcessing && myData.state.mp >= 5 && !myRiichiState
                        ? 'bg-red-500 hover:bg-red-400 active:scale-90 active:shadow-none animate-pulse'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {myIndex !== null && turnIndex === myIndex && !isProcessing && !myRiichiState
                      ? '🀄 立直'
                      : myRiichiState
                        ? '🀄 立直中...'
                        : '相手の行動を待っています...'}
                    {myIndex !== null && turnIndex === myIndex && !isProcessing && !myRiichiState && (
                      <span className="block text-xs mt-2">(MP 5消費)</span>
                    )}
                  </button>
                </div>
              </div>

              {/* スマホ版の操作ボタンは下部固定エリアに配置 */}
            </div>
          </div>

          {/* 右カラム：相手の情報（PC版） / スマホでは上部 */}
          <div className="w-full md:w-[300px] order-1 md:order-3">
            {/* 相手ステータス */}
            <div className="space-y-2">
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 md:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-black text-xs md:text-sm">OPPONENT {!isMyTurn && '⭐'}</p>
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
        </div>

        {/* スマホ時のボタンエリア（下部固定） */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-yellow-50 border-t-4 border-black space-y-3 max-h-[35vh] overflow-y-auto">
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
              disabled={gameState.turnIndex !== myIndex || isAnimating || isProcessing || myIndex === null || myData.state.isRiichi}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-6 font-black text-lg ${
                myIndex !== null && turnIndex === myIndex && !isProcessing && !myData.state.isRiichi
                  ? 'bg-pink-500 hover:bg-pink-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {myData.state.isRiichi
                ? '🀄 立直中...（AUTO）'
                : myIndex !== null && turnIndex === myIndex && !isProcessing
                  ? (myData.state.isBuffed ? '✨ 指を振る（威力2倍中！）' : '✨ 指を振る')
                  : '相手の行動を待っています...'}
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
                disabled={myIndex === null || turnIndex !== myIndex || isProcessing}
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
              disabled={turnIndex !== myIndex || isProcessing || myData.state.mp < 5 || myIndex === null}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-3 font-black text-sm ${
                myIndex !== null && turnIndex === myIndex && !isProcessing && myData.state.mp >= 5
                  ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {myIndex !== null && turnIndex === myIndex && !isProcessing ? '🌀 ゾーン展開' : '相手の行動を待っています...'}
              {myIndex !== null && turnIndex === myIndex && !isProcessing && <span className="block text-xs">(MP 5消費)</span>}
            </button>

            {/* 立直ボタン */}
            <button
              onClick={handleRiichi}
              disabled={turnIndex !== myIndex || isProcessing || myData.state.mp < 5 || myIndex === null || myRiichiState}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-3 font-black text-sm ${
                myIndex !== null && turnIndex === myIndex && !isProcessing && myData.state.mp >= 5 && !myRiichiState
                  ? 'bg-red-500 hover:bg-red-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0 animate-pulse'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {myIndex !== null && turnIndex === myIndex && !isProcessing && !myRiichiState ? '🀄 立直' : myRiichiState ? '🀄 立直中...' : '相手の行動を待っています...'}
              {myIndex !== null && turnIndex === myIndex && !isProcessing && !myRiichiState && <span className="block text-xs">(MP 5消費)</span>}
            </button>
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
    <div className={`min-h-screen ${myRiichiState || opponentRiichiState ? 'bg-slate-800' : 'bg-yellow-50'} ${showRiichiLightning ? 'animate-pulse' : ''} flex items-center justify-center p-4 relative`}>
      {/* 立直時の稲妻エフェクト */}
      {(myRiichiState || opponentRiichiState) && (
        <>
          <style>{`
            @keyframes lightning {
              0%, 100% { opacity: 0; }
              50% { opacity: 1; }
            }
            .lightning-flash {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) 50%, transparent 100%);
              animation: lightning 0.1s infinite;
              pointer-events: none;
              z-index: 10;
            }
          `}</style>
          <div className="lightning-flash"></div>
        </>
      )}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full relative z-20">
        <h1 className="text-6xl font-black text-center mb-8 -rotate-3">
          YUBIFURU
        </h1>
        
        <div className="space-y-6">
          {isCheckingReconnect ? (
            <div className="text-center py-8">
              <p className="font-black text-xl animate-pulse">接続確認中...</p>
            </div>
          ) : (
            <>
              {canReconnect && (
                <div className="bg-yellow-100 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 mb-4">
                  <p className="font-black text-sm mb-3 text-center">前回のバトルが残っています</p>
                  <button
                    onClick={handleReconnect}
                    className="w-full py-4 bg-green-500 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-green-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-xl"
                  >
                    🔄 前回のバトルに復帰する
                  </button>
                </div>
              )}

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

              {/* 戦績表示 */}
              <div 
                className="bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 text-center"
                style={{
                  WebkitTextStroke: '1px black'
                }}
              >
                <p 
                  className="font-black text-lg"
                  style={{
                    color: currentStreak >= 3 ? '#ff3333' : '#000000',
                    textShadow: currentStreak >= 3 ? '0 0 20px rgba(255, 51, 51, 0.6)' : 'none',
                    animation: currentStreak >= 3 ? 'fire-glow 1.5s ease-in-out infinite' : 'none'
                  }}
                >
                  {currentStreak >= 3 ? '🔥' : ''} 通算：{totalWins}勝 / {currentStreak}連勝中 {currentStreak >= 3 ? '🔥' : ''}
                </p>
              </div>

              <button
                onClick={handleJoin}
                className="w-full py-4 bg-blue-500 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-400 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-xl"
              >
                ⚔️ 新しいバトルを始める
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
