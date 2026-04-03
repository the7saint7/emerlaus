import type { MatchState } from "../../../shared/types";

export interface AppState {
  instanceId: string;
  playerSessionToken: string;
  match: MatchState | null;
  localSeatNumber: number;
  errorMessage: string;
  confirmingLeave: boolean;
  leftMessage: string;
  chatDraft: string;
  chatExpanded: boolean;
  chatHidden: boolean;
  diceRolling: boolean;
  diceStatusText: string;
}
