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

  const totalCards = columns.reduce((acc, column) => acc + column.cards.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <aside className="sticky top-6 flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-border/60 bg-sidebar/50 p-4 shadow-sm lg:h-[calc(100vh-4rem)] lg:w-64">
          <div className="flex items-center gap-2 rounded-2xl bg-sidebar-accent/40 px-3 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-lg font-bold text-primary">LS</div>
            <div>
              <p className="text-sm font-semibold text-foreground">LabSync</p>
              <p className="text-xs text-muted-foreground">Sample tracking</p>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {["Board", "Samples", "Analytics", "Settings"].map((item) => (
              <div
                key={item}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition",
                  item === "Board" ? "bg-primary/10 text-primary" : "hover:bg-muted/10 hover:text-foreground",
                )}
              >
                <span>{item}</span>
                {item === "Samples" && (
                  <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">142</span>
                )}
              </div>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-border/60 bg-muted/5 p-3">
            <p className="text-xs uppercase text-muted-foreground">Lab</p>
            <p className="text-sm font-semibold text-foreground">Main Laboratory</p>
            <p className="text-xs text-muted-foreground">Oil samples · Physical archive</p>
          </div>
        </aside>

        <div className="flex-1 space-y-5">
          <header className="rounded-3xl border border-border/60 bg-sidebar/50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample Tracking Board</p>
                <h1 className="text-2xl font-bold leading-snug text-foreground">8 samples across 4 stages</h1>
                <p className="text-sm text-muted-foreground">
                  Dark industrial view with status badges, assignees, and due dates. Click any card for details.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary">
                  Filter
                </button>
                <button className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary">
                  View
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => switchRole(role.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                      activeRole === role.id
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border/70 bg-sidebar/70 text-muted-foreground hover:border-primary/40 hover:text-primary",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-primary/80" />
                    <span className="font-semibold">{role.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
                <SummaryCard title="Board focus" value={roles.find((r) => r.id === activeRole)?.label ?? ""} />
                <SummaryCard title="Items on board" value={`${totalCards} cards`} />
                <SummaryCard title="Traceability" value="Status history & metadata" />
              </div>
            </div>
          </header>

          <KanbanBoard columns={columns} onCardClick={onCardClick} />
        </div>
      </div>
      <DetailPanel card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
