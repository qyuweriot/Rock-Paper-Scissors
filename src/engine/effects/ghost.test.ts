import { describe, expect, it } from 'vitest';
import { resolveReplacements, resolveTurn } from '../battle';
import {
  eventsOfType,
  INERT,
  inert,
  makeBattle,
  move,
  setHazard,
  setHp,
  setPoison,
  unit,
} from '../testkit';
import { GHOST_FAINT_REFLECT } from '../constants';

/**
 * ゴースト pa HP60 速 / 技0 威力10 + 自分に固定5の反動 / 特性「呪詛返し」(SPEC §10.12)
 *
 * 山嵐の反射と違い**死因を問わない**のが要点。
 */
const reflects = (events: ReturnType<typeof resolveTurn>['events']) =>
  eventsOfType(events, 'damage').filter((d) => d.source === 'reflect');

describe('ゴースト — 呪詛返し (SPEC §10.12)', () => {
  it('通常攻撃で倒されたとき、相手に GHOST_FAINT_REFLECT を返す', () => {
    // 石 gu 技0 威力25 → グー→パー は不利で15
    const state = makeBattle(['ghost'], ['ishi']);
    setHp(state, 'p1', 0, 15);

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    const reflected = reflects(events);
    expect(reflected).toHaveLength(1);
    expect(reflected[0]?.amount).toBe(GHOST_FAINT_REFLECT);
    expect(reflected[0]?.target).toEqual({ side: 'p2', partyIndex: 0 });
  });

  it('毒で倒れた場合も発動する', () => {
    // 技0 の反動5 では落ちず、ターン終了の毒10 で落ちる HP にする
    const state = makeBattle(['ghost'], [INERT]);
    setHp(state, 'p1', 0, 11);
    setPoison(state, 'p1', 0, 1);

    const { events } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(eventsOfType(events, 'damage').some((d) => d.source === 'poison')).toBe(true);
    expect(reflects(events)).toHaveLength(1);
  });

  it('自分の反動で倒れた場合も発動する', () => {
    // ゴースト技0 は自分に固定5の反動
    const state = makeBattle(['ghost'], [INERT]);
    setHp(state, 'p1', 0, 5);

    const { events } = resolveTurn(state, { p1: move(0), p2: inert() });

    const recoil = eventsOfType(events, 'damage').find((d) => d.source === 'recoil');
    expect(recoil?.amount).toBe(5);
    expect(reflects(events)).toHaveLength(1);
  });

  it('設置で倒れた場合も発動する', () => {
    const state = makeBattle(['ishi', 'ghost'], [INERT]);
    setHp(state, 'p1', 0, 1); // 石を倒して死に出しさせる
    setHp(state, 'p1', 1, 10); // ゴーストは設置20で落ちる
    setHazard(state, 'p1', 2);
    setPoison(state, 'p1', 0, 1); // 石を毒で確実に落とす

    const turn1 = resolveTurn(state, { p1: move(0), p2: inert() });
    const replaced = resolveReplacements(turn1.state, { p1: 1 });

    expect(eventsOfType(replaced.events, 'damage').some((d) => d.source === 'hazard')).toBe(true);
    expect(reflects(replaced.events)).toHaveLength(1);
  });

  it('相打ちの場合も発動する', () => {
    // はさみ choki HP100 速。ゴーストはパーなのでチョキには不利 (威力15−10 = 5)
    const state = makeBattle(['ghost'], ['hasami']);
    setHp(state, 'p1', 0, 20); // はさみの50ダメージで落ちる
    setHp(state, 'p2', 0, GHOST_FAINT_REFLECT); // ゴーストの反射でちょうど落ちる

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(reflects(events)).toHaveLength(1);
    // 反射がはさみを落とし、両者瀕死で引き分けになる
    expect(after.phase).toEqual({ kind: 'ended', result: 'draw' });
  });

  it('反射で相手が瀕死になれば、相手も死に出しを行う', () => {
    const state = makeBattle(['ghost', 'ishi'], ['hasami', 'kenro']);
    setHp(state, 'p1', 0, 20);
    setHp(state, 'p2', 0, 25);

    const { state: after } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(unit(after, 'p2', 0).fainted).toBe(true);
    expect(after.phase).toEqual({ kind: 'awaitingReplacement', sides: ['p1', 'p2'] });
  });
});
