import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { WEIGHT_ATK_MOD, WEIGHT_FAINT, WEIGHT_HAZARD, WEIGHT_POISON } from './constants';
import { makeBattle, setHazard, setHp, setPoison, unit } from '../engine/testkit';

/** 評価関数 (PLAN §268 の「貪欲」の中身) */
describe('evaluate — 盤面の採点', () => {
  it('互角な盤面は0点', () => {
    const state = makeBattle(['ishi'], ['ishi']);
    expect(evaluate(state, 'p1')).toBe(0);
    expect(evaluate(state, 'p2')).toBe(0);
  });

  it('自陣と敵陣で符号が反転する', () => {
    const state = makeBattle(['ishi', 'bara'], ['kenro', 'issen']);
    setHp(state, 'p1', 0, 30);
    setPoison(state, 'p2', 1, 2);
    setHazard(state, 'p2', 1);
    expect(evaluate(state, 'p1')).toBeCloseTo(-evaluate(state, 'p2'));
  });

  it('自分のHPが減ると下がり、相手のHPが減ると上がる', () => {
    const base = makeBattle(['ishi'], ['ishi']);

    const mine = makeBattle(['ishi'], ['ishi']);
    setHp(mine, 'p1', 0, 5);
    expect(evaluate(mine, 'p1')).toBeLessThan(evaluate(base, 'p1'));

    const theirs = makeBattle(['ishi'], ['ishi']);
    setHp(theirs, 'p2', 0, 5);
    expect(evaluate(theirs, 'p1')).toBeGreaterThan(evaluate(base, 'p1'));
  });

  it('HPは最大値に対する割合で測る。HPの絶対値が違っても満タンなら互角', () => {
    // 堅牢140 vs 一閃40。どちらも満タンなら0点
    const state = makeBattle(['kenro'], ['issen']);
    expect(evaluate(state, 'p1')).toBe(0);
  });

  it('瀕死は WEIGHT_FAINT ぶん上乗せで効く', () => {
    const alive = makeBattle(['ishi', 'bara'], ['ishi']);
    setHp(alive, 'p1', 1, 0);

    const dead = makeBattle(['ishi', 'bara'], ['ishi']);
    setHp(dead, 'p1', 1, 0);
    unit(dead, 'p1', 1).fainted = true;

    expect(evaluate(alive, 'p1') - evaluate(dead, 'p1')).toBeCloseTo(WEIGHT_FAINT);
  });

  it('相手に毒が乗っていれば加点される', () => {
    const base = makeBattle(['ishi'], ['ishi']);
    const poisoned = makeBattle(['ishi'], ['ishi']);
    setPoison(poisoned, 'p2', 0, 2);

    expect(evaluate(poisoned, 'p1') - evaluate(base, 'p1')).toBeCloseTo(WEIGHT_POISON * 2);
  });

  it('控えの毒も数える。交代しても維持されるため (SPEC §7.1)', () => {
    const base = makeBattle(['ishi', 'bara'], ['ishi', 'bara']);
    const poisoned = makeBattle(['ishi', 'bara'], ['ishi', 'bara']);
    setPoison(poisoned, 'p2', 1, 1); // 控えのバラに毒

    expect(evaluate(poisoned, 'p1') - evaluate(base, 'p1')).toBeCloseTo(WEIGHT_POISON);
  });

  it('相手側の場に設置があれば加点される', () => {
    const base = makeBattle(['ishi'], ['ishi']);
    const hazarded = makeBattle(['ishi'], ['ishi']);
    setHazard(hazarded, 'p2', 2);

    expect(evaluate(hazarded, 'p1') - evaluate(base, 'p1')).toBeCloseTo(WEIGHT_HAZARD * 2);
  });

  it('場のユニットの攻勢修正が加点される', () => {
    const base = makeBattle(['issen'], ['ishi']);
    const stacked = makeBattle(['issen'], ['ishi']);
    unit(stacked, 'p1', 0).modifiers.atk = 20;

    expect(evaluate(stacked, 'p1') - evaluate(base, 'p1')).toBeCloseTo(WEIGHT_ATK_MOD * 20);
  });

  it('控えの積みは数えない。交代でリセットされるため (SPEC §4.3)', () => {
    const state = makeBattle(['ishi', 'issen'], ['ishi', 'issen']);
    unit(state, 'p1', 1).modifiers.atk = 20; // 控えの一閃
    expect(evaluate(state, 'p1')).toBe(0);
  });

  it('生存数の差がそのまま点差になる。片方が1体多ければ WEIGHT_HP + WEIGHT_FAINT', () => {
    const state = makeBattle(['ishi', 'bara'], ['ishi', 'bara']);
    setHp(state, 'p2', 1, 0);
    unit(state, 'p2', 1).fainted = true;

    expect(evaluate(state, 'p1')).toBeCloseTo(1 + WEIGHT_FAINT);
  });
});
