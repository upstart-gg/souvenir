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
          text: 'Core Concepts',
          items: [
            { text: 'ETL Pipeline', link: '/guide/etl-pipeline' },
            { text: 'Knowledge Graphs', link: '/guide/knowledge-graphs' },
            { text: 'Vector Search', link: '/guide/vector-search' },
            { text: 'Retrieval Strategies', link: '/guide/retrieval-strategies' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Chunking Configuration', link: '/guide/chunking' },
            { text: 'Custom Embeddings', link: '/guide/custom-embeddings' },
            { text: 'Prompt Templates', link: '/guide/prompt-templates' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Core API',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Souvenir', link: '/api/souvenir' },
            { text: 'Memory Repository', link: '/api/repository' },
            { text: 'Graph Operations', link: '/api/graph' },
          ],
        },
        {
          text: 'Tools',
          items: [
            { text: 'Vercel AI SDK Tools', link: '/api/tools' },
          ],
        },
        {
          text: 'Utilities',
          items: [
            { text: 'Chunking', link: '/api/chunking' },
            { text: 'Formatting', link: '/api/formatting' },
          ],
        },
        {
          text: 'Types',
          items: [
            { text: 'Type Reference', link: '/api/types' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Basic Usage', link: '/examples/basic' },
            { text: 'With Vercel AI SDK', link: '/examples/vercel-ai-sdk' },
            { text: 'Retrieval Strategies', link: '/examples/retrieval-strategies' },
            { text: 'Custom Chunking', link: '/examples/custom-chunking' },
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
            { text: 'Chunking Options', link: '/configuration/chunking' },
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
        link: 'https://www.npmjs.com/package/@upstart-gg/souvenir',
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
