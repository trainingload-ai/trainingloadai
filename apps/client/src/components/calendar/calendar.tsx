import React from "react";
import { CalendarProvider } from "@/components/calendar/contexts/calendar-context";
import { CalendarHeader } from "@/components/calendar/header/calendar-header";
import { CalendarBody } from "@/components/calendar/calendar-body";

import { DndProvider } from "@/components/calendar/contexts/dnd-context";
// import { getEvents, getUsers } from "@/components/calendar/requests";

// async function getCalendarData() {
//   await new Promise((resolve) => setTimeout(resolve, 5000));

//   return {
//     events: await getEvents(),
//     users: await getUsers(),
//   };
// }

export async function Calendar() {
  // const {events, users} = await getCalendarData();

  return (
    <CalendarProvider events={[]} users={[]} view="month">
      <DndProvider>
        <div className="flex h-full w-full flex-col rounded-surface border">
          <CalendarHeader />
          <CalendarBody />
        </div>
      </DndProvider>
    </CalendarProvider>
  );
}
