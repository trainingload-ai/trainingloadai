import { create } from "zustand";

type DashboardEditModeStore = {
  isEditing: boolean;
  isSaving: boolean;
  startEditing: () => void;
  cancelEditing: () => void;
  setSaving: (isSaving: boolean) => void;
};

export const useDashboardEditMode = create<DashboardEditModeStore>((set) => ({
  isEditing: false,
  isSaving: false,
  startEditing: () => set({ isEditing: true }),
  cancelEditing: () => set({ isEditing: false, isSaving: false }),
  setSaving: (isSaving) => set({ isSaving }),
}));
