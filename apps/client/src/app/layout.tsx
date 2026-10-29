import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

// Required when `app/not-found.tsx` exists — see next-intl error-files docs.
export default function RootLayout({ children }: Props) {
  return children;
}
