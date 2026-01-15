import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

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

// --- テクスチャ生成関数 ---
const createRealMahjongTexture = (type: string, value: string | number) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 背景（白）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // タイプごとの描画
  if (type === 'sou' && value === 9) {
    // 9索: 3x3の竹 (中央寄せ)
    const start = size * 0.25;
    const step = size * 0.25;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = start + col * step;
        const cy = size * 0.22 + row * (size * 0.28);
        drawBamboo(ctx, cx, cy, 1.6, '#008800');
      }
    }
  } else if (type === 'pin' && value === 7) {
    // 7筒: 上に斜め3つ、下に2x2 (中央寄せ)
    const green = '#008800';
    const red = '#cc0000';
    // 上3つ (緑)
    drawCircle(ctx, size*0.25, size*0.2, 1.4, green);
    drawCircle(ctx, size*0.5, size*0.3, 1.4, green);
    drawCircle(ctx, size*0.75, size*0.4, 1.4, green);
    // 下4つ (赤)
    drawCircle(ctx, size*0.35, size*0.65, 1.4, red);
    drawCircle(ctx, size*0.65, size*0.65, 1.4, red);
    drawCircle(ctx, size*0.35, size*0.85, 1.4, red);
    drawCircle(ctx, size*0.65, size*0.85, 1.4, red);

  } else if (type === 'man' || type === 'ji') {
    // 萬子・字牌は文字描画
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 萬子の場合は上に数字、下に「萬」
    if (type === 'man') {
      ctx.font = 'bold 160px serif';
      ctx.fillStyle = '#cc0000'; // 萬子は基本赤文字
      ctx.fillText(String(value), size/2, size * 0.35);
      ctx.fillText('萬', size/2, size * 0.72);
    } else {
      // 字牌
      ctx.font = 'bold 320px serif';
      ctx.fillStyle = (value === '中') ? '#cc0000' : (value === '發') ? '#008800' : '#000000';
      ctx.fillText(String(value), size / 2, size / 2);
    }
  }

  // 彫り込みのエッジ効果
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, size - 40, size - 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// --- コンポーネント: 麻雀牌 ---
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

  return (
    <group ref={groupRef} position={position}>
      <RoundedBox args={[1.6, 2.2, 1.2]} radius={0.1} smoothness={4}>
        <meshPhysicalMaterial color="#ffffff" map={texture} metalness={0.1} roughness={0.2} clearcoat={1.0} />
      </RoundedBox>
      <mesh position={[0, 0, -0.61]}>
         <boxGeometry args={[1.58, 2.18, 0.1]} />
         <meshPhysicalMaterial color="#f0c040" metalness={0.0} roughness={0.3} />
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
    <group ref={groupRef} position={position} scale={[0.8, 0.8, 0.8]}>
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[0.4, 3.0, 0.1]} />
        <meshPhysicalMaterial color="#cccccc" metalness={0.9} roughness={0.2} clearcoat={0.5} />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
        <coneGeometry args={[0.2, 1, 4]} />
        <meshPhysicalMaterial color="#bbbbbb" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[1.2, 0.15, 0.3]} />
        <meshPhysicalMaterial color="#aa8800" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.6, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 1.5]} />
        <meshPhysicalMaterial color="#553311" roughness={0.8} />
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
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 3.5]} />
        <meshPhysicalMaterial color="#4a3c31" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.8, 0.8, 0.1]} />
        <meshPhysicalMaterial color="#888888" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation={[0,0,Math.PI/2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.9]} />
        <meshPhysicalMaterial color="#aaaaaa" metalness={0.8} roughness={0.3} />
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

// --- メインコンポーネント ---
export const FallingBackground3D: React.FC = () => {
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
      
      // 武器 60% (0.4以上)、牌 40% (0.4未満)
      if (r >= 0.4) {
        const weaponR = Math.random();
        if (weaponR > 0.75) type = 'shield';
        else if (weaponR > 0.5) type = 'spear';
        else if (weaponR > 0.25) type = 'axe';
        else type = 'sword';
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
  }, []);

  return (
    <div id="canvas-container">
      <Canvas camera={{ position: [0, 0, 18], fov: 45 }} shadows>
        <Environment preset="city" />
        <ambientLight intensity={1.0} />
        <directionalLight position={[10, 20, 10]} intensity={2.0} castShadow />
        <pointLight position={[-10, -5, -5]} intensity={1.5} color="#ffaa00" />

        {items.map((props, i) => {
          switch (props.type) {
            case 'sword': return <Sword key={i} {...props} />;
            case 'axe': return <Axe key={i} {...props} />;
            case 'spear': return <Spear key={i} {...props} />;
            case 'shield': return <Shield key={i} {...props} />;
            default: return <MahjongTile key={i} {...props} />;
          }
        })}
      </Canvas>
    </div>
  );
};
