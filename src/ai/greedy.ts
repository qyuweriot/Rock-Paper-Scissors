/**
 * Lv2: 貪欲 (PLAN §268)。Phase 4 のシミュレータが使う (PLAN §271)。
 *
 * PLAN の文言は「最大ダメージを選択 / 不利対面なら交代」だが、これを字面どおりに
 * 実装すると **バラ・一閃・手のひら・器・団扇の5種が本来の技を一度も使わない**
 * (いずれもダメージ0)。バランスレポートがこの5種について嘘をつくことになる。
 *
 * そこで「貪欲」を **1手先の盤面価値を最大化する** と解釈し、候補手ごとに実際に
 * `resolveTurn` を回して結果を `evaluate` で採点する。
 *
 * この形にすると、AI がユニット固有の知識を一切持たずに済む:
 * 魔球の減衰・鉄拳の追い討ち・毒・設置・回復・反射・反動がすべて自動で正しく効く。
 * PLAN §84「新ユニットの追加がデータ追加だけで済む」が AI 側でも保たれる。
 *
 * **エンジンの純粋性に依存している。** `resolveTurn` が入口で structuredClone する
 * からこそ候補手を試し打ちしても盤面が壊れない。この前提が崩れると AI が静かに
 * 試合を破壊するので、runner のテストで「AI呼び出しの前後で state が不変」を固定する。
 */

import { getActiveUnit, getLegalActions, getUnitDef, resolveTurn } from '../engine/battle';
import { getMatchup } from '../engine/damage';
import type { Action, BattleState, Side } from '../engine/types';
import { SWITCH_DISADVANTAGE_BONUS, SWITCH_MIN_HP_RATIO } from './constants';
import { evaluate } from './evaluate';
import { chooseBestReplacement } from './replacement';
import type { Ai } from './types';

export function opponentOf(side: Side): Side {
  return side === 'p1' ? 'p2' : 'p1';
}

/** 相手の想定行動。決定論にするため合法手の先頭で固定する */
export function assumedOpponentAction(state: BattleState, side: Side): Action {
  const legal = getLegalActions(state, opponentOf(side));
  const choice = legal[0];
  if (!choice) throw new Error(`${opponentOf(side)} に選択できる行動がありません`);
  return choice;
}

/** 自分の行動と相手の行動を resolveTurn の引数の形に組む */
export function pairActions(
  side: Side,
  mine: Action,
  theirs: Action,
): Record<Side, Action> {
  return side === 'p1' ? { p1: mine, p2: theirs } : { p1: theirs, p2: mine };
}

/**
 * 交代の加点 (PLAN §268「不利対面なら交代」)。
 *
 * 1手先しか見ない評価では**交代は必ず「殴られ損」に見える**ため、
 * この加点がないと AI は一度も交代しない。逆に無条件で加点すると
 * 両者が交代し合って膠着するので、次の3条件をすべて満たすときだけ加点する。
 *
 * 交代後は自分が有利対面になるので、同じ条件で連続して交代することはない。
 */
export function switchBonus(state: BattleState, side: Side, action: Action): number {
  if (action.kind !== 'switch') return 0;

  const opponentDef = getUnitDef(getActiveUnit(state, opponentOf(side)));
  const currentDef = getUnitDef(getActiveUnit(state, side));
  if (getMatchup(currentDef.attribute, opponentDef.attribute) !== 'disadvantage') return 0;

  const candidate = state.sides[side].party[action.toPartyIndex];
  if (!candidate) return 0;
  const candidateDef = getUnitDef(candidate);
  if (getMatchup(candidateDef.attribute, opponentDef.attribute) !== 'advantage') return 0;

  // 瀕死寸前のユニットを差し出さない
  if (candidate.hp / candidateDef.maxHp < SWITCH_MIN_HP_RATIO) return 0;

  return SWITCH_DISADVANTAGE_BONUS;
}

export function createGreedyAi(): Ai {
  return {
    name: 'greedy',

    chooseAction(state: BattleState, side: Side): Action {
      const legal = getLegalActions(state, side);
      const assumed = assumedOpponentAction(state, side);

      let best: Action | undefined;
      let bestScore = -Infinity;

      for (const action of legal) {
        const after = resolveTurn(state, pairActions(side, action, assumed));
        const score = evaluate(after.state, side) + switchBonus(state, side, action);
        // 同点は getLegalActions の並び順で先勝ち(決定論のため)
        if (score > bestScore) {
          bestScore = score;
          best = action;
        }
      }

      if (!best) throw new Error(`${side} に選択できる行動がありません`);
      return best;
    },

    chooseReplacement: chooseBestReplacement,
  };
}
