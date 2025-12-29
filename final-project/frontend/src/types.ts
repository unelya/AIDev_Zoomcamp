export type Role = "warehouse" | "lab" | "action" | "admin";

export interface StatusHistoryEntry {
  id: string;
  status: string;
  timestamp: string;
  note?: string;
  user?: string;
}

export type StatusTone = "new" | "progress" | "review" | "done";

export interface WorkCard {
  id: string;
  title: string;
  subtitle: string;
  well: string;
  horizon: string;
  storage?: string;
  plannedDate?: string;
  sampleDate?: string;
  tags: string[];
  statusHistory: StatusHistoryEntry[];
  details: {
    label: string;
    value: string;
  }[];
}

export interface Column {
  id: string;
  title: string;
  statusKey: StatusTone;
  cards: WorkCard[];
}
