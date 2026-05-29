# 🚀 RepoKit

**One command → full project in 2 minutes**

[![npm version](https://img.shields.io/npm/v/repokit.svg?style=flat-square)](https://www.npmjs.com/package/repokit)
[![GitHub stars](https://img.shields.io/github/stars/sochiautoparts/repokit?style=flat-square)](https://github.com/sochiautoparts/repokit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Scaffold 30+ project templates with database, auth, Docker, and CI/CD — all from one command.

## Quick Start

```bash
npx repokit create
```

That's it! Answer a few questions and get a production-ready project.

## ✨ Features

- 🎯 **30+ Templates** — Next.js, FastAPI, Go, Rust, Flutter, and more
- 🗄️ **Database Ready** — PostgreSQL, MongoDB, MySQL, SQLite, Redis
- 🔐 **Auth Built-in** — JWT, OAuth2, Firebase Auth
- 🐳 **Docker Config** — Dockerfile + docker-compose generated
- 🔄 **CI/CD** — GitHub Actions or GitLab CI templates
- 📦 **First Commit** — Git initialized with initial commit
- 🏷️ **RepoKit Badge** — "Created with RepoKit" badge in README

## 📋 Templates

### 🆓 Free Templates (5)

| Template | Description | Stack |
|----------|-------------|-------|
| `nextjs` | Next.js App Router | TypeScript, Tailwind CSS |
| `express` | Express.js API | TypeScript, ESLint |
| `react` | React + Vite | TypeScript, Tailwind CSS |
| `fastapi` | FastAPI | Python, Pydantic, UVicorn |
| `vue` | Vue 3 + Vite | TypeScript, Pinia |

### ⭐ Pro Templates (25+)

| Template | Description | Stack |
|----------|-------------|-------|
| `nextjs-fullstack` | Next.js + Prisma + Auth | App Router, NextAuth.js |
| `nextjs-ecommerce` | Next.js + Stripe + Prisma | E-commerce, Payments |
| `nextjs-saas` | Next.js SaaS Starter | Multi-tenancy, Billing |
| `react-native` | React Native + Expo | Mobile, Navigation |
| `flutter` | Flutter + Dart | Clean Architecture |
| `vue-fullstack` | Vue 3 + Nuxt + Prisma | SSR, Fullstack |
| `svelte` | SvelteKit + TypeScript | Modern Frontend |
| `angular` | Angular 17+ | Signals, RxJS |
| `django` | Django + DRF | PostgreSQL, Celery |
| `flask` | Flask + SQLAlchemy | Blueprints, Alembic |
| `spring-boot` | Spring Boot + Java | JPA, Security |
| `go-api` | Go + Gin + GORM | REST API, Swagger |
| `rust-api` | Rust + Actix-Web | Diesel, Tracing |
| `laravel` | Laravel + PHP | Eloquent, Sanctum |
| `rails` | Ruby on Rails | Hotwire, PostgreSQL |
| `graphql` | Apollo Server + Prisma | GraphQL API |
| `microservices` | Node.js Microservices | Docker Compose |
| `cli-tool` | Node.js CLI | Commander, Inquirer |
| `python-cli` | Python CLI | Click, Rich |
| `desktop-electron` | Electron + React | Desktop App |
| `desktop-tauri` | Tauri + React | Rust Desktop |
| `chrome-extension` | Chrome Extension | React, Manifest V3 |
| `discord-bot` | Discord.js Bot | TypeScript, Slash Commands |
| `telegram-bot` | Telegram Bot (aiogram) | Python, FSM |
| `wordpress` | WordPress Plugin | PHP, React Admin |
| `astro` | Astro + React | Static Site, Islands |
| `remix` | Remix + TypeScript | Fullstack Framework |
| `nestjs` | NestJS + TypeORM | Enterprise Backend |
| `svelte-fullstack` | SvelteKit + Prisma | Fullstack Svelte |
| `kotlin-api` | Kotlin + Ktor | JVM Backend |

## 💰 Pricing

Unlock all Pro templates with a StarsPay license:

| Plan | Price | Duration |
|------|-------|----------|
| 🥉 **Monthly** | 149 ⭐ Stars | 1 month |
| 🥈 **Yearly** | 999 ⭐ Stars | 12 months |
| 🥇 **Lifetime** | 2999 ⭐ Stars | Forever |

**Get Pro:** [https://t.me/allstarspay_bot?start=buy_repokit_month](https://t.me/allstarspay_bot?start=buy_repokit_month)

## 🔑 License Activation

```bash
# Activate your Pro license
npx repokit activate SP-RPK-XXXX-XXXX

# Check license status
npx repokit status

# Deactivate license
npx repokit deactivate
```

You can also set the license key via environment variable:

```bash
export STARSPAY_LICENSE_KEY=SP-RPK-XXXX-XXXX
```

## 🎯 Usage

### Interactive Mode

```bash
npx repokit create
```

You'll be prompted for:
1. Project type (Frontend, Backend, Fullstack, Mobile, CLI/Tool)
2. Template selection
3. Project name
4. Database choice
5. ORM selection
6. Authentication method
7. Deploy target
8. CI/CD configuration

### CLI Arguments

```bash
npx repokit create --template nextjs --name my-app --database postgresql
```

Options:
- `--template, -t` — Template ID
- `--name, -n` — Project name
- `--database, -d` — Database choice
- `--orm` — ORM choice
- `--auth` — Authentication method
- `--deploy` — Deploy target
- `--ci` — CI/CD provider

## 🏷️ "Created with RepoKit" Badge

Add the badge to your project's README:

```markdown
[![Created with RepoKit](https://img.shields.io/badge/Created%20with-RepoKit-blue?style=flat-square)](https://github.com/sochiautoparts/repokit)
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## 📄 License

MIT © [sochiautoparts](https://github.com/sochiautoparts)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/sochiautoparts">sochiautoparts</a>
</p>
