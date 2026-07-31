import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import { eventsOfType, makeBattle, move, setHazard, switchTo } from '../testkit';
import type { Action } from '../types';

/**
 * 魔球 gu HP100 中 / 技0 威力30(使うたび−10) / 技1 威力15 + 自己交代 (SPEC §10.3)
 *
 * 威力を素直に読むため、互角対面の堅牢(gu HP140)を相手にする。
 */
const dealtToP2 = (events: ReturnType<typeof resolveTurn>['events']) =>
  eventsOfType(events, 'damage').find((d) => d.target.side === 'p2' && d.source === 'move')?.amount;

describe('魔球 — 消耗弾 (SPEC §10.3)', () => {
  it('使うたびに威力が10ずつ下がり、下限は0', () => {
    let state = makeBattle(['magyu'], ['kenro']);
    const observed: (number | undefined)[] = [];

    for (let i = 0; i < 4; i++) {
      const step = resolveTurn(state, { p1: move(0), p2: move(0) });
      observed.push(dealtToP2(step.events));
      state = step.state;
    }

    expect(observed).toEqual([30, 20, 10, 0]);
  });

  it('威力0でも使用でき、ダメージは相性補正のみになる', () => {
    // 互角の堅牢に3回撃って威力を0まで落としてから、相手をチョキに交代させる。
    // グー→チョキ は有利 (+25) なので、威力0 でも25 入る
    let state = makeBattle(['magyu'], ['kenro', 'hasamimushi']);
    for (let i = 0; i < 3; i++) {
      state = resolveTurn(state, { p1: move(0), p2: move(0) }).state;
    }

    // 交代は優先度[1]なので、魔球の攻撃より先に場が入れ替わる
    const fourth = resolveTurn(state, { p1: move(0), p2: switchTo(1) });
    expect(dealtToP2(fourth.events)).toBe(25);
  });

  it('交代でリセットされる', () => {
    let state = makeBattle(['magyu', 'kenro'], ['kenro']);
    state = resolveTurn(state, { p1: move(0), p2: move(0) }).state;
    state = resolveTurn(state, { p1: move(0), p2: move(0) }).state;

    state = resolveTurn(state, { p1: switchTo(1), p2: move(0) }).state;
    state = resolveTurn(state, { p1: switchTo(0), p2: move(0) }).state;

    const back = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(dealtToP2(back.events)).toBe(30); // 初回の威力に戻っている
  });
});

describe('魔球 — 離脱弾 (SPEC §10.3)', () => {
  const escapeTo = (partyIndex: number): Action => ({
    kind: 'move',
    slotIndex: 1,
    selection: { side: 'p1', partyIndex },
  });

  it('威力15を与えた後、選択した控えに自分が交代する', () => {
    const state = makeBattle(['magyu', 'kenro', 'ishi'], ['kenro']);
    const { state: after, events } = resolveTurn(state, { p1: escapeTo(2), p2: move(0) });

    expect(dealtToP2(events)).toBe(15);
    const switched = eventsOfType(events, 'switch');
    expect(switched).toHaveLength(1);
    expect(switched[0]?.reason).toBe('selfSwitch');
    expect(after.sides.p1.activeIndex).toBe(2);
  });

  it('攻撃はステップ2、交代はステップ3なので、ダメージが先に入る', () => {
    const state = makeBattle(['magyu', 'kenro'], ['kenro']);
    const { events } = resolveTurn(state, { p1: escapeTo(1), p2: move(0) });

    const damage = eventsOfType(events, 'damage').find((d) => d.target.side === 'p2');
    const switched = eventsOfType(events, 'switch')[0];
    expect(events.indexOf(damage as never)).toBeLessThan(events.indexOf(switched as never));
  });

  it('控えに生存ユニットがいなければ攻撃のみ行い、交代しない', () => {
    const state = makeBattle(['magyu'], ['kenro']);
    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    expect(dealtToP2(events)).toBe(15);
    expect(eventsOfType(events, 'switch')).toHaveLength(0);
    expect(after.sides.p1.activeIndex).toBe(0);
  });

  it('自己交代でも自陣の設置を踏む', () => {
    const state = makeBattle(['magyu', 'kenro'], ['kenro']);
    setHazard(state, 'p1', 1);

    const { events } = resolveTurn(state, { p1: escapeTo(1), p2: move(0) });
    const hazard = eventsOfType(events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(10);
    expect(hazard?.target).toEqual({ side: 'p1', partyIndex: 1 });
  });
});
