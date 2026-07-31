import { describe, expect, it } from 'vitest';
import { draftParty, draftTeam } from './draft';
import { PARTY_SIZE, TEAM_SIZE } from '../engine/constants';
import { getUnit, UNIT_IDS, type UnitId } from '../data/units';

describe('draftParty — AIの編成 (SPEC §1)', () => {
  it('PARTY_SIZE 体を選ぶ', () => {
    expect(draftParty(0).party).toHaveLength(PARTY_SIZE);
  });

  it('同じユニットを重複して選ばない', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { party } = draftParty(seed);
      expect(new Set(party).size).toBe(PARTY_SIZE);
    }
  });

  it('選ぶのは実在する15種のみ', () => {
    for (const id of draftParty(7).party) expect(UNIT_IDS).toContain(id);
  });

  it('同じシードなら同じ編成になる (PLAN §3.4)', () => {
    expect(draftParty(42)).toEqual(draftParty(42));
  });

  it('シードが違えば編成も変わる', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) seen.add(draftParty(seed).party.join(','));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('シードを進めて返すので、続けて引くと別の編成になる', () => {
    const first = draftParty(0);
    const second = draftParty(first.seed);
    expect(second.party).not.toEqual(first.party);
  });

  it('特定のユニットに偏らない。十分な回数でほぼ全種が現れる', () => {
    const seen = new Set<UnitId>();
    for (let seed = 0; seed < 200; seed++) {
      for (const id of draftParty(seed).party) seen.add(id);
    }
    expect(seen.size).toBe(UNIT_IDS.length);
  });
});

describe('draftTeam — AIの選出 (SPEC §1)', () => {
  it('TEAM_SIZE 体を選ぶ', () => {
    const own: UnitId[] = ['ishi', 'kenro', 'kami', 'bara', 'issen'];
    expect(draftTeam(own, ['hasami', 'issen', 'bara', 'yamaarashi', 'hasamimushi'])).toHaveLength(
      TEAM_SIZE,
    );
  });

  it('選出はすべて自分のパーティーの中から選ぶ', () => {
    const own: UnitId[] = ['ishi', 'kenro', 'kami', 'bara', 'issen'];
    for (const id of draftTeam(own, ['hasami', 'ghost', 'utsuwa', 'uchiwa', 'kami'])) {
      expect(own).toContain(id);
    }
  });

  it('相手がチョキ揃いなら、有利なグーを優先する', () => {
    // 自分: グー2体 + パー3体 / 相手: チョキ5体。グー > チョキ なのでグーが選ばれる
    const own: UnitId[] = ['ishi', 'kenro', 'kami', 'utsuwa', 'uchiwa'];
    const opponent: UnitId[] = ['hasami', 'issen', 'bara', 'yamaarashi', 'hasamimushi'];

    const team = draftTeam(own, opponent);
    expect(team).toContain('ishi');
    expect(team).toContain('kenro');
  });

  it('相手がパー揃いなら、有利なチョキを優先する', () => {
    const own: UnitId[] = ['hasami', 'issen', 'ishi', 'kenro', 'magyu'];
    const opponent: UnitId[] = ['kami', 'ghost', 'utsuwa', 'uchiwa', 'tenohira'];

    const team = draftTeam(own, opponent);
    expect(team).toContain('hasami');
    expect(team).toContain('issen');
  });

  it('相性が同点ならHPの高い方を優先する', () => {
    // 全員グーなので相性は横並び。HP順は 堅牢140 > 石100 > 魔球100 …
    const own: UnitId[] = ['tekken', 'funsai', 'kenro', 'ishi', 'magyu'];
    const team = draftTeam(own, ['ishi', 'kenro', 'magyu', 'tekken', 'funsai']);

    expect(team[0]).toBe('kenro'); // HP140 が先頭
    const hps = team.map((id) => getUnit(id).maxHp);
    expect([...hps].sort((a, b) => b - a)).toEqual(hps); // HPの降順
  });

  it('決定論的。同じ入力からは同じ選出', () => {
    const own: UnitId[] = ['ishi', 'kenro', 'kami', 'bara', 'issen'];
    const opponent: UnitId[] = ['hasami', 'ghost', 'utsuwa', 'uchiwa', 'kami'];
    expect(draftTeam(own, opponent)).toEqual(draftTeam(own, opponent));
  });

  it('入力のパーティーを書き換えない', () => {
    const own: UnitId[] = ['ishi', 'kenro', 'kami', 'bara', 'issen'];
    const before = [...own];
    draftTeam(own, ['hasami', 'ghost', 'utsuwa', 'uchiwa', 'kami']);
    expect(own).toEqual(before);
  });

  it('編成と選出をつないでも破綻しない', () => {
    for (let seed = 0; seed < 30; seed++) {
      const a = draftParty(seed);
      const b = draftParty(a.seed);
      const team = draftTeam(a.party, b.party);

      expect(team).toHaveLength(TEAM_SIZE);
      expect(new Set(team).size).toBe(TEAM_SIZE);
    }
  });
});
