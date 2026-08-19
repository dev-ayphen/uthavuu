// Shared draft state shape for the report flow — one source of truth for
// ReportFlowScreen and each step component's props.
export type PhotoDraft = {
  localUri: string;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string;
};

export type ReportDraft = {
  photos: PhotoDraft[];
  title: string;
  description: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  landmark: string;
  anonymous: boolean;
  phoneVisible: boolean;
};

// BR-2's default expiry is stored in minutes; this is purely a display label
// (e.g. "6 hours", "3 days") — the server computes the real expiry_at.
export function formatExpiryMinutes(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export const EMPTY_DRAFT: ReportDraft = {
  photos: [],
  title: '',
  description: '',
  lat: null,
  lng: null,
  locationLabel: '',
  landmark: '',
  anonymous: false,
  phoneVisible: false,
};
