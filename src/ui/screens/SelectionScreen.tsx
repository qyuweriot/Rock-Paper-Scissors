/**
 * 選出 (PLAN §283)。自分の5体から TEAM_SIZE 体を選ぶ (SPEC §1)。
 *
 * **左が p1、右が p2 で固定**する。バトル画面と同じ並びにして、
 * 席が移っても配置が動かないようにする。
 *
 * 相手側の列は5体を並べるだけで、**どの3体を選んだかは出さない** ─
 * パーティーは相互公開されるが (SPEC §1)、選出の内容は秘匿対象 (SPEC §11)。
 */

import { useState } from 'react';
import type { UnitId } from '../../data/units';
import { TEAM_SIZE } from '../../engine/constants';
import type { Side } from '../../engine/types';
import { UnitCard } from '../components/UnitCard';
import { UnitDetail } from '../components/UnitDetail';

/** 左から右への並び。バトル画面の BattleStage と揃える */
const ORDER: readonly Side[] = ['p1', 'p2'];

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
  const [detail, setDetail] = useState<UnitId | null>(null);

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
  const partyOf = (target: Side) => (target === side ? own : opponent);

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

      <div className="select-stage">
        {ORDER.map((column, order) => {
          const mine = column === side;
          return (
            <section
              key={column}
              className={`select-column select-column--${order === 0 ? 'left' : 'right'} ${
                mine ? 'is-active' : ''
              }`}
            >
              <h3>
                {labels[column]}
                {mine && <em className="select-column__you">あなた</em>}
              </h3>

              <div className="unit-grid unit-grid--column">
                {partyOf(column).map((id) => {
                  // 相手の列は読むだけ。押すと詳細が開く。
                  // 専用の公開画面をなくしたので、ここで技・特性まで並べる
                  if (!mine) {
                    return <UnitCard key={id} unitId={id} onClick={() => setDetail(id)} />;
                  }
                  const pick = team.indexOf(id);
                  return (
                    <div key={id} className="select-slot">
                      {pick >= 0 && <span className="select-slot__order">{pick + 1}</span>}
                      <UnitCard
                        unitId={id}
                        selected={pick >= 0}
                        disabled={pick < 0 && full}
                        onClick={() => toggle(id)}
                      />
                    </div>
                  );
                })}
              </div>

              {!mine && <p className="select-column__note">カードを押すと大きく読めます</p>}
            </section>
          );
        })}
      </div>

      {detail && <UnitDetail unitId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
