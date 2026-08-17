#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSV_HEADER, csvContainsEmail, csvRow, probeDemo, subscriberRange } from './lib/creator-acquisition.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../docs/growth/prospects');
const existing = fs.readFileSync(path.join(outDir, 'COOK-001-QUALIFIED.csv'), 'utf8');
const existingHandles = new Set(
  existing.split('\n').slice(1).filter(Boolean).map((l) => (l.split(',')[2] || '').toLowerCase())
);

const extra = [
  '@thewoksoflife', '@omnivorescookbook', '@soupeduprecipes', '@madewithlau',
  '@hotthaikitchen', '@seonkyounglongest', '@chinesecookingdemystified',
  '@thewoksoflife', '@pickuplimes', '@rainbowplantlife', '@cheaplazyvegan',
  '@noracooks', '@detoxinista', '@runningtothekitchen', '@bowlofdelicious',
  '@thecafesucrefarine', '@oursaltykitchen', '@farmhouseonboone',
  '@thatduocook', '@emmasminikitchen', '@homecookingmom', '@simpleanddeliciousrecipes',
  '@homecookbasics', '@leonshomecooking', '@cookbookchannel', '@cookwithme',
  '@cookinginmygenes', '@mykoreanvibe', '@maangchi', '@koreanbapsang',
  '@mykoreankitchen', '@kimchimari', '@futuredish', '@aaronandclaire',
  '@chefchrischo', '@seonkyoung', '@tastythais', '@hotthaikitchenofficial',
  '@mariongrasby', '@marionskitchen', '@adamliaw', '@ RecipetinEats',
  '@justonecookbook', '@norecipes', '@ochikeron', '@cookingwithdog',
  '@enjoysushi', '@sudachirecipes', '@okonomikitchen', '@chopstickchronicles',
  '@woonheng', '@thefoodietakesflight', '@yeungmancooking', '@madevisible',
  '@itdoesnttastelikechicken', '@minimalistbaker', '@hotforfood',
  '@theedgyveg', '@avantgardevegan', '@cheaplazyveganofficial',
  '@sarahsbakestudio', '@preppykitchen', '@handletheheat', '@livforcake',
  '@style_sweet_ca', '@cloudykitchen', '@buttermilkbysam',
  '@theboywhobakes', '@hummingbirdhigh', '@smittenkitchen',
  '@indianhealthyrecipes', '@skinnytasteofficial', '@wellplated',
  '@defineddish', '@loveandlemons', '@pinchofyumofficial',
  '@ambitiouskitchen', '@cookieandkateofficial', '@sallysbakingaddiction',
  '@halfbakedharvestkitchen', '@cafedelitesofficial',
  '@spendwithpenniesofficial', '@therecipecriticofficial',
  '@gimmesomeovenofficial', '@cookingclassyofficial',
  '@thestayathomechefofficial', '@natashaskitchen',
  '@downshiftologyofficial', '@feelgoodfoodieofficial',
  '@russkaya_kuhnya', '@russkaya_kuhnya_official', '@gotovimvkusno',
  '@ekaterinalav', '@ranchousancho', '@garik_gotovit',
  '@pateerecipes', '@nelly.cooking', '@cook_ua', '@anna_sholkova',
  '@tastyweek', '@cookingsv', '@salkay_zakarpattya',
  '@domashnie_recepty', '@gotovimvkazane', '@eda_v_kazane',
  '@proste_recepty', '@kuhnya365', '@gotovimdoma365',
  '@vkusnoitomtochka', '@umelaya_hozyayushka', '@simplecookingru',
  '@c1ymba_food', '@gotovimnakostre', '@eda_na_kostre',
  '@cooking_with_clan', '@juliacooks', '@julia_pacheco',
  '@juliapacheco', '@flavcity', '@flavcityofficial',
  '@ borborcooks', '@borborcooks', '@youcanicancook',
  '@cookingwithmorgan', '@morganeats', '@homecookedroots',
  '@midwestfoodie', '@themodernproper', '@halfbakedharvest',
  '@whatsgabycooking', '@whatsgabycookin', '@howsweeteats',
  '@pinchofyum', '@cookieandkate', '@budgetbytes',
  '@thugkitchen', '@badmanners', '@hotforfoodblog',
  '@thefirstmess', '@ohsheglows', '@minimalistbakerblog',
  '@mynewroots', '@greenkitchenstories', '@deliciouslyella',
  '@beforecsquared', '@pickuplimesofficial', '@cheaplazymillennial',
  '@cheaplazyvegan', '@cheap.lazy.vegan', '@cheaplazyveganchannel',
  '@sarahsbakestudio', '@cupcakejemma', '@preppykitchen',
  '@yotamottolenghi', '@ottolenghi', '@nigellalawson',
  '@jamieoliver', '@gordonramsay', '@foodnetwork',
  '@allrecipes', '@tasty', '@buzzfeedtasty'
];

function opportunity(findings) {
  const blob = (findings || []).join(' ');
  if (/weak descriptions/i.test(blob)) return 'weak_descriptions';
  if (/titles that are likely under-optimized/i.test(blob)) return 'title_packaging';
  if (/every\s+([0-9.]+)\s+days/i.test(blob) && Number(RegExp.$1) > 21) return 'upload_cadence';
  return 'discoverability';
}

const jobs = extra.filter((h) => !existingHandles.has(h.toLowerCase()));
const results = [];
const q = [...jobs];
await Promise.all(Array.from({ length: 5 }, async () => {
  while (q.length) {
    const input = q.shift();
    try {
      const r = await probeDemo(input);
      results.push({ input, r });
      console.log(input, '->', !r.ok ? 'ERR' : r.preview ? 'placeholder' : r.subs, r.title || '');
    } catch (e) {
      console.log(input, 'THROW', e.message || e);
    }
  }
}));

const qualified = [];
const rejected = [];
for (const { input, r } of results) {
  if (!r.ok || r.preview) {
    rejected.push({ input, reason: r.preview ? 'placeholder' : r.error });
    continue;
  }
  const handle = r.handle ? (String(r.handle).startsWith('@') ? r.handle : `@${r.handle}`) : input;
  if (existingHandles.has(handle.toLowerCase())) continue;
  if (r.subs < 1000 || r.subs > 100000) {
    rejected.push({ input, title: r.title, subs: r.subs, reason: r.subs > 100000 ? 'over_100k' : 'under_1k' });
    continue;
  }
  existingHandles.add(handle.toLowerCase());
  qualified.push({
    handle,
    title: r.title,
    subs: r.subs,
    opp: opportunity(r.findings),
    findings: r.findings
  });
}

console.log(JSON.stringify({ newInBand: qualified.length, rejected: rejected.length, sample: qualified.slice(0, 20) }, null, 2));
fs.writeFileSync(path.join(outDir, 'cook-extra.json'), JSON.stringify({ qualified, rejected }, null, 2));
