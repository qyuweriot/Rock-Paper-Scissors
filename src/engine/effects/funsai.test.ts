import { describe, expect, it } from 'vitest';
import { resolveReplacements, resolveTurn } from '../battle';
import { funsaiFortitude } from './funsai';
import { active, eventsOfType, inert, INERT, makeBattle, move, setHp } from '../testkit';
import { getMove, UNITS } from '../../data/units';

/** 反動量はデータ側の値を採る。調整したときにこのファイルが追随する */
const RECOIL = getMove(UNITS.funsai, 0).recoil ?? 0;

/**
 * 粉砕 gu HP60 遅 / 技0 威力60 + 自分に固定30の反動 / 特性「不撓」(SPEC §10.1)
 *
 * PLAN §218-225 が必須と定める処理順のケースをここで固定する。
 * 撃破判定を反動の前後どちらに置くかで「常に自滅」か「常に無傷」に倒れるため、
 * これらが同時に通ることが正しさの証拠になる。
 */
describe('粉砕 — 不撓 (SPEC §10.1)', () => {
  it('撃破成功 → 反動を受けない', () => {
    // バラ choki HP80。グー→チョキ は有利 (60+25=85) なので一撃で落ちる。
    // バラの技2(棘撒き)は p1 側に設置を置くだけで、このターンは何も起こさない
    const state = makeBattle(['funsai'], ['bara']);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(1) });

    expect(eventsOfType(events, 'faint')).toHaveLength(1);
    expect(eventsOfType(events, 'faint')[0]?.target.side).toBe('p2');
    expect(active(after, 'p1').fainted).toBe(false);
    expect(active(after, 'p1').hp).toBe(60);
    // 反動そのものが発生していない。0ダメージのイベントすら出ない
    expect(eventsOfType(events, 'damage').filter((d) => d.source === 'recoil')).toHaveLength(0);
  });

  it('撃破失敗 → 反動を受けるが、1回なら耐える', () => {
    // 器 pa HP130 は不利対面 (60−10=50) なので落とせない。
    // 控えがいないので器の技2は空振りし、粉砕は反動以外のダメージを受けない
    const state = makeBattle(['funsai'], [INERT]);

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: inert() });

    const recoils = eventsOfType(events, 'damage').filter((d) => d.source === 'recoil');
    expect(recoils).toHaveLength(1);
    expect(recoils[0]?.amount).toBe(RECOIL);
    expect(active(after, 'p1').fainted).toBe(false);
    expect(active(after, 'p1').hp).toBe(UNITS.funsai.maxHp - RECOIL);
  });

  it('撃破失敗が2回続く → 反動で自滅する', () => {
    let state = makeBattle(['funsai'], [INERT]);

    state = resolveTurn(state, { p1: move(0), p2: inert() }).state;
    expect(active(state, 'p1').hp).toBe(UNITS.funsai.maxHp - RECOIL);

    const { state: after } = resolveTurn(state, { p1: move(0), p2: inert() });

    expect(after.sides.p1.party[0]?.fainted).toBe(true);
    expect(after.phase).toEqual({ kind: 'ended', result: 'p2' });
  });

  it('同段で相手の攻撃も受け、かつ撃破成功 → 反動は無効だが被弾分は残る', () => {
    // 堅牢 gu HP140 遅。粉砕と同じ「遅」なので同段になる
    const state = makeBattle(['funsai'], ['kenro']);
    setHp(state, 'p2', 0, 60); // 互角の60 でちょうど落ちる

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(active(after, 'p2').fainted).toBe(true);
    expect(active(after, 'p1').fainted).toBe(false);
    // 堅牢の重打15 は受けている。反動は受けていない
    expect(active(after, 'p1').hp).toBe(45);
    expect(eventsOfType(events, 'damage').filter((d) => d.source === 'recoil')).toHaveLength(0);
  });

  it('相手がカマキリでも反動無効は効く。回復ではないため治癒封じで止まらない (SPEC §10.6)', () => {
    const state = makeBattle(['funsai'], ['kamakiri']);
    setHp(state, 'p2', 0, 85); // 有利対面の85 でちょうど落ちる

    const { state: after, events } = resolveTurn(state, { p1: move(0), p2: move(0) });

    expect(after.sides.p2.party[0]?.fainted).toBe(true);
    expect(after.sides.p1.party[0]?.fainted).toBe(false);
    // カマキリの連撃5(不利補正)だけを受けている
    expect(active(after, 'p1').hp).toBe(55);
    // 回復の仕組みを通っていないので、封じられる余地がない
    expect(eventsOfType(events, 'healBlocked')).toHaveLength(0);
    expect(eventsOfType(events, 'heal')).toHaveLength(0);
  });

  it('ミラーは相打ちの引き分けになる。永久に決着しない状態は生じない', () => {
    // 互角で威力60。HP60 をちょうど削りきるので双方が同時に倒れる
    const { state: after, events } = resolveTurn(makeBattle(['funsai'], ['funsai']), {
      p1: move(0),
      p2: move(0),
    });

    expect(eventsOfType(events, 'faint')).toHaveLength(2);
    expect(after.phase).toEqual({ kind: 'ended', result: 'draw' });
  });

  it('有利対面で倒し続ける限り無傷で殴り続けられる (SPEC §10.1 の帰結)', () => {
    // チョキ3体。相手はいずれもダメージを出さない技2を使う
    const state0 = makeBattle(['funsai'], ['issen', 'bara', 'hasami']);
    // はさみの技2は守勢+10 を張るので、粉砕の一撃は 85 ではなく 75 になる
    setHp(state0, 'p2', 2, 70);

    let state = state0;
    for (let i = 0; i < 3; i++) {
      state = resolveTurn(state, { p1: move(0), p2: move(1) }).state;
      if (state.phase.kind !== 'awaitingReplacement') break;
      state = resolveReplacements(state, { p2: i + 1 }).state;
    }

    expect(state.phase).toEqual({ kind: 'ended', result: 'p1' });
    expect(state.sides.p1.party[0]?.hp).toBe(60); // 一度も削られていない
  });

  /**
   * 「倒した」は**自分の攻撃で**倒した場合を指す (SPEC §10.1)。
   *
   * 現在のデータでは、粉砕と同段(遅)に反動持ちが他にいないため
   * 「相手が自分の反動で自滅した」状況を盤面から作れない。
   * ルール自体はフックの水準で固定しておく。
   */
  describe('反動無効の条件', () => {
    const call = (recoil: number, killed: boolean): number => {
      const onModifyRecoil = funsaiFortitude.onModifyRecoil;
      if (!onModifyRecoil) throw new Error('onModifyRecoil が定義されていません');
      return onModifyRecoil({
        api: null as never,
        self: { side: 'p1', partyIndex: 0 },
        victim: { side: 'p2', partyIndex: 0 },
        recoil,
        killed,
      });
    };

    it('倒したなら反動は0になる', () => {
      expect(call(35, true)).toBe(0);
    });

    it('倒していなければ反動はそのまま', () => {
      expect(call(35, false)).toBe(35);
    });
  });
});
