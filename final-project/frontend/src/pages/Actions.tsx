import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mockActions } from "@/data/actions";

const Actions = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">Actions registry</h2>
            <p className="text-sm text-muted-foreground">Mock technological actions table.</p>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead>Well ID</TableHead>
                  <TableHead>Action ID</TableHead>
                  <TableHead>Start date</TableHead>
                  <TableHead>End date</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Action type</TableHead>
                  <TableHead>Actual incremental oil production investment year, t</TableHead>
                  <TableHead>Actual average daily production rate before the action, t/day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockActions.map((row, index) => (
                  <TableRow key={row.actionId}>
                    <TableCell className="text-right text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>{row.wellId}</TableCell>
                    <TableCell>{row.actionId}</TableCell>
                    <TableCell>{row.startDate}</TableCell>
                    <TableCell>{row.endDate}</TableCell>
                    <TableCell>{row.success.toFixed(2)}</TableCell>
                    <TableCell>{row.actionType}</TableCell>
                    <TableCell>{row.incrementalOil.toFixed(1)}</TableCell>
                    <TableCell>{row.avgDailyRate.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Actions;
