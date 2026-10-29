import { TopBar } from "./TopBar";

export function StandardPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <TopBar />
      <main className="flex flex-col items-center p-4">
        <div className="w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
