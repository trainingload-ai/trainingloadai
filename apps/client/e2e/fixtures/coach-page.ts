import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    coachStreamFixture: {
      requests: number;
      send: (frames: unknown[]) => void;
      finish: (textId?: string | null) => void;
      lastBody: Record<string, unknown>;
    };
  }
}

export async function openCoachFixture(
  page: Page,
  storedRows?: Array<Record<string, unknown>>,
  options: {
    readyText?: string;
    empty?: boolean;
    sessions?: Array<Record<string, unknown>>;
    thinkingEnabled?: boolean;
    membershipPlan?: "FREE" | "PLUS" | "PRO";
    userName?: string;
    userEmail?: string;
    navigate?: boolean;
  } = {},
) {
  let historyReads = 0;
  if (options.thinkingEnabled !== undefined) {
    await page.addInitScript((enabled) => {
      localStorage.setItem("ai-coach-v2-thinking-enabled", enabled ? "1" : "0");
    }, options.thinkingEnabled);
  }
  const sid = "coach-stream-fixture";
  const createdAt = "2026-09-26T00:00:00.000Z";
  const membershipPlan = options.membershipPlan ?? "PLUS";
  const membershipActive = membershipPlan !== "FREE";
  const credits = {
    balanceCredits: 10000,
    debtCredits: 0,
    activeAction: null,
    membership: {
      active: membershipActive,
      plan: membershipPlan,
      provider: null,
      periodEnd: null,
    },
    subscription: {
      grantedCredits: 10000,
      usedCredits: 0,
      availableCredits: 10000,
      expiresAt: null,
    },
    topUp: { availableCredits: 0, lockedCredits: 0, expiresAt: null },
    gift: { availableCredits: 0, lockedCredits: 0, expiresAt: null },
    nextExpiresAt: null,
    ruleVersion: "fixture",
  };
  const capability = (
    name: string,
    state: "enabled" | "disabled" | "not_configured" = "enabled",
    provider = "fixture",
  ) => ({
    name,
    required: name === "database" || name === "storage" || name === "authentication",
    state,
    provider,
    code: state === "enabled" ? "AVAILABLE" : "DISABLED",
    issues: [],
  });
  const runtimeCapabilities = {
    schemaVersion: 1,
    deployment: "self-host",
    edition: "self-host",
    accountMode: "single-owner",
    singleOwner: true,
    apiVersion: 1,
    version: "readme-fixture",
    mode: "core-local",
    ready: true,
    startupErrors: [],
    startupWarnings: [],
    map: {
      provider: "none",
      styleUrl: null,
      tileUrl: null,
      attribution: null,
      maxZoom: 18,
      publicToken: null,
      tilePolicy: { browserOnly: false, bulkDownloadAllowed: false },
    },
    authenticationMethods: {
      emailPassword: false,
      registration: { enabled: false, requiresEmailVerification: false },
      emailVerification: false,
      passwordReset: false,
      social: {},
    },
    capabilities: {
      database: capability("database", "enabled", "postgresql"),
      storage: capability("storage", "enabled", "local-filesystem"),
      authentication: capability("authentication", "enabled", "local-owner"),
      maps: capability("maps", "disabled", "none"),
      elevation: capability("elevation", "disabled", "none"),
      mail: capability("mail", "disabled", "none"),
      ai: capability("ai", "enabled", "owner-managed"),
      billing: capability("billing", "disabled", "none"),
      telemetry: capability("telemetry", "disabled", "none"),
      weather: capability("weather", "disabled", "none"),
      "third-party-sync": capability("third-party-sync", "disabled", "none"),
      "intervals-icu-api-key": capability(
        "intervals-icu-api-key",
        "enabled",
        "intervals-icu",
      ),
      "agent-api": capability("agent-api", "disabled", "none"),
      "public-demo": capability("public-demo", "disabled", "none"),
    },
  };

  // Use the real Next.js page, SDK and renderer; only external data is faked.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/proxy/, "");
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/runtime/capabilities") return json(runtimeCapabilities);
    if (path === "/api/self-host/session/policy")
      return json({
        data: {
          schemaVersion: 1,
          accessMode: "local-owner",
          isOwner: true,
          canSignOut: false,
          canDeleteAccount: false,
        },
      });
    if (path === "/ai/data-consent")
      return json({
        data: {
          state: "GRANTED",
          granted: true,
          promptRequired: false,
          required: true,
          version: "readme-fixture",
          provider: "deepseek",
          recipient: "Owner-selected AI provider",
          decidedAt: createdAt,
        },
      });
    if (path.endsWith("/auth/get-session")) {
      return json({
        user: {
          id: "fixture-user",
          name: options.userName ?? "测试用户",
          email: options.userEmail ?? "stream@example.test",
          emailVerified: true,
          createdAt,
          updatedAt: createdAt,
        },
        session: {
          id: "fixture-session",
          userId: "fixture-user",
          token: "fixture",
          expiresAt: "2099-01-01T00:00:00Z",
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
    if (path === "/ai/entitlements")
      return json({
        data: {
          plan: membershipPlan,
          membership: {
            active: membershipActive,
            plan: membershipPlan,
            source: membershipActive ? "PAID_SUBSCRIPTION" : "NONE",
            periodStart: membershipActive ? createdAt : null,
            periodEnd: null,
            cancelAtPeriodEnd: false,
            entitlementSource: membershipActive ? "PAID_SUBSCRIPTION" : null,
          },
          dataConsent: { granted: true },
          credits,
          reviewFeatures: {},
        },
      });
    if (path === "/billing/credit-packs")
      return json({
        data: {
          eligible: membershipActive,
          membershipPlan,
          providers: { managed: true },
          packs: [
            {
              pack: "CREDITS_5000",
              credits: 5000,
              amountMinor: 699,
              currency: "USD",
              validMonths: 12,
              providers: { managed: true },
            },
            {
              pack: "CREDITS_15000",
              credits: 15000,
              amountMinor: 1799,
              currency: "USD",
              validMonths: 12,
              providers: { managed: true },
            },
            {
              pack: "CREDITS_40000",
              credits: 40000,
              amountMinor: 3999,
              currency: "USD",
              validMonths: 12,
              providers: { managed: true },
            },
          ],
        },
      });
    if (/\/ai\/coach\/sessions\/[^/]+\/messages$/.test(path)) {
      historyReads += 1;
      return json({
        data: storedRows ?? [
          { id: "history-user", role: "user", content: "你好", createdAt },
          {
            id: "history-assistant",
            role: "assistant",
            content: "这是已经保存的历史回复。",
            createdAt,
          },
        ],
      });
    }
    if (path === "/ai/coach/sessions")
      return json({
        data: {
          items: options.sessions ?? [
            {
              id: sid,
              title: "流式渲染回归",
              updatedAt: createdAt,
              pinnedAt: null,
            },
          ],
          nextOffset: null,
        },
      });
    if (path === "/users/is-new-user") return json({ data: false });
    if (path === "/ai/credits/summary") return json({ data: credits });
    if (path === "/notifications")
      return json({ data: { items: [], total: 0 } });
    if (url.pathname.startsWith("/api/") || url.port === "3001")
      return json({ data: [] });
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      return route.abort();
    return route.continue();
  });

  await page.addInitScript(() => {
    const nativeFetch = window.fetch;
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    window.coachStreamFixture = {
      requests: 0,
      lastBody: {},
      send(frames) {
        for (const frame of frames) {
          streamController.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`),
          );
        }
      },
      finish(textId = "coach-text-1") {
        this.send([
          ...(textId ? [{ type: "text-end", id: textId }] : []),
          { type: "finish-step" },
          { type: "finish", finishReason: "stop" },
        ]);
        streamController.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        streamController.close();
      },
    };
    window.fetch = async (...args) => {
      const input = args[0];
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("/api/ai-coach-v2")) return nativeFetch(...args);
      window.coachStreamFixture.requests += 1;
      window.coachStreamFixture.lastBody = JSON.parse(
        String(args[1]?.body ?? "{}"),
      );
      return new Response(
        new ReadableStream({
          start(controller) {
            streamController = controller;
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
          },
        },
      );
    };
  });

  if (options.navigate === false) return () => historyReads;

  await page.goto(`/zh/ai-coach?sid=${sid}`);
  // The development-only Query devtools launcher overlaps Send at tablet widths.
  await page.addStyleTag({
    content:
      ".tsqd-parent-container, nextjs-portal { display: none !important; }",
  });
  if (options.empty)
    await expect(page.getByRole("textbox").first()).toBeVisible();
  else
    await expect(
      page
        .getByText(options.readyText ?? "这是已经保存的历史回复。", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
  return () => historyReads;
}
