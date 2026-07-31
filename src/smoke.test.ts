import { describe, expect, it } from 'vitest';

/**
 * Phase 0 の完了条件 (`npm run test` の成功) を満たすための仮テスト。
 * Phase 1 で engine の実テストを追加したら削除する。
 */
describe('phase 0 setup', () => {
  it('テストランナーが動作する', () => {
    expect(1 + 1).toBe(2);
  });
});
