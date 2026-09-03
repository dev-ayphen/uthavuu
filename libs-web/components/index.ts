/**
 * The shared web UI surface.
 *
 * Everything exported here is app-agnostic: it knows about design tokens and
 * nothing else — no routes, no session, no permissions, no data fetching. That
 * is the entry test for this package. A component that needs the router, an
 * admin permission, or an API client is a feature component and belongs in the
 * app that owns it.
 *
 * Consumers import from the barrel (`@uthavu/libs-web/components`); deep paths
 * work too and are what `apps/admin/src/components/ui/*` re-exports through.
 */
export { AccessDeniedState } from "./access-denied-state";
export {
  Alert,
  type AlertAlign,
  type AlertProps,
  type AlertSize,
  type AlertTone,
} from "./alert";
export { Badge, CountBadge, type BadgeProps } from "./badge";
export { Button, buttonVariants, type ButtonProps } from "./button";
export { CalloutCard, type CalloutTone } from "./callout-card";
export { Card, CardBody, CardHeader, CardTitle } from "./card";
export { CharacterCounter } from "./character-counter";
export { Dialog, DialogBody, DialogFooter, DialogHeader } from "./dialog";
export { EmptyState } from "./empty-state";
export { ErrorState } from "./error-state";
export { ErrorReference, FullPageState } from "./full-page-state";
export { Field } from "./field";
export {
  FILTER_ACTIVE_TINT,
  FilterRow,
  FilterSelect,
  filterTint,
  type FilterOption,
  type FilterSelectProps,
} from "./filter-row";
export { InlineField } from "./inline-field";
export { Input, type InputProps } from "./input";
export { LockedField } from "./locked-field";
export { UthavuLogoTile, UthavuMark } from "./logo";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedControlVariant,
  type SegmentedOption,
} from "./segmented-control";
export { Select, type SelectProps } from "./select";
export { Skeleton } from "./skeleton";
export { Slot } from "./slot";
export { MetricTile, StatCard, type Accent } from "./stat-card";
export { Switch } from "./switch";
export { Textarea } from "./textarea";
export { ThemeToggle } from "./theme-toggle";
