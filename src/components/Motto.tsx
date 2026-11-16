import '../motto.css';

/** Câu nhắc của chủ app: làm hết mình, chơi hết mình. Hai vế có hai màu để thể hiện hai nửa của cuộc sống. */
export const MOTTO_WORK = 'Work hard';
export const MOTTO_PLAY = 'play hard';

type Variant = 'banner' | 'footer' | 'empty' | 'card' | 'focus';

export function Motto({ variant }: { variant: Variant }) {
  return (
    <span className={`motto motto-${variant}`} aria-label={`${MOTTO_WORK}, ${MOTTO_PLAY}`}>
      <span className="motto-work" aria-hidden="true">
        {MOTTO_WORK}
        <span className="motto-sep">,</span>
      </span>
      <span className="motto-play" aria-hidden="true">
        {MOTTO_PLAY}
      </span>
    </span>
  );
}
