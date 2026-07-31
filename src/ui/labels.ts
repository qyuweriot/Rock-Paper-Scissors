/**
 * 画面に出す日本語ラベル。
 *
 * コンポーネントと同じファイルに置くと `react-refresh/only-export-components` に
 * 引っかかるので `.ts` に分ける。
 */

import type { Attribute, Speed } from '../engine/types';

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  gu: 'グー',
  choki: 'チョキ',
  pa: 'パー',
};

export const SPEED_LABELS: Record<Speed, string> = { fast: '速', mid: '中', slow: '遅' };

/** グー > チョキ > パー > グー (SPEC §2)。編成画面の相性の説明に使う */
export const TYPE_TRIANGLE = 'グー > チョキ > パー > グー';
