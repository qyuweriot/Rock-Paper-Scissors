/**
 * どの出来事にどの音を鳴らすか。
 *
 * **純粋関数だけを置く。** WebAudio には一切触れないので、node 環境の vitest から
 * そのまま検査できる (音を鳴らす側は synth.ts)。
 *
 * 判断の材料は `Frame` の**イベント種別**と、`effectOf` が導く**発生源・相性**の両方。
 * 片方だけでは足りない ─ `effectOf` は moveUsed / hazardSet / healBlocked /
 * battleEnd に対して null を返すので、これらが無音になってしまう。
 */

import type { Matchup } from '../../engine/damage';
import type { BattleEvent, DamageSource, Side } from '../../engine/types';
import { effectOf, type Frame } from '../playback';
import type { CueId } from './voices';

/** 鳴らすもの。音程のずれ込みまで含めて1つの音として扱う */
export interface Sound {
  id: CueId;
  /**
   * 音程のずらし (セント)。負で低くなる。
   *
   * **乱数は使わない** (PLAN §3.4)。大きい一撃ほど低く重くなるよう、
   * ダメージ量から決定的に決める。揺らぎではなく情報になる。
   */
  detune: number;
}

/** これ以上のダメージは同じ重さとして扱う。100 まで開くと差が分かりにくい */
const DETUNE_CAP = 60;
/** ダメージ1点あたりのずらし幅 (セント)。上限で −240 = 2半音 */
const DETUNE_PER_DAMAGE = 4;

function damageDetune(amount: number): number {
  return -Math.min(amount, DETUNE_CAP) * DETUNE_PER_DAMAGE;
}

/**
 * ダメージの音。**発生源を先に見る。**
 *
 * 毒・設置・反動・反射は相性補正の対象外 (SPEC §4.2 / §7.4) なので、
 * `matchup` を見るのは `source === 'move'` のときだけでよい。
 */
function damageCue(source: DamageSource, matchup: Matchup | null): CueId {
  switch (source) {
    case 'poison':
      return 'poison-tick';
    case 'hazard':
      return 'hazard-hit';
    case 'recoil':
      return 'recoil';
    case 'reflect':
      return 'reflect';
    case 'move':
      // 相性のない通常ダメージは互角。matchup が null なのは固定ダメージ (手のひら技1)
      if (matchup === null) return 'hit-fixed';
      if (matchup === 'advantage') return 'hit-strong';
      if (matchup === 'disadvantage') return 'hit-weak';
      return 'hit';
  }
}

/**
 * 決着の音 (SPEC §8)。
 * 勝ち負けの言い分けは ResultScreen の `tone` と同じ規則にする ─
 * AI戦だけが「自分の勝ち負け」を持ち、対人戦はどちらが勝っても勝ちの音。
 */
function endCue(result: 'p1' | 'p2' | 'draw', humanSide: Side | null): CueId {
  if (result === 'draw') return 'draw';
  if (humanSide === null) return 'win';
  return result === humanSide ? 'win' : 'lose';
}

/**
 * イベント種別ごとの音。
 *
 * **表にして網羅性を型で守る** (constants.ts の BASE_MS と同じ手)。
 * イベントが増えたら、ここを書き足すまで TS が通らない。
 */
const BY_EVENT: {
  [K in BattleEvent['type']]: (
    event: Extract<BattleEvent, { type: K }>,
    frame: Frame,
    humanSide: Side | null,
  ) => Sound | null;
} = {
  moveUsed: () => ({ id: 'swing', detune: 0 }),

  damage: (event, frame) => ({
    id: damageCue(event.source, effectOf(frame)?.matchup ?? null),
    detune: damageDetune(event.amount),
  }),

  // 回復は多いほど高く鳴らす。ダメージと逆向き
  heal: (event) => ({ id: 'heal', detune: -damageDetune(event.amount) / 2 }),
  healBlocked: () => ({ id: 'heal-blocked', detune: 0 }),
  faint: () => ({ id: 'faint', detune: 0 }),
  switch: () => ({ id: 'switch', detune: 0 }),
  poisonApplied: () => ({ id: 'poison-applied', detune: 0 }),
  hazardSet: () => ({ id: 'hazard-set', detune: 0 }),
  modifier: (event) => ({ id: event.value > 0 ? 'buff' : 'debuff', detune: 0 }),
  noEffect: () => ({ id: 'no-effect', detune: 0 }),
  battleEnd: (event, _frame, humanSide) => ({ id: endCue(event.result, humanSide), detune: 0 }),
};

/**
 * コマ1つに対応する音。鳴らすものがなければ null。
 *
 * `humanSide` は AI戦のみ非 null。決着の音を「勝ち / 負け」に振り分けるのに使う。
 */
export function soundOfFrame(frame: Frame, humanSide: Side | null): Sound | null {
  const event = frame.event;
  // 種別で引いた関数に、その種別に絞ったイベントを渡す。
  // 表の型で対応が保証されているので、ここのキャストは安全
  const resolve = BY_EVENT[event.type] as (
    event: BattleEvent,
    frame: Frame,
    humanSide: Side | null,
  ) => Sound | null;
  return resolve(event, frame, humanSide);
}
