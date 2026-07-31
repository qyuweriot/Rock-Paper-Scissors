/**
 * 総当たりの組み合わせ生成 (PLAN §236)。
 *
 * PLAN は「パーティー・選出の組み合わせを総当たり」とするが、**5体パーティーの層は
 * 選出を通してしか戦闘に影響しない**(15C5 = 3003通りに増やしても、実際に戦うのは
 * 選出3体)。したがって選出3体 = 15C3 = 455通りの層で総当たりする。
 * PLAN §248「選出3体の勝率上位・下位」もこの層でそのまま出る。
 */

import { TEAM_SIZE } from '../engine/constants';
import { nextInt } from '../engine/rng';
import { UNIT_IDS, type UnitId } from '../data/units';

/** 選出3体の全組み合わせ。15C3 = 455通り。順序は常に UNIT_IDS の並び順 */
export function allSelections(): UnitId[][] {
  const result: UnitId[][] = [];

  const build = (start: number, chosen: UnitId[]): void => {
    if (chosen.length === TEAM_SIZE) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < UNIT_IDS.length; i++) {
      const id = UNIT_IDS[i];
      if (id === undefined) continue;
      chosen.push(id);
      build(i + 1, chosen);
      chosen.pop();
    }
  };

  build(0, []);
  return result;
}

/**
 * 選出同士の総当たり。`allSelections()` の添字の組。
 *
 * 同じ組を p1 / p2 の両方向で戦わせても、両者が同じAIなら情報が増えない。
 * `i <= j` の片側だけを取り、ミラー(i === j)は含める。455×456/2 = 103,740通り。
 */
export function allSelectionPairs(count = allSelections().length): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    for (let j = i; j < count; j++) pairs.push([i, j]);
  }
  return pairs;
}

/**
 * 総当たりから決定論的に抽出する。
 * `Math.random()` は禁止 (PLAN §3.4) なので engine/rng.ts を経由する。
 *
 * 要求数が母集団以上なら全件を返す。
 */
export function sampleSelectionPairs(
  sampleSize: number,
  seed: number,
  count = allSelections().length,
): [number, number][] {
  const all = allSelectionPairs(count);
  if (sampleSize >= all.length) return all;

  // Fisher-Yates を先頭 sampleSize 個ぶんだけ回す。全体を並べ替えるより速い
  let rngSeed = seed;
  for (let i = 0; i < sampleSize; i++) {
    const rolled = nextInt(rngSeed, all.length - i);
    rngSeed = rolled.seed;
    const j = i + rolled.value;
    const a = all[i];
    const b = all[j];
    if (a === undefined || b === undefined) continue;
    all[i] = b;
    all[j] = a;
  }
  return all.slice(0, sampleSize);
}

/**
 * 1体対1体の全対面。15×15 = 225通り。
 *
 * 3v3 では交代と選出が絡んで単体の相性が読み取りにくいので、
 * 素の対面表を別に出す。SPEC §12-2「ハサミムシ × 粉砕」の確認はここが一番速い。
 * **こちらは向きを区別する**(先手・後手で結果が変わるため)。
 */
export function singlesPairs(): [UnitId, UnitId][] {
  const pairs: [UnitId, UnitId][] = [];
  for (const a of UNIT_IDS) {
    for (const b of UNIT_IDS) pairs.push([a, b]);
  }
  return pairs;
}
