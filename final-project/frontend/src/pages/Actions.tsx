import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";

const Actions = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-wide">Actions</p>
            <h2 className="text-xl font-semibold text-foreground">Coming soon</h2>
            <p className="text-sm text-muted-foreground">Technological actions and conflict handling UI will live here.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Actions;
