/**
 * ルール説明の覆い。**どの画面からも開ける** (右上の「?」とタイトル画面のボタン)。
 *
 * ルールは公開情報なので、対人戦の最中に開いても秘匿は破れない (SPEC §11)。
 * 盤面を覆うだけなので、背景のどこを押しても閉じられるようにしてある
 * (UnitDetail / PartyDetail と同じ作法)。
 *
 * **文章はここに書かない。** 中身は rules.ts にあり、数値は engine の定数から
 * 差し込まれる ─ ここは並べるだけ。
 */

import { RULE_SECTIONS } from '../rules';

interface Props {
  onClose: () => void;
}

export function RulesOverlay({ onClose }: Props) {
  return (
    <div className="detail">
      <button type="button" className="detail__backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="detail__panel detail__panel--rules" role="dialog" aria-modal="true">
        <h3 className="detail__title">ルール</h3>

        {RULE_SECTIONS.map((section) => (
          <section key={section.heading} className="rules-doc__section">
            <h4 className="rules-doc__heading">{section.heading}</h4>

            {section.items.map((item) => (
              <div key={item.title} className="rules-doc__item">
                <p className="rules-doc__item-title">{item.title}</p>
                <ul className="rules-doc__lines">
                  {item.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}

            {/* 「ここまでで始められる」の区切り。読み進める義務がないことを示す */}
            {section.note && <p className="rules-doc__note">{section.note}</p>}
          </section>
        ))}

        <button type="button" className="btn btn--ghost detail__close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
