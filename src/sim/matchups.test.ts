import { describe, expect, it } from 'vitest';
import { allSelectionPairs, allSelections, sampleSelectionPairs, singlesPairs } from './matchups';
import { UNIT_IDS } from '../data/units';
import { TEAM_SIZE } from '../engine/constants';

describe('matchups — 総当たりの組み合わせ生成', () => {
  it('選出は 15C3 = 455 通り', () => {
    const selections = allSelections();
    expect(selections).toHaveLength(455);
    expect(selections.every((s) => s.length === TEAM_SIZE)).toBe(true);
  });

  it('選出に重複したユニットは入らない', () => {
    for (const selection of allSelections()) {
      expect(new Set(selection).size).toBe(TEAM_SIZE);
    }
  });

  it('選出はすべて異なる。同じ組み合わせが2回出ない', () => {
    const selections = allSelections();
    expect(new Set(selections.map((s) => s.join(','))).size).toBe(selections.length);
  });

  it('全ユニットが均等に登場する。14C2 = 91 回ずつ', () => {
    const counts = new Map<string, number>();
    for (const selection of allSelections()) {
      for (const id of selection) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(UNIT_IDS.length);
    expect([...counts.values()].every((n) => n === 91)).toBe(true);
  });

  it('対戦は 455×456/2 = 103,740 通り。ミラーを含み、向きは片側のみ', () => {
    expect(allSelectionPairs()).toHaveLength(103740);
  });

  it('サンプリングは決定論的。同じシードなら同じ抽出', () => {
    expect(sampleSelectionPairs(500, 7)).toEqual(sampleSelectionPairs(500, 7));
  });

  it('シードが違えば抽出も変わる', () => {
    expect(sampleSelectionPairs(500, 1)).not.toEqual(sampleSelectionPairs(500, 2));
  });

  it('抽出に重複が出ない', () => {
    const sampled = sampleSelectionPairs(2000, 0);
    expect(sampled).toHaveLength(2000);
    expect(new Set(sampled.map((p) => p.join(','))).size).toBe(2000);
  });

  it('要求数が母集団以上なら全件を返す', () => {
    expect(sampleSelectionPairs(999999, 0)).toHaveLength(103740);
  });

  it('1対1の対面は 15×15 = 225 通り。向きを区別する', () => {
    const pairs = singlesPairs();
    expect(pairs).toHaveLength(225);
    expect(pairs).toContainEqual(['funsai', 'hasamimushi']);
    expect(pairs).toContainEqual(['hasamimushi', 'funsai']);
  });
});
