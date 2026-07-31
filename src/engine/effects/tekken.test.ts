import { describe, expect, it } from 'vitest';
import { resolveReplacements, resolveTurn } from '../battle';
import { eventsOfType, makeBattle, move, setHp, switchTo } from '../testkit';
import type { Action } from '../types';

/**
 * 鉄拳 gu HP50 中 / 技0 威力15 先制 / 技1 威力20 + 追い討ち+20 (SPEC §10.2)
 */
const dealtToP2 = (events: ReturnType<typeof resolveTurn>['events']) =>
  eventsOfType(events, 'damage').find((d) => d.target.side === 'p2' && d.source === 'move')?.amount;

describe('鉄拳 — 追い討ち (SPEC §10.2)', () => {
  it('相手が交代を宣言していれば威力+20', () => {
    // 交代先も堅牢と同じグーにして、相性の影響を排して威力差だけを見る
    const withSwitch = resolveTurn(makeBattle(['tekken'], ['kenro', 'ishi']), {
      p1: move(1),
      p2: switchTo(1),
    });
    const withoutSwitch = resolveTurn(makeBattle(['tekken'], ['kenro', 'ishi']), {
      p1: move(1),
      p2: move(0),
    });

    expect(dealtToP2(withSwitch.events)).toBe(40); // 20 + 20、互角
    expect(dealtToP2(withoutSwitch.events)).toBe(20);
  });

  it('ダメージは交代後に出てきたユニットに入る', () => {
    const state = makeBattle(['tekken'], ['kenro', 'ishi']);
    const { events } = resolveTurn(state, { p1: move(1), p2: switchTo(1) });

    const damage = eventsOfType(events, 'damage').find(
      (d) => d.target.side === 'p2' && d.source === 'move',
    );
    expect(damage?.target.partyIndex).toBe(1);
  });

  it('相性判定も交代後のユニットに対して行われる', () => {
    // 交代先をパーにすると グー→パー で不利 (−10) になる
    const state = makeBattle(['tekken'], ['kenro', 'tenohira']);
    const { events } = resolveTurn(state, { p1: move(1), p2: switchTo(1) });

    expect(dealtToP2(events)).toBe(30); // 20 + 20 − 10
  });

  it('団扇の強制交代では発動しない', () => {
    // 団扇は遅(段4)、鉄拳は中(段3)。鉄拳の攻撃が先に解決される
    const state = makeBattle(['tekken'], ['uchiwa', 'kenro']);
    const { events } = resolveTurn(state, { p1: move(1), p2: move(1) });

    // 団扇はパー。グー→パー は不利なので 20 − 10 = 10
    expect(dealtToP2(events)).toBe(10);
  });

  it('魔球の自己交代では発動しない', () => {
    // 魔球も鉄拳も中なので同段。自己交代はステップ3で、鉄拳の攻撃より後
    const state = makeBattle(['tekken'], ['magyu', 'kenro']);
    const escape: Action = {
      kind: 'move',
      slotIndex: 1,
      selection: { side: 'p2', partyIndex: 1 },
    };
    const { events } = resolveTurn(state, { p1: move(1), p2: escape });

    expect(dealtToP2(events)).toBe(20); // 互角のまま、加算なし
  });

  it('死に出しによる交代でも発動しない', () => {
    const state = makeBattle(['tekken'], ['issen', 'kenro']);
    setHp(state, 'p2', 0, 5); // 一閃を落として死に出しさせる

    const turn1 = resolveTurn(state, { p1: move(1), p2: move(0) });
    const replaced = resolveReplacements(turn1.state, { p2: 1 });

    const turn2 = resolveTurn(replaced.state, { p1: move(1), p2: move(0) });
    expect(dealtToP2(turn2.events)).toBe(20); // 互角の堅牢に素の威力
  });
});
