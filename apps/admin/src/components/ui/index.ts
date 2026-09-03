/**
 * Re-export shim over the shared web UI package.
 *
 * These primitives used to be implemented in this directory. They are
 * app-agnostic token consumers — nothing here knows about admin routes,
 * sessions or permissions — so they now live in `@uthavu/libs-web`, where
 * `apps/marketing` can reach them too.
 *
 * The shim stays because ~150 files across `src/features/**` import
 * `@/components/ui`, and several of those features are being edited
 * concurrently. Rewriting every one of those imports to point at
 * `@uthavu/libs-web/components` is a mechanical follow-up for when those lanes
 * are quiet — not a change worth colliding with five sessions over. Until then
 * this file is the seam, and it must forward the package's surface verbatim.
 *
 * Adding a NEW shared primitive? Add it to `libs-web/components/`, not here.
 */
export {
  AccessDeniedState,
  Alert,
  Badge,
  Button,
  buttonVariants,
  CalloutCard,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CharacterCounter,
  CountBadge,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  ErrorReference,
  Field,
  FILTER_ACTIVE_TINT,
  FilterRow,
  FilterSelect,
  filterTint,
  FullPageState,
  InlineField,
  Input,
  LockedField,
  MetricTile,
  SegmentedControl,
  Select,
  Skeleton,
  Slot,
  StatCard,
  Switch,
  Textarea,
  ThemeToggle,
  UthavuLogoTile,
  UthavuMark,
  type Accent,
  type AlertAlign,
  type AlertProps,
  type AlertSize,
  type AlertTone,
  type BadgeProps,
  type ButtonProps,
  type CalloutTone,
  type FilterOption,
  type FilterSelectProps,
  type InputProps,
  type SegmentedControlProps,
  type SegmentedControlVariant,
  type SegmentedOption,
  type SelectProps,
} from "@uthavu/libs-web/components";

export { BackButton, type BackButtonProps } from "./back-button";
