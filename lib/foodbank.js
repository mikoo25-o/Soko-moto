// Food Bank + Impact Rewards: scoring, ranking boost and DEMO data.
// Everything exported as DEMO_* is illustrative sample data. It is labelled "Demo" in the UI and must never be presented as real impact.

export const SCORE_WEIGHTS = [
  { key: 'quantity', label: 'Verified food recovered', weight: 35 },
  { key: 'collection', label: 'Collection / delivery success', weight: 25 },
  { key: 'consistency', label: 'Consistency over time', weight: 20 },
  { key: 'nutrition', label: 'Nutritious, useful food', weight: 10 },
  { key: 'feedback', label: 'Reliability & recipient feedback', weight: 10 }
];
export const BOOST_CAP = 0.15;        // the boost can never be more than 15% of a ranking score
export const BOOST_MIN_SCORE = 60;    // minimum impact score to qualify
export const BOOST_MIN_HANDOVERS = 3; // and at least this many verified handovers
const KG_FOR_FULL_MARKS = 500, MONTHS_FOR_FULL_MARKS = 6;

// c = { kg, collectionRate(0-1), monthsActive, nutritionShare(0-1), rating(0-5), handovers }
export function impactBreakdown(c) {
  const parts = {
    quantity: Math.min(c.kg / KG_FOR_FULL_MARKS, 1),
    collection: Math.max(0, Math.min(c.collectionRate, 1)),
    consistency: Math.min(c.monthsActive / MONTHS_FOR_FULL_MARKS, 1),
    nutrition: Math.max(0, Math.min(c.nutritionShare, 1)),
    feedback: Math.max(0, Math.min(c.rating / 5, 1))
  };
  return SCORE_WEIGHTS.map(w => ({ ...w, fraction: parts[w.key], points: parts[w.key] * w.weight }));
}
export function impactScore(c) { return Math.round(impactBreakdown(c).reduce((s, p) => s + p.points, 0)); }
export function isBoostEligible(c) { return c.handovers >= BOOST_MIN_HANDOVERS && impactScore(c) >= BOOST_MIN_SCORE; }

// Relevance (0-100: search match, price, freshness, distance, availability) always carries at least 85% of the final rank.
export function rankScore(relevance, contributor, boostOn = true) {
  if (!boostOn) return { total: relevance, boost: 0 };
  const boost = contributor && isBoostEligible(contributor) ? BOOST_CAP * impactScore(contributor) : 0;
  return { total: (1 - BOOST_CAP) * relevance + boost, boost };
}
// Points for one verified handover (mirrors supabase/foodbank.sql).
export function handoverPoints(kg, nutritious) { return Math.round(kg * (nutritious ? 1.2 : 1)); }

export const BADGES = [
  { min: 85, label: 'Gold Rescuer' }, { min: 70, label: 'Silver Rescuer' }, { min: 60, label: 'Trusted Contributor' }, { min: 0, label: 'Rising Contributor' }
];
export const badgeFor = score => BADGES.find(b => score >= b.min).label;

export const DEMO_CONTRIBUTORS = [
  { id: 'c1', name: 'Wanjiru Greens Co-op', county: 'Nakuru', kg: 640, collectionRate: .96, monthsActive: 6, nutritionShare: .9, rating: 4.8, handovers: 21 },
  { id: 'c2', name: 'Kamau & Sons Farm', county: 'Kiambu', kg: 410, collectionRate: .92, monthsActive: 5, nutritionShare: .8, rating: 4.6, handovers: 15 },
  { id: 'c3', name: 'Rift Valley Produce Hub', county: 'Nakuru', kg: 520, collectionRate: .85, monthsActive: 4, nutritionShare: .6, rating: 4.4, handovers: 12 },
  { id: 'c4', name: 'Mama Achieng Vegetables', county: 'Kisumu', kg: 160, collectionRate: .94, monthsActive: 5, nutritionShare: 1, rating: 4.9, handovers: 14 },
  { id: 'c5', name: 'Mt. Kenya Fruit Growers', county: 'Meru', kg: 240, collectionRate: .78, monthsActive: 3, nutritionShare: .85, rating: 4.1, handovers: 8 },
  { id: 'c6', name: 'Coast Fresh Traders', county: 'Mombasa', kg: 90, collectionRate: .7, monthsActive: 2, nutritionShare: .5, rating: 3.9, handovers: 3 },
  { id: 'c7', name: 'Newcomer Greens', county: 'Machakos', kg: 30, collectionRate: 1, monthsActive: 1, nutritionShare: 1, rating: 5, handovers: 1 }
];

// route: 'donate' | 'sell' | 'split'. price = recovery price per unit (KSh) when selling.
export const DEMO_OFFERS = [
  { id: 'd1', title: 'Surplus tomatoes (slightly soft, safe to eat)', category: 'Vegetables', quantity: 200, unit: 'kg', county: 'Nakuru', area: 'Wakulima Market', route: 'donate', contributor: 'c1', condition: 'Soft but sound', days: 1, description: 'Collect today before 5pm. Best for cooking or community kitchens.' },
  { id: 'd2', title: 'Sukuma wiki bundles', category: 'Vegetables', quantity: 120, unit: 'bunch', county: 'Kiambu', area: 'Limuru Road', route: 'sell', price: 15, contributor: 'c2', condition: 'Fresh, harvested yesterday', days: 2, description: 'Recovery price KSh 15 per bunch (normally KSh 30).' },
  { id: 'd3', title: 'Ripe bananas', category: 'Fruits', quantity: 150, unit: 'kg', county: 'Nakuru', area: 'Gilgil', route: 'split', price: 40, contributor: 'c3', condition: 'Very ripe', days: 2, description: '50% donated to the food bank, 50% on sale at KSh 40/kg.' },
  { id: 'd4', title: 'Carrots, odd-shaped but fresh', category: 'Vegetables', quantity: 300, unit: 'kg', county: 'Nyandarua', area: 'Ol Kalou', route: 'sell', price: 50, contributor: 'c1', condition: 'Fresh, imperfect shape', days: 4, description: 'Imperfect shape, same taste. Recovery price KSh 50/kg.' },
  { id: 'd5', title: 'Spinach, surplus after market day', category: 'Vegetables', quantity: 60, unit: 'kg', county: 'Kisumu', area: 'Kibuye Market', route: 'donate', contributor: 'c4', condition: 'Fresh', days: 1, description: 'Must be collected by tomorrow morning.' },
  { id: 'd6', title: 'Mangoes (ripe, bruised skins)', category: 'Fruits', quantity: 180, unit: 'kg', county: 'Mombasa', area: 'Kongowea', route: 'sell', price: 35, contributor: 'c6', condition: 'Ripe, bruised skins', days: 2, description: 'Great for juice or pulp. Recovery price KSh 35/kg.' },
  { id: 'd7', title: 'Maize flour, damaged packaging only', category: 'Cereals', quantity: 40, unit: 'pack', county: 'Machakos', area: 'Athi River', route: 'donate', contributor: 'c7', condition: 'Product intact, outer pack torn', days: 14, description: 'Repacked and safe. Ideal for a school feeding programme.' },
  { id: 'd8', title: 'Eggs, cracked-tray surplus (unbroken eggs)', category: 'Poultry & Eggs', quantity: 25, unit: 'tray', county: 'Kiambu', area: 'Ruiru', route: 'split', price: 300, contributor: 'c2', condition: 'Unbroken eggs only', days: 3, description: 'Half donated, half sold at KSh 300/tray.' },
  { id: 'd9', title: 'Cabbages (outer leaves trimmed)', category: 'Vegetables', quantity: 250, unit: 'kg', county: 'Meru', area: 'Nkubu', route: 'donate', contributor: 'c5', condition: 'Fresh', days: 3, description: 'Pick-up from the farm gate with a vehicle.' },
  { id: 'd10', title: 'Passion fruit, oversupply', category: 'Fruits', quantity: 90, unit: 'kg', county: 'Murang’a', area: 'Kenol', route: 'sell', price: 60, contributor: 'c5', condition: 'Fresh', days: 5, description: 'Recovery price KSh 60/kg.' }
];
export const DEMO_REQUESTS = [
  { id: 'r1', title: 'Vegetables for a community kitchen', category: 'Vegetables', quantity: 80, unit: 'kg', county: 'Nairobi', area: 'Kibera', organisation: 'Demo Community Kitchen', description: 'Feeds about 150 people three days a week.', days: 6 },
  { id: 'r2', title: 'Fruit for a primary-school feeding programme', category: 'Fruits', quantity: 60, unit: 'kg', county: 'Kisumu', area: 'Nyalenda', organisation: 'Demo Primary School', description: 'Weekly snack for pupils.', days: 8 },
  { id: 'r3', title: 'Maize and pulses for a care home', category: 'Grains & Pulses', quantity: 50, unit: 'kg', county: 'Nakuru', area: 'Bahati', organisation: 'Demo Elders Care Home', description: 'Dry goods, long shelf life.', days: 12 },
  { id: 'r4', title: 'Fresh produce for a women’s self-help group', category: 'Vegetables', quantity: 40, unit: 'kg', county: 'Machakos', area: 'Mlolongo', organisation: 'Demo Self-Help Group', description: 'Pickup by group members with a pick-up truck.', days: 5 }
];

// Soko Moto Reach (DEMO): simulated campaign figures, deterministic so judges see stable numbers. These are illustrative, not forecasts.
export const REACH_PRODUCTS = [
  { id: 'p1', name: 'Fresh carrots', seller: 'Wanjiru Greens Co-op', county: 'Nakuru', price: 80, unit: 'kg', contributor: 'c1', hasCreative: true },
  { id: 'p2', name: 'Fresh sukuma wiki', seller: 'Kamau & Sons Farm', county: 'Kiambu', price: 30, unit: 'bunch', contributor: 'c2' },
  { id: 'p3', name: 'Ripe bananas', seller: 'Rift Valley Produce Hub', county: 'Nakuru', price: 60, unit: 'kg', contributor: 'c3' }
];
export function simulateCampaign(budgetKsh, score) {
  const quality = 0.85 + score / 400;                 // higher verified impact -> slightly better relevance in this demo
  const impressions = Math.round(budgetKsh * 18 * quality);
  const clicks = Math.round(impressions * 0.014);
  const enquiries = Math.round(clicks * 0.08);
  return { impressions, clicks, enquiries };
}
