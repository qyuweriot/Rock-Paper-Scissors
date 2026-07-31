/** 器 (SPEC §10.13) */

import { UTSUWA_HEAL } from '../constants';
import type { EffectHooks } from './context';

/**
 * 技2「献身」: 控えの生存ユニット1体を選択し、HP15回復。
 *
 * - **控えのユニットは場にいないが回復は成立する。** 特性ではなく技だから
 * - 控えが全員瀕死なら選択対象がないので何も起こらない(ターンは消費)
 * - 控えが全員HP満タンでも技は使用できる(applyHeal が何も起こさない)
 * - ハサミムシが相手の場にいれば無効化される
 */
export const utsuwaDevotion: EffectHooks = {
  onUse: ({ api, self, selection }) => {
    if (!selection) {
      api.noEffect('回復できる控えがいない');
      return;
    }
    // 自陣の控えであることは getLegalActions が保証している
    void self;
    api.heal(selection, UTSUWA_HEAL);
  },
};
