import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { Role } from '@/types/kanban';
import { useAuth } from '@/hooks/use-auth';

const Index = () => {
  const [role, setRole] = useState<Role>('lab_operator');
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role) {
      setRole(user.role);
    }
  }, [user]);

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
