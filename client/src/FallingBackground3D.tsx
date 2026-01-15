import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// --- 素材生成ヘルパー ---
const createMahjongTexture = (text: string, color: string) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 背景（白）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    // 文字
    ctx.font = 'bold 160px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, size / 2);
    // 枠線（彫り込み風）
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e0e0e0';
    ctx.strokeRect(10, 10, size - 20, size - 20);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// --- コンポーネント: 麻雀牌 ---
const MahjongTile: React.FC<any> = ({ position, rotationSpeed, fallSpeed, label, color }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const texture = useMemo(() => createMahjongTexture(label, color), [label, color]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = 15;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 牌の本体 (前面にテクスチャ) */}
      <mesh>
        <boxGeometry args={[1.5, 2.0, 1.0]} />
        {/* マテリアル配列: 右, 左, 上, 下, 前, 後 */}
        <meshStandardMaterial attach="material-0" color="#ffffff" />
        <meshStandardMaterial attach="material-1" color="#ffffff" />
        <meshStandardMaterial attach="material-2" color="#ffffff" />
        <meshStandardMaterial attach="material-3" color="#ffffff" />
        <meshStandardMaterial attach="material-4" map={texture} /> {/* 前面 */}
        <meshStandardMaterial attach="material-5" color="#ffcc33" /> {/* 背面（黄色） */}
      </mesh>
    </group>
  );
};

// --- コンポーネント: 剣 ---
const Sword: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.z += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = 15;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
    }
  });

  return (
    <group ref={groupRef} position={position} scale={[0.8, 0.8, 0.8]}>
      {/* 刃 */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.3, 2.5, 0.1]} />
        <meshStandardMaterial color="#eeeeee" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* 鍔 */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[1.0, 0.1, 0.2]} />
        <meshStandardMaterial color="#aa8800" metalness={0.6} />
      </mesh>
      {/* 持ち手 */}
      <mesh position={[0, -0.5, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1.2]} />
        <meshStandardMaterial color="#552200" />
      </mesh>
    </group>
  );
};

// --- コンポーネント: 斧 ---
const Axe: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.z += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = 15;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
    }
  });

  return (
    <group ref={groupRef} position={position} scale={[0.8, 0.8, 0.8]}>
      {/* 持ち手 */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 3]} />
        <meshStandardMaterial color="#443322" />
      </mesh>
      {/* 刃（左右） */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[1.5, 0.8, 0.1]} />
        <meshStandardMaterial color="#444444" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
};

// --- コンポーネント: 盾 ---
const Shield: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = 15;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.2, 16]} />
        <meshStandardMaterial color="#2244aa" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.11]}>
        <torusGeometry args={[0.8, 0.05, 16, 32]} />
        <meshStandardMaterial color="#eeeeee" metalness={0.8} />
      </mesh>
    </group>
  );
};

// --- コンポーネント: コイン ---
const Coin: React.FC<any> = ({ position, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.y += delta * 5; // コインは高速回転
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = 15;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.1, 16]} />
        <meshStandardMaterial color="#ffcc00" metalness={1} roughness={0.1} />
      </mesh>
    </group>
  );
};


// --- メイン ---
export const FallingBackground3D: React.FC = () => {
  const count = 40;
  
  // アイテム生成ロジック
  const items = useMemo(() => {
    const tileLabels = [
      { t: '中', c: '#cc0000' }, { t: '發', c: '#008800' }, { t: '白', c: '#000000' },
      { t: '東', c: '#000000' }, { t: '南', c: '#000000' }, { t: '西', c: '#000000' }, { t: '北', c: '#000000' },
      { t: '1萬', c: '#cc0000' }, { t: '8索', c: '#008800' }
    ];

    return new Array(count).fill(0).map(() => {
      const typeRand = Math.random();
      let type = 'tile';
      if (typeRand > 0.6) type = 'sword';
      else if (typeRand > 0.8) type = 'shield';
      else if (typeRand > 0.9) type = 'axe';
      else if (typeRand > 0.95) type = 'coin';

      // 麻雀牌の場合のラベル決定
      const tileData = tileLabels[Math.floor(Math.random() * tileLabels.length)];

      return {
        type,
        label: tileData.t,
        color: tileData.c,
        position: [(Math.random() - 0.5) * 20, Math.random() * 30 - 10, (Math.random() - 0.5) * 8 - 4],
        rotationSpeed: [Math.random(), Math.random()],
        fallSpeed: Math.random() * 2 + 1,
      };
    });
  }, []);

  return (
    <div id="canvas-container">
      <Canvas camera={{ position: [0, 0, 15], fov: 50 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[10, 10, 5]} intensity={2} />
        <pointLight position={[-10, -10, 5]} intensity={1} color="orange" />
        <Environment preset="city" />

        {items.map((props, i) => {
          if (props.type === 'sword') return <Sword key={i} {...props} />;
          if (props.type === 'shield') return <Shield key={i} {...props} />;
          if (props.type === 'axe') return <Axe key={i} {...props} />;
          if (props.type === 'coin') return <Coin key={i} {...props} />;
          return <MahjongTile key={i} {...props} />;
        })}
      </Canvas>
    </div>
  );
};
