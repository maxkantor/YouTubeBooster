import { useParams } from 'react-router-dom';

import audits from '../../seo/data/audits.json';
import guides from '../../seo/data/guides.json';
import solutions from '../../seo/data/solutions.json';
import type { ProgrammaticEntry } from './SeoProgrammaticArticlePage';
import { SeoProgrammaticArticlePage } from './SeoProgrammaticArticlePage';

export function AuditArticleRoute() {
  const { slug = '' } = useParams();
  const list = audits as ProgrammaticEntry[];
  const entry = list.find((a) => a.slug === slug);
  return (
    <SeoProgrammaticArticlePage
      basePath="/audit"
      hubLabel="Audits"
      entry={entry}
      allSlugs={list.map((a) => a.slug)}
    />
  );
}

export function SolutionArticleRoute() {
  const { slug = '' } = useParams();
  const list = solutions as ProgrammaticEntry[];
  const entry = list.find((a) => a.slug === slug);
  return (
    <SeoProgrammaticArticlePage
      basePath="/solutions"
      hubLabel="Solutions"
      entry={entry}
      allSlugs={list.map((a) => a.slug)}
    />
  );
}

export function GuideArticleRoute() {
  const { slug = '' } = useParams();
  const list = guides as ProgrammaticEntry[];
  const entry = list.find((a) => a.slug === slug);
  return (
    <SeoProgrammaticArticlePage
      basePath="/guides"
      hubLabel="Guides"
      entry={entry}
      allSlugs={list.map((a) => a.slug)}
    />
  );
}
