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
  // Ops owns delivery to an existing ticket channel. The bot may only DM
  // legacy records without a channel; it never deletes receipt channels.
  const needsPlayerDelivery = !state.discordChannelId && !state.deliveredAt;
  return { needsPlayerDelivery, needsChannelClose: false };
}
