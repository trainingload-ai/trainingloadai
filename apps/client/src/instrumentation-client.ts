import { capturePendingAccessToken } from "@deployment/managed-ui";
import { initializeDeploymentAnalytics } from "@deployment/analytics";

// Deployment extensions may consume sensitive URL fragments before an
// analytics implementation can observe `location.href`.
capturePendingAccessToken();

initializeDeploymentAnalytics();
