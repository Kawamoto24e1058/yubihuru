import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';

interface BumpMatchingProps {
  socket: Socket | null;
  playerName: string;
  onMatchSuccess: (roomId: string, opponentName: string) => void;
  onBack: () => void;
}

export const BumpMatching: React.FC<BumpMatchingProps> = ({ socket, playerName, onMatchSuccess, onBack }) => {
    // devicemotionイベント用のダミー関数（本来は加速度検知ロジックを実装）
    function handleMotion(event: DeviceMotionEvent) {
      // 加速度データ取得
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const now = Date.now();
      // 三軸合成加速度
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const composite = Math.sqrt(x * x + y * y + z * z);
      // 直前との差分（急激な変化＝衝撃）
      const last = lastAcc.current;
      const diff = Math.abs(composite - Math.sqrt(last.x * last.x + last.y * last.y + last.z * last.z));
      lastAcc.current = { x, y, z, t: now };

      // ノイズ耐性: 一定時間内の最大値をバッファ
      gaugeBuffer.current.push({ t: now, v: diff });
      // avgWindowMsミリ秒より古いデータを除外
      gaugeBuffer.current = gaugeBuffer.current.filter(e => now - e.t <= avgWindowMs);
      const maxInWindow = Math.max(...gaugeBuffer.current.map(e => e.v), 0);

      // ゲージ表示・最大値記録
      setBumpStrength(Math.min((maxInWindow / gaugeMax) * 100, 100));
      setMaxBump(prev => Math.max(prev, maxInWindow));

      // デバッグ用: 最大値を出力
      if (maxInWindow > 0) {
        console.log('合成加速度最大値:', maxInWindow.toFixed(2));
      }

      // 衝撃検知（しきい値超え）
      if (maxInWindow > bumpThreshold && !isWaiting && sensorReady) {
        setIsWaiting(true);
        setStatusText('マッチングリクエスト送信中...');
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 120);
        // サーバーへ送信
        if (socket) {
          socket.emit('bump', {
            timestamp: now,
            strength: maxInWindow,
            playerName,
          });
        }
        // バッファをリセット
        gaugeBuffer.current = [];
      }
    }
  const [bumpStrength, setBumpStrength] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);
  const [statusText, setStatusText] = useState('「マッチングを開始する」ボタンを押してください');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [sensorReady, setSensorReady] = useState(false);
  const [maxBump, setMaxBump] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const animationFrameRef = useRef<number>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpThreshold = 20;
  const gaugeMax = 30.0;
  const lastAcc = useRef<{x: number, y: number, z: number, t: number}>({x:0, y:0, z:0, t:0});
  const gaugeBuffer = useRef<{ t: number; v: number }[]>([]);
  const avgWindowMs = 200;


  // センサー監視開始（iOS許可取得）
  const startSensor = async () => {
    if (typeof DeviceMotionEvent !== 'undefined') {
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const response = await (DeviceMotionEvent as any).requestPermission();
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion as any);
            setSensorReady(true);
            setStatusText('スマホを相手とコツンとぶつけてください');
          } else {
            setPermissionError('モーションセンサーへのアクセスが拒否されました。ブラウザの設定から許可してください。');
          }
        } catch {
          setPermissionError('モーションセンサーへのアクセスに失敗しました。ブラウザの設定を確認してください。');
        }
      } else {
        window.addEventListener('devicemotion', handleMotion as any);
        setSensorReady(true);
        setStatusText('スマホを相手とコツンとぶつけてください');
      }
    }
  };

  // マッチング成功ハンドラー
  useEffect(() => {
    if (!socket) return;
    const handleMatchSuccess = (data: { roomId: string; opponentName: string }) => {
      // 3. タイムアウト前に成功した場合、タイムアウト処理をクリア
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setIsWaiting(false); // 念のため
      setStatusText('✅ マッチング成功！');
      setTimeout(() => {
        onMatchSuccess(data.roomId, data.opponentName);
      }, 500);
    };
    socket.on('match_success', handleMatchSuccess);
    return () => {
      window.removeEventListener('devicemotion', handleMotion as any);
      socket.off('match_success', handleMatchSuccess);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // コンポーネントのアンマウント時にもタイムアウトをクリア
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [socket, onMatchSuccess]);

  // ビジュアライザーの減衰アニメーション
  useEffect(() => {
    const decay = () => {
      setBumpStrength((prev) => Math.max(0, prev - 6)); // 3倍敏感
      animationFrameRef.current = requestAnimationFrame(decay);
    };
    animationFrameRef.current = requestAnimationFrame(decay);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative" style={{ backgroundColor: '#fffdd0' }}>
      {/* 権限エラーダイアログ */}
      {permissionError && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 space-y-4">
            <h2 className="text-2xl font-black text-center" style={{ WebkitTextStroke: '2px black', color: '#ff3333' }}>
              ⚠️ 権限エラー
            </h2>
            <p className="text-center font-bold text-sm leading-relaxed">{permissionError}</p>
            <div className="space-y-2">
              <button
                onClick={() => setPermissionError(null)}
                className="w-full py-3 bg-blue-400 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-300 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black"
              >
                設定を確認
              </button>
              <button
                onClick={onBack}
                className="w-full py-3 bg-gray-300 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-200 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 戻るボタン（左上） */}
      <button
        onClick={onBack}
        className="absolute top-4 left-4 px-4 py-2 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-sm"
      >
        ← 戻る
      </button>

      {/* タイトル */}
      <h1 className="text-4xl font-black mb-8 text-center" style={{ WebkitTextStroke: '2px black', color: 'white' }}>
        スマホをぶつけて
        <br />
        マッチング！
      </h1>

      {/* マッチング開始ボタン（iOSセンサー許可） */}
      {!sensorReady && (
        <button
          className="w-full max-w-md py-6 mb-8 text-2xl font-black bg-yellow-400 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-300 active:scale-95 transition-all"
          onClick={startSensor}
        >
          マッチングを開始する
        </button>
      )}

      {/* 手アイコン（揺れるアニメーション） */}
      <div className="relative mb-12 animate-bounce-horizontal">
        <div className="text-9xl">☝️</div>
      </div>

      {/* ステータステキスト */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 mb-8 max-w-md w-full">
        {isWaiting ? (
          <div className="flex flex-col items-center justify-center min-h-[120px]">
            <p className="text-center font-black text-2xl mb-4 text-blue-700 animate-pulse">{statusText}</p>
            <div className="animate-spin rounded-full h-14 w-14 border-8 border-yellow-400 border-t-transparent mb-2"></div>
            <p className="text-center text-xs text-gray-500">スマホを持ったままお待ちください</p>
          </div>
        ) : (
          <>
            <p className="text-center font-bold text-lg">{statusText}</p>
            {sensorReady && <div className="mt-2 text-center text-xs text-gray-500">センサー許可済み</div>}
          </>
        )}
      </div>

      {/* 衝撃強度ビジュアライザー＋フィードバック */}
      <div className="w-full max-w-md relative">
        {/* 白発光 */}
        {showFlash && <div className="absolute inset-0 z-20 bg-white opacity-70 pointer-events-none animate-flash" style={{ borderRadius: '12px' }} />}
        <p className="text-sm font-bold mb-2 text-center">衝撃の強さ</p>
        <div className="relative h-8 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* 目標ライン（赤い縦線） */}
          <div
            className="absolute top-0 bottom-0 w-1"
            style={{
              left: `${Math.min(100, (bumpThreshold / gaugeMax) * 100)}%`,
              background: 'linear-gradient(to bottom, #ff0000 60%, #ffcc00 100%)',
              zIndex: 2,
              borderRadius: '2px',
              boxShadow: '0 0 8px 2px #ff0000cc',
              transform: 'translateX(-50%)',
            }}
          />
          {/* ゲージ本体 */}
          <div
            className={`h-full transition-all duration-100 ${
              bumpStrength >= 100 ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500' : 'bg-gradient-to-r from-blue-400 via-blue-300 to-blue-200'
            }`}
            style={{ width: `${bumpStrength}%`, zIndex: 1 }}
          />
        </div>
        <p className="text-xs text-center mt-2 font-bold">
          最大値: {maxBump.toFixed(1)} / しきい値: {bumpThreshold}
        </p>
        <p className="text-xs text-center mt-2 font-bold">{bumpStrength > 75 ? '🔥 強い！' : bumpStrength > 40 ? '💪 良い感じ' : '👆 もっと強く！'}</p>
      </div>
      {/* 追加: 目標ラインの説明 */}
      <div className="w-full max-w-md text-xs text-center mt-2 text-red-600 font-bold">
        <span>赤いラインを超えるとマッチングリクエストが送信されます</span>
      </div>
      {/* 追加: スピナー用アニメーション */}
      <style>{`
        @keyframes bounce-horizontal {
          0%,
          100% {
            transform: translateX(-20px) rotate(-10deg);
          }
          50% {
            transform: translateX(20px) rotate(10deg);
          }
        }
        .animate-bounce-horizontal {
          animation: bounce-horizontal 1.5s ease-in-out infinite;
        }
        .animate-pulse {
          animation: pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>

      {/* CSS for bounce animation */}
      <style>{`
        @keyframes bounce-horizontal {
          0%,
          100% {
            transform: translateX(-20px) rotate(-10deg);
          }
          50% {
            transform: translateX(20px) rotate(10deg);
          }
        }
        .animate-bounce-horizontal {
          animation: bounce-horizontal 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
