// ============================================================================
// ReliefChain - 384-dimensional semantic embedding & triage engine
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
//
// How the embedding works (deterministic, no ML model download needed):
//   dims   0-63  : activation of 8 relief "concept clusters" (8 dims each),
//                  driven by weighted keyword / phrase hits
//   dims  64-383 : feature hashing of every (stemmed) token into 320 buckets
//   then the vector is L2-normalised so pgvector's cosine distance (<=>)
//   behaves exactly like it would with a neural sentence embedding.
//
// The output shape matches all-MiniLM-L6-v2 (384 dims), so swapping in a real
// model later only means replacing generateEmbedding().
// ============================================================================

import { query } from '@/lib/db/postgres';

export const EMBEDDING_DIMENSIONS = 384;
const CLUSTER_DIMS = 8;
const HASH_START = 64;

export interface SemanticMatchResult {
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  confidenceScore: number; // 0-100
  matchedTerms: string[];
}

interface Cluster {
  id: number; // = resource_categories.id
  code: string;
  name: string;
  terms: Record<string, number>; // keyword or phrase -> weight
}

const RELIEF_CLUSTERS: Cluster[] = [
  { id: 1, code: 'WAT-01', name: 'Potable Drinking Water (20L Cans)',
    terms: { water: 0.95, drinking: 0.98, thirst: 0.92, thirsty: 0.92, dehydration: 0.95, hydration: 0.9, 'clean water': 0.99, potable: 0.98, bottled: 0.88, contaminated: 0.85 } },
  { id: 2, code: 'MED-01', name: 'Emergency Trauma Surgical Kit',
    terms: { trauma: 0.99, bleeding: 0.96, fracture: 0.95, wound: 0.92, injury: 0.94, injured: 0.94, doctor: 0.9, blood: 0.93, splint: 0.89, bandage: 0.88, surgical: 0.97, broken: 0.85 } },
  { id: 3, code: 'MED-02', name: 'Insulin & Chronic Care Medicines Box',
    terms: { insulin: 0.99, diabetic: 0.98, diabetes: 0.98, medicine: 0.9, medication: 0.9, prescription: 0.92, asthma: 0.89, inhaler: 0.94, dialysis: 0.96, elderly: 0.7, 'blood pressure': 0.87 } },
  { id: 4, code: 'FOD-01', name: 'High-Protein MRE Meal Ration (Case of 24)',
    terms: { food: 0.98, starving: 0.95, hunger: 0.94, hungry: 0.94, meal: 0.92, ration: 0.95, groceries: 0.85, 'baby formula': 0.97, 'infant food': 0.96, milk: 0.8, 'dry food': 0.91 } },
  { id: 5, code: 'SHL-01', name: 'All-Weather 6-Person Relief Tents',
    terms: { tent: 0.99, shelter: 0.96, roof: 0.85, homeless: 0.95, displaced: 0.93, evacuee: 0.9, 'washed away': 0.9, tarpaulin: 0.96, 'in the open': 0.92, exposure: 0.85 } },
  { id: 6, code: 'PWR-01', name: 'Solar Emergency Power Generator 5kW',
    terms: { power: 0.95, generator: 0.98, electricity: 0.94, blackout: 0.92, substation: 0.89, battery: 0.88, charge: 0.8, oxygen: 0.97, concentrator: 0.98, fuel: 0.86, ventilator: 0.96 } },
  { id: 7, code: 'HYG-01', name: 'Water Purification & Sanitation Pack',
    terms: { purification: 0.98, tablet: 0.9, sanitation: 0.94, chlorine: 0.95, cholera: 0.97, diarrhoea: 0.94, diarrhea: 0.94, hygiene: 0.9, soap: 0.86, latrine: 0.89, sewage: 0.91 } },
  { id: 8, code: 'SHL-02', name: 'Thermal Wool Blankets (Pack of 10)',
    terms: { blanket: 0.98, cold: 0.94, hypothermia: 0.97, shivering: 0.92, warmth: 0.93, freezing: 0.91, thermal: 0.9, damp: 0.87, night: 0.6 } },
];

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

/** Which of a cluster's terms occur in the text (phrases need an exact token run). */
function matchedTerms(tokens: string[], cluster: Cluster): string[] {
  const tokenSet = new Set(tokens);
  const joined = ` ${tokens.join(' ')} `;
  return Object.keys(cluster.terms).filter((term) => {
    const t = tokenize(term);
    return t.length === 1 ? tokenSet.has(t[0]) : joined.includes(` ${t.join(' ')} `);
  });
}

function hashToken(token: string, seed: number): number {
  // FNV-1a 32-bit
  let h = 2166136261 ^ seed;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------
export function generateEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = tokenize(text);

  // 1. Concept-cluster activations
  RELIEF_CLUSTERS.forEach((cluster, c) => {
    const score = matchedTerms(tokens, cluster).reduce((sum, term) => sum + cluster.terms[term], 0);
    for (let i = 0; i < CLUSTER_DIMS; i++) {
      vector[c * CLUSTER_DIMS + i] = score * Math.cos((i + 1) * 0.4);
    }
  });

  // 2. Hashed bag-of-words (two hash functions reduce collision impact)
  const buckets = EMBEDDING_DIMENSIONS - HASH_START;
  for (const token of tokens) {
    if (token.length < 3) continue; // skip "a", "of", "to" ...
    vector[HASH_START + (hashToken(token, 0) % buckets)] += 0.85;
    vector[HASH_START + (hashToken(token, 0x9e3779b9) % buckets)] += 0.65;
  }

  // 3. L2 normalisation (||v|| = 1)
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

/** pgvector literal: '[0.1,0.2,...]' */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot)); // vectors are unit length
}

// Canonical vector for each relief category, computed once
const CLUSTER_VECTORS = RELIEF_CLUSTERS.map((c) => generateEmbedding(`${c.name} ${Object.keys(c.terms).join(' ')}`));

/** Rank relief categories by cosine similarity to the distress text. */
export function matchDistressCall(text: string): SemanticMatchResult[] {
  const queryVec = generateEmbedding(text);
  const tokens = tokenize(text);
  return RELIEF_CLUSTERS.map((cluster, i) => ({
    categoryId: cluster.id,
    categoryCode: cluster.code,
    categoryName: cluster.name,
    confidenceScore: Number((cosineSimilarity(queryVec, CLUSTER_VECTORS[i]) * 100).toFixed(1)),
    matchedTerms: matchedTerms(tokens, cluster),
  }))
    .filter((m) => m.confidenceScore > 15)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
}

// ---------------------------------------------------------------------------
// Urgency heuristics
// ---------------------------------------------------------------------------
const CRITICAL_WORDS = ['trapped', 'dying', 'bleeding', 'collapse', 'collapsed', 'critical', 'drowning', 'unconscious', 'not breathing', 'immediately'];
const HIGH_WORDS = ['medicine', 'insulin', 'water', 'food', 'infant', 'baby', 'child', 'children', 'elderly', 'injured', 'oxygen', 'shivering'];

export function detectUrgency(text: string, victimCount: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' {
  const joined = ` ${tokenize(text).join(' ')} `;
  const has = (w: string) => joined.includes(` ${tokenize(w).join(' ')} `);
  if (CRITICAL_WORDS.some(has) || victimCount > 10) return 'CRITICAL';
  if (HIGH_WORDS.some(has)) return 'HIGH';
  return 'MEDIUM';
}

// ---------------------------------------------------------------------------
// Back-fill embeddings for rows inserted by SQL seed scripts / psql
// ---------------------------------------------------------------------------
export async function ensureSosEmbeddings(): Promise<number> {
  const missing = await query<{ id: number; raw_message: string }>(
    `SELECT id, raw_message FROM emergency_sos_signals WHERE embedding IS NULL LIMIT 500`
  );
  for (const row of missing.rows) {
    await query(`UPDATE emergency_sos_signals SET embedding = $1::vector WHERE id = $2`, [
      toPgVector(generateEmbedding(row.raw_message)),
      row.id,
    ]);
  }
  return missing.rowCount ?? 0;
}
