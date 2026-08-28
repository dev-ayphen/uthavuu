"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

/**
 * App-wide synchronous render guard.
 *
 * This is NOT redundant with `error.tsx`. `error.tsx` is a route-segment
 * boundary: it catches errors thrown while rendering a segment's page or its
 * nested children, plus async/server errors. It does NOT wrap the layout of its
 * own segment, and it does not wrap the provider tree above the router. A
 * synchronous throw in a provider, in the app shell, or in a client component
 * mounted above the segment escapes every `error.tsx` in the app and takes the
 * whole document white, with nothing rendered and nothing logged for the user.
 *
 * This boundary sits inside the root layout's provider tree and is the last
 * thing between such a throw and a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Wire to the error reporter when one exists. Until then the console is
    // the only record, so keep the component stack with it.
    console.error("[admin] uncaught render error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="grid min-h-svh place-items-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6 shadow-raised">
          <div className="flex size-10 items-center justify-center rounded-control bg-danger-soft text-danger-fg">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="mt-4 text-base font-bold text-fg">The console hit an error</h1>
          <p className="mt-1.5 text-fg-subtle">
            Something failed while rendering this screen. Try again — if it keeps happening,
            send the details below to engineering.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-control border border-border bg-surface-inset p-3 font-mono text-[11px] text-fg-muted">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            className="mt-5 inline-flex items-center gap-2 rounded-control bg-primary px-3.5 py-2 font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            <RotateCcw className="size-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
