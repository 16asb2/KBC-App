// Admin calendar token is now managed by AuthProvider and exposed via the auth bridge.
// This re-export keeps calendarService.ts's import unchanged during the migration.
export { getAdminCalendarToken } from '@/services/authBridge';
