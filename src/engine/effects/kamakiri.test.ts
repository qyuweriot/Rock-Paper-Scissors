import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../battle';
import { active, eventsOfType, makeBattle, move, setHp, switchTo, unit } from '../testkit';
import type { Action } from '../types';

/**
 * カマキリ choki HP120 速 / 技0 威力15(使うたび+5) / 特性「治癒封じ」(SPEC §10.6)
 */
const dealtToP2 = (events: ReturnType<typeof resolveTurn>['events']) =>
  eventsOfType(events, 'damage').find((d) => d.target.side === 'p2' && d.source === 'move')?.amount;

describe('カマキリ — 連撃 (SPEC §10.6)', () => {
  it('使うたびに威力が5ずつ上がる', () => {
    // 堅牢 gu HP140。チョキ→グー は不利 (−10) なので 5 / 10 / 15 と読める
    let state = makeBattle(['kamakiri'], ['kenro']);
    const observed: (number | undefined)[] = [];

    for (let i = 0; i < 3; i++) {
      const step = resolveTurn(state, { p1: move(0), p2: move(0) });
      observed.push(dealtToP2(step.events));
      state = step.state;
    }

    expect(observed).toEqual([5, 10, 15]);
  });

  it('交代でリセットされる', () => {
    let state = makeBattle(['kamakiri', 'bara'], ['kenro']);
    state = resolveTurn(state, { p1: move(0), p2: move(0) }).state; // 1回使用。次は10 のはず
    state = resolveTurn(state, { p1: switchTo(1), p2: move(0) }).state;
    state = resolveTurn(state, { p1: switchTo(0), p2: move(0) }).state;

    const back = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(dealtToP2(back.events)).toBe(5); // 初回の威力に戻っている
  });
});

describe('カマキリ — 治癒封じ (SPEC §10.6)', () => {
  it('手のひらの自己回復を無効化する', () => {
    const state = makeBattle(['kamakiri'], ['tenohira']);
    setHp(state, 'p2', 0, 50);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(1) });

    expect(eventsOfType(events, 'healBlocked')).toHaveLength(1);
    expect(eventsOfType(events, 'heal')).toHaveLength(0);
    // 技は発動しているのでターンは消費され、回復量だけが0になる
    expect(active(after, 'p2').hp).toBeLessThan(50);
  });

  it('器の控え回復を無効化する', () => {
    const state = makeBattle(['kamakiri'], ['utsuwa', 'kenro']);
    setHp(state, 'p2', 1, 100);

    const healBench: Action = {
      kind: 'move',
      slotIndex: 1,
      selection: { side: 'p2', partyIndex: 1 },
    };
    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: healBench });

    expect(eventsOfType(events, 'healBlocked')).toHaveLength(1);
    expect(unit(after, 'p2', 1).hp).toBe(100);
  });

  it('堅牢のターン終了時回復を無効化する', () => {
    const state = makeBattle(['kamakiri'], ['kenro']);
    setHp(state, 'p2', 0, 100);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(eventsOfType(events, 'healBlocked')).toHaveLength(1);
    expect(active(after, 'p2').hp).toBe(95); // 5ダメージのみ。回復は入らない
  });

  it('カマキリが場を離れると回復が復活する', () => {
    const state = makeBattle(['kamakiri', 'bara'], ['kenro']);
    setHp(state, 'p2', 0, 100);

    const away = resolveTurn(state, { p1: switchTo(1), p2: move(0) });

    expect(eventsOfType(away.events, 'healBlocked')).toHaveLength(0);
    expect(eventsOfType(away.events, 'heal')).toHaveLength(1);
  });

  it('控えにいるカマキリは回復を止めない (特性は場でのみ発動 SPEC §3)', () => {
    const state = makeBattle(['bara', 'kamakiri'], ['kenro']);
    setHp(state, 'p2', 0, 100);

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(eventsOfType(events, 'heal')).toHaveLength(1);
  });
});
