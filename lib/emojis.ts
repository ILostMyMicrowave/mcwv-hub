// MCWV Hub emoji registry which mirrors MCWV-BOT main.py MCWV_CUSTOM_EMOJI.
// Each entry maps a semantic key -> (emoji_name, emoji_id). These are
// application-owned Discord custom emojis, rendered in the hub as images via
// Discord's emoji CDN so broadcast previews + the inbox look like Discord.

export type McwvEmoji = { name: string; id: string; animated?: boolean };

export const MCWV_EMOJIS: Record<string, McwvEmoji> = {
  // PS99 pet rarities / tiers
  titanic: { name: "Titanic", id: "1539559935896068238" },
  huge: { name: "Huge", id: "1539559902559862855" },
  gargantuan: { name: "Gargantuan", id: "1539559980687036456" },
  normal: { name: "Normal", id: "1539559864974704691" },
  // item / feature icons
  ultimate: { name: "Ultimate", id: "1539560868583440434" },
  egg: { name: "Egg", id: "1539560979153555540" },
  enchant: { name: "Enchant", id: "1539560825231245352" },
  charm: { name: "Charm", id: "1539561019175870485" },
  potions: { name: "Potions", id: "1539560778716418119" },
  inventory: { name: "Inventory", id: "1539560674215067719" },
  hoverboard: { name: "Hoverboard", id: "1539560931103875132" },
  booth: { name: "Booth", id: "1539561059051114586" },
  giftbag: { name: "Giftbag", id: "1539560728338374666" },
  upgradecard: { name: "Upgradecard", id: "1539560022365970532" },
  // gamepasses
  gp_lucky: { name: "gp_lucky", id: "1539561418116825098" },
  gp_ultralucky: { name: "gp_ultralucky", id: "1539561563457978388" },
  gp_vip: { name: "gp_VIP", id: "1539561696836976640" },
  gp_magiceggs: { name: "gp_magiceggs", id: "1539561490741330034" },
  gp_15pets: { name: "gp_15pets", id: "1539561258380951592" },
  gp_hugehunter: { name: "gp_hugehunter", id: "1539562060395061338" },
  gp_autofarm: { name: "gp_autofarm", id: "1539561190211063870" },
  gp_autotap: { name: "gp_autotap", id: "1539561111194443836" },
  gp_daycareslots: { name: "gp_daycareslots", id: "1539561958704160839" },
  gp_15eggs: { name: "gp_15eggs", id: "1539561902227595345" },
  gp_superdrops: { name: "gp_superdrops", id: "1539561631745441843" },
  gp_doublestars: { name: "gp_doublestars", id: "1539561847349452830" },
  gp_supershinyhunter: { name: "gp_supershinyhunter", id: "1539561757927018556" },
};

// Ordered, grouped copy for pickers / reference sheets.
export const EMOJI_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Pet rarities", keys: ["titanic", "huge", "gargantuan", "normal"] },
  {
    label: "Items",
    keys: ["egg", "enchant", "charm", "potions", "inventory", "hoverboard", "booth", "giftbag", "upgradecard", "ultimate"],
  },
  {
    label: "Gamepasses",
    keys: [
      "gp_lucky", "gp_ultralucky", "gp_vip", "gp_magiceggs", "gp_15pets", "gp_hugehunter",
      "gp_autofarm", "gp_autotap", "gp_daycareslots", "gp_15eggs", "gp_superdrops",
      "gp_doublestars", "gp_supershinyhunter",
    ],
  },
];

// Discord emoji CDN image URL. Falls back to null when unknown.
export function emojiImageUrl(key: string): string | null {
  const e = MCWV_EMOJIS[key];
  if (!e || !e.id) return null;
  const ext = e.animated ? "gif" : "png";
  return `https://cdn.discordapp.com/emojis/${e.id}.${ext}?size=48`;
}

// Renders `{emoji:key}` as the canonical `<:name:id>` discord string.
// Leaves the token intact (as a fallback) if the key is unknown.
export function expandEmojiTokens(text: string): string {
  return String(text ?? "").replace(/\{emoji:([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
    const e = MCWV_EMOJIS[key];
    if (!e) return `{emoji:${key}}`;
    return `<:${e.name}:${e.id}>`;
  });
}

// Does a string contain any known custom emoji (raw <:...:id> or {emoji:key})?
export function containsEmoji(text: string): boolean {
  return /<a?:[A-Za-z0-9_]{1,32}:\d{15,}>/.test(String(text ?? "")) || /\{emoji:[a-zA-Z0-9_]+\}/.test(String(text ?? ""));
}
