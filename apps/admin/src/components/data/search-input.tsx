"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useListState } from "@/hooks/use-list-state";
import { cn } from "@/lib/cn";

/**
 * Search that types locally and commits on a pause.
 *
 * THE BUG THIS IS SHAPED AROUND
 * ───────────────────────────────────────────────────────────────────────────
 * The naive controlled input — `value={search} onChange={setSearch}` straight
 * into URL state — rewrites the address bar and refires the query on every
 * keystroke. Seven requests for "chennai", and because they can land out of
 * order the table can settle showing results for "chenn".
 *
 * So the input owns a local draft and pushes it on a pause. That creates the
 * second problem this file exists to solve: the draft and the real value can
 * now disagree, and when "Clear all" empties the URL the box would keep
 * displaying the stale term. `lastEmitted` is the reconciliation — a `value`
 * that is not the one we last pushed came from OUTSIDE, so the draft yields to
 * it. Comparing against `value` alone would instead fight the user's typing.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  debounceMs = 300,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name. Rendered visually hidden unless you show your own. */
  label?: string;
  debounceMs?: number;
  className?: string;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const lastEmitted = useRef(value);

  const emit = useDebouncedCallback((next: string) => {
    lastEmitted.current = next;
    onChange(next);
  }, debounceMs);

  useEffect(() => {
    // Only adopt a value we did not originate — an external reset, a back
    // button, a pasted link. Otherwise this would clobber in-flight typing.
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setDraft(value);
    }
  }, [value]);

  const update = (next: string) => {
    setDraft(next);
    emit.run(next);
  };

  const commitNow = (next: string) => {
    setDraft(next);
    emit.flush(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter means "I'm done typing" — waiting out the debounce after an
    // explicit commit feels broken.
    if (event.key === "Enter") {
      event.preventDefault();
      commitNow(draft);
    }
    if (event.key === "Escape" && draft !== "") {
      event.preventDefault();
      commitNow("");
    }
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint"
      />
      <input
        id={inputId}
        type="search"
        value={draft}
        onChange={(event) => update(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => emit.flush(draft)}
        placeholder={placeholder}
        // The UA's own clear affordance would bypass our debounce and our
        // state, so it is suppressed in favour of the button below.
        className={cn(
          "h-9 w-full rounded-control border border-border bg-surface-inset pr-8 pl-9 text-xs text-fg",
          "placeholder:text-fg-faint",
          "outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "[&::-webkit-search-cancel-button]:appearance-none",
          draft !== "" && "border-primary-soft-border",
        )}
      />
      {draft !== "" ? (
        <button
          type="button"
          onClick={() => commitNow("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-control p-1 text-fg-faint transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Wired to `ListStateProvider`. The usual way to use it. */
export function ListSearchInput({
  placeholder,
  label,
  debounceMs,
  className,
}: {
  placeholder?: string;
  label?: string;
  debounceMs?: number;
  className?: string;
}) {
  const { params, setSearch } = useListState();
  return (
    <SearchInput
      value={params.search}
      onChange={setSearch}
      placeholder={placeholder}
      label={label}
      debounceMs={debounceMs}
      className={className}
    />
  );
}
