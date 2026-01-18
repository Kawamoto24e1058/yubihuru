import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// --- リアルな手モデル (骨格シミュレーション版) ---
const RealHand: React.FC<{ extendedFinger: "index" | "middle" }> = ({ extendedFinger }) => {
  const skinMat = new THREE.MeshPhysicalMaterial({ 
    color: '#ffdbac', 
    roughness: 0.6,
    metalness: 0.1
  });

  // 指一本分を描画する関数（改善版）
  const Finger = ({ 
    fingerType, 
    isExtended, 
    position, 
    rotation 
  }: { 
    fingerType: "thumb" | "index" | "middle" | "ring" | "pinky",
    isExtended: boolean, 
    position: [number, number, number],
    rotation: [number, number, number]
  }) => {
    // 指の太さを調整
    const fingerRadius = fingerType === "thumb" ? 0.12 : 0.09;
    const fingerLength = fingerType === "thumb" ? 0.5 : 0.7;
    
    // 伸ばしている指は真っ直ぐ、握っている指は自然に曲げる
    const baseRotation = isExtended ? 0 : Math.PI * 0.5;
    const middleRotation = isExtended ? 0 : Math.PI * 0.6;
    const tipRotation = isExtended ? 0 : Math.PI * 0.7;

    // 親指の場合は特別な角度で握る
    const thumbBaseRotation = fingerType === "thumb" ? Math.PI * 0.4 : baseRotation;
    const thumbMiddleRotation = fingerType === "thumb" ? Math.PI * 0.5 : middleRotation;
    const thumbTipRotation = fingerType === "thumb" ? Math.PI * 0.6 : tipRotation;

    return (
      <group position={position} rotation={rotation}>
        {/* 指の根元部分（手掌側） */}
        <mesh rotation={[fingerType === "thumb" ? thumbBaseRotation : baseRotation, 0, 0]} position={[0, fingerLength * 0.15, 0]}>
          <capsuleGeometry args={[fingerRadius, fingerLength * 0.3, 8, 16]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
        
        {/* 指の中間部分（関節） */}
        <mesh rotation={[fingerType === "thumb" ? thumbBaseRotation + thumbMiddleRotation : baseRotation + middleRotation, 0, 0]} position={[0, fingerLength * 0.35, 0]}>
          <capsuleGeometry args={[fingerRadius * 0.9, fingerLength * 0.25, 8, 16]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
        
        {/* 指の先端部分 */}
        <mesh rotation={[fingerType === "thumb" ? thumbBaseRotation + thumbMiddleRotation + thumbTipRotation : baseRotation + middleRotation + tipRotation, 0, 0]} position={[0, fingerLength * 0.55, 0]}>
          <capsuleGeometry args={[fingerRadius * 0.8, fingerLength * 0.2, 8, 16]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
      </group>
    );
  };

  return (
    <group scale={[1.2, 1.2, 1.2]}>
      {/* 手のひら（よりリアルな形状） */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.0, 1.2, 0.3]} />
        <primitive object={skinMat} attach="material" />
      </mesh>
      
      {/* 手のひらの角を丸める */}
      <mesh position={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.5, 0.5, 0.3, 32]} />
        <primitive object={skinMat} attach="material" />
      </mesh>

      {/* 手のひらの縁を滑らかにする */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.5, 0.4, 0.2, 16]} />
        <primitive object={skinMat} attach="material" />
      </mesh>
      
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.5, 0.4, 0.2, 16]} />
        <primitive object={skinMat} attach="material" />
      </mesh>

      {/* 親指（人差し指と薬指の間に軽く添える） */}
      <Finger 
        fingerType="thumb"
        isExtended={false}
        position={[-0.35, 0.1, 0.2]}
        rotation={[Math.PI * 0.2, Math.PI * 0.1, Math.PI * 0.4]}
      />

      {/* 人差し指 */}
      <Finger 
        fingerType="index"
        isExtended={extendedFinger === "index"}
        position={[-0.25, 0.6, 0]}
        rotation={[0, 0, 0]}
      />

      {/* 中指 */}
      <Finger 
        fingerType="middle"
        isExtended={extendedFinger === "middle"}
        position={[0, 0.6, 0]}
        rotation={[0, 0, 0]}
      />

      {/* 薬指 */}
      <Finger 
        fingerType="ring"
        isExtended={false}
        position={[0.25, 0.6, 0]}
        rotation={[0, 0, 0]}
      />

      {/* 小指 */}
      <Finger 
        fingerType="pinky"
        isExtended={false}
        position={[0.5, 0.6, 0]}
        rotation={[0, 0, 0]}
      />
    </group>
  );
};

// 人差し指を立てた手
export const IndexFingerHand: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
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
export const MiddleFingerHand: React.FC<any> = ({ position, rotationSpeed, fallSpeed }) => {
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
