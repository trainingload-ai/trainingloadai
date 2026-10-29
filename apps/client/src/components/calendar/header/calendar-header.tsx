"use client";

import {
  CalendarRange,
  Columns,
  Grid2X2,
  Grid3X3,
  LayoutList,
  List,
  Plus,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  buttonHover,
  slideFromLeft,
  slideFromRight,
} from "@/components/calendar/animations";

import { UserSelect } from "@/components/calendar/header/user-select";
import { TodayButton } from "@/components/calendar/header/today-button";
import { DateNavigator } from "@/components/calendar/header/date-navigator";
import { AddEditEventDialog } from "@/components/calendar/dialogs/add-edit-event-dialog";
import FilterEvents from "@/components/calendar/header/filter";

import { ButtonGroup } from "@/components/ui/button-group";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { Toggle } from "@/components/ui/toggle";
import { Settings } from "@/components/calendar/settings/settings";

export const MotionButton = motion.create(Button);

export function CalendarHeader() {
  const t = useTranslations("CalendarHeader");
  const { view, setView, events } = useCalendar();

  return (
    <div className="flex flex-col gap-4 border-b p-4 md:flex-row md:items-center md:justify-between">
      <motion.div
        className="flex items-center gap-3"
        variants={slideFromLeft}
        initial="initial"
        animate="animate"
        transition={{ type: "spring", stiffness: 100, damping: 10 }}
      >
        <TodayButton />
        <DateNavigator view={view} events={events} />
      </motion.div>

      <motion.div
        className="flex flex-col gap-4 md:flex-row md:items-center md:gap-1.5"
        variants={slideFromRight}
        initial="initial"
        animate="animate"
        transition={{ type: "spring", stiffness: 100, damping: 10 }}
      >
        <div className="options flex-wrap flex items-center gap-4 md:gap-2">
          <FilterEvents />
          <MotionButton
            variant="outline"
            onClick={() => setView("agenda")}
            asChild
            variants={buttonHover}
            whileHover="hover"
            whileTap="tap"
          >
            <Toggle className="relative">
              {view === "agenda" ? (
                <>
                  <CalendarRange />
                  <span className="absolute -right-1 -top-1 size-3 rounded-full bg-brand"></span>
                </>
              ) : (
                <LayoutList />
              )}
            </Toggle>
          </MotionButton>
          <ButtonGroup className="flex">
            <MotionButton
              aria-label={t("viewByDay")}
              onClick={() => {
                setView("day");
              }}
              variants={buttonHover}
              whileHover="hover"
              whileTap="tap"
            >
              <List className="h-4 w-4" />
            </MotionButton>

            <MotionButton
              aria-label={t("viewByWeek")}
              onClick={() => setView("week")}
              variants={buttonHover}
              whileHover="hover"
              whileTap="tap"
            >
              <Columns className="h-4 w-4" />
            </MotionButton>

            <MotionButton
              aria-label={t("viewByMonth")}
              onClick={() => setView("month")}
              variants={buttonHover}
              whileHover="hover"
              whileTap="tap"
            >
              <Grid3X3 className="h-4 w-4" />
            </MotionButton>
            <MotionButton
              aria-label={t("viewByYear")}
              onClick={() => setView("year")}
              variants={buttonHover}
              whileHover="hover"
              whileTap="tap"
            >
              <Grid2X2 className="h-4 w-4" />
            </MotionButton>
          </ButtonGroup>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-1.5">
          <UserSelect />

          <AddEditEventDialog>
            <MotionButton
              variants={buttonHover}
              whileHover="hover"
              whileTap="tap"
            >
              <Plus className="h-4 w-4" />
              Add Event
            </MotionButton>
          </AddEditEventDialog>
        </div>
        <Settings />
      </motion.div>
    </div>
  );
}
