import { defineConfig } from 'vitepress';
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs';

export default defineConfig({
  title: 'Souvenir',
  description:
    'Memory management library for AI agents built with the Vercel AI SDK',
  lang: 'en-US',

  ignoreDeadLinks: [],

  head: [
    ['meta', { name: 'theme-color', content: '#8B5CF6' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    ],
    [
      'link',
      {
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
        rel: 'stylesheet',
      },
    ],
  ],

  lastUpdated: true,

  themeConfig: {
    logo: '/souvenir-logo.svg',
    siteTitle: 'Souvenir',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
      { text: 'Examples', link: '/examples/', activeMatch: '/examples/' },
      { text: 'Configuration', link: '/configuration/', activeMatch: '/configuration/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'How It Works',
          items: [
            { text: 'Knowledge Graphs', link: '/guide/knowledge-graphs' },
            { text: 'Retrieval Strategies', link: '/guide/retrieval-strategies' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Tools (Main API)',
          items: [
            { text: 'Memory Tools', link: '/api/tools' },
          ],
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Souvenir Options', link: '/api/souvenir' },
            { text: 'Type Reference', link: '/api/types' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'With Vercel AI SDK', link: '/examples/vercel-ai-sdk' },
            { text: 'Streaming Responses', link: '/examples/streaming' },
            { text: 'Multi-User Chat', link: '/examples/multi-user' },
          ],
        },
      ],
      '/configuration/': [
        {
          text: 'Configuration',
          items: [
            { text: 'Overview', link: '/configuration/' },
            { text: 'Database Setup', link: '/configuration/database' },
            { text: 'Embedding Providers', link: '/configuration/embeddings' },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/upstart-gg/souvenir',
      },
      {
        icon: 'npm',
        link: 'https://www.npmjs.com/package/@upstart.gg/souvenir',
      },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Upstart',
    },

    editLink: {
      pattern: 'https://github.com/upstart-gg/souvenir/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },
  },

  markdown: {
    lineNumbers: false,
    math: false,
    config(md) {
      md.use(tabsMarkdownPlugin);
    },
  },
});
