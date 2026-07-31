/**
 * 1試合を回して統計を採る (PLAN §231)。
 *
 * `engine/testkit.ts` の `runBattle` は「本番コードからは import しないこと」と
 * 明記されたテスト専用ヘルパなので流用しない。決定的な違いが2つある:
 *
 * - **未決着を例外にしない。** testkit は無限ループをテストで検出するために投げるが、
 *   シミュレータにとって膠着の頻度は測定対象そのもの (SPEC §12-3 ターン上限の要否)
 * - 行動を AI に委ね、レポートに必要な指標をイベント列から拾う
 */

import { createBattle, resolveReplacements, resolveTurn } from '../engine/battle';
import type { BattleEvent, BattleResult, BattleState, Side } from '../engine/types';
import type { UnitId } from '../data/units';
import type { Ai } from '../ai';

const SIDES: readonly Side[] = ['p1', 'p2'];

/** 決着しなかった試合。勝率の分母からは外し、件数だけを報告する */
export const STALL = 'stall';

export interface GameResult {
  teams: Record<Side, UnitId[]>;
  result: BattleResult | typeof STALL;
  /** 解決したターン数。死に出しは消費しない (SPEC §5.7) */
  turns: number;
  /** 1体目が倒れたターン (PLAN §246)。誰も倒れずに終わったなら null */
  turnsToFirstFaint: number | null;
  /**
   * 一閃が積みに成功したか (PLAN §253)。
   * 「構えを使い、交代も瀕死もせずに一閃斬りを1回以上撃てた」を成功とする。
   * 合算した勝率はHP40の脆さで平均されてしまい、累積上限の判断材料にならない。
   */
  issenStacked: Record<Side, boolean>;
}

export interface RunGameOptions {
  teams: Record<Side, UnitId[]>;
  /** 試合ごとに生成して渡すこと。Lv1 は内部にシードを持つため使い回すと試合が独立しない */
  ai: Record<Side, Ai>;
  seed?: number;
  /** 超えたら未決着として打ち切る。既定300 */
  maxTurns?: number;
}

export function runGame(options: RunGameOptions): GameResult {
  const { teams, ai, seed = 0, maxTurns = 300 } = options;

  let state: BattleState = createBattle(teams.p1, teams.p2, seed);
  const tracker = createIssenTracker(teams);

  let turns = 0;
  let turnsToFirstFaint: number | null = null;

  const observe = (events: BattleEvent[]): void => {
    tracker.observe(events);
    if (turnsToFirstFaint === null && events.some((e) => e.type === 'faint')) {
      turnsToFirstFaint = turns;
    }
  };

  while (state.phase.kind !== 'ended') {
    if (state.phase.kind === 'awaitingReplacement') {
      const choices: Partial<Record<Side, number>> = {};
      for (const side of state.phase.sides) choices[side] = ai[side].chooseReplacement(state, side);
      const step = resolveReplacements(state, choices);
      state = step.state;
      observe(step.events);
      continue;
    }

    if (turns >= maxTurns) {
      return {
        teams,
        result: STALL,
        turns,
        turnsToFirstFaint,
        issenStacked: tracker.result(),
      };
    }

    const step = resolveTurn(state, {
      p1: ai.p1.chooseAction(state, 'p1'),
      p2: ai.p2.chooseAction(state, 'p2'),
    });
    state = step.state;
    turns += 1;
    observe(step.events);
  }

  return {
    teams,
    result: state.phase.result,
    turns,
    turnsToFirstFaint,
    issenStacked: tracker.result(),
  };
}

// --- 一閃の積み成功判定 (PLAN §253) -----------------------------------------

/**
 * イベント列から「構えが実を結んだか」を拾う。
 *
 * 積みは交代・瀕死でリセットされる (SPEC §4.3) ので、
 * 構えた後に一度も殴れなければ失敗として数える。
 */
function createIssenTracker(teams: Record<Side, UnitId[]>) {
  const stacked: Record<Side, boolean> = { p1: false, p2: false };
  const success: Record<Side, boolean> = { p1: false, p2: false };

  const isIssen = (side: Side, partyIndex: number): boolean =>
    teams[side][partyIndex] === 'issen';

  return {
    observe(events: BattleEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'modifier':
            // 一閃の技2。'turn' 持続 (はさみの守勢) は積みではない
            if (event.duration === 'untilSwitch' && isIssen(event.target.side, event.target.partyIndex)) {
              stacked[event.target.side] = true;
            }
            break;

          case 'moveUsed':
            // 積んだ状態で一閃斬りを撃てた
            if (
              event.slotIndex === 0 &&
              isIssen(event.user.side, event.user.partyIndex) &&
              stacked[event.user.side]
            ) {
              success[event.user.side] = true;
            }
            break;

          case 'switch':
            // 交代で積みが消える。出ていく側も入ってくる側もリセット済み
            if (isIssen(event.side, event.to.partyIndex) || (event.from && isIssen(event.side, event.from.partyIndex))) {
              stacked[event.side] = false;
            }
            break;

          case 'faint':
            if (isIssen(event.target.side, event.target.partyIndex)) {
              stacked[event.target.side] = false;
            }
            break;

          default:
            break;
        }
      }
    },

    result(): Record<Side, boolean> {
      return { p1: success.p1, p2: success.p2 };
    },
  };
}

/** 一閃を含まない陣営は集計から外すため、参加していたかを判定する */
export function includesUnit(result: GameResult, side: Side, unitId: UnitId): boolean {
  return result.teams[side].includes(unitId);
}

export { SIDES };
