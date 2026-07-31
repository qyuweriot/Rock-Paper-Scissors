/**
 * パーティー編成 (PLAN §282)。15種から PARTY_SIZE 体を選ぶ (SPEC §1)。
 *
 * 全15種のステータスと効果テキストを並べる (PLAN §296)。
 * 毎回15種を吟味させないよう「おまかせ」も置く。
 */

import { useState } from 'react';
import { UNIT_IDS, type UnitId } from '../../data/units';
import { PARTY_SIZE } from '../../engine/constants';
import { draftParty } from '../../ai/draft';
import { UnitCard } from '../components/UnitCard';
import { HOTSEAT_LABELS } from '../log';
import type { Side } from '../../engine/types';

interface Props {
  side: Side;
  /** 対人戦のときだけ「プレイヤーNの編成」と出す */
  showSide: boolean;
  onSubmit: (party: UnitId[]) => void;
}

export function PartyScreen({ side, showSide, onSubmit }: Props) {
  const [party, setParty] = useState<UnitId[]>([]);

  const toggle = (id: UnitId) => {
    setParty((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length < PARTY_SIZE
          ? [...current, id]
          : current,
    );
  };

  // Math.random() は禁止 (PLAN §3.4) なので engine/rng.ts を経由する
  const randomize = () => {
    setParty(draftParty(Date.now()).party);
  };

  const full = party.length === PARTY_SIZE;

  return (
    <div className="screen screen--party">
      <header className="screen__head">
        <h2>{showSide ? `${HOTSEAT_LABELS[side]} の編成` : 'パーティー編成'}</h2>
        <p className="screen__sub">
          15種から {PARTY_SIZE} 体を選んでください({party.length} / {PARTY_SIZE})
        </p>
        <div className="screen__actions">
          <button type="button" className="btn btn--ghost" onClick={randomize}>
            おまかせ
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setParty([])}>
            クリア
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!full}
            onClick={() => onSubmit(party)}
          >
            決定
          </button>
        </div>
      </header>

      <div className="unit-grid">
        {UNIT_IDS.map((id) => (
          <UnitCard
            key={id}
            unitId={id}
            selected={party.includes(id)}
            disabled={!party.includes(id) && full}
            onClick={() => toggle(id)}
          />
        ))}
      </div>
    </div>
  );
}
