export type Status = 'new' | 'progress' | 'review' | 'done';

export interface AnalysisCheck {
  id: string;
  label: string;
  checked: boolean;
}

export interface KanbanCard {
  id: string;
  title: string;
  sampleId: string;
  status: Status;
  category: string;
  type: string;
  createdAt: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  analyses: AnalysisCheck[];
  tags: string[];
  notes?: string;
  assignee?: string;
}

export interface KanbanColumn {
  id: Status;
  title: string;
  cards: KanbanCard[];
}
