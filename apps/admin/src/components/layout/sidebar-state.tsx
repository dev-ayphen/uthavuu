"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "uthavu-admin-sidebar-collapsed";

/**
 * The collapse preference lives in localStorage, which is an EXTERNAL store —
 * not React state. So it is read with `useSyncExternalStore` rather than
 * "useState + read it in an effect".
 *
 * That matters for more than tidiness. The effect version sets state during
 * mount, which React 19 flags (react-hooks/set-state-in-effect) because it
 * forces a second render pass: the sidebar paints expanded, then snaps shut.
 * `useSyncExternalStore` gives React a server snapshot and a client snapshot
 * and lets it resolve both in one pass, with no flash and no cascade.
 */
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private mode / storage disabled — the default (expanded) is fine.
    return false;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Cached so the snapshot is stable between renders and localStorage is read once. */
function getSnapshot(): boolean {
  if (cached === null) cached = readStored();
  return cached;
}

/** No storage on the server: the sidebar renders expanded. */
function getServerSnapshot(): boolean {
  return false;
}

function writeStored(next: boolean) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // The preference simply won't persist; the session still works.
  }
  for (const listener of listeners) listener();
}

/** True only on the client. Used to suppress the width transition on first paint. */
const noopSubscribe = () => () => {};

type SidebarState = {
  /** Desktop: icon-rail mode. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Below `lg`: the sidebar is an off-canvas drawer. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** False during the server render, so animations don't fire on hydration. */
  hydrated: boolean;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => writeStored(!getSnapshot()), []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen, hydrated }),
    [collapsed, toggleCollapsed, mobileOpen, hydrated],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}
