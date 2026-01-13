import { Skill } from '../types';

// 100種類以上の技マスターデータ
export const SKILLS: Skill[] = [
  // ============================================
  // カテゴリー1: 通常攻撃系 (40種類) - 威力10〜40
  // ============================================
  { id: 1, name: 'パンチ', type: 'attack', power: 15, description: 'シンプルなパンチ', effect: 'none' },
  { id: 2, name: 'キック', type: 'attack', power: 18, description: '素早い蹴り', effect: 'none' },
  { id: 3, name: '体当たり', type: 'attack', power: 20, description: '全身で突進', effect: 'none' },
  { id: 4, name: 'ひっかく', type: 'attack', power: 12, description: '爪で引っかく', effect: 'none' },
  { id: 5, name: 'かみつく', type: 'attack', power: 22, description: '鋭い歯で噛む', effect: 'none' },
  { id: 6, name: 'ずつき', type: 'attack', power: 25, description: '頭突き攻撃', effect: 'none' },
  { id: 7, name: 'しっぽアタック', type: 'attack', power: 17, description: '尻尾を振り回す', effect: 'none' },
  { id: 8, name: 'ローキック', type: 'attack', power: 14, description: '足元を狙う', effect: 'none' },
  { id: 9, name: 'ハイキック', type: 'attack', power: 28, description: '高く蹴り上げる', effect: 'none' },
  { id: 10, name: 'エルボー', type: 'attack', power: 26, description: '肘打ち', effect: 'none' },
  { id: 11, name: 'ニーキック', type: 'attack', power: 24, description: '膝蹴り', effect: 'none' },
  { id: 12, name: 'チョップ', type: 'attack', power: 19, description: '手刀攻撃', effect: 'none' },
  { id: 13, name: 'ボディブロー', type: 'attack', power: 27, description: 'ボディに一撃', effect: 'none' },
  { id: 14, name: 'ストレート', type: 'attack', power: 30, description: 'まっすぐなパンチ', effect: 'none' },
  { id: 15, name: 'アッパーカット', type: 'attack', power: 32, description: '下から打ち上げる', effect: 'none' },
  { id: 16, name: 'フック', type: 'attack', power: 29, description: '横から打つパンチ', effect: 'none' },
  { id: 17, name: 'ジャブ', type: 'attack', power: 13, description: '素早い牽制パンチ', effect: 'none' },
  { id: 18, name: 'バックハンド', type: 'attack', power: 21, description: '手の甲で打つ', effect: 'none' },
  { id: 19, name: 'ショルダータックル', type: 'attack', power: 31, description: '肩から突進', effect: 'none' },
  { id: 20, name: 'スライディング', type: 'attack', power: 16, description: '滑り込み攻撃', effect: 'none' },
  { id: 21, name: 'とびげり', type: 'attack', power: 35, description: 'ジャンプして蹴る', effect: 'none' },
  { id: 22, name: 'ドロップキック', type: 'attack', power: 38, description: '両足で飛び蹴り', effect: 'none' },
  { id: 23, name: 'ラリアット', type: 'attack', power: 33, description: '腕を振り回す', effect: 'none' },
  { id: 24, name: 'バックドロップ', type: 'attack', power: 36, description: '投げ技', effect: 'none' },
  { id: 25, name: 'スープレックス', type: 'attack', power: 37, description: '豪快な投げ', effect: 'none' },
  { id: 26, name: 'DDT', type: 'attack', power: 34, description: '頭から落とす', effect: 'none' },
  { id: 27, name: 'パイルドライバー', type: 'attack', power: 40, description: '必殺の投げ技', effect: 'none' },
  { id: 28, name: 'ヘッドバット', type: 'attack', power: 23, description: '頭でぶつかる', effect: 'none' },
  { id: 29, name: 'エルボードロップ', type: 'attack', power: 25, description: '上から肘を落とす', effect: 'none' },
  { id: 30, name: 'レッグドロップ', type: 'attack', power: 26, description: '足を落とす', effect: 'none' },
  { id: 31, name: 'ニードロップ', type: 'attack', power: 24, description: '膝を落とす', effect: 'none' },
  { id: 32, name: 'ボムアタック', type: 'attack', power: 39, description: '爆発的な体当たり', effect: 'none' },
  { id: 33, name: 'スピンアタック', type: 'attack', power: 28, description: '回転しながら攻撃', effect: 'none' },
  { id: 34, name: 'ダイビングアタック', type: 'attack', power: 35, description: '飛び込み攻撃', effect: 'none' },
  { id: 35, name: 'ローリングアタック', type: 'attack', power: 27, description: '転がりながら攻撃', effect: 'none' },
  { id: 36, name: 'タックル', type: 'attack', power: 22, description: '低い姿勢で突進', effect: 'none' },
  { id: 37, name: 'ダッシュパンチ', type: 'attack', power: 31, description: '走ってからパンチ', effect: 'none' },
  { id: 38, name: 'ダッシュキック', type: 'attack', power: 33, description: '走ってから蹴る', effect: 'none' },
  { id: 39, name: 'スピンキック', type: 'attack', power: 36, description: '回転蹴り', effect: 'none' },
  { id: 40, name: 'フライングニー', type: 'attack', power: 38, description: '飛び膝蹴り', effect: 'none' },

  // ============================================
  // カテゴリー2: 高威力・リスク系 (15種類) - 威力60〜120
  // ============================================
  { id: 41, name: '破壊光線', type: 'attack', power: 120, description: '反動25%', effect: 'recoil', recoilRatio: 0.25 },
  { id: 42, name: 'メガトンパンチ', type: 'attack', power: 90, description: '命中率60%', effect: 'hit_rate', hitRate: 0.6 },
  { id: 43, name: 'すてみタックル', type: 'attack', power: 85, description: '与ダメの30%自傷', effect: 'self_damage', selfDamageRatio: 0.3 },
  { id: 44, name: 'ばくれつパンチ', type: 'attack', power: 100, description: '命中率50%', effect: 'hit_rate', hitRate: 0.5 },
  { id: 45, name: 'じごくぐるま', type: 'attack', power: 80, description: '反動20%', effect: 'recoil', recoilRatio: 0.2 },
  { id: 46, name: 'もろはのずつき', type: 'attack', power: 95, description: '反動30%', effect: 'recoil', recoilRatio: 0.3 },
  { id: 47, name: 'とっしん', type: 'attack', power: 75, description: '反動15%', effect: 'recoil', recoilRatio: 0.15 },
  { id: 48, name: 'わるあがき', type: 'attack', power: 70, description: '与ダメの25%自傷', effect: 'self_damage', selfDamageRatio: 0.25 },
  { id: 49, name: 'ウッドハンマー', type: 'attack', power: 88, description: '反動25%', effect: 'recoil', recoilRatio: 0.25 },
  { id: 50, name: 'フレアドライブ', type: 'attack', power: 92, description: '反動30%', effect: 'recoil', recoilRatio: 0.3 },
  { id: 51, name: 'ブレイブバード', type: 'attack', power: 90, description: '反動28%', effect: 'recoil', recoilRatio: 0.28 },
  { id: 52, name: 'げきりん', type: 'attack', power: 85, description: '命中率65%', effect: 'hit_rate', hitRate: 0.65 },
  { id: 53, name: 'きあいパンチ', type: 'attack', power: 105, description: '命中率55%', effect: 'hit_rate', hitRate: 0.55 },
  { id: 54, name: 'メガホーン', type: 'attack', power: 82, description: '命中率70%', effect: 'hit_rate', hitRate: 0.7 },
  { id: 55, name: 'ハイドロカノン', type: 'attack', power: 110, description: '反動35%', effect: 'recoil', recoilRatio: 0.35 },

  // ============================================
  // カテゴリー3: 最大HP増加・回復系 (15種類)
  // ============================================
  { id: 56, name: 'じこさいせい', type: 'heal', power: 50, description: 'HP50回復', effect: 'none' },
  { id: 57, name: 'ねむる', type: 'heal', power: 80, description: 'HP80回復', effect: 'none' },
  { id: 58, name: 'たまごうみ', type: 'heal', power: 60, description: 'HP60回復', effect: 'none' },
  { id: 59, name: 'つきのひかり', type: 'heal', power: 55, description: 'HP55回復', effect: 'none' },
  { id: 60, name: 'あさのひざし', type: 'heal', power: 55, description: 'HP55回復', effect: 'none' },
  { id: 61, name: 'こうごうせい', type: 'heal', power: 55, description: 'HP55回復', effect: 'none' },
  { id: 62, name: 'ねがいごと', type: 'heal', power: 45, description: 'HP45回復', effect: 'none' },
  { id: 63, name: 'いやしのすず', type: 'heal', power: 40, description: 'HP40回復', effect: 'none' },
  { id: 64, name: 'ビルドアップ', type: 'buff', power: 50, description: '最大HP+50/回復50', effect: 'max_hp_boost_with_heal', maxHpBoost: 50 },
  { id: 65, name: 'めいそう', type: 'buff', power: 30, description: '最大HP+30/回復30', effect: 'max_hp_boost_with_heal', maxHpBoost: 30 },
  { id: 66, name: 'のろい', type: 'buff', power: 0, description: '最大HP+40', effect: 'max_hp_boost', maxHpBoost: 40 },
  { id: 67, name: 'たくわえる', type: 'buff', power: 0, description: '最大HP+60', effect: 'max_hp_boost', maxHpBoost: 60 },
  { id: 68, name: 'ギガドレイン', type: 'attack', power: 30, description: '攻撃30+最大HP+30', effect: 'max_hp_boost_with_damage', maxHpBoost: 30 },
  { id: 69, name: 'メガドレイン', type: 'attack', power: 25, description: '攻撃25+最大HP+25', effect: 'max_hp_boost_with_damage', maxHpBoost: 25 },
  { id: 70, name: 'いのちのしずく', type: 'buff', power: 0, description: '最大HP+100', effect: 'max_hp_boost', maxHpBoost: 100 },

  // ============================================
  // カテゴリー4: MP操作系 (10種類) - 未実装のため基本効果で代替
  // ============================================
  { id: 71, name: 'エナジーチャージ', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 2, mpRegenDuration: 3 },
  { id: 72, name: 'パワーチャージ', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 4 },
  { id: 73, name: 'マジックチャージ', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 3 },
  { id: 74, name: 'スピリットチャージ', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 5 },
  { id: 75, name: 'フォーカスエナジー', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 2, mpRegenDuration: 2 },
  { id: 76, name: 'めいそう', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 3 },
  { id: 77, name: 'チャージビーム', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 3 },
  { id: 78, name: 'じゅうでん', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 2, mpRegenDuration: 3 },
  { id: 79, name: 'わるだくみ', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 4 },
  { id: 80, name: 'つるぎのまい', type: 'buff', power: 0, description: 'MP回復量UP', effect: 'mp_regen_boost', mpRegenBonus: 1, mpRegenDuration: 3 },

  // ============================================
  // カテゴリー5: 状態異常・継続ダメージ (10種類)
  // ============================================
  { id: 81, name: 'どくどく', type: 'buff', power: 0, description: '毒ダメージ5/3ターン', effect: 'poison', poisonDamage: 5, poisonDuration: 3 },
  { id: 82, name: 'どくのこな', type: 'buff', power: 0, description: '毒ダメージ4/3ターン', effect: 'poison', poisonDamage: 4, poisonDuration: 3 },
  { id: 83, name: 'どくばり', type: 'buff', power: 0, description: '毒ダメージ3/4ターン', effect: 'poison', poisonDamage: 3, poisonDuration: 4 },
  { id: 84, name: 'ヘドロばくだん', type: 'buff', power: 0, description: '毒ダメージ6/2ターン', effect: 'poison', poisonDamage: 6, poisonDuration: 2 },
  { id: 85, name: 'ヘドロこうげき', type: 'buff', power: 0, description: '毒ダメージ4/3ターン', effect: 'poison', poisonDamage: 4, poisonDuration: 3 },
  { id: 86, name: 'クロスポイズン', type: 'buff', power: 0, description: '毒ダメージ5/3ターン', effect: 'poison', poisonDamage: 5, poisonDuration: 3 },
  { id: 87, name: 'ダストシュート', type: 'buff', power: 0, description: '毒ダメージ7/2ターン', effect: 'poison', poisonDamage: 7, poisonDuration: 2 },
  { id: 88, name: 'ベノムショック', type: 'buff', power: 0, description: '毒ダメージ4/4ターン', effect: 'poison', poisonDamage: 4, poisonDuration: 4 },
  { id: 89, name: 'アシッドボム', type: 'buff', power: 0, description: '毒ダメージ5/3ターン', effect: 'poison', poisonDamage: 5, poisonDuration: 3 },
  { id: 90, name: 'ポイズンテール', type: 'buff', power: 0, description: '毒ダメージ4/3ターン', effect: 'poison', poisonDamage: 4, poisonDuration: 3 },

  // ============================================
  // カテゴリー6: 特殊演出系 (10種類)
  // ============================================
  { id: 91, name: 'ドレインパンチ', type: 'attack', power: 50, description: '与ダメの50%回復', effect: 'lifesteal', lifestealRatio: 0.5 },
  { id: 92, name: 'ドレインキック', type: 'attack', power: 45, description: '与ダメの50%回復', effect: 'lifesteal', lifestealRatio: 0.5 },
  { id: 93, name: 'すいとる', type: 'attack', power: 30, description: '与ダメの60%回復', effect: 'lifesteal', lifestealRatio: 0.6 },
  { id: 94, name: 'メガドレイン', type: 'attack', power: 40, description: '与ダメの50%回復', effect: 'drain', drainRatio: 0.5 },
  { id: 95, name: 'ゆめくい', type: 'attack', power: 55, description: '与ダメの50%回復', effect: 'drain', drainRatio: 0.5 },
  { id: 96, name: 'デスウイング', type: 'attack', power: 60, description: '与ダメの50%回復', effect: 'drain', drainRatio: 0.5 },
  { id: 97, name: 'パラボラチャージ', type: 'attack', power: 40, description: '与ダメの50%回復', effect: 'drain', drainRatio: 0.5 },
  { id: 98, name: 'ドレインキッス', type: 'attack', power: 35, description: '与ダメの60%回復', effect: 'drain', drainRatio: 0.6 },
  { id: 99, name: 'まもる', type: 'buff', power: 0, description: '次の攻撃80%カット', effect: 'protect', protectRatio: 0.8 },
  { id: 100, name: 'みきり', type: 'buff', power: 0, description: '次の攻撃75%カット', effect: 'protect', protectRatio: 0.75 },

  // ============================================
  // 追加の多彩な技 (10種類)
  // ============================================
  { id: 101, name: 'れんぞくぎり', type: 'attack', power: 15, description: '15%で2回連続', effect: 'multi_hit', multiHitChance: 0.15 },
  { id: 102, name: 'ダブルチョップ', type: 'attack', power: 20, description: '20%で2回連続', effect: 'multi_hit', multiHitChance: 0.2 },
  { id: 103, name: 'みだれづき', type: 'attack', power: 12, description: '25%で2回連続', effect: 'multi_hit', multiHitChance: 0.25 },
  { id: 104, name: 'おうふくビンタ', type: 'attack', power: 10, description: '30%で2回連続', effect: 'multi_hit', multiHitChance: 0.3 },
  { id: 105, name: 'つっぱり', type: 'attack', power: 8, description: '35%で2回連続', effect: 'multi_hit', multiHitChance: 0.35 },
  { id: 106, name: 'チャージ', type: 'buff', power: 0, description: '次ターン攻撃2倍', effect: 'charge', chargeBonus: 2 },
  { id: 107, name: 'ためる', type: 'buff', power: 0, description: '次ターン攻撃1.5倍', effect: 'charge', chargeBonus: 1.5 },
  { id: 108, name: 'きあいだめ', type: 'buff', power: 0, description: '次ターン攻撃1.8倍', effect: 'charge', chargeBonus: 1.8 },
  { id: 109, name: 'こらえる', type: 'buff', power: 0, description: '次の攻撃90%カット', effect: 'protect', protectRatio: 0.9 },
  { id: 110, name: 'てっぺき', type: 'buff', power: 0, description: '次の攻撃85%カット', effect: 'protect', protectRatio: 0.85 },

  // ============================================
  // 博打のゾーン限定技（通常リストには含めない）
  // ============================================
  { id: 200, name: 'ギガインパクト(超必殺)', type: 'special', power: 200, description: '威力200の超必殺技', effect: 'hit_rate', hitRate: 0.5 },
  { id: 201, name: '何もしない', type: 'special', power: 0, description: '運命に見放された...！', effect: 'none' },
];
