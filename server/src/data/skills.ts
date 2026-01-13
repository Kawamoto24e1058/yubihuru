import { Skill } from '../types';

// シンプルな技マスターデータ
export const SKILLS: Skill[] = [
  // 攻撃技
  {
    id: 1,
    name: '体当たり(弱)',
    type: 'attack',
    power: 30,
    description: 'シンプルな突進攻撃',
    effect: 'none',
  },
  {
    id: 2,
    name: '破壊光線(強/反動あり)',
    type: 'attack',
    power: 120,
    description: '圧倒的火力だが反動ダメージを受ける',
    effect: 'recoil',
    recoilRatio: 0.25,
  },
  {
    id: 3,
    name: '連続パンチ(中)',
    type: 'attack',
    power: 60,
    description: '素早い連撃でダメージを与える',
    effect: 'none',
  },

  // 回復技
  {
    id: 4,
    name: '自己再生(HP回復)',
    type: 'heal',
    power: 40,
    description: '自分のHPを回復する',
    effect: 'none',
  },
  {
    id: 5,
    name: 'ドレインパンチ(攻撃+回復)',
    type: 'attack',
    power: 50,
    description: '与えたダメージの一部で回復する',
    effect: 'lifesteal',
    lifestealRatio: 0.5,
  },

  // 補助技
  {
    id: 6,
    name: '瞑想(次からMP回復量UP)',
    type: 'buff',
    power: 0,
    description: 'しばらくMP回復量を上げる',
    effect: 'mp_regen_boost',
    mpRegenBonus: 1,
    mpRegenDuration: 3,
  },
  {
    id: 7,
    name: 'どくどく(継続ダメージ)',
    type: 'buff',
    power: 0,
    description: '相手に継続的な毒ダメージを与える',
    effect: 'poison',
    poisonDamage: 10,
    poisonDuration: 3,
  },
];
