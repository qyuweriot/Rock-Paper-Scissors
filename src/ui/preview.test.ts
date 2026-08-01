import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../engine/battle';
import { makeBattle, move, setModifier } from '../engine/testkit';
import { KAMAKIRI_POWER_GROWTH, MAGYU_POWER_DECAY, TENOHIRA_HEAL } from '../engine/constants';
import { breakdownText, previewMove } from './preview';

/**
 * 表示用のダメージ見込み。**エンジンの実測と一致することが唯一の正しさ**なので、
 * 期待値を手で書かず、実際に技を打った結果と突き合わせる。
 */
describe('previewMove — エンジンの実測と一致する', () => {
  /** 実際に1ターン解決して、相手が受けたダメージを取り出す */
  const actualDamage = (
    battle: Parameters<typeof resolveTurn>[0],
    slotIndex: 0 | 1,
  ): number => {
    const before = battle.sides.p2.party[battle.sides.p2.activeIndex]?.hp ?? 0;
    // p2 はダメージを与えない技を選び、修正値を動かさないようにする
    const { state } = resolveTurn(battle, { p1: move(slotIndex), p2: move(0) });
    const after = state.sides.p2.party[state.sides.p2.activeIndex]?.hp ?? 0;
    return before - after;
  };

  it('通常技: 相性補正が乗った値を出す (SPEC §4.1)', () => {
    // 石 gu 技0 威力25 → バラ choki は有利 (+25)
    const battle = makeBattle(['ishi'], ['bara']);

    expect(previewMove(battle, 'p1', 0)?.damage).toBe(50);
    expect(actualDamage(battle, 0)).toBe(50);
  });

  it('不利対面では下がる', () => {
    // 石 gu 技0 威力25 → 手のひら pa は不利 (−10)
    const battle = makeBattle(['ishi'], ['tenohira']);

    expect(previewMove(battle, 'p1', 0)?.damage).toBe(15);
    expect(previewMove(battle, 'p1', 0)?.matchup).toBe('disadvantage');
  });

  it('固定ダメージは相性も修正値も無視する (SPEC §4.2)', () => {
    // 手のひら 技0 は固定20。有利対面でも20 のまま
    const battle = makeBattle(['tenohira'], ['ishi']);
    setModifier(battle, 'p1', 0, 'atk', 30);

    const preview = previewMove(battle, 'p1', 0);
    expect(preview?.damage).toBe(20);
    expect(preview?.matchup).toBeNull();
    expect(preview?.typeModifier).toBe(0);
    expect(preview?.atkMod).toBe(0);
  });

  it('ダメージを与えない技は null', () => {
    // 手のひら 技1 は自己回復
    const battle = makeBattle(['tenohira'], ['ishi']);
    const preview = previewMove(battle, 'p1', 1);

    expect(preview?.damage).toBeNull();
    expect(TENOHIRA_HEAL).toBeGreaterThan(0); // 回復技であることの確認
  });

  it('攻勢・守勢の修正値を反映する (SPEC §4.3)', () => {
    const battle = makeBattle(['ishi'], ['bara']);
    setModifier(battle, 'p1', 0, 'atk', 10);
    setModifier(battle, 'p2', 0, 'def', 5);

    const preview = previewMove(battle, 'p1', 0);
    expect(preview?.atkMod).toBe(10);
    expect(preview?.defMod).toBe(5);
    expect(preview?.damage).toBe(50 + 10 - 5);
  });
});

/**
 * 累積で変わる技。**ここが「カマキリの現在ダメージを出す」の本体**。
 * データ上の初期値ではなく、使った回数を反映した値になっていること。
 */
describe('previewMove — 累積で変わる威力', () => {
  it('カマキリの連撃は使うたびに増える (SPEC §10.6)', () => {
    // 相手はバラ。互角対面でダメージを与えず回復もしないので、HPの増減が連撃だけになる
    let battle = makeBattle(['kamakiri'], ['bara']);
    const seen: number[] = [];

    for (let i = 0; i < 3; i++) {
      const preview = previewMove(battle, 'p1', 0);
      seen.push(preview?.damage ?? -1);
      // 実測と一致することを毎回確かめる
      const before = battle.sides.p2.party[0]?.hp ?? 0;
      battle = resolveTurn(battle, { p1: move(0), p2: move(0) }).state;
      expect((battle.sides.p2.party[0]?.hp ?? 0) - before).toBe(-(preview?.damage ?? 0));
    }

    expect(seen[1]).toBe((seen[0] ?? 0) + KAMAKIRI_POWER_GROWTH);
    expect(seen[2]).toBe((seen[0] ?? 0) + KAMAKIRI_POWER_GROWTH * 2);
  });

  it('魔球の消耗弾は使うたびに減る (SPEC §10.3)', () => {
    let battle = makeBattle(['magyu'], ['kenro']);
    const first = previewMove(battle, 'p1', 0)?.power ?? 0;

    battle = resolveTurn(battle, { p1: move(0), p2: move(0) }).state;

    expect(previewMove(battle, 'p1', 0)?.power).toBe(first - MAGYU_POWER_DECAY);
  });

  it('交代すると累積がリセットされ、威力が戻る (SPEC §7.3)', () => {
    let battle = makeBattle(['kamakiri', 'bara'], ['kenro']);
    const fresh = previewMove(battle, 'p1', 0)?.power ?? 0;

    battle = resolveTurn(battle, { p1: move(0), p2: move(0) }).state;
    expect(previewMove(battle, 'p1', 0)?.power).toBeGreaterThan(fresh);

    // 控えへ出てから戻る
    battle = resolveTurn(battle, { p1: { kind: 'switch', toPartyIndex: 1 }, p2: move(0) }).state;
    battle = resolveTurn(battle, { p1: { kind: 'switch', toPartyIndex: 0 }, p2: move(0) }).state;

    expect(previewMove(battle, 'p1', 0)?.power).toBe(fresh);
  });

  it('鉄拳の追い討ちは相手の宣言に依存するので uncertain にする (SPEC §10.2)', () => {
    const battle = makeBattle(['tekken'], ['bara']);
    const preview = previewMove(battle, 'p1', 1);

    expect(preview?.uncertain).toBe(true);
    // 追い討ちなしの値を出す。威力20 + 有利25
    expect(preview?.damage).toBe(45);
  });

  it('累積の規則が宣言されている技は uncertain にしない', () => {
    const battle = makeBattle(['kamakiri'], ['kenro']);
    expect(previewMove(battle, 'p1', 0)?.uncertain).toBe(false);
  });
});

describe('breakdownText', () => {
  it('効いている項目だけを並べる', () => {
    const battle = makeBattle(['ishi'], ['bara']);
    expect(breakdownText(previewMove(battle, 'p1', 0)!)).toBe('基本25 相性+25');
  });

  it('互角対面では相性の項が消える', () => {
    // 石 gu → 鉄拳 gu は互角
    const battle = makeBattle(['ishi'], ['tekken']);
    expect(breakdownText(previewMove(battle, 'p1', 0)!)).toBe('基本25');
  });

  it('守勢は引き算として出す', () => {
    const battle = makeBattle(['ishi'], ['bara']);
    setModifier(battle, 'p2', 0, 'def', 10);
    expect(breakdownText(previewMove(battle, 'p1', 0)!)).toBe('基本25 相性+25 守勢−10');
  });
});
