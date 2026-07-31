import { describe, expect, it } from 'vitest';
import { createGreedyAi, switchBonus } from './greedy';
import { SWITCH_DISADVANTAGE_BONUS } from './constants';
import { getLegalActions } from '../engine/battle';
import { makeBattle, move, setHp, setPoison, switchTo, unit } from '../engine/testkit';

/**
 * Lv2: 貪欲 (PLAN §268)。Phase 4 のシミュレータが使う。
 *
 * ここで固定するのは「盤面を1手先まで見て妥当な手を選ぶ」こと。
 * ダメージ0の技(バラ・一閃・手のひら・器・団扇)も評価されることが要点で、
 * これが効かないとバランスレポートがこの5種について嘘をつく。
 */
describe('createGreedyAi — Lv2', () => {
  const ai = createGreedyAi();

  it('合法手しか返さない', () => {
    const state = makeBattle(['magyu', 'utsuwa', 'bara'], ['ishi', 'kenro', 'kami']);
    expect(getLegalActions(state, 'p1')).toContainEqual(ai.chooseAction(state, 'p1'));
  });

  it('決定論的。同じ盤面からは常に同じ手', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    const first = ai.chooseAction(state, 'p1');
    for (let i = 0; i < 10; i++) expect(ai.chooseAction(state, 'p1')).toEqual(first);
  });

  it('盤面を書き換えない。試し打ちは resolveTurn の複製の上で行われる', () => {
    const state = makeBattle(['ishi', 'kenro', 'kami'], ['bara', 'issen', 'hasami']);
    const before = structuredClone(state);
    ai.chooseAction(state, 'p1');
    expect(state).toEqual(before);
  });

  it('倒しきれる技を選ぶ。石は残HPが低い相手に威力35を撃つ', () => {
    // 石の技1=25 / 技2=35(反動15)。グー同士の互角対面で相手のHPが30なら技2でしか倒せない
    // (技1だと5残り、さらに堅牢の特性で5回復してしまう)
    const state = makeBattle(['ishi'], ['kenro']);
    setHp(state, 'p2', 0, 30);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(1));
  });

  it('倒せないなら反動のある技を避ける。石は威力25を選ぶ', () => {
    // 技2は+10ダメージだが自分に15の反動。HP割合で見ると割に合わない
    const state = makeBattle(['ishi'], ['kenro']);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(0));
  });

  it('HP満タンなら回復を選ばない。手のひらは固定20を撃つ', () => {
    const state = makeBattle(['tenohira'], ['kenro']);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(0));
  });

  it('HPが大きく減っていれば回復を選ぶ (SPEC §10.11)', () => {
    const state = makeBattle(['tenohira'], ['kenro']);
    setHp(state, 'p1', 0, 40);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(1));
  });

  it('ダメージ0の技も評価される。バラは毒を撒く', () => {
    const state = makeBattle(['bara'], ['kenro']);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(0));
  });

  it('毒が2重で無駄になるなら設置に切り替える (SPEC §10.8)', () => {
    const state = makeBattle(['bara'], ['kenro']);
    setPoison(state, 'p2', 0, 2);
    expect(ai.chooseAction(state, 'p1')).toEqual(move(1));
  });

  it('不利対面で有利な控えに交代する (PLAN §268)', () => {
    // 石(グー) は 紙(パー) に不利。はさみ(チョキ) は 紙(パー) に有利
    const state = makeBattle(['ishi', 'hasami'], ['kami']);
    expect(ai.chooseAction(state, 'p1')).toEqual(switchTo(1));
  });

  it('有利対面なら交代しない', () => {
    // はさみ(チョキ) は 紙(パー) に有利。逃げる理由がない
    const state = makeBattle(['hasami', 'ishi'], ['kami']);
    expect(ai.chooseAction(state, 'p1').kind).toBe('move');
  });

  /**
   * 交代の加点そのものを検査する。
   *
   * 「交代を選んだか」で測ると、評価関数が別の理由で交代を選ぶ場合に紛れる。
   * 実際 石+堅牢 vs 紙 では、HPの厚い堅牢に引く方がわずかに高く評価される
   * (0.6786 vs 0.6738)。これは加点とは無関係な、それ自体は妥当な判断。
   */
  describe('switchBonus — 不利対面からの退避 (PLAN §268)', () => {
    it('不利対面から有利な控えへ逃げるときだけ加点する', () => {
      // 石(グー) は 紙(パー) に不利。はさみ(チョキ) は 紙(パー) に有利
      const state = makeBattle(['ishi', 'hasami'], ['kami']);
      expect(switchBonus(state, 'p1', switchTo(1))).toBe(SWITCH_DISADVANTAGE_BONUS);
    });

    it('有利対面なら加点しない', () => {
      const state = makeBattle(['hasami', 'ishi'], ['kami']);
      expect(switchBonus(state, 'p1', switchTo(1))).toBe(0);
    });

    it('控えが有利でなければ加点しない', () => {
      // 石(グー) も 堅牢(グー) も 紙(パー) に不利。逃げ先がない
      const state = makeBattle(['ishi', 'kenro'], ['kami']);
      expect(switchBonus(state, 'p1', switchTo(1))).toBe(0);
    });

    it('瀕死寸前の控えには加点しない (SWITCH_MIN_HP_RATIO)', () => {
      const state = makeBattle(['ishi', 'hasami'], ['kami']);
      setHp(state, 'p1', 1, 10); // はさみ 10/95 は SWITCH_MIN_HP_RATIO 未満
      expect(switchBonus(state, 'p1', switchTo(1))).toBe(0);
    });

    it('技には加点しない', () => {
      const state = makeBattle(['ishi', 'hasami'], ['kami']);
      expect(switchBonus(state, 'p1', move(0))).toBe(0);
    });
  });

  it('選択を伴う技も扱える。器は控えの回復対象を選ぶ (SPEC §10.13)', () => {
    // 器(パー) は 山嵐(チョキ) に不利で、殴っても5しか通らず反射で10返る。
    // 一方 控えの一閃は 5/40 なので、15回復の価値が大きい
    const state = makeBattle(['utsuwa', 'issen'], ['yamaarashi']);
    setHp(state, 'p1', 1, 5);
    const action = ai.chooseAction(state, 'p1');
    expect(action).toEqual({ kind: 'move', slotIndex: 1, selection: { side: 'p1', partyIndex: 1 } });
  });

  it('死に出しは相性が最良の控えを選ぶ (SPEC §5.7)', () => {
    // 相手は 紙(パー)。はさみ(チョキ) が有利、堅牢(グー) は不利
    const state = makeBattle(['ishi', 'kenro', 'hasami'], ['kami']);
    setHp(state, 'p1', 0, 0);
    unit(state, 'p1', 0).fainted = true;
    expect(ai.chooseReplacement(state, 'p1')).toBe(2);
  });

  it('死に出しの相性が同点ならHP割合が高い方', () => {
    // 相手は はさみ(チョキ)。石も堅牢もグーで有利。堅牢の方がHP割合が高い
    const state = makeBattle(['bara', 'ishi', 'kenro'], ['hasami']);
    setHp(state, 'p1', 0, 0);
    unit(state, 'p1', 0).fainted = true;
    setHp(state, 'p1', 1, 50); // 石 50/105 ≒ 0.48
    expect(ai.chooseReplacement(state, 'p1')).toBe(2); // 堅牢 140/140
  });
});
