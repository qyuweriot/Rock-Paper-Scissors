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
import { HAZARD_MAX_STACKS, POISON_MAX_STACKS } from '../constants';
import type { Action } from '../types';

/**
 * バラ choki HP50 中 / 技0 毒撒き / 技1 棘撒き (SPEC §10.8)
 * どちらもダメージを与えない。
 */
describe('バラ — 毒撒き (SPEC §10.8 / §7.1)', () => {
  it('相手に毒を1スタック付与する', () => {
    const state = makeBattle(['bara'], [INERT]);
    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(eventsOfType(events, 'poisonApplied')[0]?.stacks).toBe(1);
    expect(active(after, 'p2').poisonStacks).toBe(1);
  });

  it('2重まで重なり、3重目は無効だがターンは消費する', () => {
    let state = makeBattle(['bara'], [INERT]);
    state = resolveTurn(state, { p1: move(0), p2: inert() }).state;
    state = resolveTurn(state, { p1: move(0), p2: inert() }).state;
    expect(active(state, 'p2').poisonStacks).toBe(POISON_MAX_STACKS);

    const third = resolveTurn(state, { p1: move(0), p2: inert() });
    expect(active(third.state, 'p2').poisonStacks).toBe(POISON_MAX_STACKS);
    expect(eventsOfType(third.events, 'poisonApplied')).toHaveLength(0);
    expect(eventsOfType(third.events, 'noEffect').some((e) => e.reason.includes('毒'))).toBe(true);
    expect(third.state.turn).toBe(4); // ターンは進む
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

  it('毒はターン終了時に10ダメージを与え、2重なら20', () => {
    const state = makeBattle(['bara'], [INERT]);
    setPoison(state, 'p2', 0, 2);

    const { events } = resolveTurn(state, { p1: move(0), p2: inert() });
    const poison = eventsOfType(events, 'damage').find((d) => d.source === 'poison');
    expect(poison?.amount).toBe(20);
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

  it('2枚まで置け、3枚目は無効だがターンは消費する', () => {
    let state = makeBattle(['bara'], [INERT]);
    state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    expect(state.sides.p2.hazardStacks).toBe(HAZARD_MAX_STACKS);

    const third = resolveTurn(state, { p1: move(1), p2: inert() });
    expect(third.state.sides.p2.hazardStacks).toBe(HAZARD_MAX_STACKS);
    expect(eventsOfType(third.events, 'hazardSet')).toHaveLength(0);
    expect(eventsOfType(third.events, 'noEffect').some((e) => e.reason.includes('設置'))).toBe(
      true,
    );
  });

  it('設置は相手が場に出るたびに発動する', () => {
    const state = makeBattle(['bara'], [INERT, 'ishi']);
    setHazard(state, 'p2', 2);

    const { events } = resolveTurn(state, { p1: move(1), p2: switchTo(1) });
    const hazard = eventsOfType(events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(20);
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
