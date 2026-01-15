import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// --- 素材生成ヘルパー ---
const createMahjongTexture = (text: string, color: string) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.font = 'bold 300px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, size / 2);
    // 彫り込みのような影
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.strokeText(text, size / 2, size / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// --- アイテムコンポーネント群 ---

// 麻雀牌
const MahjongTile: React.FC<any> = ({ position, rotationSpeed, fallSpeed, label, color }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const texture = useMemo(() => createMahjongTexture(label, color), [label, color]);

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

  return (
    <group ref={groupRef} position={position}>
      {/* 前面（テクスチャ付き） */}
      <mesh position={[0, 0, 0.6]}>
        <boxGeometry args={[1.6, 2.2, 0.1]} />
        <meshPhysicalMaterial 
          map={texture}
          metalness={0.1}
          roughness={0.2}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>
      {/* 本体（白） */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.6, 2.2, 1.0]} />
        <meshPhysicalMaterial 
          color="#ffffff"
          metalness={0.1}
          roughness={0.3}
        />
      </mesh>
      {/* 背面（黄色） */}
      <mesh position={[0, 0, -0.6]}>
        <boxGeometry args={[1.6, 2.2, 0.1]} />
        <meshPhysicalMaterial 
          color="#f0c040" 
          metalness={0.0} 
          roughness={0.3}
        />
      </mesh>
    </group>
  );
};

// 剣
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
    <group ref={groupRef} position={position} scale={[0.8, 0.8, 0.8]}>
      {/* 刃 */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[0.4, 3.0, 0.1]} />
        <meshPhysicalMaterial 
          color="#cccccc" 
          metalness={0.9} 
          roughness={0.2} 
          clearcoat={0.5}
        />
      </mesh>
      {/* 刃先 */}
      <mesh position={[0, 3.5, 0]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[0.2, 0.8, 4]} />
        <meshPhysicalMaterial 
          color="#bbbbbb" 
          metalness={0.9} 
          roughness={0.3}
        />
      </mesh>
      {/* 鍔 */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[1.2, 0.15, 0.3]} />
        <meshPhysicalMaterial 
          color="#aa8800" 
          metalness={0.7} 
          roughness={0.3}
        />
      </mesh>
      {/* 持ち手 */}
      <mesh position={[0, -0.6, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 1.5]} />
        <meshPhysicalMaterial 
          color="#553311" 
          roughness={0.8}
        />
      </mesh>
    </group>
  );
};

// 斧
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
    <group ref={groupRef} position={position}>
      {/* 柄 */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 3.5]} />
        <meshPhysicalMaterial 
          color="#4a3c31" 
          roughness={0.9}
        />
      </mesh>
      {/* 刃 */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.8, 0.8, 0.1]} />
        <meshPhysicalMaterial 
          color="#888888" 
          metalness={0.7} 
          roughness={0.4}
        />
      </mesh>
      {/* 留め具 */}
      <mesh position={[0, 1.2, 0]} rotation={[0,0,Math.PI/2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.9]} />
        <meshPhysicalMaterial 
          color="#aaaaaa" 
          metalness={0.8} 
          roughness={0.3}
        />
      </mesh>
    </group>
  );
};

// 槍
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
      {/* 長い柄 */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 4.5]} />
        <meshPhysicalMaterial 
          color="#5a4a3a" 
          roughness={0.9}
        />
      </mesh>
      {/* 穂先 */}
      <mesh position={[0, 2.8, 0]} castShadow>
        <coneGeometry args={[0.25, 1.5, 4]} />
        <meshPhysicalMaterial 
          color="#dddddd" 
          metalness={0.95} 
          roughness={0.15} 
          clearcoat={0.7}
        />
      </mesh>
      {/* 留め金 */}
      <mesh position={[0, 2.0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.3]} />
        <meshPhysicalMaterial 
          color="#ccaa00" 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>
    </group>
  );
};

// 盾
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
      {/* 盾本体 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.3, 1.3, 0.25, 16]} />
        <meshPhysicalMaterial 
          color="#2244aa" 
          metalness={0.4} 
          roughness={0.4} 
          clearcoat={0.6}
        />
      </mesh>
      {/* 縁取り（リム） */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.13]}>
        <torusGeometry args={[0.9, 0.08, 16, 32]} />
        <meshPhysicalMaterial 
          color="#ffcc00" 
          metalness={0.9} 
          roughness={0.2}
        />
      </mesh>
      {/* 中央の飾り */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.15]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshPhysicalMaterial 
          color="#eeeeee" 
          metalness={0.95} 
          roughness={0.1}
        />
      </mesh>
    </group>
  );
};

// コイン
const Coin: React.FC<any> = ({ position, fallSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if(!groupRef.current) return;
    groupRef.current.rotation.y += delta * 5; // 高速回転
    groupRef.current.position.y -= delta * fallSpeed;
    if (groupRef.current.position.y < -20) {
      groupRef.current.position.y = 20;
      groupRef.current.position.x = (Math.random() - 0.5) * 25;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.12, 16]} />
        <meshPhysicalMaterial 
          color="#ffcc00" 
          metalness={1} 
          roughness={0.1} 
          clearcoat={1.0}
        />
      </mesh>
    </group>
  );
};

// --- メイン ---
export const FallingBackground3D: React.FC = () => {
  const count = 45;
  
  const items = useMemo(() => {
    const tileLabels = [
      { t: '中', c: '#cc0000' }, 
      { t: '發', c: '#008800' }, 
      { t: '白', c: '#000000' },
      { t: '東', c: '#000000' }, 
      { t: '南', c: '#000000' }, 
      { t: '西', c: '#000000' }, 
      { t: '北', c: '#000000' },
      { t: '1萬', c: '#cc0000' }, 
      { t: '8索', c: '#008800' },
      { t: '9筒', c: '#0044cc' }
    ];

    return new Array(count).fill(0).map(() => {
      const typeRand = Math.random();
      let type = 'tile';
      
      if (typeRand > 0.65) type = 'sword';
      else if (typeRand > 0.75) type = 'shield';
      else if (typeRand > 0.82) type = 'axe';
      else if (typeRand > 0.88) type = 'spear';
      else if (typeRand > 0.94) type = 'coin';

      const tileData = tileLabels[Math.floor(Math.random() * tileLabels.length)];

      return {
        type,
        label: tileData.t,
        color: tileData.c,
        position: [
          (Math.random() - 0.5) * 25, 
          Math.random() * 40 - 10, 
          (Math.random() - 0.5) * 10 - 5
        ] as [number, number, number],
        rotationSpeed: [Math.random() * 0.5, Math.random() * 0.5],
        fallSpeed: Math.random() * 2 + 1,
      };
    });
  }, []);

  return (
    <div id="canvas-container">
      <Canvas 
        camera={{ position: [0, 0, 18], fov: 50 }} 
        shadows
      >
        <ambientLight intensity={1.2} />
        <directionalLight 
          position={[10, 15, 5]} 
          intensity={2.5} 
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-10, -10, 5]} intensity={1.2} color="#ffaa66" />
        
        <Environment preset="city" />

        {items.map((props, i) => {
          if (props.type === 'sword') return <Sword key={i} {...props} />;
          if (props.type === 'shield') return <Shield key={i} {...props} />;
          if (props.type === 'axe') return <Axe key={i} {...props} />;
          if (props.type === 'spear') return <Spear key={i} {...props} />;
          if (props.type === 'coin') return <Coin key={i} {...props} />;
          return <MahjongTile key={i} {...props} />;
        })}
      </Canvas>
    </div>
  );
};
