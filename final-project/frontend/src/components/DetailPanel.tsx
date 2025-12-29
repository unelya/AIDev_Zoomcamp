import { type WorkCard } from "../types";
import { cn } from "../lib/utils";

interface DetailPanelProps {
  card: WorkCard | null;
  onClose: () => void;
}

export function DetailPanel({ card, onClose }: DetailPanelProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-30 transition duration-300",
        card ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition",
          card ? "pointer-events-auto" : "pointer-events-none",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-md transform bg-sidebar shadow-2xl transition duration-300",
          card ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Details</p>
            <h2 className="text-lg font-semibold text-foreground">{card ? card.title : "No item selected"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
          >
            Close
          </button>
        </div>
        {card ? (
          <div className="flex h-full flex-col gap-4 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoPill label="Card" value={`#${card.id}`} />
              <InfoPill label="Well" value={card.well} />
              <InfoPill label="Horizon" value={card.horizon} />
              {card.sampleDate && <InfoPill label="Sample date" value={card.sampleDate} />}
              {card.plannedDate && <InfoPill label="Planned date" value={card.plannedDate} />}
              {card.storage && <InfoPill label="Storage" value={card.storage} />}
              {card.assignee && <InfoPill label="Assignee" value={card.assignee} />}
              {card.dueDate && <InfoPill label="Due date" value={card.dueDate} />}
              {card.statusLabel && <InfoPill label="Status" value={card.statusLabel} />}
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Metadata</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                {card.details.map((detail) => (
                  <li key={`${card.id}-${detail.label}`} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{detail.label}</span>
                    <span className="font-semibold">{detail.value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Status history</p>
              <div className="mt-3 space-y-3">
                {card.statusHistory.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-dashed border-border/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-foreground">{entry.status}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.user && <span className="font-semibold text-foreground">{entry.user}</span>}
                      {entry.user && entry.note && <span className="mx-1 text-foreground/50">·</span>}
                      {entry.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-muted-foreground">Select a card to see details.</div>
        )}
      </aside>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
