/** 魔球 (SPEC §10.3) */

import { MAGYU_POWER_DECAY } from '../constants';
import type { EffectHooks } from './context';

/** 消耗弾の威力。解決と UI の表示が同じ式を通るよう、規則はここ1か所に置く */
const decay = (power: number, useCount: number): number =>
  Math.max(0, power - MAGYU_POWER_DECAY * useCount);

/**
 * 技1「消耗弾」: 使うたびに威力−10。下限0。
 *
 * 0 になっても使用でき、その場合ダメージは相性補正のみになる。
 * `useCount` は今回の使用を含まないので、初回は威力30 のまま。
 * 交代でのリセットは battle.ts の resetVolatile が担う (SPEC §7.3)。
 */
export const magyuDecay: EffectHooks = {
  onModifyPower: ({ power, useCount }) => decay(power, useCount),
  previewPower: decay,
};

/**
 * 技2「離脱弾」: 威力15を与えた後、自分が交代する。交代先はプレイヤーが選択。
 *
 * ステップ3で解決されるため、**鉄拳の追い討ちは発動しない** (SPEC §10.2)。
 * 控えに生存ユニットがいない場合は攻撃のみ行い、交代しない。
 */
export const magyuEscape: EffectHooks = {
  onUse: ({ api, self, selection }) => {
    if (!selection) {
      api.noEffect('控えに生存ユニットがいないため交代しない');
      return;
    }
    api.requestSwitch(self.side, 'selfSwitch', selection.partyIndex);
  },
};
