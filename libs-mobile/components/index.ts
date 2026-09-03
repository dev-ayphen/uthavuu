// Barrel for the shared mobile component library.
//
// Import from '@uthavu/libs-mobile/components' rather than reaching into
// individual files. This mirrors how '@uthavu/libs-mobile/i18n' already
// resolves via its own index.ts — there is deliberately no root barrel for
// libs-mobile, and adding one is a separate migration (the app has ~117 deep
// imports into theme/, lib/, and api/).
//
// Deep imports like '@uthavu/libs-mobile/components/Button' still resolve, so
// this is additive — nothing that already imports that way has to change.

export { default as Avatar } from './Avatar';
export { default as BackButton } from './BackButton';
export { default as BackHeader } from './BackHeader';
export { default as BottomSheet } from './BottomSheet';
export { default as Button } from './Button';
export { default as Card } from './Card';
export { default as Chip } from './Chip';
export { default as CloseButton } from './CloseButton';
export { ComingSoon } from './ComingSoon';
export { default as CountBadge } from './CountBadge';
export { default as Divider } from './Divider';
export { default as Dot } from './Dot';
export { default as EmptyState } from './EmptyState';
export { default as ErrorState } from './ErrorState';
export { default as ListRow } from './ListRow';
export { default as ProfessionPicker } from './ProfessionPicker';
export { default as ScreenHeader } from './ScreenHeader';
export { default as SearchField } from './SearchField';
export { default as SectionHeading } from './SectionHeading';
export { default as Skeleton } from './Skeleton';
export { default as Spinner } from './Spinner';
export { default as StatusBadge } from './StatusBadge';
export { default as Stepper } from './Stepper';
export { default as TabBar } from './TabBar';
export { default as TextField } from './TextField';
export { default as ToggleRow } from './ToggleRow';

export type { ScreenHeaderProps } from './ScreenHeader';
export type { Tone, ToneKey } from './StatusBadge';
export type { TabBarItem } from './TabBar';
