import icons from '../assets/icons.json';
import { asset } from '../lib/assets';

const ICONS = icons as Record<string, string>;

export function Icon({ name, size, color, className, style }: { name: string; size?: number | string; color?: string; className?: string; style?: React.CSSProperties }) {
  // money is drawn from a picture (Noto Emoji), not the single-colour icon set
  if (name === 'coin' || name === 'gem')
    return <img className={`money money-${name} ${className ?? ''}`} src={asset(`ui/${name}.svg`)} alt="" draggable={false} style={{ width: size ?? '1.15em', height: size ?? '1.15em', display: 'inline-block', flex: 'none', verticalAlign: '-0.2em', ...style }} />;
  const body = ICONS[name];
  if (!body) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      width={size ?? '1em'}
      height={size ?? '1em'}
      style={{ color: color ?? 'currentColor', display: 'inline-block', flex: 'none', ...style }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: body.replace(/fill="#fff"/g, 'fill="currentColor"') }}
    />
  );
}
