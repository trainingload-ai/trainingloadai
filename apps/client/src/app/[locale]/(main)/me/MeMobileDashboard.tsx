"use client";

import { Menu } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth";
import {
  MobileMeActivityProvider,
  MobileMeDashboard,
} from "@/components/mobile-app/components/MobileMeDashboard";
import { MobileMeMenu } from "@/components/mobile-app/components/MobileMeMenu";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import { MobileSidePageTrigger } from "@/components/mobile-app/components/MobileSidePageTrigger";
import { useUnreadNotificationCount } from "@/components/mobile-app/hooks/use-unread-notification-count";
import { useMobileEdgeSwipe } from "@/components/mobile-app/hooks/use-mobile-edge-swipe";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { useSelfHostSessionPolicy } from "@/api/self-host-bootstrap";

export function MeMobileDashboard() {
  const publicDemo = usePublicDemo();
  const { canSignOut } = useSelfHostSessionPolicy();
  const locale = useLocale();
  const t = useTranslations("V2MePage");
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { count: unreadCount } = useUnreadNotificationCount();
  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current);
  }, []);

  useMobileEdgeSwipe(() => setMenuOpen(true), !menuOpen);
  useMobileNavigation({
    leading: (
      <MobileSidePageTrigger
        onToggle={toggleMenu}
        openLabel={t("mobile.menu")}
        badge={
          unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full bg-red-500 ring-2 ring-background" />
          ) : null
        }
      >
        <Menu className="size-5" aria-hidden="true" />
      </MobileSidePageTrigger>
    ),
    trailing: <span />,
  });

  const signOut = async () => {
    if (publicDemo.active || signingOut) return;
    setSigningOut(true);
    await queryClient.cancelQueries();
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => window.location.replace(`/${locale}/login`),
        },
      });
      setMenuOpen(false);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <MobileMeActivityProvider>
      <MobileMeDashboard />
      <MobileMeMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        signingOut={signingOut}
        showSignOut={canSignOut}
        signOutDisabled={publicDemo.active}
        onSignOut={() => void signOut()}
        unreadCount={unreadCount}
      />
    </MobileMeActivityProvider>
  );
}
