/**
 * 全15種のユニットデータ (SPEC §9 / §10)。
 *
 * SPEC の表を明示的なデータ構造として手書きする (PLAN §168)。
 * バランス調整はこのファイルと engine/constants.ts の変更だけで完結させること (PLAN §309)。
 *
 * 技名は SPEC が定めていないため実装側で付けた。挙動には影響しないので自由に改名してよい。
 * `text` は UI に常時表示され、プレイヤーが暗記を強いられないようにする (PLAN §296)。
 */

import type { MoveDef, SlotIndex, UnitDef } from '../engine/types';
import { hasamiGuard } from '../engine/effects/hasami';
import { issenFocus } from '../engine/effects/issen';
import { kenroRegeneration } from '../engine/effects/kenro';
import { baraHazard, baraPoison } from '../engine/effects/bara';
import { tenohiraRest } from '../engine/effects/tenohira';
import { utsuwaDevotion } from '../engine/effects/utsuwa';
import { TENOHIRA_HEAL_USES } from '../engine/constants';
import { funsaiFortitude } from '../engine/effects/funsai';
import { ghostCurse } from '../engine/effects/ghost';
import { hasamimushiGrowth, hasamimushiHealBlock } from '../engine/effects/hasamimushi';
import { magyuDecay, magyuEscape } from '../engine/effects/magyu';
import { tekkenPursuit } from '../engine/effects/tekken';
import { uchiwaGust } from '../engine/effects/uchiwa';
import { yamaarashiSpikes } from '../engine/effects/yamaarashi';

export const UNITS = {
  // --- グー -----------------------------------------------------------------

  funsai: {
    id: 'funsai',
    name: '粉砕',
    attribute: 'gu',
    maxHp: 60,
    speed: 'slow',
    slots: [
      {
        kind: 'move',
        move: {
          name: '粉砕撃',
          text: '威力60。自分に固定35の反動。',
          damage: { kind: 'normal', power: 60 },
          priority: 'normal',
          recoil: 35,
        },
      },
      {
        kind: 'ability',
        ability: {
          name: '不撓',
          text: '相手を倒した場合、この技の反動を受けない。',
          hooks: funsaiFortitude,
        },
      },
    ],
  },

  tekken: {
    id: 'tekken',
    name: '鉄拳',
    attribute: 'gu',
    maxHp: 50,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '先制打',
          text: '威力15。先制。',
          damage: { kind: 'normal', power: 15 },
          priority: 'first',
        },
      },
      {
        kind: 'move',
        move: {
          name: '追い討ち',
          text: '威力20。相手がそのターンに交代を宣言していた場合、威力+20。',
          damage: { kind: 'normal', power: 20 },
          priority: 'normal',
          hooks: tekkenPursuit,
        },
      },
    ],
  },

  magyu: {
    id: 'magyu',
    name: '魔球',
    attribute: 'gu',
    maxHp: 100,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '消耗弾',
          text: '威力30。使うたびに威力−10(下限0)。交代でリセット。',
          damage: { kind: 'normal', power: 30 },
          priority: 'normal',
          hooks: magyuDecay,
        },
      },
      {
        kind: 'move',
        move: {
          name: '離脱弾',
          text: '威力15。使用後に自分が交代する(交代先は選択)。',
          damage: { kind: 'normal', power: 15 },
          priority: 'normal',
          selection: 'switchTarget',
          hooks: magyuEscape,
        },
      },
    ],
  },

  kenro: {
    id: 'kenro',
    name: '堅牢',
    attribute: 'gu',
    maxHp: 140,
    speed: 'slow',
    slots: [
      {
        kind: 'move',
        move: {
          name: '重打',
          text: '威力15。',
          damage: { kind: 'normal', power: 15 },
          priority: 'normal',
        },
      },
      {
        kind: 'ability',
        ability: {
          name: '再生',
          text: 'ターン終了時にHPが5回復する(毒の処理より後)。',
          hooks: kenroRegeneration,
        },
      },
    ],
  },

  ishi: {
    id: 'ishi',
    name: '石',
    attribute: 'gu',
    maxHp: 100,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '打撃',
          text: '威力25。',
          damage: { kind: 'normal', power: 25 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '捨て身打ち',
          text: '威力35。自分に固定15の反動。',
          damage: { kind: 'normal', power: 35 },
          priority: 'normal',
          recoil: 15,
        },
      },
    ],
  },

  // --- チョキ ---------------------------------------------------------------

  hasamimushi: {
    id: 'hasamimushi',
    name: 'ハサミムシ',
    attribute: 'choki',
    maxHp: 120,
    speed: 'fast',
    slots: [
      {
        kind: 'move',
        move: {
          name: '連撃',
          text: '威力15。使うたびに威力+5(上限なし)。交代でリセット。',
          damage: { kind: 'normal', power: 15 },
          priority: 'normal',
          hooks: hasamimushiGrowth,
        },
      },
      {
        kind: 'ability',
        ability: {
          name: '治癒封じ',
          text: '場にいる間、相手側で発生するあらゆる回復を無効化する。',
          hooks: hasamimushiHealBlock,
        },
      },
    ],
  },

  yamaarashi: {
    id: 'yamaarashi',
    name: '山嵐',
    attribute: 'choki',
    maxHp: 90,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '針撃',
          text: '威力20。',
          damage: { kind: 'normal', power: 20 },
          priority: 'normal',
        },
      },
      {
        kind: 'ability',
        ability: {
          name: '棘の反射',
          text: '攻撃技でダメージを受けたとき、相手に固定10を返す(ダメージ0でも発動)。',
          hooks: yamaarashiSpikes,
        },
      },
    ],
  },

  bara: {
    id: 'bara',
    name: 'バラ',
    attribute: 'choki',
    maxHp: 80,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '毒撒き',
          text: 'ダメージなし。相手に毒を1スタック付与(3重まで)。',
          damage: { kind: 'none' },
          priority: 'normal',
          hooks: baraPoison,
        },
      },
      {
        kind: 'move',
        move: {
          name: '棘撒き',
          text: 'ダメージなし。相手側の場に設置を1枚追加(3枚まで)。',
          damage: { kind: 'none' },
          priority: 'normal',
          hooks: baraHazard,
        },
      },
    ],
  },

  issen: {
    id: 'issen',
    name: '一閃',
    attribute: 'choki',
    maxHp: 40,
    speed: 'fast',
    slots: [
      {
        kind: 'move',
        move: {
          name: '一閃斬り',
          text: '威力35。',
          damage: { kind: 'normal', power: 35 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '構え',
          text: '自分の攻勢+15(交代または瀕死まで持続 / 累積上限+30)。',
          damage: { kind: 'none' },
          priority: 'normal',
          hooks: issenFocus,
        },
      },
    ],
  },

  hasami: {
    id: 'hasami',
    name: 'はさみ',
    attribute: 'choki',
    maxHp: 100,
    speed: 'fast',
    slots: [
      {
        kind: 'move',
        move: {
          name: '切断',
          text: '威力25。',
          damage: { kind: 'normal', power: 25 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '受け切り',
          text: '威力10。このターン自分の守勢+10(固定ダメージには効かない)。',
          damage: { kind: 'normal', power: 10 },
          priority: 'normal',
          hooks: hasamiGuard,
        },
      },
    ],
  },

  // --- パー -----------------------------------------------------------------

  tenohira: {
    id: 'tenohira',
    name: '手のひら',
    attribute: 'pa',
    maxHp: 100,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '掌打',
          text: '固定20ダメージ。相性補正・修正値をすべて無視する。',
          damage: { kind: 'fixed', amount: 20 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '整息',
          text: '自分のHPを25回復する(満タンなら何も起こらない)。1試合3回まで。',
          damage: { kind: 'none' },
          priority: 'normal',
          maxUses: TENOHIRA_HEAL_USES,
          hooks: tenohiraRest,
        },
      },
    ],
  },

  ghost: {
    id: 'ghost',
    name: 'ゴースト',
    attribute: 'pa',
    maxHp: 60,
    speed: 'fast',
    slots: [
      {
        kind: 'move',
        move: {
          name: '呪い',
          text: '威力15。自分に固定5の反動。',
          damage: { kind: 'normal', power: 15 },
          priority: 'normal',
          recoil: 5,
        },
      },
      {
        kind: 'ability',
        ability: {
          name: '呪詛返し',
          text: '瀕死になったとき、相手に固定35を返す(死因を問わない)。',
          hooks: ghostCurse,
        },
      },
    ],
  },

  utsuwa: {
    id: 'utsuwa',
    name: '器',
    attribute: 'pa',
    maxHp: 130,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '打ち付け',
          text: '威力15。',
          damage: { kind: 'normal', power: 15 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '献身',
          text: '控えの生存ユニット1体を選択し、HPを15回復する。',
          damage: { kind: 'none' },
          priority: 'normal',
          selection: 'benchAlly',
          hooks: utsuwaDevotion,
        },
      },
    ],
  },

  uchiwa: {
    id: 'uchiwa',
    name: '団扇',
    attribute: 'pa',
    maxHp: 90,
    speed: 'slow',
    slots: [
      {
        kind: 'move',
        move: {
          name: '扇撃',
          text: '威力25。',
          damage: { kind: 'normal', power: 25 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '突風',
          text: '相手を強制的に交代させる(交代先はランダム)。',
          damage: { kind: 'none' },
          priority: 'normal',
          hooks: uchiwaGust,
        },
      },
    ],
  },

  kami: {
    id: 'kami',
    name: '紙',
    attribute: 'pa',
    maxHp: 100,
    speed: 'mid',
    slots: [
      {
        kind: 'move',
        move: {
          name: '包み込み',
          text: '威力25。',
          damage: { kind: 'normal', power: 25 },
          priority: 'normal',
        },
      },
      {
        kind: 'move',
        move: {
          name: '紙飛ばし',
          text: '威力15。先制。',
          damage: { kind: 'normal', power: 15 },
          priority: 'first',
        },
      },
    ],
  },
} satisfies Record<string, UnitDef>;

/** 新ユニットの追加は UNITS へのエントリ追加だけで済む (PLAN §84) */
export type UnitId = keyof typeof UNITS;

export const UNIT_LIST: readonly UnitDef[] = Object.values(UNITS);

export const UNIT_IDS = Object.keys(UNITS) as UnitId[];

export function getUnit(id: UnitId): UnitDef {
  return UNITS[id];
}

/**
 * 枠から技を取り出す。特性枠を指した場合は例外を投げる。
 * 特性枠のユニット(粉砕・堅牢・ハサミムシ・山嵐・ゴースト)は選択できる技が1つだけなので、
 * 行動の生成側が枠を選ぶ時点で `isMoveSlot` で絞り込むこと。
 */
export function getMove(unit: UnitDef, index: SlotIndex): MoveDef {
  const slot = unit.slots[index];
  if (slot.kind !== 'move') {
    throw new Error(`${unit.name} の枠${String(index)} は技ではなく特性です`);
  }
  return slot.move;
}

/** そのユニットが実際に選択できる技枠の添字 (SPEC §5.1) */
export function getUsableSlotIndices(unit: UnitDef): SlotIndex[] {
  const indices: SlotIndex[] = [];
  if (unit.slots[0].kind === 'move') indices.push(0);
  if (unit.slots[1].kind === 'move') indices.push(1);
  return indices;
}
