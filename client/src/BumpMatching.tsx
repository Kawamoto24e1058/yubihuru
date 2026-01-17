import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';

interface BumpMatchingProps {
  socket: Socket | null;
  playerName: string;
  onMatchSuccess: (roomId: string, opponentName: string) => void;
  onBack: () => void;
}

export const BumpMatching: React.FC<BumpMatchingProps> = ({ socket, playerName, onMatchSuccess, onBack }) => {
  const [bumpStrength, setBumpStrength] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);
  const [statusText, setStatusText] = useState('「マッチングを開始する」ボタンを押してください');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [sensorReady, setSensorReady] = useState(false);
  const [maxBump, setMaxBump] = useState(0);
  const lastTotalRef = useRef(9.8);
  const isCoolingDownRef = useRef(false);
  const animationFrameRef = useRef<number>();
  // 超高感度設定
  const bumpThreshold = 3.0;
  const gaugeMax = 10.0;
  // 0.2秒間の平均値用バッファ
  const avgBuffer = useRef<{ t: number; v: number }[]>([]);
  const avgWindowMs = 200;
  const lastBumpTimeRef = useRef(0);

  // 衝撃検知ハンドラー
  const handleMotion = (event: DeviceMotionEvent) => {
    // iPhone: acceleration + accelerationIncludingGravity の両方を合算
    let accX = 0, accY = 0, accZ = 0;
    if (event.accelerationIncludingGravity) {
      accX += event.accelerationIncludingGravity.x ?? 0;
      accY += event.accelerationIncludingGravity.y ?? 0;
      accZ += event.accelerationIncludingGravity.z ?? 0;
    }
    if (event.acceleration) {
      accX += event.acceleration.x ?? 0;
      accY += event.acceleration.y ?? 0;
      accZ += event.acceleration.z ?? 0;
    }
    const currentTotal = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
    const delta = Math.abs(currentTotal - lastTotalRef.current);
    const boostedDelta = delta * 5;
    // ゲージ表示（満タン=10）
    setBumpStrength(Math.min(100, (boostedDelta / gaugeMax) * 100));
    setMaxBump(prev => Math.max(prev, boostedDelta));
    // 0.2秒間の平均値バッファ
    const now = Date.now();
    avgBuffer.current.push({ t: now, v: boostedDelta });
    // バッファから0.2秒より古い値を除去
    avgBuffer.current = avgBuffer.current.filter(e => now - e.t <= avgWindowMs);
    const avg = avgBuffer.current.length > 0 ? avgBuffer.current.reduce((a, b) => a + b.v, 0) / avgBuffer.current.length : 0;
    // 判定（ピーク or 平均）
    if (!isCoolingDownRef.current && (
      boostedDelta > bumpThreshold || avg > 2.0
    )) {
      if (now - lastBumpTimeRef.current > 300) { // 連続誤爆防止
        if ('vibrate' in navigator) navigator.vibrate(50);
        onBumpDetected();
        startCoolDown();
        lastBumpTimeRef.current = now;
      }
    }
    lastTotalRef.current = currentTotal;
  };

  const onBumpDetected = () => {
    setStatusText('🔍 近くの相手を探しています...');
    setIsWaiting(true);
    if (!socket) return;
    // 位置情報取得
    let sent = false;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (sent) return;
          sent = true;
          const { latitude: lat, longitude: lng } = position.coords;
          socket.emit('bump_attempt', {
            username: playerName,
            timestamp: Date.now(),
            lat,
            lng,
          });
        },
        (error) => {
          if (sent) return;
          sent = true;
          if (error.code === error.PERMISSION_DENIED) {
            setPermissionError('位置情報がブロックされています。ブラウザの設定から位置情報の使用を許可してください。');
            setIsWaiting(false);
            return;
          }
          // 位置情報取得失敗時もダミー値で送信
          socket.emit('bump_attempt', {
            username: playerName,
            timestamp: Date.now(),
            lat: 0,
            lng: 0,
          });
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
      // 5秒経過しても送信されていなければダミー値送信
      setTimeout(() => {
        if (!sent) {
          sent = true;
          socket.emit('bump_attempt', {
            username: playerName,
            timestamp: Date.now(),
            lat: 0,
            lng: 0,
          });
        }
      }, 5000);
    } else {
      socket.emit('bump_attempt', {
        username: playerName,
        timestamp: Date.now(),
        lat: 0,
        lng: 0,
      });
    }
  };

  const startCoolDown = () => {
    isCoolingDownRef.current = true;
    setTimeout(() => {
      isCoolingDownRef.current = false;
      setMaxBump(0);
      if (isWaiting) {
        setStatusText('もう一度ぶつけてみてください');
        setIsWaiting(false);
      }
    }, 2000);
  };

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
            <p className="text-center font-bold text-sm leading-relaxed">
              {permissionError}
            </p>
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
        スマホをぶつけて<br />マッチング！
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
        <p className="text-center font-bold text-lg">{statusText}</p>
        {isWaiting && (
          <div className="mt-4 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-black border-t-transparent"></div>
          </div>
        )}
        {sensorReady && (
          <div className="mt-2 text-center text-xs text-gray-500">センサー許可済み</div>
        )}
      </div>

      {/* 衝撃強度ビジュアライザー */}
      <div className="w-full max-w-md">
        <p className="text-sm font-bold mb-2 text-center">衝撃の強さ</p>
        <div className="h-8 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 transition-all duration-100"
            style={{ width: `${bumpStrength}%` }}
          />
        </div>
        <p className="text-xs text-center mt-2 font-bold">
          最大値: {maxBump.toFixed(1)} / しきい値: {bumpThreshold} / 平均: {avgBuffer.current.length > 0 ? (avgBuffer.current.reduce((a, b) => a + b.v, 0) / avgBuffer.current.length).toFixed(2) : '0'}
        </p>
        <p className="text-xs text-center mt-2 font-bold">
          {bumpStrength > 75 ? '🔥 強い！' : bumpStrength > 40 ? '💪 良い感じ' : '👆 もっと強く！'}
        </p>
      </div>

      {/* CSS for bounce animation */}
      <style>{`
        @keyframes bounce-horizontal {
          0%, 100% {
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
