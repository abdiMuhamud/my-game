// Streets of Mombasa and the six story levels that string them together.
// `name` is the street's id inside the world builder; `sw`/`en` are what players read.
export const ZONES = {
  likoni:   { name: 'LIKONI FERRY',   sw: 'LIKONI FERRY',          en: 'LIKONI FERRY',        L: 'sea',    R: 'city' },
  moi:      { name: 'MOI AVENUE',     sw: 'MOI AVENUE',            en: 'MOI AVENUE',          L: 'city',   R: 'city' },
  digo:     { name: 'DIGO ROAD',      sw: 'BARABARA YA DIGO',      en: 'DIGO ROAD',           L: 'digo',   R: 'digo' },
  stage:    { name: 'MWEMBE TAYARI',  sw: 'STEJI YA MWEMBE TAYARI', en: 'MWEMBE TAYARI STAGE', L: 'stage',  R: 'stage' },
  marikiti: { name: 'MARIKITI',       sw: 'SOKO LA MARIKITI',      en: 'MARIKITI MARKET',     L: 'market', R: 'market' },
  oldtown:  { name: 'MJI WA KALE',    sw: 'MJI WA KALE',           en: 'OLD TOWN',            L: 'old',    R: 'old' },
  port:     { name: 'KILINDINI PORT', sw: 'BANDARI YA KILINDINI',  en: 'KILINDINI PORT',      L: 'port',   R: 'port' },
  fort:     { name: 'FORT JESUS',     sw: 'FORT JESUS',            en: 'FORT JESUS',          L: 'sea',    R: 'fort' },
  nyali:    { name: 'NYALI BRIDGE',   sw: 'DARAJA LA NYALI',       en: 'NYALI BRIDGE',        L: 'bridge', R: 'bridge' },
  centre:   { name: 'NYALI CENTRE',   sw: 'NYALI CENTRE',          en: 'NYALI CENTRE',        L: 'mall',   R: 'mall' },
  bamburi:  { name: 'BAMBURI BEACH',  sw: 'UFUKWE WA BAMBURI',     en: 'BAMBURI BEACH',       L: 'beach',  R: 'palms' },
};
for (const [id, z] of Object.entries(ZONES)) z.id = id;

// endless mode loops through every street in this order
export const ENDLESS = ['likoni', 'moi', 'digo', 'stage', 'marikiti', 'oldtown', 'port', 'fort', 'nyali', 'centre', 'bamburi'];
export const ENDLESS_LEN = 420;

// route: [street, metres]; pace: Kibaka's tiredness (lower = harder to close the gap); pin: spot on the map
export const LEVELS = [
  { id: 1, route: [['likoni', 260], ['moi', 380]], pace: 1.0, coins: 1200, pin: [168, 430],
    sw: { title: 'Likoni hadi Moi Avenue', tip: 'Telezesha kando kubadili njia, juu kuruka, chini kuteleza.' },
    en: { title: 'Likoni to Moi Avenue', tip: 'Swipe sideways to change lanes, up to jump, down to slide.' } },
  { id: 2, route: [['digo', 320], ['stage', 360]], pace: 0.95, coins: 1500, pin: [172, 300],
    sw: { title: 'Barabara ya Digo', tip: 'Bodaboda zinakatiza barabara. Angalia zinakoelekea!' },
    en: { title: 'Digo Road', tip: 'Bodabodas cut across the road. Watch where they are heading!' } },
  { id: 3, route: [['marikiti', 320], ['oldtown', 360]], pace: 0.92, coins: 1800, pin: [222, 262],
    sw: { title: 'Marikiti na Mji wa Kale', tip: 'Kaa njia moja na Kibaka: wananchi watamzuia.' },
    en: { title: 'Marikiti and Old Town', tip: 'Stay in Kibaka\'s lane and the crowd will block him.' } },
  { id: 4, route: [['port', 660]], pace: 0.9, coins: 2100, pin: [92, 330],
    sw: { title: 'Bandari ya Kilindini', tip: 'Panda makontena kwa njia panda. Chunga mizigo ya kreni!' },
    en: { title: 'Kilindini Port', tip: 'Climb the containers by the ramps. Watch the swinging crane loads!' } },
  { id: 5, route: [['fort', 200], ['nyali', 260], ['centre', 300]], pace: 0.88, coins: 2400, night: true, pin: [258, 182],
    sw: { title: 'Nyali Usiku', tip: 'Ni usiku! Panda nyuma ya tuktuk upite kila kitu.' },
    en: { title: 'Nyali by Night', tip: 'Night run! Hop on the back of a tuk-tuk to smash through.' } },
  { id: 6, route: [['bamburi', 720]], pace: 0.8, coins: 2800, pin: [292, 74],
    sw: { title: 'Fainali: Bamburi', tip: 'Kibaka ana kasi zaidi. Tumia kila ujanja!' },
    en: { title: 'Finale: Bamburi', tip: 'Kibaka is faster now. Use every trick!' } },
];

// the share video runs a short tour of the new streets
export const DEMO_ROUTE = [['moi', 96], ['digo', 66], ['port', 90], ['centre', 66], ['bamburi', 200]];

// A route turned into segments with start distances, so any world z maps to a street.
export function makeRoute(level) {
  if (!level) return { endless: true, at: z => { const i = Math.floor(Math.max(0, z) / ENDLESS_LEN); return { zone: ZONES[ENDLESS[i % ENDLESS.length]], index: i, start: i * ENDLESS_LEN, len: ENDLESS_LEN }; } };
  const segs = []; let s = 0;
  for (const [id, len] of level.route) { segs.push({ zone: ZONES[id], start: s, len }); s += len; }
  return {
    endless: false, length: s,
    at: z => { let i = segs.length - 1; while (i > 0 && z < segs[i].start) i--; return { ...segs[i], index: i }; },
    next: i => segs[i + 1] || null,
  };
}
