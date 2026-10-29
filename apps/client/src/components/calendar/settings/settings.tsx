"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DotIcon,
  MoonIcon,
  PaletteIcon,
  SettingsIcon,
  SunMediumIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { TCalendarView } from "@/components/calendar/types";

export function Settings() {
  const t = useTranslations("CalendarSettings");
  const {
    badgeVariant,
    setBadgeVariant,
    use24HourFormat,
    toggleTimeFormat,
    view,
    setView,
    agendaModeGroupBy,
    setAgendaModeGroupBy,
  } = useCalendar();
  const { theme, setTheme } = useTheme();

  const isDarkMode = theme === "dark";
  const isDotVariant = badgeVariant === "dot";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <SettingsIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            {t("useDarkMode")}
            <DropdownMenuShortcut>
              <Switch
                checked={isDarkMode}
                onCheckedChange={(checked) =>
                  setTheme(checked ? "dark" : "light")
                }
              >
                {isDarkMode ? (
                  <MoonIcon className="h-4 w-4" />
                ) : (
                  <SunMediumIcon className="h-4 w-4" />
                )}
              </Switch>
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            {t("useDotBadge")}
            <DropdownMenuShortcut>
              <Switch
                checked={isDotVariant}
                onCheckedChange={(checked) =>
                  setBadgeVariant(checked ? "dot" : "colored")
                }
              >
                {isDotVariant ? (
                  <DotIcon className="w-4 h-4" />
                ) : (
                  <PaletteIcon className="w-4 h-4" />
                )}
              </Switch>
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            {t("use24HourFormat")}
            <DropdownMenuShortcut>
              <Switch
                checked={use24HourFormat}
                onCheckedChange={toggleTimeFormat}
              >
                {use24HourFormat ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-clock-24"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M3 12a9 9 0 0 0 5.998 8.485m12.002 -8.485a9 9 0 1 0 -18 0" />
                    <path d="M12 7v5" />
                    <path d="M12 15h2a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-1a1 1 0 0 0 -1 1v1a1 1 0 0 0 1 1h2" />
                    <path d="M18 15v2a1 1 0 0 0 1 1h1" />
                    <path d="M21 15v6" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-clock-12"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M3 12a9 9 0 0 0 9 9m9 -9a9 9 0 1 0 -18 0" />
                    <path d="M12 7v5l.5 .5" />
                    <path d="M18 15h2a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-1a1 1 0 0 0 -1 1v1a1 1 0 0 0 1 1h2" />
                    <path d="M15 21v-6" />
                  </svg>
                )}
              </Switch>
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="w-56">
          <DropdownMenuLabel>{t("defaultView")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={view}
            onValueChange={(value) => setView(value as TCalendarView)}
          >
            <DropdownMenuRadioItem value="day">{t("view.day")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="week">{t("view.week")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="month">{t("view.month")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="year">{t("view.year")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="agenda">{t("view.agenda")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("agendaViewGroupBy")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={agendaModeGroupBy}
            onValueChange={(value) =>
              setAgendaModeGroupBy(value as "date" | "color")
            }
          >
            <DropdownMenuRadioItem value="date">{t("groupBy.date")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="color">{t("groupBy.color")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
