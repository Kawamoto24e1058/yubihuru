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
  const [statusText, setStatusText] = useState('スマホを相手とコツンとぶつけてください');
  const lastTotalRef = useRef(9.8);
  const isCoolingDownRef = useRef(false);
  const animationFrameRef = useRef<number>();

  // 衝撃検知ハンドラー
  useEffect(() => {
    if (!socket) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const { x, y, z } = acc;
      const currentTotal = Math.sqrt(x * x + y * y + z * z);
      const delta = Math.abs(currentTotal - lastTotalRef.current);

      // ビジュアライザー更新
      setBumpStrength(Math.min(100, delta * 3));

      // 衝撃検知（しきい値25）
      if (delta > 25 && !isCoolingDownRef.current) {
        onBumpDetected();
        startCoolDown();
      }

      lastTotalRef.current = currentTotal;
    };

    const onBumpDetected = () => {
      setStatusText('🔍 近くの相手を探しています...');
      setIsWaiting(true);

      // 位置情報取得
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            socket.emit('bump_attempt', {
              username: playerName,
              timestamp: Date.now(),
              lat,
              lng,
            });
            console.log('Bump detected with location:', { lat, lng });
          },
          (error) => {
            console.error('Geolocation error:', error);
            // 位置情報取得失敗時もダミー値で送信（テスト用）
            socket.emit('bump_attempt', {
              username: playerName,
              timestamp: Date.now(),
              lat: 0,
              lng: 0,
            });
          },
          { timeout: 5000, enableHighAccuracy: true }
        );
      } else {
        // 位置情報非対応
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
        if (isWaiting) {
          setStatusText('もう一度ぶつけてみてください');
          setIsWaiting(false);
        }
      }, 2000);
    };

    // モーションイベント登録
    if (typeof DeviceMotionEvent !== 'undefined') {
      // iOS13+の許可リクエスト対応
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        (DeviceMotionEvent as any).requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              window.addEventListener('devicemotion', handleMotion as any);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('devicemotion', handleMotion as any);
      }
    }

    // マッチング成功ハンドラー
    const handleMatchSuccess = (data: { roomId: string; opponentName: string }) => {
      console.log('Match success!', data);
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
  }, [socket, isWaiting, onMatchSuccess]);

  // ビジュアライザーの減衰アニメーション
  useEffect(() => {
    const decay = () => {
      setBumpStrength((prev) => Math.max(0, prev - 2));
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
