import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { IndexFingerHand, MiddleFingerHand } from './HandModels'

// 背景の燃えるエフェクト
const BurningBackground: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null!)
  
  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.z += 0.001
  })
  
  return (
    <mesh ref={meshRef} position={[0, 0, -10]}>
      <planeGeometry args={[50, 50]} />
      <meshBasicMaterial color="#ff6b35" />
    </mesh>
  )
}

// 牌の落下コンポーネント
const FallingTile: React.FC<{ position: [number, number, number], rotationSpeed: [number, number, number], fallSpeed: number }> = ({ position, rotationSpeed, fallSpeed }) => {
  const meshRef = useRef<THREE.Mesh>(null!)
  
  useFrame((state, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * rotationSpeed[0]
    meshRef.current.rotation.y += delta * rotationSpeed[1]
    meshRef.current.rotation.z += delta * rotationSpeed[2]
    meshRef.current.position.y -= delta * fallSpeed
    
    if (meshRef.current.position.y < -20) {
      meshRef.current.position.y = 20
      meshRef.current.position.x = (Math.random() - 0.5) * 25
    }
  })
  
  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={[1, 1, 0.2]} />
      <meshStandardMaterial color="#ff6b35" />
    </mesh>
  )
}

// 背景全体を管理するコンポーネント
export const BackgroundView: React.FC<{ opacity?: number }> = ({ opacity = 0.4 }) => {
  const [tiles, setTiles] = useState<Array<{ id: number; position: [number, number, number]; rotationSpeed: [number, number, number]; fallSpeed: number }>>([])
  
  useEffect(() => {
    const newTiles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      position: [(Math.random() - 0.5) * 25, Math.random() * 20 + 10, (Math.random() - 0.5) * 10] as [number, number, number],
      rotationSpeed: [Math.random() * 0.01, Math.random() * 0.01, Math.random() * 0.01] as [number, number, number],
      fallSpeed: Math.random() * 2 + 1
    }))
    setTiles(newTiles)
  }, [])
  
  return (
    <>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <BurningBackground />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      {tiles.map((tile) => (
        <FallingTile
          key={tile.id}
          position={tile.position}
          rotationSpeed={tile.rotationSpeed}
          fallSpeed={tile.fallSpeed}
        />
      ))}
      <IndexFingerHand position={[0, 0, 0]} rotationSpeed={[0.001, 0.002, 0.003]} fallSpeed={0.5} />
      <MiddleFingerHand position={[5, 5, 0]} rotationSpeed={[0.002, 0.001, 0.001]} fallSpeed={0.3} />
    </>
  )
}
