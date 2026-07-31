/**
 * UI の調整値。
 *
 * **ゲームバランスとは無関係。** ここを変えても対戦の仕様は変わらない。
 * ゲームの数値は engine/constants.ts と data/units.ts にある (PLAN §3.3)。
 */

import type { BattleEvent } from '../engine/types';

/**
 * 再生1コマあたりの表示時間 (ミリ秒)。
 *
 * 意味の重いイベントほど長く止める。1ターンのイベントは最大9件なので、
 * 全部見ても5秒程度に収まる。急ぐときは画面をタップしてスキップできる。
 */
export const PLAYBACK_MS: Record<BattleEvent['type'], number> = {
  moveUsed: 420,
  damage: 620,
  heal: 560,
  healBlocked: 460,
  faint: 900,
  switch: 700,
  poisonApplied: 500,
  hazardSet: 500,
  modifier: 500,
  noEffect: 400,
  battleEnd: 700,
};

export function playbackDurationOf(event: BattleEvent): number {
  return PLAYBACK_MS[event.type];
}
