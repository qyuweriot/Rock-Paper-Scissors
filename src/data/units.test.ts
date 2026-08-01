import { describe, expect, it } from 'vitest';
import { getUsableSlotIndices, UNIT_IDS, UNIT_LIST, UNITS, type UnitId } from './units';
import { HP_MAX, HP_MIN, SLOT_COUNT, SPEED_VALUE } from '../engine/constants';
import type { Attribute, Speed, UnitDef } from '../engine/types';

/**
 * SPEC §9 の表を**改めて独立に転記**したもの。
 * units.ts とは別経路で書き写すことで、転記ミスを検出する装置として機能させる。
 * 片方を直したらもう片方も直すこと。
 */
const SPEC_TABLE: [id: string, name: string, attribute: Attribute, hp: number, speed: Speed][] = [
  // グー
  ['funsai', '粉砕', 'gu', 60, 'slow'],
  ['tekken', '鉄拳', 'gu', 50, 'mid'],
  ['magyu', '魔球', 'gu', 100, 'mid'],
  ['kenro', '堅牢', 'gu', 140, 'slow'],
  ['ishi', '石', 'gu', 100, 'mid'],
  // チョキ
  ['kamakiri', 'カマキリ', 'choki', 120, 'fast'],
  ['yamaarashi', '山嵐', 'choki', 90, 'mid'],
  ['bara', 'バラ', 'choki', 80, 'mid'],
  ['issen', '一閃', 'choki', 40, 'fast'],
  ['hasami', 'はさみ', 'choki', 100, 'fast'],
  // パー
  ['tenohira', '手のひら', 'pa', 100, 'mid'],
  ['ghost', 'ゴースト', 'pa', 60, 'fast'],
  ['utsuwa', '器', 'pa', 130, 'mid'],
  ['uchiwa', '団扇', 'pa', 90, 'slow'],
  ['kami', '紙', 'pa', 100, 'mid'],
];

describe('SPEC §9 との突き合わせ', () => {
  it('SPEC の表と同じ15種が定義されている', () => {
    expect(UNIT_IDS).toEqual(SPEC_TABLE.map(([id]) => id));
  });

  it.each(SPEC_TABLE)(
    '%s (%s) のステータスが SPEC と一致する',
    (id, name, attribute, hp, speed) => {
      const unit: UnitDef = UNITS[id as UnitId];
      expect(unit.name).toBe(name);
      expect(unit.attribute).toBe(attribute);
      expect(unit.maxHp).toBe(hp);
      expect(unit.speed).toBe(speed);
    },
  );
});

describe('ユニットデータの整合性 (PLAN §164)', () => {
  it('全15種である (SPEC §1)', () => {
    expect(UNIT_LIST).toHaveLength(15);
  });

  it('属性ごとに5体ずつで三竦みが均等 (SPEC §9)', () => {
    const counts = { gu: 0, choki: 0, pa: 0 };
    for (const unit of UNIT_LIST) counts[unit.attribute] += 1;
    expect(counts).toEqual({ gu: 5, choki: 5, pa: 5 });
  });

  it.each(UNIT_LIST)('$name の HP が $maxHp で 40〜140 に収まる (SPEC §3)', (unit) => {
    expect(unit.maxHp).toBeGreaterThanOrEqual(HP_MIN);
    expect(unit.maxHp).toBeLessThanOrEqual(HP_MAX);
  });

  it.each(UNIT_LIST)('$name の技枠がちょうど2つ (SPEC §3)', (unit) => {
    expect(unit.slots).toHaveLength(SLOT_COUNT);
  });

  it.each(UNIT_LIST)('$name は選択可能な技を最低1つ持つ (SPEC §5.1)', (unit) => {
    // 両枠とも特性のユニットがいると、その個体は行動を選べなくなる
    expect(getUsableSlotIndices(unit).length).toBeGreaterThanOrEqual(1);
  });

  it('id がキーと一致する', () => {
    for (const [key, unit] of Object.entries(UNITS)) {
      expect(unit.id).toBe(key);
    }
  });

  it('名前が重複しない', () => {
    const names = UNIT_LIST.map((u) => u.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('速度がすべて内部値に変換できる (PLAN §163)', () => {
    for (const unit of UNIT_LIST) {
      expect(SPEED_VALUE[unit.speed]).toBeGreaterThanOrEqual(1);
      expect(SPEED_VALUE[unit.speed]).toBeLessThanOrEqual(3);
    }
  });

  it('威力・反動・固定ダメージが負でない', () => {
    for (const unit of UNIT_LIST) {
      for (const slot of unit.slots) {
        if (slot.kind !== 'move') continue;
        const { damage, recoil } = slot.move;
        if (damage.kind === 'normal') expect(damage.power).toBeGreaterThanOrEqual(0);
        if (damage.kind === 'fixed') expect(damage.amount).toBeGreaterThanOrEqual(0);
        if (recoil !== undefined) expect(recoil).toBeGreaterThan(0);
      }
    }
  });

  it('すべての技・特性に効果テキストがある (PLAN §296)', () => {
    for (const unit of UNIT_LIST) {
      for (const slot of unit.slots) {
        const entry = slot.kind === 'move' ? slot.move : slot.ability;
        expect(entry.name.length).toBeGreaterThan(0);
        expect(entry.text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('個別仕様の反映 (SPEC §10)', () => {
  it('先制技は鉄拳の枠1と紙の枠2だけ (SPEC §9)', () => {
    const firstMoves: string[] = [];
    for (const unit of UNIT_LIST) {
      unit.slots.forEach((slot, index) => {
        if (slot.kind === 'move' && slot.move.priority === 'first') {
          firstMoves.push(`${unit.id}:${String(index)}`);
        }
      });
    }
    expect(firstMoves.sort()).toEqual(['kami:1', 'tekken:0']);
  });

  it('反動を持つのは粉砕30 / 石15 / ゴースト5 だけ (SPEC §4.2)', () => {
    const recoils: [string, number][] = [];
    for (const unit of UNIT_LIST) {
      for (const slot of unit.slots) {
        if (slot.kind === 'move' && slot.move.recoil !== undefined) {
          recoils.push([unit.id, slot.move.recoil]);
        }
      }
    }
    expect(recoils.sort()).toEqual([
      ['funsai', 30],
      ['ghost', 5],
      ['ishi', 15],
    ]);
  });

  it('選択を要する技は器(控え回復)と魔球(自己交代)だけ (SPEC §10.13 / §10.3)', () => {
    expect(getUsableSlotIndices(UNITS.utsuwa)).toContain(1);
    const utsuwaSlot = UNITS.utsuwa.slots[1];
    const magyuSlot = UNITS.magyu.slots[1];
    expect(utsuwaSlot.kind === 'move' && utsuwaSlot.move.selection).toBe('benchAlly');
    expect(magyuSlot.kind === 'move' && magyuSlot.move.selection).toBe('switchTarget');

    const withSelection = UNIT_LIST.filter((u) =>
      u.slots.some((s) => s.kind === 'move' && s.move.selection !== undefined),
    ).map((u) => u.id);
    expect(withSelection.sort()).toEqual(['magyu', 'utsuwa']);
  });

  it('特性を持つ5種は選択できる技が1つだけになる (SPEC §3)', () => {
    const withAbility = UNIT_LIST.filter((u) => u.slots.some((s) => s.kind === 'ability'));
    expect(withAbility.map((u) => u.id).sort()).toEqual([
      'funsai',
      'ghost',
      'kamakiri',
      'kenro',
      'yamaarashi',
    ]);
    for (const unit of withAbility) {
      expect(getUsableSlotIndices(unit)).toHaveLength(1);
    }
  });

  it('ダメージを与えない技はバラ両技・一閃技2・手のひら技2・器技2・団扇技2', () => {
    const noDamage: string[] = [];
    for (const unit of UNIT_LIST) {
      unit.slots.forEach((slot, index) => {
        if (slot.kind === 'move' && slot.move.damage.kind === 'none') {
          noDamage.push(`${unit.id}:${String(index)}`);
        }
      });
    }
    expect(noDamage.sort()).toEqual([
      'bara:0',
      'bara:1',
      'issen:1',
      'tenohira:1',
      'uchiwa:1',
      'utsuwa:1',
    ]);
  });

  it('使用回数制限を持つのは手のひらの技2だけ (SPEC §10.11)', () => {
    const limited: string[] = [];
    for (const unit of UNIT_LIST) {
      unit.slots.forEach((slot, index) => {
        if (slot.kind === 'move' && slot.move.maxUses !== undefined) {
          limited.push(`${unit.id}:${String(index)}`);
        }
      });
    }
    expect(limited).toEqual(['tenohira:1']);
  });

  it('全ての技に使用回数制限を持つユニットはいない(行動不能になるため)', () => {
    for (const unit of UNIT_LIST) {
      const moves = unit.slots.filter((s) => s.kind === 'move');
      const unlimited = moves.filter((s) => s.kind === 'move' && s.move.maxUses === undefined);
      expect(unlimited.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('固定ダメージ技は手のひらの技1だけ (SPEC §4.2)', () => {
    const fixed: string[] = [];
    for (const unit of UNIT_LIST) {
      unit.slots.forEach((slot, index) => {
        if (slot.kind === 'move' && slot.move.damage.kind === 'fixed') {
          fixed.push(`${unit.id}:${String(index)}`);
        }
      });
    }
    expect(fixed).toEqual(['tenohira:0']);
  });
});

/**
 * `previewPower` は UI が「いまの威力」を出すための表示専用の宣言。
 * **解決に使う `onModifyPower` と規則がズレたら、画面の数値が嘘になる。**
 * 両者が同じ結果を返すことをここで固定する。
 */
describe('previewPower — 解決と表示で規則が一致する', () => {
  /** api を呼ばないことが前提。呼んだら即座に落として気づけるようにする */
  const forbiddenApi = new Proxy(
    {},
    {
      get(_target, key) {
        throw new Error(`previewPower の検証中に api.${String(key)} が呼ばれました`);
      },
    },
  ) as never;

  it('宣言しているのは累積で威力が決まる技だけ (魔球・カマキリ)', () => {
    const declared: string[] = [];
    for (const unit of UNIT_LIST) {
      unit.slots.forEach((slot, index) => {
        if (slot.kind === 'move' && slot.move.hooks?.previewPower) {
          declared.push(`${unit.id}:${String(index)}`);
        }
      });
    }
    // 鉄拳の追い討ちは相手の宣言に依存するので宣言できない (SPEC §10.2)
    expect(declared.sort()).toEqual(['kamakiri:0', 'magyu:0']);
  });

  it('使用回数 0〜5 で onModifyPower と同じ値になる', () => {
    for (const unit of UNIT_LIST) {
      unit.slots.forEach((slot, index) => {
        if (slot.kind !== 'move') return;
        const { previewPower, onModifyPower } = slot.move.hooks ?? {};
        if (!previewPower || !onModifyPower) return;
        if (slot.move.damage.kind !== 'normal') return;

        const base = slot.move.damage.power;
        for (let useCount = 0; useCount <= 5; useCount++) {
          expect(previewPower(base, useCount)).toBe(
            onModifyPower({
              api: forbiddenApi,
              self: { side: 'p1', partyIndex: 0 },
              target: { side: 'p2', partyIndex: 0 },
              slotIndex: index as 0 | 1,
              power: base,
              useCount,
              targetDeclaredSwitch: false,
            }),
          );
        }
      });
    }
  });
});
