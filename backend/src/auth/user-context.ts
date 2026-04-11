export interface UserContext {
  userId: string;
  displayName: string;
  sessionId?: string;
  authToken?: string;
  mwsToken?: string;
}
