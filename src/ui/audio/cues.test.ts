/**
 * 効果音の対応表の検査。
 *
 * **synth.ts は import しない。** vitest は node 環境なので AudioContext が無く、
 * 触れた瞬間に落ちる。音を鳴らす処理と対応表を分けてあるのはこのため。
 *
 * 見るのは「何が起きたときにどの音になるか」だけ。**音そのものの善し悪しは耳の担当**で、
 * ここでは押さえられない。
 */

import { describe, expect, it } from 'vitest';
import { soundOfFrame } from './cues';
import { CUES, cueDuration, type CueId } from './voices';
import { buildFrames, type Frame } from '../playback';
import { PLAYBACK_MS } from '../constants';
import { HOTSEAT_LABELS } from '../log';
import { makeBattle } from '../../engine/testkit';
import type { BattleEvent, BattleResult, DamageSource, Side } from '../../engine/types';
import type { UnitId } from '../../data/units';

const P1 = { side: 'p1' as Side, partyIndex: 0 };
const P2 = { side: 'p2' as Side, partyIndex: 0 };
const noRevealed = (): Record<Side, number[]> => ({ p1: [], p2: [] });

/** イベント列を1コマずつに展開して、最後のコマを返す */
function lastFrame(p1: UnitId[], p2: UnitId[], events: BattleEvent[]): Frame {
  const frames = buildFrames(makeBattle(p1, p2), events, noRevealed(), HOTSEAT_LABELS);
  const frame = frames[frames.length - 1];
  if (!frame) throw new Error('コマが作られていない');
  return frame;
}

/** p1 が技を宣言して p2 に当てた、という最小の2イベント */
function cueOfAttack(attacker: UnitId, defender: UnitId, slotIndex: 0 | 1 = 0): CueId | null {
  const frame = lastFrame(
    [attacker],
    [defender],
    [
      { type: 'moveUsed', user: P1, slotIndex },
      { type: 'damage', target: P2, amount: 30, source: 'move' },
    ],
  );
  return soundOfFrame(frame, null)?.id ?? null;
}

describe('相性で鳴り分ける (SPEC §2)', () => {
  it('有利・互角・不利が3通りに割れる', () => {
    // 石 = グー。はさみ(チョキ)に有利、紙(パー)に不利、堅牢(グー)とは互角
    const advantage = cueOfAttack('ishi', 'hasami');
    const neutral = cueOfAttack('ishi', 'kenro');
    const disadvantage = cueOfAttack('ishi', 'kami');

    expect(advantage).toBe('hit-strong');
    expect(neutral).toBe('hit');
    expect(disadvantage).toBe('hit-weak');
    expect(new Set([advantage, neutral, disadvantage]).size).toBe(3);
  });

  it('固定ダメージは相性の音を鳴らさない (SPEC §4.2)', () => {
    // 手のひらの掌打は damage.kind === 'fixed'。相手が誰でも音は変わらない
    expect(cueOfAttack('tenohira', 'hasami', 0)).toBe('hit-fixed');
    expect(cueOfAttack('tenohira', 'kami', 0)).toBe('hit-fixed');
  });
});

describe('発生源で鳴り分ける', () => {
  /** 技を宣言せずに、その発生源のダメージだけを起こす */
  const cueOfSource = (source: DamageSource): CueId | null => {
    const frame = lastFrame(
      ['ishi'],
      ['kenro'],
      [{ type: 'damage', target: P2, amount: 20, source }],
    );
    return soundOfFrame(frame, null)?.id ?? null;
  };

  it('毒・設置・反動・反射がそれぞれ別の音になる (SPEC §4.2 / §7.4)', () => {
    const cues = {
      poison: cueOfSource('poison'),
      hazard: cueOfSource('hazard'),
      recoil: cueOfSource('recoil'),
      reflect: cueOfSource('reflect'),
    };

    // 相性補正の対象外なので、通常命中と同じ音にしてはいけない
    expect(Object.values(cues)).not.toContain('hit');
    expect(new Set(Object.values(cues)).size).toBe(4);
  });

  it('技を宣言していない damage も鳴る', () => {
    // moveUsed が無くても無音にならないこと (毒はターン終了時に単独で来る)
    expect(cueOfSource('poison')).toBe('poison-tick');
  });
});

describe('決着 (SPEC §8)', () => {
  const cueOfEnd = (result: BattleResult, humanSide: Side | null): CueId | null => {
    const frame = lastFrame(['ishi'], ['kenro'], [{ type: 'battleEnd', result }]);
    return soundOfFrame(frame, humanSide)?.id ?? null;
  };

  it('AI戦は自分の勝ち負けで鳴り分ける', () => {
    expect(cueOfEnd('p1', 'p1')).toBe('win');
    expect(cueOfEnd('p2', 'p1')).toBe('lose');
  });

  it('対人戦はどちらが勝っても勝ちの音', () => {
    // 画面の前に勝者が居るので「負け」を鳴らす相手がいない (ResultScreen の tone と同じ規則)
    expect(cueOfEnd('p1', null)).toBe('win');
    expect(cueOfEnd('p2', null)).toBe('win');
  });

  it('引き分けは専用の音 (落とさない)', () => {
    expect(cueOfEnd('draw', 'p1')).toBe('draw');
    expect(cueOfEnd('draw', null)).toBe('draw');
  });
});

describe('修正値 (SPEC §4.3)', () => {
  const cueOfModifier = (value: number): CueId | null => {
    const frame = lastFrame(
      ['issen'],
      ['kenro'],
      [{ type: 'modifier', target: P1, axis: 'atk', value, duration: 'untilSwitch' }],
    );
    return soundOfFrame(frame, null)?.id ?? null;
  };

  it('上昇と下降で鳴り分ける', () => {
    expect(cueOfModifier(15)).toBe('buff');
    expect(cueOfModifier(-15)).toBe('debuff');
  });
});

describe('網羅', () => {
  /** 全種別ぶんの最小のイベント */
  const SAMPLES: Record<BattleEvent['type'], BattleEvent> = {
    moveUsed: { type: 'moveUsed', user: P1, slotIndex: 0 },
    damage: { type: 'damage', target: P2, amount: 20, source: 'move' },
    heal: { type: 'heal', target: P1, amount: 20 },
    healBlocked: { type: 'healBlocked', target: P1 },
    faint: { type: 'faint', target: P2 },
    switch: { type: 'switch', side: 'p1', from: null, to: P1, reason: 'manual' },
    poisonApplied: { type: 'poisonApplied', target: P2, stacks: 1 },
    hazardSet: { type: 'hazardSet', side: 'p2', stacks: 1 },
    modifier: { type: 'modifier', target: P1, axis: 'atk', value: 15, duration: 'untilSwitch' },
    noEffect: { type: 'noEffect', reason: '対象が瀕死' },
    battleEnd: { type: 'battleEnd', result: 'p1' },
  };

  it('すべてのイベント種別が音を持つ', () => {
    for (const [type, event] of Object.entries(SAMPLES)) {
      const frame = lastFrame(['ishi'], ['kenro'], [event]);
      const sound = soundOfFrame(frame, 'p1');
      expect(sound, `${type} に音がない`).not.toBeNull();
      expect(CUES[sound?.id ?? 'hit'], `${type} の音が表にない`).toBeDefined();
    }
  });

  it('音の長さがコマの表示時間を超えない', () => {
    // **超えると次のコマの音と混ざる。**--fx と PLAYBACK_SCALE がずれたときと同じ壊れ方で、
    // PLAYBACK_SCALE を下げすぎたときにここが落ちる
    for (const [type, event] of Object.entries(SAMPLES)) {
      const frame = lastFrame(['ishi'], ['kenro'], [event]);
      const sound = soundOfFrame(frame, 'p1');
      if (!sound) continue;
      expect(cueDuration(sound.id), `${type} の音がコマより長い`).toBeLessThanOrEqual(
        PLAYBACK_MS[event.type],
      );
    }
  });

  it('操作音も表にある', () => {
    // 盤面と無関係なので上のループには乗らない。書き忘れをここで拾う
    for (const id of ['tap', 'confirm'] as CueId[]) {
      expect(CUES[id].length).toBeGreaterThan(0);
    }
  });
});

describe('音程のずらし', () => {
  const detuneOfDamage = (amount: number): number => {
    const frame = lastFrame(
      ['ishi'],
      ['kenro'],
      [
        { type: 'moveUsed', user: P1, slotIndex: 0 },
        { type: 'damage', target: P2, amount, source: 'move' },
      ],
    );
    return soundOfFrame(frame, null)?.detune ?? 0;
  };

  it('大きい一撃ほど低くなる', () => {
    expect(detuneOfDamage(40)).toBeLessThan(detuneOfDamage(10));
  });

  it('上限で頭打ちになる (青天井にしない)', () => {
    expect(detuneOfDamage(200)).toBe(detuneOfDamage(60));
  });
});
