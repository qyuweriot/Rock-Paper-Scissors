/**
 * AI の語彙 (PLAN §263)。
 *
 * engine のみに依存する (PLAN §2)。React・DOM・ブラウザAPIには触らない。
 * シミュレータ (Phase 4) と UI (Phase 6) の両方がこのインターフェースを使う。
 */

import type { Action, BattleState, Side } from '../engine/types';

/** PLAN §265: 1=ランダム / 2=貪欲 / 3=1手先読み */
export type AiLevel = 1 | 2 | 3;

export interface Ai {
  readonly name: string;

  /**
   * 行動を宣言する (SPEC §5.1)。
   * **phase が `awaitingActions` のときだけ呼べる。** 内部で resolveTurn を試し打ちするため。
   */
  chooseAction(state: BattleState, side: Side): Action;

  /**
   * 死に出しの交代先を選ぶ (SPEC §5.7)。party 添字を返す。
   * ターンを消費しない処理なので、試し打ちではなく相性で判断する。
   */
  chooseReplacement(state: BattleState, side: Side): number;
}
