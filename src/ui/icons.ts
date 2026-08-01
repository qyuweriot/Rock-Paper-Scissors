/**
 * ユニットのアイコン。
 *
 * 絵文字にしているのはアセットも依存も要らず、小さくしても見分けがつくため。
 * OS によって字形は変わるが、識別できれば用は足りる。
 *
 * **新しいユニットを足したらここにも追加すること。** 網羅はテストで固定してある。
 */

import type { UnitId } from '../data/units';

export const UNIT_ICONS: Record<UnitId, string> = {
  // グー
  funsai: '💥',
  tekken: '👊',
  magyu: '⚾',
  kenro: '🛡️',
  ishi: '🪨',

  // チョキ
  kamakiri: '🦗',
  yamaarashi: '🦔',
  bara: '🌹',
  issen: '⚡',
  hasami: '✂️',

  // パー
  tenohira: '✋',
  ghost: '👻',
  utsuwa: '🏺',
  uchiwa: '🪭',
  kami: '📄',
};

/** 未公開のユニット (SPEC §11) */
export const HIDDEN_ICON = '❔';
