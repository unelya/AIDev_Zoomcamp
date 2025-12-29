import { type Column, type WorkCard } from "../types";
import { columnTone } from "../data/boardData";
import { cn } from "../lib/utils";

interface KanbanBoardProps {
  columns: Column[];
  onCardClick: (card: WorkCard) => void;
}

export function KanbanBoard({ columns, onCardClick }: KanbanBoardProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2">
      {columns.map((column) => (
        <div
          key={column.id}
          className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-sidebar/30 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
              <h3 className="text-lg font-semibold text-foreground">{column.title}</h3>
            </div>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
                columnTone[column.statusKey],
              )}
            >
              {column.cards.length} items
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {column.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onCardClick(card)}
                className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/90 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className={cn("h-2.5 w-2.5 rounded-full", statusDot(card.statusTone))} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">#{card.id}</p>
                  </div>
                  {card.statusLabel && (
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
                        columnTone[card.statusTone ?? "new"],
                      )}
                    >
                      {card.statusLabel}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-foreground">{card.title}</p>
                  <p className="text-sm text-muted-foreground">{card.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {card.dueDate && (
                    <span className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1">
                      <span className="text-[11px]">📅</span>
                      <span className="font-semibold text-foreground">{card.dueDate}</span>
                    </span>
                  )}
                  {card.assignee && (
                    <span className="flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1">
                      <span className="text-[11px]">👤</span>
                      <span className="font-semibold text-foreground">{card.assignee}</span>
                    </span>
                  )}
                  {card.progressNote && (
                    <span className="rounded-lg border border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
                      {card.progressNote}
                    </span>
                  )}
                  {card.sampleDate && (
                    <span className="rounded-lg border border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
                      Sample {card.sampleDate}
                    </span>
                  )}
                  {card.plannedDate && (
                    <span className="rounded-lg border border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
                      Planned {card.plannedDate}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted/10 px-2 py-1 text-[11px] font-semibold text-muted-foreground/90">
                    Well {card.well}
                  </span>
                  <span className="rounded-full bg-muted/10 px-2 py-1 text-[11px] font-semibold text-muted-foreground/90">
                    Horizon {card.horizon}
                  </span>
                  {card.storage && (
                    <span className="rounded-full bg-muted/10 px-2 py-1 text-[11px] font-semibold text-muted-foreground/90">
                      {card.storage}
                    </span>
                  )}
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition group-hover:bg-primary/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                {card.progressNote && (
                  <div className="h-1.5 rounded-full bg-muted/20">
                    <div
                      className={cn(
                        "h-1.5 rounded-full bg-primary transition-all",
                        card.statusTone === "progress" ? "w-3/4" : card.statusTone === "review" ? "w-2/3" : "w-1/3",
                      )}
                    />
                  </div>
                )}
              </button>
            ))}
            {column.cards.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                Nothing here yet.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function statusDot(tone?: keyof typeof columnTone) {
  switch (tone) {
    case "progress":
      return "bg-status-progress";
    case "review":
      return "bg-status-review";
    case "done":
      return "bg-status-done";
    default:
      return "bg-status-new";
  }
}
