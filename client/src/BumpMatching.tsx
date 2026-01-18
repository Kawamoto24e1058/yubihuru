import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import * as THREE from 'three'
import { audioManager } from './utils/AudioManager';

interface BumpMatchingProps {
  socket: Socket | null;
  playerName: string;
  onMatchSuccess: (roomId: string, opponentName: string) => void;
  onBack: () => void;
}

export const BumpMatching: React.FC<BumpMatchingProps> = ({ socket, playerName, onMatchSuccess, onBack }) => {
  const [bumpStrength, setBumpStrength] = useState(0); // 0-100
  const [isWaiting, setIsWaiting] = useState(false);
  const [statusText, setStatusText] = useState('「マッチングを開始する」ボタンを押してください');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [sensorReady, setSensorReady] = useState(false);
  const [maxBump, setMaxBump] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [brokenTiles, setBrokenTiles] = useState(0); // 壊した牌の数
  const animationFrameRef = useRef<number>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // タイムアウトIDを保持
  
  // 麻雀牌破壊神用のThree.js設定
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const tilesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  // 判定パラメータ
  const bumpThreshold = 10; // 1. しきい値を高く設定 (旧: 1.5)
  const gaugeMax = 30.0; // 1. ゲージ満タン値も高く設定 (旧: 6.0)
  const gaugeBuffer = useRef<{ t: number; v: number }[]>([]); // 0.2秒間の加速度絶対値バッファ
  const avgWindowMs = 200;

  // 麻雀牌破壊神の初期化
  useEffect(() => {
    if (!canvasRef.current) return;

    // Three.jsシーンの初期化
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // カメラの初期化
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // レンダラーの初期化
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      antialias: true,
      alpha: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    // 照明の設定
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 麻雀牌の生成
    const tiles: THREE.Mesh[] = [];
    const tileGeometry = new THREE.BoxGeometry(0.8, 1.0, 0.1);
    
    for (let i = 0; i < 15; i++) {
      const tileMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.8),
        specular: 0x222222,
        shininess: 25
      });
      
      const tile = new THREE.Mesh(tileGeometry, tileMaterial);
      tile.position.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 3
      );
      tile.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      tile.userData = { id: i, isBroken: false };
      
      scene.add(tile);
      tiles.push(tile);
    }
    tilesRef.current = tiles;

    // ウィンドウリサイズ対応
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // アニメーションループ
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      // 牌の浮遊アニメーション
      tiles.forEach((tile, index) => {
        if (!tile.userData.isBroken) {
          tile.rotation.x += 0.01;
          tile.rotation.y += 0.008;
          tile.position.y += Math.sin(Date.now() * 0.001 + index) * 0.002;
        }
      });
      
      renderer.render(scene, camera);
    };
    animate();

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 牌のクリック処理
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(tilesRef.current);

    if (intersects.length > 0) {
      const clickedTile = intersects[0].object as THREE.Mesh;
      
      if (!clickedTile.userData.isBroken) {
        // 牌を破壊する演出
        clickedTile.userData.isBroken = true;
        
        // 破壊音を鳴らす
        audioManager.playTileBreakSound();
        
        // 破壊アニメーション
        const scaleAnimation = () => {
          if (clickedTile.scale.x > 0.01) {
            clickedTile.scale.multiplyScalar(0.9);
            clickedTile.rotation.z += 0.3;
            clickedTile.position.y -= 0.1;
            requestAnimationFrame(scaleAnimation);
          } else {
            // シーンから削除
            sceneRef.current?.remove(clickedTile);
            const index = tilesRef.current.indexOf(clickedTile);
            if (index > -1) {
              tilesRef.current.splice(index, 1);
            }
          }
        };
        scaleAnimation();
        
        // カウント更新
        setBrokenTiles(prev => prev + 1);
      }
    }
  };

  // 衝撃検知ハンドラー
  const handleMotion = (event: DeviceMotionEvent) => {
    // 4. 二重送信防止: 待機中は処理をスキップ
    if (isWaiting) {
      return;
    }

    // iPhone: acceleration + accelerationIncludingGravity の両方を合算
    let accX = 0,
      accY = 0,
      accZ = 0;
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
    // iOSのみ3倍ブースト
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      accX *= 3;
      accY *= 3;
      accZ *= 3;
    }

    // 1. ハイパスフィルター強化: 急激な変化のみを捉える
    const now = Date.now();
    const absAcc = Math.abs(accX) + Math.abs(accY) + Math.abs(accZ);

    // 1回の加速度絶対値がしきい値超えたらゲージ加算
    let add = 0;
    if (absAcc > bumpThreshold) {
      add = absAcc; // 係数を1.0に (旧: absAcc * 0.6)
    }

    // バッファに追加
    gaugeBuffer.current.push({ t: now, v: add });
    // 0.2秒より古い値を除去
    gaugeBuffer.current = gaugeBuffer.current.filter((e) => now - e.t <= avgWindowMs);
    // 合計値でゲージ進行
    const sum = gaugeBuffer.current.reduce((a, b) => a + b.v, 0);
    let nextStrength = Math.min(100, (sum / gaugeMax) * 100);
    setBumpStrength(nextStrength);
    setMaxBump((prev) => Math.max(prev, absAcc));

    // 50%以上で白発光
    if (nextStrength > 50 && nextStrength < 100) {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 120);
    }

    // 100%到達で即送信
    if (nextStrength >= 100 && !isWaiting) {
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
      onBumpDetected();
      // ゲージリセット
      gaugeBuffer.current = [];
      setTimeout(() => {
        setBumpStrength(0);
      }, 800);
    }
  };

  const onBumpDetected = () => {
    // 3. 視覚的な待機状態の明確化
    setStatusText('衝撃検知！相手を探しています...（有効期限：3秒）');
    setIsWaiting(true);

    // 3. 3秒のタイムアウトを設定
    timeoutRef.current = setTimeout(() => {
      setStatusText('タイムアウト。もう一度ぶつけてください');
      setIsWaiting(false); // ステートをリセット
      timeoutRef.current = null;
    }, 3000);

    if (!socket) return;

    // 位置情報取得と送信
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
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
        { timeout: 5000, enableHighAccuracy: true },
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
  // センサー監視開始（iOS許可取得）
  const startSensor = async () => {
    // AudioContextを初期化（ブラウザの自動再生制限解除）
    audioManager.initAudioContext();
    audioManager.resumeAudioContext();
    
    // BGMを再生開始
    audioManager.playBGM('normal');
    
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
    } else {
      setPermissionError('このブラウザはモーションセンサーをサポートしていません。');
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
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* 麻雀牌破壊神の背景 */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 z-0"
        style={{ cursor: 'crosshair' }}
      />
      
      {/* 破壊した牌の数表示 */}
      <div className="fixed top-4 left-4 z-10 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-3 rounded">
        <p className="text-sm font-black text-center">
          🀄 破壊した牌の数: <span className="text-2xl font-bold text-red-600">{brokenTiles}</span>
        </p>
      </div>

      {/* メインコンテンツ */}
      <div className="relative z-10 bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full">
        {/* 戻るボタン（左上） */}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 px-4 py-2 bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-sm"
        >
          ← 戻る
        </button>

        {/* タイトル */}
        <h1 className="text-6xl font-black text-center mb-8" style={{ WebkitTextStroke: '2px black', color: 'white' }}>
          YUBIFURU
        </h1>
        
        <div className="space-y-6">
          {permissionError && (
            <div className="bg-yellow-100 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 mb-4">
              <h2 className="text-center font-bold text-lg mb-4">⚠️ 権限エラー</h2>
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
          )}
        </div>
      </div>
    </div>
  );
};
