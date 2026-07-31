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
  switchTo,
} from '../testkit';
import { YAMAARASHI_REFLECT } from '../constants';

/**
 * 山嵐 choki HP100 中 / 技0 威力20 / 特性「棘の反射」(SPEC §10.7)
 */
const reflects = (events: ReturnType<typeof resolveTurn>['events']) =>
  eventsOfType(events, 'damage').filter((d) => d.source === 'reflect');

describe('山嵐 — 棘の反射 (SPEC §10.7)', () => {
  it('攻撃技によるダメージを受けると、攻撃側に固定10を返す', () => {
    // 石 gu 技0 威力25 → グー→チョキ 有利で50
    const state = makeBattle(['yamaarashi'], ['ishi']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    const reflected = reflects(events);
    expect(reflected).toHaveLength(1);
    expect(reflected[0]?.amount).toBe(YAMAARASHI_REFLECT);
    expect(reflected[0]?.target).toEqual({ side: 'p2', partyIndex: 0 });
  });

  it('ダメージが0でも、攻撃技を受けていれば反射する', () => {
    // ゴースト pa 技0 威力10 → パー→チョキ 不利で 10−10 = 0
    const state = makeBattle(['yamaarashi'], ['ghost']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    const dealt = eventsOfType(events, 'damage').find(
      (d) => d.source === 'move' && d.target.side === 'p1',
    );
    expect(dealt?.amount).toBe(0);
    // ゴーストは瀕死時に自分でも反射するので、山嵐が返した分だけを数える
    const toAttacker = reflects(events).filter((d) => d.target.side === 'p2');
    expect(toAttacker).toHaveLength(1);
    expect(toAttacker[0]?.amount).toBe(YAMAARASHI_REFLECT);
  });

  it('毒によるダメージでは発動しない', () => {
    const state = makeBattle(['yamaarashi'], [INERT]);
    setPoison(state, 'p1', 0, 1);

    const { events } = resolveTurn(state, { p1: move(0), p2: inert() });
    expect(reflects(events)).toHaveLength(0);
  });

  it('設置によるダメージでは発動しない', () => {
    const state = makeBattle(['yamaarashi', 'ishi'], [INERT]);
    setHazard(state, 'p1', 1);

    // 山嵐が控えから場に出て設置を踏む
    const out = resolveTurn(state, { p1: switchTo(1), p2: inert() });
    const back = resolveTurn(out.state, { p1: switchTo(0), p2: inert() });

    const hazard = eventsOfType(back.events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(10);
    expect(reflects(back.events)).toHaveLength(0);
  });

  it('相手の反動ダメージでは発動しない', () => {
    // ゴーストは技0で自分に固定5の反動を受ける。反射は受けた側の判定なので1回だけ
    const state = makeBattle(['yamaarashi'], ['ghost']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(eventsOfType(events, 'damage').some((d) => d.source === 'recoil')).toBe(true);
    // 反動は攻撃側が自分で受けるもの。山嵐が返すのは攻撃技の分の1回だけ
    expect(reflects(events).filter((d) => d.target.side === 'p2')).toHaveLength(1);
  });

  it('反射は反射を誘発しない。山嵐同士でもループしない', () => {
    const state = makeBattle(['yamaarashi'], ['yamaarashi']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    // 互いに1回ずつ返すだけで止まる
    expect(reflects(events)).toHaveLength(2);
  });

  it('その攻撃で倒された場合も反射する', () => {
    const state = makeBattle(['yamaarashi', 'ishi'], ['ishi']);
    setHp(state, 'p1', 0, 10); // 石の50ダメージで確実に落ちる

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(eventsOfType(events, 'faint')).toHaveLength(1);
    expect(reflects(events)).toHaveLength(1);
  });

  it('死に出しで場に出た山嵐も、次のターンからは反射する', () => {
    const state = makeBattle(['ishi', 'yamaarashi'], ['ishi']);
    setHp(state, 'p1', 0, 10);

    const turn1 = resolveTurn(state, { p1: move(0), p2: move(0) });
    const replaced = resolveReplacements(turn1.state, { p1: 1 });
    const turn2 = resolveTurn(replaced.state, { p1: move(0), p2: move(0) });

    expect(reflects(turn2.events)).toHaveLength(1);
  });
});
