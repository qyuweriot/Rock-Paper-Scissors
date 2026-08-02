import { describe, expect, it } from 'vitest';
import { createLookaheadAi, predictOpponentAction } from './lookahead';
import { createGreedyAi } from './greedy';
import { createBattle, getLegalActions, resolveReplacements, resolveTurn } from '../engine/battle';
import type { Side } from '../engine/types';
import { makeBattle, move, setHp, unit } from '../engine/testkit';

/**
 * Lv3: 先読み (PLAN §269)。
 *
 * 「Lv2 より強い」ことは統計でしか示せないので、それはシミュレータで測る
 * (深さ4 で対 Lv2 約79%。数字は lookahead.ts の doc にある)。
 * ここで固定するのは機構としての性質 ─ 決定論・盤面を壊さないこと・
 * **深さを入れて初めて踏むようになった経路で落ちないこと**。
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
   * 相手の合法手が1つしかない盤面では
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

  it('死に出しは Lv2 と同じ相性判断を使う', () => {
    const state = makeBattle(['ishi', 'kenro', 'hasami'], ['kami']);
    setHp(state, 'p1', 0, 0);
    unit(state, 'p1', 0).fainted = true;
    expect(ai.chooseReplacement(state, 'p1')).toBe(2);
  });

  /**
   * 深く読むようになって初めて踏むようになった経路。
   *
   * `resolveTurn` の後は `awaitingActions` とは限らない ─ 決着していることも、
   * 死に出し待ちのこともある。再帰がそこで `getLegalActions` を呼ぶと例外で落ちる。
   * **浅い探索では最後の1手でしか起きなかったので、深さを入れるまで表に出なかった。**
   */
  describe('探索の途中で盤面が通常の局面でなくなっても落ちない', () => {
    it('次の一手で決着する局面', () => {
      const state = makeBattle(['ishi'], ['issen']);
      setHp(state, 'p2', 0, 5); // 何を撃っても倒れる
      expect(() => ai.chooseAction(state, 'p1')).not.toThrow();
    });

    it('探索の途中で死に出しが挟まる局面', () => {
      // 控えがいるので、倒しても試合は続く。再帰の中で resolveReplacements が要る
      const state = makeBattle(['ishi', 'kenro'], ['issen', 'hasami']);
      setHp(state, 'p2', 0, 5);
      expect(() => ai.chooseAction(state, 'p1')).not.toThrow();
      expect(getLegalActions(state, 'p1')).toContainEqual(ai.chooseAction(state, 'p1'));
    });

    it('両者が相打ちになりうる局面', () => {
      const state = makeBattle(['ishi', 'kenro'], ['issen', 'hasami']);
      setHp(state, 'p1', 0, 5);
      setHp(state, 'p2', 0, 5);
      expect(() => ai.chooseAction(state, 'p1')).not.toThrow();
    });
  });

  /**
   * 決着の点数を定数だけにすると、**どの勝ち方も同点**になる。
   * 石が堅牢(HP30)を倒す場面では「捨て身打ち(反動15)で即倒す」と
   * 「打撃2発で無傷で倒す」の最終HPが完全に一致し、並び順で前者が捨てられていた。
   * 倒し切れるなら待つ理由はない ─ 決着した時点で残HPの価値は消える。
   */
  it('倒し切れる手があるなら、遅らせずに倒す', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    setHp(state, 'p2', 0, 30);
    // 打撃(25)では届かない。捨て身打ち(35)だけが今ターンで倒せる
    expect(ai.chooseAction(state, 'p1')).toEqual(move(1));
  });

  /**
   * 強さそのものは統計でしか示せないので sim で測る (深さ4 で対 Lv2 約79%)。
   * ここで押さえるのは「**Lv2 とは違う手を実際に選んでいる**」こと。
   *
   * 初手だけを比べても差は出ない ─ 満タン同士の開幕は Lv2 でも正しく殴るので、
   * 読みの差は中盤にしか現れない。試合を進めながら比べる。
   * 深さの設定が事故で 1 に戻ったら、この割合が落ちて気付ける。
   */
  it('試合を通して Lv2 とは違う手を選ぶ', () => {
    const greedy = createGreedyAi();
    let decisions = 0;
    let differed = 0;

    for (let seed = 0; seed < 6; seed++) {
      let state = createBattle(['ishi', 'bara', 'utsuwa'], ['kami', 'issen', 'tenohira'], seed);

      for (let turn = 0; turn < 25 && state.phase.kind !== 'ended'; turn++) {
        if (state.phase.kind === 'awaitingReplacement') {
          const choices: Partial<Record<Side, number>> = {};
          for (const s of state.phase.sides) choices[s] = greedy.chooseReplacement(state, s);
          state = resolveReplacements(state, choices).state;
          continue;
        }

        decisions += 1;
        const deep = ai.chooseAction(state, 'p1');
        if (JSON.stringify(deep) !== JSON.stringify(greedy.chooseAction(state, 'p1'))) {
          differed += 1;
        }
        state = resolveTurn(state, { p1: deep, p2: greedy.chooseAction(state, 'p2') }).state;
      }
    }

    expect(decisions).toBeGreaterThan(50);
    // 実測で約3割。深さが浅くなると目に見えて下がる
    expect(differed / decisions).toBeGreaterThan(0.1);
  });
});
