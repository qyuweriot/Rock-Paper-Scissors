import { describe, expect, it } from 'vitest';
import { getLegalActions, resolveTurn } from '../battle';
import { eventsOfType, makeBattle, move, setHp, unit } from '../testkit';
import { UTSUWA_HEAL } from '../constants';
import type { Action } from '../types';

/**
 * 器 pa HP110 中 / 技0 威力15 / 技1 控え1体を選択してHP15回復 (SPEC §10.13)
 */
const healBench = (partyIndex: number): Action => ({
  kind: 'move',
  slotIndex: 1,
  selection: { side: 'p1', partyIndex },
});

describe('器 — 献身 (SPEC §10.13)', () => {
  it('控えのユニットは場にいないが回復は成立する', () => {
    const state = makeBattle(['utsuwa', 'kenro'], ['bara']);
    setHp(state, 'p1', 1, 100);

    const { state: after, events } = resolveTurn(state, { p1: healBench(1), p2: move(0) });

    const heal = eventsOfType(events, 'heal')[0];
    expect(heal?.amount).toBe(UTSUWA_HEAL);
    expect(heal?.target).toEqual({ side: 'p1', partyIndex: 1 });
    expect(unit(after, 'p1', 1).hp).toBe(115);
  });

  it('回復対象は選択でき、選ばなかった控えは回復しない', () => {
    const state = makeBattle(['utsuwa', 'kenro', 'ishi'], ['bara']);
    setHp(state, 'p1', 1, 100);
    setHp(state, 'p1', 2, 50);

    const { state: after } = resolveTurn(state, { p1: healBench(2), p2: move(0) });

    expect(unit(after, 'p1', 1).hp).toBe(100);
    expect(unit(after, 'p1', 2).hp).toBe(65);
  });

  it('生存している控えだけが選択肢になる', () => {
    const state = makeBattle(['utsuwa', 'kenro', 'ishi'], ['bara']);
    unit(state, 'p1', 1).fainted = true;

    const selections = getLegalActions(state, 'p1')
      .filter((a) => a.kind === 'move' && a.slotIndex === 1)
      .map((a) => (a.kind === 'move' ? a.selection?.partyIndex : undefined));

    expect(selections).toEqual([2]);
  });

  it('控えが全員瀕死でも技は使用でき、何も起こらずターンを消費する', () => {
    const state = makeBattle(['utsuwa', 'kenro'], ['bara']);
    unit(state, 'p1', 1).fainted = true;

    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    expect(eventsOfType(events, 'heal')).toHaveLength(0);
    expect(eventsOfType(events, 'noEffect').some((e) => e.reason.includes('控え'))).toBe(true);
    expect(after.turn).toBe(2);
  });

  it('控えが満タンでも技は使用でき、何も起こらない', () => {
    const state = makeBattle(['utsuwa', 'kenro'], ['bara']);

    const { events } = resolveTurn(state, { p1: healBench(1), p2: move(0) });

    expect(eventsOfType(events, 'heal')).toHaveLength(0);
    expect(eventsOfType(events, 'noEffect').some((e) => e.reason.includes('満タン'))).toBe(true);
  });
});
