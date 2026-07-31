import { describe, expect, it } from 'vitest';
import { AI_LEVELS, createAi, isAiLevel } from './index';
import { getLegalActions } from '../engine/battle';
import { makeBattle } from '../engine/testkit';

describe('createAi — AI の生成口', () => {
  it('3段階すべてを生成でき、名前が区別できる', () => {
    const names = AI_LEVELS.map((level) => createAi(level).name);
    expect(names).toEqual(['random', 'greedy', 'lookahead']);
  });

  it('どの段階でも合法手しか返さない', () => {
    const state = makeBattle(['magyu', 'utsuwa', 'bara'], ['ishi', 'kenro', 'kami']);
    const legal = getLegalActions(state, 'p1');
    for (const level of AI_LEVELS) {
      expect(legal).toContainEqual(createAi(level, 5).chooseAction(state, 'p1'));
    }
  });

  it('Lv2 / Lv3 はシードに影響されない。乱数を使わないため', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    expect(createAi(2, 0).chooseAction(state, 'p1')).toEqual(
      createAi(2, 999).chooseAction(state, 'p1'),
    );
    expect(createAi(3, 0).chooseAction(state, 'p1')).toEqual(
      createAi(3, 999).chooseAction(state, 'p1'),
    );
  });

  it('isAiLevel は 1〜3 のみを通す', () => {
    expect([1, 2, 3].every(isAiLevel)).toBe(true);
    expect([0, 4, -1, 1.5].some(isAiLevel)).toBe(false);
  });
});
