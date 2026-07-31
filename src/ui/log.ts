/**
 * バトルログ (PLAN §3.5 / §285)。
 *
 * エンジンは状態ではなく構造化されたイベント列を返す設計なので、
 * ここは**変換だけ**で済む。判断もロジックも持たない。
 *
 * 純粋関数なので `.ts` に置き、vitest (node) でテストする。
 */

import { getUnit, type UnitId } from '../data/units';
import type { BattleEvent, BattleState, Side, UnitRef } from '../engine/types';

/** ターンの区切り行。エンジンのイベントではないので独自の種別を持たせる */
export type LogEntryType = BattleEvent['type'] | 'turnHeading';

export interface LogEntry {
  text: string;
  /** 見た目の出し分けに使う */
  type: LogEntryType;
  /** どちらの陣営に関する行か。陣営に紐づかないものは null */
  side: Side | null;
}

/** 陣営の呼び名。AI戦と対人戦で変わるので呼び出し側が渡す */
export type SideLabels = Record<Side, string>;

export const HOTSEAT_LABELS: SideLabels = { p1: 'プレイヤー1', p2: 'プレイヤー2' };
export const AI_LABELS: SideLabels = { p1: 'あなた', p2: '相手' };

function unitName(battle: BattleState, ref: UnitRef): string {
  const unit = battle.sides[ref.side].party[ref.partyIndex];
  if (!unit) return '?';
  return getUnit(unit.unitId as UnitId).name;
}

function moveName(battle: BattleState, ref: UnitRef, slotIndex: 0 | 1): string {
  const unit = battle.sides[ref.side].party[ref.partyIndex];
  if (!unit) return '?';
  const slot = getUnit(unit.unitId as UnitId).slots[slotIndex];
  // 特性枠は技として使えないので、ここに来るのは技枠だけ
  return slot.kind === 'move' ? slot.move.name : '?';
}

const DAMAGE_SOURCE_LABELS = {
  move: '',
  poison: '毒で',
  hazard: '設置で',
  recoil: '反動で',
  reflect: '反射で',
} as const;

const AXIS_LABELS = { atk: '攻勢', def: '守勢' } as const;

/**
 * イベント1件を1行の日本語にする。
 *
 * `battle` はユニット名を引くためだけに使う。`unitId` はターンを通じて変わらないので、
 * 解決後の状態を渡しても名前は正しく引ける。
 */
export function formatEvent(
  event: BattleEvent,
  battle: BattleState,
  labels: SideLabels = HOTSEAT_LABELS,
): LogEntry {
  switch (event.type) {
    case 'moveUsed':
      return {
        type: event.type,
        side: event.user.side,
        text: `${unitName(battle, event.user)} の ${moveName(battle, event.user, event.slotIndex)}`,
      };

    case 'damage':
      return {
        type: event.type,
        side: event.target.side,
        text: `${unitName(battle, event.target)} は ${DAMAGE_SOURCE_LABELS[event.source]}${String(event.amount)} のダメージ`,
      };

    case 'heal':
      return {
        type: event.type,
        side: event.target.side,
        text: `${unitName(battle, event.target)} は HP が ${String(event.amount)} 回復した`,
      };

    case 'healBlocked':
      return {
        type: event.type,
        side: event.target.side,
        text: `${unitName(battle, event.target)} の回復は封じられている`,
      };

    case 'faint':
      return {
        type: event.type,
        side: event.target.side,
        text: `${unitName(battle, event.target)} は倒れた`,
      };

    case 'switch': {
      const to = unitName(battle, event.to);
      // 死に出しは「誰が出てきたか」だけが意味を持つ。通常交代は入れ替わりを見せる
      const text =
        event.reason === 'faint'
          ? `${to} が繰り出された`
          : event.reason === 'forced'
            ? `${to} が引きずり出された`
            : event.reason === 'selfSwitch'
              ? `${unitName(battle, event.from ?? event.to)} は離脱し、${to} が出てきた`
              : `${unitName(battle, event.from ?? event.to)} は引っ込み、${to} が出てきた`;
      return { type: event.type, side: event.side, text };
    }

    case 'poisonApplied':
      return {
        type: event.type,
        side: event.target.side,
        text: `${unitName(battle, event.target)} は毒を受けた(${String(event.stacks)}重)`,
      };

    case 'hazardSet':
      return {
        type: event.type,
        side: event.side,
        text: `${labels[event.side]} 側の場に設置が置かれた(${String(event.stacks)}枚)`,
      };

    case 'modifier': {
      const sign = event.value >= 0 ? '+' : '';
      const duration = event.duration === 'turn' ? 'このターン' : '交代まで';
      return {
        type: event.type,
        side: event.target.side,
        text: `${unitName(battle, event.target)} の${AXIS_LABELS[event.axis]}が ${sign}${String(event.value)}(${duration})`,
      };
    }

    case 'noEffect':
      return { type: event.type, side: null, text: `しかし${event.reason}` };

    case 'battleEnd':
      return {
        type: event.type,
        side: null,
        text: event.result === 'draw' ? '相打ち。引き分け' : `${labels[event.result]} の勝ち`,
      };
  }
}

/** ターン解決で出たイベント列をまとめて変換する */
export function formatEvents(
  events: BattleEvent[],
  battle: BattleState,
  labels: SideLabels = HOTSEAT_LABELS,
): LogEntry[] {
  return events.map((event) => formatEvent(event, battle, labels));
}

/** ターンの区切り。ログが1本につながって読めなくなるのを防ぐ */
export function turnHeading(turn: number): LogEntry {
  return { type: 'turnHeading', side: null, text: `${String(turn)} ターン目` };
}
