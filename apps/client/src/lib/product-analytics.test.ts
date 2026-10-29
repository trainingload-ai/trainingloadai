import {
  isLocalAnalyticsHostname,
  isSelfHostOperationEventName,
  toSelfHostGa4OperationName,
} from "@shared/product-analytics";

describe("isLocalAnalyticsHostname", () => {
  it.each([
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "0.0.0.0",
    "192.168.31.131",
    "10.0.0.8",
    "172.16.0.1",
    "172.31.255.254",
    "169.254.1.2",
    "::1",
    "[::1]",
    "fe80::1",
    "fd00::1",
    "trainingload.local",
  ])("treats %s as local", (hostname) => {
    expect(isLocalAnalyticsHostname(hostname)).toBe(true);
  });

  it.each([
    "trainingload.ai",
    "app.trainingload.ai",
    "dev.trainingload.ai",
    "172.15.0.1",
    "172.32.0.1",
  ])("allows analytics on %s", (hostname) => {
    expect(isLocalAnalyticsHostname(hostname)).toBe(false);
  });
});

describe("self-host operation analytics contract", () => {
  it("only accepts fixed operation names", () => {
    expect(isSelfHostOperationEventName("onboarding_started")).toBe(true);
    expect(isSelfHostOperationEventName("activity_123456_opened")).toBe(false);
    expect(isSelfHostOperationEventName("training_value_recorded")).toBe(false);
  });

  it("maps page views to a route-free operation", () => {
    expect(toSelfHostGa4OperationName("$pageview")).toBe("screen_opened");
  });
});
