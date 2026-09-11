import type { OrderStatus } from '../lib/types';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'sent', label: 'Sent' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'served', label: 'Served' },
];

/** The guest's view of where their round has got to. */
export function StatusTrail({ status }: { status: OrderStatus }) {
  const index = STEPS.findIndex((s) => s.key === status);
  const current = index === -1 ? 0 : index;

  return (
    <ol className="trail" aria-label="Order progress">
      {STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`trail__step${i < current ? ' is-done' : ''}${i === current ? ' is-current' : ''}`}
        >
          <span className="trail__dot" aria-hidden="true" />
          <span className="trail__label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
