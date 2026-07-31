import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import { active, eventsOfType, INERT, makeBattle, move, switchTo } from '../testkit';

/**
 * はさみ choki HP95 速 / 技0 威力25 / 技1 威力10 + このターン守勢+10 (SPEC §10.10)
 */
describe('はさみ — 受け切り (SPEC §10.10)', () => {
  it('相手の技によるダメージを10軽減する', () => {
    // 石 gu 技0 威力25。グー→チョキ は有利 (+25) なので素なら50
    const state = makeBattle(['hasami'], ['ishi']);
    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const taken = eventsOfType(events, 'damage').find((d) => d.target.side === 'p1');
    expect(taken?.amount).toBe(40); // 50 − 10
    expect(active(after, 'p1').hp).toBe(95 - 40);
  });

  it('固定ダメージは軽減できない (SPEC §4.2)', () => {
    // 手のひら 技0 は固定20。相性補正も修正値もすべて無視する
    const state = makeBattle(['hasami'], ['tenohira']);
    const { events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const taken = eventsOfType(events, 'damage').find((d) => d.target.side === 'p1');
    expect(taken?.amount).toBe(20);
  });

  it('修正値イベントが持続 turn として記録される', () => {
    const state = makeBattle(['hasami'], ['ishi']);
    const { events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const modifier = eventsOfType(events, 'modifier')[0];
    expect(modifier).toMatchObject({ axis: 'def', value: 10, duration: 'turn' });
  });

  it('ターンをまたぐと消える', () => {
    const state = makeBattle(['hasami'], ['ishi']);
    const turn1 = resolveTurn(state, { p1: move(1), p2: move(0) });
    expect(active(turn1.state, 'p1').turnModifiers.def).toBe(0);

    // 次のターンは軽減されず素の50が入る
    const turn2 = resolveTurn(turn1.state, { p1: move(0), p2: move(0) });
    const taken = eventsOfType(turn2.events, 'damage').find((d) => d.target.side === 'p1');
    expect(taken?.amount).toBe(50);
  });

  it('速度が速なので、中の相手より先に修正値が乗る', () => {
    // はさみ=速(段2)、石=中(段3)。段が分かれるため確実に先行する
    const state = makeBattle(['hasami'], ['ishi']);
    const { events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const used = eventsOfType(events, 'moveUsed');
    expect(used[0]?.user.side).toBe('p1');
  });

  it('交代で守勢修正がリセットされる', () => {
    const state = makeBattle(['hasami', 'kenro'], [INERT]);
    const turn1 = resolveTurn(state, { p1: move(1), p2: move(0) });
    const turn2 = resolveTurn(turn1.state, { p1: switchTo(1), p2: move(0) });

    expect(active(turn2.state, 'p1').turnModifiers).toEqual({ atk: 0, def: 0 });
  });
});
