/**
 * 試合結果の集計 (PLAN §239-255)。
 *
 * **勝率の定義をここで確定させる。** 決めておかないとレポートの数字が読めない:
 *
 * - **引き分けは 0.5勝** として数える(スコア方式)。相打ちによる引き分けは
 *   SPEC §8 が明示的に認めた結果であって、無効試合ではない
 * - **未決着 (stall) は勝率の分母から外す。** 何ターン回しても決着しなかった試合は
 *   勝敗の情報を持たない。件数だけを別に報告し、SPEC §12-3 の判断材料にする
 */

import { getUnit, UNIT_IDS, type UnitId } from '../data/units';
import type { Attribute, Side } from '../engine/types';
import { STALL, type GameResult } from './runner';

const SIDES: readonly Side[] = ['p1', 'p2'];

export const ATTRIBUTES: readonly Attribute[] = ['gu', 'choki', 'pa'];

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  gu: 'グー',
  choki: 'チョキ',
  pa: 'パー',
};

/** 勝率を測る単位。「その陣営から見た1試合」を1件として積む */
interface Tally {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  stalls: number;
  /** 決着した試合の合計ターン数。平均を出すのに使う */
  decidedTurns: number;
}

function emptyTally(): Tally {
  return { games: 0, wins: 0, losses: 0, draws: 0, stalls: 0, decidedTurns: 0 };
}

/**
 * 事前に埋めた Map から取り出す。見つからないのは集計漏れなので黙って捨てない。
 * `?? emptyTally()` で誤魔化すと、計上先のない結果が静かに消えて数字が合わなくなる。
 */
function tallyOf<K>(map: Map<K, Tally>, key: K): Tally {
  const tally = map.get(key);
  if (!tally) throw new Error(`集計先がありません: ${String(key)}`);
  return tally;
}

function record(tally: Tally, result: GameResult, side: Side): void {
  tally.games += 1;
  if (result.result === STALL) {
    tally.stalls += 1;
    return;
  }
  tally.decidedTurns += result.turns;
  if (result.result === 'draw') tally.draws += 1;
  else if (result.result === side) tally.wins += 1;
  else tally.losses += 1;
}

/** 決着した試合のみを分母にする。引き分けは0.5勝 */
export function winRate(tally: Tally): number {
  const decided = tally.games - tally.stalls;
  if (decided === 0) return 0;
  return (tally.wins + tally.draws * 0.5) / decided;
}

export function avgTurns(tally: Tally): number {
  const decided = tally.games - tally.stalls;
  return decided === 0 ? 0 : tally.decidedTurns / decided;
}

// --- レポート ---------------------------------------------------------------

export interface UnitStat {
  id: UnitId;
  name: string;
  attribute: Attribute;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  stalls: number;
  winRate: number;
  /** そのユニットを含む試合の平均決着ターン数。バラの膠着を見るのに使う (PLAN §254) */
  avgTurns: number;
}

export interface AttributeStat {
  attribute: Attribute;
  label: string;
  games: number;
  winRate: number;
}

export interface SelectionStat {
  units: UnitId[];
  label: string;
  games: number;
  winRate: number;
}

/** 一閃の積み成功/失敗別 (PLAN §253) */
export interface IssenStat {
  stacked: { games: number; winRate: number };
  notStacked: { games: number; winRate: number };
}

export interface Report {
  games: number;
  /** 決着した試合数。勝率の分母 */
  decided: number;
  draws: number;
  stalls: number;
  drawRate: number;
  /**
   * p1 側の勝率。両者が同じ AI なら**手番の有利さ**を、
   * 違う AI なら **p1 の AI の強さ**を表す (PLAN §273 の完了条件の確認に使う)。
   */
  p1WinRate: number;
  avgTurns: number;
  /** 1体目撃破までの平均ターン数 (PLAN §246) */
  avgTurnsToFirstFaint: number;
  units: UnitStat[];
  attributes: AttributeStat[];
  selections: SelectionStat[];
  issen: IssenStat;
  /** ハサミムシと粉砕が敵味方に分かれた試合での粉砕側の勝率 (SPEC §12-2) */
  hasamimushiVsFunsai: { games: number; funsaiWinRate: number };
}

export function buildReport(results: GameResult[]): Report {
  const unitTallies = new Map<UnitId, Tally>(UNIT_IDS.map((id) => [id, emptyTally()]));
  const attrTallies = new Map<Attribute, Tally>(ATTRIBUTES.map((a) => [a, emptyTally()]));
  const selectionTallies = new Map<string, { units: UnitId[]; tally: Tally }>();
  const issenStacked = emptyTally();
  const issenNotStacked = emptyTally();
  const funsaiVs = emptyTally();
  const p1Tally = emptyTally();

  let draws = 0;
  let stalls = 0;
  let decidedTurns = 0;
  let firstFaintTotal = 0;
  let firstFaintCount = 0;

  for (const result of results) {
    if (result.result === STALL) stalls += 1;
    else {
      decidedTurns += result.turns;
      if (result.result === 'draw') draws += 1;
    }
    if (result.turnsToFirstFaint !== null) {
      firstFaintTotal += result.turnsToFirstFaint;
      firstFaintCount += 1;
    }
    record(p1Tally, result, 'p1');

    for (const side of SIDES) {
      const team = result.teams[side];

      // 同じ陣営に同じユニットは入らない (選出は重複なし) ので二重計上にならない
      for (const id of team) {
        record(tallyOf(unitTallies, id), result, side);
        record(tallyOf(attrTallies, getUnit(id).attribute), result, side);
      }

      const key = [...team].sort().join(',');
      let entry = selectionTallies.get(key);
      if (!entry) {
        entry = { units: team, tally: emptyTally() };
        selectionTallies.set(key, entry);
      }
      record(entry.tally, result, side);

      // 一閃の層別 (PLAN §253)。一閃を選出した陣営の試合だけを数える
      if (team.includes('issen')) {
        record(result.issenStacked[side] ? issenStacked : issenNotStacked, result, side);
      }

      // ハサミムシ × 粉砕 (SPEC §12-2)。粉砕側から見た勝率を採る
      const opponentTeam = result.teams[side === 'p1' ? 'p2' : 'p1'];
      if (team.includes('funsai') && opponentTeam.includes('hasamimushi')) {
        record(funsaiVs, result, side);
      }
    }
  }

  const decided = results.length - stalls;

  return {
    games: results.length,
    decided,
    draws,
    stalls,
    drawRate: decided === 0 ? 0 : draws / decided,
    p1WinRate: winRate(p1Tally),
    avgTurns: decided === 0 ? 0 : decidedTurns / decided,
    avgTurnsToFirstFaint: firstFaintCount === 0 ? 0 : firstFaintTotal / firstFaintCount,

    units: UNIT_IDS.map((id) => {
      const tally = tallyOf(unitTallies, id);
      const def = getUnit(id);
      return {
        id,
        name: def.name,
        attribute: def.attribute,
        games: tally.games,
        wins: tally.wins,
        losses: tally.losses,
        draws: tally.draws,
        stalls: tally.stalls,
        winRate: winRate(tally),
        avgTurns: avgTurns(tally),
      };
    }).sort((a, b) => b.winRate - a.winRate),

    attributes: ATTRIBUTES.map((attribute) => {
      const tally = tallyOf(attrTallies, attribute);
      return {
        attribute,
        label: ATTRIBUTE_LABELS[attribute],
        games: tally.games,
        winRate: winRate(tally),
      };
    }),

    selections: [...selectionTallies.values()]
      .map(({ units, tally }) => ({
        units,
        label: units.map((id) => getUnit(id).name).join(' / '),
        games: tally.games,
        winRate: winRate(tally),
      }))
      .sort((a, b) => b.winRate - a.winRate),

    issen: {
      stacked: { games: issenStacked.games, winRate: winRate(issenStacked) },
      notStacked: { games: issenNotStacked.games, winRate: winRate(issenNotStacked) },
    },

    hasamimushiVsFunsai: { games: funsaiVs.games, funsaiWinRate: winRate(funsaiVs) },
  };
}

// --- 1対1の対面表 -----------------------------------------------------------

export interface MatchupCell {
  attacker: UnitId;
  defender: UnitId;
  result: GameResult['result'];
  turns: number;
}

/** singlesPairs() の結果をそのまま表にする。行=p1側、列=p2側 */
export function buildMatchupTable(results: GameResult[]): MatchupCell[] {
  return results.map((result) => {
    const attacker = result.teams.p1[0];
    const defender = result.teams.p2[0];
    if (!attacker || !defender) throw new Error('1対1の結果に選出が入っていません');
    return { attacker, defender, result: result.result, turns: result.turns };
  });
}
