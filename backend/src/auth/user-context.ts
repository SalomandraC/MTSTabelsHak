export interface UserContext {
  userId: string;
  clientId?: string | null;
  displayName: string;
  sessionId?: string;
  authToken?: string;
  mwsToken?: string;
}
