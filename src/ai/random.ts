/**
 * Lv1: ランダム (PLAN §266)。
 *
 * 他のAIの強さを測るための基準線。合法手から一様に選ぶだけで、盤面を一切見ない。
 *
 * **交代先もランダムに選ぶ。** Lv2 / Lv3 は相性で選ぶ (replacement.ts) が、
 * Lv1 は「盤面を見ないAI」であることに意味があるので、ここだけ賢くはしない。
 */

import { getLegalActions } from '../engine/battle';
import { nextInt } from '../engine/rng';
import type { Action, BattleState, Side } from '../engine/types';
import type { Ai } from './types';

/**
 * `Math.random()` は禁止されている (PLAN §3.4) ため engine/rng.ts を経由する。
 * シードはインスタンスが持つので、**同じシードで作れば選択列が完全に一致する**。
 */
export function createRandomAi(seed = 0): Ai {
  let rngSeed = seed;

  const roll = (max: number): number => {
    const rolled = nextInt(rngSeed, max);
    rngSeed = rolled.seed;
    return rolled.value;
  };

  return {
    name: 'random',

    chooseAction(state: BattleState, side: Side): Action {
      const legal = getLegalActions(state, side);
      const choice = legal[roll(legal.length)];
      if (!choice) throw new Error(`${side} に選択できる行動がありません`);
      return choice;
    },

    chooseReplacement(state: BattleState, side: Side): number {
      const living: number[] = [];
      state.sides[side].party.forEach((unit, index) => {
        if (!unit.fainted) living.push(index);
      });
      const choice = living[roll(living.length)];
      if (choice === undefined) throw new Error(`${side} に交代できる生存ユニットがいません`);
      return choice;
    },
  };
}
