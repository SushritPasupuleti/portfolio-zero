import type { ReactNode } from 'react';

export function Field({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return <label className="ui-field">
    <span className="ui-field-label">{label}</span>
    <span className="ui-field-control">{children}</span>
    {description && <span className="ui-field-description">{description}</span>}
  </label>;
}
