import { Bell, Search, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Role } from '@/types/kanban';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';

const roleOptions: { id: Role; label: string }[] = [
  { id: 'warehouse_worker', label: 'Warehouse' },
  { id: 'lab_operator', label: 'Lab Operator' },
  { id: 'action_supervision', label: 'Action Supervision' },
  { id: 'admin', label: 'Admin' },
];

interface TopBarProps {
  role?: Role;
  onRoleChange?: (role: Role) => void;
}

export function TopBar({ role, onRoleChange }: TopBarProps) {
  const { user, logout } = useAuth();
  const selectedRole = role ?? user?.role ?? 'lab_operator';
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-mono font-bold text-sm">LS</span>
          </div>
          <span className="font-semibold text-foreground tracking-tight">LabSync</span>
        </div>
        
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search samples, analyses, or IDs..." 
            className="pl-9 bg-muted border-border/50 h-9 text-sm placeholder:text-muted-foreground/60"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Select value={selectedRole} onValueChange={(val) => onRoleChange?.(val as Role)}>
          <SelectTrigger className="w-48 h-9 text-sm bg-muted border-border/50">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button className="relative p-2 rounded-md hover:bg-muted transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{user?.fullName ?? "Guest"}</p>
            <p className="text-xs text-muted-foreground">{user?.role ?? "Not signed in"}</p>
          </div>
          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-medium">
              {(user?.fullName ?? "G").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {user && (
            <button className="p-2 rounded-md hover:bg-muted transition-colors" onClick={logout}>
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
