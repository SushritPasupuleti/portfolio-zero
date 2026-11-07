import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return <details className="ui-collapsible" open={defaultOpen}>
    <summary>{title}<ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="ui-collapsible-content">{children}</div>
  </details>;
}
