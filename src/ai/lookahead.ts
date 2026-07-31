/**
 * Lv3: 1手先読み (PLAN §269)。
 *
 * Lv2 との違いは**相手の行動をどう見積もるか**だけ。Lv2 は「相手は合法手の先頭を打つ」
 * という粗い決め打ちをする。Lv3 は相手の立場で1手読んで、**相手が実際に選びそうな手**を
 * 予測し、それに対する最善手を返す。
 *
 * ## PLAN §269 の「期待値評価」を採らなかった理由
 *
 * PLAN は「相手の全行動を想定した期待値評価」としているが、
 * **相手の全行動を平均するのは「相手が一様ランダムに打つ」という仮定**にほかならない。
 * まともな相手に対しては、Lv2 の粗い決め打ちよりさらに悪い仮定になる。
 *
 * 6,000試合で3案を実測した (相手はすべて Lv2。± は95%信頼区間):
 *
 * | 集約方法 | 勝率 |
 * |---|---|
 * | Lv2 (基準線) | 48.2% ±1.3 |
 * | 全行動の平均 (PLAN の字面どおり) | **43.2%** ±1.3 ← Lv2 より明確に弱い |
 * | 全行動の最小 (悲観 / minimax) | 48.3% ±1.3 ← Lv2 と差がない |
 * | **相手の手を読んで最善応手** | **50.7%** ±1.3 ← 採用 |
 *
 * 平均が弱いのは上記のとおり。悲観 (minimax) が伸びないのは、本ゲームが**同時宣言**
 * (SPEC §5.1) だからで、「相手が自分の手を見てから最悪の応手を返す」という前提が
 * 現実より厳しすぎる。最も当たっている仮定は「相手も1手先を見て良い手を打つ」だった。
 *
 * コストも下がる。全行動を試すと `自分の候補数 × 相手の候補数` 回の resolveTurn が要るが、
 * 同時宣言では**相手の選択は自分の選択に依存しない**ので、相手の手は1回読めば済む。
 * `自分の候補数 + 相手の候補数` 回で足りる。
 */

import { getLegalActions, resolveTurn } from '../engine/battle';
import type { Action, BattleState, Side } from '../engine/types';
import { evaluate } from './evaluate';
import { opponentOf, pairActions, switchBonus } from './greedy';
import { chooseBestReplacement } from './replacement';
import type { Ai } from './types';

/**
 * 相手が選びそうな手を読む。相手の立場に立って1手先の盤面を評価する。
 *
 * 相手から見た自分の想定行動には、こちらの合法手の先頭を使う(Lv2 と同じ粗さ)。
 * ここをさらに読み合うと再帰が止まらないので、1段で打ち切る。
 */
export function predictOpponentAction(state: BattleState, side: Side): Action {
  const foe = opponentOf(side);
  const theirLegal = getLegalActions(state, foe);
  const myFirst = getLegalActions(state, side)[0];
  if (!myFirst) throw new Error(`${side} に選択できる行動がありません`);

  let best: Action | undefined;
  let bestScore = -Infinity;

  for (const theirs of theirLegal) {
    const after = resolveTurn(state, pairActions(foe, theirs, myFirst));
    const score = evaluate(after.state, foe) + switchBonus(state, foe, theirs);
    if (score > bestScore) {
      bestScore = score;
      best = theirs;
    }
  }

  if (!best) throw new Error(`${foe} に選択できる行動がありません`);
  return best;
}

export function createLookaheadAi(): Ai {
  return {
    name: 'lookahead',

    chooseAction(state: BattleState, side: Side): Action {
      const legal = getLegalActions(state, side);
      const predicted = predictOpponentAction(state, side);

      let best: Action | undefined;
      let bestScore = -Infinity;

      for (const action of legal) {
        const after = resolveTurn(state, pairActions(side, action, predicted));
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
