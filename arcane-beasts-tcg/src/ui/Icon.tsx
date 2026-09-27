import icons from '../assets/icons.json';

const ICONS = icons as Record<string, string>;

export function Icon({ name, size, color, className, style }: { name: string; size?: number | string; color?: string; className?: string; style?: React.CSSProperties }) {
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
