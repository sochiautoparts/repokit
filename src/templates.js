'use strict';

const path = require('path');
const fs = require('fs-extra');

const TEMPLATES = [
  // ═══════════════════════════════════════════
  // FREE TEMPLATES (5)
  // ═══════════════════════════════════════════
  {
    id: 'nextjs',
    name: 'Next.js App Router',
    description: 'Next.js 14+ with App Router, TypeScript, and Tailwind CSS',
    category: 'Fullstack',
    pro: false,
    features: ['App Router', 'TypeScript', 'Tailwind CSS', 'ESLint', 'Prettier']
  },
  {
    id: 'express',
    name: 'Express.js API',
    description: 'Express.js with TypeScript, middleware, and project structure',
    category: 'Backend',
    pro: false,
    features: ['TypeScript', 'Middleware Stack', 'Error Handling', 'ESLint', 'Prettier']
  },
  {
    id: 'react',
    name: 'React + Vite',
    description: 'React 18 with Vite, TypeScript, and Tailwind CSS',
    category: 'Frontend',
    pro: false,
    features: ['React 18', 'Vite', 'TypeScript', 'Tailwind CSS', 'ESLint']
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    description: 'FastAPI with Python, Pydantic, and auto-generated docs',
    category: 'Backend',
    pro: false,
    features: ['FastAPI', 'Pydantic', 'Auto Docs', 'UVicorn', 'pytest']
  },
  {
    id: 'vue',
    name: 'Vue 3 + Vite',
    description: 'Vue 3 with Composition API, Vite, and TypeScript',
    category: 'Frontend',
    pro: false,
    features: ['Vue 3', 'Composition API', 'Vite', 'TypeScript', 'Pinia']
  },

  // ═══════════════════════════════════════════
  // PRO TEMPLATES (25+)
  // ═══════════════════════════════════════════
  {
    id: 'nextjs-fullstack',
    name: 'Next.js Fullstack',
    description: 'Next.js + Prisma + NextAuth.js + PostgreSQL starter',
    category: 'Fullstack',
    pro: true,
    features: ['App Router', 'Prisma', 'NextAuth.js', 'PostgreSQL', 'TypeScript', 'Tailwind CSS']
  },
  {
    id: 'nextjs-ecommerce',
    name: 'Next.js E-Commerce',
    description: 'Next.js + Stripe + Prisma product store with payments',
    category: 'Fullstack',
    pro: true,
    features: ['App Router', 'Stripe Payments', 'Prisma', 'Product Catalog', 'Cart', 'Auth']
  },
  {
    id: 'nextjs-saas',
    name: 'Next.js SaaS Starter',
    description: 'Full SaaS boilerplate with auth, billing, and multi-tenancy',
    category: 'Fullstack',
    pro: true,
    features: ['Multi-tenancy', 'Stripe Billing', 'NextAuth.js', 'Prisma', 'Dashboard', 'API Keys']
  },
  {
    id: 'react-native',
    name: 'React Native + Expo',
    description: 'React Native with Expo, TypeScript, and navigation',
    category: 'Mobile',
    pro: true,
    features: ['Expo', 'TypeScript', 'React Navigation', 'NativeWind', 'State Management']
  },
  {
    id: 'flutter',
    name: 'Flutter + Dart',
    description: 'Flutter app with clean architecture and state management',
    category: 'Mobile',
    pro: true,
    features: ['Clean Architecture', 'Riverpod', 'Go Router', 'Dio', 'Flutter Hooks']
  },
  {
    id: 'vue-fullstack',
    name: 'Vue 3 + Nuxt Fullstack',
    description: 'Nuxt 3 with Prisma ORM and server-side rendering',
    category: 'Fullstack',
    pro: true,
    features: ['Nuxt 3', 'Prisma', 'Server Routes', 'Pinia', 'TypeScript', 'Tailwind CSS']
  },
  {
    id: 'svelte',
    name: 'SvelteKit + TypeScript',
    description: 'SvelteKit with TypeScript and Tailwind CSS',
    category: 'Frontend',
    pro: true,
    features: ['SvelteKit', 'TypeScript', 'Tailwind CSS', 'ESLint', 'Prettier']
  },
  {
    id: 'angular',
    name: 'Angular + TypeScript',
    description: 'Angular 17+ with standalone components and signals',
    category: 'Frontend',
    pro: true,
    features: ['Angular 17+', 'Standalone Components', 'Signals', 'RxJS', 'Tailwind CSS']
  },
  {
    id: 'django',
    name: 'Django + DRF',
    description: 'Django with Django REST Framework and PostgreSQL',
    category: 'Backend',
    pro: true,
    features: ['Django 5', 'DRF', 'PostgreSQL', 'Celery', 'Docker', 'pytest']
  },
  {
    id: 'flask',
    name: 'Flask + SQLAlchemy',
    description: 'Flask with SQLAlchemy, migrations, and blueprints',
    category: 'Backend',
    pro: true,
    features: ['Flask', 'SQLAlchemy', 'Alembic', 'Blueprints', 'Docker', 'pytest']
  },
  {
    id: 'spring-boot',
    name: 'Spring Boot + Java',
    description: 'Spring Boot with Spring Security and JPA',
    category: 'Backend',
    pro: true,
    features: ['Spring Boot 3', 'Spring Security', 'JPA/Hibernate', 'Gradle', 'Docker']
  },
  {
    id: 'go-api',
    name: 'Go + Gin + GORM',
    description: 'Go REST API with Gin framework and GORM ORM',
    category: 'Backend',
    pro: true,
    features: ['Go 1.22', 'Gin', 'GORM', 'JWT Auth', 'Docker', 'Swagger']
  },
  {
    id: 'rust-api',
    name: 'Rust + Actix-Web + Diesel',
    description: 'Rust REST API with Actix-Web framework and Diesel ORM',
    category: 'Backend',
    pro: true,
    features: ['Rust', 'Actix-Web', 'Diesel', 'JWT Auth', 'Docker', 'Tracing']
  },
  {
    id: 'laravel',
    name: 'Laravel + PHP',
    description: 'Laravel with Eloquent ORM and Blade templates',
    category: 'Backend',
    pro: true,
    features: ['Laravel 11', 'Eloquent', 'Blade', 'Sanctum', 'Docker', 'Pest']
  },
  {
    id: 'rails',
    name: 'Ruby on Rails',
    description: 'Rails 7 with Hotwire and PostgreSQL',
    category: 'Backend',
    pro: true,
    features: ['Rails 7', 'Hotwire', 'PostgreSQL', 'Sidekiq', 'Docker', 'RSpect']
  },
  {
    id: 'graphql',
    name: 'Apollo Server + Prisma',
    description: 'GraphQL API with Apollo Server and Prisma ORM',
    category: 'Backend',
    pro: true,
    features: ['Apollo Server', 'Prisma', 'GraphQL Codegen', 'TypeScript', 'Docker']
  },
  {
    id: 'microservices',
    name: 'Node.js Microservices',
    description: 'Microservices architecture with Docker Compose',
    category: 'Fullstack',
    pro: true,
    features: ['Docker Compose', 'API Gateway', 'RabbitMQ', 'Redis', 'TypeScript', 'Monitoring']
  },
  {
    id: 'cli-tool',
    name: 'Node.js CLI Tool',
    description: 'Node.js CLI with Commander.js and TypeScript',
    category: 'CLI/Tool',
    pro: true,
    features: ['Commander.js', 'TypeScript', 'Inquirer', 'Chalk', 'Ora']
  },
  {
    id: 'python-cli',
    name: 'Python CLI with Click',
    description: 'Python CLI tool with Click and Rich',
    category: 'CLI/Tool',
    pro: true,
    features: ['Click', 'Rich', 'Type Hints', 'pytest', 'PyInstaller']
  },
  {
    id: 'desktop-electron',
    name: 'Electron + React',
    description: 'Desktop app with Electron and React',
    category: 'Frontend',
    pro: true,
    features: ['Electron', 'React', 'TypeScript', 'Electron Builder', 'Auto Update']
  },
  {
    id: 'desktop-tauri',
    name: 'Tauri + React',
    description: 'Desktop app with Tauri and React',
    category: 'Frontend',
    pro: true,
    features: ['Tauri', 'React', 'Rust Backend', 'TypeScript', 'Auto Update']
  },
  {
    id: 'chrome-extension',
    name: 'Chrome Extension + React',
    description: 'Chrome extension with React and Webpack',
    category: 'CLI/Tool',
    pro: true,
    features: ['React', 'Webpack', 'Chrome APIs', 'TypeScript', 'Manifest V3']
  },
  {
    id: 'discord-bot',
    name: 'Discord.js Bot',
    description: 'Discord bot with Discord.js and TypeScript',
    category: 'CLI/Tool',
    pro: true,
    features: ['Discord.js', 'TypeScript', 'Slash Commands', 'MongoDB', 'Docker']
  },
  {
    id: 'telegram-bot',
    name: 'Telegram Bot (aiogram)',
    description: 'Telegram bot with aiogram and Python',
    category: 'CLI/Tool',
    pro: true,
    features: ['aiogram 3', 'Python', 'FSM', 'PostgreSQL', 'Docker']
  },
  {
    id: 'wordpress',
    name: 'WordPress Plugin Starter',
    description: 'WordPress plugin with modern PHP and React admin',
    category: 'Backend',
    pro: true,
    features: ['WordPress', 'PHP 8+', 'React Admin', 'REST API', 'Webpack']
  },
  {
    id: 'astro',
    name: 'Astro + React',
    description: 'Astro static site with React islands and Tailwind CSS',
    category: 'Frontend',
    pro: true,
    features: ['Astro', 'React Islands', 'TypeScript', 'Tailwind CSS', 'MDX']
  },
  {
    id: 'remix',
    name: 'Remix + TypeScript',
    description: 'Remix full-stack framework with TypeScript and Prisma',
    category: 'Fullstack',
    pro: true,
    features: ['Remix', 'TypeScript', 'Prisma', 'Tailwind CSS', 'Fly.io']
  },
  {
    id: 'nestjs',
    name: 'NestJS + TypeScript',
    description: 'NestJS with TypeORM and Swagger',
    category: 'Backend',
    pro: true,
    features: ['NestJS', 'TypeORM', 'Swagger', 'JWT Auth', 'Docker', 'TypeScript']
  },
  {
    id: 'svelte-fullstack',
    name: 'SvelteKit Fullstack',
    description: 'SvelteKit with Prisma and authentication',
    category: 'Fullstack',
    pro: true,
    features: ['SvelteKit', 'Prisma', 'Lucia Auth', 'TypeScript', 'Tailwind CSS']
  },
  {
    id: 'kotlin-api',
    name: 'Kotlin + Ktor',
    description: 'Kotlin REST API with Ktor and Exposed ORM',
    category: 'Backend',
    pro: true,
    features: ['Kotlin', 'Ktor', 'Exposed', 'JWT Auth', 'Gradle', 'Docker']
  }
];

/**
 * Get templates filtered by category
 */
function getByCategory(category) {
  return TEMPLATES.filter(t => t.category === category);
}

/**
 * Get template by ID
 */
function getById(id) {
  return TEMPLATES.find(t => t.id === id) || null;
}

/**
 * Get all free templates
 */
function getFreeTemplates() {
  return TEMPLATES.filter(t => !t.pro);
}

/**
 * Get all Pro templates
 */
function getProTemplates() {
  return TEMPLATES.filter(t => t.pro);
}

/**
 * Get categories list
 */
function getCategories() {
  const cats = [...new Set(TEMPLATES.map(t => t.category))];
  return cats.sort();
}

/**
 * Get templates directory path
 */
function getTemplatesDir() {
  return path.join(__dirname, '..', 'templates');
}

/**
 * Get template directory path
 */
function getTemplateDir(templateId) {
  return path.join(getTemplatesDir(), templateId);
}

/**
 * Check if template files exist
 */
function templateExists(templateId) {
  const dir = getTemplateDir(templateId);
  return fs.pathExistsSync(dir);
}

module.exports = {
  TEMPLATES,
  getByCategory,
  getById,
  getFreeTemplates,
  getProTemplates,
  getCategories,
  getTemplatesDir,
  getTemplateDir,
  templateExists
};
