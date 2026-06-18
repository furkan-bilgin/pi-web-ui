import { create } from "zustand";
import type { ConnectionStatus } from "../types";

interface ConnectionStore {
  status: ConnectionStatus;
  lastSeq: number | null;
  sessionFile: string | null;

  setStatus: (status: ConnectionStatus) => void;
  setLastSeq: (seq: number | null) => void;
  setSessionFile: (file: string | null) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: "disconnected",
  lastSeq: null,
  sessionFile: null,

  setStatus: (status) => set({ status }),
  setLastSeq: (seq) => set({ lastSeq: seq }),
  setSessionFile: (file) => set({ sessionFile: file }),
}));
