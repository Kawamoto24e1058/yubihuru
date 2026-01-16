import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

// --- Props型定義 ---
interface FallingBackground3DProps {
  objectType?: 'normal' | 'comeback' | 'yakuman';
  opacity?: number;
}

// --- 描画ヘルパー: 竹 (索子) ---
const drawBamboo = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string) => {
  ctx.fillStyle = color;
  const w = 12 * scale;
  const h = 45 * scale;
  // 竹の節を描くため、少し隙間を空けて短冊を2つ描く
  ctx.fillRect(x - w/2, y - h/2, w, h * 0.4);
  ctx.fillRect(x - w/2, y + h * 0.05, w, h * 0.4);
};

// --- 描画ヘルパー: 丸 (筒子) ---
const drawCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string) => {
  ctx.beginPath();
  ctx.arc(x, y, 20 * scale, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // 縁取り
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2 * scale;
  ctx.stroke();
};

// --- テクスチャ生成関数 (中央基準の座標系で描画) ---
const createRealMahjongTexture = (type: string, value: string | number) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 背景（完全な白）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // 中心を起点にして描画
  ctx.save();
  ctx.translate(size / 2, size / 2);

  if (type === 'sou' && value === 9) {
    // 9索: 3x3の竹を中央に集約
    const spacing = 95;
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        drawBamboo(ctx, col * spacing, row * spacing, 2.0, '#008800');
      }
    }
  } else if (type === 'pin' && value === 7) {
    // 7筒: 特徴的な配置を中央に
    const red = '#cc0000';
    const green = '#008800';
    drawCircle(ctx, -110, -140, 1.6, green);
    drawCircle(ctx, 0, -90, 1.6, green);
    drawCircle(ctx, 110, -40, 1.6, green);
    drawCircle(ctx, -70, 60, 1.6, red);
    drawCircle(ctx, 70, 60, 1.6, red);
    drawCircle(ctx, -70, 160, 1.5, red);
    drawCircle(ctx, 70, 160, 1.5, red);
  } else if (type === 'man' || type === 'ji') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (type === 'man') {
      ctx.fillStyle = '#cc0000';
      ctx.font = 'bold 180px serif';
      ctx.fillText(String(value), 0, -100);
      ctx.fillText('萬', 0, 100);
    } else {
      ctx.font = 'bold 380px serif';
      ctx.fillStyle = (value === '中') ? '#cc0000' : (value === '發') ? '#008800' : '#000000';
      ctx.fillText(String(value), 0, 0);
    }
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// --- コンポーネント: 麻雀牌 (マテリアル配列で正面のみテクスチャ) ---
const MahjongTile: React.FC<any> = ({ position, rotationSpeed, fallSpeed, tileType, tileValue }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const texture = useMemo(() => createRealMahjongTexture(tileType, tileValue), [tileType, tileValue]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
      groupRef.current.position.y = 20;
      groupRef.current.position.x = (Math.random() - 0.5) * 25;
      groupRef.current.rotation.set(Math.random()*3, Math.random()*3, 0);
    }
  });

  // マテリアル配列: 側面4つは白、正面はテクスチャ、背面は黄色
  const materials = useMemo(() => [
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.05, roughness: 0.3, clearcoat: 0.8 }), // 右
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.05, roughness: 0.3, clearcoat: 0.8 }), // 左
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.05, roughness: 0.3, clearcoat: 0.8 }), // 上
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.05, roughness: 0.3, clearcoat: 0.8 }), // 下
    new THREE.MeshPhysicalMaterial({ map: texture, metalness: 0.1, roughness: 0.2, clearcoat: 1.0 }),      // 正面
    new THREE.MeshPhysicalMaterial({ color: '#f0c040', metalness: 0.0, roughness: 0.3 })                    // 背面 (黄色)
  ], [texture]);

  return (
    <group ref={groupRef} position={position}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 2.2, 1.2]} />
        <primitive object={materials} attach="material" />
      </mesh>
    </group>
  );
};

// --- 炎コンポーネント（シンプルな炎）---
const Flame: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.z += delta * rotationSpeed[0] * 2;
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
       groupRef.current.position.y = 20;
       groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });
  
  return (
    <group ref={groupRef} position={position} scale={[0.8, 0.8, 0.8]}>
      {/* 炎の形を3つの円錐で表現 */}
      <mesh position={[0, 0, 0]} castShadow>
        <coneGeometry args={[0.6, 1.8, 5]} />
        <meshPhysicalMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <coneGeometry args={[0.4, 1.2, 5]} />
        <meshPhysicalMaterial color="#ff9933" emissive="#ff6600" emissiveIntensity={1.0} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <coneGeometry args={[0.2, 0.7, 5]} />
        <meshPhysicalMaterial color="#ffff33" emissive="#ffcc00" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
};

// --- 爆弾コンポーネント（チープな見た目）---
const Bomb: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
       groupRef.current.position.y = 20;
       groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });
  
  return (
    <group ref={groupRef} position={position} scale={[0.7, 0.7, 0.7]}>
      {/* 爆弾本体（球体）*/}
      <mesh position={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshPhysicalMaterial color="#111111" metalness={0.3} roughness={0.7} />
      </mesh>
      {/* 導火線 */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
        <meshPhysicalMaterial color="#663300" />
      </mesh>
      {/* 火花（先端）*/}
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshPhysicalMaterial color="#ff6600" emissive="#ff3300" emissiveIntensity={2.0} />
      </mesh>
    </group>
  );
};

// --- 金色萬コンポーネント（祝の文字付き）---
const GoldenMan: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  
  // 金色テクスチャ生成
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // 背景（金色）
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(0, 0, size, size);

    // 中心に「萬」の文字
    ctx.fillStyle = '#b8860b';
    ctx.font = 'bold 320px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('萬', size / 2, size / 2);
    
    // 上部に小さく「祝」
    ctx.font = 'bold 80px serif';
    ctx.fillStyle = '#ff0000';
    ctx.fillText('祝', size / 2, size / 4);

    return new THREE.CanvasTexture(canvas);
  }, []);
  
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.z += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed * 0.8; // やや遅く落ちる
    if (groupRef.current.position.y < -20) {
       groupRef.current.position.y = 20;
       groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });

  const materials = useMemo(() => [
    new THREE.MeshPhysicalMaterial({ color: '#ffd700', metalness: 0.8, roughness: 0.2, clearcoat: 1.0 }), // 右
    new THREE.MeshPhysicalMaterial({ color: '#ffd700', metalness: 0.8, roughness: 0.2, clearcoat: 1.0 }), // 左
    new THREE.MeshPhysicalMaterial({ color: '#ffd700', metalness: 0.8, roughness: 0.2, clearcoat: 1.0 }), // 上
    new THREE.MeshPhysicalMaterial({ color: '#ffd700', metalness: 0.8, roughness: 0.2, clearcoat: 1.0 }), // 下
    new THREE.MeshPhysicalMaterial({ map: texture, metalness: 0.5, roughness: 0.1, clearcoat: 1.0 }),      // 正面
    new THREE.MeshPhysicalMaterial({ color: '#b8860b', metalness: 0.7, roughness: 0.3 })                    // 背面
  ], [texture]);

  return (
    <group ref={groupRef} position={position} scale={[1.2, 1.2, 1.2]}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 2.2, 1.2]} />
        <primitive object={materials} attach="material" />
      </mesh>
    </group>
  );
};

// --- 武器コンポーネント ---
const Sword: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.z += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
       groupRef.current.position.y = 20;
       groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });
  
  return (
    <group ref={groupRef} position={position} scale={[0.7, 0.7, 0.7]}>
      {/* 刃: 先端を尖らせる */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.35, 3.2, 4]} />
        <meshPhysicalMaterial color="#e0e0e0" metalness={1.0} roughness={0.1} clearcoat={1.0} />
      </mesh>
      {/* 血溝 (溝): 刃の中後方に渝 */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 3.0, 2]} />
        <meshPhysicalMaterial color="#a0a0a0" metalness={0.95} roughness={0.15} />
      </mesh>
      {/* 鍔: 豪華な装飾的な形 */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <torusGeometry args={[0.45, 0.12, 8, 20]} />
        <meshPhysicalMaterial color="#ffd700" metalness={1.0} roughness={0.2} clearcoat={0.8} />
      </mesh>
      {/* 柄を抜けやすくするためのリング */}
      <mesh position={[0, -0.1, 0]}>
        <torusGeometry args={[0.38, 0.08, 6, 12]} />
        <meshPhysicalMaterial color="#c0a000" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* 柄: 革巻き風 */}
      <mesh position={[0, -0.95, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 1.6, 8]} />
        <meshPhysicalMaterial color="#4a2c1a" roughness={0.9} />
      </mesh>
      {/* 柄頭: 重り */}
      <mesh position={[0, -1.75, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshPhysicalMaterial color="#ffd700" metalness={1.0} roughness={0.2} clearcoat={0.9} />
      </mesh>
    </group>
  );
};

const Axe: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.z += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) { 
      groupRef.current.position.y = 20; 
      groupRef.current.position.x = (Math.random() - 0.5) * 25; 
    }
  });
  
  return (
    <group ref={groupRef} position={position} scale={[0.8, 0.8, 0.8]}>
      {/* 柄: 木製 */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 3.8, 8]} />
        <meshPhysicalMaterial color="#5d4037" roughness={0.85} />
      </mesh>
      {/* 刃: 三日月状 (模擬) */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[1.0, 0.8, 0.7, 16]} />
        <meshPhysicalMaterial color="#383838" metalness={0.8} roughness={0.4} />
      </mesh>
      {/* 刃の鋭利な縁 */}
      <mesh position={[0.9, 1.5, 0]} castShadow>
        <boxGeometry args={[0.15, 0.8, 0.08]} />
        <meshPhysicalMaterial color="#e8e8e8" metalness={1.0} roughness={0.08} clearcoat={0.95} />
      </mesh>
      <mesh position={[-0.9, 1.5, 0]} castShadow>
        <boxGeometry args={[0.15, 0.8, 0.08]} />
        <meshPhysicalMaterial color="#e8e8e8" metalness={1.0} roughness={0.08} clearcoat={0.95} />
      </mesh>
      {/* 柄と刃の接合部: 金属補強バンド */}
      <mesh position={[0, 1.0, 0]}>
        <torusGeometry args={[0.35, 0.06, 8, 16]} />
        <meshPhysicalMaterial color="#888888" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.35, 0.3, 0.12, 16]} />
        <meshPhysicalMaterial color="#707070" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* 石突き: 柄の下の金属スパイク */}
      <mesh position={[0, -1.9, 0]} castShadow>
        <coneGeometry args={[0.2, 0.6, 8]} />
        <meshPhysicalMaterial color="#555555" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
};

const Spear: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.z += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) { 
      groupRef.current.position.y = 20; 
      groupRef.current.position.x = (Math.random() - 0.5) * 25; 
    }
  });
  
  return (
    <group ref={groupRef} position={position} scale={[0.7, 0.7, 0.7]}>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 4.5]} />
        <meshPhysicalMaterial color="#5a4a3a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.8, 0]} castShadow>
        <coneGeometry args={[0.25, 1.5, 4]} />
        <meshPhysicalMaterial color="#dddddd" metalness={0.95} roughness={0.15} clearcoat={0.7} />
      </mesh>
      <mesh position={[0, 2.0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.3]} />
        <meshPhysicalMaterial color="#ccaa00" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
};

const Shield: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) { 
      groupRef.current.position.y = 20; 
      groupRef.current.position.x = (Math.random() - 0.5) * 25; 
    }
  });
  
  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[Math.PI/2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.3, 1.3, 0.25, 16]} />
        <meshPhysicalMaterial color="#2244aa" metalness={0.4} roughness={0.4} clearcoat={0.6} />
      </mesh>
      <mesh rotation={[Math.PI/2, 0, 0]} position={[0,0,0.13]}>
        <torusGeometry args={[0.9, 0.08, 16, 32]} />
        <meshPhysicalMaterial color="#ffcc00" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh rotation={[Math.PI/2, 0, 0]} position={[0,0,0.15]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshPhysicalMaterial color="#eeeeee" metalness={0.95} roughness={0.1} />
      </mesh>
    </group>
  );
};

// --- リアルな手モデル (骨格シミュレーション版) ---
const RealHand: React.FC<{ extendedFinger: "index" | "middle" }> = ({ extendedFinger }) => {
  const skinMat = new THREE.MeshPhysicalMaterial({ color: '#ffdbac', roughness: 0.6 });

  // 指一本分を描画する関数
  const Finger = ({ index, isExtended }: { index: number, isExtended: boolean }) => {
    const xPos = -0.35 + index * 0.22;
    // 伸ばしている指は真っ直ぐ、握っている指は2段階で曲げる
    const rootRotation = isExtended ? 0 : Math.PI * 0.5;
    const tipRotation = isExtended ? 0 : Math.PI * 0.6;
    const rootPos = isExtended ? 0.5 : 0.3;
    const zPos = isExtended ? 0 : 0.25;

    return (
      <group position={[xPos, 0.45, 0]}>
        {/* 指の根元パーツ */}
        <mesh rotation={[rootRotation, 0, 0]} position={[0, rootPos/2, zPos/2]}>
          <capsuleGeometry args={[0.08, 0.4, 4, 8]} />
          <primitive object={skinMat} attach="material" />
          {/* 指の先端パーツ（さらに関節を曲げる） */}
          <mesh rotation={[tipRotation, 0, 0]} position={[0, 0.3, 0]}>
            <capsuleGeometry args={[0.08, 0.35, 4, 8]} />
            <primitive object={skinMat} attach="material" />
          </mesh>
        </mesh>
      </group>
    );
  };

  return (
    <group scale={[1.3, 1.3, 1.3]}>
      {/* 手のひら (厚みのあるベース) */}
      <RoundedBox args={[0.85, 1.0, 0.4]} radius={0.15} smoothness={4}>
        <meshPhysicalMaterial color="#ffdbac" roughness={0.6} />
      </RoundedBox>

      {/* 4本の指 */}
      {[0, 1, 2, 3].map((i) => (
        <Finger 
          key={i} 
          index={i} 
          isExtended={(extendedFinger === "index" && i === 0) || (extendedFinger === "middle" && i === 1)} 
        />
      ))}

      {/* 親指 (横から出て内側に曲げる) */}
      <group position={[-0.45, -0.1, 0.1]} rotation={[0, 0.5, 0.8]}>
        <mesh rotation={[Math.PI * 0.3, 0, 0]}>
          <capsuleGeometry args={[0.1, 0.4, 4, 8]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
      </group>
    </group>
  );
};

// 人差し指を立てた手
const IndexFingerHand: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
      groupRef.current.position.y = 20;
      groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });
  
  return (
    <group ref={groupRef} position={position}>
      <RealHand extendedFinger="index" />
    </group>
  );
};

// 中指を立てた手
const MiddleFingerHand: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
      groupRef.current.position.y = 20;
      groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });
  
  return (
    <group ref={groupRef} position={position}>
      <RealHand extendedFinger="middle" />
    </group>
  );
};

// --- メインコンポーネント ---
export const FallingBackground3D: React.FC<FallingBackground3DProps> = ({ objectType = 'normal', opacity = 1.0 }) => {
  const count = 40;

  const items = useMemo(() => {
    // リアルな牌のラインナップ
    const tileOptions = [
      { type: 'sou', val: 9 }, // 9索 (竹9本)
      { type: 'pin', val: 7 }, // 7筒 (丸7個)
      { type: 'man', val: 8 }, // 8萬
      { type: 'man', val: 1 }, // 1萬
      { type: 'ji', val: '中' },
      { type: 'ji', val: '發' },
      { type: 'ji', val: '白' }
    ];

    return new Array(count).fill(0).map(() => {
      const r = Math.random();
      let type = 'tile';
      
      // objectTypeに応じてオブジェクトを変更
      if (objectType === 'comeback') {
        // 起死回生：炎70%、爆弾30%
        type = r < 0.7 ? 'flame' : 'bomb';
      } else if (objectType === 'yakuman') {
        // 役満：金色萬100%
        type = 'golden_man';
      } else {
        // 通常：武器 50%, 牌 20%, 人差し指 20%, 中指 10%
        if (r < 0.5) {
          const weaponR = Math.random();
          if (weaponR > 0.75) type = 'shield';
          else if (weaponR > 0.5) type = 'spear';
          else if (weaponR > 0.25) type = 'axe';
          else type = 'sword';
        } else if (r < 0.7) {
          type = 'tile';
        } else if (r < 0.9) {
          type = 'index_hand';
        } else {
          type = 'middle_hand';
        }
      }

      const tileData = tileOptions[Math.floor(Math.random() * tileOptions.length)];

      return {
        type,
        tileType: tileData.type,
        tileValue: tileData.val,
        position: [(Math.random() - 0.5) * 25, Math.random() * 30 - 10, (Math.random() - 0.5) * 10 - 5] as [number, number, number],
        rotationSpeed: [Math.random() + 0.5, Math.random() + 0.5],
        fallSpeed: Math.random() * 1.5 + 1.0,
      };
    });
  }, [objectType]);

  return (
    <div id="canvas-container" style={{ opacity }}>
      <Canvas camera={{ position: [0, 0, 18], fov: 45 }} shadows>
        <Environment preset="city" />
        <ambientLight intensity={1.0} />
        <directionalLight position={[10, 20, 10]} intensity={2.0} castShadow />
        <pointLight position={[-10, -5, -5]} intensity={1.5} color="#ffaa00" />

        {items.map((props, i) => {
          switch (props.type) {
            case 'flame': return <Flame key={i} {...props} />;
            case 'bomb': return <Bomb key={i} {...props} />;
            case 'golden_man': return <GoldenMan key={i} {...props} />;
            case 'sword': return <Sword key={i} {...props} />;
            case 'axe': return <Axe key={i} {...props} />;
            case 'spear': return <Spear key={i} {...props} />;
            case 'shield': return <Shield key={i} {...props} />;
            case 'index_hand': return <IndexFingerHand key={i} {...props} />;
            case 'middle_hand': return <MiddleFingerHand key={i} {...props} />;
            default: return <MahjongTile key={i} {...props} />;
          }
        })}
      </Canvas>
    </div>
  );
};
