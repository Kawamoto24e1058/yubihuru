// client/src/FallingBackground3D.tsx
import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// 1つの落下アイテム（麻雀牌や剣の代わり）
const FallingItem = ({ position, rotationSpeed, fallSpeed, type }: any) => {
  const ref = useRef<THREE.Mesh>(null!);
  // 初期位置を記憶
  const [initialY] = useState(position[1]);

  // 毎フレーム実行されるループ（アニメーションの核）
  useFrame((_state, delta) => {
    if (!ref.current) return;

    // 1. ゆっくり回転させる
    ref.current.rotation.x += delta * rotationSpeed[0];
    ref.current.rotation.y += delta * rotationSpeed[1];
    ref.current.rotation.z += delta * rotationSpeed[2];

    // 2. 下に落とす
    ref.current.position.y -= delta * fallSpeed;

    // 3. 画面外（下）まで落ちたら、上に戻してループさせる
    if (ref.current.position.y < -15) {
        // 初期位置より少し高いランダムな位置に戻す
      ref.current.position.y = initialY + Math.random() * 5;
      ref.current.position.x = (Math.random() - 0.5) * 20; // 横位置もリセット
    }
  });

  // typeに応じて形と色を変える（仮のモデル）
  const isMahjong = type === 'mahjong';
  const geometry = isMahjong
    ? new THREE.BoxGeometry(0.8, 1, 0.5) // 麻雀牌っぽい直方体
    : new THREE.BoxGeometry(0.2, 2, 0.1); // 剣っぽい細長い棒

  const color = isMahjong ? '#ffffff' : '#aaaaaa'; // 白か銀色

  return (
    <mesh ref={ref} position={position} geometry={geometry}>
      {/* 金属っぽい質感のマテリアル */}
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.2} />
    </mesh>
  );
};

// メインの背景コンポーネント
export const FallingBackground3D = () => {
  const count = 40; // アイテムの数

  // ランダムな初期データを生成（場所、回転速度、落下速度、種類）
  const items = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      position: [
        (Math.random() - 0.5) * 20, // X: 横の広がり
        Math.random() * 30 + 10,    // Y: 高さ（画面外の上空からスタート）
        (Math.random() - 0.5) * 10 - 5 // Z: 奥行き（少し奥側）
      ],
      rotationSpeed: [
        Math.random() * 0.5, // X軸回転
        Math.random() * 0.5, // Y軸回転
        Math.random() * 0.5  // Z軸回転
      ],
      fallSpeed: Math.random() * 1 + 0.5, // 落下速度
      type: Math.random() > 0.5 ? 'mahjong' : 'sword', // 50%の確率で種類を決定
    }));
  }, []);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: -1, // 最背面に配置
      pointerEvents: 'none', // 操作を邪魔しないように
      background: 'linear-gradient(to bottom, #000022, #000000)' // 宇宙っぽい暗い背景色
    }}>
      <Canvas camera={{ position: [0, 0, 15], fov: 50 }}>
        {/* ライティング（これがないと真っ暗） */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        {/* 環境光（リアルな反射を追加） */}
        <Environment preset="city" />

        {/* 生成したアイテムを配置 */}
        {items.map((props, i) => (
            <FallingItem key={i} {...props} />
        ))}
      </Canvas>
    </div>
  );
};