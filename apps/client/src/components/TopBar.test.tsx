import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopBar } from "./TopBar";

const mocks = vi.hoisted(() => ({
  canSignOut: true,
  pathname: "/usage",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ cancelQueries: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
}));

vi.mock("@/lib/auth", () => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock("@/public-demo/public-demo-provider", () => ({
  usePublicDemo: () => ({ active: false }),
}));

vi.mock("@/public-demo/use-viewer-session", () => ({
  useViewerSession: () => ({
    data: { user: { name: "victor" } },
    isPending: false,
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    passHref: _passHref,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    passHref?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/config", () => ({
  getBaseUrl: () => "/",
  isAuthUiEnabled: () => true,
}));

vi.mock("@/components/notifications/NotificationDrawer", () => ({
  NotificationDrawer: () => null,
}));

vi.mock("@/components/change-theme-button", () => ({
  ChangeThemeButton: () => null,
}));

vi.mock("@/components/locale-switcher", () => ({
  default: () => null,
}));

vi.mock("./ui/ThemeLogo", () => ({
  default: () => <span>Trainingload.ai</span>,
}));

vi.mock("@deployment/managed-ui", () => ({
  useGuestAccessText: () => (key: string) => key,
  ManagedAccountMenuItem: () => null,
  DeploymentAccountBadge: () => null,
  DeploymentUnauthenticatedAccountAction: () => null,
}));

vi.mock("@/api/self-host-bootstrap", () => ({
  useSelfHostSessionPolicy: () => ({
    canSignOut: mocks.canSignOut,
  }),
}));

vi.mock("@/i18n/routing", () => ({
  localeNativeLabel: (locale: string) => locale,
  routing: { locales: ["zh", "en"] },
}));

vi.mock("@/lib/locale-preference", () => ({
  persistLocalePreference: vi.fn(),
}));

vi.mock("@/lib/locale-navigation", () => ({
  localeNavigationHref: vi.fn(),
  localeNavigationQuery: vi.fn(() => ({})),
  replaceBrowserLocation: vi.fn(),
}));

describe("TopBar account presentation", () => {
  beforeEach(() => {
    mocks.canSignOut = true;
    mocks.pathname = "/usage";
  });

  it("keeps sign-out for a credential session", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    const accountTriggers = await screen.findAllByLabelText("account");
    await user.click(accountTriggers[0]!);
    expect(await screen.findByText("signOut")).toBeInTheDocument();
  });

  it("does not expose sign-out for a local-owner session", async () => {
    const user = userEvent.setup();
    mocks.canSignOut = false;

    render(<TopBar />);

    const accountTriggers = await screen.findAllByLabelText("account");
    await user.click(accountTriggers[0]!);
    expect(await screen.findByText("settings")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("signOut")).toBeNull());
  });

  it("closes the account menu after client navigation", async () => {
    const user = userEvent.setup();
    const view = render(<TopBar />);

    const accountTriggers = await screen.findAllByLabelText("account");
    await user.click(accountTriggers[0]!);
    expect(await screen.findByText("signOut")).toBeInTheDocument();

    mocks.pathname = "/account";
    view.rerender(<TopBar reloadOnLocaleChange />);

    await waitFor(() => expect(screen.queryByText("signOut")).toBeNull());
  });
});
