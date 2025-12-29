import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { Role } from '@/types/kanban';

const Index = () => {
  const [role, setRole] = useState<Role>('lab_operator');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar role={role} onRoleChange={setRole} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <KanbanBoard role={role} />
      </div>
    </div>
  );
};

export default Index;
