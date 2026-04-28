export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  GateEntry: undefined;
  DeliveryList: { dcId: string };
  ScanLine: { lineId: string; dcId: string };
  QCPass: { lineId: string; dcId: string };
  BatchCapture: { lineId: string; dcId: string };
  Quarantine: { lineId: string; dcId: string };
  LPNPrint: { lineId: string; dcId: string };
};

export interface User {
  id: string;
  username: string;
  role: string;
  dcId: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
