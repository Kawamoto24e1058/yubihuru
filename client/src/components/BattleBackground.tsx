import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface BackgroundObject {
  id: number;
  type: 'crystal' | 'flame' | 'mahjong' | 'energy';
  position: { x: number; y: number; z: number };
  scale: number;
  rotation: number;
  opacity: number;
  isActive: boolean;
  element?: HTMLDivElement;
}

interface BattleBackgroundProps {
  currentSkill?: {
    name: string;
    effect?: string;
    type?: string;
  } | null;
  isBattleActive?: boolean;
}

const BattleBackground: React.FC<BattleBackgroundProps> = ({ 
  currentSkill, 
  isBattleActive = false 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [backgroundObjects, setBackgroundObjects] = useState<BackgroundObject[]>([]);
  const objectPoolRef = useRef<BackgroundObject[]>([]);
  const activeAnimationsRef = useRef<gsap.core.Tween[]>([]);

  // オブジェクトプールの初期化
  useEffect(() => {
    const pool: BackgroundObject[] = [];
    for (let i = 0; i < 50; i++) {
      pool.push({
        id: i,
        type: 'crystal',
        position: { x: 0, y: 0, z: 0 },
        scale: 0,
        rotation: 0,
        opacity: 0,
        isActive: false
      });
    }
    objectPoolRef.current = pool;
    setBackgroundObjects([...pool]);
  }, []);

  // 技に応じた背景エフェクトをトリガー
  const triggerBackgroundEffect = (skillType: string, skillEffect?: string) => {
    if (!containerRef.current) return;

    // 技の種類に応じてオブジェクトタイプを決定
    let objectType: BackgroundObject['type'] = 'crystal';
    const objectCount = 20;
    
    switch (skillEffect) {
      case 'comeback':
        objectType = 'energy'; // 起死回生 - エネルギーオブジェクト
        break;
      case 'instant_win':
        objectType = 'flame'; // 即時勝利 - 炎のオブジェクト
        break;
      case 'multi_hit':
        objectType = 'mahjong'; // 多段攻撃 - 麻雀牌
        break;
      default:
        if (skillType === 'attack') {
          objectType = 'crystal'; // 攻撃技 - クリスタル
        } else if (skillType === 'heal') {
          objectType = 'energy'; // 回復技 - エネルギー
        }
    }

    // 利用可能なオブジェクトをプールから取得
    const availableObjects = objectPoolRef.current.filter(obj => !obj.isActive);
    const objectsToUse = availableObjects.slice(0, Math.min(objectCount, availableObjects.length));

    objectsToUse.forEach((obj, index) => {
      obj.isActive = true;
      obj.type = objectType;
      
      // ランダムな位置を設定
      const angle = (Math.PI * 2 * index) / objectsToUse.length + Math.random() * 0.5;
      const radius = 150 + Math.random() * 100;
      
      obj.position = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.6 + (Math.random() - 0.5) * 50,
        z: Math.random() * 50 - 25
      };
      
      obj.scale = 0.5 + Math.random() * 0.5;
      obj.rotation = Math.random() * 360;
      obj.opacity = 0;

      // DOM要素を取得
      const element = document.getElementById(`bg-object-${obj.id}`) as HTMLDivElement;
      if (element) {
        obj.element = element;
        
        // GSAPアニメーションでフェードイン
        const tl = gsap.timeline();
        
        // 初期状態を設定
        gsap.set(element, {
          opacity: 0,
          scale: 0,
          rotation: obj.rotation,
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z
        });

        // フェードインアニメーション
        tl.to(element, {
          opacity: 0.8,
          scale: obj.scale,
          duration: 0.8,
          ease: "power2.out",
          delay: index * 0.05 // 少しずつ遅延させて出現
        })
        .to(element, {
          rotation: obj.rotation + 360,
          duration: 3 + Math.random() * 2,
          ease: "none",
          repeat: -1
        }, 0);

        activeAnimationsRef.current.push(tl as any);
      }
    });

    // 状態を更新
    setBackgroundObjects([...objectPoolRef.current]);

    // 3秒後にオブジェクトを非表示にする
    setTimeout(() => {
      hideBackgroundObjects(objectsToUse);
    }, 3000);
  };

  // オブジェクトを非表示にする
  const hideBackgroundObjects = (objects: BackgroundObject[]) => {
    objects.forEach(obj => {
      if (obj.element) {
        const tl = gsap.to(obj.element, {
          opacity: 0,
          scale: 0,
          duration: 0.5,
          ease: "power2.in",
          onComplete: () => {
            obj.isActive = false;
            obj.opacity = 0;
            obj.scale = 0;
            setBackgroundObjects([...objectPoolRef.current]);
          }
        });
        activeAnimationsRef.current.push(tl);
      }
    });
  };

  // スキル変更を監視
  useEffect(() => {
    if (currentSkill && isBattleActive) {
      triggerBackgroundEffect(currentSkill.type || 'attack', currentSkill.effect);
    }
  }, [currentSkill, isBattleActive]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      activeAnimationsRef.current.forEach(tween => tween.kill());
    };
  }, []);

  // オブジェクトのスタイルを取得
  const getObjectStyle = (obj: BackgroundObject): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: `translate(-50%, -50%) translate3d(${obj.position.x}px, ${obj.position.y}px, ${obj.position.z}px)`,
      opacity: obj.opacity,
      scale: obj.scale,
      pointerEvents: 'none',
      transition: 'none'
    };

    switch (obj.type) {
      case 'crystal':
        return {
          ...baseStyle,
          width: '30px',
          height: '30px',
          background: 'linear-gradient(45deg, #60A5FA, #3B82F6, #1D4ED8)',
          clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)'
        };
      case 'flame':
        return {
          ...baseStyle,
          width: '40px',
          height: '40px',
          background: 'radial-gradient(circle, #FCD34D, #F97316, #DC2626)',
          borderRadius: '50%',
          boxShadow: '0 0 30px rgba(251, 146, 60, 0.8)',
          filter: 'blur(2px)'
        };
      case 'mahjong':
        return {
          ...baseStyle,
          width: '35px',
          height: '45px',
          background: 'linear-gradient(135deg, #F3F4F6, #D1D5DB)',
          border: '2px solid #6B7280',
          borderRadius: '4px',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)'
        };
      case 'energy':
        return {
          ...baseStyle,
          width: '25px',
          height: '25px',
          background: 'radial-gradient(circle, #A78BFA, #7C3AED, #5B21B6)',
          borderRadius: '50%',
          boxShadow: '0 0 25px rgba(167, 139, 250, 0.9)',
          filter: 'blur(1px)'
        };
      default:
        return baseStyle;
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-10 overflow-hidden"
      style={{ perspective: '1000px' }}
    >
      {backgroundObjects.map(obj => (
        <div
          key={obj.id}
          id={`bg-object-${obj.id}`}
          style={getObjectStyle(obj)}
        />
      ))}
    </div>
  );
};

export default BattleBackground;
