import { describe, expect, it } from 'vitest';
import { nextInt, nextRandom, pick } from './rng';

/**
 * シード付き乱数 (PLAN §3.4)。
 * 決定論であることが、リプレイ・回帰テスト・バグ再現のすべての前提になる。
 */
describe('rng — シード付き乱数', () => {
  it('同じシードからは常に同じ値が出る', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextInt(7, 100)).toEqual(nextInt(7, 100));
  });

  it('シードが違えば系列も変わる', () => {
    expect(nextRandom(1).value).not.toBe(nextRandom(2).value);
  });

  it('値は 0 以上 1 未満', () => {
    let seed = 0;
    for (let i = 0; i < 500; i++) {
      const rolled = nextRandom(seed);
      expect(rolled.value).toBeGreaterThanOrEqual(0);
      expect(rolled.value).toBeLessThan(1);
      seed = rolled.seed;
    }
  });

  it('nextInt は 0 以上 max 未満の整数を返す', () => {
    let seed = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const rolled = nextInt(seed, 3);
      expect(Number.isInteger(rolled.value)).toBe(true);
      expect(rolled.value).toBeGreaterThanOrEqual(0);
      expect(rolled.value).toBeLessThan(3);
      seen.add(rolled.value);
      seed = rolled.seed;
    }
    expect(seen).toEqual(new Set([0, 1, 2])); // 偏りきってはいない
  });

  it('max が0以下なら例外', () => {
    expect(() => nextInt(0, 0)).toThrow();
    expect(() => nextInt(0, -1)).toThrow();
  });

  it('pick は配列の要素を返し、空配列では例外', () => {
    const items = ['a', 'b', 'c'];
    const rolled = pick(123, items);
    expect(items).toContain(rolled.value);
    expect(() => pick(0, [])).toThrow();
  });

  it('シードが進むので、繰り返し引いても同じ値に固定されない', () => {
    let seed = 99;
    const values: number[] = [];
    for (let i = 0; i < 10; i++) {
      const rolled = nextRandom(seed);
      values.push(rolled.value);
      seed = rolled.seed;
    }
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});
