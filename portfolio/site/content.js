// Everything a visitor reads lives here, so editing copy never means touching the layout or form code.
// The serverless functions import this too: the fit-letter agent only writes from these facts.
//
// DRAFT COPY. Facts come from LeVente's repos (Cardinal Studio, Bean Baron, Chexi, StarNet).
// Lines marked "DRAFT:" are my wording of things I couldn't verify. LeVente, rewrite them in your own voice.

export const profile = {
  name: 'LeVente Berry',
  role: 'Builder', // DRAFT
  location: 'Columbus, Ohio',
  // The big hero line. The word in headlineAccent is set in italic pink.
  headline: 'I build things people actually use.', // DRAFT
  headlineAccent: 'actually',
  intro: 'Games, AI systems and software, mostly with AI as my pair. I live in Columbus, Ohio, and I like shipping more than planning.', // DRAFT
  now: 'Building Chexi right now', // the green "status" line under the intro
  photo: '', // e.g. '/img/levente.jpg' (put the file in site/img/). Empty shows your initials instead.
  github: 'https://github.com/leventeberry',
  linkedin: '', // add your LinkedIn URL to show the link

  // DRAFT: inferred from your oldest public repos (bash scripts, an Arch installer, small Go servers).
  start: [
    'I started the way a lot of builders do: tinkering. Shell scripts to automate my own machine, an Arch Linux installer, small Go servers just to see how HTTP really works.',
    'Then I started building things for other people: web apps, CRMs, dashboards. Once AI got good enough to be a real collaborator, it changed how I work. Now it is part of almost everything I ship.',
  ],

  // What I love to build. DRAFT: edit freely.
  loves: [
    { title: 'Products people actually use', text: 'Bean Baron picked up real players I never met. That feeling is the whole point.' },
    { title: 'Games', text: 'Economies, progression and the small loops that make you come back.' },
    { title: 'Agent systems', text: 'AI that does real work behind the scenes, with a person checking the parts that matter.' },
    { title: 'Tools that run themselves', text: 'Self-hosted stacks, CI that deploys on merge, and automation that keeps a business running.' },
  ],

  skills: [
    'TypeScript / React', 'TanStack Start & Next.js', 'Node.js & Go', 'Supabase & Postgres',
    'AI agents & tool use', 'Three.js', 'Docker & VPS ops', 'Godot',
  ],
};

// The featured projects, shown as big rows with a screenshot (or a drawn illustration).
// `ai` is the "how AI was used" line, which is the point of the site.
export const projects = [
  {
    id: 'beanbaron',
    aiShort: 'Prototyped with an AI app builder, then grown with coding agents.',
    name: 'Bean Baron',
    tag: 'Game',
    color: '#ffc14d',
    summary: 'A mobile-first idle coffee-empire game: harvest beans, time your sales on a shared market, build businesses and climb the net-worth leaderboard. It found real players on its own.',
    ai: 'I prototyped it with an AI app builder, then took it over by hand and with coding agents: a server-authoritative game engine, a live market with price events, and anti-cheat validation on every action.',
    stack: ['React', 'TanStack Start', 'Supabase', 'Postgres'],
    url: 'https://beanbaron.app',
    linkLabel: 'beanbaron.app',
    image: '',
    year: 'Game · live', // DRAFT: add the year it launched
  },
  {
    id: 'cardinal',
    aiShort: 'An AI assistant that answers and qualifies new leads for clients.',
    name: 'Cardinal Studio',
    tag: 'My studio',
    color: '#ff3d55',
    summary: 'My web and automation studio in Columbus. It builds websites, custom software and AI systems for small businesses.',
    ai: 'Its flagship is an AI Lead Conversion System: an assistant that answers new leads, qualifies them and hands them to a person. The studio\'s own site, client portal and admin are built with AI agents under a strict review process: every change gets an automated security and correctness review before I approve it.',
    stack: ['Next.js', 'Bun', 'Postgres', 'AI agents'],
    url: 'https://cardinalstudio.ai',
    linkLabel: 'cardinalstudio.ai',
    image: '', // a real screenshot, e.g. '/img/cardinal.png'. Empty shows a drawn illustration.
    year: 'Studio · ongoing',
  },
  {
    id: 'chexi',
    aiShort: 'AI is the product: systems that turn noisy data into clear signals.',
    name: 'Chexi',
    tag: 'AI product studio',
    color: '#4de1ff',
    summary: 'My software company. Chexi builds intelligence systems that help people monitor complex environments, spot the signals that matter and make better decisions.',
    ai: 'AI is the product here, not just the tool. Its products, Solbase and Civora, turn messy, fast-moving data into clear signals.', // DRAFT: add a line on what each one does
    stack: ['TypeScript', 'LLMs', 'Data pipelines'],
    url: 'https://chexi.ai', // not live yet: going back up on the VPS
    linkLabel: 'chexi.ai',
    image: '',
    year: 'Company · now',
  },
];

// Smaller things, shown as a compact list under the featured projects.
export const alsoBuilt = [
  { name: 'StarNet (hosted)', text: 'A multi-agent harness I run on my own server. It powers the forms on this page.', url: 'https://github.com/leventeberry/starnet-berries' },
  { name: 'Hermes Stack', text: 'A self-hosted Traefik, Firecrawl and agent stack with an operator console.', url: '' },
  { name: 'This site', text: 'Plain JavaScript and a few serverless functions. No framework, no build step.', url: 'https://github.com/leventeberry/starnet-berries/tree/main/portfolio' },
];
