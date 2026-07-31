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
/** 毒の重複上限。3重目の付与は無効 */
export const POISON_MAX_STACKS = 2;

/** 設置1枚あたりの登場時ダメージ */
export const HAZARD_DAMAGE = 10;
/** 設置の重複上限。3枚目の設置は無効 */
export const HAZARD_MAX_STACKS = 2;

// --- 修正値 (SPEC §4.3) -----------------------------------------------------

/** 持続 'untilSwitch' の累積上限。一閃の積みは+20(2回)まで */
export const PERSISTENT_MODIFIER_CAP = 20;

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
