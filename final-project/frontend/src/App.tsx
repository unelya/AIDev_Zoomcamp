import { useMemo, useState } from "react";
import { KanbanBoard } from "./components/KanbanBoard";
import { DetailPanel } from "./components/DetailPanel";
import { boardDataByRole } from "./data/boardData";
import type { Role, WorkCard } from "./types";
import { cn } from "./lib/utils";

const roles: { id: Role; label: string; helper: string }[] = [
  { id: "warehouse", label: "Warehouse", helper: "Intake and storage" },
  { id: "lab", label: "Lab", helper: "Planned analyses" },
  { id: "action", label: "Action supervision", helper: "Field interventions" },
  { id: "admin", label: "Admin", helper: "Roles & audit" },
];

export default function App() {
  const [activeRole, setActiveRole] = useState<Role>("warehouse");
  const [selectedCard, setSelectedCard] = useState<WorkCard | null>(null);

  const columns = useMemo(() => boardDataByRole[activeRole], [activeRole]);

  const onCardClick = (card: WorkCard) => {
    setSelectedCard(card);
  };

  const switchRole = (role: Role) => {
    setActiveRole(role);
    setSelectedCard(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oil sample workflow</p>
              <h1 className="text-2xl font-bold leading-snug text-foreground">
                Role-based board for wells, samples, lab tasks, and technological actions
              </h1>
              <p className="text-sm text-muted-foreground">
                Keep warehouse, lab, and field teams aligned with one board and traceable history for every sample and action.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => switchRole(role.id)}
                  className={cn(
                    "flex flex-col rounded-xl border px-4 py-3 text-left text-sm transition",
                    activeRole === role.id
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border/70 bg-white/80 hover:border-primary/50 hover:text-primary",
                  )}
                >
                  <span className="font-semibold">{role.label}</span>
                  <span className="text-xs text-muted-foreground">{role.helper}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard title="Board focus" value={roles.find((r) => r.id === activeRole)?.label ?? ""} />
            <SummaryCard
              title="Items on board"
              value={`${columns.reduce((acc, column) => acc + column.cards.length, 0)} cards`}
            />
            <SummaryCard title="Traceability" value="Status history & metadata" />
          </div>
        </header>

        <main className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-primary" />
            <p className="text-sm font-semibold text-foreground">
              {activeRole === "warehouse" && "Warehouse view: intake, storage, and pickups."}
              {activeRole === "lab" && "Lab view: planned analyses and QC checkpoints."}
              {activeRole === "action" && "Action supervision: technological actions and conflicts."}
              {activeRole === "admin" && "Admin: user roles and audit placeholder board."}
            </p>
          </div>
          <KanbanBoard columns={columns} onCardClick={onCardClick} />
        </main>
      </div>
      <DetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
