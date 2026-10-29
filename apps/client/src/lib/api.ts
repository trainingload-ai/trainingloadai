import { getApiBaseUrl, getRegion } from "./config";
import { isSupportedLocale } from "@/i18n/locales";
import {
  isAbortError,
  parseApiEnvelopeText,
  type ApiEnvelope,
} from "@shared/runtime-reliability";
import { ApiFetchError } from "./api-error";
import { getPendingAuthFailure, handleUnauthorized } from "./auth-failure";
import { notifyAiDataConsentRequired } from "./ai-data-consent-events";
import { isPublicDemoBrowser } from "@/public-demo/public-demo-runtime";

export { ApiFetchError } from "./api-error";

export function parseDownloadFilename(
  contentDisposition: string | null,
): string {
  if (!contentDisposition) return "download";

  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    const value = encoded.trim().replace(/^"|"$/g, "");
    try {
      return decodeURIComponent(value);
    } catch {
      return value || "download";
    }
  }

  return (
    contentDisposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1]?.trim() ||
    contentDisposition.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim() ||
    "download"
  );
}

export type ApiFetchOptions = RequestInit & {
  /**
   * Caller renders a localized inline/action error and does not want the
   * global query error coordinator to show an additional toast.
   */
  suppressErrorToast?: boolean;
  /** Successful responses from operational endpoints may intentionally omit the API envelope. */
  responseFormat?: "envelope" | "raw-json";
};

const getClientLang = (): string => {
  // 客户端语言从 locale 路由段推断，并透传给后端 i18n。
  if (typeof window === "undefined") return "en";
  const pathname = window.location.pathname || "";
  const firstSeg = pathname.split("/").filter(Boolean)[0];
  return isSupportedLocale(firstSeg) ? firstSeg : "en";
};

function getApiFetchBaseUrl(): string {
  // getApiBaseUrl() selects the private/public server origin during SSR and
  // the same-origin Next.js BFF in a browser.
  return getApiBaseUrl();
}

async function renewPublicDemoSession() {
  if (!isPublicDemoBrowser()) return false;
  try {
    const response = await fetch("/api/public-demo/session", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function readApiEnvelope<T>(
  response: Response,
  suppressNotification = false,
): Promise<ApiEnvelope<T>> {
  const raw = await response.text();
  const parsed = parseApiEnvelopeText<T>(raw);
  if (!parsed) {
    if (!response.ok) return {};
    throw new ApiFetchError(
      "Invalid response from server",
      502,
      "INVALID_RESPONSE",
      undefined,
      suppressNotification,
    );
  }

  return parsed;
}

function envelopeErrorCode(envelope: ApiEnvelope<unknown>) {
  return (
    envelope.error_code ||
    envelope.errorCode ||
    (typeof envelope.code === "number" ? String(envelope.code) : undefined)
  );
}

export async function apiFetchErrorFromResponse(
  response: Response,
  suppressNotification = false,
) {
  const envelope = await readApiEnvelope<unknown>(
    response,
    suppressNotification,
  );
  const errorCode = envelopeErrorCode(envelope);
  const consentRequired = notifyAiDataConsentRequired(errorCode);
  return new ApiFetchError(
    envelope.message || `Request failed (${response.status})`,
    response.status,
    errorCode,
    envelope.data,
    suppressNotification || consentRequired,
  );
}

export const apiFetch = async <T = unknown>(
  url: string,
  options?: ApiFetchOptions,
): Promise<T | undefined> => {
  const pendingAuthFailure =
    typeof window === "undefined" ? undefined : getPendingAuthFailure();
  if (pendingAuthFailure) return pendingAuthFailure;

  const {
    suppressErrorToast = false,
    responseFormat = "envelope",
    ...requestOptions
  } = options ?? {};
  // 通用 JSON 请求封装：统一补 region/lang/cookie，并抛出标准化错误。
  // When body is FormData, do not set Content-Type, let browser set it automatically
  const isFormData = requestOptions.body instanceof FormData;

  let response: Response;
  try {
    const executeRequest = () =>
      fetch(`${getApiFetchBaseUrl()}${url}`, {
        ...requestOptions,
        headers: {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          "X-Region": getRegion(),
          "X-Registration-Platform": "WEB",
          ...(getClientLang() ? { "x-lang": getClientLang()! } : {}),
          ...(requestOptions.headers || {}),
        },
        credentials: "include",
      });
    response = await executeRequest();
    if (response.status === 401 && (await renewPublicDemoSession())) {
      response = await executeRequest();
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    const fallback =
      typeof window !== "undefined"
        ? "网络异常，请稍后重试"
        : "Network request failed";
    throw new ApiFetchError(
      fallback,
      0,
      "NETWORK_ERROR",
      undefined,
      suppressErrorToast,
    );
  }

  if (response.ok && responseFormat === "raw-json") {
    const raw = await response.text();
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ApiFetchError(
        "Invalid response from server",
        502,
        "INVALID_RESPONSE",
        undefined,
        suppressErrorToast,
      );
    }
  }

  const res = await readApiEnvelope<T>(response, suppressErrorToast);

  if (response.status === 401) {
    const error = new ApiFetchError(
      res.message || "Unauthorized",
      response.status,
      envelopeErrorCode(res) || "UNAUTHORIZED",
      res.data,
      suppressErrorToast,
    );
    if (typeof window !== "undefined" && !isPublicDemoBrowser())
      return handleUnauthorized(error);
    throw error;
  }

  if (!response.ok) {
    const msg =
      (typeof res?.message === "string" && res.message) ||
      `Request failed (${response.status})`;
    const errorCode = envelopeErrorCode(res);
    const consentRequired = notifyAiDataConsentRequired(errorCode);
    throw new ApiFetchError(
      msg,
      response.status,
      errorCode,
      res.data,
      suppressErrorToast || consentRequired,
    );
  }

  return res.data;
};

export const apiDownloadFetch = async (url: string, options?: RequestInit) => {
  const pendingAuthFailure =
    typeof window === "undefined" ? undefined : getPendingAuthFailure();
  if (pendingAuthFailure) return pendingAuthFailure;

  // 下载接口保留原始 blob，不走统一 response.data 解包。
  let response: Response;
  try {
    const executeRequest = () =>
      fetch(`${getApiFetchBaseUrl()}${url}`, {
        ...options,
        headers: {
          "X-Region": getRegion(),
          ...(getClientLang() ? { "x-lang": getClientLang()! } : {}),
          ...(options?.headers || {}),
        },
        credentials: "include",
      });
    response = await executeRequest();
    if (response.status === 401 && (await renewPublicDemoSession())) {
      response = await executeRequest();
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiFetchError("Network request failed", 0, "NETWORK_ERROR");
  }
  if (response.status === 401) {
    const error = new ApiFetchError("Unauthorized", 401, "UNAUTHORIZED");
    if (typeof window !== "undefined" && !isPublicDemoBrowser())
      return handleUnauthorized(error);
    throw error;
  }
  if (!response.ok) {
    const res = await readApiEnvelope<unknown>(response);
    throw new ApiFetchError(
      res.message || `API request failed (${response.status})`,
      response.status,
      envelopeErrorCode(res),
      res.data,
    );
  }
  const blob = await response.blob();
  const filename = parseDownloadFilename(
    response.headers.get("Content-Disposition"),
  );

  return { blob, filename };
};
