import { create } from "zustand";

interface UiStore {
  overlayImage: string | null;
  setOverlayImage: (src: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  overlayImage: null,
  setOverlayImage: (src) => set({ overlayImage: src }),
}));
