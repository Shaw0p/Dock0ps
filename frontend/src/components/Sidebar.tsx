import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Boxes,
  Layers,
  Activity,
  LogOut,
  Terminal,
  HardDrive,
  Network,
  Workflow,
  LayoutGrid,
  Bell,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();

  const links = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/stacks', label: 'Compose Stacks', icon: Workflow },
    { to: '/templates', label: 'App Catalog', icon: LayoutGrid },
    { to: '/containers', label: 'Containers', icon: Boxes },
    { to: '/images', label: 'Images', icon: Layers },
    { to: '/volumes', label: 'Volumes', icon: HardDrive },
    { to: '/networks', label: 'Networks', icon: Network },
    { to: '/alerts', label: 'Alerting Rules', icon: Bell },
    { to: '/events', label: 'Events Stream', icon: Activity },
  ];


  return (
    <aside className="w-56 bg-[#121418]/60 backdrop-blur-xl border-r border-[rgba(255,255,255,0.06)] flex flex-col h-screen sticky top-0 font-sans select-none z-20">
      
      {/* Brand Header */}
      <div className="p-5 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2.5">
        <div className="w-6 h-6 rounded bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-zinc-200">
          <Terminal size={12} />
        </div>
        <div className="leading-none">
          <h1 className="text-xs font-extrabold text-white tracking-wider">DOCKOPS</h1>
          <span className="text-[8px] text-zinc-550 font-bold uppercase tracking-widest block mt-0.5">Control console</span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-4 space-y-1 text-xs">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl font-semibold transition-all ${
                  isActive
                    ? 'bg-white/10 text-white border border-[rgba(255,255,255,0.04)]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                }`
              }
            >
              <Icon size={14} />
              {link.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User profile & Logout */}
      <div className="p-4 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-3 text-xs font-sans">
        {user && (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-7 h-7 rounded-full bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.08)] flex items-center justify-center font-bold text-zinc-400 uppercase">
              {user.email.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-zinc-350 truncate leading-none">{user.firstName || 'User'}</p>
              <span className="text-[9px] text-zinc-550 font-bold uppercase tracking-wider mt-1 block">{user.role}</span>
            </div>
          </div>
        )}
        
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all cursor-pointer font-semibold"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
