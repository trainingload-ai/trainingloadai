import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ACCOUNT_DELETION_REQUESTED_EVENT,
  type AccountDeletionRequestedEvent,
} from '@/api/user/events/account-deletion.events';
import { CalendarService } from './calendar.service';

@Injectable()
export class CalendarAccountDeletionListener {
  constructor(private readonly calendar: CalendarService) {}

  @OnEvent(ACCOUNT_DELETION_REQUESTED_EVENT)
  handle(event: AccountDeletionRequestedEvent) {
    return this.calendar.deleteAllForUser(event.userId);
  }
}
