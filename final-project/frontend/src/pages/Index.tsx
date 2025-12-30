import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { Role } from '@/types/kanban';
import { useAuth } from '@/hooks/use-auth';

const Index = () => {
  const [role, setRole] = useState<Role>('lab_operator');
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role) {
      setRole(user.role);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar role={role} onRoleChange={setRole} searchTerm={searchTerm} onSearch={setSearchTerm} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <KanbanBoard role={role} searchTerm={searchTerm} />
      </div>
    </div>
  );
};

export default Index;
