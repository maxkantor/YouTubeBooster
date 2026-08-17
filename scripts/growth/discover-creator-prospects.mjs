#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSV_HEADER, csvContainsEmail, csvRow, probeDemo, subscriberRange } from './lib/creator-acquisition.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../docs/growth/prospects');

const cooking = [
  { input: '@LoveAndLemons', niche: 'cooking', contact: 'https://loveandlemons.com/contact/', contactStatus: 'Contact route available — automated email unavailable' },
  { input: '@TheDefinedDish', niche: 'cooking', contact: 'https://thedefineddish.com/contact/', contactStatus: 'Contact route available — automated email unavailable' },
  { input: '@TaylorKitchen5226', niche: 'cooking', contact: 'https://www.taylorkitchen.net/about.html', contactStatus: 'source_recorded_unverified' },
  { input: '@kelvinskitchen', niche: 'cooking', contact: 'https://kelvinskitchen.com/contact/', contactStatus: 'Contact route available — automated email unavailable' },
  { input: '@SohlaAndHam', niche: 'cooking', contact: 'https://www.hellosohla.com/contact', contactStatus: 'Contact route available — automated email unavailable' },
  { input: '@WellPlated', niche: 'cooking', contact: 'https://www.wellplated.com/contact/', contactStatus: 'Contact route available — automated email unavailable' },
  { input: '@SmittenKitchen', niche: 'cooking', contact: 'https://smittenkitchen.com/about/', contactStatus: 'source_recorded_unverified' },
  { input: '@IndianHealthyRecipes', niche: 'cooking', contact: 'https://www.indianhealthyrecipes.com/about/', contactStatus: 'source_recorded_unverified' },
  { input: '@Skinnytaste', niche: 'cooking', contact: 'https://www.skinnytaste.com/contact/', contactStatus: 'Contact route available — automated email unavailable' },
  { input: '@PinchOfYum', niche: 'cooking', contact: 'https://pinchofyum.com/contact', contactStatus: 'Contact route available — automated email unavailable' },
  { input: 'Simple and Delicious Recipes', niche: 'cooking' },
  { input: 'Home Cooking Mom', niche: 'cooking' },
  { input: "Michelle's Southern Home Cooking & Living", niche: 'cooking' },
  { input: 'Home Cook Basics', niche: 'cooking' },
  { input: "Remy's Home Cooking", niche: 'cooking' },
  { input: "Marie's Home Cooking Ideas", niche: 'cooking' },
  { input: 'Cook with Me', niche: 'cooking' },
  { input: 'Cook Book', niche: 'cooking' },
  { input: "Leon's Home Cooking", niche: 'cooking' },
  { input: '@ipovarenok5244', niche: 'cooking', lang: 'ru' },
  { input: '@olga_egorova_food', niche: 'cooking', lang: 'ru' },
  { input: '@русскаякухня', niche: 'cooking', lang: 'ru' },
  { input: '@na-kostre', niche: 'cooking', lang: 'ru', contact: 'https://www.na-kostre.ru/', contactStatus: 'source_recorded_unverified' },
  { input: '@recepti_dariko', niche: 'cooking', lang: 'uk' },
  { input: '@vkusno_i_prosto', niche: 'cooking', lang: 'ru' },
  { input: '@gotovim365', niche: 'cooking', lang: 'ru' },
  { input: '@u_teshchi_oli', niche: 'cooking', lang: 'uk' },
  { input: '@shira_gospodiny', niche: 'cooking', lang: 'uk' },
  { input: '@kulinarny_vytivky', niche: 'cooking', lang: 'uk' },
  { input: '@vkazane', niche: 'cooking', lang: 'ru' },
  { input: '@BudgetBytes', niche: 'cooking' },
  { input: '@CafeDelites', niche: 'cooking' },
  { input: '@recipetineats', niche: 'cooking' },
  { input: '@NatashasKitchen', niche: 'cooking' },
  { input: '@downshiftology', niche: 'cooking' },
  { input: '@themediterraneandish', niche: 'cooking' },
  { input: '@feelgoodfoodie', niche: 'cooking' },
  { input: '@ambitiouskitchen', niche: 'cooking' },
  { input: '@minimalistbaker', niche: 'cooking' },
  { input: '@halfbakedharvest', niche: 'cooking' },
  { input: '@cookieandkate', niche: 'cooking' },
  { input: '@sallysbakeblog', niche: 'cooking' },
  { input: '@preppykitchen', niche: 'cooking' },
  { input: '@handletheheat', niche: 'cooking' },
  { input: '@bakerbettie', niche: 'cooking' },
  { input: '@thestayathomechef', niche: 'cooking' },
  { input: '@gimmesomeoven', niche: 'cooking' },
  { input: '@cookingclassy', niche: 'cooking' },
  { input: '@spendwithpennies', niche: 'cooking' },
  { input: '@therecipecritic', niche: 'cooking' },
  { input: '@cafedelitesofficial', niche: 'cooking' },
  { input: '@tasty', niche: 'cooking' },
  { input: '@bonappetit', niche: 'cooking' },
  { input: '@NYTCooking', niche: 'cooking' },
  { input: '@AmericaTestKitchen', niche: 'cooking' },
  { input: '@joshuaweissman', niche: 'cooking' },
  { input: '@babishculinaryuniverse', niche: 'cooking' },
  { input: '@bingingwithbabish', niche: 'cooking' },
  { input: '@youcanmakeit', niche: 'cooking' },
  { input: '@homecookingadventure', niche: 'cooking' },
  { input: '@cookingwithshereen', niche: 'cooking' },
  { input: '@cookingwithlynja', niche: 'cooking' },
  { input: '@youSuckAtCooking', niche: 'cooking' },
  { input: '@sortedfood', niche: 'cooking' },
  { input: '@foodwishes', niche: 'cooking' },
  { input: '@emmas_mini_kitchen', niche: 'cooking' },
  { input: '@thatduocook', niche: 'cooking' },
  { input: '@farmhouseonboone', niche: 'cooking' },
  { input: '@theslowroasteditalian', niche: 'cooking' },
  { input: '@oursaltykitchen', niche: 'cooking' },
  { input: '@thekitchn', niche: 'cooking' }
];

const other = [
  { input: '@athleanx', niche: 'fitness' },
  { input: '@HeatherRobertsonCom', niche: 'fitness' },
  { input: '@growingannanas', niche: 'fitness' },
  { input: '@MadFit', niche: 'fitness' },
  { input: '@blogilates', niche: 'fitness' },
  { input: '@PamelaReif', niche: 'fitness' },
  { input: '@thenx', niche: 'fitness' },
  { input: '@calisthenicmovement', niche: 'fitness' },
  { input: '@FitnessBlender', niche: 'fitness' },
  { input: '@HASfit', niche: 'fitness' },
  { input: '@SydneyCummings', niche: 'fitness' },
  { input: '@MoveWithNicole', niche: 'fitness' },
  { input: '@YogaWithAdriene', niche: 'fitness' },
  { input: '@BohoBeautiful', niche: 'fitness' },
  { input: '@TheFitnessMarshall', niche: 'fitness' },
  { input: '@KaraandNate', niche: 'travel' },
  { input: '@lostleblanc', niche: 'travel' },
  { input: '@TheBucketListFamily', niche: 'travel' },
  { input: '@drewbinsky', niche: 'travel' },
  { input: '@EamonAndBec', niche: 'travel' },
  { input: '@WoltersWorld', niche: 'travel' },
  { input: '@MarkWiens', niche: 'travel' },
  { input: '@TheTimTraveller', niche: 'travel' },
  { input: '@indigotraveller', niche: 'travel' },
  { input: '@fearlessandfar', niche: 'travel' },
  { input: '@ILikeToMakeStuff', niche: 'diy' },
  { input: '@seejanedrill', niche: 'diy' },
  { input: '@thisoldhouse', niche: 'diy' },
  { input: '@HomesteadAlternative', niche: 'diy' },
  { input: '@essentialcraftsman', niche: 'diy' },
  { input: '@fixthisbuildthat', niche: 'diy' },
  { input: '@aprilwilkerson', niche: 'diy' },
  { input: '@make', niche: 'diy' },
  { input: '@thesorrygirls', niche: 'diy' },
  { input: '@annawoods', niche: 'diy' },
  { input: '@GardenAnswer', niche: 'diy' },
  { input: '@selfsufficientme', niche: 'diy' },
  { input: '@aliabdaal', niche: 'education' },
  { input: '@ThomasFrank', niche: 'education' },
  { input: '@mattiasdahlstrom', niche: 'education' },
  { input: '@BetterThanYesterday', niche: 'education' },
  { input: '@PracticalPsychology', niche: 'education' },
  { input: '@TheOrganicChemistryTutor', niche: 'education' },
  { input: '@crashcourse', niche: 'education' },
  { input: '@Nerdwriter1', niche: 'education' },
  { input: '@Wendoverproductions', niche: 'education' },
  { input: '@CGPGrey', niche: 'education' },
  { input: '@LegalEagle', niche: 'other' },
  { input: '@TechnologyConnections', niche: 'other' },
  { input: '@PracticalEngineeringChannel', niche: 'other' },
  { input: '@thecodingtrain', niche: 'other' },
  { input: '@fireship', niche: 'other' }
];

function opportunity(findings) {
  const blob = (findings || []).join(' ');
  if (/weak descriptions/i.test(blob)) return 'weak_descriptions';
  if (/titles that are likely under-optimized/i.test(blob)) return 'title_packaging';
  if (/every\s+([0-9.]+)\s+days/i.test(blob) && Number(RegExp.$1) > 21) return 'upload_cadence';
  return 'discoverability';
}

function parseCadence(findings) {
  const m = (findings || []).join(' ').match(/every\s+([0-9.]+)\s+days/i);
  return m ? Number(m[1]) : null;
}

async function runPool(jobs, n = 5) {
  const out = [];
  const q = [...jobs];
  await Promise.all(Array.from({ length: n }, async () => {
    while (q.length) {
      const job = q.shift();
      try {
        const r = await probeDemo(job.input);
        out.push({ job, r });
        const tag = !r.ok ? 'ERR' : r.preview ? 'placeholder' : r.subs;
        console.log(job.input, '->', tag, r.title || '');
      } catch (e) {
        out.push({ job, r: { ok: false, error: String(e), channelInput: job.input } });
        console.log(job.input, 'THROW', e.message || e);
      }
    }
  }));
  return out;
}

function toRow(job, r, prefix, i) {
  const handle = r.handle ? (String(r.handle).startsWith('@') ? r.handle : `@${r.handle}`) : job.input;
  const subs = r.subs || 0;
  const inBand = subs >= 1000 && subs <= 100000;
  const cadence = parseCadence(r.findings);
  let fit = 0;
  if (inBand) fit += 15;
  if ((cadence || 99) <= 60) fit += 15;
  const opp = opportunity(r.findings);
  if (opp !== 'discoverability') fit += 25;
  if (job.contact) fit += 8;
  fit += 10;
  return {
    prospectId: `${prefix}-P${String(i).padStart(3, '0')}`,
    channelName: r.title || job.input,
    handle,
    channelUrl: handle.startsWith('http') ? handle : `https://www.youtube.com/${handle}`,
    niche: job.niche,
    subscriberRange: subscriberRange(subs),
    recentUploadDate: '',
    fitScore: Math.min(100, fit),
    opportunityCategory: opp,
    contactSourceUrl: job.contact || '',
    contactStatus: job.contactStatus || (job.contact ? 'source_recorded_unverified' : 'none'),
    approvalStatus: 'none',
    subs,
    preview: r.preview,
    ok: r.ok,
    findings: r.findings
  };
}

const cookingResults = await runPool(cooking, 5);
const otherResults = await runPool(other, 5);

const cookingRows = [];
const rejected = [];
let n = 1;
const seen = new Set();
for (const { job, r } of cookingResults) {
  if (!r.ok || r.preview) {
    rejected.push({ input: job.input, reason: r.preview ? 'youtube_placeholder' : (r.error || 'unresolved') });
    continue;
  }
  const key = (r.handle || job.input).toLowerCase();
  if (seen.has(key)) {
    rejected.push({ input: job.input, reason: 'duplicate_handle' });
    continue;
  }
  seen.add(key);
  if (r.subs > 100000) {
    rejected.push({ input: job.input, title: r.title, subs: r.subs, reason: 'over_100k' });
    continue;
  }
  if (r.subs < 1000) {
    rejected.push({ input: job.input, title: r.title, subs: r.subs, reason: 'under_1k' });
    continue;
  }
  cookingRows.push(toRow(job, r, 'COOK-001', n++));
}

const otherRows = [];
n = 1;
for (const { job, r } of otherResults) {
  if (!r.ok || r.preview) {
    rejected.push({ input: job.input, reason: r.preview ? 'youtube_placeholder' : (r.error || 'unresolved') });
    continue;
  }
  const key = (r.handle || job.input).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  if (r.subs < 1000 || r.subs > 100000) {
    rejected.push({ input: job.input, title: r.title, subs: r.subs, reason: r.subs > 100000 ? 'over_100k' : 'under_1k' });
    continue;
  }
  otherRows.push(toRow(job, r, 'OTHER-001', n++));
}

fs.mkdirSync(outDir, { recursive: true });
const cookCsv = [CSV_HEADER, ...cookingRows.map(csvRow)].join('\n') + '\n';
const otherCsv = [CSV_HEADER, ...otherRows.map(csvRow)].join('\n') + '\n';
if (csvContainsEmail(cookCsv) || csvContainsEmail(otherCsv)) {
  throw new Error('CSV unexpectedly contained an email');
}
fs.writeFileSync(path.join(outDir, 'COOK-001-QUALIFIED.csv'), cookCsv);
fs.writeFileSync(path.join(outDir, 'OTHER-001-QUALIFIED.csv'), otherCsv);
fs.writeFileSync(path.join(outDir, 'rejected.json'), JSON.stringify(rejected, null, 2));
console.log(JSON.stringify({
  cookingQualified: cookingRows.length,
  otherQualified: otherRows.length,
  rejected: rejected.length,
  sending: 'disabled'
}, null, 2));
