// Swahili and English text.  Static page text uses data-i18n="key"; code calls T('key', { vars }).
const STR = {
  loading: ['Mombasa inapakia…', 'Loading Mombasa…'],
  story: ['Kibaka amenyakua kikapu cha Mama Fatuma pale Likoni Ferry. Mkimbize, okota pesa, umshike!', 'Kibaka snatched Mama Fatuma\'s basket at Likoni Ferry. Chase him, grab the cash, catch him!'],
  how_lane: ['Badili njia', 'Change lane'], how_jump: ['Ruka', 'Jump'], how_slide: ['Teleza', 'Slide'], how_throw: ['Rusha ndara', 'Throw sandal'],
  play: ['CHEZA', 'PLAY'], endless: ['Mbio bila mwisho', 'Endless run'], best: ['Rekodi yako', 'Your best'],
  map_title: ['RAMANI YA MOMBASA', 'MOMBASA MAP'], map_sub: ['Chagua kiwango', 'Pick a level'], back: ['Rudi', 'Back'],
  level: ['Kiwango', 'Level'], start: ['ANZA', 'START'], locked: ['Maliza kiwango kilichopita kwanza', 'Clear the previous level first'],
  s_catch: ['Mshike Kibaka', 'Catch Kibaka'], s_coins: ['Okota KSh {n}', 'Collect KSh {n}'], s_clean: ['Bila kugongwa', 'Take no hits'],
  next_stop: ['Kituo kijacho', 'Next stop'], finish: ['Mwisho wa njia', 'End of the road'], finish_short: ['MWISHO', 'FINISH'],
  boost: ['KAHAWA: KASI + SUMAKU', 'COFFEE: SPEED + MAGNET'], shield: ['KOFIA YA BODA', 'BODA HELMET'], ride: ['NYUMA YA TUKTUK', 'TUK-TUK RIDE'],
  tripped: ['Amejikwaa!', 'Tripped!'], tired: ['Amechoka!', 'Tired!'],
  sh_start: ['MWIZI! MWIZI!', 'THIEF! THIEF!'], sh_hit: ['POLE!|AISEE!|CHUNGA!', 'OUCH!|WHOA!|CAREFUL!'], sh_throw: ['PAAP!|NDARA!|SHIKA HUYO!', 'SLAP!|SANDAL!|GET HIM!'],
  sh_coffee: ['KAHAWA TUNGU!', 'COFFEE RUSH!'], sh_helmet: ['KOFIA YA BODA!', 'BODA HELMET!'], sh_saved: ['KOFIA IMEOKOA!', 'HELMET SAVED YOU!'],
  sh_ride: ['PANDA TUKTUK!', 'TUK-TUK RIDE!'], sh_smash: ['PAAH!', 'SMASH!'], sh_crowd: ['WANANCHI: MWIZI!', 'CROWD: STOP THIEF!'],
  sh_blocked: ['WAMEMZUIA!', 'THEY BLOCKED HIM!'], sh_caught: ['UMEMSHIKA!', 'CAUGHT HIM!'], sh_again: ['AMETOROKA TENA!', 'HE GOT AWAY AGAIN!'],
  sh_night: ['USIKU WA NYALI', 'NYALI AT NIGHT'],
  caught_band: ['UMEMSHIKA!', 'CAUGHT HIM!'], caught_text: ['Kibaka amekamatwa pale {zone}. Kikapu kimerudi kwa Mama Fatuma!', 'Kibaka was caught at {zone}. Mama Fatuma has her basket back!'],
  caught_hint: ['Ukimfukuza tena na akutoroke, zawadi ya mshiko inapotea.', 'Chase him again and the catch bonus is lost if he escapes.'],
  again: ['Ametoroka tena! Mfukuze', 'He escaped again! Chase him'], bank: ['Chukua pesa, nenda nyumbani', 'Take the money and go home'],
  pause_band: ['PUMZIKA KIDOGO', 'TAKE A BREATHER'], resume: ['Endelea', 'Resume'], sound_on: ['Sauti: imewashwa', 'Sound: on'], sound_off: ['Sauti: imezimwa', 'Sound: off'],
  quit: ['Maliza mbio', 'End run'], lang: ['English', 'Kiswahili'],
  band_win: ['SHUJAA!', 'HERO!'], band_fall: ['UMEANGUKA!', 'KNOCKED OUT!'], band_quit: ['MBIO ZIMEISHA', 'RUN OVER'], band_lost: ['AMETOROKA!', 'HE GOT AWAY!'],
  over_win: ['Mama Fatuma amerudishiwa kikapu chake pale {zone}. Mombasa raha!', 'Mama Fatuma got her basket back at {zone}. Mombasa raha!'],
  over_lost: ['Kibaka ametoroka pale {zone}. Wananchi wamebaki wakipiga kelele!', 'Kibaka got away at {zone}. The crowd is still shouting!'],
  over_end: ['Mbio zako zimeishia {zone}.', 'Your run ended at {zone}.'], over_finish: ['Kibaka amefika mwisho wa njia. Jaribu tena!', 'Kibaka reached the end of the road. Try again!'],
  dist: ['Umbali', 'Distance'], catches: ['Mshiko', 'Catches'], record: ['Rekodi', 'Best'],
  retry: ['Cheza tena', 'Play again'], share: ['Tuma kwa marafiki', 'Share with friends'], copied: ['Imenakiliwa!', 'Copied!'],
  share_text: ['Nimepata KSh {n} nikimfukuza Kibaka kwenye MWIZI! Mombasa. Unaweza kunishinda?', 'I made KSh {n} chasing Kibaka in MWIZI! Mombasa. Can you beat me?'],
  win_band: ['UMEMSHIKA!', 'CAUGHT!'], win_text: ['{title}: kikapu kimerudi kwa Mama Fatuma!', '{title}: Mama Fatuma has her basket back!'],
  next_level: ['Kiwango kijacho', 'Next level'], replay: ['Rudia', 'Replay'], to_map: ['Ramani', 'Map'], all_done: ['Umemaliza Mombasa yote!', 'You cleared all of Mombasa!'],
  sh_near: ['WAAH! KARIBU!|AISEE, KARIBU SANA!', 'WHOA! CLOSE ONE!|NEAR MISS!'],
  intro1: ['Likoni Ferry, mchana wa Jumamosi…', 'Likoni Ferry, Saturday afternoon…'], intro2: ['Kibaka amenyakua kikapu!', 'Kibaka grabbed the basket!'],
  intro_go: ['TWENDE!', 'LET\'S GO!'], skip: ['Gusa kuruka', 'Tap to skip'],
  tut_lane: ['Telezesha kando ukwepe!', 'Swipe sideways to dodge!'], tut_jump: ['Telezesha juu uruke!', 'Swipe up to jump!'],
  tut_slide: ['Telezesha chini uteleze!', 'Swipe down to slide!'], tut_throw: ['Gusa RUSHA umpige ndara!', 'Tap THROW to hit him with a sandal!'],
  settings: ['MIPANGILIO', 'SETTINGS'], graphics: ['Michoro', 'Graphics'], g_high: ['Bora', 'Best'], g_low: ['Haraka', 'Fast'],
  music: ['Muziki', 'Music'], effects: ['Sauti za mchezo', 'Sound effects'], vibrate: ['Mtetemo', 'Vibration'], language: ['Lugha', 'Language'],
  on: ['Washa', 'On'], off: ['Zima', 'Off'], done: ['Sawa', 'Done'],
  tip1: ['Kahawa tungu inakupa kasi na sumaku ya pesa.', 'Kahawa coffee gives you speed and a coin magnet.'],
  tip2: ['Panda njia panda ukimbie juu ya matatu!', 'Run up the ramps and race along the matatu roofs!'],
  tip3: ['Kofia ya boda inakulinda mara moja.', 'The boda helmet saves you from one hit.'],
  tip4: ['Kaa njia moja na Kibaka, wananchi watamzuia.', 'Stay in Kibaka\'s lane and the crowd will block him.'],
  tip5: ['Pita karibu na magari upate bonasi!', 'Brush past traffic for a near-miss bonus!'],
  demo_tag: ['Mbio za mitaa ya Mombasa', 'Mombasa street chase'], demo_end: ['Mshike Kibaka. Mombasa Raha!', 'Catch the thief. Mombasa Raha!'], demo_cta: ['Cheza sasa kwenye Android', 'Play now on Android'],
};

let lang = 'sw';
try { lang = localStorage.getItem('mwizi.lang') || 'sw'; } catch { /* storage blocked: stay in Swahili */ }
export const getLang = () => lang;
export function T(key, vars) {
  let s = (STR[key] || [key, key])[lang === 'en' ? 1 : 0];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
export const TS = key => T(key).split('|'); // shout variants
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
}
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('mwizi.lang', l); } catch { /* not saved, still switches */ }
  applyI18n();
}
// the other language, for subtitles in the share video
export function T2(key) { return (STR[key] || [key, key])[lang === 'en' ? 0 : 1]; }
