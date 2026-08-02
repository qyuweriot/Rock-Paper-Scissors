/**
 * AI の生成口 (PLAN §263)。シミュレータ (Phase 4) と UI (Phase 6) はここだけを見る。
 */

import { createGreedyAi } from './greedy';
import { createLookaheadAi } from './lookahead';
import { createRandomAi } from './random';
import type { Ai, AiLevel } from './types';

export type { Ai, AiLevel } from './types';
export { evaluate } from './evaluate';

export const AI_LEVELS: readonly AiLevel[] = [1, 2, 3];

/** Lv ごとの説明。UI の難易度選択にそのまま出せる */
export const AI_LEVEL_LABELS: Record<AiLevel, string> = {
  1: 'ランダム',
  2: '貪欲(1手先の盤面を評価)',
  3: '先読み(数手先まで読む)',
};

/**
 * `seed` は Lv1 だけが使う。同じシードで作れば選択列が完全に一致する。
 * Lv2 / Lv3 は乱数を使わないので常に決定論的。
 */
export function createAi(level: AiLevel, seed = 0): Ai {
  switch (level) {
    case 1:
      return createRandomAi(seed);
    case 2:
      return createGreedyAi();
    case 3:
      return createLookaheadAi();
  }
}

export function isAiLevel(value: number): value is AiLevel {
  return value === 1 || value === 2 || value === 3;
}
