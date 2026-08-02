/**
 * 画面にユニットを並べる順。
 *
 * **`UNIT_IDS` とは別に持つ。** あちらはシミュレータの土台で、
 * `allSelections()` が添字順に 455通りを組み立て、`sampleSelectionPairs()` が
 * シード付きシャッフルを掛けている (sim/matchups.ts)。並べ替えると
 * **同じシードでも別の試合結果になり、コミット済みの reports/ と食い違う。**
 *
 * 並び順は表示の都合なので、ここに閉じる。
 */

import type { UnitId } from '../data/units';

/** グー5体 → チョキ5体 → パー5体。網羅と並びはテストで固定してある */
export const UNIT_DISPLAY_ORDER: readonly UnitId[] = [
  // グー
  'ishi',
  'kenro',
  'magyu',
  'tekken',
  'funsai',
  // チョキ
  'hasami',
  'kamakiri',
  'yamaarashi',
  'issen',
  'bara',
  // パー
  'kami',
  'tenohira',
  'utsuwa',
  'uchiwa',
  'ghost',
];

const RANK = new Map(UNIT_DISPLAY_ORDER.map((id, index) => [id, index]));

/**
 * 手持ちを表示順に並べ替える。**引数は書き換えない。**
 *
 * 選出画面は編成で押した順の配列を受け取るので、これを通して並びを固定する。
 * **選出の順番(誰が先頭に場へ出るか)とは別物。** あちらは押した順のまま。
 */
export function sortForDisplay(ids: readonly UnitId[]): UnitId[] {
  return [...ids].sort((a, b) => (RANK.get(a) ?? 0) - (RANK.get(b) ?? 0));
}
