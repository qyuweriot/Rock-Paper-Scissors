/**
 * 編成5体の一覧を覆いとして重ねる。
 *
 * 盤面に出ているのは**選出した3体**だけなので、対戦が進むと
 * 「相手は何を持っていたか」を思い出せなくなる。パーティー5体は
 * 選出前に相互公開される情報 (SPEC §1) なので、いつでも見返せてよい。
 *
 * **どの3体を選出したかは出さない。** 選出の内容は秘匿対象 (SPEC §11) で、
 * 印を付けると場に出ていない2体が絞り込めてしまう。
 * `UnitState` を渡さず素のカードを並べることで、HPも状態も出ないようにしてある ─
 * 呼び出し側が state を渡せない形にして、構造的に守る。
 */

import type { UnitId } from '../../data/units';
import { sortForDisplay } from '../order';
import { UnitCard } from './UnitCard';

interface Props {
  /** 見出しに出す陣営の名前 */
  label: string;
  /** 編成5体。選出3体ではない */
  party: UnitId[];
  onClose: () => void;
}

export function PartyDetail({ label, party, onClose }: Props) {
  return (
    <div className="detail">
      {/* 背景のどこを押しても閉じる */}
      <button type="button" className="detail__backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="detail__panel detail__panel--party" role="dialog" aria-modal="true">
        <h3 className="detail__title">{label} の編成</h3>
        <p className="detail__note">選出した3体は伏せられています</p>
        <div className="unit-grid unit-grid--column">
          {sortForDisplay(party).map((id) => (
            <UnitCard key={id} unitId={id} />
          ))}
        </div>
        <button type="button" className="btn btn--ghost detail__close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
