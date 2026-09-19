export interface ResolutionDeliveryState {
  discordChannelId?: string;
  channelUpdatePosted?: boolean;
  deliveredAt?: unknown;
  channelClosedAt?: unknown;
}

export function resolutionDeliveryPlan(state: ResolutionDeliveryState): {
  needsPlayerDelivery: boolean;
  needsChannelClose: boolean;
} {
  // A dashboard channel post is already a valid fallback, but it is not proof
  // that the player received a DM. Give the bot one chance to deliver the
  // durable receipt directly before closing the channel.
  const needsPlayerDelivery = !state.deliveredAt;
  const needsChannelClose = Boolean(state.discordChannelId) && !state.channelClosedAt;
  return { needsPlayerDelivery, needsChannelClose };
}
