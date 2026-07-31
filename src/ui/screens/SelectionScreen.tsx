/**
 * 選出 (PLAN §283)。自分の5体から TEAM_SIZE 体を選ぶ (SPEC §1)。
 * 相手のパーティー5体を並べて見ながら選べるようにする。
 */

import { useState } from 'react';
import type { UnitId } from '../../data/units';
import { TEAM_SIZE } from '../../engine/constants';
import type { Side } from '../../engine/types';
import { UnitCard } from '../components/UnitCard';

interface Props {
  side: Side;
  own: UnitId[];
  opponent: UnitId[];
  labels: Record<Side, string>;
  showSide: boolean;
  onSubmit: (team: UnitId[]) => void;
}

export function SelectionScreen({ side, own, opponent, labels, showSide, onSubmit }: Props) {
  const [team, setTeam] = useState<UnitId[]>([]);

  const toggle = (id: UnitId) => {
    setTeam((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length < TEAM_SIZE
          ? [...current, id]
          : current,
    );
  };

  const full = team.length === TEAM_SIZE;
  const opponentSide: Side = side === 'p1' ? 'p2' : 'p1';

  return (
    <div className="screen screen--select">
      <header className="screen__head">
        <h2>{showSide ? `${labels[side]} の選出` : '選出'}</h2>
        <p className="screen__sub">
          {TEAM_SIZE} 体を選んでください({team.length} / {TEAM_SIZE})。
          先頭に選んだユニットが最初に場に出ます。
        </p>
        <div className="screen__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setTeam([])}>
            クリア
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!full}
            onClick={() => onSubmit(team)}
          >
            決定
          </button>
        </div>
      </header>

      <section className="select-block">
        <h3>{labels[opponentSide]} の編成</h3>
        <div className="unit-grid unit-grid--compact">
          {opponent.map((id) => (
            <UnitCard key={id} unitId={id} compact />
          ))}
        </div>
      </section>

      <section className="select-block">
        <h3>自分の編成</h3>
        <div className="unit-grid">
          {own.map((id) => {
            const order = team.indexOf(id);
            return (
              <div key={id} className="select-slot">
                {order >= 0 && <span className="select-slot__order">{order + 1}</span>}
                <UnitCard
                  unitId={id}
                  selected={order >= 0}
                  disabled={order < 0 && full}
                  onClick={() => toggle(id)}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
