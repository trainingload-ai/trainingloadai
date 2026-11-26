import { PanelLeft } from "lucide-react";

export function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  if (!collapsed) return <PanelLeft aria-hidden="true" />;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 8v8" />
    </svg>
  );
}
