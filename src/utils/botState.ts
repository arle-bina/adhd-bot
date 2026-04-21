let enabled = true;
let acceptEnabled = true;

export function isBotEnabled(): boolean {
  return enabled;
}

export function setBotEnabled(state: boolean): void {
  enabled = state;
}

export function isAcceptEnabled(): boolean {
  return acceptEnabled;
}

export function setAcceptEnabled(state: boolean): void {
  acceptEnabled = state;
}
