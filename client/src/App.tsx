import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import type { GameStartData, PlayerData } from './types'

// グローバル変数の型定義
declare global {
  interface Window {
    __gameOverData?: any
    __resultTimeout?: any
  }
}

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
  const [yakumanFreeze, setYakumanFreeze] = useState(false) // 役満フリーズ演出
  const [tenpaiUltimate, setTenpaiUltimate] = useState(false) // 天和の究極演出
  const [whiteoutFlash, setWhiteoutFlash] = useState(false) // ホワイトアウト
  const [mahjongTiles, setMahjongTiles] = useState<Array<{id: number, left: number, emoji?: string, angle?: number, size?: number, duration?: number, delay?: number}>>([]) // 麻雀牌フロー

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
  const [hasActiveGame, setHasActiveGame] = useState(false) // サーバーが進行中ゲーム検知時のフラグ
  const [isYourTurn, setIsYourTurn] = useState(false) // 強制フラグ方式：サーバーから指名された場合のみtrue
  const [isCheckingReconnect, setIsCheckingReconnect] = useState(true)
  const [totalWins, setTotalWins] = useState(0) // 通算勝利数
  const [currentStreak, setCurrentStreak] = useState(0) // 連勝数
  const [currentRoomId, setCurrentRoomId] = useState<string>('') // 🔄 手動同期用：現在のroomId
  const [myPersistentId, setMyPersistentId] = useState<string>('') // 🔴 不変ID方式：サーバーから与えられた固定ID
  
  // 反射・カウンター系演出
  const [showReflectReady, setShowReflectReady] = useState(false) // ミラーコート待機中
  const [showCounterReady, setShowCounterReady] = useState(false) // カウンター待機中
  const [showDestinyBondReady, setShowDestinyBondReady] = useState(false) // 道連れ待機中
  const [showReflectSuccess, setShowReflectSuccess] = useState(false) // 反射成功
  const [showCounterSuccess, setShowCounterSuccess] = useState(false) // カウンター成功
  const [showDestinyBondActivated, setShowDestinyBondActivated] = useState(false) // 道連れ発動

  // 🔄 【手動同期】クライアントからサーバーに同期リクエストを送信
  const requestManualSync = useCallback(() => {
    if (!socket?.id) {
      console.warn('❌ Socket ID not available for sync')
      return
    }
    console.log('🔄 Requesting manual sync from server...')
    socket.emit('request_manual_sync', { roomId: currentRoomId })
  }, [socket, currentRoomId])

  // 🔴 【接続イベント重複防止ガード】connect イベントが複数回実行されることを防ぐ
  const hasConnectedRef = useRef(false)

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
      
      // 🔴 重複防止ガード：既に connect イベントを実行済みなら skip
      if (hasConnectedRef.current) {
        console.warn('⚠️ connect event already handled, skipping...')
        return
      }
      hasConnectedRef.current = true
      
      // 初回接続時は再接続可否のチェックのみ（自動復帰はしない）
      const savedId = localStorage.getItem('yubihuru_player_id')
      if (savedId && !gameStarted) {
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
    newSocket.on('can_reconnect', (data: { canReconnect: boolean; hasActiveGame: boolean }) => {
      console.log('Reconnect check response:', data)
      setHasActiveGame(data.hasActiveGame)
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
      setIsProcessing(false) // 演出中フラグを強制リセット
      
      // すべての演出フラグをリセット
      setDamageFlash(false)
      setHealFlash(false)
      setPoisonFlash(false)
      setShieldEffect(false)
      setSpecialVictoryText(null)
      setVictoryResult(null)
      setOpponentInkEffect(false)
      setOpponentShakeEffect(false)
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

      const mySocketId = newSocket.id || ''
      const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
      const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1

      setMyData(me)
      setOpponentData(opponent)
      setCurrentTurnId(data.gameState.currentTurnPlayerId)
      console.log('✅ Reconnect: Current turn set to:', data.gameState.currentTurnPlayerId)
      setLogs(prev => [`🔁 再接続しました`, ...prev].slice(0, 10))
    })

    newSocket.on('reconnect_failed', (data: any) => {
      console.warn('Reconnect failed', data)
      setLogs(prev => [`❌ 再接続に失敗しました`, ...prev].slice(0, 10))
      setHasActiveGame(false)
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
      setOpponentShakeEffect(false)
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
      setIsProcessing(false) // 演出中フラグを強制リセット
      
      // プレイヤーデータを設定（重要：これがないとホーム画面に戻る）
      const mySocketId = newSocket.id || ''
      const me = data.player1.socketId === mySocketId ? data.player1 : data.player2
      const opponent = data.player1.socketId === mySocketId ? data.player2 : data.player1
      
      // 🔴 【不変ID方式】サーバーから送られた playerId を永続ID として保存
      const persistentId = me.playerId || ''
      setMyPersistentId(persistentId)
      if (persistentId) {
        localStorage.setItem('yubihuru_my_player_id', persistentId)
        console.log(`🔴 My Persistent ID set: ${persistentId}`)
      } else {
        console.warn('⚠️ playerId is empty!')
      }
      
      setMyData(me)
      setOpponentData(opponent)
      
      // ターンIDを設定（重要：初回ターンプレイヤーを把握）
      if (data.currentTurnPlayerId) {
        setCurrentTurnId(data.currentTurnPlayerId)
        console.log('✅ Current turn set to:', data.currentTurnPlayerId)
      }
      
      setLogs([`⚔️ バトル開始！ vs ${opponent.username}`])
    })

    // マッチング成立直後：100msディレイ後に画面遷移 + gameState強制セット
    newSocket.on('match_found', (data: any) => {
      console.log('Match found confirmation:', data)
      
      // 🔄 手動同期用にroomIdを保存
      setCurrentRoomId(data.roomId)
      
      // 【強制フラグ方式】サーバーから指名された「isYourTurn」フラグを設定
      setIsYourTurn(data.isYourTurn || false);
      if (data.isYourTurn) {
        console.log(`✅ あなたのターンです！(${data.yourOpponent}と対戦)`);
      } else {
        console.log(`⏳ 相手のターンです。待ってください...(${data.yourOpponent}と対戦)`);
      }
      
      // 【強制描画】ディレイなしで即座にbattle画面へ遷移（通信揺らぎ対策）
      setIsWaiting(false)
      setGameStarted(true)
      
      // マッチング成立時、全ての演出フラグを強制的にリセット
      setIsProcessing(false)
      resetAllEffects()
      
      setWinner(null)
      setIsGameOver(false)
      
      // battle_ready を送信してサーバーに準備完了を通知
      newSocket.emit('battle_ready', { roomId: data.roomId })
      console.log('✅ battle_ready sent to server')
    })

    // 【握手プロセス】サーバーから300msおきに送られてくるgameStateを同期
    newSocket.on('game_state_sync', (data: any) => {
      console.log('🤝 game_state_sync received:', data)
      
      // 🔄 手動同期用にroomIdを保存
      if (data.gameState?.roomId) {
        setCurrentRoomId(data.gameState.roomId)
      }
      
      // 最新のgameStateをクライアント側に反映
      if (data.gameState) {
        const mySocketId = newSocket.id || ''
        const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
        const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
        
        setMyData(me)
        setOpponentData(opponent)
        
        // ターンIDを上書き保証
        if (data.currentTurnPlayerId) {
          setCurrentTurnId(data.currentTurnPlayerId)
          console.log('✅ Turn ID synced:', data.currentTurnPlayerId)
        }
        
        // 🔴 不変ID方式：currentTurnPlayerId と myPersistentId を比較
        const isMyTurn = data.currentTurnPlayerId === myPersistentId
        setIsYourTurn(isMyTurn)
        console.log(`📍 Current Turn: ${data.currentTurnPlayerId} | My ID: ${myPersistentId} | Match: ${isMyTurn ? '✅ YES' : '❌ NO'}`)
        
        // ボタンロック防止：演出中フラグをリセット
        setIsProcessing(false)
      }
      
      // battle_ready を必ず送信（冗長性）
      newSocket.emit('battle_ready', { roomId: data.gameState?.roomId })
    })

    // 強制同期：サーバーから最新バトルデータを受け取る（スマホ救済）
    newSocket.on('battle_sync', (data: any) => {
      console.log('Battle sync received:', data)
      setIsWaiting(false)
      setGameStarted(true)
      setIsGameOver(false)
      setWinner(null)
      
      const mySocketId = newSocket.id || ''
      const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
      const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
      
      setMyData(me)
      setOpponentData(opponent)
      setCurrentTurnId(data.gameState.currentTurnPlayerId)
      setLogs(prev => [`🔄 バトル画面に同期しました`, ...prev].slice(0, 10))
    })

    newSocket.on('battle_update', (data: any) => {
      console.log('Battle update:', data)
      setLogs(prev => [data.message, ...prev].slice(0, 10))
      
      // 役満フリーズ演出（国士無双・九蓮宝燈）
      if (data.skillEffect === 'yakuman-freeze') {
        setYakumanFreeze(true)
        // 九蓮宝燈は特別な長い演出時間
        const freezeDuration = data.skillName === '九蓮宝燈' ? 5000 : 3000
        setTimeout(() => {
          setYakumanFreeze(false)
        }, freezeDuration)
        // セーフティ：5秒後に強制リセット
        setTimeout(() => {
          resetAllEffects()
        }, 5000)
      }
      
      // 天和の究極演出
      if (data.skillEffect === 'tenpai-ultimate') {
        setWhiteoutFlash(true)
        // ホワイトアウト：3秒間
        setTimeout(() => setWhiteoutFlash(false), 3000)
        
        // 0.5秒後に天和テキスト表示開始
        setTimeout(() => {
          setTenpaiUltimate(true)
          // 麻雀牌アニメーション生成（種類豊富＆密度UP）
          const mahjongEmojis = [
            // 字牌（7種）
            '🀄', '🀅', '🀆', '🀀', '🀁', '🀂', '🀃',
            // 萬子（9種）
            '🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏',
            // 筒子（9種）
            '🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡',
            // 索子（9種）
            '🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'
          ]
          
          const tiles = Array.from({ length: 40 }, (_, i) => {
            const randomEmoji = mahjongEmojis[Math.floor(Math.random() * mahjongEmojis.length)]
            const randomAngle = Math.random() * 360
            const randomSize = 0.6 + Math.random() * 0.7 // 0.6倍～1.3倍
            const randomDuration = 6 + Math.random() * 3 // 6～9秒でランダムな落下速度
            const randomDelay = Math.random() * 0.5 // 0～0.5秒のランダムな開始遅延
            
            return {
              id: i,
              left: Math.random() * 100,
              emoji: randomEmoji,
              angle: randomAngle,
              size: randomSize,
              duration: randomDuration,
              delay: randomDelay
            }
          })
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
        
        // セーフティ：9秒後に強制リセット
        setTimeout(() => {
          resetAllEffects()
        }, 9000)
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
        // セーフティ：3秒後に強制リセット
        setTimeout(() => {
          resetAllEffects()
        }, 3000)
      } else if (data.message && data.message.includes('役満')) {
        setSpecialVictoryText('役満')
        // セーフティ：3秒後に強制リセット
        setTimeout(() => {
          setSpecialVictoryText(null)
        }, 3000)
      }
      
      // 【反射・カウンター系演出】
      if (data.skillEffect === 'reflect-ready') {
        setShowReflectReady(true)
      } else if (data.skillEffect === 'counter-ready') {
        setShowCounterReady(true)
      } else if (data.skillEffect === 'destiny-bond-ready') {
        setShowDestinyBondReady(true)
      } else if (data.skillEffect === 'reflect-success') {
        setShowReflectReady(false)
        setShowReflectSuccess(true)
        setTimeout(() => setShowReflectSuccess(false), 2000)
      } else if (data.skillEffect === 'counter-success') {
        setShowCounterReady(false)
        setShowCounterSuccess(true)
        setTimeout(() => setShowCounterSuccess(false), 2000)
      } else if (data.skillEffect === 'destiny-bond-activated') {
        setShowDestinyBondReady(false)
        setShowDestinyBondActivated(true)
        setTimeout(() => setShowDestinyBondActivated(false), 3000)
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
          
          // Phase 1: スローモーション演出を即座に開始
          setSlowMotion(true)
          setLastAttackGrayscale(true)
          setShowImpact(true) // 技名表示
          setImpactText(data.skillName || '技')
          
          // Phase 2: 0.8秒後に画面フラッシュ＋FINISH表示
          setTimeout(() => {
            console.log('🎬 0.8秒経過 - FINISH！');
            setLastAttackFlash(true)
            setShowFinishText(true)
            
            // Phase 3: 1.5秒後にHPを最終反映
            setTimeout(() => {
              console.log('🎬 1.5秒経過 - HP最終反映');
              setShouldApplyFinalDamage(true)
              setSlowMotion(false) // スロー終了
              
              // Phase 4: 1.2秒後にWINNER表示＆演出完全終了＋リザルト画面遷移
              setTimeout(() => {
                console.log('🎬 WINNER表示＆演出完了');
                setVictoryResult('WINNER')
                setLastAttackGrayscale(false)
                setLastAttackFlash(false)
                setShowImpact(false)
                setShowFinishText(false)
                
                // game_overデータが到着済みの場合は handleBattleEnd を呼び出し
                if ((window as any).__gameOverData) {
                  console.log('🎬 Game over data available - transitioning to result')
                  handleBattleEnd((window as any).__gameOverData)
                }
              }, 1200)
            }, 1500)
          }, 800)
          
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

    // 強制ターン開始：サーバーから強制的にターンを割り当てる（2秒タイムアウト対策）
    newSocket.on('force_turn_start', (data: any) => {
      console.log('🚨 Force turn start received:', data)
      // 🔴 不変ID方式：currentTurnPlayerId と myPersistentId を比較
      const isMyTurn = data.currentTurnPlayerId === myPersistentId
      setIsYourTurn(isMyTurn)
      setIsProcessing(false)
      resetAllEffects()
      console.log(`✅ Force turn enabled: isYourTurn=${isMyTurn}, currentTurnId=${data.currentTurnPlayerId}, myId=${myPersistentId}`)
    })
    newSocket.on('turn_change', (data: any) => {
      // 【ボタンロック強制解放】新しいターン開始時に全演出をリセット
      resetAllEffects()
      
      // 演出によるボタンロックを強制解除
      setIsProcessing(false)
      
      // ターンIDを再判定・更新
      setCurrentTurnId(data.currentTurnPlayerId)
      
      // 🔴 不変ID方式：currentTurnPlayerId と myPersistentId を比較
      const isMyTurn = data.currentTurnPlayerId === myPersistentId
      setIsYourTurn(isMyTurn)
      console.log(`🔴 Turn check: currentTurn=${data.currentTurnPlayerId}, myId=${myPersistentId}, isMyTurn=${isMyTurn}`)
      
      // gameState が送られてきた場合、プレイヤーデータも更新
      if (data.gameState) {
        const mySocketId = newSocket.id || ''
        const me = data.gameState.player1.socketId === mySocketId ? data.gameState.player1 : data.gameState.player2
        const opponent = data.gameState.player1.socketId === mySocketId ? data.gameState.player2 : data.gameState.player1
        
        setMyData(me)
        setOpponentData(opponent)
        console.log('✅ GameState updated from turn_change event')
      }
      
      // リマインド送信の場合、ログに表示
      const logMessage = data.isReminder 
        ? `🔄 【リマインド】${data.currentTurnPlayerName}のターンです！`
        : `🔄 ${data.currentTurnPlayerName}のターン`
      
      console.log(`${logMessage} (ID: ${data.currentTurnPlayerId})`)
      setLogs(prev => [logMessage, ...prev].slice(0, 10))
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
      
      // ガード：ゲーム中でない場合は無視（マッチング直後の誤動作防止）
      if (!gameStarted) {
        console.warn('Ignoring game_over event: game not started')
        return
      }
      
      // すぐには結果を表示せず、演出完了を待つ
      console.log('⏳ Waiting for battle end effects to complete...')
      
      // 演出完了後のリザルト画面遷移を5秒後に強制実行（セーフティネット）
      const resultTimeout = setTimeout(() => {
        console.log('🏆 Force transitioning to result screen (timeout)')
        handleBattleEnd(data)
      }, 5000)
      
      // 実際の演出完了時（FINISH表示後）にここで遷移
      // handleBattleEnd 関数で適切なタイミングで呼ぶ
      window.__gameOverData = data
      window.__resultTimeout = resultTimeout
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [gameStarted])

  // 待機中に1秒ごとにステータスをチェック（スマホ救済）
  useEffect(() => {
    if (!socket || !isWaiting || gameStarted) return
    
    console.log('Starting status check interval (waiting for match)...')
    const intervalId = setInterval(() => {
      console.log('Sending check_status...')
      socket.emit('check_status', { timestamp: Date.now() })
    }, 1000)
    
    return () => {
      console.log('Clearing status check interval')
      clearInterval(intervalId)
    }
  }, [socket, isWaiting, gameStarted])

  // 全演出フラグをリセットする関数（スマホ救済）
  const resetAllEffects = () => {
    console.log('🧹 Resetting all effects...')
    setDamageFlash(false)
    setHealFlash(false)
    setPoisonFlash(false)
    setShieldEffect(false)
    setShowImpact(false)
    setShowFinishText(false)
    setYakumanFreeze(false)
    setTenpaiUltimate(false)
    setWhiteoutFlash(false)
    setMahjongTiles([])
    setLastAttackGrayscale(false)
    setLastAttackFlash(false)
    setFatalFlash(false)
    setFatalWarning(false)
    setGlassBreak(false)
    setSlowMotion(false)
    setBuffedDamage(null)
    setScreenShake(false)
    setOpponentInkEffect(false)
    setOpponentShakeEffect(false)
    setInkSplashes([])
    setSpecialVictoryText(null)
    setZoneBanner(null)
    // 反射・カウンター系
    setShowReflectReady(false)
    setShowCounterReady(false)
    setShowDestinyBondReady(false)
    setShowReflectSuccess(false)
    setShowCounterSuccess(false)
    setShowDestinyBondActivated(false)
  }

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
    setCurrentTurnId('')
    // バトルから戻る際、保存されたユーザー名を復元
    const savedName = localStorage.getItem('yubihuru_user_name')
    if (savedName) {
      setName(savedName)
    }
    setIsProcessing(false)
    // IDは残す（再接続可能にする）
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

  // バトル終了演出処理
  const handleBattleEnd = (gameOverData: any) => {
    console.log('🎬 handleBattleEnd called')
    
    // タイムアウトをクリア
    if ((window as any).__resultTimeout) {
      clearTimeout((window as any).__resultTimeout)
    }
    
    // 1. ボタン即座に無効化
    setIsProcessing(true)
    
    // 2. 操作ボタン非表示状態を設定（isProcessingで隠れるはず）
    
    // 3. FINISH演出を2秒間表示中（既に showFinishText で表示済み）
    
    // 4. 演出完了後、リザルト画面へ遷移（ここで全演出フラグをリセット）
    setTimeout(() => {
      console.log('🏆 Showing result screen')
      
      // すべての演出フラグをリセット
      resetAllEffects()
      
      // 戦績情報の更新
      const mySocketId = socket?.id || ''
      const me = gameOverData.gameState.player1.socketId === mySocketId ? gameOverData.gameState.player1 : gameOverData.gameState.player2
      const isWinner = me.username === gameOverData.winner || (gameOverData.isDraw && true)
      
      setIsGameOver(true)
      setWinner(gameOverData.winner)
      setVictoryResult(gameOverData.isDraw ? null : (isWinner ? 'WINNER' : 'LOSER'))
      
      // 戦績を更新・保存
      if (isWinner && !gameOverData.isDraw) {
        const newTotalWins = totalWins + 1
        const newStreak = currentStreak + 1
        setTotalWins(newTotalWins)
        setCurrentStreak(newStreak)
        localStorage.setItem('yubihuru_total_wins', newTotalWins.toString())
        localStorage.setItem('yubihuru_current_streak', newStreak.toString())
      } else if (!isWinner) {
        setCurrentStreak(0)
        localStorage.setItem('yubihuru_current_streak', '0')
      }
      
      // バトル終了処理：セッションキャッシュと復帰情報を削除
      localStorage.removeItem('yubihuru_active_battle')
      setHasActiveGame(false) // 復帰ボタンを非表示に
      
      console.log('✅ Result screen ready')
    }, 2500) // FINISH表示後に遷移
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
    // 🔄 新方式：isYourTurn はサーバーから直接指名されたフラグを使用
    // const mySocketId = socket?.id || ''  // ❌ 旧方式（削除）
    // const isMyTurn = mySocketId === currentTurnId  // ❌ 旧方式（削除）
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

    // 演出が表示されているかを判定
    const isEffectPlaying = yakumanFreeze || tenpaiUltimate || whiteoutFlash || 
                           specialVictoryText !== null || fatalFlash || glassBreak
    
    // 画面タップで演出スキップ（緊急リセット）
    const handleEmergencyReset = () => {
      if (isEffectPlaying) {
        console.log('⚠️ Emergency reset triggered by tap')
        resetAllEffects()
      }
    }

    return (
      <div 
        className={`w-screen h-screen bg-yellow-50 transition-all relative overflow-hidden flex flex-col ${isShaking ? 'animate-shake' : ''} ${screenShake ? 'scale-110 rotate-3' : ''} ${opponentShakeEffect ? 'animate-window-shake' : ''} ${lastAttackGrayscale ? 'filter grayscale' : ''} ${slowMotion ? 'animate-slow-motion' : ''}`}
        onClick={handleEmergencyReset}
      >
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

        {/* === z-index レイアーの整理 === */}
        {/* z-0: ゲーム画面（ベース） */}
        {/* z-[60-80]: ゲーム内演出（バフダメージ、役満など） */}
        {/* z-[90-100]: 決着演出（FINISH、道連れ） */}
        {/* z-[110-130]: モーダル・メニュー */}

        {/* バフ付きダメージ表示（3倍サイズ）z-[60] */}
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
          <div className="pointer-events-none absolute inset-0 z-[90] bg-white opacity-0 animate-last-attack-flash animate-inverse-flash" />
        )}
        
        {/* フィニッシュテキスト表示 */}
        {showFinishText && (
          <div className="pointer-events-none absolute inset-0 z-[92] flex items-center justify-center">
            <p 
              className="text-[250px] font-black select-none"
              style={{
                WebkitTextStroke: '8px black',
                fontWeight: 900,
                color: '#FF0000',
                animation: 'finish-glow 0.6s ease-out'
              }}
            >
              FINISH!!
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
        
        {/* 反射待機中（ミラーコート）：六角形バリア */}
        {(showReflectReady || (myData?.state.isReflecting)) && (
          <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center">
            <div 
              className="w-80 h-80 border-8 border-cyan-400 animate-pulse"
              style={{
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                boxShadow: '0 0 40px rgba(34, 211, 238, 0.6), inset 0 0 40px rgba(34, 211, 238, 0.3)',
              }}
            />
          </div>
        )}
        
        {/* カウンター待機中：回転するバリア */}
        {(showCounterReady || (myData?.state.isCounter)) && (
          <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center">
            <div 
              className="w-80 h-80 border-8 border-orange-500"
              style={{
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                boxShadow: '0 0 40px rgba(249, 115, 22, 0.6), inset 0 0 40px rgba(249, 115, 22, 0.3)',
                animation: 'spin 2s linear infinite'
              }}
            />
          </div>
        )}
        
        {/* 道連れ待機中：紫の呪いオーラ */}
        {(showDestinyBondReady || (myData?.state.isDestinyBond)) && (
          <div className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center">
            <div 
              className="w-full h-full border-8 border-purple-700 animate-pulse"
              style={{
                boxShadow: '0 0 60px rgba(126, 34, 206, 0.8), inset 0 0 60px rgba(126, 34, 206, 0.4)',
              }}
            />
          </div>
        )}
        
        {/* 反射成功演出 */}
        {showReflectSuccess && (
          <div className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center bg-cyan-500/30">
            <p 
              className="text-[200px] font-black select-none animate-bounce"
              style={{
                WebkitTextStroke: '8px black',
                fontWeight: 900,
                color: '#22D3EE'
              }}
            >
              REFLECT!!
            </p>
          </div>
        )}
        
        {/* カウンター成功演出 */}
        {showCounterSuccess && (
          <div className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center bg-orange-500/30">
            <p 
              className="text-[200px] font-black select-none animate-bounce"
              style={{
                WebkitTextStroke: '8px black',
                fontWeight: 900,
                color: '#F97316'
              }}
            >
              COUNTER!!
            </p>
          </div>
        )}
        
        {/* 道連れ発動演出 */}
        {showDestinyBondActivated && (
          <div className="pointer-events-none absolute inset-0 z-[95] flex items-center justify-center bg-black/80"
            style={{filter: 'sepia(60%)'}}>
            <p 
              className="text-[250px] font-black select-none"
              style={{
                WebkitTextStroke: '8px black',
                fontWeight: 900,
                color: '#7E22CE',
                animation: 'pulse 1s ease-in-out infinite'
              }}
            >
              道連れ
            </p>
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
                  width: `${60 * (tile.size || 1)}px`,
                  height: `${80 * (tile.size || 1)}px`,
                  animation: `mahjong-fall ${tile.duration || 7}s linear forwards`,
                  animationDelay: `${(tile.delay || 0) + (tile.id * 0.08)}s`,
                  backgroundColor: '#fff',
                  border: '2px solid #333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${20 * (tile.size || 1)}px`,
                  fontWeight: 'bold',
                  color: '#e74c3c',
                  borderRadius: '4px',
                  transform: `rotate(${tile.angle || 0}deg)`,
                  opacity: 0.9
                }}
              >
                {tile.emoji || '🀄'}
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

        {/* PC版レイアウト：フレックスボックス（上・中・下） */}
        {(() => {
          if (!myData || !opponentData) return null
          
          // 🔄 新方式：isYourTurn はサーバーから直接指名されたフラグを使用
          // const mySocketId = socket?.id || ''  // ❌ 旧方式（削除）
          // const isMyTurn = mySocketId === currentTurnId  // ❌ 旧方式（削除）
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
            <div className="relative hidden md:flex flex-col justify-between w-full h-full">
              
              {/* 🔄 【デバッグ用】手動同期ボタン */}
              <button
                onClick={() => requestManualSync()}
                className="fixed top-2 right-2 z-50 px-3 py-1 text-xs bg-cyan-300 border-2 border-black font-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-cyan-200 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                🔄 同期
              </button>

          <div className="p-4 border-b-4 border-black bg-yellow-50">
            <div className="w-full">
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-black text-sm">🎮 OPPONENT</p>
                  {opponentData.state.status.poison && (
                    <span className="bg-purple-600 text-white text-xs font-black px-2 py-1 rounded">☠️ 毒</span>
                  )}
                  {opponentData.state.isRiichi && (
                    <span className="bg-red-600 text-white text-xs font-black px-2 py-1 rounded animate-pulse">🀄 立直</span>
                  )}
                </div>
                <p className="font-black text-xl mb-2">{opponentData.username}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>HP</span>
                      <span>{opponentData.state.hp}/{opponentData.state.maxHp}</span>
                    </div>
                    <div className="h-4 border-2 border-black bg-gray-200">
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
                    <div className="h-4 border-2 border-black bg-gray-200">
                      <div 
                        className="h-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${opponentMpPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== 中央：バトルログ＆演出 ===== */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 h-full">
              <h3 className="font-black text-xl mb-4 border-b-4 border-black pb-2">BATTLE LOG</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-gray-400 font-bold text-sm">待機中...</p>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className={`font-bold text-sm py-1 border-b-2 border-gray-200 ${getLogColor(log)}`}>
                      {renderLogWithRainbow(log)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ===== 下部：自分情報＋ボタン ===== */}
          <div className="p-4 border-t-4 border-black bg-yellow-50">
            <div className="space-y-3">
              {/* 自分ステータス */}
              <div className={`bg-white border-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 transition-all ${
                `${myZoneBorder} ${isYourTurn ? 'animate-pulse' : ''}`
              } ${isShaking ? 'animate-shake' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm">⚔️ YOU {isYourTurn && '⭐'}</p>
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
                <p className="font-black text-xl mb-2">{myData.username}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>HP</span>
                      <span>{myData.state.hp}/{myData.state.maxHp}</span>
                    </div>
                    <div className="h-4 border-2 border-black bg-gray-200">
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
                    <div className="h-4 border-2 border-black bg-gray-200">
                      <div 
                        className="h-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${myMpPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ボタン行 */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={handleUseSkill}
                  disabled={!isYourTurn}
                  className={`py-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-black text-lg ${
                    isYourTurn
                      ? 'bg-red-500 hover:bg-red-400'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  {!isYourTurn ? '⏳ 待機' : '👆 指を振る'}
                </button>

                <button
                  onClick={handleActivateZone}
                  disabled={!isYourTurn || myData.state.mp < 5}
                  className={`py-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-black text-lg ${
                    isYourTurn && myData.state.mp >= 5
                      ? 'bg-purple-500 hover:bg-purple-400'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  {!isYourTurn ? '待機' : isProcessing ? '中...' : '🌀 立直'}
                </button>

                <button
                  onClick={() => setShowMenu(true)}
                  className="py-4 bg-blue-500 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-400 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-black text-lg"
                >
                  ⚙️ メニュー
                </button>
              </div>
            </div>
          </div>
            </div>
          );
        })()} 

        {/* スマホ版レイアウト（元の3カラム） */}
        <div className="md:hidden flex flex-col gap-2 p-4 pb-40 w-full mx-auto space-y-2">
          {/* 相手側（スマホ時は上部、PC時は左） */}
          <div className="w-full order-1">
            {/* 相手ステータス */}
            <div className="space-y-2">
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-3 md:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-black text-xs md:text-sm">OPPONENT</p>
                  {opponentData?.state.status.poison && (
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
                `${myZoneBorder} ${isYourTurn ? 'animate-pulse' : ''}`
              } ${isShaking ? 'animate-shake' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-black text-xs md:text-sm">YOU {isYourTurn && '⭐'}</p>
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
            {!isYourTurn && (
              <div className="bg-orange-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-2 text-center">
                <p className="font-black text-sm animate-pulse">⏳ 相手の行動を待っています...</p>
              </div>
            )}
            {isProcessing && isYourTurn && (
              <div className="bg-blue-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-2 text-center">
                <p className="font-black text-sm animate-pulse">⚡ 演出中...</p>
              </div>
            )}

            {/* 指を振るボタン */}
            <button
              onClick={handleUseSkill}
              disabled={!isYourTurn}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-6 font-black text-lg ${
                isYourTurn
                  ? 'bg-pink-500 hover:bg-pink-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {!isYourTurn ? '相手の行動を待っています...' : (myData.state.isBuffed ? '✨ 指を振る（威力2倍中！）' : '✨ 指を振る')}
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
                disabled={!isYourTurn}
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
              disabled={!isYourTurn || myData.state.mp < 5}
              className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-3 font-black text-sm ${
                isYourTurn && myData.state.mp >= 5
                  ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {!isYourTurn ? '相手の行動を待っています...' : '🌀 ゾーン展開'}
              {isYourTurn && <span className="block text-xs">(MP 5消費)</span>}
            </button>
          </div>

          {/* PC版：下部アクション */}
          <div className="hidden md:block space-y-4">
            {/* ターン表示 */}
            {!isYourTurn && (
              <div className="bg-orange-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                <p className="font-black text-xl animate-pulse">⏳ 相手の行動を待っています...</p>
              </div>
            )}
            {isProcessing && isYourTurn && (
              <div className="bg-blue-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 text-center">
                <p className="font-black text-xl animate-pulse">⚡ 演出中...</p>
              </div>
            )}

            {/* PC版：2列グリッド */}
            <div className="grid grid-cols-2 gap-4">
              {/* 指を振るボタン */}
              <button
                onClick={handleUseSkill}
                disabled={!isYourTurn}
                className={`border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-8 font-black text-2xl ${
                  isYourTurn
                    ? 'bg-pink-500 hover:bg-pink-400 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {!isYourTurn ? '相手の行動を待っています...' : (myData.state.isBuffed ? '✨ 指を振る（威力2倍中！）' : '✨ 指を振る')}
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
                  disabled={!isYourTurn}
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
                    disabled={!isYourTurn || myData.state.mp < 5}
                    className={`w-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all py-4 font-black text-lg ${
                      isYourTurn && myData.state.mp >= 5
                        ? 'bg-purple-400 hover:bg-purple-300 active:scale-90 active:shadow-none active:translate-x-0 active:translate-y-0'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {!isYourTurn ? '相手の行動を待っています...' : '🌀 ゾーン展開'}
                    {isYourTurn && <span className="block text-xs">(MP 5消費)</span>}
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full">
        {/* タイトルロゴ */}
        <div className="text-center mb-8 animate-logo">
          <div className="text-5xl font-black mb-2" style={{
            background: 'linear-gradient(90deg, #ffff00, #ff69b4, #00bfff, #ffff00)',
            backgroundSize: '300% 100%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            WebkitTextStroke: '2px black',
            fontWeight: 900,
            animation: 'gradient-shift 3s ease-in-out infinite'
          }}>
            指振博徒
          </div>
          <p className="text-sm font-black text-gray-700 tracking-widest">
            - YUBIFURU -
          </p>
        </div>
        
        <div className="space-y-6">
          {isCheckingReconnect ? (
            <div className="text-center py-8">
              <p className="font-black text-xl animate-pulse">接続確認中...</p>
            </div>
          ) : (
            <>
              {hasActiveGame && (
                <div className="bg-yellow-100 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 mb-4">
                  <p className="font-black text-sm mb-3 text-center">前回のバトルが残っています</p>
                  <button
                    onClick={handleReconnect}
                    className="w-full py-3 bg-cyan-400 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:bg-cyan-300 active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-black text-lg"
                  >
                    🔄 前回の続きから復帰
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
                className={`border-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 text-center font-black text-lg ${
                  currentStreak >= 3 
                    ? 'bg-red-100 border-red-500 animate-fire-glow'
                    : 'bg-white border-black'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {currentStreak >= 3 && <span className="text-2xl">🔥</span>}
                  <span>通算：{totalWins}勝 / {currentStreak}連勝中</span>
                  {currentStreak >= 3 && <span className="text-2xl">🔥</span>}
                </div>
              </div>

              <button
                onClick={handleJoin}
                className="w-full py-6 bg-lime-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-lime-300 active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-black text-2xl"
              >
                ⚔️ BATTLE START
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
