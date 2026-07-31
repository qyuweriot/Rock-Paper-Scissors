import { describe, expect, it } from 'vitest';
import { getLegalActions, resolveReplacements, resolveTurn } from './battle';
import {
  active,
  eventsOfType,
  makeBattle,
  move,
  runBattle,
  setHazard,
  setHp,
  setPoison,
  switchTo,
  unit,
} from './testkit';
import type { BattleEvent } from './types';

/**
 * Phase 2 は効果を載せていないため、特性を持つユニット (堅牢・ハサミムシなど) も
 * 素の殴り合いしかしない。テストはその前提で書いている。
 *
 * よく使う値:
 *   石       gu   HP105 中  技0 威力25 / 技1 威力35 反動15
 *   紙       pa   HP100 中  技0 威力25 / 技1 威力15 先制
 *   一閃     choki HP40 速  技0 威力35
 *   堅牢     gu   HP140 遅  技0 威力15
 *   団扇     pa   HP80  遅  技0 威力25
 *   鉄拳     gu   HP50  中  技0 威力15 先制
 *   手のひら pa   HP100 中  技0 固定20
 */

describe('優先度 (SPEC §5.2)', () => {
  it('交代は技より先に解決され、交代先が被弾する (SPEC §6)', () => {
    const state = makeBattle(['ishi', 'kenro'], ['kami']);
    const { events } = resolveTurn(state, { p1: switchTo(1), p2: move(0) });

    const switches = eventsOfType(events, 'switch');
    const damages = eventsOfType(events, 'damage');

    expect(switches).toHaveLength(1);
    expect(events.indexOf(switches[0] as BattleEvent)).toBeLessThan(
      events.indexOf(damages[0] as BattleEvent),
    );
    // 紙 技0 威力25 が パー→グー で有利 (+25) → 50 が交代先の堅牢に入る
    expect(damages[0]?.target).toEqual({ side: 'p1', partyIndex: 1 });
    expect(damages[0]?.amount).toBe(50);
  });

  it('先制技は通常技より先に解決される', () => {
    const state = makeBattle(['ishi'], ['kami']);
    // 石は通常技(中)、紙は技1が先制
    const { events } = resolveTurn(state, { p1: move(0), p2: move(1) });

    const used = eventsOfType(events, 'moveUsed');
    expect(used[0]?.user.side).toBe('p2'); // 先制の紙が先
    expect(used[1]?.user.side).toBe('p1');
  });

  it('通常技は 速 → 中 → 遅 の順に解決される', () => {
    const fastVsMid = resolveTurn(makeBattle(['issen'], ['ishi']), {
      p1: move(0),
      p2: move(0),
    });
    expect(eventsOfType(fastVsMid.events, 'moveUsed')[0]?.user.side).toBe('p1'); // 一閃 = 速

    const midVsSlow = resolveTurn(makeBattle(['ishi'], ['uchiwa']), {
      p1: move(0),
      p2: move(0),
    });
    expect(eventsOfType(midVsSlow.events, 'moveUsed')[0]?.user.side).toBe('p1'); // 石 = 中
  });

  it('両者が先制技なら同段となり、相打ちが成立する (SPEC §5.2)', () => {
    const state = makeBattle(['tekken'], ['kami']);
    setHp(state, 'p1', 0, 40); // 紙 技1 (威力15 + 有利25 = 40) でちょうど落ちる
    setHp(state, 'p2', 0, 5); // 鉄拳 技0 (威力15 − 不利10 = 5) でちょうど落ちる

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(1) });

    // 同段=同時適用なので、片方が先に倒れてももう片方の攻撃は成立する
    expect(eventsOfType(events, 'faint')).toHaveLength(2);
    expect(after.phase).toEqual({ kind: 'ended', result: 'draw' });
  });

  it('同速の通常技は同段で処理される', () => {
    const state = makeBattle(['ishi'], ['tenohira']); // どちらも 中
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(eventsOfType(events, 'moveUsed')).toHaveLength(2);
    expect(eventsOfType(events, 'damage')).toHaveLength(2);
  });
});

describe('同段の処理と不発 (SPEC §5.3 / §5.5)', () => {
  it('先の段で倒されたユニットは行動しない', () => {
    const state = makeBattle(['issen'], ['uchiwa']); // 一閃=速、団扇=遅
    setHp(state, 'p2', 0, 60); // 一閃 技0 (35 + 有利25 = 60) で落ちる

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    const used = eventsOfType(events, 'moveUsed');
    expect(used).toHaveLength(1);
    expect(used[0]?.user.side).toBe('p1'); // 団扇の技は発生しない
  });

  it('不発なら反動も発生しない (SPEC §10.5)', () => {
    const state = makeBattle(['issen'], ['ishi']); // 一閃=速、石=中
    setHp(state, 'p2', 0, 25); // 一閃 技0 (35 − 不利10 = 25) で落ちる

    // 石は反動15の技1を宣言しているが、行動する前に倒れる
    const { events } = resolveTurn(state, { p1: move(0), p2: move(1) });

    expect(eventsOfType(events, 'damage').filter((d) => d.source === 'recoil')).toHaveLength(0);
  });

  it('反動は自分に入り、相手へのダメージより後に適用される (SPEC §10.1)', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const { state: after, events } = resolveTurn(state, { p1: move(1), p2: move(0) });

    const damages = eventsOfType(events, 'damage');
    const recoil = damages.find((d) => d.source === 'recoil');
    expect(recoil?.amount).toBe(15);
    expect(recoil?.target).toEqual({ side: 'p1', partyIndex: 0 });
    // 相手への攻撃ダメージが先に並ぶ
    expect(damages.indexOf(recoil as (typeof damages)[number])).toBeGreaterThan(0);
    expect(active(after, 'p1').hp).toBe(105 - 15 - 15); // 反動15 + 堅牢の威力15(互角)
  });
});

describe('交代 (SPEC §6)', () => {
  it('交代で修正値と累積カウントがリセットされる', () => {
    const state = makeBattle(['ishi', 'kenro'], ['kami']);
    const bench = unit(state, 'p1', 1);
    bench.modifiers = { atk: 20, def: 10 };
    bench.moveUseCounts = [3, 1];

    const { state: after } = resolveTurn(state, { p1: switchTo(1), p2: move(0) });

    expect(active(after, 'p1').modifiers).toEqual({ atk: 0, def: 0 });
    expect(active(after, 'p1').moveUseCounts).toEqual([0, 0]);
  });

  it('毒は交代しても維持される (SPEC §7.1)', () => {
    const state = makeBattle(['ishi', 'kenro'], ['kami']);
    setPoison(state, 'p1', 1, 2);

    const { state: after } = resolveTurn(state, { p1: switchTo(1), p2: move(0) });
    expect(active(after, 'p1').poisonStacks).toBe(2);
  });

  it('交代で自陣の設置を踏む (SPEC §7.2)', () => {
    const state = makeBattle(['ishi', 'kenro'], ['kami']);
    setHazard(state, 'p1', 2); // 2枚 = 20ダメージ

    const { events } = resolveTurn(state, { p1: switchTo(1), p2: move(0) });

    const hazard = eventsOfType(events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(20);
    expect(hazard?.target).toEqual({ side: 'p1', partyIndex: 1 });
  });

  it('控えに生存ユニットがいなければ交代は選べない', () => {
    const state = makeBattle(['ishi', 'kenro'], ['kami']);
    unit(state, 'p1', 1).fainted = true;

    const legal = getLegalActions(state, 'p1');
    expect(legal.filter((a) => a.kind === 'switch')).toHaveLength(0);
    expect(legal.filter((a) => a.kind === 'move').length).toBeGreaterThan(0);
  });

  it('特性枠のユニットは選択できる技が1つだけ (SPEC §3)', () => {
    const state = makeBattle(['kenro'], ['kami']); // 堅牢は枠2が特性
    expect(getLegalActions(state, 'p1').filter((a) => a.kind === 'move')).toHaveLength(1);
  });
});

describe('ターン終了処理 (SPEC §5.6)', () => {
  it('毒は場のユニットのみが受け、控えの毒ユニットは減らない (SPEC §7.1)', () => {
    const state = makeBattle(['kenro', 'ishi'], ['kami']);
    setPoison(state, 'p1', 0, 1); // 場
    setPoison(state, 'p1', 1, 2); // 控え
    const benchHpBefore = unit(state, 'p1', 1).hp;

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    const poison = eventsOfType(events, 'damage').filter((d) => d.source === 'poison');
    expect(poison).toHaveLength(1);
    expect(poison[0]?.amount).toBe(10);
    expect(unit(after, 'p1', 1).hp).toBe(benchHpBefore); // 控えは減らない
  });

  it('毒2重で20ダメージ', () => {
    const state = makeBattle(['kenro'], ['kami']);
    setPoison(state, 'p1', 0, 2);

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const poison = eventsOfType(events, 'damage').find((d) => d.source === 'poison');
    expect(poison?.amount).toBe(20);
  });

  it('毒は技のダメージより後に処理される', () => {
    const state = makeBattle(['kenro'], ['kami']);
    setPoison(state, 'p1', 0, 1);

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const damages = eventsOfType(events, 'damage');
    expect(damages[damages.length - 1]?.source).toBe('poison');
  });

  it('毒で瀕死になると死に出しが必要になる', () => {
    const state = makeBattle(['kenro', 'ishi'], ['kami']);
    setPoison(state, 'p1', 0, 1);
    setHp(state, 'p1', 0, 10); // 紙の攻撃を受けずとも毒で落ちる量

    const { state: after } = resolveTurn(state, { p1: move(0), p2: move(1) });
    expect(after.phase.kind).toBe('awaitingReplacement');
  });
});

describe('死に出し (SPEC §5.7)', () => {
  it('ターンを消費しない', () => {
    const state = makeBattle(['issen', 'kenro'], ['ishi']);
    setHp(state, 'p1', 0, 1);

    const turn1 = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(turn1.state.phase).toEqual({ kind: 'awaitingReplacement', sides: ['p1'] });
    const turnAfterFaint = turn1.state.turn;

    const replaced = resolveReplacements(turn1.state, { p1: 1 });
    expect(replaced.state.turn).toBe(turnAfterFaint); // 増えない
    expect(replaced.state.phase).toEqual({ kind: 'awaitingActions' });
  });

  it('死に出しでも設置を踏む', () => {
    const state = makeBattle(['issen', 'kenro'], ['ishi']);
    setHp(state, 'p1', 0, 1);
    setHazard(state, 'p1', 1);

    const turn1 = resolveTurn(state, { p1: move(0), p2: move(0) });
    const { events } = resolveReplacements(turn1.state, { p1: 1 });

    const hazard = eventsOfType(events, 'damage').find((d) => d.source === 'hazard');
    expect(hazard?.amount).toBe(10);
    expect(hazard?.target).toEqual({ side: 'p1', partyIndex: 1 });
  });

  it('設置ダメージで即瀕死になったら再度死に出しになる(連鎖)', () => {
    const state = makeBattle(['issen', 'kenro', 'ishi'], ['tenohira']);
    setHp(state, 'p1', 0, 1);
    setHp(state, 'p1', 1, 15); // 設置20で落ちる
    setHazard(state, 'p1', 2);

    const turn1 = resolveTurn(state, { p1: move(0), p2: move(0) });
    const first = resolveReplacements(turn1.state, { p1: 1 });

    expect(eventsOfType(first.events, 'faint')).toHaveLength(1);
    expect(first.state.phase).toEqual({ kind: 'awaitingReplacement', sides: ['p1'] });

    const second = resolveReplacements(first.state, { p1: 2 });
    expect(second.state.phase).toEqual({ kind: 'awaitingActions' });
  });

  it('死に出しで登場したユニットは同一ターン中に攻撃されない', () => {
    const state = makeBattle(['issen', 'kenro'], ['ishi']);
    setHp(state, 'p1', 0, 1);

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    // ターン中のダメージはすべて場にいた 0 番に入っている
    for (const d of eventsOfType(events, 'damage')) {
      if (d.target.side === 'p1') expect(d.target.partyIndex).toBe(0);
    }
    // 交代自体がターン解決の中で起きていない
    expect(eventsOfType(events, 'switch')).toHaveLength(0);
  });

  it('瀕死ユニットは以降のダメージを受けない', () => {
    const state = makeBattle(['issen', 'kenro'], ['ishi']);
    setHp(state, 'p1', 0, 1);
    setPoison(state, 'p1', 0, 2); // 倒れた後にターン終了の毒が来る

    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(eventsOfType(events, 'damage').filter((d) => d.source === 'poison')).toHaveLength(0);
  });
});

describe('勝敗 (SPEC §8)', () => {
  it('最後の1体同士の相打ちは引き分け', () => {
    const state = makeBattle(['tekken'], ['kami']);
    setHp(state, 'p1', 0, 40);
    setHp(state, 'p2', 0, 5);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(1) });
    expect(after.phase).toEqual({ kind: 'ended', result: 'draw' });
    expect(eventsOfType(events, 'battleEnd')).toHaveLength(1);
  });

  it('最後の1体でない相打ちは両者が死に出しになる', () => {
    const state = makeBattle(['tekken', 'kenro'], ['kami', 'ishi']);
    setHp(state, 'p1', 0, 40);
    setHp(state, 'p2', 0, 5);

    const { state: after } = resolveTurn(state, { p1: move(0), p2: move(1) });
    expect(after.phase).toEqual({ kind: 'awaitingReplacement', sides: ['p1', 'p2'] });

    const replaced = resolveReplacements(after, { p1: 1, p2: 1 });
    expect(replaced.state.phase).toEqual({ kind: 'awaitingActions' });
  });

  it('相手の選出をすべて撃破した側が勝つ', () => {
    const state = makeBattle(['issen'], ['uchiwa']);
    setHp(state, 'p2', 0, 10);

    const { state: after } = resolveTurn(state, { p1: move(0), p2: move(0) });
    expect(after.phase).toEqual({ kind: 'ended', result: 'p1' });
  });

  it('決着後にさらに行動を宣言すると例外になる', () => {
    const state = makeBattle(['issen'], ['uchiwa']);
    setHp(state, 'p2', 0, 10);
    const { state: after } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(() => resolveTurn(after, { p1: move(0), p2: move(0) })).toThrow();
  });
});

describe('完走 (Phase 2 の完了条件)', () => {
  it('石 vs 紙 が正常終結する', () => {
    const run = runBattle(makeBattle(['ishi'], ['kami']));

    expect(run.result).toBe('p2'); // パーがグーに有利
    expect(run.turns).toBeGreaterThan(0);
    expect(eventsOfType(run.events, 'battleEnd')).toHaveLength(1);
    expect(run.state.phase.kind).toBe('ended');
  });

  it('3体選出同士でも正常終結する', () => {
    const run = runBattle(makeBattle(['ishi', 'kenro', 'tekken'], ['kami', 'tenohira', 'uchiwa']));
    expect(['p1', 'p2', 'draw']).toContain(run.result);
    expect(eventsOfType(run.events, 'battleEnd')).toHaveLength(1);
  });

  it('不正な行動は例外になる', () => {
    const state = makeBattle(['kenro'], ['kami']);
    // 堅牢の枠1は特性なので技として選べない
    expect(() => resolveTurn(state, { p1: move(1), p2: move(0) })).toThrow();
    // 控えがいないのに交代
    expect(() => resolveTurn(state, { p1: switchTo(1), p2: move(0) })).toThrow();
  });
});
