export interface Application {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: string; // free string — see DEFAULT_APPLICATION_STATUSES in constants.ts
  appliedDate: string; // ISO date
  lastUpdated: string; // ISO date
  notes: string;
}
