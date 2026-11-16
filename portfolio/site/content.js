// Everything a visitor reads lives here, so editing copy never means touching the 3D or form code.
// The serverless functions import this too: the cover-letter agent only writes from these facts.
// DRAFT COPY: written from public GitHub repos. LeVente, replace anything that isn't right.

export const profile = {
  name: 'LeVente Berry',
  role: 'AI systems builder',
  location: '', // e.g. 'Columbus, OH'; shown under your name when set
  headline: 'I build AI agents, automations, and the web apps they live in.',
  intro:
    'I design and ship agent systems end to end: the model plumbing, the workflows, and the product people actually click on. ' +
    'This site runs on them. The tools below hand real work to my own agent harness, StarNet.',
  github: 'https://github.com/leventeberry',
  linkedin: '', // add your LinkedIn URL to show the link
  skills: [
    'AI agents & tool use', 'Workflow automation', 'TypeScript / React / Next.js', 'Node.js & Go APIs',
    'Supabase & Postgres', 'Three.js & interactive 3D', 'Docker, Traefik & VPS ops', 'Godot game dev',
  ],
};

// Each service is a "Hire me for X" button. `id` is sent to StarNet as jobType, so a workflow can branch on it.
export const services = [
  {
    id: 'website',
    title: 'Websites & web apps',
    blurb: 'Fast, polished sites and full-stack apps, from landing page to dashboard.',
    color: '#ff3d6e',
    questions: [
      { name: 'project', label: 'What are we building?', placeholder: 'A booking site for my studio, with payments', type: 'textarea' },
      { name: 'current', label: 'Current site (if any)', placeholder: 'https://', type: 'url' },
      { name: 'timeline', label: 'Timeline', type: 'select', options: ['ASAP', '1–2 months', '3+ months', 'Flexible'] },
    ],
  },
  {
    id: 'automation',
    title: 'AI agents & automation',
    blurb: 'Agents that take repetitive work off your plate: intake, follow-ups, reports, research.',
    color: '#4de1ff',
    questions: [
      { name: 'process', label: 'What process eats your time?', placeholder: 'Every new lead gets a manual quote and three follow-up emails', type: 'textarea' },
      { name: 'tools', label: 'Tools you use today', placeholder: 'Gmail, HubSpot, Google Sheets', type: 'text' },
      { name: 'volume', label: 'How often does it happen?', type: 'select', options: ['A few times a week', 'Daily', 'Dozens a day', 'Not sure'] },
    ],
  },
  {
    id: 'audit',
    title: 'Site & AI-readiness audit',
    blurb: 'A clear report on speed, SEO, security headers and where AI could save you time.',
    color: '#ffc14d',
    questions: [
      { name: 'url', label: 'Site to audit', placeholder: 'https://example.com', type: 'url' },
      { name: 'goal', label: 'What should the site do better?', placeholder: 'More booked calls from mobile visitors', type: 'textarea' },
    ],
  },
  {
    id: 'integration',
    title: 'Dashboards & integrations',
    blurb: 'CRMs, internal tools and APIs that make your data talk to each other.',
    color: '#a98bff',
    questions: [
      { name: 'systems', label: 'Which systems need to connect?', placeholder: 'Stripe → Supabase → a sales dashboard', type: 'textarea' },
      { name: 'users', label: 'Who will use it?', placeholder: 'Five people on the sales team', type: 'text' },
    ],
  },
];

export const projects = [
  {
    name: 'StarNet (hosted)',
    tag: 'Agent harness',
    summary: 'Turned a desktop-first multi-agent harness into a hosted browser app behind 2FA, with phone controls and public webhooks. It powers the tools on this page.',
    stack: ['Node.js', 'Docker', 'Authelia', 'CI/CD'],
    url: 'https://github.com/leventeberry/starnet-berries',
  },
  {
    name: 'Chexi Fidelity',
    tag: 'AI infrastructure',
    summary: 'An independent monitor that checks whether inference providers serve the model quality they claim.',
    stack: ['TypeScript', 'Next.js', 'Vercel'],
    url: 'https://chexi-fidelity.vercel.app',
  },
  {
    name: 'Bean Baron',
    tag: 'Game + backend',
    summary: 'A trading game built in Godot with its own API for sync, a live market and leaderboards.',
    stack: ['Godot', 'TypeScript', 'Supabase'],
    url: '',
  },
  {
    name: 'Hermes Stack',
    tag: 'Self-hosted ops',
    summary: 'A local Traefik, Firecrawl and Hermes Docker stack with an operator console for running agents on my own hardware.',
    stack: ['Docker', 'Traefik', 'TypeScript'],
    url: '',
  },
  {
    name: 'Borrower CRM',
    tag: 'Client work',
    summary: 'A CRM and dashboard for tracking borrowers through a lending pipeline.',
    stack: ['React', 'TypeScript', 'Vercel'],
    url: 'https://v0-crm-dashboard-for-borrowers.vercel.app',
  },
  {
    name: 'Onyx',
    tag: 'Product',
    summary: 'A family coordination app for shared schedules, tasks and plans.',
    stack: ['TypeScript', 'React'],
    url: '',
  },
];
