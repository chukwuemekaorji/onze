import { createContext, useContext } from 'react';

/**
 * what the report's pages need to know beyond the report itself: the refresh
 * in progress, and a swap another tab asked the pitch to play
 */
export interface ReportStage {
  refreshing: boolean;
  refreshCount: number;
  refreshError: string | null;
  /** an incoming player whose swap should play when the pitch next shows */
  pendingSwapId: number | null;
  requestSwap: (incomingPlayerId: number) => void;
  clearPendingSwap: () => void;
}

// outside the app, as on the landing page, there's no refresh and no other tab
const IDLE_STAGE: ReportStage = {
  refreshing: false,
  refreshCount: 0,
  refreshError: null,
  pendingSwapId: null,
  requestSwap: () => {},
  clearPendingSwap: () => {},
};

export const ReportStageContext = createContext<ReportStage>(IDLE_STAGE);

export function useReportStage(): ReportStage {
  return useContext(ReportStageContext);
}
