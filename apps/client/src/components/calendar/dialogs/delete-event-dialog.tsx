import {useTranslations} from "next-intl";
import {useCalendar} from "@/components/calendar/contexts/calendar-context";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {TrashIcon} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog";

interface DeleteEventDialogProps {
    eventId: number;
}

export default function DeleteEventDialog(
    {
        eventId
    }: DeleteEventDialogProps
) {
    const t = useTranslations("CalendarDialogs")

    const {removeEvent} = useCalendar()

    const deleteEvent = () => {
        try {
            removeEvent(eventId);
            toast.success(t("deleteSuccess"));
        } catch {
            toast.error(t("deleteError"));
        }
    }

    if (!eventId) {
        return null;
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive"
                >
                    <TrashIcon />
                    {t("delete")}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("deleteDescription")}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteEvent}>{t("continue")}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
