/**
 * AIの編成と選出 (PLAN §290「AIの編成・選出は自動」)。
 *
 * `Ai` インターフェース (types.ts) は場での行動しか扱わないので、試合前の2つの決定は
 * ここに分ける。**AIの振る舞いなので src/ui ではなく src/ai に置く。**
 *
 * どちらも純粋関数。乱数は engine/rng.ts を経由する (PLAN §3.4)。
 */

import { PARTY_SIZE, TEAM_SIZE } from '../engine/constants';
import { getMatchup } from '../engine/damage';
import { nextInt } from '../engine/rng';
import { getUnit, UNIT_IDS, type UnitId } from '../data/units';
import type { Attribute } from '../engine/types';

/** 編成に必ず1体ずつ入れる属性 (SPEC §2)。**この順で引く**ので、並びを変えると編成が変わる */
const ATTRIBUTES: readonly Attribute[] = ['gu', 'choki', 'pa'];

/**
 * 15種から PARTY_SIZE 体を選ぶ (SPEC §1)。
 *
 * **三属性を1体ずつ確保してから、残りを一様に引く。**
 *
 * 以前は全枠を一様抽選にしていた。「偏った編成も正当な戦術」という理屈だったが、
 * 実際には AI がしばしばグーだけの編成を持ってきて、**人間がパーを並べるだけで
 * 勝ててしまう**。三竦みのゲームで属性が欠けているのは戦術ではなく事故で、
 * 対戦相手としての体裁が崩れる。
 *
 * 残り2枠は従来どおり一様なので、編成の多様性は保たれる。
 * 同じシードなら同じ編成になる (PLAN §3.4)。
 *
 * **シミュレータはこの関数を呼ばない** (選出を直接渡す) ので、`reports/` は変わらない。
 */
export function draftParty(seed: number): { seed: number; party: UnitId[] } {
  const pool = [...UNIT_IDS];
  const party: UnitId[] = [];
  let rngSeed = seed;

  /** pool から1体引いて party に入れる。候補が空なら何もしない */
  const draw = (candidates: UnitId[]): void => {
    if (candidates.length === 0) return;
    const rolled = nextInt(rngSeed, candidates.length);
    rngSeed = rolled.seed;
    const picked = candidates[rolled.value];
    if (!picked) return;
    party.push(picked);
    pool.splice(pool.indexOf(picked), 1);
  };

  // 先に三属性を1体ずつ。ここで PARTY_SIZE を超えることはない (3 < 5)
  for (const attribute of ATTRIBUTES) {
    draw(pool.filter((id) => getUnit(id).attribute === attribute));
  }

  // 残りは属性を問わず一様に
  while (party.length < PARTY_SIZE) draw(pool);

  return { seed: rngSeed, party };
}

/** 有利=2 / 互角=1 / 不利=0 で、相手パーティー全体に対する相性を採点する */
function matchupScore(attacker: Attribute, opponents: readonly Attribute[]): number {
  return opponents.reduce((total, defender) => {
    const matchup = getMatchup(attacker, defender);
    return total + (matchup === 'advantage' ? 2 : matchup === 'neutral' ? 1 : 0);
  }, 0);
}

/**
 * 自分の5体から、相手のパーティーに刺さる TEAM_SIZE 体を選ぶ (SPEC §1)。
 *
 * 選出は相手のパーティー5体を見てから行う。相性で採点し、同点は
 * HPの高い方 → 元の並び順、の順で決める(決定論のため)。
 *
 * 相手の**選出**3体は見えないので、パーティー5体全体を相手だと仮定する。
 */
export function draftTeam(own: readonly UnitId[], opponent: readonly UnitId[]): UnitId[] {
  const opponentAttributes = opponent.map((id) => getUnit(id).attribute);

  return [...own]
    .map((id, index) => ({ id, index, def: getUnit(id) }))
    .sort((a, b) => {
      const byMatchup =
        matchupScore(b.def.attribute, opponentAttributes) -
        matchupScore(a.def.attribute, opponentAttributes);
      if (byMatchup !== 0) return byMatchup;
      if (b.def.maxHp !== a.def.maxHp) return b.def.maxHp - a.def.maxHp;
      return a.index - b.index;
    })
    .slice(0, TEAM_SIZE)
    .map((entry) => entry.id);
}
