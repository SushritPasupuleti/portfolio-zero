import type { InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;
export function Checkbox({ className, ...props }: CheckboxProps) {
  return <span className={cn('ui-checkbox-wrap', className)}><input className="ui-checkbox-input" type="checkbox" {...props}/><span className="ui-checkbox-indicator" aria-hidden="true"><Check size={13}/></span></span>;
}
