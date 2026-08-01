/**
 * 控えユニットの詳細。カードを覆いとして重ねるだけ。
 *
 * 中身は既存の [UnitCard] をそのまま使う ─ 場のユニットと同じ情報が同じ形で読める。
 *
 * **秘匿の判定はここでしない。** 呼び出し側が `isUnitVisible` (SPEC §11) を通ってから
 * 開く。判定を2か所に置くと片方だけ直して漏れる。
 */

import type { UnitId } from '../../data/units';
import type { UnitState } from '../../engine/types';
import { UnitCard } from './UnitCard';

interface Props {
  unitId: UnitId;
  /** 対戦中のみ。選出画面では省く */
  state?: UnitState;
  onClose: () => void;
}

export function UnitDetail({ unitId, state, onClose }: Props) {
  return (
    <div className="detail">
      {/* 背景のどこを押しても閉じる */}
      <button type="button" className="detail__backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="detail__panel" role="dialog" aria-modal="true">
        <UnitCard unitId={unitId} state={state} />
        <button type="button" className="btn btn--ghost detail__close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
