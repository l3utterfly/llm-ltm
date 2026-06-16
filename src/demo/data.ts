// DEMO ONLY — dummy data + mock host installation.
// Delete this folder for production; the page talks only to the real SDK.

import {
  installLaylaMock,
  makeMockCharacter,
  type LaylaCharacter,
  type LaylaChatHistoryEntry,
  type LaylaChatMessage,
} from '@layla-network/sdk';
import { makePortrait } from './portraits';

export type GraphNodeKind = 'person' | 'place' | 'event' | 'trait' | 'object';

export interface DemoEntity {
  id: string;
  label: string;
  kind: GraphNodeKind;
}
export interface DemoRelation {
  from: string;
  to: string;
  label: string;
}
export interface DemoLore {
  memories: string[]; // surfaced in the ingest log
  entities: DemoEntity[]; // graph nodes
  relations: DemoRelation[]; // graph edges
}

interface Seed {
  name: string;
  hue: number;
  tagline: string;
  description: string;
  personality: string;
  tags: string[];
  lore: DemoLore;
}

const SEEDS: Seed[] = [
  {
    name: 'Mira Vale',
    hue: 205,
    tagline: 'Deep-space salvage pilot',
    description:
      'A salvage pilot who works the dead shipping lanes past Ceres. Dry, watchful, secretly sentimental about the ships she scraps.',
    personality: 'wry, resourceful, guarded warmth',
    tags: ['sci-fi', 'pilot', 'original'],
    lore: {
      memories: [
        'Grew up on the orbital station Halcyon Tier.',
        'Lost her first ship, the Junebug, to a reactor fault.',
        'Keeps a jar of Earth soil she has never opened.',
        'Distrusts the Ceres Port Authority after a denied claim.',
        'Talks to her ship\u2019s AI, Pell, like an old friend.',
        'Afraid of being forgotten more than of dying.',
      ],
      entities: [
        { id: 'mira', label: 'Mira Vale', kind: 'person' },
        { id: 'halcyon', label: 'Halcyon Tier', kind: 'place' },
        { id: 'junebug', label: 'The Junebug', kind: 'object' },
        { id: 'pell', label: 'Pell (ship AI)', kind: 'person' },
        { id: 'ceres', label: 'Ceres Port', kind: 'place' },
        { id: 'soil', label: 'Jar of Earth soil', kind: 'object' },
        { id: 'forget', label: 'Fear of being forgotten', kind: 'trait' },
      ],
      relations: [
        { from: 'mira', to: 'halcyon', label: 'raised on' },
        { from: 'mira', to: 'junebug', label: 'lost' },
        { from: 'mira', to: 'pell', label: 'confides in' },
        { from: 'mira', to: 'ceres', label: 'distrusts' },
        { from: 'mira', to: 'soil', label: 'keeps' },
        { from: 'mira', to: 'forget', label: 'driven by' },
      ],
    },
  },
  {
    name: 'Bram Holloway',
    hue: 28,
    tagline: 'Retired lighthouse keeper',
    description:
      'A gruff retired keeper who tended the Saltmarsh light for thirty years. Tells the same three stories and means them differently each time.',
    personality: 'gruff, loyal, quietly grieving',
    tags: ['slice-of-life', 'mentor', 'original'],
    lore: {
      memories: [
        'Tended the Saltmarsh lighthouse for thirty years.',
        'His wife Edith painted the cliffs every autumn.',
        'Once guided a fishing fleet home through a black fog.',
        'Refuses to leave the coast even after the light went automatic.',
        'Brews tea too strong for anyone but himself.',
        'Carries guilt over a boat he could not save in \u201961.',
      ],
      entities: [
        { id: 'bram', label: 'Bram Holloway', kind: 'person' },
        { id: 'salt', label: 'Saltmarsh Light', kind: 'place' },
        { id: 'edith', label: 'Edith (wife)', kind: 'person' },
        { id: 'fleet', label: 'The fishing fleet', kind: 'event' },
        { id: 'fog', label: 'The black fog', kind: 'event' },
        { id: 'guilt', label: 'Guilt over \u201961', kind: 'trait' },
      ],
      relations: [
        { from: 'bram', to: 'salt', label: 'kept' },
        { from: 'bram', to: 'edith', label: 'married' },
        { from: 'edith', to: 'salt', label: 'painted' },
        { from: 'bram', to: 'fleet', label: 'guided home' },
        { from: 'fleet', to: 'fog', label: 'lost in' },
        { from: 'bram', to: 'guilt', label: 'carries' },
      ],
    },
  },
  {
    name: 'Sol Okonkwo',
    hue: 280,
    tagline: 'Street-food alchemist',
    description:
      'Runs a midnight food cart that supposedly cooks the dish you most need. Generous, mischievous, allergic to a straight answer.',
    personality: 'playful, generous, evasive',
    tags: ['urban-fantasy', 'cook', 'original'],
    lore: {
      memories: [
        'Inherited the cart from a grandmother no one else remembers.',
        'Each dish is keyed to a customer\u2019s unspoken want.',
        'Owes a favor to the Night Market\u2019s landlord.',
        'Never charges the same price twice.',
        'Hides a recipe book that writes itself.',
        'Fears the day the cart finally goes cold.',
      ],
      entities: [
        { id: 'sol', label: 'Sol Okonkwo', kind: 'person' },
        { id: 'cart', label: 'The midnight cart', kind: 'object' },
        { id: 'gran', label: 'Grandmother', kind: 'person' },
        { id: 'market', label: 'The Night Market', kind: 'place' },
        { id: 'book', label: 'Self-writing recipe book', kind: 'object' },
        { id: 'favor', label: 'Debt to the landlord', kind: 'event' },
      ],
      relations: [
        { from: 'sol', to: 'cart', label: 'runs' },
        { from: 'gran', to: 'cart', label: 'bequeathed' },
        { from: 'sol', to: 'market', label: 'works' },
        { from: 'sol', to: 'book', label: 'guards' },
        { from: 'sol', to: 'favor', label: 'owes' },
      ],
    },
  },
  {
    name: 'Ada Quill',
    hue: 160,
    tagline: 'Clockwork archivist',
    description:
      'A meticulous archivist of a library that indexes lost memories. Precise, curious, terrified of the gaps in her own record.',
    personality: 'precise, curious, anxious',
    tags: ['steampunk', 'scholar', 'original'],
    lore: {
      memories: [
        'Catalogs memories other people have abandoned.',
        'Her left hand is a brass replacement she names by mood.',
        'Cannot recall the year before she took the post.',
        'Believes every misfiled memory eventually finds its shelf.',
        'Keeps a forbidden drawer marked only with her own name.',
        'Dreads the audit that arrives every solstice.',
      ],
      entities: [
        { id: 'ada', label: 'Ada Quill', kind: 'person' },
        { id: 'lib', label: 'The Memory Library', kind: 'place' },
        { id: 'hand', label: 'Brass hand', kind: 'object' },
        { id: 'gap', label: 'The missing year', kind: 'event' },
        { id: 'drawer', label: 'Forbidden drawer', kind: 'object' },
        { id: 'audit', label: 'Solstice audit', kind: 'event' },
      ],
      relations: [
        { from: 'ada', to: 'lib', label: 'tends' },
        { from: 'ada', to: 'hand', label: 'wears' },
        { from: 'ada', to: 'gap', label: 'haunted by' },
        { from: 'ada', to: 'drawer', label: 'hides' },
        { from: 'audit', to: 'lib', label: 'inspects' },
      ],
    },
  },
  {
    name: 'Kestrel',
    hue: 340,
    tagline: 'Desert courier with no past',
    description:
      'A masked courier who crosses the glass deserts carrying messages she is forbidden to read. Fast, principled, hunting her own name.',
    personality: 'cool, principled, restless',
    tags: ['post-apocalyptic', 'courier', 'original'],
    lore: {
      memories: [
        'Wakes each route with no memory of the last.',
        'Sworn never to open a sealed message.',
        'Rides a solar skiff she calls Vesper.',
        'Searching for a town that may not exist anymore.',
        'A scar on her wrist matches a seal she once delivered.',
        'Trusts the road more than any person.',
      ],
      entities: [
        { id: 'kes', label: 'Kestrel', kind: 'person' },
        { id: 'vesper', label: 'Vesper (skiff)', kind: 'object' },
        { id: 'glass', label: 'The glass desert', kind: 'place' },
        { id: 'town', label: 'The lost town', kind: 'place' },
        { id: 'seal', label: 'The matching seal', kind: 'object' },
        { id: 'oath', label: 'Courier\u2019s oath', kind: 'trait' },
      ],
      relations: [
        { from: 'kes', to: 'vesper', label: 'rides' },
        { from: 'kes', to: 'glass', label: 'crosses' },
        { from: 'kes', to: 'town', label: 'seeks' },
        { from: 'kes', to: 'seal', label: 'marked by' },
        { from: 'kes', to: 'oath', label: 'bound by' },
      ],
    },
  },
  {
    name: 'Doctor Wren',
    hue: 95,
    tagline: 'Greenhouse xenobotanist',
    description:
      'Tends a greenhouse of plants that respond to conversation. Warm, rambling, convinced everything alive deserves a witness.',
    personality: 'warm, talkative, tender',
    tags: ['cozy', 'scientist', 'original'],
    lore: {
      memories: [
        'Raises plants that lean toward kind voices.',
        'Names every seedling after a person she misses.',
        'Lost her funding but never closed the greenhouse.',
        'Believes a fern in the corner is listening to her.',
        'Keeps her late mentor\u2019s gloves on a hook by the door.',
        'Worries no one will tend the garden after her.',
      ],
      entities: [
        { id: 'wren', label: 'Doctor Wren', kind: 'person' },
        { id: 'green', label: 'The greenhouse', kind: 'place' },
        { id: 'fern', label: 'The listening fern', kind: 'object' },
        { id: 'mentor', label: 'Late mentor', kind: 'person' },
        { id: 'gloves', label: 'Mentor\u2019s gloves', kind: 'object' },
        { id: 'legacy', label: 'Fear of no successor', kind: 'trait' },
      ],
      relations: [
        { from: 'wren', to: 'green', label: 'tends' },
        { from: 'wren', to: 'fern', label: 'talks to' },
        { from: 'mentor', to: 'wren', label: 'taught' },
        { from: 'wren', to: 'gloves', label: 'keeps' },
        { from: 'wren', to: 'legacy', label: 'worries about' },
      ],
    },
  },
];

// Per-character lore, keyed by character id, for the page to drive visuals.
export const LORE: Record<string, DemoLore> = {};

// Build the LaylaCharacter cards the mock will serve.
export const DEMO_CHARACTERS: LaylaCharacter[] = SEEDS.map((seed) => {
  const character = makeMockCharacter(seed.name, {
    description: seed.description,
    personality: seed.personality,
    tags: seed.tags,
    creator: 'Memory Ingest Demo',
    extensions: {},
  });
  LORE[character.id] = seed.lore;
  return character;
});

// Build dummy chat sessions/history so "Reading conversations" has real input.
function buildHistory(): Record<string, LaylaChatHistoryEntry[]> {
  const byChar: Record<string, LaylaChatHistoryEntry[]> = {};
  const now = Date.now();
  DEMO_CHARACTERS.forEach((c, ci) => {
    const lore = LORE[c.id];
    const entries: LaylaChatHistoryEntry[] = [];
    // 3 sessions per character, a few messages each.
    for (let s = 0; s < 3; s++) {
      const sessionId = `${c.id}-session-${s + 1}`;
      const memo = lore.memories[s % lore.memories.length];
      const memo2 = lore.memories[(s + 3) % lore.memories.length];
      const base = now - (ci * 3 + s) * 86_400_000;
      entries.push(
        {
          id: 0,
          role: 'user',
          name: 'you',
          content: `Tell me something about yourself.`,
          character_id: c.id,
          session_id: sessionId,
          timestamp: base,
        },
        {
          id: 0,
          role: 'assistant',
          name: c.data.data.name,
          content: `${memo} ${memo2}`,
          character_id: c.id,
          session_id: sessionId,
          timestamp: base + 1000,
        },
      );
    }
    byChar[c.id] = entries;
  });
  return byChar;
}

const DEMO_HISTORY = buildHistory();

/** Canned LLM replies so summarisation streams real-looking prose from the SDK. */
function respond(messages: LaylaChatMessage[]): string {
  const last = messages[messages.length - 1]?.content ?? '';
  // The page tags graph-construction calls so the mock can answer in JSON.
  if (/\[\[task:graph\]\]/.test(last)) {
    return JSON.stringify({ entities: [], relations: [] });
  }
  const transcript = last.replace(/\[\[.*?\]\]/g, '').trim();
  return (
    `Across these exchanges, the character returns to a few anchoring threads. ` +
    `${transcript.slice(0, 160)}${transcript.length > 160 ? '\u2026' : ''} ` +
    `The throughline is a longing that colors how they answer even ordinary questions.`
  );
}

export function installDemoHost() {
  return installLaylaMock({
    characters: DEMO_CHARACTERS,
    chatHistory: DEMO_HISTORY,
    respond,
    latencyMs: 220,
    tokenDelayMs: 14,
  });
}
