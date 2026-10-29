"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; resetError: () => void }>;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error}
            resetError={this.resetError}
          />
        );
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error?: Error;
  resetError: () => void;
}

function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const t = useTranslations("ErrorBoundary");

  return (
    <div className="flex items-center justify-center min-h-[200px] p-4">
      <div className="max-w-md p-4 border border-red-200 bg-red-50 rounded-md">
        <div className="flex items-center mb-2">
          <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
          <h3 className="text-sm font-medium text-red-800">{t("title")}</h3>
        </div>
        <p className="text-sm text-red-700 mb-4">
          {error?.message || t("unknownError")}
        </p>
        <Button onClick={resetError} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}

// Simple error display component
interface ErrorDisplayProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ error, onRetry, className }: ErrorDisplayProps) {
  const t = useTranslations("ErrorBoundary");

  if (!error) return null;

  return (
    <div
      className={`p-4 border border-red-200 bg-red-50 rounded-md ${className}`}
    >
      <div className="flex items-center mb-2">
        <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
        <h3 className="text-sm font-medium text-red-800">{t("loadFailed")}</h3>
      </div>
      <p className="text-sm text-red-700 mb-2">
        {error.message || t("loadFailedDescription")}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

export default ErrorBoundary;
