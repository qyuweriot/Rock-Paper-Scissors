import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import { eventsOfType, makeBattle, move, setHazard } from '../testkit';

/**
 * 団扇 pa HP80 遅 / 技0 威力25 / 技1 相手を強制交代(交代先はランダム) (SPEC §10.14)
 *
 * 本ゲームで乱数を使う唯一の箇所。シードは BattleState が持つ。
 */
describe('団扇 — 突風 (SPEC §10.14)', () => {
  it('相手を強制的に交代させる', () => {
    const state = makeBattle(['uchiwa'], ['kenro', 'ishi', 'tenohira']);
    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const forced = eventsOfType(events, 'switch');
    expect(forced).toHaveLength(1);
    expect(forced[0]?.side).toBe('p2');
    expect(forced[0]?.reason).toBe('forced');
    expect(after.sides.p2.activeIndex).not.toBe(0);
  });

  it('交代先は生存している控えから選ばれる', () => {
    const state = makeBattle(['uchiwa'], ['kenro', 'ishi', 'tenohira']);
    state.sides.p2.party[1]!.fainted = true;

    const { state: after } = resolveTurn(state, { p1: move(1), p2: move(0) });
    expect(after.sides.p2.activeIndex).toBe(2); // 瀕死の1は選ばれない
  });

  it('同じシードなら交代先が完全に再現される (PLAN §3.4)', () => {
    const run = (seed: number) => {
      const state = makeBattle(['uchiwa'], ['kenro', 'ishi', 'tenohira'], seed);
      return resolveTurn(state, { p1: move(1), p2: move(0) }).state.sides.p2.activeIndex;
    };

    expect(run(12345)).toBe(run(12345));
    expect(run(1)).toBe(run(1));
  });

  it('シードを変えると交代先が変わりうる', () => {
    const picks = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const state = makeBattle(['uchiwa'], ['kenro', 'ishi', 'tenohira'], seed);
      picks.add(resolveTurn(state, { p1: move(1), p2: move(0) }).state.sides.p2.activeIndex);
    }
    expect(picks).toEqual(new Set([1, 2])); // 控えの2体が両方選ばれうる
  });

  it('相手の控えに生存ユニットがいなければ何も起こらないが、ターンは消費する', () => {
    const state = makeBattle(['uchiwa'], ['kenro']);
    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    expect(eventsOfType(events, 'switch')).toHaveLength(0);
    expect(eventsOfType(events, 'noEffect').some((e) => e.reason.includes('控え'))).toBe(true);
    expect(after.turn).toBe(2);
  });

  it('強制交代でも相手側の設置を踏む (SPEC §7.2)', () => {
    const state = makeBattle(['uchiwa'], ['kenro', 'ishi']);
    setHazard(state, 'p2', 2);

    const { events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const hazard = eventsOfType(events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(20);
    expect(hazard?.target.side).toBe('p2');
  });
});
