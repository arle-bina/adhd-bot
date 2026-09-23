export interface ResolutionDeliveryState {
  discordChannelId?: string;
  channelUpdatePosted?: boolean;
  deliveredAt?: unknown;
}

/** Keep the permanent receipt link intact when Discord's message limit is reached. */
export function appendReceiptLink(
  content: string,
  receiptUrl: string,
  maxLength: number,
): string {
  const receipt = `\n\n**Support receipt:** ${receiptUrl}`;
  if (receipt.length > maxLength) {
    throw new RangeError("The support receipt link exceeds the message limit.");
  }
  const withoutExistingLink = content.split(receiptUrl).join("").trimEnd();
  const prefix = withoutExistingLink
    .slice(0, maxLength - receipt.length)
    .trimEnd();
  return `${prefix}${receipt}`;
}

export function resolutionDeliveryPlan(state: ResolutionDeliveryState): {
  needsPlayerDelivery: boolean;
  needsChannelReceipt: boolean;
  needsChannelClose: boolean;
} {
  const pending = !state.deliveredAt;
  const hasChannel = Boolean(state.discordChannelId);
  return {
    needsPlayerDelivery: pending,
    needsChannelReceipt: pending && hasChannel && !state.channelUpdatePosted,
    needsChannelClose: pending && hasChannel,
  };
}

const activeDeliveries = new Set<string>();

/** Prevent the timer and a button close from delivering the same ticket concurrently. */
export function beginTicketResolutionDelivery(ticketNumber: number): boolean {
  const key = String(ticketNumber);
  if (activeDeliveries.has(key)) return false;
  activeDeliveries.add(key);
  return true;
}

export function endTicketResolutionDelivery(ticketNumber: number): void {
  activeDeliveries.delete(String(ticketNumber));
}
