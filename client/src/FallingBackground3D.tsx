import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// --- ヘルパー関数: テクスチャ生成 (Canvas API) ---
const createGenerativeTexture = (drawFunction: (ctx: CanvasRenderingContext2D, size: number) => void) => {
  const size = 512; // パフォーマンスのため少し解像度調整 (1024 -> 512)
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
  const fontStyle = 'bold 380px "Hiragino Mincho ProN", serif'; // サイズに合わせて調整
  
  // 背景塗りつぶし
  if (type === 'color' || type === 'bump') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
  } else { // roughness
    ctx.fillStyle = '#404040'; 
    ctx.fillRect(0, 0, size, size);
  }

  // 文字描画設定
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
  } else { // roughness
    ctx.fillStyle = '#808080';
  }

  ctx.fillText('中', size / 2, size / 2);
};

// --- 落下する麻雀牌コンポーネント ---
const FallingMahjongTile = ({ 
  position, 
  rotationSpeed, 
  fallSpeed, 
  resources 
}: any) => {
  // グループ（前面＋背面）全体を動かすためのRef
  const groupRef = useRef<THREE.Group>(null!);
  const [initialY] = useState(position[1]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    // 1. 回転
    groupRef.current.rotation.x += delta * rotationSpeed[0];
    groupRef.current.rotation.y += delta * rotationSpeed[1];
    groupRef.current.rotation.z += delta * rotationSpeed[2];

    // 2. 落下
    groupRef.current.position.y -= delta * fallSpeed;

    // 3. ループ処理
    if (groupRef.current.position.y < -15) {
      groupRef.current.position.y = initialY + Math.random() * 5;
      groupRef.current.position.x = (Math.random() - 0.5) * 20;
      // 落ちてくるときのリセットで回転角度もランダムに
      groupRef.current.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    }
  });

  // resourcesからジオメトリとマテリアルを取り出す
  const { frontGeo, backGeo, frontMat, backMat, whiteDepth, orangeDepth } = resources;

  return (
    <group ref={groupRef} position={position} scale={[0.5, 0.5, 0.5]}>
      {/* 前面（白・文字あり） */}
      <mesh 
        geometry={frontGeo} 
        material={frontMat} 
        position={[0, 0, orangeDepth / 2]} 
        castShadow 
      />
      {/* 背面（オレンジ） */}
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
export const FallingBackground3D = () => {
  const count = 25; // 牌の数（重い場合は減らしてください）

  // --- リソースの一括生成 (useMemoで1回だけ実行) ---
  const resources = useMemo(() => {
    // 1. テクスチャ作成
    const colorMap = createGenerativeTexture((ctx, s) => drawChunTexture(ctx, s, 'color'));
    const bumpMap = createGenerativeTexture((ctx, s) => drawChunTexture(ctx, s, 'bump'));
    const roughMap = createGenerativeTexture((ctx, s) => drawChunTexture(ctx, s, 'roughness'));
    
    bumpMap.colorSpace = THREE.NoColorSpace;
    roughMap.colorSpace = THREE.NoColorSpace;

    // 2. マテリアル作成
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
      color: 0xffaa33, // 麻雀牌の背中の色
      roughness: 0.2,
    });

    // 3. ジオメトリ（形状）作成
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
      bevelSegments: 3, // パフォーマンスのため少し削減
    };

    const whiteDepth = TILE_DEPTH * RATIO_WHITE;
    const orangeDepth = TILE_DEPTH * RATIO_ORANGE;

    // 前面ジオメトリ
    const frontGeo = new THREE.ExtrudeGeometry(shape, { ...extrudeSettings, depth: whiteDepth, bevelBack: false });
    frontGeo.center();
    
    // UVマッピング補正 (文字を綺麗に貼るために必須)
    const posAttribute = frontGeo.attributes.position;
    const uvAttribute = frontGeo.attributes.uv;
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y = posAttribute.getY(i);
      const z = posAttribute.getZ(i);
      if (z >