"use client";

import * as React from "react";
import { usePathname } from "@/i18n/navigation";

export type MobileNavigationConfig = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  backHref?: string;
  hidden?: boolean;
};
type RegisteredConfig = MobileNavigationConfig & {
  owner: string;
  pathname: string;
};
const Context = React.createContext<{
  config: RegisteredConfig | null;
  register: (config: RegisteredConfig) => void;
  unregister: (owner: string) => void;
} | null>(null);

export function MobileNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfig] = React.useState<RegisteredConfig | null>(null);
  const register = React.useCallback(
    (next: RegisteredConfig) => setConfig(next),
    [],
  );
  const unregister = React.useCallback(
    (owner: string) =>
      setConfig((current) => (current?.owner === owner ? null : current)),
    [],
  );
  const value = React.useMemo(
    () => ({ config, register, unregister }),
    [config, register, unregister],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMobileNavigation(config: MobileNavigationConfig) {
  const context = React.useContext(Context);
  const register = context?.register;
  const unregister = context?.unregister;
  const pathname = usePathname();
  const owner = React.useId();
  const configRef = React.useRef(config);
  configRef.current = config;
  React.useEffect(() => {
    if (!register || !unregister) return;
    register({ ...configRef.current, owner, pathname });
    return () => unregister(owner);
  }, [owner, pathname, register, unregister]);
}

export function useRegisteredMobileNavigation() {
  const context = React.useContext(Context);
  const pathname = usePathname();
  return context?.config?.pathname === pathname ? context.config : null;
}
