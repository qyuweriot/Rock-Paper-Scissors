/** はさみ (SPEC §10.10) */

import { HASAMI_DEF_UP } from '../constants';
import type { EffectHooks } from './context';

/**
 * 技2「受け切り」: 威力10 を与えつつ、このターン自分の守勢+10。
 *
 * 持続は 'turn' なのでターン終了時に消える。守勢修正は**相手の技によるダメージにのみ**
 * 適用され、固定ダメージ(手のひらの固定20 / 毒 / 設置 / 反射)は軽減できない。
 * これは computeDamage が DamageSpec の kind で分岐することで保証されている。
 *
 * 速度が「速」なので、中・遅の相手より先にこの修正値が乗る。
 */
export const hasamiGuard: EffectHooks = {
  onUse: ({ api, self }) => {
    api.addModifier(self, 'def', HASAMI_DEF_UP, 'turn');
  },
};
