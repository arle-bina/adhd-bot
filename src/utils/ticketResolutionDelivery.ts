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

/** A receipt lookup failure never blocks delivering or closing a ticket. */
export function appendOptionalReceiptLink(
  content: string,
  receiptUrl: string | undefined,
  maxLength: number,
): string {
  return receiptUrl
    ? appendReceiptLink(content, receiptUrl, maxLength)
    : content.slice(0, maxLength);
}

/** Use one Discord idempotency key per resolution version. */
export function ticketResolutionNonce(
  prefix: string,
  ticketNumber: number,
  resolutionVersion: unknown,
): string {
  const versionTime =
    resolutionVersion instanceof Date
      ? resolutionVersion.getTime()
      : typeof resolutionVersion === "number"
        ? resolutionVersion
        : Date.parse(String(resolutionVersion ?? ""));
  const version = Number.isFinite(versionTime)
    ? versionTime.toString(36)
    : "legacy";
  return `${prefix}-${ticketNumber}-${version}`;
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
