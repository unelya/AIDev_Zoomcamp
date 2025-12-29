import { LayoutGrid, FlaskConical, BarChart3, Settings, ChevronDown, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink } from '@/components/NavLink';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
}

function NavItem({ icon, label, to, count }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className="nav-item w-full"
      activeClassName="nav-item-active"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
          {count}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col">
      <nav className="flex-1 p-3 space-y-1">
        <NavItem 
          to="/board"
          icon={<LayoutGrid className="h-4 w-4" />} 
          label="Board"
        />
        <NavItem 
          to="/samples"
          icon={<FlaskConical className="h-4 w-4" />} 
          label="Samples" 
          count={142}
        />
        <NavItem 
          to="/actions"
          icon={<ClipboardList className="h-4 w-4" />} 
          label="Actions" 
        />
        <NavItem 
          to="/admin"
          icon={<BarChart3 className="h-4 w-4" />} 
          label="Admin" 
        />
        <NavItem 
          to="/settings"
          icon={<Settings className="h-4 w-4" />} 
          label="Settings" 
        />
      </nav>
      
      <div className="p-3 border-t border-sidebar-border">
        <button className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-sidebar-accent transition-colors">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
            <span className="text-primary text-xs font-mono">M1</span>
          </div>
          <span className="text-sm text-sidebar-foreground flex-1 text-left">Main Laboratory</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </aside>
  );
}
