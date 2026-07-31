/** バラ (SPEC §10.8) */

import type { EffectHooks } from './context';

/**
 * 技1「毒撒き」: ダメージなし。相手に毒を1スタック付与。
 *
 * 2重が上限で、既に2重なら無効(ターンは消費)。上限判定は EffectApi 側にある。
 * 毒はユニット単位で保持され、交代しても維持される (SPEC §7.1)。
 */
export const baraPoison: EffectHooks = {
  onUse: ({ api, target }) => {
    api.applyPoison(target);
  },
};

/**
 * 技2「棘撒き」: ダメージなし。相手側の場に設置を1枚追加。
 *
 * 2枚が上限。設置は「相手側の場」に置かれ、**相手のユニットが場に出るたび**発動する
 * (SPEC §7.2)。踏む側が保持する形なので、対象は相手の陣営。
 */
export const baraHazard: EffectHooks = {
  onUse: ({ api, self }) => {
    api.addHazard(api.opponentOf(self.side));
  },
};
