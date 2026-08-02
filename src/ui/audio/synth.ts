/**
 * 音を鳴らす。**AudioContext を触るのはこのファイルだけ。**
 *
 * 時間の扱いを App.tsx に集約したのと同じ考え方で、ブラウザの音の都合
 * (自動再生制限・生成コスト・消音) をここに閉じ込める。呼び出し側は
 * `playSound(sound)` だけを知っていればよい。
 *
 * **モジュールを読み込んだ時点では AudioContext を作らない。**
 * vitest は node 環境で動くので、先頭で作ると import しただけで落ちる。
 * 実際に鳴らすまで生成を遅らせ、作れない環境では黙って何もしない。
 */

import { nextRandom } from '../../engine/rng';
import type { Sound } from './cues';
import { CUES, MASTER_GAIN, type Voice } from './voices';

/** ノイズ源の長さ。一番長い打撃音より長ければよい */
const NOISE_SECONDS = 1;

/**
 * ノイズの種。**`Math.random()` は使えない** (PLAN §3.4 / ESLint が落とす) ので
 * シード付き乱数で埋める。毎回同じ波形になるが、雑音なので聞き分けられない。
 */
const NOISE_SEED = 0x5eed_10f5;

interface Audio {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

let audio: Audio | null = null;
let failed = false;
let muted = false;

/** 初回だけ AudioContext を作る。作れなければ以後ずっと諦める */
function ensure(): Audio | null {
  if (audio) return audio;
  if (failed) return null;

  const Ctor = window.AudioContext;
  if (!Ctor) {
    failed = true;
    return null;
  }

  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    audio = { ctx, master, noise: createNoise(ctx) };
    return audio;
  } catch {
    // 音が出ないだけでゲームは続けられる。ここで投げない
    failed = true;
    return null;
  }
}

/** ホワイトノイズを1本だけ作って使い回す */
function createNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = NOISE_SEED;
  for (let i = 0; i < length; i += 1) {
    const rolled = nextRandom(seed);
    seed = rolled.seed;
    data[i] = rolled.value * 2 - 1;
  }
  return buffer;
}

/**
 * 自動再生制限の解除。**ユーザー操作の中から呼ぶこと。**
 * 最初のクリックまで AudioContext は suspended のままで、音が一切出ない。
 */
export function unlock(): void {
  const a = ensure();
  if (a && a.ctx.state === 'suspended') void a.ctx.resume();
}

/**
 * 消音。**再生そのものは止めず、マスターの音量を落とす。**
 * 止めると復帰したときに溜まった音が鳴り出す。
 */
export function setMuted(next: boolean): void {
  muted = next;
  if (audio) audio.master.gain.value = next ? 0 : MASTER_GAIN;
}

export function isMuted(): boolean {
  return muted;
}

/** 音1つを鳴らす。鳴らせない環境では何も起きない */
export function playSound(sound: Sound | null): void {
  if (!sound || muted) return;
  const a = ensure();
  if (!a) return;
  // 自動再生制限で止まっていることがある。押されるたびに起こす
  if (a.ctx.state === 'suspended') void a.ctx.resume();

  const start = a.ctx.currentTime;
  for (const voice of CUES[sound.id]) {
    playVoice(a, voice, start + (voice.delay ?? 0) / 1000, sound.detune);
  }
}

function playVoice(a: Audio, voice: Voice, at: number, detune: number): void {
  const seconds = voice.ms / 1000;
  const end = at + seconds;

  // 音量の包絡。立ち上がりを一瞬にして減衰させる = 打撃の形
  const envelope = a.ctx.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(voice.gain, at + 0.008);
  // 0 に向けた指数減衰は使えない (0 を渡せない)。十分小さい値に落とす
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  envelope.connect(a.master);

  const osc = a.ctx.createOscillator();
  osc.type = voice.wave;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(voice.from, at);
  if (voice.to !== voice.from) osc.frequency.exponentialRampToValueAtTime(voice.to, end);
  osc.connect(envelope);
  osc.start(at);
  osc.stop(end);

  if (!voice.noise) return;

  // ノイズは打撃感の芯。オシレータより短く切って、頭にだけ乗せる
  const noise = a.ctx.createBufferSource();
  noise.buffer = a.noise;
  const noiseGain = a.ctx.createGain();
  noiseGain.gain.setValueAtTime(voice.gain * voice.noise, at);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(seconds, 0.12));
  noise.connect(noiseGain);
  noiseGain.connect(a.master);
  noise.start(at);
  noise.stop(end);
}
