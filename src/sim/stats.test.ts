import { describe, expect, it } from 'vitest';
import { buildMatchupTable, buildReport } from './stats';
import { STALL, type GameResult } from './runner';
import type { UnitId } from '../data/units';

function game(
  p1: UnitId[],
  p2: UnitId[],
  result: GameResult['result'],
  turns = 10,
  extra: Partial<GameResult> = {},
): GameResult {
  return {
    teams: { p1, p2 },
    result,
    turns,
    turnsToFirstFaint: 3,
    issenStacked: { p1: false, p2: false },
    ...extra,
  };
}

const A: UnitId[] = ['ishi', 'kenro', 'kami'];
const B: UnitId[] = ['bara', 'issen', 'hasami'];

describe('buildReport — 集計', () => {
  it('勝敗をユニット別に積む', () => {
    const report = buildReport([game(A, B, 'p1'), game(A, B, 'p1'), game(A, B, 'p2')]);

    const ishi = report.units.find((u) => u.id === 'ishi');
    expect(ishi).toMatchObject({ games: 3, wins: 2, losses: 1, draws: 0 });
    expect(ishi?.winRate).toBeCloseTo(2 / 3);

    const bara = report.units.find((u) => u.id === 'bara');
    expect(bara).toMatchObject({ games: 3, wins: 1, losses: 2 });
    expect(bara?.winRate).toBeCloseTo(1 / 3);
  });

  it('p1 の勝率を出す。AI の強さ比較と手番の有利さの両方に使う', () => {
    const report = buildReport([
      game(A, B, 'p1'),
      game(A, B, 'p1'),
      game(A, B, 'p2'),
      game(A, B, 'draw'),
    ]);
    expect(report.p1WinRate).toBeCloseTo(2.5 / 4);
  });

  it('引き分けは 0.5勝として数える (SPEC §8)', () => {
    const report = buildReport([game(A, B, 'draw'), game(A, B, 'draw')]);
    expect(report.units.find((u) => u.id === 'ishi')?.winRate).toBe(0.5);
    expect(report.drawRate).toBe(1);
  });

  it('未決着は勝率の分母から外れる。件数だけが残る', () => {
    const report = buildReport([game(A, B, 'p1'), game(A, B, STALL, 300)]);

    expect(report.stalls).toBe(1);
    expect(report.decided).toBe(1);
    // 1勝0敗。未決着があっても 50% には薄まらない
    expect(report.units.find((u) => u.id === 'ishi')?.winRate).toBe(1);
  });

  it('未決着のターン数は平均に混ぜない', () => {
    const report = buildReport([game(A, B, 'p1', 10), game(A, B, STALL, 300)]);
    expect(report.avgTurns).toBe(10);
  });

  it('全試合が未決着でも壊れない', () => {
    const report = buildReport([game(A, B, STALL, 300)]);
    expect(report.decided).toBe(0);
    expect(report.avgTurns).toBe(0);
    expect(report.drawRate).toBe(0);
  });

  it('空の入力でも壊れない', () => {
    const report = buildReport([]);
    expect(report.games).toBe(0);
    expect(report.units).toHaveLength(15);
  });

  it('属性別に束ねる。石・堅牢・紙のうち2体がグー', () => {
    const report = buildReport([game(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami'], 'p1')]);

    const gu = report.attributes.find((a) => a.attribute === 'gu');
    const choki = report.attributes.find((a) => a.attribute === 'choki');
    // p1 のグー2体が1勝ずつ、p1 のパー(紙)が1勝、p2 のチョキ3体が1敗ずつ
    expect(gu).toMatchObject({ games: 2, winRate: 1 });
    expect(choki).toMatchObject({ games: 3, winRate: 0 });
  });

  it('選出は並び順が違っても同じ組として束ねる', () => {
    const report = buildReport([
      game(['ishi', 'kenro', 'kami'], B, 'p1'),
      game(['kami', 'ishi', 'kenro'], B, 'p1'),
    ]);
    const entry = report.selections.find((s) => s.units.includes('ishi') && s.units.includes('kami'));
    expect(entry?.games).toBe(2);
  });

  it('ユニット別は勝率の降順に並ぶ', () => {
    const report = buildReport([game(A, B, 'p1'), game(A, B, 'p1')]);
    const rates = report.units.map((u) => u.winRate);
    expect([...rates].sort((x, y) => y - x)).toEqual(rates);
  });

  it('1体目撃破までの平均ターン数を出す (PLAN §246)', () => {
    const report = buildReport([
      game(A, B, 'p1', 10, { turnsToFirstFaint: 2 }),
      game(A, B, 'p1', 10, { turnsToFirstFaint: 6 }),
      game(A, B, 'p1', 10, { turnsToFirstFaint: null }), // 誰も倒れず → 平均に混ぜない
    ]);
    expect(report.avgTurnsToFirstFaint).toBe(4);
  });

  describe('一閃の層別 (PLAN §253)', () => {
    it('積み成功時と失敗時で勝率を分ける', () => {
      const withIssen: UnitId[] = ['issen', 'bara', 'hasami'];
      const report = buildReport([
        game(withIssen, A, 'p1', 10, { issenStacked: { p1: true, p2: false } }),
        game(withIssen, A, 'p2', 10, { issenStacked: { p1: false, p2: false } }),
        game(withIssen, A, 'p2', 10, { issenStacked: { p1: false, p2: false } }),
      ]);

      expect(report.issen.stacked).toEqual({ games: 1, winRate: 1 });
      expect(report.issen.notStacked).toEqual({ games: 2, winRate: 0 });
    });

    it('一閃を選出していない陣営は数えない', () => {
      const report = buildReport([game(A, B.filter((id) => id !== 'issen'), 'p1')]);
      expect(report.issen.stacked.games).toBe(0);
      expect(report.issen.notStacked.games).toBe(0);
    });
  });

  describe('カマキリ × 粉砕 (SPEC §12-2)', () => {
    it('両者が敵味方に分かれた試合を、粉砕側から見て数える', () => {
      const funsaiTeam: UnitId[] = ['funsai', 'ishi', 'kenro'];
      const mushiTeam: UnitId[] = ['kamakiri', 'bara', 'hasami'];
      const report = buildReport([
        game(funsaiTeam, mushiTeam, 'p1'),
        game(funsaiTeam, mushiTeam, 'p2'),
        game(funsaiTeam, mushiTeam, 'p2'),
      ]);
      expect(report.kamakiriVsFunsai).toEqual({ games: 3, funsaiWinRate: 1 / 3 });
    });

    it('同じ陣営に両者がいる試合は数えない', () => {
      const report = buildReport([game(['funsai', 'kamakiri', 'ishi'], A, 'p1')]);
      expect(report.kamakiriVsFunsai.games).toBe(0);
    });
  });
});

describe('buildMatchupTable — 1対1の対面表', () => {
  it('p1側を行、p2側を列として並べる', () => {
    const cells = buildMatchupTable([
      game(['funsai'], ['kamakiri'], 'p2', 4),
      game(['kamakiri'], ['funsai'], 'p1', 5),
    ]);

    expect(cells).toEqual([
      { attacker: 'funsai', defender: 'kamakiri', result: 'p2', turns: 4 },
      { attacker: 'kamakiri', defender: 'funsai', result: 'p1', turns: 5 },
    ]);
  });
});
