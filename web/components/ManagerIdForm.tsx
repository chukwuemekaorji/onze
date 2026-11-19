import type { FormEvent, RefObject } from 'react';
import { tidyManagerIdInput } from '../manager-id-input.js';
import type { StatusLine } from '../status-line.js';
import { FindMyIdHelp } from './FindMyIdHelp.js';
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
          // text, not number: a number field drops a pasted fpl link entirely
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. 1234567, or paste your FPL link"
          required
          aria-describedby="status"
          aria-invalid={status.isError}
          value={value}
          onChange={(event) => onValueChange(tidyManagerIdInput(event.target.value))}
        />
        <button id="submit-button" type="submit" disabled={busy}>
          Get my report
        </button>
      </div>
      <FindMyIdHelp className="setup-card__id-help" />
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
