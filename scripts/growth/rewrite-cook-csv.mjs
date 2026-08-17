import fs from 'node:fs';
import { CSV_HEADER, csvContainsEmail, csvRow } from './lib/creator-acquisition.mjs';

const extra = JSON.parse(fs.readFileSync(new URL('../../docs/growth/prospects/cook-extra.json', import.meta.url), 'utf8'));
const skip = new Set(['@salkay_zakarpattya', '@cookwithme']);

const base = [
  { id: 'COOK-001-P001', name: 'The Defined Dish', handle: '@thedefineddish', contact: 'https://thedefineddish.com/contact/', status: 'Contact route available — automated email unavailable', score: 73 },
  { id: 'COOK-001-P002', name: 'Love & Lemons', handle: '@lovelemonsfood', contact: 'https://loveandlemons.com/contact/', status: 'Contact route available — automated email unavailable', score: 73 },
  { id: 'COOK-001-P003', name: 'TAYLOR KITCHEN', handle: '@taylorkitchen5226', contact: 'https://www.taylorkitchen.net/about.html', status: 'source_recorded_unverified', score: 73 },
  { id: 'COOK-001-P004', name: "Kelvin's Kitchen", handle: '@kelvinskitchen', contact: 'https://kelvinskitchen.com/contact/', status: 'Contact route available — automated email unavailable', score: 73 },
  { id: 'COOK-001-P005', name: 'Sohla and Ham', handle: '@sohlaandham', contact: 'https://www.hellosohla.com/contact', status: 'Contact route available — automated email unavailable', score: 73 },
  { id: 'COOK-001-P006', name: 'Erin Clarke', handle: '@wellplated', contact: 'https://www.wellplated.com/contact/', status: 'Contact route available — automated email unavailable', score: 73 },
  { id: 'COOK-001-P007', name: 'Pinch of Yum', handle: '@pinchofyum', contact: 'https://pinchofyum.com/contact', status: 'Contact route available — automated email unavailable', score: 73 },
  { id: 'COOK-001-P008', name: 'I povarenok', handle: '@ipovarenok5244', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P009', name: "MARIE'S HOME COOKING IDEAS!", handle: '@marieshomecooking', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P010', name: 'Лелькины Вкусняшки', handle: '@olga_egorova_food', contact: '', status: 'none', score: 50 },
  { id: 'COOK-001-P011', name: 'Na-Kostre.ru | На-Костре.ру', handle: '@na-kostre', contact: 'https://www.na-kostre.ru/', status: 'source_recorded_unverified', score: 73 },
  { id: 'COOK-001-P012', name: "Remy's Home cooking", handle: '@remyshomecooking2493', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P013', name: 'Дарія Даріко', handle: '@recepti_dariko', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P014', name: 'Кулінарні рецепти від тещі Олі', handle: '@u_teshchi_oli', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P015', name: 'Турецкая кухня дома.', handle: '@vkusno_i_prosto', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P016', name: 'Готовим Каждый День', handle: '@gotovim365', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P017', name: 'Щира господиня', handle: '@shira_gospodiny', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P018', name: 'Кулінарні витівки', handle: '@kulinarny_vytivky', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P019', name: 'VKAZANE', handle: '@vkazane', contact: '', status: 'none', score: 50 },
  { id: 'COOK-001-P020', name: 'Ambitious Kitchen', handle: '@ambitiouskitchen', contact: '', status: 'none', score: 65 },
  { id: 'COOK-001-P021', name: 'Our Salty Kitchen', handle: '@oursaltykitchen', contact: '', status: 'none', score: 65 }
];

const have = new Set(base.map((r) => r.handle.toLowerCase()));
const extraRows = [];
let n = base.length;
for (const q of extra.qualified) {
  const h = (q.handle || '').toLowerCase();
  if (skip.has(h) || have.has(h)) continue;
  n += 1;
  extraRows.push({
    id: `COOK-001-P${String(n).padStart(3, '0')}`,
    name: q.title,
    handle: q.handle,
    contact: '',
    status: 'none',
    score: 50
  });
  have.add(h);
}

const all = [...base, ...extraRows].map((r) => csvRow({
  prospectId: r.id,
  channelName: r.name,
  handle: r.handle,
  channelUrl: `https://www.youtube.com/${r.handle}`,
  niche: 'cooking',
  subscriberRange: '1k_100k',
  recentUploadDate: '',
  fitScore: r.score,
  opportunityCategory: 'weak_descriptions',
  contactSourceUrl: r.contact,
  contactStatus: r.status,
  approvalStatus: 'none'
}));

const out = [CSV_HEADER, ...all].join('\n') + '\n';
if (csvContainsEmail(out)) throw new Error('email leaked');
if (out.split('\n').length < 20) throw new Error('too few rows');
fs.writeFileSync(new URL('../../docs/growth/prospects/COOK-001-QUALIFIED.csv', import.meta.url), out);
console.log('rows', all.length, 'lines', out.split('\n').length);
