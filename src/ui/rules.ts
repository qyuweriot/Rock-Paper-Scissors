/**
 * ルール説明の中身 (SPEC §1〜§8)。
 *
 * **数値は engine/constants.ts から差し込む。文章に直に打ち込まない。**
 * 「毒は10ダメージ」と書いた翌週に POISON_DAMAGE を変えたら、画面は堂々と
 * 嘘をつき続ける。バランス調整はこれから何度もやる (Phase 7) ので必ず起きる。
 * rules.test.ts が、定数に紐付かない数字を見つけて落とす。
 *
 * **ユニット固有の数値は載せない。** 反動量も反射量もカードに常時出ている
 * (PLAN §296)。ここに書くと二重管理になり、二重に古くなる。仕組みだけを書く。
 *
 * 並びは「上から読んで途中でやめても始められる」順。
 * 最初の段だけで対戦を始められるようにしてある。
 */

import {
  DAMAGE_FLOOR,
  HAZARD_DAMAGE,
  HAZARD_MAX_STACKS,
  PARTY_SIZE,
  PERSISTENT_MODIFIER_CAP,
  POISON_DAMAGE,
  POISON_MAX_STACKS,
  SLOT_COUNT,
  TEAM_SIZE,
  TYPE_ADVANTAGE,
  TYPE_DISADVANTAGE,
} from '../engine/constants';
import { UNIT_IDS } from '../data/units';
import { TYPE_TRIANGLE } from './labels';

export interface RuleItem {
  title: string;
  lines: string[];
}

export interface RuleSection {
  heading: string;
  /** その段を読み終えた人への一言。無いこともある */
  note?: string;
  items: RuleItem[];
}

/** 符号つきで書く。相性補正は加算なので +25 / −10 と見せたい (SPEC §2) */
function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : `−${String(Math.abs(value))}`;
}

export const RULE_SECTIONS: RuleSection[] = [
  {
    heading: 'まず知ること',
    note: 'ここまで読めば対戦を始められます',
    items: [
      {
        title: '勝ち負け',
        lines: [
          `相手が選出した${String(TEAM_SIZE)}体すべてを倒せば勝ちです`,
          'おたがいの最後のユニットが同時に倒れた場合は引き分けになります',
        ],
      },
      {
        title: '全体の流れ',
        lines: [
          `全${String(UNIT_IDS.length)}種から${String(PARTY_SIZE)}体を編成します`,
          `おたがいの${String(PARTY_SIZE)}体を見せ合ってから、そこで${String(TEAM_SIZE)}体を選出します`,
          '選出したユニットを順に場へ出し、交代しながら戦います',
        ],
      },
      {
        title: '相性',
        lines: [
          `${TYPE_TRIANGLE} の三すくみです`,
          `有利なら ${signed(TYPE_ADVANTAGE)}、不利なら ${signed(TYPE_DISADVANTAGE)} をダメージに加算します`,
          '有利を取れているかどうかで、倒すのにかかる手数が大きく変わります',
        ],
      },
    ],
  },

  {
    heading: '行動と順番',
    items: [
      {
        title: '毎ターン選ぶこと',
        lines: [
          `場のユニットの技(${String(SLOT_COUNT)}枠のどちらか)を使うか、控えの生存ユニットに交代するか`,
          'おたがい同時に宣言し、宣言し終えてから解決します',
        ],
      },
      {
        title: '解決の順番',
        lines: [
          '交代 → 先制技 → 通常技(速 → 中 → 遅)の順に処理します',
          '同じ段に入った行動は同時に処理されます',
          'このため、おたがいのユニットが同時に倒れることがあります',
        ],
      },
      {
        title: '交代',
        lines: [
          '交代はどの技よりも先に処理されます',
          'ただし、交代したターンは交代先のユニットが相手の攻撃を受けます',
          '交代すると、攻勢・守勢の修正値と「使うたび」系の技の回数がリセットされます',
          '毒は交代しても消えません。ユニットごとに持ち続けます',
        ],
      },
    ],
  },

  {
    heading: 'ダメージ',
    items: [
      {
        title: '計算式',
        lines: [
          'ダメージ = 技の威力 + 相性補正 + 攻撃側の攻勢 − 防御側の守勢',
          `ダメージが負になることはありません(下限は${String(DAMAGE_FLOOR)})`,
        ],
      },
      {
        title: '固定ダメージ',
        lines: [
          '固定と書かれたダメージは、相性補正も攻勢・守勢もすべて無視します',
          '毒・設置・反動・反射、および一部の技が固定ダメージです',
          '反動は、技を使った自分自身が受けるダメージです',
        ],
      },
      {
        title: '攻勢と守勢',
        lines: [
          '技によって攻勢・守勢が上下します。ダメージにそのまま加減算されます',
          `交代まで続くものは ${signed(PERSISTENT_MODIFIER_CAP)} まで積めます。それ以上は無効です`,
          '交代または瀕死でリセットされます',
          '守勢が効くのは相手の技によるダメージだけで、固定ダメージには効きません',
        ],
      },
    ],
  },

  {
    heading: '特殊状態',
    items: [
      {
        title: '毒',
        lines: [
          `毒を受けたユニットは、ターン終了時に固定${String(POISON_DAMAGE)}ダメージを受けます`,
          `${String(POISON_MAX_STACKS)}重まで重なり、重なるほど増えます`,
          '交代しても消えず、解除する手段はありません',
        ],
      },
      {
        title: '設置',
        lines: [
          `相手側の場に置きます。相手のユニットが場に出るたび、固定${String(HAZARD_DAMAGE)}ダメージを与えます`,
          `${String(HAZARD_MAX_STACKS)}枚まで重ねられます`,
          '自分から交代したときも、倒されて次を出したときも踏みます',
          '解除する手段はありません',
        ],
      },
      {
        title: '反射',
        lines: [
          '攻撃技によるダメージを受けたときだけ、相手に返します',
          '毒・設置・反動で受けたダメージでは反射しません',
          '反射したダメージが、さらに反射を呼ぶことはありません',
        ],
      },
      {
        title: '特性',
        lines: [
          '技ではなく、場に出ているあいだ自動で働きます',
          '控えにいるあいだは一切働きません',
        ],
      },
    ],
  },
];

/** 検査と表示で共有する。文章をすべて平らに並べる */
export function allRuleLines(): string[] {
  return RULE_SECTIONS.flatMap((section) =>
    section.items.flatMap((item) => [item.title, ...item.lines]),
  );
}
