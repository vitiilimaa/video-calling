export type UserJoined = {
  username: string;
  oneSignalSubscriptionId: string;
}

export type AllUsers = Array<{ username: string; oneSignalSubscriptionId: string }>;