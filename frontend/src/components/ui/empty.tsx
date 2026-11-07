import type { ReactNode } from 'react';

export function Empty({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <div className="ui-empty">
    {icon && <span className="ui-empty-icon" aria-hidden="true">{icon}</span>}
    <strong>{title}</strong>
    {description && <p>{description}</p>}
    {action}
  </div>;
}
