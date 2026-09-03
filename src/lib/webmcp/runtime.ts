import { create } from "zustand";

export type ToolRegistrationStatus = "registering" | "ready" | "error";
export type ToolExecutionStatus =
  "in_progress" | "completed" | "canceled" | "error";

export interface ToolRegistration {
  status: ToolRegistrationStatus;
  error?: string;
}

export interface ToolExecutionTarget {
  trackIds: string[];
  label: string;
  from?: number;
  to?: number;
}

export interface ToolExecution {
  id: number;
  tool: string;
  title: string;
  status: ToolExecutionStatus;
  summary?: string;
  target?: ToolExecutionTarget;
}

interface WebMCPRuntimeState {
  registrations: Record<string, ToolRegistration>;
  executions: ToolExecution[];
  setRegistration: (name: string, registration: ToolRegistration) => void;
  removeRegistration: (name: string) => void;
  startExecution: (
    tool: string,
    title: string,
    target?: ToolExecutionTarget,
  ) => number;
  finishExecution: (
    id: number,
    status: Exclude<ToolExecutionStatus, "in_progress">,
    summary: string,
  ) => void;
  clearFinishedExecutions: () => void;
}

const MAX_EXECUTIONS = 8;
let nextExecutionId = 0;

/** Ephemeral host state: never persisted with the song and never enters undo history. */
export const useWebMCPRuntime = create<WebMCPRuntimeState>()((set) => ({
  registrations: {},
  executions: [],

  setRegistration: (name, registration) =>
    set((state) => ({
      registrations: { ...state.registrations, [name]: registration },
    })),

  removeRegistration: (name) =>
    set((state) => {
      if (!(name in state.registrations)) return state;
      const registrations = { ...state.registrations };
      delete registrations[name];
      return { registrations };
    }),

  startExecution: (tool, title, target) => {
    const id = ++nextExecutionId;
    set((state) => {
      const execution: ToolExecution = {
        id,
        tool,
        title,
        status: "in_progress",
        target,
      };
      return {
        executions: [
          execution,
          ...state.executions.filter((item) => item.status === "in_progress"),
        ].slice(0, MAX_EXECUTIONS),
      };
    });
    return id;
  },

  finishExecution: (id, status, summary) =>
    set((state) => ({
      executions: state.executions.map((item) =>
        item.id === id ? { ...item, status, summary } : item,
      ),
    })),

  clearFinishedExecutions: () =>
    set((state) => ({
      executions: state.executions.filter(
        (item) => item.status === "in_progress",
      ),
    })),
}));
