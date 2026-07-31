/**
 * シード付き乱数 (PLAN §3.4)。
 *
 * 本ゲームで乱数を使うのは**団扇の強制交代先の抽選のみ** (SPEC §10.14)。
 * それ以外は完全に決定論的。
 *
 * `Math.random()` の直接使用は ESLint で禁止されており、このファイルだけが例外。
 * ただし実際には使っていない — 外から与えられたシードのみで進む純粋な実装にすることで、
 * リプレイ・回帰テスト・バグ再現がすべて可能になる。
 */

/** 32bit に収める */
const MASK = 0xffffffff;

/**
 * mulberry32。シードから次のシードと [0,1) の値を返す。
 * 状態を持たないので、呼び出し側が次のシードを保持する。
 */
export function nextRandom(seed: number): { seed: number; value: number } {
  const next = (seed + 0x6d2b79f5) & MASK;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { seed: next, value };
}

/** 0 以上 max 未満の整数。max <= 0 なら例外 */
export function nextInt(seed: number, max: number): { seed: number; value: number } {
  if (max <= 0) throw new Error(`max は正の整数である必要があります: ${String(max)}`);
  const rolled = nextRandom(seed);
  return { seed: rolled.seed, value: Math.floor(rolled.value * max) };
}

/** 配列から1つ選ぶ。空配列なら例外 */
export function pick<T>(seed: number, items: readonly T[]): { seed: number; value: T } {
  const rolled = nextInt(seed, items.length);
  const value = items[rolled.value];
  if (value === undefined) throw new Error('空の配列からは選択できません');
  return { seed: rolled.seed, value };
}
