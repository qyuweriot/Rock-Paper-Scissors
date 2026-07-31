/**
 * ダメージ計算と相性判定 (SPEC §2 / §4)。
 * 純粋関数のみ。状態は持たない。
 */

import { DAMAGE_FLOOR, TYPE_ADVANTAGE, TYPE_DISADVANTAGE, TYPE_NEUTRAL } from './constants';
import type { Attribute, DamageSpec } from './types';

// --- 相性 -------------------------------------------------------------------

export type Matchup = 'advantage' | 'neutral' | 'disadvantage';

/** グー > チョキ > パー > グー。key が value に対して有利 (SPEC §2) */
const BEATS: Record<Attribute, Attribute> = {
  gu: 'choki',
  choki: 'pa',
  pa: 'gu',
};

/** 攻撃側から見た相性 */
export function getMatchup(attacker: Attribute, defender: Attribute): Matchup {
  if (BEATS[attacker] === defender) return 'advantage';
  if (BEATS[defender] === attacker) return 'disadvantage';
  return 'neutral';
}

const MATCHUP_MODIFIER: Record<Matchup, number> = {
  advantage: TYPE_ADVANTAGE,
  neutral: TYPE_NEUTRAL,
  disadvantage: TYPE_DISADVANTAGE,
};

/** 相性補正。ダメージへの加算として扱う (SPEC §2) */
export function getTypeModifier(attacker: Attribute, defender: Attribute): number {
  return MATCHUP_MODIFIER[getMatchup(attacker, defender)];
}

// --- ダメージ ---------------------------------------------------------------

export interface DamageInput {
  damage: DamageSpec;
  attacker: {
    attribute: Attribute;
    /** 攻勢修正の合計 (untilSwitch + turn) */
    atkMod: number;
  };
  defender: {
    attribute: Attribute;
    /** 守勢修正の合計。相手の技によるダメージにのみ効く (SPEC §4.3) */
    defMod: number;
  };
}

/**
 * 技1回分のダメージを確定させる。
 *
 * - `none`  → 0
 * - `fixed` → 表記どおりの値。**相性補正・攻勢修正・守勢修正をすべて無視する** (SPEC §4.2)
 * - `normal`→ max(0, 威力 + 相性補正 + 攻勢修正 − 守勢修正) (SPEC §4.1)
 *
 * 毒・設置・反動・反射も固定ダメージだが、技を経由しないためこの関数は通らない。
 */
export function computeDamage(input: DamageInput): number {
  const { damage, attacker, defender } = input;

  switch (damage.kind) {
    case 'none':
      return 0;

    case 'fixed':
      return damage.amount;

    case 'normal': {
      const raw =
        damage.power +
        getTypeModifier(attacker.attribute, defender.attribute) +
        attacker.atkMod -
        defender.defMod;
      return Math.max(DAMAGE_FLOOR, raw);
    }
  }
}
