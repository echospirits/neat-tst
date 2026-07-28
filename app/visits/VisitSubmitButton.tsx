'use client';

import { useFormStatus } from 'react-dom';

export function VisitSubmitButton({
  disabled = false,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button aria-live="polite" disabled={disabled || pending} type="submit">
      {pending ? 'Logging visit…' : label}
    </button>
  );
}
