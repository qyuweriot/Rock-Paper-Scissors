import { describe, expect, it } from 'vitest';
import { createLookaheadAi, predictOpponentAction } from './lookahead';
import { createGreedyAi } from './greedy';
import { getLegalActions } from '../engine/battle';
import { makeBattle, move, setHp, unit } from '../engine/testkit';

/**
 * Lv3: 1手先読み (PLAN §269)。
 *
 * 「Lv2 より強い」ことは統計でしか示せないので、それは sim/runner.test.ts で測る。
 * ここで固定するのは機構としての性質。
 */
describe('createLookaheadAi — Lv3', () => {
  const ai = createLookaheadAi();

  it('合法手しか返さない', () => {
    const state = makeBattle(['magyu', 'utsuwa', 'bara'], ['ishi', 'kenro', 'kami']);
    expect(getLegalActions(state, 'p1')).toContainEqual(ai.chooseAction(state, 'p1'));
  });

  it('決定論的。乱数を使わない', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    const first = ai.chooseAction(state, 'p1');
    for (let i = 0; i < 5; i++) expect(ai.chooseAction(state, 'p1')).toEqual(first);
  });

  it('盤面を書き換えない', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    const before = structuredClone(state);
    ai.chooseAction(state, 'p1');
    expect(state).toEqual(before);
  });

  /**
   * Lv2 との違いは相手の行動の見積もり方だけ。相手の合法手が1つしかない盤面では
   * 「先頭で決め打ち」と「読んだ結果」が必ず同じ手になるので、選択が一致するはず。
   * ここがズレるなら評価の共有か加点の適用がどこかで食い違っている。
   */
  it('相手の合法手が1つなら Lv2 と完全に一致する', () => {
    // 堅牢は枠2が特性なので技は1つ。控えなしなら合法手は1手だけ
    const state = makeBattle(['ishi', 'hasami', 'bara'], ['kenro']);
    expect(getLegalActions(state, 'p2')).toHaveLength(1);
    expect(predictOpponentAction(state, 'p1')).toEqual(getLegalActions(state, 'p2')[0]);
    expect(ai.chooseAction(state, 'p1')).toEqual(createGreedyAi().chooseAction(state, 'p1'));
  });

  it('相手の手を読む。堅牢は倒しきれる技があればそれを選ぶと読まれる', () => {
    // p1 の石が残HP20。堅牢の重打(15、互角)では倒せないが、相手が魔球なら消耗弾(30)で倒せる
    const state = makeBattle(['ishi'], ['magyu']);
    setHp(state, 'p1', 0, 20);
    // 魔球の技1(威力30)は石を倒せる。技2(威力15)では倒せない
    expect(predictOpponentAction(state, 'p1')).toEqual(move(0));
  });

  it('倒しきれる手は先読みしても選ぶ', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    setHp(state, 'p2', 0, 30);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(1));
  });

  it('死に出しは Lv2 と同じ相性判断を使う', () => {
    const state = makeBattle(['ishi', 'kenro', 'hasami'], ['kami']);
    setHp(state, 'p1', 0, 0);
    unit(state, 'p1', 0).fainted = true;
    expect(ai.chooseReplacement(state, 'p1')).toBe(2);
  });
});
