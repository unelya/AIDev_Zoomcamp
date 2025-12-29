import { type Column, type WorkCard } from "../types";
import { columnTone } from "../data/boardData";
import { cn } from "../lib/utils";

interface KanbanBoardProps {
  columns: Column[];
  onCardClick: (card: WorkCard) => void;
}

export function KanbanBoard({ columns, onCardClick }: KanbanBoardProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
      {columns.map((column) => (
        <div
          key={column.id}
          className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm backdrop-blur"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
              <h3 className="text-lg font-semibold text-foreground">{column.title}</h3>
            </div>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
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
                className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card-hover/60 hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">#{card.id}</p>
                    <p className="text-base font-semibold text-foreground">{card.title}</p>
                    <p className="text-sm text-muted-foreground">{card.subtitle}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    {card.sampleDate && <span className="text-[11px] text-muted-foreground">Sample: {card.sampleDate}</span>}
                    {card.plannedDate && <span className="text-[11px] text-muted-foreground">Planned: {card.plannedDate}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground/90">
                    Well {card.well}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground/90">
                    Horizon {card.horizon}
                  </span>
                  {card.storage && (
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground/90">
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
              </button>
            ))}
            {column.cards.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/50 p-4 text-sm text-muted-foreground">
                Nothing here yet.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
