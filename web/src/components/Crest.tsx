export function Crest({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/crest.svg"
      alt=""
      aria-hidden="true"
      className={`crest ${className}`}
      style={{ width: size, height: 'auto' }}
    />
  );
}

/** The masthead used at the top of every guest screen. */
export function Wordmark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className="center">
      <h1 className={`wordmark wordmark--${size}`}>The Lord Erroll</h1>
      {size === 'lg' && <p className="tagline">Gourmet Restaurant</p>}
    </div>
  );
}
