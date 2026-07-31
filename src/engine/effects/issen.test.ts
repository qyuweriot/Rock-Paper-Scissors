import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import { active, eventsOfType, INERT, inert, makeBattle, move, switchTo } from '../testkit';
import { PERSISTENT_MODIFIER_CAP } from '../constants';
import type { BattleEvent } from '../types';

/**
 * 一閃 choki HP40 速 / 技0 威力35 / 技1 攻勢+10(交代まで、上限+20) (SPEC §10.9)
 *
 * 相手には何もしない器を置き、一閃が生き残る状況で観察する。
 */
describe('一閃 — 構え (SPEC §10.9)', () => {
  /** 技1「構え」を times 回使い、最後のターンのイベントを返す */
  const stack = (times: number) => {
    let state = makeBattle(['issen'], [INERT]);
    let lastEvents: BattleEvent[] = [];
    for (let i = 0; i < times; i++) {
      const step = resolveTurn(state, { p1: move(1), p2: inert() });
      state = step.state;
      lastEvents = step.events;
    }
    return { state, lastEvents };
  };

  it('1回で攻勢+10、2回で+20 まで累積する', () => {
    const once = stack(1);
    expect(active(once.state, 'p1').modifiers.atk).toBe(10);

    const twice = stack(2);
    expect(active(twice.state, 'p1').modifiers.atk).toBe(PERSISTENT_MODIFIER_CAP);
  });

  it('3回目の使用は無効だがターンは消費する', () => {
    const thrice = stack(3);

    expect(active(thrice.state, 'p1').modifiers.atk).toBe(PERSISTENT_MODIFIER_CAP);
    // 修正値イベントは出ず、noEffect が出る
    expect(eventsOfType(thrice.lastEvents, 'modifier')).toHaveLength(0);
    expect(eventsOfType(thrice.lastEvents, 'noEffect').some((e) => e.reason.includes('上限'))).toBe(
      true,
    );
    // ターンは進んでいる
    expect(thrice.state.turn).toBe(4);
  });

  it('積んだ分だけ技1の威力が上がる (SPEC §10.9 の表)', () => {
    // 一閃 技0 威力35。チョキ→パー は有利 (+25)
    const table: [stacks: number, expected: number][] = [
      [0, 60],
      [1, 70],
      [2, 80],
    ];

    for (const [stacks, expected] of table) {
      let state = makeBattle(['issen'], ['uchiwa']);
      for (let i = 0; i < stacks; i++) {
        state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
      }
      const attack = resolveTurn(state, { p1: move(0), p2: inert() });
      const dealt = eventsOfType(attack.events, 'damage').find((d) => d.target.side === 'p2');
      expect(dealt?.amount).toBe(expected);
    }
  });

  it('交代でリセットされる', () => {
    let state = makeBattle(['issen', 'kenro'], [INERT]);
    state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    expect(active(state, 'p1').modifiers.atk).toBe(20);

    state = resolveTurn(state, { p1: switchTo(1), p2: inert() }).state;
    state = resolveTurn(state, { p1: switchTo(0), p2: inert() }).state;
    expect(active(state, 'p1').modifiers.atk).toBe(0);
  });

  it('瀕死でリセットされる', () => {
    let state = makeBattle(['issen', 'kenro'], ['ishi']);
    state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    // 石 技0 威力25 は グー→チョキ 有利で50。HP40 の一閃は落ちる
    expect(state.sides.p1.party[0]?.fainted).toBe(true);
    expect(state.sides.p1.party[0]?.modifiers.atk).toBe(0);
  });
});
