export type Status = 'new' | 'progress' | 'review' | 'done';

export interface Sample {
  sampleId: string;
  wellId: string;
  horizon: string;
  samplingDate: string;
  status: 'received' | 'stored' | 'dispatched';
  storageLocation: string;
}

export interface PlannedAnalysis {
  id: string;
  sampleId: string;
  analysisType: string;
  status: 'planned' | 'in_progress' | 'review' | 'completed' | 'failed';
  assignedTo?: string;
}

export interface KanbanCard {
  id: string;
  status: Status;
  statusLabel: string;
  sampleId: string;
  wellId: string;
  horizon: string;
  samplingDate: string;
  storageLocation: string;
  analysisType: string;
  assignedTo?: string;
  analysisStatus: PlannedAnalysis['status'];
  sampleStatus: Sample['status'];
}

export interface NewCardPayload {
  sampleId: string;
  wellId: string;
  horizon: string;
  samplingDate: string;
  storageLocation?: string;
}

export interface KanbanColumn {
  id: Status;
  title: string;
  cards: KanbanCard[];
}

export type Role = 'warehouse_worker' | 'lab_operator' | 'action_supervision' | 'admin';
