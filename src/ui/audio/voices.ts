/**
 * 効果音の音色表。**音の調整はこのファイルだけで行う。**
 *
 * 音源ファイルは持たず、その場で合成する (→ synth.ts)。
 * アセットもライセンス確認も要らず、音色が数値の表になる代わりに、
 * 出せるのはピコピコ寄りの音に限られる。
 *
 * **ゲームバランスとは無関係。** 対戦の仕様は何も変わらない (PLAN §3.3)。
 */

/** 1つの音。周波数を from → to にスイープさせながら鳴らす */
export interface Voice {
  wave: OscillatorType;
  /** 開始周波数 (Hz) */
  from: number;
  /** 終了周波数。下降なら打撃、上昇なら回復や上昇の気配になる */
  to: number;
  /** 長さ (ミリ秒) */
  ms: number;
  /** 音量 (0–1)。重ねるので単体では控えめにする */
  gain: number;
  /** ノイズの混ぜ具合 (0–1)。打撃感はほぼこれで決まる */
  noise?: number;
  /** 鳴り始めをずらす (ミリ秒)。ジングルの2音目以降 */
  delay?: number;
}

/** 鳴らす対象の識別子。**どの出来事がどれになるかは cues.ts が決める** */
export type CueId =
  // 再生中の演出
  | 'swing'
  | 'hit'
  | 'hit-strong'
  | 'hit-weak'
  | 'hit-fixed'
  | 'poison-tick'
  | 'hazard-hit'
  | 'recoil'
  | 'reflect'
  | 'heal'
  | 'heal-blocked'
  | 'faint'
  | 'switch'
  | 'poison-applied'
  | 'hazard-set'
  | 'buff'
  | 'debuff'
  | 'no-effect'
  // 決着
  | 'win'
  | 'lose'
  | 'draw'
  // 操作
  | 'tap'
  | 'confirm';

/**
 * 全体音量。**大きいほど大きい。** 個々の gain に掛かる。
 * 音量の調整はまずここを動かす。
 */
export const MASTER_GAIN = 0.22;

/**
 * cue 1つ = Voice の重ね。
 *
 * **総再生時間 (delay + ms) はコマの表示時間を超えてはいけない。**
 * 超えると次のコマの音と混ざって何が起きたか分からなくなる。
 * cues.test.ts が PLAYBACK_MS と突き合わせて落とす。
 */
export const CUES: Record<CueId, readonly Voice[]> = {
  /** 技の宣言。ダメージの前触れなので短く、上に抜ける */
  swing: [{ wave: 'triangle', from: 320, to: 760, ms: 110, gain: 0.5, noise: 0.15 }],

  /** 通常命中。下降 + ノイズでドッと鳴らす */
  hit: [
    { wave: 'square', from: 220, to: 90, ms: 130, gain: 0.7, noise: 0.45 },
    { wave: 'sine', from: 130, to: 60, ms: 180, gain: 0.5 },
  ],

  /** 有利対面 (SPEC §2)。高い所から深く落とし、ノイズも厚くする */
  'hit-strong': [
    { wave: 'square', from: 420, to: 70, ms: 220, gain: 0.85, noise: 0.7 },
    { wave: 'sawtooth', from: 180, to: 50, ms: 260, gain: 0.6 },
    { wave: 'square', from: 620, to: 300, ms: 120, gain: 0.45, delay: 40 },
  ],

  /** 不利対面。幅を狭く、ノイズを薄く。手応えのなさを出す */
  'hit-weak': [
    { wave: 'sine', from: 190, to: 150, ms: 110, gain: 0.5, noise: 0.15 },
    { wave: 'triangle', from: 120, to: 100, ms: 140, gain: 0.35 },
  ],

  /** 固定ダメージ (手のひら技1)。相性を無視するので無機質に */
  'hit-fixed': [
    { wave: 'square', from: 300, to: 300, ms: 90, gain: 0.6, noise: 0.2 },
    { wave: 'square', from: 200, to: 200, ms: 90, gain: 0.5, delay: 90 },
  ],

  /** ターン終了時の毒 (SPEC §7.1)。にじむような濁った音 */
  'poison-tick': [
    { wave: 'sawtooth', from: 150, to: 110, ms: 260, gain: 0.45, noise: 0.25 },
    { wave: 'sine', from: 95, to: 70, ms: 300, gain: 0.35 },
  ],

  /** 設置を踏んだ (SPEC §7.2)。硬く短い */
  'hazard-hit': [{ wave: 'square', from: 260, to: 130, ms: 120, gain: 0.55, noise: 0.55 }],

  /** 反動 (SPEC §4.2)。鈍く低い自傷 */
  recoil: [{ wave: 'sawtooth', from: 140, to: 60, ms: 200, gain: 0.6, noise: 0.35 }],

  /** 反射 (SPEC §7.4)。上がってから落ちる = 跳ね返った */
  reflect: [
    { wave: 'square', from: 240, to: 700, ms: 90, gain: 0.55 },
    { wave: 'square', from: 700, to: 180, ms: 150, gain: 0.6, delay: 90, noise: 0.25 },
  ],

  /** 回復。柔らかく上がる2音 */
  heal: [
    { wave: 'triangle', from: 520, to: 660, ms: 160, gain: 0.5 },
    { wave: 'triangle', from: 660, to: 880, ms: 220, gain: 0.45, delay: 130 },
  ],

  /** 治癒封じ (SPEC §10.11)。回復の出だしを潰した形 */
  'heal-blocked': [
    { wave: 'triangle', from: 520, to: 620, ms: 90, gain: 0.45 },
    { wave: 'sawtooth', from: 300, to: 90, ms: 180, gain: 0.5, delay: 90, noise: 0.3 },
  ],

  /** 瀕死。長く落ちきる */
  faint: [
    { wave: 'sawtooth', from: 330, to: 50, ms: 520, gain: 0.7 },
    { wave: 'square', from: 165, to: 40, ms: 560, gain: 0.4, noise: 0.2 },
  ],

  /** 交代。空気が入れ替わる感じの短いスイープ */
  switch: [
    { wave: 'sine', from: 200, to: 520, ms: 130, gain: 0.45, noise: 0.2 },
    { wave: 'sine', from: 520, to: 380, ms: 120, gain: 0.35, delay: 130 },
  ],

  /** 毒を盛られた (SPEC §7.1)。じわりと上がる不穏な音 */
  'poison-applied': [
    { wave: 'sawtooth', from: 110, to: 260, ms: 300, gain: 0.45, noise: 0.2 },
  ],

  /** 設置した (SPEC §7.2)。ばら撒く音 */
  'hazard-set': [
    { wave: 'square', from: 700, to: 400, ms: 80, gain: 0.4, noise: 0.5 },
    { wave: 'square', from: 500, to: 260, ms: 100, gain: 0.35, delay: 80, noise: 0.5 },
  ],

  /** 攻勢・守勢の上昇 (SPEC §4.3)。階段状に上がる */
  buff: [
    { wave: 'square', from: 440, to: 440, ms: 80, gain: 0.4 },
    { wave: 'square', from: 660, to: 660, ms: 110, gain: 0.4, delay: 80 },
  ],

  /** 下降。上と逆向き */
  debuff: [
    { wave: 'square', from: 440, to: 440, ms: 80, gain: 0.4 },
    { wave: 'square', from: 300, to: 300, ms: 110, gain: 0.4, delay: 80 },
  ],

  /** 不発 (SPEC §5.5)。すかされた音 */
  'no-effect': [{ wave: 'sine', from: 300, to: 220, ms: 120, gain: 0.3 }],

  /** 勝ち。3音の上行 */
  win: [
    { wave: 'square', from: 523, to: 523, ms: 130, gain: 0.5 },
    { wave: 'square', from: 659, to: 659, ms: 130, gain: 0.5, delay: 130 },
    { wave: 'square', from: 784, to: 784, ms: 300, gain: 0.55, delay: 260 },
  ],

  /** 負け。2音の下行 */
  lose: [
    { wave: 'triangle', from: 392, to: 392, ms: 180, gain: 0.5 },
    { wave: 'triangle', from: 262, to: 220, ms: 400, gain: 0.5, delay: 180 },
  ],

  /** 引き分け (SPEC §8)。同じ高さで並ぶ */
  draw: [
    { wave: 'triangle', from: 392, to: 392, ms: 150, gain: 0.45 },
    { wave: 'triangle', from: 392, to: 392, ms: 300, gain: 0.45, delay: 200 },
  ],

  /** ボタンを押した。会話を邪魔しない短さ */
  tap: [{ wave: 'square', from: 620, to: 620, ms: 40, gain: 0.35 }],

  /** 決定・確定。tap より一段上がる */
  confirm: [
    { wave: 'square', from: 620, to: 620, ms: 50, gain: 0.4 },
    { wave: 'square', from: 930, to: 930, ms: 80, gain: 0.4, delay: 50 },
  ],
};

/** その cue が鳴り終わるまでの時間 (ミリ秒) */
export function cueDuration(id: CueId): number {
  return CUES[id].reduce((max, v) => Math.max(max, (v.delay ?? 0) + v.ms), 0);
}
