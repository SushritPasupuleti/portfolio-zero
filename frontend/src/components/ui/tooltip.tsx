import type { ReactNode } from 'react';
import { useId } from 'react';

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const id = useId();
  return <span className="ui-tooltip-wrap">
    <span className="ui-tooltip-trigger" tabIndex={0} role="note" aria-label={content} aria-describedby={id}>{children}</span>
    <span className="ui-tooltip-content" role="tooltip" id={id}>{content}</span>
  </span>;
}
