import { describe, expect, it } from 'vitest';
import { computeDamage, getMatchup, getTypeModifier } from './damage';
import { TYPE_ADVANTAGE, TYPE_DISADVANTAGE, TYPE_NEUTRAL } from './constants';
import type { Attribute, DamageSpec } from './types';
import { getMove, UNITS } from '../data/units';

/** テストの記述量を減らすための薄いラッパ。修正値は既定で0 */
function dmg(
  damage: DamageSpec,
  attackerAttribute: Attribute,
  defenderAttribute: Attribute,
  mods: { atk?: number; def?: number } = {},
): number {
  return computeDamage({
    damage,
    attacker: { attribute: attackerAttribute, atkMod: mods.atk ?? 0 },
    defender: { attribute: defenderAttribute, defMod: mods.def ?? 0 },
  });
}

const power = (p: number): DamageSpec => ({ kind: 'normal', power: p });

describe('相性判定 (SPEC §2)', () => {
  it('グー > チョキ > パー > グー の三竦みが成立する', () => {
    expect(getMatchup('gu', 'choki')).toBe('advantage');
    expect(getMatchup('choki', 'pa')).toBe('advantage');
    expect(getMatchup('pa', 'gu')).toBe('advantage');
  });

  it('逆向きは不利になる', () => {
    expect(getMatchup('choki', 'gu')).toBe('disadvantage');
    expect(getMatchup('pa', 'choki')).toBe('disadvantage');
    expect(getMatchup('gu', 'pa')).toBe('disadvantage');
  });

  it('同属性は互角', () => {
    expect(getMatchup('gu', 'gu')).toBe('neutral');
    expect(getMatchup('choki', 'choki')).toBe('neutral');
    expect(getMatchup('pa', 'pa')).toBe('neutral');
  });

  it('補正値は 有利+25 / 互角0 / 不利−10', () => {
    expect(getTypeModifier('gu', 'choki')).toBe(TYPE_ADVANTAGE);
    expect(getTypeModifier('gu', 'gu')).toBe(TYPE_NEUTRAL);
    expect(getTypeModifier('gu', 'pa')).toBe(TYPE_DISADVANTAGE);
  });
});

/**
 * PLAN §166 の完了条件。
 * 威力25・HP100 を基準に、設計上の想定撃破速度 (SPEC §2) を再現する。
 */
describe('想定撃破速度 (SPEC §2) — Phase 1 の完了条件', () => {
  const BASE_POWER = 25;
  const BASE_HP = 100;

  const hitsToKill = (damagePerHit: number) => Math.ceil(BASE_HP / damagePerHit);

  it('有利対面は 1発50ダメージ・2発で撃破', () => {
    const d = dmg(power(BASE_POWER), 'gu', 'choki');
    expect(d).toBe(50);
    expect(hitsToKill(d)).toBe(2);
  });

  it('互角対面は 1発25ダメージ・4発で撃破', () => {
    const d = dmg(power(BASE_POWER), 'gu', 'gu');
    expect(d).toBe(25);
    expect(hitsToKill(d)).toBe(4);
  });

  it('不利対面は 1発15ダメージ・7発で撃破', () => {
    const d = dmg(power(BASE_POWER), 'gu', 'pa');
    expect(d).toBe(15);
    expect(hitsToKill(d)).toBe(7);
  });
});

describe('通常ダメージ (SPEC §4.1)', () => {
  it('攻勢修正は加算される', () => {
    expect(dmg(power(25), 'gu', 'gu', { atk: 10 })).toBe(35);
  });

  it('守勢修正は減算される', () => {
    expect(dmg(power(25), 'gu', 'gu', { def: 10 })).toBe(15);
  });

  it('攻勢と守勢は打ち消し合う', () => {
    expect(dmg(power(25), 'gu', 'gu', { atk: 10, def: 10 })).toBe(25);
  });

  it('ダメージの下限は0で、負にはならない', () => {
    // 威力10・不利(−10)・守勢+10 → 素の計算は −10
    expect(dmg(power(10), 'gu', 'pa', { def: 10 })).toBe(0);
  });

  it('ダメージなしの技は常に0', () => {
    expect(dmg({ kind: 'none' }, 'gu', 'choki', { atk: 20 })).toBe(0);
  });
});

describe('固定ダメージ (SPEC §4.2)', () => {
  const fixed: DamageSpec = { kind: 'fixed', amount: 20 };

  it('相性補正を無視する', () => {
    expect(dmg(fixed, 'gu', 'choki')).toBe(20); // 有利でも増えない
    expect(dmg(fixed, 'gu', 'pa')).toBe(20); // 不利でも減らない
  });

  it('攻勢修正・守勢修正のいずれも無視する', () => {
    expect(dmg(fixed, 'gu', 'gu', { atk: 20 })).toBe(20);
    expect(dmg(fixed, 'gu', 'gu', { def: 20 })).toBe(20);
  });

  it('はさみの守勢+10 は手のひらの固定20 を軽減できない (SPEC §10.10)', () => {
    const tenohiraMove = getMove(UNITS.tenohira, 0);
    expect(tenohiraMove.damage).toEqual({ kind: 'fixed', amount: 20 });

    const taken = dmg(tenohiraMove.damage, 'pa', 'choki', { def: 10 });
    expect(taken).toBe(20);
  });
});

describe('実データとの突き合わせ', () => {
  it('一閃の積みテーブルが SPEC §10.9 と一致する', () => {
    const slash = getMove(UNITS.issen, 0); // 威力35

    // [積み回数, 攻勢修正, 有利対面, 互角対面]
    const table: [number, number, number, number][] = [
      [0, 0, 60, 35],
      [1, 10, 70, 45],
      [2, 20, 80, 55],
    ];

    for (const [, atk, advantage, neutral] of table) {
      // チョキ → パー が有利、チョキ → チョキ が互角
      expect(dmg(slash.damage, 'choki', 'pa', { atk })).toBe(advantage);
      expect(dmg(slash.damage, 'choki', 'choki', { atk })).toBe(neutral);
    }
  });

  it('粉砕は有利対面70 / 不利対面35 (SPEC §10.1)', () => {
    const smash = getMove(UNITS.funsai, 0); // 威力45

    expect(dmg(smash.damage, 'gu', 'choki')).toBe(70);
    expect(dmg(smash.damage, 'gu', 'pa')).toBe(35);
  });

  it('粉砕は威力が反動を下回るため、互角のHP50 を一撃で倒せない (SPEC §10.1)', () => {
    const smash = getMove(UNITS.funsai, 0);
    const neutral = dmg(smash.damage, 'gu', 'gu');

    expect(neutral).toBe(45);
    expect(neutral).toBeLessThan(UNITS.funsai.maxHp); // ミラーでは倒しきれない
    expect(smash.recoil).toBeGreaterThan(neutral);
  });

  it('粉砕は反動50。撃破に失敗すればHP50を削り切って自滅する (SPEC §10.1)', () => {
    const smash = getMove(UNITS.funsai, 0);
    expect(smash.recoil).toBe(50);
    expect(UNITS.funsai.maxHp).toBe(50);
  });
});
