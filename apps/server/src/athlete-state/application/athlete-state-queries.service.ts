import { Injectable } from '@nestjs/common';
import { AthleteStateRepository } from '../infrastructure/athlete-state.repository';

@Injectable()
export class AthleteStateQueries {
  constructor(private readonly repository: AthleteStateRepository) {}

  latest(userId: string) {
    return this.repository.latestForUser(userId);
  }

  reusable(input: { userId: string; evidenceHash: string }) {
    return this.repository.findReusable(input);
  }
}
