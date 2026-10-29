"use client";

import {parseISO} from "date-fns";
import {Calendar, Clock, Text, User} from "lucide-react";
import {useLocale, useTranslations} from "next-intl";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import {ScrollArea} from "@/components/ui/scroll-area";

import type {IEvent} from "@/components/calendar/interfaces";
import {ReactNode} from "react";
import {AddEditEventDialog} from "@/components/calendar/dialogs/add-edit-event-dialog";
import {Button} from "@/components/ui/button";
import {toast} from "sonner";
import {formatTime} from "@/components/calendar/helpers";
import {useCalendar} from "@/components/calendar/contexts/calendar-context";

interface IProps {
    event: IEvent;
    children: ReactNode;
}

export function EventDetailsDialog({event, children}: IProps) {
    const t = useTranslations("CalendarDialogs")
    const locale = useLocale()
    const startDate = parseISO(event.startDate);
    const endDate = parseISO(event.endDate);
    const {use24HourFormat, removeEvent} = useCalendar()
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
    })

    const deleteEvent = (eventId : number) => {
        try {
            removeEvent(eventId);
            toast.success(t("deleteSuccess"));
        }catch {
            toast.error(t("deleteError"));
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{event.title}</DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[80vh]">
                    <div className="space-y-4 p-4">
                        <div className="flex items-start gap-2">
                            <User className="mt-1 size-4 shrink-0 text-muted-foreground"/>
                            <div>
                                <p className="text-sm font-medium">{t("responsible")}</p>
                                <p className="text-sm text-muted-foreground">
                                    {event.user.name}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-2">
                            <Calendar className="mt-1 size-4 shrink-0 text-muted-foreground"/>
                            <div>
                                <p className="text-sm font-medium">{t("startDate")}</p>
                                <p className="text-sm text-muted-foreground">
                                    {dateFormatter.format(startDate)}
                                    <span className="mx-1">
                                        {t("at")}
                                    </span>
                                    {formatTime(parseISO(event.startDate), use24HourFormat)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-2">
                            <Clock className="mt-1 size-4 shrink-0 text-muted-foreground"/>
                            <div>
                                <p className="text-sm font-medium">{t("endDate")}</p>
                                <p className="text-sm text-muted-foreground">
                                    {dateFormatter.format(endDate)}
                                    <span className="mx-1">
                                        {t("at")}
                                    </span>
                                    {formatTime(parseISO(event.endDate), use24HourFormat)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-2">
                            <Text className="mt-1 size-4 shrink-0 text-muted-foreground"/>
                            <div>
                                <p className="text-sm font-medium">{t("description")}</p>
                                <p className="text-sm text-muted-foreground">
                                    {event.description}
                                </p>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <div className="flex justify-end gap-2">
                    <AddEditEventDialog event={event}>
                        <Button variant="outline">
                            {t("edit")}
                        </Button>
                    </AddEditEventDialog>
                    <Button variant="destructive" onClick={
                        () => {
                            deleteEvent(event.id);
                        }
                    }>
                        {t("delete")}
                    </Button>
                </div>
                <DialogClose/>
            </DialogContent>
        </Dialog>
    );
}
