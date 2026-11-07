import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => (
    <span
      className={cn('ui-switch-root', className)}
      data-checked={(props.checked ?? props.defaultChecked) ? 'true' : 'false'}
      data-disabled={props.disabled ? 'true' : 'false'}
    >
      <input ref={ref} type="checkbox" role="switch" className="ui-switch-input" {...props} />
      <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
    </span>
  ),
);
Switch.displayName = 'Switch';
