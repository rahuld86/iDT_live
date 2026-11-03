import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/authService";
import topPanel from "@/assets/top_panel.png";

interface AppLayoutContext {
  headerActions: HTMLDivElement | null;
}

export const AppHeaderActions = ({ children }: { children: ReactNode }) => {
  const { headerActions } = useOutletContext<AppLayoutContext>();
  return headerActions ? createPortal(children, headerActions) : null;
};

export const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const isTreeVisualization = location.pathname === "/tree-visualization";

  return (
    <div className="min-h-screen bg-gradient-subtle [--app-header-height:3.2rem]">
      <header className="bg-white/80 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="flex h-[var(--app-header-height)] items-center justify-between gap-2 xl:gap-4 px-4 sm:px-8 lg:px-[1in]">
          <div className={isTreeVisualization ? "h-10 w-28 shrink-0 sm:w-44 xl:w-72" : "h-10 w-52 min-w-0 sm:w-72"}>
            <img
              src={topPanel}
              alt="Bosco Decision Trees"
              className="h-full w-full object-cover"
            />
          </div>
          <div ref={setHeaderActions} className="min-w-0 flex-1 overflow-x-auto" />
          <Button
            variant="outline"
            className="h-9 shrink-0"
            onClick={() => {
              authService.logout();
              navigate("/", { replace: true });
            }}
          >
            Sign Out
          </Button>
        </div>
      </header>
      <Outlet context={{ headerActions } satisfies AppLayoutContext} />
    </div>
  );
};
