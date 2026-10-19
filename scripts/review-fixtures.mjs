import { AUTHOR, londonDate } from './lib.mjs';

export const REVIEW_ARTICLE_SLUG = 'lorem-ipsum-dolor-sit-amet';
export const REVIEW_PARAGRAPH = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const article = [
  REVIEW_PARAGRAPH,
  REVIEW_PARAGRAPH,
  '## Lorem ipsum dolor',
  REVIEW_PARAGRAPH,
  '> Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  REVIEW_PARAGRAPH,
  '## Consectetur adipiscing elit',
  REVIEW_PARAGRAPH,
  '1. **Lorem ipsum.** Dolor sit amet, consectetur adipiscing elit.\n2. **Sed do eiusmod.** Tempor incididunt ut labore et dolore.\n3. **Ut enim.** Ad minim veniam, quis nostrud exercitation.',
  REVIEW_PARAGRAPH,
  '![Lorem ipsum dolor sit amet](delivery-loop.svg)',
  '## Sed do eiusmod tempor',
  REVIEW_PARAGRAPH,
  '| Lorem ipsum | Dolor sit amet |\n| --- | --- |\n| Consectetur | Adipiscing elit |\n| Sed do eiusmod | Tempor incididunt |',
  REVIEW_PARAGRAPH,
  '```text\nLorem ipsum dolor sit amet.\nConsectetur adipiscing elit.\n```',
  REVIEW_PARAGRAPH,
  '[Lorem ipsum](/about/) · [Dolor sit amet](#lorem-ipsum-dolor).',
].join('\n\n');

export function reviewFixtures() {
  const titles = [
    [REVIEW_ARTICLE_SLUG, 'Lorem Ipsum Dolor Sit Amet, Consectetur Adipiscing Elit'],
    ['consectetur-adipiscing-elit', 'Consectetur Adipiscing Elit'],
    ['sed-do-eiusmod-tempor', 'Sed Do Eiusmod Tempor Incididunt'],
    ['ut-enim-ad-minim-veniam', 'Ut Enim Ad Minim Veniam'],
    ['duis-aute-irure-dolor', 'Duis Aute Irure Dolor'],
  ];
  return titles.map(([slug, title], index) => {
    const timestamp = londonDate(new Date(`2026-09-${String(18 - index).padStart(2, '0')}T09:00:00Z`));
    const excerpt = `${REVIEW_PARAGRAPH.split('. ').slice(0, index === 0 ? 3 : 2).join('. ')}.`;
    return {
      meta: {
        title, slug, date: timestamp, publishDate: timestamp, draft: false,
        author: AUTHOR, description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        excerpt, topics: index === 0 ? ['Lorem', 'Ipsum'] : [], lastmod: timestamp,
      },
      body: index === 0 ? article : `${excerpt}\n\n## Lorem ipsum dolor\n\n${REVIEW_PARAGRAPH}\n\n[Lorem ipsum](/posts/${REVIEW_ARTICLE_SLUG}/).\n`,
    };
  });
}

export const REVIEW_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 180" role="img"><rect width="650" height="180" rx="8" fill="#F1EFE9"/><g fill="none" stroke="#2B3F5C" stroke-width="2"><rect x="24" y="50" width="165" height="78" rx="8"/><rect x="242" y="50" width="165" height="78" rx="8"/><rect x="460" y="50" width="165" height="78" rx="8"/><path d="M190 89h50m-10-7 10 7-10 7m178-7h50m-10-7 10 7-10 7"/></g><g fill="#1B1B19" font-family="Segoe UI,Arial,sans-serif" font-size="20" text-anchor="middle"><text x="106" y="97">Lorem</text><text x="324" y="97">Ipsum</text><text x="542" y="97">Dolor</text></g></svg>';
