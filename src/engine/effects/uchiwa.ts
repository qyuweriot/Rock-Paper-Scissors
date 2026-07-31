/** 団扇 (SPEC §10.14) */

import type { EffectHooks } from './context';

/**
 * 技2「突風」: 相手を強制的に交代させる。交代先は相手の生存している控えからランダム。
 *
 * - ステップ3(強制交代処理)で解決される
 * - 相手の控えに生存ユニットがいなければ何も起こらない(ターンは消費)
 * - 交代先は相手側の設置を踏む
 * - **本ゲームで乱数を使用する唯一の箇所** (PLAN §3.4)。抽選は engine/rng.ts が行う
 *
 * 交代先を指定しない (`to` を省略する) ことで、解決時にランダムで選ばれる。
 */
export const uchiwaGust: EffectHooks = {
  onUse: ({ api, self }) => {
    api.requestSwitch(api.opponentOf(self.side), 'forced');
  },
};
