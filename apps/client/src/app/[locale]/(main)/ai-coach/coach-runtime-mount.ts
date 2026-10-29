export type CoachRuntimeMountState = {
  mountedSid: string;
  internallyPersistedSid: string | null;
  generation: number;
};

export function resolveCoachRuntimeMount(
  state: CoachRuntimeMountState,
  currentSid: string,
) {
  const preservesAllocatedRuntime =
    Boolean(currentSid) && state.internallyPersistedSid === currentSid;
  if (preservesAllocatedRuntime) {
    return { ...state, preservesAllocatedRuntime };
  }

  const changedConversation =
    state.mountedSid !== currentSid || state.internallyPersistedSid !== null;
  return {
    mountedSid: currentSid,
    internallyPersistedSid: null,
    generation: state.generation + (changedConversation ? 1 : 0),
    preservesAllocatedRuntime,
  };
}
