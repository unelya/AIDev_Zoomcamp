import { KanbanCard, NewCardPayload, PlannedAnalysisCard } from "@/types/kanban";

const headers = {
  "Content-Type": "application/json",
};

export async function fetchSamples(): Promise<KanbanCard[]> {
  const res = await fetch("/api/samples");
  if (!res.ok) throw new Error(`Failed to load samples (${res.status})`);
  const data = (await res.json()) as any[];
  return data.map(mapSampleToCard);
}

export async function createSample(payload: NewCardPayload): Promise<KanbanCard> {
  const res = await fetch("/api/samples", {
    method: "POST",
    headers,
    body: JSON.stringify({
      sample_id: payload.sampleId,
      well_id: payload.wellId,
      horizon: payload.horizon,
      sampling_date: payload.samplingDate,
      status: "new",
      storage_location: payload.storageLocation ?? "Unassigned",
    }),
  });
  if (!res.ok) throw new Error(`Failed to create sample (${res.status})`);
  const data = await res.json();
  return mapSampleToCard(data);
}

export async function updateSampleStatus(sampleId: string, status: string, storageLocation?: string): Promise<KanbanCard> {
  const res = await fetch(`/api/samples/${sampleId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status, storage_location: storageLocation }),
  });
  if (!res.ok) throw new Error(`Failed to update sample (${res.status})`);
  const data = await res.json();
  return mapSampleToCard(data);
}

function mapSampleToCard(sample: any): KanbanCard {
  const statusLabelMap: Record<string, string> = {
    new: "Planned",
    progress: "Awaiting arrival",
    review: "Stored / Needs attention",
    done: "Completed",
  };

  return {
    id: sample.sample_id,
    status: (sample.status ?? "new") as KanbanCard["status"],
    statusLabel: statusLabelMap[sample.status] ?? "Planned",
    sampleId: sample.sample_id,
    wellId: sample.well_id,
    horizon: sample.horizon,
    samplingDate: sample.sampling_date,
    storageLocation: sample.storage_location ?? "Unassigned",
    analysisType: "Sample",
    assignedTo: sample.assigned_to ?? "Unassigned",
    analysisStatus: sample.status ?? "new",
    sampleStatus: sample.status ?? "new",
  };
}

export async function fetchPlannedAnalyses(): Promise<PlannedAnalysisCard[]> {
  const res = await fetch("/api/planned-analyses");
  if (!res.ok) throw new Error(`Failed to load planned analyses (${res.status})`);
  return (await res.json()) as PlannedAnalysisCard[];
}

export async function createPlannedAnalysis(payload: { sampleId: string; analysisType: string; assignedTo?: string }) {
  const res = await fetch("/api/planned-analyses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      sample_id: payload.sampleId,
      analysis_type: payload.analysisType,
      assigned_to: payload.assignedTo,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create analysis (${res.status})`);
  return (await res.json()) as { id: number; sample_id: string; analysis_type: string; status: string; assigned_to?: string };
}

export async function updatePlannedAnalysis(id: number, status: string, assignedTo?: string) {
  const res = await fetch(`/api/planned-analyses/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status, assigned_to: assignedTo }),
  });
  if (!res.ok) throw new Error(`Failed to update analysis (${res.status})`);
  return (await res.json()) as { id: number; sample_id: string; analysis_type: string; status: string; assigned_to?: string };
}

export function mapApiAnalysis(pa: { id: number; sample_id: string; analysis_type: string; status: string; assigned_to?: string }): PlannedAnalysisCard {
  return {
    id: pa.id,
    sampleId: pa.sample_id,
    analysisType: pa.analysis_type,
    status: pa.status as PlannedAnalysisCard["status"],
    assignedTo: pa.assigned_to,
  };
}

export async function fetchActionBatches() {
  const res = await fetch("/api/action-batches");
  if (!res.ok) throw new Error(`Failed to load action batches (${res.status})`);
  return (await res.json()) as { id: number; title: string; date: string; status: string }[];
}

export async function createActionBatch(payload: { title: string; date: string; status?: string }) {
  const res = await fetch("/api/action-batches", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, status: payload.status ?? "new" }),
  });
  if (!res.ok) throw new Error(`Failed to create action batch (${res.status})`);
  return (await res.json()) as { id: number; title: string; date: string; status: string };
}

export async function fetchConflicts() {
  const res = await fetch("/api/conflicts");
  if (!res.ok) throw new Error(`Failed to load conflicts (${res.status})`);
  return (await res.json()) as { id: number; old_payload: string; new_payload: string; status: string; resolution_note?: string | null }[];
}

export async function createConflict(payload: { oldPayload: string; newPayload: string }) {
  const res = await fetch("/api/conflicts", {
    method: "POST",
    headers,
    body: JSON.stringify({ old_payload: payload.oldPayload, new_payload: payload.newPayload, status: "open" }),
  });
  if (!res.ok) throw new Error(`Failed to create conflict (${res.status})`);
  return (await res.json()) as { id: number; old_payload: string; new_payload: string; status: string; resolution_note?: string | null };
}

export async function resolveConflict(id: number, note?: string) {
  const res = await fetch(`/api/conflicts/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "resolved", resolution_note: note ?? "" }),
  });
  if (!res.ok) throw new Error(`Failed to resolve conflict (${res.status})`);
  return (await res.json()) as { id: number; old_payload: string; new_payload: string; status: string; resolution_note?: string | null };
}

export async function fetchUsers() {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  return (await res.json()) as { id: number; username: string; full_name: string; role: string; roles: string[] }[];
}

export async function updateUserRole(id: number, roles: string[]) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ roles }),
  });
  if (!res.ok) throw new Error(`Failed to update user (${res.status})`);
  return (await res.json()) as { id: number; username: string; full_name: string; role: string; roles: string[] };
}
