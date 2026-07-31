import { describe, expect, it } from 'vitest';
import { resolveReplacements, resolveTurn } from '../battle';
import { active, eventsOfType, makeBattle, move, setHp } from '../testkit';

/**
 * 粉砕 gu HP50 遅 / 技0 威力45 + 自分に固定50の反動 / 特性「撃破再生」(SPEC §10.1)
 *
 * PLAN §218-225 が必須と定める4ケースをここで固定する。
 * 処理順を間違えると「常に自滅」か「常に生存」のどちらかに倒れるため、
 * 4つが同時に通ることが正しさの証拠になる。
 */
describe('粉砕 — 撃破再生 (SPEC §10.1)', () => {
  it('有利対面で相手を撃破 → HP全回復して生存する', () => {
    // バラ choki HP50。グー→チョキ は有利 (45+25=70) なので一撃で落ちる。
    // バラの技1(棘撒き)は p1 側に設置を置くだけで、このターンは何も起こさない
    const state = makeBattle(['funsai'], ['bara']);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(1) });

    expect(eventsOfType(events, 'faint')).toHaveLength(1);
    expect(eventsOfType(events, 'faint')[0]?.target.side).toBe('p2');
    expect(active(after, 'p1').fainted).toBe(false);
    expect(active(after, 'p1').hp).toBe(50); // 反動50を受けたが全回復した
  });

  it('撃破できなかった → 反動50で自滅する', () => {
    // 堅牢 gu HP140。互角なので45ダメージでは落ちない
    const state = makeBattle(['funsai'], ['kenro']);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(active(after, 'p2').fainted).toBe(false);
    expect(after.sides.p1.party[0]?.fainted).toBe(true);
    // 堅牢は自分の特性で回復するので、粉砕側に回復が入っていないことを見る
    expect(eventsOfType(events, 'heal').filter((h) => h.target.side === 'p1')).toHaveLength(0);
  });

  it('同段で相手の攻撃も受け、かつ撃破成功 → 全回復により生存する', () => {
    // 団扇 pa HP80 遅。粉砕と同じ「遅」なので同段になる
    const state = makeBattle(['funsai'], ['uchiwa']);
    setHp(state, 'p2', 0, 35); // グー→パー は不利 (45−10=35) でちょうど落ちる

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    // 団扇の攻撃50(パー→グー有利)と反動50の両方を受けている
    const taken = eventsOfType(events, 'damage').filter((d) => d.target.side === 'p1');
    expect(taken.map((d) => d.source).sort()).toEqual(['move', 'recoil']);

    expect(active(after, 'p2').fainted).toBe(true);
    expect(active(after, 'p1').fainted).toBe(false);
    expect(active(after, 'p1').hp).toBe(50);
  });

  it('相手がハサミムシの場合 → 全回復が無効化され、撃破成功でも自滅する', () => {
    // ハサミムシ choki。有利対面だが HP120 なので落とせる量まで下げる
    const state = makeBattle(['funsai'], ['hasamimushi']);
    setHp(state, 'p2', 0, 50); // 70 ダメージで落ちる

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(after.sides.p2.party[0]?.fainted).toBe(true); // 撃破は成功している
    expect(after.sides.p1.party[0]?.fainted).toBe(true); // それでも自滅する
    expect(eventsOfType(events, 'healBlocked')).toHaveLength(1);
    expect(after.phase).toEqual({ kind: 'ended', result: 'draw' });
  });

  it('相手が自分の反動で自滅した場合は撃破に含めない', () => {
    // 粉砕ミラー。互角で威力45 なので HP50 を削りきれず、双方が反動50 で自滅する。
    // ここで「相手が倒れた」だけを見て全回復すると、双方が生き残って永久に決着しない
    const { state: after, events } = resolveTurn(makeBattle(['funsai'], ['funsai']), {
      p1: move(0),
      p2: move(0),
    });

    expect(eventsOfType(events, 'heal')).toHaveLength(0);
    expect(after.phase).toEqual({ kind: 'ended', result: 'draw' });
  });

  it('有利対面で倒し続ける限り無限に殴れる (SPEC §10.1 の帰結)', () => {
    // チョキ3体。いずれも 70 ダメージ (45 + 有利25) で一撃圏内
    let state = makeBattle(['funsai'], ['issen', 'bara', 'hasami']);
    // はさみは技1で守勢+10 を張るため、粉砕の一撃は 70 ではなく 60 になる
    setHp(state, 'p2', 2, 60);

    for (let i = 0; i < 3; i++) {
      state = resolveTurn(state, { p1: move(0), p2: move(1) }).state;
      if (state.phase.kind !== 'awaitingReplacement') break;
      state = resolveReplacements(state, { p2: i + 1 }).state;
    }

    // 3体を撃破しきり、粉砕は毎回全回復して満タンのまま生き残る
    expect(state.phase).toEqual({ kind: 'ended', result: 'p1' });
    expect(state.sides.p1.party[0]?.hp).toBe(50);
  });
});
