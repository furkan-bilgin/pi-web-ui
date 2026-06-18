import { create } from "zustand";
import type { SessionState, SessionInfo, SlashCommand } from "../types";

interface SessionStore {
  sessionState: SessionState | null;
  sessions: SessionInfo[];
  slashCommands: SlashCommand[];
  homeDir: string;
  appCwd: string;

  setSessionState: (state: SessionState) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setSlashCommands: (cmds: SlashCommand[]) => void;
  setHomeDir: (dir: string) => void;
  setAppCwd: (cwd: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessionState: null,
  sessions: [],
  slashCommands: [],
  homeDir: "",
  appCwd: "",

  setSessionState: (sessionState) => set({ sessionState }),
  setSessions: (sessions) => set({ sessions }),
  setSlashCommands: (slashCommands) => set({ slashCommands }),
  setHomeDir: (homeDir) => set({ homeDir }),
  setAppCwd: (appCwd) => set({ appCwd }),
}));
