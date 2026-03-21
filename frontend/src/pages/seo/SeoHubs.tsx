import audits from '../../seo/data/audits.json';
import guides from '../../seo/data/guides.json';
import solutions from '../../seo/data/solutions.json';
import { SeoHubPage } from './SeoHubPage';

export function AuditHubPage() {
  const items = (audits as { slug: string; title: string; description: string }[]).map((a) => ({
    slug: a.slug,
    title: a.title,
    description: a.description
  }));
  return (
    <SeoHubPage
      title={`YouTube audits – keyword index | YouTube Booster`}
      intro="Programmatic SEO pages for YouTube channel audits. Each URL is indexable with unique copy and structured data."
      basePath="/audit"
      items={items}
    />
  );
}

export function SolutionsHubPage() {
  const items = (solutions as { slug: string; title: string; description: string }[]).map((a) => ({
    slug: a.slug,
    title: a.title,
    description: a.description
  }));
  return (
    <SeoHubPage
      title={`YouTube growth solutions | YouTube Booster`}
      intro="Problem-focused pages: CTR, retention, and conversion—built for topical authority and internal linking."
      basePath="/solutions"
      items={items}
    />
  );
}

export function GuidesHubPage() {
  const items = (guides as { slug: string; title: string; description: string }[]).map((a) => ({
    slug: a.slug,
    title: a.title,
    description: a.description
  }));
  return (
    <SeoHubPage
      title={`YouTube guides & how-tos | YouTube Booster`}
      intro="How-to guides with HowTo and FAQ schema where applicable; expand this folder to scale long-tail traffic."
      basePath="/guides"
      items={items}
    />
  );
}
