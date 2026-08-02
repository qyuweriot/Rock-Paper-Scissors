/**
 * Lv3: 先読み (PLAN §269)。
 *
 * Lv2 との違いは**深さだけ**。盤面の見立て (`evaluate`) も相手の予測も Lv2 と同じものを使い、
 * 「自分の手 → 相手の応手 → 解決」を SEARCH_DEPTH 回くり返して読む。
 *
 * ## 深さがすべてだった — 実測 (相手は Lv2、6,000試合。両方向で確認済み)
 *
 * | 案 | 勝率 |
 * |---|---|
 * | 旧 Lv3 (深さ1) | 52.9% ← 基準線。Lv2 とほぼ互角だった |
 * | 深さ2 | **68.1%** |
 * | 深さ3 | 74.2% (1,500試合) |
 * | **深さ4** | **79.2%** (800試合) ← 採用 |
 * | 深さ5 | 82.6% (400試合) ← 速度の余裕を優先して見送り |
 *
 * ## 評価関数に項目を足すのは逆効果だった
 *
 * 最初は「`evaluate` が対面の相性を見ていないことが最大の欠陥」と考え、
 * 相性・控えの手当て・技の残り回数を足した専用の評価関数を書いた。**結果は悪化した。**
 *
 * | 深さ2で測った内訳 | 勝率 |
 * |---|---|
 * | 相性・控え・残回数を足す | 64.3% |
 * | **足さない (Lv2 と同じ `evaluate`)** | **68.1%** ← 採用 |
 *
 * 深く読む探索は、相性の良し悪しを**実際に解決してみて**確かめている。
 * そこに「有利対面は +0.12」という手書きの見積もりを重ねると、読んだ結果と食い違って
 * ノイズになる。浅い評価の穴を定数で埋めるより、深く読ませる方が正しかった。
 *
 * さらに悪いことに、相性項は交代を過大評価する。有利対面を取る価値 (0.35) が
 * 攻撃1発の価値 (25ダメージ = 0.25) を上回り、**両者が交代し続けて試合が終わらなくなった**
 * (未決着 54件 → 1,723件)。位置取りの点数は、攻撃の価値と必ず突き合わせること。
 *
 * ## 残っている代償 — AI同士だと決着しない試合が増える
 *
 * 300ターンで打ち切られる試合が **0.9% → 10%** に増えた(決着した試合の長さは
 * 15.1 → 16.6 ターンとほぼ変わらない)。深く読むぶん、負け筋に入った側が
 * 延命する手順を見つけるため。**Lv3 が勝てない試合を落とさずに粘っている**形で、
 * 決着した試合の勝率 79% はこの分を除いた数字。
 *
 * 人間相手には起きにくい ─ 循環は両者が決定論的に同じ手を返すことで成立するので、
 * 手が揺れる相手には続かない (TUNING.md が Lv2 について記録している膠着と同じ性質)。
 * 実プレイで問題になるなら `TURN_LIMIT` (SPEC §12-3) を入れる余地がある。
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

import { getLegalActions, resolveReplacements, resolveTurn } from '../engine/battle';
import type { Action, BattleState, Side } from '../engine/types';
import { WEIGHT_WIN, WIN_SOONER_RATE } from './constants';
import { opponentOf, pairActions, switchBonus } from './greedy';
import { evaluate } from './evaluate';
import { chooseBestReplacement } from './replacement';
import type { Ai } from './types';

/**
 * 何手先まで読むか。1 = 自分の手と相手の応手を1回だけ解決して評価する。
 *
 * **強さの唯一のつまみ。** 1つ深くするたび勝率が約 +5pt 上がり、代わりに約4倍遅くなる。
 *
 * 4 で止めたのは**速度の余裕**のため。深さ5でも 1手 85ms (この開発機) で
 * 体感には十分だが、公開先はスマートフォンを含む ─ 数倍遅い端末で待たされる。
 * 深さ4 なら最悪 20ms なので、5倍遅い端末でも 100ms に収まる。
 */
const SEARCH_DEPTH = 4;

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

/**
 * 解決後の局面の値。
 *
 * **`resolveTurn` の後が `awaitingActions` とは限らない。** 決着していることも、
 * 死に出し待ちのこともある。`getLegalActions` を呼ぶ前に必ず `phase` を見る ─
 * ここを飛ばすと、倒し切った瞬間や相打ちの直後に例外で落ちる。
 */
function valueOf(state: BattleState, side: Side, depth: number): number {
  let current = state;

  // 死に出しは何度も続きうる (両者同時に倒れた後、さらに設置で倒れるなど)
  while (current.phase.kind === 'awaitingReplacement') {
    const choices: Partial<Record<Side, number>> = {};
    for (const target of current.phase.sides) {
      choices[target] = chooseBestReplacement(current, target);
    }
    current = resolveReplacements(current, choices).state;
  }

  if (current.phase.kind === 'ended') {
    const result = current.phase.result;
    const outcome = result === 'draw' ? 0 : result === side ? WEIGHT_WIN : -WEIGHT_WIN;
    /*
     * **早い決着ほど高く評価する。** `depth` は残りの読み深さなので、大きいほど早く決着した。
     *
     * これが無いと「いま倒す」と「1ターン後に倒す」が同点になる。実際、石が堅牢を
     * 捨て身打ち(反動15)で即倒すか、打撃2発で無傷で倒すかは**最終HPが完全に一致**し、
     * 並び順で前者が捨てられていた。倒し切れるなら待つ理由はない ─
     * 決着した時点で残HPの価値は消えるので、早さは残HPより優先してよい。
     *
     * 符号は outcome に掛かるので、**負けは逆に遅いほど良い**(粘る)。
     * なお、これが未決着の増加(下記)の原因かを確かめるため「勝ちだけ早さを見る」形も
     * 実測したが、勝率も未決着数も1件も動かなかった。粘りは原因ではない。
     */
    const sooner = 1 + depth * WIN_SOONER_RATE;
    // 盤面の評価も足す。同じ早さで勝てるなら、傷が浅い勝ち方を選ぶ
    return outcome * sooner + evaluate(current, side);
  }

  if (depth <= 0) return evaluate(current, side);

  return bestActionOf(current, side, depth).score;
}

/** その局面での最善手と、その値 */
function bestActionOf(
  state: BattleState,
  side: Side,
  depth: number,
): { action: Action; score: number } {
  const legal = getLegalActions(state, side);
  const predicted = predictOpponentAction(state, side);

  let best: Action | undefined;
  let bestScore = -Infinity;

  for (const action of legal) {
    const after = resolveTurn(state, pairActions(side, action, predicted));
    const score = valueOf(after.state, side, depth - 1) + switchBonus(state, side, action);
    // 同点は getLegalActions の並び順で先勝ち(決定論のため)
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }

  if (!best) throw new Error(`${side} に選択できる行動がありません`);
  return { action: best, score: bestScore };
}

export function createLookaheadAi(): Ai {
  return {
    name: 'lookahead',

    chooseAction(state: BattleState, side: Side): Action {
      return bestActionOf(state, side, SEARCH_DEPTH).action;
    },

    chooseReplacement: chooseBestReplacement,
  };
}
