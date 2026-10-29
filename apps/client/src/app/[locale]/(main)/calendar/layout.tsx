const CalendarLayout = async ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
};

export default CalendarLayout;
