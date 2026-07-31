/** HPバー。数値も併記する(バーだけだと残量が読み取れない) */

interface Props {
  hp: number;
  maxHp: number;
}

export function HpBar({ hp, maxHp }: Props) {
  const ratio = maxHp > 0 ? Math.max(0, hp) / maxHp : 0;
  // 残量で色を変える。しきい値は見た目だけの話なのでゲーム定数には出さない
  const level = ratio > 0.5 ? 'high' : ratio > 0.2 ? 'mid' : 'low';

  return (
    <div className="hp">
      <div className="hp__track">
        <div className={`hp__fill hp__fill--${level}`} style={{ width: `${String(ratio * 100)}%` }} />
      </div>
      <span className="hp__text">
        {Math.max(0, hp)} / {maxHp}
      </span>
    </div>
  );
}
