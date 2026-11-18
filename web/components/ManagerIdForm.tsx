import type { FormEvent, RefObject } from 'react';
import type { StatusLine } from '../status-line.js';
import { PencilLoader } from './PencilLoader.js';

interface ManagerIdFormProps {
  inputRef: RefObject<HTMLInputElement | null>;
  hidden: boolean;
  value: string;
  busy: boolean;
  loading: boolean;
  status: StatusLine;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}

export function ManagerIdForm({
  inputRef,
  hidden,
  value,
  busy,
  loading,
  status,
  onValueChange,
  onSubmit,
}: ManagerIdFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      id="coach-form"
      className="setup-card"
      hidden={hidden}
      onSubmit={handleSubmit}
    >
      <label htmlFor="manager-id">FPL Manager ID</label>
      <div className="setup-row">
        <input
          ref={inputRef}
          id="manager-id"
          name="manager-id"
          type="number"
          min="1"
          placeholder="e.g. 1234567"
          required
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <button id="submit-button" type="submit" disabled={busy}>
          Get my report
        </button>
      </div>
      {loading && <PencilLoader />}
      <p
        id="status"
        role="status"
        className={status.isError ? 'status--error' : undefined}
      >
        {status.message}
      </p>
    </form>
  );
}
