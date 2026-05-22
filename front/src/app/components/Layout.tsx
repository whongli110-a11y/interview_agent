import { NavLink, Outlet, useLocation } from "react-router";
import {
  LayoutDashboard,
  FolderOpen,
  Play,
  History,
  Settings,
  Cpu,
  BrainCircuit,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { to: "/", label: "工作台", icon: LayoutDashboard, end: true },
  { to: "/documents", label: "资料中心", icon: FolderOpen },
  { to: "/interviews/new", label: "开始面试", icon: Play },
  { to: "/history", label: "历史记录", icon: History },
  { to: "/settings", label: "设置", icon: Settings },
];

const mobileNavItems = [
  { to: "/", label: "工作台", icon: LayoutDashboard, end: true },
  { to: "/documents", label: "资料", icon: FolderOpen },
  { to: "/interviews/new", label: "面试", icon: Play },
  { to: "/history", label: "记录", icon: History },
  { to: "/settings", label: "设置", icon: Settings },
];

export function Layout() {
  const location = useLocation();
  const isInterviewPage = location.pathname.match(/^\/interviews\/[^/]+$/) && !location.pathname.endsWith("/report");

  return (
    <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-[#E5E7EB] shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#E5E7EB]">
          <div className="w-7 h-7 bg-[#2563EB] rounded flex items-center justify-center">
            <BrainCircuit size={16} className="text-white" />
          </div>
          <span className="text-[15px] font-semibold text-[#111827]">面试训练台</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded text-[14px] transition-colors ${
                  isActive
                    ? "bg-[#EFF6FF] text-[#2563EB] font-medium"
                    : "text-[#374151] hover:bg-[#F3F4F6]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? "text-[#2563EB]" : "text-[#6B7280]"} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom status */}
        <div className="px-4 py-3 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#DBEAFE] flex items-center justify-center text-[#2563EB] text-xs font-semibold">
              李
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[#111827] truncate">李明</div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                <span className="text-[11px] text-[#6B7280]">本地模式</span>
              </div>
            </div>
            <Cpu size={13} className="text-[#9CA3AF]" />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className={`flex-1 overflow-auto ${isInterviewPage ? "" : "p-0"}`}>
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-[#E5E7EB] bg-white">
          {mobileNavItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                  isActive ? "text-[#2563EB]" : "text-[#6B7280]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? "text-[#2563EB]" : "text-[#9CA3AF]"} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
