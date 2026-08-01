import { describe, expect, it } from 'vitest';
import { applyEvent, buildFrames, effectOf } from './playback';
import { HOTSEAT_LABELS } from './log';
import { createAi } from '../ai';
import { createBattle, resolveReplacements, resolveTurn } from '../engine/battle';
import { allSelections, sampleSelectionPairs } from '../sim/matchups';
import { makeBattle, move, setHazard, setHp, setPoison } from '../engine/testkit';
import type { BattleState, Side } from '../engine/types';

const SIDES: readonly Side[] = ['p1', 'p2'];

/**
 * 表示に使うフィールドだけを取り出す。
 * 使用回数は意図的に含めない(→ playback.ts の moveUsed のコメント)。
 */
function view(state: BattleState) {
  return SIDES.map((side) => ({
    active: state.sides[side].activeIndex,
    hazard: state.sides[side].hazardStacks,
    party: state.sides[side].party.map((unit) => ({
      hp: unit.hp,
      fainted: unit.fainted,
      poison: unit.poisonStacks,
      atk: unit.modifiers.atk,
      def: unit.modifiers.def,
    })),
  }));
}

const noRevealed = (): Record<Side, number[]> => ({ p1: [], p2: [] });

describe('applyEvent — 1イベントぶん盤面を進める', () => {
  it('引数を書き換えない', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const before = structuredClone(state);
    applyEvent(state, { type: 'damage', target: { side: 'p2', partyIndex: 0 }, amount: 25, source: 'move' });
    expect(state).toEqual(before);
  });

  it('ダメージはHPを減らし、0未満にならない', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const hit = applyEvent(state, { type: 'damage', target: { side: 'p2', partyIndex: 0 }, amount: 25, source: 'move' });
    expect(hit.sides.p2.party[0]?.hp).toBe(115);

    const over = applyEvent(hit, { type: 'damage', target: { side: 'p2', partyIndex: 0 }, amount: 999, source: 'move' });
    expect(over.sides.p2.party[0]?.hp).toBe(0);
  });

  it('回復は最大HPを超えない', () => {
    const state = makeBattle(['tenohira'], ['kenro']);
    setHp(state, 'p1', 0, 90);
    const healed = applyEvent(state, { type: 'heal', target: { side: 'p1', partyIndex: 0 }, amount: 25 });
    expect(healed.sides.p1.party[0]?.hp).toBe(100);
  });

  it('瀕死はHPを0にし、修正値を落とす (SPEC §4.3)', () => {
    const state = makeBattle(['issen'], ['kenro']);
    const stacked = applyEvent(state, {
      type: 'modifier',
      target: { side: 'p1', partyIndex: 0 },
      axis: 'atk',
      value: 15,
      duration: 'untilSwitch',
    });
    expect(stacked.sides.p1.party[0]?.modifiers.atk).toBe(15);

    const dead = applyEvent(stacked, { type: 'faint', target: { side: 'p1', partyIndex: 0 } });
    expect(dead.sides.p1.party[0]).toMatchObject({ hp: 0, fainted: true, modifiers: { atk: 0 } });
  });

  it('交代は場のユニットを入れ替え、修正値を落とす。毒は残る (SPEC §7.1)', () => {
    const state = makeBattle(['ishi', 'bara'], ['kenro']);
    setPoison(state, 'p1', 1, 2);

    const switched = applyEvent(state, {
      type: 'switch',
      side: 'p1',
      from: { side: 'p1', partyIndex: 0 },
      to: { side: 'p1', partyIndex: 1 },
      reason: 'manual',
    });

    expect(switched.sides.p1.activeIndex).toBe(1);
    expect(switched.sides.p1.party[1]?.poisonStacks).toBe(2); // 毒は維持
  });

  it('毒と設置は絶対値で置き換える', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const poisoned = applyEvent(state, { type: 'poisonApplied', target: { side: 'p2', partyIndex: 0 }, stacks: 3 });
    expect(poisoned.sides.p2.party[0]?.poisonStacks).toBe(3);

    const hazarded = applyEvent(state, { type: 'hazardSet', side: 'p2', stacks: 2 });
    expect(hazarded.sides.p2.hazardStacks).toBe(2);
  });

  it('修正値は持続で置き場所が変わる (SPEC §4.3)', () => {
    const state = makeBattle(['hasami'], ['kenro']);
    const ref = { side: 'p1', partyIndex: 0 } as const;

    const turnMod = applyEvent(state, { type: 'modifier', target: ref, axis: 'def', value: 10, duration: 'turn' });
    expect(turnMod.sides.p1.party[0]?.turnModifiers.def).toBe(10);
    expect(turnMod.sides.p1.party[0]?.modifiers.def).toBe(0);

    const lasting = applyEvent(state, { type: 'modifier', target: ref, axis: 'atk', value: 15, duration: 'untilSwitch' });
    expect(lasting.sides.p1.party[0]?.modifiers.atk).toBe(15);
  });

  it('状態を変えないイベントは盤面をそのまま返す', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    for (const event of [
      { type: 'moveUsed', user: { side: 'p1', partyIndex: 0 }, slotIndex: 0 },
      { type: 'healBlocked', target: { side: 'p1', partyIndex: 0 } },
      { type: 'noEffect', reason: 'テスト' },
      { type: 'battleEnd', result: 'draw' },
    ] as const) {
      expect(view(applyEvent(state, event))).toEqual(view(state));
    }
  });
});

describe('buildFrames — コマ列への展開', () => {
  it('イベント1件につき1コマ', () => {
    const state = makeBattle(['ishi', 'bara'], ['kenro', 'ghost']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);
    expect(frames).toHaveLength(events.length);
    expect(frames.map((f) => f.event)).toEqual(events);
  });

  it('各コマがそのステップ時点の盤面を持つ。ダメージのコマでHPが減る', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const hpAt = (index: number) => frames[index]?.battle.sides.p2.party[0]?.hp;
    const hitAt = frames.findIndex(
      (f) => f.event.type === 'damage' && f.event.target.side === 'p2',
    );
    expect(hitAt).toBeGreaterThan(0);

    // 被弾の直前まで満タン、被弾のコマで減る
    expect(hpAt(hitAt - 1)).toBe(140);
    const dealt = frames[hitAt]?.event;
    if (dealt?.type !== 'damage') throw new Error('ダメージのコマではない');
    expect(hpAt(hitAt)).toBe(140 - dealt.amount);
  });

  it('ターン終了時の回復もコマとして現れる (SPEC §5.6 / §10.4)', () => {
    // 堅牢は毎ターン終了時に5回復する。単調減少にはならない
    const state = makeBattle(['ishi'], ['kenro']);
    const { events, state: after } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const healAt = frames.findIndex((f) => f.event.type === 'heal');
    expect(healAt).toBeGreaterThan(0);
    expect(frames[healAt]?.battle.sides.p2.party[0]?.hp).toBe(after.sides.p2.party[0]?.hp);
  });

  it('ログの行がコマごとに付く', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    expect(frames.every((f) => f.entry.text.length > 0)).toBe(true);
    expect(frames[0]?.entry.text).toContain('石');
  });

  it('公開は交代のコマで初めて増える (SPEC §11)', () => {
    const state = makeBattle(['ishi', 'bara'], ['kenro']);
    const { events } = resolveTurn(state, { p1: { kind: 'switch', toPartyIndex: 1 }, p2: move(0) });
    const frames = buildFrames(state, events, { p1: [0], p2: [0] }, HOTSEAT_LABELS);

    const switchIndex = frames.findIndex((f) => f.event.type === 'switch');
    expect(switchIndex).toBeGreaterThanOrEqual(0);
    // 交代のコマ以降で 1 が公開される
    expect(frames[switchIndex]?.revealed.p1).toContain(1);
    if (switchIndex > 0) expect(frames[switchIndex - 1]?.revealed.p1).not.toContain(1);
  });

  it('イベントが空ならコマも空', () => {
    const state = makeBattle(['ishi'], ['kenro']);
    expect(buildFrames(state, [], noRevealed(), HOTSEAT_LABELS)).toEqual([]);
  });
});

/**
 * **この設計の要。**
 *
 * エンジンは最終状態しか返さないので、イベント列から途中の盤面を組み直している。
 * 最後のコマがエンジンの解決結果と一致しなければ、再生の終わりに盤面が飛ぶ。
 * エンジン側でイベントの意味が変わったら、ここが真っ先に落ちる。
 */
describe('不変条件: 最後のコマがエンジンの解決結果と一致する', () => {
  it('3v3 の実戦 300 組で、表示フィールドが完全に一致する', () => {
    const selections = allSelections();
    const pairs = sampleSelectionPairs(300, 20260801);
    let turns = 0;

    for (const [i, j] of pairs) {
      const p1 = selections[i];
      const p2 = selections[j];
      if (!p1 || !p2) throw new Error('選出の添字が不正');

      let state = createBattle(p1, p2, i * 31 + j);
      const ai = { p1: createAi(2), p2: createAi(2) };

      for (let t = 0; t < 60 && state.phase.kind !== 'ended'; t++) {
        const step =
          state.phase.kind === 'awaitingReplacement'
            ? resolveReplacements(
                state,
                Object.fromEntries(
                  state.phase.sides.map((side) => [side, ai[side].chooseReplacement(state, side)]),
                ),
              )
            : resolveTurn(state, {
                p1: ai.p1.chooseAction(state, 'p1'),
                p2: ai.p2.chooseAction(state, 'p2'),
              });

        const frames = buildFrames(state, step.events, noRevealed(), HOTSEAT_LABELS);
        const last = frames[frames.length - 1];
        if (last) expect(view(last.battle)).toEqual(view(step.state));

        state = step.state;
        turns += 1;
      }
    }

    expect(turns).toBeGreaterThan(3000); // 十分な量を通していることを保証する
  });
});

describe('effectOf — コマから演出を導く', () => {
  const state = makeBattle(['ishi'], ['kenro']);
  const frame = (event: Parameters<typeof applyEvent>[1]) =>
    buildFrames(state, [event], noRevealed(), HOTSEAT_LABELS)[0]!;

  it('ダメージは量と発生源を持つ', () => {
    const move = effectOf(frame({ type: 'damage', target: { side: 'p2', partyIndex: 0 }, amount: 25, source: 'move' }));
    expect(move).toMatchObject({ kind: 'damage', amount: 25, note: null });

    const poison = effectOf(frame({ type: 'damage', target: { side: 'p2', partyIndex: 0 }, amount: 10, source: 'poison' }));
    expect(poison).toMatchObject({ kind: 'damage', amount: 10, note: '毒' });

    const reflect = effectOf(frame({ type: 'damage', target: { side: 'p2', partyIndex: 0 }, amount: 10, source: 'reflect' }));
    expect(reflect?.note).toBe('反射');
  });

  it('回復・瀕死・交代・毒・修正値がそれぞれ演出になる', () => {
    expect(effectOf(frame({ type: 'heal', target: { side: 'p1', partyIndex: 0 }, amount: 25 }))?.kind).toBe('heal');
    expect(effectOf(frame({ type: 'faint', target: { side: 'p1', partyIndex: 0 } }))?.kind).toBe('faint');
    expect(effectOf(frame({ type: 'poisonApplied', target: { side: 'p2', partyIndex: 0 }, stacks: 1 }))?.kind).toBe('poison');
    expect(
      effectOf(frame({ type: 'modifier', target: { side: 'p1', partyIndex: 0 }, axis: 'atk', value: 15, duration: 'untilSwitch' })),
    ).toMatchObject({ kind: 'modifier', amount: 15, note: '攻勢' });
  });

  it('交代は「出てきた側」を対象にする', () => {
    const effect = effectOf(
      frame({
        type: 'switch',
        side: 'p1',
        from: { side: 'p1', partyIndex: 0 },
        to: { side: 'p1', partyIndex: 0 },
        reason: 'manual',
      }),
    );
    expect(effect).toMatchObject({ kind: 'switch', target: { side: 'p1', partyIndex: 0 } });
  });

  it('演出のないイベントは null', () => {
    expect(effectOf(frame({ type: 'noEffect', reason: 'テスト' }))).toBeNull();
    expect(effectOf(frame({ type: 'moveUsed', user: { side: 'p1', partyIndex: 0 }, slotIndex: 0 }))).toBeNull();
    expect(effectOf(frame({ type: 'battleEnd', result: 'draw' }))).toBeNull();
  });
});

/**
 * 相性補正 (SPEC §2)。同じ技でも25も動くのに、数値だけでは理由が分からない。
 * **乗る対象を取り違えないことが要点** ─ 固定ダメージと毒・設置・反動・反射は対象外 (SPEC §4.2)。
 */
describe('effectOf — 相性補正', () => {
  /** 実際に1ターン解決して、最初の攻撃ダメージのコマを取り出す */
  const firstMoveDamage = (p1: Parameters<typeof makeBattle>[0], p2: Parameters<typeof makeBattle>[1], slot: 0 | 1 = 0) => {
    const state = makeBattle(p1, p2);
    const { events } = resolveTurn(state, { p1: move(slot), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);
    const frame = frames.find(
      (f) => f.event.type === 'damage' && f.event.source === 'move' && f.event.target.side === 'p2',
    );
    if (!frame) throw new Error('攻撃ダメージのコマがありません');
    return effectOf(frame);
  };

  it('有利対面は advantage と +25 を持つ', () => {
    // 石 gu → バラ choki
    expect(firstMoveDamage(['ishi'], ['bara'])).toMatchObject({
      matchup: 'advantage',
      typeModifier: 25,
    });
  });

  it('不利対面は disadvantage と −10 を持つ', () => {
    // 石 gu → 手のひら pa
    expect(firstMoveDamage(['ishi'], ['tenohira'])).toMatchObject({
      matchup: 'disadvantage',
      typeModifier: -10,
    });
  });

  it('互角対面は補正の値を出さない。見せたいのは動いた理由だけ', () => {
    // 石 gu → 鉄拳 gu
    expect(firstMoveDamage(['ishi'], ['tekken'])).toMatchObject({
      matchup: 'neutral',
      typeModifier: null,
    });
  });

  it('固定ダメージには相性が乗らない (SPEC §4.2)', () => {
    // 手のひら 技0 は固定20。相手が有利対面でも相性は付かない
    expect(firstMoveDamage(['tenohira'], ['ishi'])).toMatchObject({ matchup: null });
  });

  it('反動・反射・毒・設置には相性が乗らない (SPEC §4.2 / §7.4)', () => {
    // 粉砕 gu → 山嵐 choki。有利対面で殴り、反動と反射が同時に出る
    const state = makeBattle(['funsai'], ['yamaarashi']);
    setHp(state, 'p2', 0, 140); // 一撃で倒れないようにして反動を出す
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    for (const frame of frames) {
      if (frame.event.type !== 'damage') continue;
      const effect = effectOf(frame);
      if (frame.event.source === 'move') {
        expect(effect?.matchup).not.toBeNull();
      } else {
        expect(effect?.matchup).toBeNull();
      }
    }
  });

  /**
   * 同じ段で両者が動くと `moveUsed(p1) → moveUsed(p2) → damage → damage` の順に並ぶ。
   * 「直近の moveUsed」で引くと攻撃者を取り違えるので、陣営ごとに持つ必要がある。
   */
  it('同じ段で両者が殴っても、攻撃者を取り違えない', () => {
    // 手のひら pa(中・固定20) と 石 gu(中・通常25)。どちらも中速なので同じ段になる
    const state = makeBattle(['tenohira'], ['ishi']);
    const { events } = resolveTurn(state, { p1: move(0), p2: move(0) });
    const frames = buildFrames(state, events, noRevealed(), HOTSEAT_LABELS);

    const hits = frames.filter((f) => f.event.type === 'damage' && f.event.source === 'move');
    expect(hits).toHaveLength(2);

    for (const frame of hits) {
      if (frame.event.type !== 'damage') continue;
      const effect = effectOf(frame);
      // 手のひらが受けたぶんは石の通常技 → 相性が付く
      // 石が受けたぶんは手のひらの固定ダメージ → 相性は付かない
      expect(effect?.matchup === null).toBe(frame.event.target.side === 'p2');
    }
  });
});

describe('設置ダメージも再生できる (SPEC §7.2)', () => {
  it('交代 → 設置ダメージ の連鎖がコマとして並ぶ', () => {
    const state = makeBattle(['ishi', 'bara'], ['kenro']);
    setHazard(state, 'p1', 2);

    const { events } = resolveTurn(state, { p1: { kind: 'switch', toPartyIndex: 1 }, p2: move(0) });
    const frames = buildFrames(state, events, { p1: [0], p2: [0] }, HOTSEAT_LABELS);

    const kinds = frames.map((f) => f.event.type);
    const switchAt = kinds.indexOf('switch');
    const hazardAt = frames.findIndex((f) => f.event.type === 'damage' && f.event.source === 'hazard');

    expect(switchAt).toBeGreaterThanOrEqual(0);
    expect(hazardAt).toBeGreaterThan(switchAt); // 交代の後に設置ダメージ
  });
});
