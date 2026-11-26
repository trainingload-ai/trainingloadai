import { Injectable } from '@nestjs/common';
import { PlanWriteSupport } from './plan-write.support';

@Injectable()
export class PlanWorkoutCommandService {
  constructor(private readonly write: PlanWriteSupport) {}

  listScheduledWorkouts(
    userId: string,
    start?: string | null,
    end?: string | null,
  ) {
    return this.write.listScheduledWorkouts(userId, start, end);
  }

  createIndependentWorkout(...args: Parameters<PlanWriteSupport['createIndependentWorkout']>) {
    return this.write.createIndependentWorkout(...args);
  }

  createIndependentWorkoutDraft(...args: Parameters<PlanWriteSupport['createIndependentWorkoutDraft']>) {
    return this.write.createIndependentWorkoutDraft(...args);
  }

  getIndependentWorkoutDraft(...args: Parameters<PlanWriteSupport['getIndependentWorkoutDraft']>) {
    return this.write.getIndependentWorkoutDraft(...args);
  }

  transitionIndependentWorkoutDraft(...args: Parameters<PlanWriteSupport['transitionIndependentWorkoutDraft']>) {
    return this.write.transitionIndependentWorkoutDraft(...args);
  }

  updateIndependentWorkout(...args: Parameters<PlanWriteSupport['updateIndependentWorkout']>) {
    return this.write.updateIndependentWorkout(...args);
  }

  createIndependentWorkoutInTransaction(
    ...args: Parameters<
      PlanWriteSupport['createIndependentWorkoutInTransaction']
    >
  ) {
    return this.write.createIndependentWorkoutInTransaction(...args);
  }

  getIndependentWorkoutDetail(userId: string, workoutId: string) {
    return this.write.getIndependentWorkoutDetail(userId, workoutId);
  }

  deleteIndependentWorkout(userId: string, workoutId: string) {
    return this.write.deleteIndependentWorkout(userId, workoutId);
  }

  createPlanWorkout(
    ...args: Parameters<PlanWriteSupport['createPlanWorkout']>
  ) {
    return this.write.createPlanWorkout(...args);
  }

  attachWorkoutToPlan(
    ...args: Parameters<PlanWriteSupport['attachWorkoutToPlan']>
  ) {
    return this.write.attachWorkoutToPlan(...args);
  }

  getWorkoutDetail(
    userId: string,
    planId: string,
    workoutId: string,
    db?: Parameters<PlanWriteSupport['getWorkoutDetail']>[3],
  ) {
    return this.write.getWorkoutDetail(userId, planId, workoutId, db);
  }

  updateWorkoutStatus(
    ...args: Parameters<PlanWriteSupport['updateWorkoutStatus']>
  ) {
    return this.write.updateWorkoutStatus(...args);
  }

  updateWorkout(...args: Parameters<PlanWriteSupport['updateWorkout']>) {
    return this.write.updateWorkout(...args);
  }

  addWorkout(...args: Parameters<PlanWriteSupport['addWorkout']>) {
    return this.write.addWorkout(...args);
  }

  updateWorkouts(...args: Parameters<PlanWriteSupport['updateWorkouts']>) {
    return this.write.updateWorkouts(...args);
  }

  notifyWorkoutChanges(
    ...args: Parameters<PlanWriteSupport['notifyWorkoutChanges']>
  ) {
    return this.write.notifyWorkoutChanges(...args);
  }
}
