/**
 * 調整値の集約点 (PLAN §3.3)。
 *
 * バランス調整は**このファイルと data/units.ts の変更だけで完結する**こと。
 * SPEC §12 の調整候補もすべてこの2ファイルで対応できる設計を保つ。
 */

import type { Speed } from './types';

// --- 相性 (SPEC §2) ---------------------------------------------------------

/** 有利。ダメージへの加算 */
export const TYPE_ADVANTAGE = 25;
/** 互角 */
export const TYPE_NEUTRAL = 0;
/** 不利。負の加算 */
export const TYPE_DISADVANTAGE = -10;

// --- 特殊状態 (SPEC §7) -----------------------------------------------------

/** 毒1スタックあたりのターン終了時ダメージ */
export const POISON_DAMAGE = 10;
/** 毒の重複上限。4重目の付与は無効 */
export const POISON_MAX_STACKS = 3;

/** 設置1枚あたりの登場時ダメージ */
export const HAZARD_DAMAGE = 10;
/** 設置の重複上限。4枚目の設置は無効 */
export const HAZARD_MAX_STACKS = 3;

// --- 修正値 (SPEC §4.3) -----------------------------------------------------

/** 持続 'untilSwitch' の累積上限。一閃の積みは+30(2回)まで */
export const PERSISTENT_MODIFIER_CAP = 30;

// --- ダメージ (SPEC §4.1) ---------------------------------------------------

/** ダメージの下限。負の値にはならない */
export const DAMAGE_FLOOR = 0;

// --- 試合 (SPEC §8) ---------------------------------------------------------

/** ターン上限。null は無制限。膠着が解消されない場合に導入を検討 (SPEC §12) */
export const TURN_LIMIT: number | null = null;

// --- ユニット (SPEC §1 / §3) ------------------------------------------------

/** 速度の内部値 (PLAN §163)。通常技の段はこの降順に分かれる */
export const SPEED_VALUE: Record<Speed, number> = { fast: 3, mid: 2, slow: 1 };

/** HP の下限・上限。ユニットデータの整合性検証に使う */
export const HP_MIN = 40;
export const HP_MAX = 140;

/** 編成するパーティーの体数 */
export const PARTY_SIZE = 5;
/** パーティーから選出する体数 */
export const TEAM_SIZE = 3;
/** 技枠の数。「技2つ」または「技1つ + 特性1つ」 */
export const SLOT_COUNT = 2;

// --- ユニット固有の効果量 (SPEC §10) ----------------------------------------
//
// 威力・HP・反動は data/units.ts にある。ここに置くのは「効果の大きさ」で、
// 技データのフィールドとしては表せないもの。バランス調整はこの2ファイルで完結する。

/** 堅牢: ターン終了時の回復量 (§10.4) */
export const KENRO_TURN_HEAL = 5;
/** 山嵐: 攻撃技を受けたときに返す固定ダメージ (§10.7) */
export const YAMAARASHI_REFLECT = 10;
/** ゴースト: 瀕死時に返す固定ダメージ (§10.12) */
export const GHOST_FAINT_REFLECT = 35;
/** 手のひら: 技2の自己回復量 (§10.11) */
export const TENOHIRA_HEAL = 25;
/** 手のひら: 技2の1試合あたりの使用回数上限。回復の応酬による膠着を防ぐ (§10.11) */
export const TENOHIRA_HEAL_USES = 3;
/** 器: 技2で控え1体を回復する量 (§10.13) */
export const UTSUWA_HEAL = 15;
/** 一閃: 技2の攻勢上昇。累積上限は PERSISTENT_MODIFIER_CAP (§10.9) */
export const ISSEN_ATK_UP = 15;
/** はさみ: 技2の守勢上昇。このターンのみ (§10.10) */
export const HASAMI_DEF_UP = 10;
/** 鉄拳: 追い討ちの威力上昇。相手が交代を宣言していた場合のみ (§10.2) */
export const TEKKEN_PURSUIT_BONUS = 20;
/** 魔球: 技1の使用ごとの威力減衰。下限0 (§10.3) */
export const MAGYU_POWER_DECAY = 10;
/** ハサミムシ: 技1の使用ごとの威力上昇。上限なし (§10.6) */
export const HASAMIMUSHI_POWER_GROWTH = 5;
