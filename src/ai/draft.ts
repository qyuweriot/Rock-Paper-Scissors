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

/**
 * 15種から PARTY_SIZE 体を選ぶ (SPEC §1)。
 *
 * 属性の偏りを避けたいところだが、**偏った編成も正当な戦術**であり、
 * ここで均さすと三竦みの実験ができなくなる。一様な抽選にする。
 * 同じシードなら同じ編成になる。
 */
export function draftParty(seed: number): { seed: number; party: UnitId[] } {
  const pool = [...UNIT_IDS];
  const party: UnitId[] = [];
  let rngSeed = seed;

  for (let i = 0; i < PARTY_SIZE; i++) {
    const rolled = nextInt(rngSeed, pool.length);
    rngSeed = rolled.seed;
    const [picked] = pool.splice(rolled.value, 1);
    if (picked) party.push(picked);
  }

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
