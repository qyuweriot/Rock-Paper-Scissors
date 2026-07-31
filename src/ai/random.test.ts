import { describe, expect, it } from 'vitest';
import { createRandomAi } from './random';
import { getLegalActions } from '../engine/battle';
import { makeBattle, setHp, unit } from '../engine/testkit';

/** Lv1: ランダム (PLAN §266)。他のAIを測るための基準線 */
describe('createRandomAi — Lv1', () => {
  it('合法手しか返さない', () => {
    const ai = createRandomAi(1);
    const state = makeBattle(['magyu', 'utsuwa', 'bara'], ['ishi', 'kenro', 'kami']);
    const legal = getLegalActions(state, 'p1');

    for (let i = 0; i < 200; i++) {
      expect(legal).toContainEqual(ai.chooseAction(state, 'p1'));
    }
  });

  it('同じシードなら選択列が完全に一致する (PLAN §3.4)', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    const a = createRandomAi(42);
    const b = createRandomAi(42);

    for (let i = 0; i < 50; i++) {
      expect(a.chooseAction(state, 'p1')).toEqual(b.chooseAction(state, 'p1'));
    }
  });

  it('シードが違えば選択列も変わる', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    const a = createRandomAi(1);
    const b = createRandomAi(2);

    const seriesA = Array.from({ length: 50 }, () => JSON.stringify(a.chooseAction(state, 'p1')));
    const seriesB = Array.from({ length: 50 }, () => JSON.stringify(b.chooseAction(state, 'p1')));
    expect(seriesA).not.toEqual(seriesB);
  });

  it('選択肢を偏りなく引く。技も交代も現れる', () => {
    const ai = createRandomAi(7);
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['ishi']);

    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) kinds.add(ai.chooseAction(state, 'p1').kind);
    expect(kinds).toEqual(new Set(['move', 'switch']));
  });

  it('交代先は生存ユニットのみ', () => {
    const ai = createRandomAi(3);
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['ishi']);
    setHp(state, 'p1', 0, 0);
    unit(state, 'p1', 0).fainted = true;

    for (let i = 0; i < 100; i++) {
      expect(ai.chooseReplacement(state, 'p1')).not.toBe(0);
    }
  });
});
