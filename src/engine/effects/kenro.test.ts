import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import { active, eventsOfType, INERT, inert, makeBattle, move, setHp, setPoison } from '../testkit';
import { KENRO_TURN_HEAL } from '../constants';

/**
 * 堅牢 gu HP140 遅 / 技0 威力15 / 特性「再生」(SPEC §10.4)
 *
 * 相手には器を1体だけ置く。控えがいないと技2が空振りするので、
 * 堅牢の特性だけを切り離して観察できる (testkit の INERT を参照)。
 */
describe('堅牢 — 再生 (SPEC §10.4)', () => {
  it('ターン終了時にHPが5回復する', () => {
    const state = makeBattle(['kenro'], [INERT]);
    setHp(state, 'p1', 0, 100);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(eventsOfType(events, 'heal')[0]?.amount).toBe(KENRO_TURN_HEAL);
    expect(active(after, 'p1').hp).toBe(105);
  });

  it('HPが満タンなら何も起こらない', () => {
    const state = makeBattle(['kenro'], [INERT]);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(eventsOfType(events, 'heal')).toHaveLength(0);
    expect(active(after, 'p1').hp).toBe(140);
  });

  it('毒より後に回復されるので、毒ダメージの一部が相殺される (SPEC §5.6)', () => {
    const state = makeBattle(['kenro'], [INERT]);
    setHp(state, 'p1', 0, 100);
    setPoison(state, 'p1', 0, 1);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: inert() });

    const poison = eventsOfType(events, 'damage').find((d) => d.source === 'poison');
    const heal = eventsOfType(events, 'heal')[0];

    expect(poison?.amount).toBe(10);
    expect(heal?.amount).toBe(KENRO_TURN_HEAL);
    expect(events.indexOf(poison as never)).toBeLessThan(events.indexOf(heal as never));
    expect(active(after, 'p1').hp).toBe(95); // 100 − 10 + 5
  });

  it('毒で瀕死になったユニットは回復されない', () => {
    const state = makeBattle(['kenro', 'ishi'], [INERT]);
    setHp(state, 'p1', 0, 5); // 毒10 で落ちる
    setPoison(state, 'p1', 0, 1);

    const { events } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(eventsOfType(events, 'faint')).toHaveLength(1);
    expect(eventsOfType(events, 'heal')).toHaveLength(0);
  });
});
