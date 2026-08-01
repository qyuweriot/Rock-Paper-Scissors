import { describe, expect, it } from 'vitest';
import { getLegalActions, resolveTurn } from '../battle';
import { active, eventsOfType, INERT, inert, makeBattle, move, setHp, switchTo } from '../testkit';
import { TENOHIRA_HEAL, TENOHIRA_HEAL_USES } from '../constants';

/**
 * 手のひら pa HP100 中 / 技0 固定20 / 技1 自己回復30 (SPEC §10.11)
 */
describe('手のひら — 掌打 (固定ダメージ)', () => {
  it('相性補正を無視して常に20を与える', () => {
    // パー→グー は有利、パー→チョキ は不利。どちらも20のまま
    const advantage = resolveTurn(makeBattle(['tenohira'], ['kenro']), {
      p1: move(0),
      p2: move(0),
    });
    const disadvantage = resolveTurn(makeBattle(['tenohira'], [INERT]), {
      p1: move(0),
      p2: move(0),
    });

    const dealt = (r: typeof advantage) =>
      eventsOfType(r.events, 'damage').find((d) => d.target.side === 'p2')?.amount;

    expect(dealt(advantage)).toBe(20);
    expect(dealt(disadvantage)).toBe(20);
  });
});

describe('手のひら — 整息 (SPEC §10.11)', () => {
  it('自分のHPを TENOHIRA_HEAL ぶん回復する', () => {
    const state = makeBattle(['tenohira'], [INERT]);
    setHp(state, 'p1', 0, 50);

    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: inert() });

    expect(eventsOfType(events, 'heal')[0]?.amount).toBe(TENOHIRA_HEAL);
    expect(active(after, 'p1').hp).toBe(50 + TENOHIRA_HEAL);
  });

  it('最大HPを超えては回復しない', () => {
    const state = makeBattle(['tenohira'], [INERT]);
    setHp(state, 'p1', 0, 90);

    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: inert() });

    expect(eventsOfType(events, 'heal')[0]?.amount).toBe(10);
    expect(active(after, 'p1').hp).toBe(100);
  });

  it('HPが満タンなら何も起こらないが、ターンは消費する', () => {
    const state = makeBattle(['tenohira'], [INERT]);

    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: inert() });

    expect(eventsOfType(events, 'heal')).toHaveLength(0);
    expect(eventsOfType(events, 'noEffect').some((e) => e.reason.includes('満タン'))).toBe(true);
    expect(after.turn).toBe(2);
  });
});

/**
 * 回復の応酬による膠着を防ぐための使用回数制限。
 * §7.3 の累積カウント(魔球・カマキリ)と違い、**交代でリセットされない**。
 */
describe('手のひら — 整息の使用回数制限 (SPEC §10.11)', () => {
  it('3回までしか使えず、使い切ると合法手から外れる', () => {
    let state = makeBattle(['tenohira'], [INERT]);
    setHp(state, 'p1', 0, 10);

    for (let i = 0; i < TENOHIRA_HEAL_USES; i++) {
      expect(getLegalActions(state, 'p1').some((a) => a.kind === 'move' && a.slotIndex === 1)).toBe(
        true,
      );
      state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    }

    expect(active(state, 'p1').totalMoveUses[1]).toBe(TENOHIRA_HEAL_USES);
    expect(getLegalActions(state, 'p1').some((a) => a.kind === 'move' && a.slotIndex === 1)).toBe(
      false,
    );
    expect(() => resolveTurn(state, { p1: move(1), p2: inert() })).toThrow();
  });

  it('使い切っても技1は使えるので行動不能にはならない', () => {
    let state = makeBattle(['tenohira'], [INERT]);
    setHp(state, 'p1', 0, 10);
    for (let i = 0; i < TENOHIRA_HEAL_USES; i++) {
      state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    }

    const legal = getLegalActions(state, 'p1');
    expect(legal).toHaveLength(1);
    expect(legal[0]).toEqual({ kind: 'move', slotIndex: 0 });
  });

  it('交代してもリセットされない (§7.3 の累積カウントとは別扱い)', () => {
    let state = makeBattle(['tenohira', 'kenro'], [INERT]);
    setHp(state, 'p1', 0, 10);

    state = resolveTurn(state, { p1: move(1), p2: inert() }).state;
    state = resolveTurn(state, { p1: switchTo(1), p2: inert() }).state;
    state = resolveTurn(state, { p1: switchTo(0), p2: inert() }).state;

    // 交代を挟んでも1回分は消費されたまま
    expect(active(state, 'p1').totalMoveUses[1]).toBe(1);
    // 一方、交代でリセットされる方のカウントは0に戻っている
    expect(active(state, 'p1').moveUseCounts[1]).toBe(0);
  });

  it('回復の応酬による膠着が起きない', () => {
    // 手のひら同士で回復を撃ち合っても、3回で打ち止めになり削り合いに移る
    let state = makeBattle(['tenohira'], ['tenohira']);
    for (let i = 0; i < 40 && state.phase.kind === 'awaitingActions'; i++) {
      const heal = getLegalActions(state, 'p1').some((a) => a.kind === 'move' && a.slotIndex === 1);
      const action = heal ? move(1) : move(0);
      state = resolveTurn(state, { p1: action, p2: action }).state;
    }
    expect(state.phase.kind).toBe('ended');
  });
});
