const timestamps = new Map<string, number>();

/**
 * Returns seconds remaining on cooldown, or 0 if the command can be used.
 * Records the usage timestamp when allowed.
 */
export function checkCooldown(userId: string, commandName: string, seconds: number): number {
  const key = `${userId}:${commandName}`;
  const now = Date.now();
  const expiry = (timestamps.get(key) ?? 0) + seconds * 1000;

  if (now < expiry) {
    return Math.ceil((expiry - now) / 1000);
  }

  timestamps.set(key, now);
  return 0;
}
