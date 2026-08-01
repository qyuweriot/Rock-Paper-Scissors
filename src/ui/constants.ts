/**
 * UI の調整値。
 *
 * **ゲームバランスとは無関係。** ここを変えても対戦の仕様は変わらない。
 * ゲームの数値は engine/constants.ts と data/units.ts にある (PLAN §3.3)。
 */

import type { BattleEvent } from '../engine/types';

/**
 * 再生全体の速さ。**大きいほどゆっくり。** 体感速度の調整はここだけで行う。
 *
 * **変えたら index.css の `--fx` も同じ値にすること。**
 * CSS のアニメーションがコマの表示時間より長いと、途中で要素ごと消えて切られる。
 */
export const PLAYBACK_SCALE = 1.45;

/**
 * 種別ごとの相対的な重さ。**比率だけを持ち、実時間は SCALE を掛けて決まる。**
 * 意味の重いイベントほど長く止める。1ターンのイベントは最大9件。
 */
const BASE_MS: Record<BattleEvent['type'], number> = {
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

/** 再生1コマあたりの表示時間 (ミリ秒) */
export const PLAYBACK_MS: Record<BattleEvent['type'], number> = Object.fromEntries(
  Object.entries(BASE_MS).map(([type, ms]) => [type, Math.round(ms * PLAYBACK_SCALE)]),
) as Record<BattleEvent['type'], number>;

export function playbackDurationOf(event: BattleEvent): number {
  return PLAYBACK_MS[event.type];
}
