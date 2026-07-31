/**
 * 盤面の採点。Lv2 と Lv3 が共有する。
 *
 * 「1手先の盤面価値」を測るための関数なので、**1手では現れない要素を明示的に足す**
 * 必要がある。設置は登場時にしか踏まないし、攻勢修正は次のターン以降に効く。
 * これらを落とすと AI はバラの棘撒きも一閃の構えも一度も使わない。
 *
 * 逆に毒は付与したターンの終了時に発動する (endOfTurn は全段の後) ため、
 * 1手のシミュレーションでも HP 差として現れる。それでも将来ぶんの価値があるので
 * 小さめの項を足してある。
 */

import { getActiveUnit, getUnitDef } from '../engine/battle';
import type { BattleState, Side } from '../engine/types';
import {
  WEIGHT_ATK_MOD,
  WEIGHT_FAINT,
  WEIGHT_HAZARD,
  WEIGHT_HP,
  WEIGHT_POISON,
} from './constants';

const SIDES: readonly Side[] = ['p1', 'p2'];

/**
 * `side` から見た盤面の良さ。大きいほど良い。
 *
 * 自陣と敵陣で符号が反転するだけの対称な関数なので、
 * `evaluate(state, 'p1') === -evaluate(state, 'p2')` が常に成り立つ。
 */
export function evaluate(state: BattleState, side: Side): number {
  let score = 0;

  for (const target of SIDES) {
    const sign = target === side ? 1 : -1;
    const sideState = state.sides[target];

    for (const unit of sideState.party) {
      score += sign * WEIGHT_HP * (unit.hp / getUnitDef(unit).maxHp);
      if (unit.fainted) score -= sign * WEIGHT_FAINT;
      // 毒はユニット単位で保持され、控えでも消えない (SPEC §7.1)
      score -= sign * WEIGHT_POISON * unit.poisonStacks;
    }

    // 設置は「保持する側 = 踏む側」(SideState.hazardStacks のコメント参照)
    score -= sign * WEIGHT_HAZARD * sideState.hazardStacks;

    // 修正値は場に出ている間だけ意味がある。控えの積みは交代時にリセット済み
    const active = getActiveUnit(state, target);
    if (!active.fainted) score += sign * WEIGHT_ATK_MOD * active.modifiers.atk;
  }

  return score;
}
