import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";

// ---------------------------------------------------------------------------
// Full 78-card Rider-Waite-Smith tarot deck
// Images sourced from Wikimedia Commons (public domain, pre-1923)
// ---------------------------------------------------------------------------

interface TarotCard {
  name: string;
  arcana: "Major" | "Minor";
  image: string;
  upright: string;
  reversed: string;
  description: string;
}

const WIKI_IMG = "https://upload.wikimedia.org/wikipedia/commons/thumb";

// Major Arcana
const MAJOR_ARCANA: TarotCard[] = [
  {
    name: "The Fool",
    arcana: "Major",
    image: `${WIKI_IMG}/d/d7/RWS_Tarot_00_Fool.jpg/300px-RWS_Tarot_00_Fool.jpg`,
    upright: "New beginnings, innocence, spontaneity, free spirit",
    reversed: "Recklessness, risk-taking, holding back, restlessness",
    description: "The Fool steps boldly toward the edge of a cliff, gazing skyward with trust in the journey ahead. This card signals a leap of faith — a fresh start unburdened by fear.",
  },
  {
    name: "The Magician",
    arcana: "Major",
    image: `${WIKI_IMG}/d/de/RWS_Tarot_01_Magician.jpg/300px-RWS_Tarot_01_Magician.jpg`,
    upright: "Willpower, creation, manifestation, resourcefulness",
    reversed: "Manipulation, trickery, untapped talents, wasted potential",
    description: "The Magician channels all four elements through sheer will. With one hand pointing to heaven and the other to earth, you have everything you need to make it happen.",
  },
  {
    name: "The High Priestess",
    arcana: "Major",
    image: `${WIKI_IMG}/8/88/RWS_Tarot_02_High_Priestess.jpg/300px-RWS_Tarot_02_High_Priestess.jpg`,
    upright: "Intuition, mystery, inner knowledge, the subconscious",
    reversed: "Secrets, withdrawal, silence, disengagement",
    description: "The High Priestess sits between light and darkness, guarding hidden knowledge. Trust your gut — the answers you seek are already within you.",
  },
  {
    name: "The Empress",
    arcana: "Major",
    image: `${WIKI_IMG}/d/d2/RWS_Tarot_03_Empress.jpg/300px-RWS_Tarot_03_Empress.jpg`,
    upright: "Abundance, nurturing, fertility, nature, beauty",
    reversed: "Dependence, smothering, emptiness, creative block",
    description: "The Empress is the mother of creation — lush gardens, flowing rivers, life in bloom. She calls you to nurture what matters and let abundance flow.",
  },
  {
    name: "The Emperor",
    arcana: "Major",
    image: `${WIKI_IMG}/c/c3/RWS_Tarot_04_Emperor.jpg/300px-RWS_Tarot_04_Emperor.jpg`,
    upright: "Authority, structure, stability, discipline, leadership",
    reversed: "Tyranny, rigidity, stubbornness, lack of control",
    description: "The Emperor sits on his stone throne, armoured and unshakable. He represents the structures you build and the discipline that holds them together.",
  },
  {
    name: "The Hierophant",
    arcana: "Major",
    image: `${WIKI_IMG}/8/8d/RWS_Tarot_05_Hierophant.jpg/300px-RWS_Tarot_05_Hierophant.jpg`,
    upright: "Tradition, conformity, spiritual wisdom, mentorship",
    reversed: "Rebellion, subversiveness, unconventionality, freedom",
    description: "The Hierophant bridges the divine and the earthly, teaching through tradition. Seek guidance from those who have walked this path before you.",
  },
  {
    name: "The Lovers",
    arcana: "Major",
    image: `${WIKI_IMG}/3/3a/RWS_Tarot_06_Lovers.jpg/300px-RWS_Tarot_06_Lovers.jpg`,
    upright: "Love, harmony, relationships, choices, alignment",
    reversed: "Disharmony, imbalance, misalignment, conflict of values",
    description: "The Lovers stand beneath an angel's blessing, choosing each other with open hearts. This card speaks to deep connection and the choices that define who you are.",
  },
  {
    name: "The Chariot",
    arcana: "Major",
    image: `${WIKI_IMG}/9/9b/RWS_Tarot_07_Chariot.jpg/300px-RWS_Tarot_07_Chariot.jpg`,
    upright: "Determination, willpower, triumph, control, ambition",
    reversed: "Lack of direction, aggression, powerlessness",
    description: "The Chariot surges forward, pulled by opposing forces brought under one will. Victory is yours if you hold the reins with confidence and focus.",
  },
  {
    name: "Strength",
    arcana: "Major",
    image: `${WIKI_IMG}/f/f5/RWS_Tarot_08_Strength.jpg/300px-RWS_Tarot_08_Strength.jpg`,
    upright: "Courage, patience, compassion, inner strength",
    reversed: "Self-doubt, weakness, insecurity, raw emotion",
    description: "A woman gently closes the jaws of a lion — not through force, but through calm resolve. True strength is mastery over yourself, not others.",
  },
  {
    name: "The Hermit",
    arcana: "Major",
    image: `${WIKI_IMG}/4/4d/RWS_Tarot_09_Hermit.jpg/300px-RWS_Tarot_09_Hermit.jpg`,
    upright: "Solitude, introspection, inner guidance, soul-searching",
    reversed: "Isolation, loneliness, withdrawal, lost",
    description: "The Hermit stands alone on the mountaintop, lantern in hand, lighting the way inward. Sometimes you must step away from the noise to find your truth.",
  },
  {
    name: "Wheel of Fortune",
    arcana: "Major",
    image: `${WIKI_IMG}/3/3c/RWS_Tarot_10_Wheel_of_Fortune.jpg/300px-RWS_Tarot_10_Wheel_of_Fortune.jpg`,
    upright: "Change, cycles, destiny, turning points, luck",
    reversed: "Bad luck, resistance to change, breaking cycles",
    description: "The great wheel turns endlessly — what rises must fall, and what falls will rise again. Embrace the cycle; change is the only constant.",
  },
  {
    name: "Justice",
    arcana: "Major",
    image: `${WIKI_IMG}/e/e0/RWS_Tarot_11_Justice.jpg/300px-RWS_Tarot_11_Justice.jpg`,
    upright: "Fairness, truth, law, cause and effect, clarity",
    reversed: "Dishonesty, unfairness, lack of accountability",
    description: "Justice sits with sword and scales, weighing every action against its consequence. The truth will come to light — make sure you can stand in it.",
  },
  {
    name: "The Hanged Man",
    arcana: "Major",
    image: `${WIKI_IMG}/2/2b/RWS_Tarot_12_Hanged_Man.jpg/300px-RWS_Tarot_12_Hanged_Man.jpg`,
    upright: "Surrender, new perspective, letting go, pause",
    reversed: "Stalling, resistance, indecision, needless sacrifice",
    description: "The Hanged Man dangles upside-down, serene and still. By releasing control and shifting your perspective, the world rearranges itself around you.",
  },
  {
    name: "Death",
    arcana: "Major",
    image: `${WIKI_IMG}/d/d7/RWS_Tarot_13_Death.jpg/300px-RWS_Tarot_13_Death.jpg`,
    upright: "Transformation, endings, transition, letting go",
    reversed: "Resistance to change, fear of the unknown, stagnation",
    description: "Death rides forward, clearing the old to make way for the new. This is not an ending to fear — it is the transformation that frees you.",
  },
  {
    name: "Temperance",
    arcana: "Major",
    image: `${WIKI_IMG}/f/f8/RWS_Tarot_14_Temperance.jpg/300px-RWS_Tarot_14_Temperance.jpg`,
    upright: "Balance, patience, moderation, harmony, purpose",
    reversed: "Imbalance, excess, lack of patience, misalignment",
    description: "An angel pours water between two cups in perfect balance, one foot on land and one in the stream. Find the middle path — patience and moderation will guide you.",
  },
  {
    name: "The Devil",
    arcana: "Major",
    image: `${WIKI_IMG}/5/55/RWS_Tarot_15_Devil.jpg/300px-RWS_Tarot_15_Devil.jpg`,
    upright: "Bondage, addiction, materialism, shadow self",
    reversed: "Release, breaking free, reclaiming power, detachment",
    description: "The Devil holds two figures in loose chains they could remove at any time. What binds you is often of your own making — recognize it, and you can walk away.",
  },
  {
    name: "The Tower",
    arcana: "Major",
    image: `${WIKI_IMG}/5/53/RWS_Tarot_16_Tower.jpg/300px-RWS_Tarot_16_Tower.jpg`,
    upright: "Sudden upheaval, chaos, revelation, destruction, awakening",
    reversed: "Avoidance, fear of change, delayed disaster",
    description: "Lightning strikes the tower, shattering false foundations. It is violent and sudden, but from the rubble, truth emerges. What must fall, will fall.",
  },
  {
    name: "The Star",
    arcana: "Major",
    image: `${WIKI_IMG}/d/db/RWS_Tarot_17_Star.jpg/300px-RWS_Tarot_17_Star.jpg`,
    upright: "Hope, renewal, inspiration, serenity, faith",
    reversed: "Despair, disconnection, lack of faith, discouragement",
    description: "Beneath a canopy of stars, a woman pours water onto land and sea, renewing the world. After the storm, hope returns. Let it wash over you.",
  },
  {
    name: "The Moon",
    arcana: "Major",
    image: `${WIKI_IMG}/7/7f/RWS_Tarot_18_Moon.jpg/300px-RWS_Tarot_18_Moon.jpg`,
    upright: "Illusion, fear, anxiety, the subconscious, intuition",
    reversed: "Release of fear, clarity, truth emerging, repressed emotions",
    description: "The Moon casts a deceptive light over a winding path flanked by beasts. Not everything is as it seems — trust your instincts to navigate the shadows.",
  },
  {
    name: "The Sun",
    arcana: "Major",
    image: `${WIKI_IMG}/1/17/RWS_Tarot_19_Sun.jpg/300px-RWS_Tarot_19_Sun.jpg`,
    upright: "Joy, success, vitality, warmth, positivity",
    reversed: "Temporary sadness, overconfidence, unrealistic expectations",
    description: "A child rides joyfully under a brilliant sun, radiating pure happiness. This is the card of warmth, clarity, and things going beautifully right.",
  },
  {
    name: "Judgement",
    arcana: "Major",
    image: `${WIKI_IMG}/d/dd/RWS_Tarot_20_Judgement.jpg/300px-RWS_Tarot_20_Judgement.jpg`,
    upright: "Rebirth, reckoning, inner calling, reflection, absolution",
    reversed: "Self-doubt, refusal of the call, harsh self-judgement",
    description: "An angel's trumpet sounds and the dead rise to answer. This is your moment of reckoning — heed the call, embrace your purpose, and rise.",
  },
  {
    name: "The World",
    arcana: "Major",
    image: `${WIKI_IMG}/f/ff/RWS_Tarot_21_World.jpg/300px-RWS_Tarot_21_World.jpg`,
    upright: "Completion, achievement, fulfilment, wholeness, travel",
    reversed: "Incompletion, stagnation, emptiness, shortcuts",
    description: "A dancer floats within a laurel wreath, the four corners of the world looking on. The cycle is complete. You have arrived — celebrate what you have built.",
  },
];

// Minor Arcana suits
type Suit = "Wands" | "Cups" | "Swords" | "Pentacles";

interface SuitInfo {
  element: string;
  theme: string;
  imagePrefix: string;
}

const SUIT_INFO: Record<Suit, SuitInfo> = {
  Wands: { element: "Fire", theme: "passion, ambition, and creativity", imagePrefix: "Wands" },
  Cups: { element: "Water", theme: "emotions, relationships, and intuition", imagePrefix: "Cups" },
  Swords: { element: "Air", theme: "intellect, conflict, and truth", imagePrefix: "Swords" },
  Pentacles: { element: "Earth", theme: "material wealth, work, and health", imagePrefix: "Pents" },
};

const RANK_NAMES = [
  "Ace", "Two", "Three", "Four", "Five", "Six", "Seven",
  "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King",
];

const RANK_NUMBERS = [
  "01", "02", "03", "04", "05", "06", "07",
  "08", "09", "10", "11", "12", "13", "14",
];

// Upright / reversed keywords for each rank (suit-independent archetypes)
const RANK_UPRIGHT: Record<string, string> = {
  Ace: "New opportunity, potential, inspiration, beginning",
  Two: "Balance, partnership, duality, choices",
  Three: "Growth, collaboration, creativity, expansion",
  Four: "Stability, structure, foundation, rest",
  Five: "Conflict, challenge, loss, competition",
  Six: "Harmony, communication, cooperation, progress",
  Seven: "Reflection, assessment, perseverance, strategy",
  Eight: "Movement, change, speed, progress",
  Nine: "Fulfilment, attainment, satisfaction, nearing completion",
  Ten: "Completion, culmination, ending of a cycle, legacy",
  Page: "Curiosity, new message, youthful energy, exploration",
  Knight: "Action, adventure, pursuit, momentum",
  Queen: "Nurturing, intuition, maturity, inner confidence",
  King: "Authority, mastery, leadership, experience",
};

const RANK_REVERSED: Record<string, string> = {
  Ace: "Missed opportunity, false start, lack of direction",
  Two: "Imbalance, indecision, disharmony",
  Three: "Overextension, lack of teamwork, delays",
  Four: "Restlessness, instability, stagnation, boredom",
  Five: "Resolution, compromise, avoidance, retreat",
  Six: "Miscommunication, imbalance, breakdown",
  Seven: "Impatience, poor planning, distraction",
  Eight: "Stagnation, resistance to change, overwhelm",
  Nine: "Incompletion, dissatisfaction, near miss",
  Ten: "Burden, incomplete ending, reluctance to move on",
  Page: "Immaturity, procrastination, lack of commitment",
  Knight: "Recklessness, impulsiveness, burnout, scattered energy",
  Queen: "Insecurity, dependence, smothering, self-neglect",
  King: "Domineering, misuse of power, inflexibility",
};

// Suit-specific flavour for interpretation
const SUIT_FLAVOUR: Record<Suit, Record<string, string>> = {
  Wands: {
    Ace: "A spark of inspiration ignites — a new creative or career venture awaits.",
    Two: "You stand at a crossroads, power in hand. Plan your next bold move.",
    Three: "Your ships are coming in. Expansion is on the horizon — think big.",
    Four: "Celebrate your achievements so far. Stable ground has been earned.",
    Five: "Competing ambitions clash. Channel the chaos into productive rivalry.",
    Six: "Victory and public recognition are yours. Ride the wave of success.",
    Seven: "You're defending your position against challenges. Stand your ground.",
    Eight: "Things are moving fast — swift changes and exciting momentum ahead.",
    Nine: "You've been through the fire. One last push and you'll reach the top.",
    Ten: "The weight of responsibility is heavy. Delegate before it crushes you.",
    Page: "An enthusiastic message or idea arrives, full of creative potential.",
    Knight: "Charge forward with passion — but don't burn bridges on the way.",
    Queen: "Confident, warm, and determined. Own your power and inspire others.",
    King: "A visionary leader who turns ideas into empires. Lead with boldness.",
  },
  Cups: {
    Ace: "A new emotional beginning — love, friendship, or deep creative flow.",
    Two: "A meaningful connection deepens. Mutual respect and attraction align.",
    Three: "Celebration with those you love. Friendships and community bring joy.",
    Four: "Emotional apathy or boredom creeps in. Look for what you're missing.",
    Five: "Grief or disappointment lingers, but not all is lost. Look behind you.",
    Six: "Nostalgia and happy memories surface. Innocence and kindness prevail.",
    Seven: "Too many choices cloud your judgement. Not every dream is worth chasing.",
    Eight: "Walking away from something emotionally unfulfilling. It takes courage.",
    Nine: "The wish card — emotional satisfaction and contentment are within reach.",
    Ten: "Emotional fulfilment, family harmony, and lasting happiness. Cherish it.",
    Page: "A tender message or creative invitation. Let your imagination play.",
    Knight: "A romantic or idealistic pursuit sweeps in. Follow your heart wisely.",
    Queen: "Deep empathy and emotional intelligence. Trust your compassionate nature.",
    King: "Emotional maturity and calm wisdom. Lead with your heart, not just your head.",
  },
  Swords: {
    Ace: "A breakthrough of clarity and truth. Cut through confusion with logic.",
    Two: "A difficult decision weighs on you. Avoidance won't make it go away.",
    Three: "Heartbreak or painful truth. It hurts now, but healing begins with honesty.",
    Four: "Rest and recover. You need mental stillness before the next battle.",
    Five: "A hollow victory or underhanded conflict. Win fairly or don't play.",
    Six: "Leaving troubled waters behind. The journey ahead is calmer.",
    Seven: "Deception or strategy at play. Be clever, but know the cost of secrecy.",
    Eight: "Feeling trapped by your own thoughts. The bindings are not as tight as you think.",
    Nine: "Anxiety and sleepless nights. Much of what you fear exists only in your mind.",
    Ten: "Rock bottom — the worst is over. From here, the only way is up.",
    Page: "Sharp-minded and curious. A new idea or truth demands your attention.",
    Knight: "Charging headlong into battle. Brilliant but reckless — temper your sword.",
    Queen: "Clear-eyed and direct. She sees the truth and speaks it without apology.",
    King: "Intellectual authority and fair judgement. Lead with clarity and reason.",
  },
  Pentacles: {
    Ace: "A new financial or material opportunity. Plant the seed and tend it.",
    Two: "Juggling priorities and resources. Adaptability keeps you in the game.",
    Three: "Craftsmanship and teamwork pay off. Your skills are being noticed.",
    Four: "Holding on tight to what you have. Security is good — greed is not.",
    Five: "Financial hardship or feeling left out in the cold. Help is available.",
    Six: "Generosity flows both ways. Share what you have and receive what you need.",
    Seven: "Patience as you wait for your investment to grow. The harvest is coming.",
    Eight: "Dedicated effort and mastery of your craft. Keep refining your skills.",
    Nine: "Luxury, self-sufficiency, and enjoying the fruits of your labour.",
    Ten: "Wealth, legacy, and family prosperity. You've built something that lasts.",
    Page: "A studious opportunity — new skills, education, or a practical plan.",
    Knight: "Steady, reliable progress toward your goals. Slow and sure wins.",
    Queen: "Practical abundance and nurturing security. You create comfort for all.",
    King: "Financial mastery and material success. A provider and protector of wealth.",
  },
};

function buildMinorArcana(): TarotCard[] {
  const cards: TarotCard[] = [];
  const suits: Suit[] = ["Wands", "Cups", "Swords", "Pentacles"];

  for (const suit of suits) {
    const info = SUIT_INFO[suit];
    for (let i = 0; i < 14; i++) {
      const rank = RANK_NAMES[i];
      const num = RANK_NUMBERS[i];
      cards.push({
        name: `${rank} of ${suit}`,
        arcana: "Minor",
        image: "", // Minor arcana images omitted — Major Arcana thumbnails used for display
        upright: RANK_UPRIGHT[rank],
        reversed: RANK_REVERSED[rank],
        description: SUIT_FLAVOUR[suit][rank],
      });
    }
  }
  return cards;
}

// Full 78-card deck
const DECK: TarotCard[] = [...MAJOR_ARCANA, ...buildMinorArcana()];

// ---------------------------------------------------------------------------
// Spread types
// ---------------------------------------------------------------------------

interface SpreadPosition {
  label: string;
  meaning: string;
}

const SPREADS: Record<string, SpreadPosition[]> = {
  single: [{ label: "Your Card", meaning: "The energy surrounding you right now" }],
  three: [
    { label: "Past", meaning: "What has led you here" },
    { label: "Present", meaning: "Where you stand now" },
    { label: "Future", meaning: "Where you are heading" },
  ],
  five: [
    { label: "Present", meaning: "Your current situation" },
    { label: "Challenge", meaning: "What stands in your way" },
    { label: "Past", meaning: "The root of the matter" },
    { label: "Future", meaning: "What is approaching" },
    { label: "Potential", meaning: "The best possible outcome" },
  ],
};

// ---------------------------------------------------------------------------
// Drawing & interpretation helpers
// ---------------------------------------------------------------------------

function drawCards(count: number): { card: TarotCard; isReversed: boolean }[] {
  const shuffled = [...DECK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((card) => ({
    card,
    isReversed: Math.random() < 0.35, // ~35% chance of reversal
  }));
}

function interpret(
  drawn: { card: TarotCard; isReversed: boolean },
  position: SpreadPosition,
): string {
  const { card, isReversed } = drawn;
  const orientation = isReversed ? "Reversed" : "Upright";
  const keywords = isReversed ? card.reversed : card.upright;

  const lines = [
    `**${position.label}** — *${position.meaning}*`,
    "",
    `**${card.name}** (${orientation}) ${isReversed ? "🔄" : "✨"}`,
    `*${keywords}*`,
    "",
    card.description,
  ];

  if (isReversed) {
    lines.push("", "*Reversed, this energy is blocked, internalized, or working against you. Reflect on what needs to shift.*");
  }

  return lines.join("\n");
}

// Colour palette for embeds
const TAROT_COLOURS: Record<string, number> = {
  single: 0x9b59b6, // purple
  three: 0x3498db,  // blue
  five: 0xe67e22,   // orange
};

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("tarot")
  .setDescription("Draw a tarot reading with Rider-Waite-Smith cards")
  .addStringOption((opt) =>
    opt
      .setName("spread")
      .setDescription("Type of spread")
      .setRequired(false)
      .addChoices(
        { name: "Single Card", value: "single" },
        { name: "Past / Present / Future", value: "three" },
        { name: "Five-Card Cross", value: "five" },
      ),
  ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction) {
  const spreadType = interaction.options.getString("spread") ?? "three";
  const positions = SPREADS[spreadType];
  const drawn = drawCards(positions.length);

  // Build the main embed — use the first card with an image as thumbnail
  const thumbnailUrl = drawn.find((d) => d.card.image)?.card.image ?? null;
  const embed = new EmbedBuilder()
    .setTitle("Your Tarot Reading")
    .setColor(TAROT_COLOURS[spreadType] ?? 0x9b59b6)
    .setFooter({ text: "Rider-Waite-Smith Tarot · ahousedividedgame.com" })
    .setTimestamp();
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  // Add each position as a field
  for (let i = 0; i < drawn.length; i++) {
    const text = interpret(drawn[i], positions[i]);
    embed.addFields({ name: "\u200b", value: text.slice(0, 1024) });
  }

  // Summary interpretation
  const cardNames = drawn
    .map((d) => `${d.card.name}${d.isReversed ? " (R)" : ""}`)
    .join(" · ");
  embed.setDescription(`**Cards drawn:** ${cardNames}\n\nHere is what the cards reveal...`);

  await interaction.reply({ embeds: [embed] });
}
