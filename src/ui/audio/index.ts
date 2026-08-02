/**
 * 効果音の窓口。UI からはここだけを触る。
 *
 * 音の設計 (voices.ts) ・出来事との対応 (cues.ts) ・鳴らす処理 (synth.ts) は
 * 分かれているが、呼び出し側が知る必要はない。
 */

import type { Side } from '../../engine/types';
import type { Frame } from '../playback';
import { soundOfFrame } from './cues';
import { isMuted, playSound, setMuted } from './synth';
import type { CueId } from './voices';

export { isMuted, unlock } from './synth';
export type { CueId } from './voices';

/** 消音の設定を残す鍵 */
const STORAGE_KEY = 'rps.muted';

/** 再生中のコマに対応する音を鳴らす */
export function playFrame(frame: Frame, humanSide: Side | null): void {
  playSound(soundOfFrame(frame, humanSide));
}

/** 操作音など、盤面と無関係な音を鳴らす */
export function playCue(id: CueId): void {
  playSound({ id, detune: 0 });
}

/**
 * 保存された消音の設定を読み出して適用する。
 * localStorage はプライベートモードで投げることがあるので握り潰す。
 */
export function restoreMuted(): boolean {
  let saved: boolean;
  try {
    saved = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    saved = false;
  }
  setMuted(saved);
  return saved;
}

/** 消音を切り替えて保存する。切り替え後の状態を返す */
export function toggleMuted(): boolean {
  const next = !isMuted();
  setMuted(next);
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // 保存できなくても、この場での切り替えは効いている
  }
  return next;
}
