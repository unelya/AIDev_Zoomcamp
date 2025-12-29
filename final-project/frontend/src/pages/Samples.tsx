import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";

const Samples = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-wide">Samples</p>
            <h2 className="text-xl font-semibold text-foreground">Coming soon</h2>
            <p className="text-sm text-muted-foreground">Planned sample list and intake actions will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Samples;
