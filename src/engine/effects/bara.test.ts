import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import {
  active,
  eventsOfType,
  INERT,
  inert,
  makeBattle,
  move,
  setHazard,
  setPoison,
  switchTo,
  unit,
} from '../testkit';
import {
  HAZARD_DAMAGE,
  HAZARD_MAX_STACKS,
  POISON_DAMAGE,
  POISON_MAX_STACKS,
} from '../constants';
import type { Action } from '../types';

/**
 * バラ choki HP80 中 / 技0 毒撒き / 技1 棘撒き (SPEC §10.8)
 * どちらもダメージを与えない。
 */
describe('バラ — 毒撒き (SPEC §10.8 / §7.1)', () => {
  it('相手に毒を1スタック付与する', () => {
    const state = makeBattle(['bara'], [INERT]);
    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(eventsOfType(events, 'poisonApplied')[0]?.stacks).toBe(1);
    expect(active(after, 'p2').poisonStacks).toBe(1);
  });

  it('上限まで重なり、それ以降は無効だがターンは消費する', () => {
    // 上限は POISON_MAX_STACKS。定数から導くので、上限を変えてもこのテストは追従する
    let state = makeBattle(['bara'], [INERT]);
    for (let i = 0; i < POISON_MAX_STACKS; i++) {
      state = resolveTurn(state, { p1: move(0), p2: inert() }).state;
    }
    expect(active(state, 'p2').poisonStacks).toBe(POISON_MAX_STACKS);

    const turnBefore = state.turn;
    const excess = resolveTurn(state, { p1: move(0), p2: inert() });
    expect(active(excess.state, 'p2').poisonStacks).toBe(POISON_MAX_STACKS);
    expect(eventsOfType(excess.events, 'poisonApplied')).toHaveLength(0);
    expect(eventsOfType(excess.events, 'noEffect').some((e) => e.reason.includes('毒'))).toBe(true);
    expect(excess.state.turn).toBe(turnBefore + 1); // ターンは進む
  });

  it('毒は交代しても維持される (SPEC §7.1)', () => {
    const state = makeBattle(['bara'], [INERT, 'ishi']);
    // 控えがいる器は回復対象の選択が必須になる。満タンの石を指定して空振りさせる
    const idleHeal: Action = {
      kind: 'move',
      slotIndex: 1,
      selection: { side: 'p2', partyIndex: 1 },
    };
    const poisoned = resolveTurn(state, { p1: move(0), p2: idleHeal }).state;
    expect(active(poisoned, 'p2').poisonStacks).toBe(1);

    // 交代して戻ってきても毒は残る
    const out = resolveTurn(poisoned, { p1: move(1), p2: switchTo(1) }).state;
    const back = resolveTurn(out, { p1: move(1), p2: switchTo(0) }).state;
    expect(unit(back, 'p2', 0).poisonStacks).toBe(1);
  });

  it('毒はターン終了時に スタック数 × 10 のダメージを与える', () => {
    for (const stacks of [1, POISON_MAX_STACKS]) {
      const state = makeBattle(['bara'], [INERT]);
      setPoison(state, 'p2', 0, stacks);

      // 毒撒き(技0)を使うとこのターンに1スタック増えてしまうので、棘撒き(技1)を使う
      const { events } = resolveTurn(state, { p1: move(1), p2: inert() });
      const poison = eventsOfType(events, 'damage').find((d) => d.source === 'poison');
      expect(poison?.amount).toBe(POISON_DAMAGE * stacks);
    }
  });
});

describe('バラ — 棘撒き (SPEC §10.8 / §7.2)', () => {
  it('相手側の場に設置を置く', () => {
    const state = makeBattle(['bara'], [INERT]);
    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: inert() });

    expect(eventsOfType(events, 'hazardSet')[0]).toMatchObject({ side: 'p2', stacks: 1 });
    expect(after.sides.p2.hazardStacks).toBe(1);
    expect(after.sides.p1.hazardStacks).toBe(0); // 自陣には置かれない
  });

  it('上限まで置け、それ以降は無効だがターンは消費する', () => {
    let state = makeBattle(['bara'], [INERT]);
    for (let i = 0; i < HAZARD_MAX_STACKS; i++) {
      state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    }
    expect(state.sides.p2.hazardStacks).toBe(HAZARD_MAX_STACKS);

    const excess = resolveTurn(state, { p1: move(1), p2: inert() });
    expect(excess.state.sides.p2.hazardStacks).toBe(HAZARD_MAX_STACKS);
    expect(eventsOfType(excess.events, 'hazardSet')).toHaveLength(0);
    expect(eventsOfType(excess.events, 'noEffect').some((e) => e.reason.includes('設置'))).toBe(
      true,
    );
  });

  it('設置は相手が場に出るたびに 枚数 × 10 のダメージを与える', () => {
    const state = makeBattle(['bara'], [INERT, 'ishi']);
    setHazard(state, 'p2', HAZARD_MAX_STACKS);

    const { events } = resolveTurn(state, { p1: move(1), p2: switchTo(1) });
    const hazard = eventsOfType(events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(HAZARD_DAMAGE * HAZARD_MAX_STACKS);
    expect(hazard?.target).toEqual({ side: 'p2', partyIndex: 1 });
  });

  it('毒と設置を両方使えば膠着が解消する', () => {
    // Phase 2 ではバラ同士が永久に決着しなかった。毒が入れば終わる
    let state = makeBattle(['bara'], ['bara']);
    for (let i = 0; i < 20 && state.phase.kind === 'awaitingActions'; i++) {
      state = resolveTurn(state, { p1: move(0), p2: move(0) }).state;
    }
    expect(state.phase.kind).toBe('ended');
  });
});
