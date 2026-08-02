import { describe, expect, it } from 'vitest';
import { sortForDisplay, UNIT_DISPLAY_ORDER } from './order';
import { getUnit, UNIT_IDS, type UnitId } from '../data/units';
import { PARTY_SIZE } from '../engine/constants';
import type { Attribute } from '../engine/types';

describe('UNIT_DISPLAY_ORDER', () => {
  it('UNIT_IDS の並べ替えになっている。ユニット追加時の入れ忘れを防ぐ', () => {
    expect([...UNIT_DISPLAY_ORDER].sort()).toEqual([...UNIT_IDS].sort());
  });

  it('グー5体 → チョキ5体 → パー5体 の順に並ぶ', () => {
    const attributes = UNIT_DISPLAY_ORDER.map((id) => getUnit(id).attribute);
    const expected: Attribute[] = [
      ...Array<Attribute>(PARTY_SIZE).fill('gu'),
      ...Array<Attribute>(PARTY_SIZE).fill('choki'),
      ...Array<Attribute>(PARTY_SIZE).fill('pa'),
    ];
    expect(attributes).toEqual(expected);
  });

  /**
   * **UNIT_IDS を並べ替えてはいけない。** あちらはシミュレータの土台で、
   * 順序を変えると同じシードでも試合結果が変わり、reports/ と食い違う。
   * 両者が別物であることをここで示しておく。
   */
  it('UNIT_IDS とは別の並びである', () => {
    expect([...UNIT_DISPLAY_ORDER]).not.toEqual([...UNIT_IDS]);
  });
});

describe('sortForDisplay', () => {
  it('押した順に関係なく表示順へ揃える', () => {
    const picked: UnitId[] = ['ghost', 'ishi', 'bara', 'kami', 'tekken'];
    expect(sortForDisplay(picked)).toEqual(['ishi', 'tekken', 'bara', 'kami', 'ghost']);
  });

  it('引数を書き換えない', () => {
    const picked: UnitId[] = ['ghost', 'ishi'];
    const before = [...picked];
    sortForDisplay(picked);
    expect(picked).toEqual(before);
  });

  it('どの順で渡しても同じ並びになる', () => {
    const party: UnitId[] = ['utsuwa', 'kamakiri', 'funsai', 'issen', 'magyu'];
    const shuffled: UnitId[] = ['issen', 'funsai', 'utsuwa', 'magyu', 'kamakiri'];
    expect(sortForDisplay(party)).toEqual(sortForDisplay(shuffled));
  });

  it('空でも落ちない', () => {
    expect(sortForDisplay([])).toEqual([]);
  });
});
