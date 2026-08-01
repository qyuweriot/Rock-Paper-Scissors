import { describe, expect, it } from 'vitest';
import { runGame, STALL } from './runner';
import { createAi, type AiLevel } from '../ai';
import { createBattle } from '../engine/battle';
import type { Side } from '../engine/types';
import type { UnitId } from '../data/units';

function play(
  p1: UnitId[],
  p2: UnitId[],
  levels: [AiLevel, AiLevel] = [2, 2],
  seed = 0,
  maxTurns = 300,
) {
  return runGame({
    teams: { p1, p2 },
    ai: { p1: createAi(levels[0], seed), p2: createAi(levels[1], seed + 1) },
    seed,
    maxTurns,
  });
}

describe('runGame — 1試合の実行', () => {
  it('試合が決着する', () => {
    const result = play(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    expect(['p1', 'p2', 'draw']).toContain(result.result);
    expect(result.turns).toBeGreaterThan(0);
  });

  it('同じシードなら結果が完全に一致する (PLAN §237)', () => {
    const teams: [UnitId[], UnitId[]] = [
      ['magyu', 'uchiwa', 'bara'],
      ['ghost', 'tenohira', 'utsuwa'],
    ];
    expect(play(...teams, [1, 1], 99)).toEqual(play(...teams, [1, 1], 99));
  });

  it('シードが違えば結果が変わりうる。団扇の抽選が唯一の乱数源 (SPEC §10.14)', () => {
    const teams: [UnitId[], UnitId[]] = [
      ['uchiwa', 'bara', 'ghost'],
      ['ishi', 'kenro', 'issen'],
    ];
    const series = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(play(...teams, [1, 1], i))),
    );
    expect(series.size).toBeGreaterThan(1);
  });

  it('未決着は例外にならず stall として返る (SPEC §12-3 の判断材料)', () => {
    // 1ターンで打ち切る
    const result = play(['kenro'], ['kenro'], [2, 2], 0, 1);
    expect(result.result).toBe(STALL);
    expect(result.turns).toBe(1);
  });

  it('1体目撃破のターンを記録する (PLAN §246)', () => {
    const result = play(['issen', 'bara', 'ghost'], ['funsai', 'tekken', 'ishi']);
    expect(result.turnsToFirstFaint).not.toBeNull();
    expect(result.turnsToFirstFaint).toBeLessThanOrEqual(result.turns);
  });

  it('誰も倒れずに打ち切られたら turnsToFirstFaint は null', () => {
    const result = play(['kenro'], ['kenro'], [2, 2], 0, 2);
    expect(result.result).toBe(STALL);
    expect(result.turnsToFirstFaint).toBeNull();
  });

  it('AI の試し打ちで盤面が壊れない。エンジンの純粋性への依存を固定する', () => {
    const state = createBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami'], 0);
    const before = structuredClone(state);
    for (const level of [1, 2, 3] as AiLevel[]) {
      for (const side of ['p1', 'p2'] as Side[]) {
        createAi(level, 3).chooseAction(state, side);
      }
    }
    expect(state).toEqual(before);
  });

  describe('一閃の積み成功判定 (PLAN §253)', () => {
    it('一閃がいなければ両陣営とも false', () => {
      const result = play(['ishi', 'kenro'], ['bara', 'hasami']);
      expect(result.issenStacked).toEqual({ p1: false, p2: false });
    });

    it('構えてから斬れていれば true になる', () => {
      // 一閃(チョキ40) vs 山嵐(チョキ100)。互角対面なので一閃斬りは35しか通らず、
      // しかも棘の反射で10返ってくる (SPEC §10.7)。殴るより構える方が得な唯一の対面
      const result = play(['issen'], ['yamaarashi']);
      expect(result.issenStacked.p1).toBe(true);
    });

    it('構える前に倒されれば false のまま', () => {
      // 粉砕(45+25=70) は 一閃(HP40) を初手で吹き飛ばす
      const result = play(['issen'], ['funsai']);
      expect(result.issenStacked.p1).toBe(false);
    });
  });

  /**
   * PLAN §273 の完了条件「Lv2 以上が人間相手に成立する強さ」の裏付け。
   *
   * **Lv3 と Lv2 の差はここでは測らない。** 実測で 50.7% 対 48.2% (6,000試合、
   * 95%信頼区間 ±1.3) と差が 2.5 ポイントしかなく、テストに置ける規模の試合数では
   * 検出できない。数十試合で「勝ち越した」と主張しても、実質コイン投げになる。
   * その比較は `npm run sim -- --ai1 3 --ai2 2 --sample 6000` で行う。
   *
   * ここで固定するのは**桁で違う差**、すなわち盤面を見るAIが見ないAIを圧倒すること。
   * 評価関数や探索が壊れれば真っ先にここが落ちる。
   */
  describe('盤面を見るAIはランダムを圧倒する (PLAN §273)', () => {
    const teams: UnitId[][] = [
      ['funsai', 'kamakiri', 'tenohira'],
      ['ishi', 'kenro', 'kami'],
      ['bara', 'issen', 'hasami'],
      ['magyu', 'uchiwa', 'ghost'],
      ['tekken', 'yamaarashi', 'utsuwa'],
    ];

    /** 対象AIから見た勝率。先手・後手の両方をやって手番の有利を打ち消す */
    function scoreAgainstRandom(level: AiLevel): number {
      let score = 0;
      let decided = 0;

      for (const a of teams) {
        for (const b of teams) {
          for (const target of ['p1', 'p2'] as Side[]) {
            const levels: [AiLevel, AiLevel] = target === 'p1' ? [level, 1] : [1, level];
            const result = runGame({
              teams: { p1: a, p2: b },
              ai: { p1: createAi(levels[0], 0), p2: createAi(levels[1], 0) },
              seed: 0,
            });
            if (result.result === STALL) continue;
            decided += 1;
            if (result.result === target) score += 1;
            else if (result.result === 'draw') score += 0.5;
          }
        }
      }

      expect(decided).toBeGreaterThan(0);
      return score / decided;
    }

    it('Lv2 がランダムに大きく勝ち越す', () => {
      expect(scoreAgainstRandom(2)).toBeGreaterThan(0.65);
    });

    it('Lv3 がランダムに大きく勝ち越す', () => {
      expect(scoreAgainstRandom(3)).toBeGreaterThan(0.65);
    });
  });
});
