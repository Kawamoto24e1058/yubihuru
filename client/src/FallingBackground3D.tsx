import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// --- ヘルパー関数: テクスチャ生成 ---
const createGenerativeTexture = (drawFunction: (ctx: CanvasRenderingContext2D, size: number) => void) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) drawFunction(ctx, size);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// --- ヘルパー関数: 「中」の字を描画 ---
const drawChunTexture = (ctx: CanvasRenderingContext2D, size: number, type: 'color' | 'bump' | 'roughness') => {
  const fontStyle = 'bold 380px "Hiragino Mincho ProN", serif';
  
  if (type === 'color' || type === 'bump') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.fillStyle = '#404040'; 
    ctx.fillRect(0, 0, size, size);
  }

  ctx.font = fontStyle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (type === 'color') {
    ctx.shadowColor = '#aa0000';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#cc0000';
  } else if (type === 'bump') {
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = '#000000';
  } else {
    ctx.fillStyle = '#808080';
  }

  ctx.fillText('中', size / 2, size / 2);
};

// --- 落下する剣コンポーネント ---
const FallingSword: React.FC<any> = ({ 
  position, 
  rotationSpeed, 
  fallSpeed 
}) => {
  const groupRef = useRef<THREE.Group>(null!);
  const [initialY] = useState(position[1]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.rotation.z += delta * rotationSpeed[2];

    groupRef.current.position.y -= delta * fallSpeed;

    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = initialY + Math.random() * 5;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
      groupRef.current.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 刃（ブレード） */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.2, 2.5, 0.05]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* 鍔（つば） */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 8]} />
        <meshStandardMaterial color="#ffd700" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* 柄（つか） */}
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[0.15, 1.2, 0.15]} />
        <meshStandardMaterial color="#8b4513" metalness={0.3} roughness={0.7} />
      </mesh>
    </group>
  );
};

// --- 落下するサイコロコンポーネント ---
const FallingDice: React.FC<any> = ({ 
  position, 
  rotationSpeed, 
  fallSpeed 
}) => {
  const groupRef = useRef<THREE.Group>(null!);
  const [initialY] = useState(position[1]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.rotation.z += delta * rotationSpeed[2];

    groupRef.current.position.y -= delta * fallSpeed;

    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = initialY + Math.random() * 5;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
      groupRef.current.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    }
  });

  const diceColor = Math.random() > 0.5 ? '#ffffff' : '#ff4444';

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color={diceColor} metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
};

// --- 落下する麻雀牌コンポーネント ---
const FallingMahjongTile: React.FC<any> = ({ 
  position, 
  rotationSpeed, 
  fallSpeed, 
  resources 
}) => {
  const groupRef = useRef<THREE.Group>(null!);
  const [initialY] = useState(position[1]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.rotation.z += delta * rotationSpeed[2];

    groupRef.current.position.y -= delta * fallSpeed;

    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = initialY + Math.random() * 5;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
      groupRef.current.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    }
  });

  const { frontGeo, backGeo, frontMat, backMat, whiteDepth, orangeDepth } = resources;

  return (
    <group ref={groupRef} position={position} scale={[0.5, 0.5, 0.5]}>
      <mesh 
        geometry={frontGeo} 
        material={frontMat} 
        position={[0, 0, orangeDepth / 2]} 
        castShadow 
      />
      <mesh 
        geometry={backGeo} 
        material={backMat} 
        position={[0, 0, -whiteDepth / 2]} 
        rotation={[0, Math.PI, Math.PI]} 
        castShadow 
      />
    </group>
  );
};

// --- メインコンポーネント ---
export const FallingBackground3D: React.FC = () => {
  const count = 25;

  const resources = useMemo(() => {
    const colorMap = createGenerativeTexture((ctx, s) => drawChunTexture(ctx, s, 'color'));
    const bumpMap = createGenerativeTexture((ctx, s) => drawChunTexture(ctx, s, 'bump'));
    const roughMap = createGenerativeTexture((ctx, s) => drawChunTexture(ctx, s, 'roughness'));
    
    bumpMap.colorSpace = THREE.NoColorSpace;
    roughMap.colorSpace = THREE.NoColorSpace;

    const baseParams = {
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    };

    const frontMat = new THREE.MeshPhysicalMaterial({
      ...baseParams,
      map: colorMap,
      bumpMap: bumpMap,
      bumpScale: 0.08,
      roughnessMap: roughMap,
      color: 0xffffff,
    });

    const backMat = new THREE.MeshPhysicalMaterial({
      ...baseParams,
      color: 0xffaa33,
      roughness: 0.2,
    });

    const TILE_WIDTH = 3.0;
    const TILE_HEIGHT = 4.0;
    const TILE_DEPTH = 1.8;
    const RADIUS = 0.25;
    const RATIO_WHITE = 0.7;
    const RATIO_ORANGE = 1.0 - RATIO_WHITE;

    const w = TILE_WIDTH / 2;
    const h = TILE_HEIGHT / 2;
    const r = RADIUS;

    const shape = new THREE.Shape();
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);

    const extrudeSettings = {
      steps: 1,
      depth: TILE_DEPTH,
      bevelEnabled: true,
      bevelThickness: RADIUS * 0.8,
      bevelSize: RADIUS * 0.8,
      bevelSegments: 3,
    };

    const whiteDepth = TILE_DEPTH * RATIO_WHITE;
    const orangeDepth = TILE_DEPTH * RATIO_ORANGE;

    const frontGeo = new THREE.ExtrudeGeometry(shape, { ...extrudeSettings, depth: whiteDepth });
    frontGeo.center();
    
    const posAttribute = frontGeo.attributes.position;
    const uvAttribute = frontGeo.attributes.uv;
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y = posAttribute.getY(i);
      const z = posAttribute.getZ(i);
      if (z > 0) {
        const u = (x + w) / (w * 2);
        const v = (y + h) / (h * 2);
        uvAttribute.setXY(i, u, v);
      }
    }

    const backGeo = new THREE.ExtrudeGeometry(shape, { ...extrudeSettings, depth: orangeDepth });
    backGeo.center();

    return { frontGeo, backGeo, frontMat, backMat, whiteDepth, orangeDepth };
  }, []);

  const items = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      position: [
        (Math.random() - 0.5) * 20,
        Math.random() * 30 + 10,
        (Math.random() - 0.5) * 10 - 5
      ],
      rotationSpeed: [
        Math.random() * 0.5 + 0.2, 
        Math.random() * 0.5 + 0.2, 
        Math.random() * 0.5 + 0.2 
      ],
      fallSpeed: Math.random() * 1.5 + 0.5,
      type: ['mahjong', 'sword', 'dice'][Math.floor(Math.random() * 3)],
    }));
  }, [count]);

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, width: '100vw', height: '100vh',
      zIndex: -1, pointerEvents: 'none',
      background: '#fdf6e3'
    }}>
      <Canvas camera={{ position: [0, 0, 15], fov: 50 }} shadows>
        <ambientLight intensity={0.8} />
        <directionalLight 
          position={[10, 20, 10]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-10, 5, -10]} intensity={1.2} color="#ffffff" />
        <Environment preset="city" />

        {items.map((props, i) => {
          if (props.type === 'sword') return <FallingSword key={i} {...props} />;
          if (props.type === 'dice') return <FallingDice key={i} {...props} />;
          return <FallingMahjongTile key={i} {...props} resources={resources} />;
        })}
      </Canvas>
    </div>
  );
};
