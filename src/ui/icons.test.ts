import { describe, expect, it } from 'vitest';
import { HIDDEN_ICON, UNIT_ICONS } from './icons';
import { PLAYBACK_MS, PLAYBACK_SCALE, playbackDurationOf } from './constants';
import { UNIT_IDS } from '../data/units';

describe('UNIT_ICONS', () => {
  it('15種すべてにアイコンがある。ユニット追加時の付け忘れを防ぐ', () => {
    expect(Object.keys(UNIT_ICONS).sort()).toEqual([...UNIT_IDS].sort());
  });

  it('アイコンが重複していない。見分けがつかなくなる', () => {
    const icons = Object.values(UNIT_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('空文字がない', () => {
    for (const [id, icon] of Object.entries(UNIT_ICONS)) {
      expect(icon.length, `${id} のアイコンが空`).toBeGreaterThan(0);
    }
  });

  it('未公開用のアイコンはどのユニットとも被らない (SPEC §11)', () => {
    expect(Object.values(UNIT_ICONS)).not.toContain(HIDDEN_ICON);
  });
});

describe('PLAYBACK_MS', () => {
  it('イベント12種すべてに表示時間がある', () => {
    const types = [
      'moveUsed',
      'damage',
      'heal',
      'healBlocked',
      'faint',
      'switch',
      'poisonApplied',
      'hazardSet',
      'modifier',
      'noEffect',
      'battleEnd',
    ];
    expect(Object.keys(PLAYBACK_MS).sort()).toEqual([...types].sort());
  });

  it('すべて正の値。0だと再生が一瞬で終わる', () => {
    for (const [type, ms] of Object.entries(PLAYBACK_MS)) {
      expect(ms, `${type} の表示時間`).toBeGreaterThan(0);
    }
  });

  it('1ターン最大9コマでも合計が15秒を超えない', () => {
    // 意図的に遅くしてある (PLAYBACK_SCALE)。上限は「待たされすぎない」ための歯止め
    const longest = Math.max(...Object.values(PLAYBACK_MS));
    expect(longest * 9).toBeLessThan(15_000);
  });

  /**
   * **アニメーションはコマの表示時間より短く保つ。**
   * 長いとコマが変わった瞬間に要素ごと消え、演出が途中で切られる
   * (ダメージ数値が読めなかった原因がこれ)。
   * index.css の実際の尺と対応させてあるので、片方だけ変えると落ちる。
   */
  it('各コマは CSS のアニメーションを切らない長さがある', () => {
    // [イベント種別, index.css で --fx に掛けている ms]
    const animations: [keyof typeof PLAYBACK_MS, number][] = [
      ['damage', 590], // float-up
      ['heal', 540], // pulse
      ['faint', 850], // collapse
      ['switch', 620], // slide-in
      ['poisonApplied', 480], // pulse-poison
      ['modifier', 480], // pulse-mod
    ];

    for (const [type, baseMs] of animations) {
      expect(baseMs * PLAYBACK_SCALE, `${type} の演出`).toBeLessThanOrEqual(PLAYBACK_MS[type]);
    }
  });

  it('瀕死は最も長く止まる。見逃されると何が起きたか分からない', () => {
    expect(PLAYBACK_MS.faint).toBe(Math.max(...Object.values(PLAYBACK_MS)));
  });

  it('playbackDurationOf がイベントから時間を引く', () => {
    expect(playbackDurationOf({ type: 'faint', target: { side: 'p1', partyIndex: 0 } })).toBe(
      PLAYBACK_MS.faint,
    );
  });
});
