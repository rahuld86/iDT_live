import { Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/authService";
import topPanel from "@/assets/top_panel.png";

export const AppLayout = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-subtle [--app-header-height:3.2rem]">
      <header className="bg-white/80 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="flex h-[var(--app-header-height)] items-center justify-between gap-4 px-4 sm:px-8 lg:px-[1in]">
          <div className="h-10 w-52 min-w-0 sm:w-72">
            <img
              src={topPanel}
              alt="Bosco Decision Trees"
              className="h-full w-full object-cover"
            />
          </div>
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
      <Outlet />
    </div>
  );
};
