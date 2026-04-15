let enabled = true;

export function isBotEnabled(): boolean {
  return enabled;
}

export function setBotEnabled(state: boolean): void {
  enabled = state;
}
