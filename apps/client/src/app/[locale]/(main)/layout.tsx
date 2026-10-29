import { MainAppShell } from "@/components/layout/MainAppShell";
import { RequireSignedIn } from "@/components/auth/RequireSignedIn";
import { PublicDemoProvider } from "@/public-demo/public-demo-provider";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <PublicDemoProvider>
      <RequireSignedIn>
        <MainAppShell>{children}</MainAppShell>
      </RequireSignedIn>
    </PublicDemoProvider>
  );
};

export default MainLayout;
