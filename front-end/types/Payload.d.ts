export type OfferPayload = {
  from: string;
  to: string;
  offer: RTCSessionDescriptionInit;
}

export type AnswerPayload = {
  answer: RTCSessionDescriptionInit;
}

export type IceCandidatePayload = {
  candidate: RTCIceCandidateInit;
}