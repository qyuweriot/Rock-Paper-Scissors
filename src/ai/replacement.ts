/**
 * 死に出しの交代先選び (SPEC §5.7)。Lv2 / Lv3 が共有する。
 *
 * 死に出しはターンを消費しない (SPEC §5.7) ので、他の判断のように resolveTurn で
 * 試し打ちすることができない。相性で判断する。
 */

import { getActiveUnit, getUnitDef } from '../engine/battle';
import { getMatchup, type Matchup } from '../engine/damage';
import type { BattleState, Side } from '../engine/types';

const MATCHUP_SCORE: Record<Matchup, number> = { advantage: 2, neutral: 1, disadvantage: 0 };

function opponentOf(side: Side): Side {
  return side === 'p1' ? 'p2' : 'p1';
}

/**
 * 相手の場のユニットに対して相性が最良の生存ユニットを選ぶ。
 * 同点はHP割合が高い方、さらに同点なら party 添字が小さい方(決定論のため)。
 *
 * 相手も同時に死に出しをしている場合、相手の「これから出てくるユニット」は分からない。
 * その場合は倒れたユニットとの相性で判断することになるが、
 * 他に手がかりがないので許容する。
 */
export function chooseBestReplacement(state: BattleState, side: Side): number {
  const opponentDef = getUnitDef(getActiveUnit(state, opponentOf(side)));

  let best = -1;
  let bestScore = -Infinity;

  state.sides[side].party.forEach((unit, index) => {
    if (unit.fainted) return;
    const def = getUnitDef(unit);
    // 相性(0〜2) を主軸に、HP割合(0〜1) を従属的な決め手として足す
    const score = MATCHUP_SCORE[getMatchup(def.attribute, opponentDef.attribute)] + unit.hp / def.maxHp;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });

  if (best < 0) throw new Error(`${side} に交代できる生存ユニットがいません`);
  return best;
}
