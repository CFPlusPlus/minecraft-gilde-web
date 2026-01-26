type JsonLd = Record<string, any>;

const stripSiteName = (title: string): string => {
  // Common title patterns in this project:
  // - "Minecraft Gilde – ..."
  // - "Minecraft Gilde - ..."
  // - "... – Minecraft Gilde"
  const t = String(title || '').trim();
  if (!t) return '';
  return t
    .replace(/^Minecraft Gilde\s*[–-]\s*/i, '')
    .replace(/\s*[–-]\s*Minecraft Gilde$/i, '')
    .trim();
};

export const breadcrumbLabelForPath = (pathname: string, fallbackTitle?: string): string => {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const map: Record<string, string> = {
    '/': 'Home',
    '/befehle/': 'Befehle',
    '/datenschutz/': 'Datenschutz',
    '/faq/': 'FAQ',
    '/geschichte/': 'Geschichte',
    '/impressum/': 'Impressum',
    '/partner/': 'Partner',
    '/regeln/': 'Regeln',
    '/serverinfos/': 'Serverinfos',
    '/statistiken/': 'Statistiken',
    '/team/': 'Team',
    '/tutorial/': 'Tutorial',
    '/voten/': 'Voten',
    '/404/': '404',
  };

  if (map[path]) return map[path];
  const fromTitle = stripSiteName(fallbackTitle ?? '');
  if (fromTitle) return fromTitle;
  // last fallback: derive from path
  const seg = path.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean).pop();
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'Home';
};

export const buildBreadcrumbList = (args: {
  site: URL;
  pathname: string;
  pageTitle?: string;
}): JsonLd | null => {
  const { site, pathname, pageTitle } = args;
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  if (path === '/' || path === '/404/') return null;

  const label = breadcrumbLabelForPath(path, pageTitle);
  const homeUrl = new URL('/', site).toString();
  const pageUrl = new URL(path, site).toString();

  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: homeUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: label,
        item: pageUrl,
      },
    ],
  };
};

export const buildBaseGraph = (args: {
  site: URL;
  canonicalUrl: string;
  pathname: string;
  title: string;
  description: string;
  ogImage?: string;
}): JsonLd => {
  const { site, canonicalUrl, pathname, title, description, ogImage } = args;
  const siteUrl = site.toString().replace(/\/$/, '');

  const websiteId = `${siteUrl}/#website`;
  const orgId = `${siteUrl}/#org`;

  const breadcrumb = buildBreadcrumbList({ site, pathname, pageTitle: title });

  const webPageId = `${canonicalUrl}#webpage`;

  const graph: JsonLd[] = [
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: `${siteUrl}/`,
      name: 'Minecraft Gilde',
      alternateName: 'Minecraft Gilde – Vanilla SMP (DE)',
      description:
        'Deutscher Minecraft Vanilla SMP Server (Folia) mit Survival & Freebuild – ohne Resets, ohne Pay2Win, Community-first.',
      inLanguage: 'de',
      isAccessibleForFree: true,
      publisher: { '@id': orgId },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/?s={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': orgId,
      name: 'Minecraft Gilde',
      url: `${siteUrl}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/images/logo.webp`,
        width: 512,
        height: 512,
      },
      sameAs: [
        'https://discord.minecraft-gilde.de',
        'https://map.minecraft-gilde.de',
        'https://minecraft-server.eu/server/index/2321D/Minecraft-Gildede-Vanilla-Survival-und-Freebuild-121x',
        'https://www.minecraft-serverlist.net/server/59253',
        'https://serverliste.net/server/5142',
      ],
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'Community / Support',
          url: 'https://discord.minecraft-gilde.de',
          availableLanguage: ['de'],
        },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': webPageId,
      url: canonicalUrl,
      name: title,
      description,
      inLanguage: 'de',
      isPartOf: { '@id': websiteId },
      about: { '@id': orgId },
      publisher: { '@id': orgId },
      ...(ogImage
        ? {
            primaryImageOfPage: {
              '@type': 'ImageObject',
              url: ogImage,
            },
          }
        : null),
    },
  ];

  if (breadcrumb) {
    graph.push(breadcrumb);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
};

export const buildFaqPage = (args: {
  canonicalUrl: string;
  site: URL;
  items: Array<{ q: string; a: string }>;
}): JsonLd => {
  const { canonicalUrl, site, items } = args;

  const absolutizeInternal = (text: string) => {
    const src = String(text ?? '');

    const toAbs = (href: string) => {
      const h = String(href ?? '').trim();
      return h.startsWith('/') ? new URL(h, site).toString() : h;
    };

    // Convert Markdown links to readable plain text (and absolutize relative URLs).
    const withMdLinks = src.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
      const url = toAbs(href);
      return `${String(label).trim()}: ${url}`;
    });

    return (
      withMdLinks
        // Inline code -> plain
        .replace(/`([^`]+)`/g, '$1')
        // Keep answers compact for JSON-LD
        .replace(/\n\n/g, '\n')
        .replace(/\s+\n/g, '\n')
        // Absolutize remaining bare internal paths like "/tutorial"
        .replace(/(\s|^)(\/[a-z0-9\-\/]+\/?)(?=\s|$)/gi, (_m, p1, p2) => {
          const abs = new URL(p2, site).toString();
          return `${p1}${abs}`;
        })
    );
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${canonicalUrl}#faq`,
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: String(it.q).trim(),
      acceptedAnswer: {
        '@type': 'Answer',
        text: absolutizeInternal(String(it.a).trim()),
      },
    })),
  };
};

export const buildHowTo = (args: {
  canonicalUrl: string;
  name: string;
  description: string;
  steps: Array<{ name: string; text: string; url?: string }>;
}): JsonLd => {
  const { canonicalUrl, name, description, steps } = args;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${canonicalUrl}#howto`,
    name,
    description,
    step: steps.map((s, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: s.name,
      text: s.text,
      ...(s.url ? { url: s.url } : null),
    })),
  };
};

export const buildArticle = (args: {
  site: URL;
  canonicalUrl: string;
  type?: 'Article' | 'TechArticle';
  headline: string;
  description: string;
  image?: string;
  authorName?: string;
  authorUrl?: string;
  datePublished?: string;
  dateModified?: string;
  articleSection?: string;
}): JsonLd => {
  const {
    site,
    canonicalUrl,
    type = 'Article',
    headline,
    description,
    image,
    authorName = 'Christian Falkner',
    authorUrl,
    datePublished,
    dateModified,
    articleSection,
  } = args;

  const siteUrl = site.toString().replace(/\/$/, '');
  const orgId = `${siteUrl}/#org`;

  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${canonicalUrl}#article`,
    headline,
    description,
    inLanguage: 'de',
    ...(articleSection ? { articleSection } : null),
    ...(image ? { image } : null),
    author: {
      '@type': 'Person',
      name: authorName,
      ...(authorUrl ? { url: authorUrl } : null),
    },
    publisher: { '@id': orgId },
    ...(datePublished ? { datePublished } : null),
    ...(dateModified ? { dateModified } : null),
    mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` },
  };
};

export const buildGameServer = (args: {
  site: URL;
  canonicalUrl: string;
  ip: string;
  port?: number;
  version: string;
  name?: string;
  maxPlayers?: number;
}): JsonLd => {
  const {
    site,
    canonicalUrl,
    ip,
    port = 25565,
    version,
    name = 'Minecraft Gilde – Vanilla SMP (DE)',
    maxPlayers,
  } = args;
  const siteUrl = site.toString().replace(/\/$/, '');
  const orgId = `${siteUrl}/#org`;
  const gameId = `${siteUrl}/#game`;
  const serverId = `${siteUrl}/#gameserver`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoGame',
        '@id': gameId,
        name: 'Minecraft',
        genre: ['Sandbox', 'Multiplayer', 'Survival'],
        gamePlatform: ['PC', 'macOS', 'Linux'],
        inLanguage: 'de',
        image: `${siteUrl}/images/logo.webp`,
        keywords:
          'Minecraft, Vanilla SMP, Survival, Freebuild, Folia, deutsch, Community, ohne Reset, ohne Pay2Win',
        gameServer: { '@id': serverId },
      },
      {
        '@type': 'GameServer',
        '@id': serverId,
        name,
        url: `${siteUrl}/`,
        game: { '@id': gameId },
        availableLanguage: ['de'],
        serverLocation: {
          '@type': 'Place',
          address: { '@type': 'PostalAddress', addressCountry: 'DE' },
        },
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'IP/Host', value: ip },
          { '@type': 'PropertyValue', name: 'Port', value: String(port) },
          { '@type': 'PropertyValue', name: 'Version', value: version },
          { '@type': 'PropertyValue', name: 'Modus', value: 'Vanilla SMP / Survival / Freebuild' },
          { '@type': 'PropertyValue', name: 'Whitelist', value: 'nein' },
          ...(typeof maxPlayers === 'number'
            ? [{ '@type': 'PropertyValue', name: 'Max. Spieler', value: String(maxPlayers) }]
            : []),
        ],
        provider: { '@id': orgId },
        mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` },
      },
    ],
  };
};
