// docs/mobile/06-profile-setup-screen.md §2.1 — the canonical 18-entry list
// (auth.md BR-5). 'none' clears the field rather than being stored as a value
// (fixes that doc's gap #11); 'other' reveals a free-text field instead of
// being stored as-is (fixes the doc's id-vs-label admin mismatch, gap in §5) —
// what's actually submitted is always a plain display label, never an id.
export const PROFESSIONS = [
  { id: 'none', emoji: '🚫', label: 'None / Clear' },
  { id: 'software_engineer', emoji: '👨‍💻', label: 'Software Engineer' },
  { id: 'doctor', emoji: '👩‍⚕️', label: 'Doctor' },
  { id: 'nurse', emoji: '👨‍⚕️', label: 'Nurse' },
  { id: 'police', emoji: '👮', label: 'Police' },
  { id: 'fire_rescue', emoji: '🚒', label: 'Fire & Rescue' },
  { id: 'paramedic', emoji: '🚑', label: 'Paramedic' },
  { id: 'teacher', emoji: '👩‍🏫', label: 'Teacher' },
  { id: 'mechanic', emoji: '👨‍🔧', label: 'Mechanic' },
  { id: 'electrician', emoji: '⚡', label: 'Electrician' },
  { id: 'plumber', emoji: '🛠', label: 'Plumber' },
  { id: 'driver', emoji: '🚚', label: 'Driver' },
  { id: 'farmer', emoji: '🌾', label: 'Farmer' },
  { id: 'student', emoji: '🎓', label: 'Student' },
  { id: 'business_owner', emoji: '🏢', label: 'Business Owner' },
  { id: 'homemaker', emoji: '🏠', label: 'Homemaker' },
  { id: 'volunteer', emoji: '❤️', label: 'Volunteer' },
  { id: 'other', emoji: '✍️', label: 'Other' },
] as const;

export type ProfessionId = (typeof PROFESSIONS)[number]['id'];
