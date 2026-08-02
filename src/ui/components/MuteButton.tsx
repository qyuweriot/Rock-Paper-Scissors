/**
 * 効果音の入切。**どの画面にも常に出す**ので、位置は画面の右上に固定する。
 *
 * 設定は localStorage に残る (→ audio/index.ts)。音の出せない場に居合わせた人が
 * 毎回押し直さずに済むようにするための機能なので、消し忘れても困らないこと自体が要件。
 */

interface Props {
  muted: boolean;
  onToggle: () => void;
}

export function MuteButton({ muted, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`mute-button ${muted ? 'is-muted' : ''}`}
      onClick={onToggle}
      // 押した瞬間の状態で鳴らすと、消音にした直後にだけ音が出る。専用の音を持たせない
      data-se="none"
      aria-pressed={muted}
      title={muted ? '効果音を鳴らす' : '効果音を消す'}
    >
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      <span className="visually-hidden">{muted ? '効果音を鳴らす' : '効果音を消す'}</span>
    </button>
  );
}
