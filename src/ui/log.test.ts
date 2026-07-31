import { describe, expect, it } from 'vitest';
import { AI_LABELS, formatEvent, formatEvents, turnHeading } from './log';
import { makeBattle } from '../engine/testkit';
import { resolveTurn } from '../engine/battle';
import { move } from '../engine/testkit';
import type { BattleEvent, DamageSource } from '../engine/types';

/**
 * バトルログ (PLAN §3.5)。
 * エンジンのイベント12種すべてが日本語になることを固定する。
 */
describe('formatEvent — イベントの日本語化', () => {
  const battle = makeBattle(['ishi', 'bara'], ['kenro', 'ghost']);
  const p1 = { side: 'p1', partyIndex: 0 } as const;
  const p2 = { side: 'p2', partyIndex: 0 } as const;
  const fmt = (event: BattleEvent) => formatEvent(event, battle).text;

  it('技の使用はユニット名と技名を出す', () => {
    expect(fmt({ type: 'moveUsed', user: p1, slotIndex: 0 })).toBe('石 の 打撃');
    expect(fmt({ type: 'moveUsed', user: p1, slotIndex: 1 })).toBe('石 の 捨て身打ち');
  });

  it('ダメージは発生源で言い回しを変える', () => {
    const at = (source: DamageSource) => fmt({ type: 'damage', target: p2, amount: 25, source });

    expect(at('move')).toBe('堅牢 は 25 のダメージ');
    expect(at('poison')).toBe('堅牢 は 毒で25 のダメージ');
    expect(at('hazard')).toBe('堅牢 は 設置で25 のダメージ');
    expect(at('recoil')).toBe('堅牢 は 反動で25 のダメージ');
    expect(at('reflect')).toBe('堅牢 は 反射で25 のダメージ');
  });

  it('回復と回復無効を区別する', () => {
    expect(fmt({ type: 'heal', target: p1, amount: 30 })).toBe('石 は HP が 30 回復した');
    expect(fmt({ type: 'healBlocked', target: p1 })).toBe('石 の回復は封じられている');
  });

  it('瀕死', () => {
    expect(fmt({ type: 'faint', target: p2 })).toBe('堅牢 は倒れた');
  });

  it('交代は理由ごとに言い回しを変える (SPEC §6 / §10.3 / §10.14)', () => {
    const from = { side: 'p1', partyIndex: 0 } as const;
    const to = { side: 'p1', partyIndex: 1 } as const;
    const at = (reason: 'manual' | 'forced' | 'selfSwitch' | 'faint') =>
      fmt({ type: 'switch', side: 'p1', from, to, reason });

    expect(at('manual')).toBe('石 は引っ込み、バラ が出てきた');
    expect(at('forced')).toBe('バラ が引きずり出された');
    expect(at('selfSwitch')).toBe('石 は離脱し、バラ が出てきた');
    expect(at('faint')).toBe('バラ が繰り出された');
  });

  it('死に出しは from が null でも壊れない', () => {
    const to = { side: 'p1', partyIndex: 1 } as const;
    expect(fmt({ type: 'switch', side: 'p1', from: null, to, reason: 'faint' })).toBe(
      'バラ が繰り出された',
    );
  });

  it('毒と設置はスタック数を数値で出す (PLAN §299)', () => {
    expect(fmt({ type: 'poisonApplied', target: p2, stacks: 2 })).toBe('堅牢 は毒を受けた(2重)');
    expect(fmt({ type: 'hazardSet', side: 'p2', stacks: 3 })).toBe(
      'プレイヤー2 側の場に設置が置かれた(3枚)',
    );
  });

  it('修正値は軸・符号・持続を出す', () => {
    expect(fmt({ type: 'modifier', target: p1, axis: 'atk', value: 15, duration: 'untilSwitch' })).toBe(
      '石 の攻勢が +15(交代まで)',
    );
    expect(fmt({ type: 'modifier', target: p1, axis: 'def', value: 10, duration: 'turn' })).toBe(
      '石 の守勢が +10(このターン)',
    );
  });

  it('不発は理由をそのまま出す', () => {
    expect(fmt({ type: 'noEffect', reason: 'HPが満タンのため回復しない' })).toBe(
      'しかしHPが満タンのため回復しない',
    );
  });

  it('決着は引き分けも含めて出す (SPEC §8)', () => {
    expect(fmt({ type: 'battleEnd', result: 'p1' })).toBe('プレイヤー1 の勝ち');
    expect(fmt({ type: 'battleEnd', result: 'draw' })).toBe('相打ち。引き分け');
  });

  it('陣営の呼び名は差し替えられる。AI戦では「あなた / 相手」', () => {
    expect(formatEvent({ type: 'battleEnd', result: 'p1' }, battle, AI_LABELS).text).toBe(
      'あなた の勝ち',
    );
    expect(formatEvent({ type: 'hazardSet', side: 'p2', stacks: 1 }, battle, AI_LABELS).text).toBe(
      '相手 側の場に設置が置かれた(1枚)',
    );
  });

  it('side を持たせて自陣・敵陣を区別できる', () => {
    expect(formatEvent({ type: 'faint', target: p2 }, battle).side).toBe('p2');
    expect(formatEvent({ type: 'noEffect', reason: 'x' }, battle).side).toBeNull();
  });
});

describe('formatEvents — 実際のターン解決を通す', () => {
  it('12種の網羅ではなく、実物のイベント列が全部変換できることを見る', () => {
    const battle = makeBattle(['ishi', 'bara'], ['kenro', 'ghost']);
    const { state, events } = resolveTurn(battle, { p1: move(0), p2: move(0) });

    const entries = formatEvents(events, state);
    expect(entries).toHaveLength(events.length);
    // 空文字や未変換の記号が残っていない
    expect(entries.every((e) => e.text.length > 0 && !e.text.includes('?'))).toBe(true);
  });
});

describe('turnHeading', () => {
  it('ターンの区切りを出す。エンジンのイベント種別とは混ざらない', () => {
    expect(turnHeading(3)).toEqual({ type: 'turnHeading', side: null, text: '3 ターン目' });
  });
});
