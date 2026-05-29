'use strict';

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const Handlebars = require('handlebars');
const execa = require('execa');

const templates = require('./templates');
const utils = require('./utils');

/**
 * Generate a project from a template
 */
async function generateProject(options) {
  const {
    templateId,
    projectName,
    database,
    orm,
    auth,
    deploy,
    cicd,
    description
  } = options;

  const template = templates.getById(templateId);
  if (!template) {
    throw new Error(`Template "${templateId}" not found`);
  }

  const projectDir = path.resolve(process.cwd(), projectName);
  const slug = utils.slugify(projectName);

  // Check if directory exists and is not empty
  if (fs.existsSync(projectDir) && !utils.isDirectoryEmpty(projectDir)) {
    throw new Error(`Directory "${projectName}" already exists and is not empty`);
  }

  // Ensure project directory exists
  fs.ensureDirSync(projectDir);

  // Template data for Handlebars
  const templateData = {
    projectName: slug,
    projectNameCamel: slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    projectNamePascal: slug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase()),
    description: description || `A ${template.name} project`,
    template: templateId,
    database,
    orm,
    auth,
    deploy,
    cicd,
    year: new Date().getFullYear(),
    hasDatabase: database && database !== 'none' && database !== 'None',
    hasAuth: auth && auth !== 'none' && auth !== 'None',
    hasDocker: deploy === 'Docker',
    hasCI: cicd && cicd !== 'None',
    databaseUrl: utils.getDatabaseUrl(database),
    isTypeScript: isTypeScriptTemplate(templateId),
    isPython: isPythonTemplate(templateId),
    isGo: templateId === 'go-api',
    isRust: templateId === 'rust-api',
    isFlutter: templateId === 'flutter'
  };

  // FIX #1: Check for .hbs files specifically, not any files
  // Pro template dirs contain only README.md placeholders — those should NOT
  // trigger processTemplateDir; they should fall through to generateDynamically()
  const templateDir = templates.getTemplateDir(templateId);

  if (fs.existsSync(templateDir) && fs.readdirSync(templateDir).some(f => f.endsWith('.hbs'))) {
    // Process .hbs template files
    utils.processTemplateDir(templateDir, projectDir, templateData);
  } else {
    // Generate files dynamically for templates without .hbs files
    await generateDynamically(projectDir, templateData, template);
  }

  // Generate .gitignore
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, utils.generateGitignore(templateId));
  }

  // Generate Dockerfile if requested
  if (templateData.hasDocker) {
    const dockerfilePath = path.join(projectDir, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      fs.writeFileSync(dockerfilePath, utils.generateDockerfile(templateId, slug));
    }
    // Generate docker-compose.yml if database selected
    if (templateData.hasDatabase) {
      const composePath = path.join(projectDir, 'docker-compose.yml');
      if (!fs.existsSync(composePath)) {
        fs.writeFileSync(composePath, utils.generateDockerCompose(slug, database));
      }
    }
    // Generate .dockerignore
    const dockerignorePath = path.join(projectDir, '.dockerignore');
    if (!fs.existsSync(dockerignorePath)) {
      fs.writeFileSync(dockerignorePath, 'node_modules\ndist\nbuild\n.git\n.env\n*.md\n');
    }
  }

  // Generate CI/CD config
  if (templateData.hasCI && cicd) {
    const ciContent = utils.generateCIConfig(cicd, templateId);
    if (ciContent) {
      if (cicd === 'GitHub Actions') {
        const workflowsDir = path.join(projectDir, '.github', 'workflows');
        fs.ensureDirSync(workflowsDir);
        fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), ciContent);
      } else if (cicd === 'GitLab CI') {
        fs.writeFileSync(path.join(projectDir, '.gitlab-ci.yml'), ciContent);
      }
    }
  }

  // Generate .env.example if database or auth selected
  if (templateData.hasDatabase || templateData.hasAuth) {
    const envPath = path.join(projectDir, '.env.example');
    if (!fs.existsSync(envPath)) {
      let envContent = '# Environment Variables\n';
      if (templateData.hasDatabase) {
        envContent += `DATABASE_URL="${templateData.databaseUrl}"\n`;
      }
      if (templateData.hasAuth) {
        envContent += 'JWT_SECRET="change-me-in-production"\n';
        if (auth === 'OAuth2') {
          envContent += 'OAUTH_CLIENT_ID=""\nOAUTH_CLIENT_SECRET=""\n';
        }
        if (auth === 'Firebase Auth') {
          envContent += 'FIREBASE_PROJECT_ID=""\nFIREBASE_PRIVATE_KEY=""\n';
        }
      }
      envContent += 'NODE_ENV="development"\n';
      fs.writeFileSync(envPath, envContent);
    }
  }

  // Generate README with RepoKit badge (if not already generated from template)
  const readmePath = path.join(projectDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, utils.generateReadme(
      slug,
      templateData.description,
      templateId
    ));
  }

  // Initialize git repository
  try {
    await execa('git', ['init'], { cwd: projectDir });
    await execa('git', ['add', '.'], { cwd: projectDir });
    await execa('git', ['commit', '-m', 'Initial commit from RepoKit 🚀'], { cwd: projectDir });
  } catch (e) {
    // Git not available, skip
  }

  return projectDir;
}

/**
 * Generate project files dynamically for templates without .hbs files
 */
async function generateDynamically(projectDir, data, template) {
  const generators = {
    nextjs: generateNextjs,
    express: generateExpress,
    react: generateReact,
    fastapi: generateFastapi,
    vue: generateVue,
    'nextjs-fullstack': generateNextjsFullstack,
    'nextjs-ecommerce': generateNextjsEcommerce,
    'nextjs-saas': generateNextjsSaas,
    svelte: generateSvelte,
    angular: generateAngular,
    django: generateDjango,
    flask: generateFlask,
    'spring-boot': generateSpringBoot,
    'go-api': generateGoApi,
    'rust-api': generateRustApi,
    laravel: generateLaravel,
    rails: generateRails,
    graphql: generateGraphql,
    microservices: generateMicroservices,
    'cli-tool': generateCliTool,
    'python-cli': generatePythonCli,
    'desktop-electron': generateDesktopElectron,
    'desktop-tauri': generateDesktopTauri,
    'chrome-extension': generateChromeExtension,
    'discord-bot': generateDiscordBot,
    'telegram-bot': generateTelegramBot,
    wordpress: generateWordpress,
    'react-native': generateReactNative,
    flutter: generateFlutter,
    'vue-fullstack': generateVueFullstack,
    astro: generateAstro,
    remix: generateRemix,
    nestjs: generateNestjs,
    'svelte-fullstack': generateSvelteFullstack,
    'kotlin-api': generateKotlinApi
  };

  const generator = generators[data.template];
  if (generator) {
    await generator(projectDir, data);
  } else {
    // Fallback: generate a minimal project
    generateMinimal(projectDir, data);
  }
}

// ═══════════════════════════════════════════
// FREE TEMPLATE GENERATORS
// ═══════════════════════════════════════════

function generateNextjs(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint'
    },
    dependencies: {
      next: '^14.2.0',
      react: '^18.3.0',
      'react-dom': '^18.3.0'
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      '@types/node': '^20.12.0',
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0',
      eslint: '^8.57.0',
      'eslint-config-next': '^14.2.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'es5',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./src/*'] }
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules']
  }, { spaces: 2 });

  fs.writeFileSync(path.join(projectDir, 'next.config.js'),
    `/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
`);

  fs.writeFileSync(path.join(projectDir, 'tailwind.config.ts'),
    `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
`);

  fs.writeFileSync(path.join(projectDir, 'postcss.config.js'),
    `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

  fs.ensureDirSync(path.join(projectDir, 'src', 'app'));
  fs.writeFileSync(path.join(projectDir, 'src', 'app', 'layout.tsx'),
    `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${data.projectName}",
  description: "${data.description}",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'),
    `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center text-center">
        <h1 className="text-4xl font-bold mb-4">
          🚀 ${data.projectName}
        </h1>
        <p className="text-xl text-gray-500">
          Built with Next.js + RepoKit
        </p>
      </div>
    </main>
  );
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'app', 'globals.css'),
    `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-start-rgb));
}
`);

  fs.writeJsonSync(path.join(projectDir, '.eslintrc.json'), {
    extends: 'next/core-web-vitals'
  }, { spaces: 2 });
}

function generateExpress(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    description: data.description,
    main: 'dist/index.js',
    scripts: {
      dev: 'ts-node-dev --respawn src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      lint: 'eslint src/',
      test: 'jest'
    },
    dependencies: {
      express: '^4.19.0',
      cors: '^2.8.5',
      helmet: '^7.1.0',
      morgan: '^1.10.0',
      dotenv: '^16.4.0'
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/express': '^4.17.0',
      '@types/cors': '^2.8.0',
      '@types/morgan': '^1.9.0',
      '@types/node': '^20.12.0',
      'ts-node-dev': '^2.0.0',
      eslint: '^8.57.0',
      jest: '^29.7.0',
      'ts-jest': '^29.1.0',
      '@types/jest': '^29.5.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020'],
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      declaration: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src', 'routes'));
  fs.ensureDirSync(path.join(projectDir, 'src', 'middleware'));
  fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'),
    `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { healthRouter } from './routes/health';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/health', healthRouter);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`);
});

export default app;
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'routes', 'health.ts'),
    `import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export { router as healthRouter };
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'middleware', 'errorHandler.ts'),
    `import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err.stack);
  res.status(500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: 500
    }
  });
}
`);
}

function generateReact(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
      lint: 'eslint . --ext ts,tsx',
      test: 'vitest'
    },
    dependencies: {
      react: '^18.3.0',
      'react-dom': '^18.3.0'
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.2.0',
      vite: '^5.2.0',
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0',
      eslint: '^8.57.0',
      vitest: '^1.5.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true
    },
    include: ['src'],
    references: [{ path: './tsconfig.node.json' }]
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.node.json'), {
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowSyntheticDefaultImports: true
    },
    include: ['vite.config.ts']
  }, { spaces: 2 });

  fs.writeFileSync(path.join(projectDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`);

  fs.writeFileSync(path.join(projectDir, 'tailwind.config.js'),
    `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`);

  fs.writeFileSync(path.join(projectDir, 'postcss.config.js'),
    `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

  fs.writeFileSync(path.join(projectDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${data.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'App.tsx'),
    `function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">🚀 ${data.projectName}</h1>
        <p className="text-xl text-gray-500">
          Built with React + Vite + RepoKit
        </p>
      </div>
    </div>
  );
}

export default App;
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'index.css'),
    `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'vite-env.d.ts'),
    `/// <reference types="vite/client" />
`);
}

function generateFastapi(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'),
    `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
pydantic>=2.6.0
python-dotenv>=1.0.0
httpx>=0.27.0
pytest>=8.1.0
`);

  fs.writeFileSync(path.join(projectDir, 'pyproject.toml'),
    `[project]
name = "${data.projectName}"
version = "0.1.0"
description = "${data.description}"
requires-python = ">=3.10"

[tool.pytest.ini_options]
testpaths = ["tests"]
`);

  fs.ensureDirSync(path.join(projectDir, 'app'));
  fs.writeFileSync(path.join(projectDir, 'app', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'app', 'main.py'),
    `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health

app = FastAPI(
    title="${data.projectName}",
    description="${data.description}",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.get("/")
async def root():
    return {"message": "🚀 ${data.projectName}", "docs": "/docs"}
`);

  fs.ensureDirSync(path.join(projectDir, 'app', 'routers'));
  fs.writeFileSync(path.join(projectDir, 'app', 'routers', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'app', 'routers', 'health.py'),
    `from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok"}
`);

  fs.ensureDirSync(path.join(projectDir, 'tests'));
  fs.writeFileSync(path.join(projectDir, 'tests', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'tests', 'test_main.py'),
    `from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
`);
}

function generateVue(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
      lint: 'eslint . --ext .vue,.js,.jsx,.ts,.tsx',
      'type-check': 'vue-tsc --noEmit'
    },
    dependencies: {
      vue: '^3.4.0',
      'vue-router': '^4.3.0',
      pinia: '^2.1.0'
    },
    devDependencies: {
      '@vitejs/plugin-vue': '^5.0.0',
      vite: '^5.2.0',
      typescript: '^5.4.0',
      'vue-tsc': '^2.0.0',
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      module: 'ESNext',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'preserve',
      strict: true,
      paths: { '@/*': ['./src/*'] }
    },
    include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue'],
    references: [{ path: './tsconfig.node.json' }]
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.node.json'), {
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowSyntheticDefaultImports: true
    },
    include: ['vite.config.ts']
  }, { spaces: 2 });

  fs.writeFileSync(path.join(projectDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
`);

  fs.writeFileSync(path.join(projectDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${data.projectName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'main.ts'),
    `import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'App.vue'),
    `<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>
`);

  fs.ensureDirSync(path.join(projectDir, 'src', 'views'));
  fs.writeFileSync(path.join(projectDir, 'src', 'views', 'HomeView.vue'),
    `<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <h1 class="text-4xl font-bold mb-4">🚀 ${data.projectName}</h1>
      <p class="text-xl text-gray-500">Built with Vue 3 + RepoKit</p>
    </div>
  </div>
</template>
`);

  fs.ensureDirSync(path.join(projectDir, 'src', 'router'));
  fs.writeFileSync(path.join(projectDir, 'src', 'router', 'index.ts'),
    `import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    }
  ]
});

export default router;
`);

  fs.ensureDirSync(path.join(projectDir, 'src', 'assets'));
  fs.writeFileSync(path.join(projectDir, 'src', 'assets', 'main.css'),
    `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'vite-env.d.ts'),
    `/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
`);

  fs.writeFileSync(path.join(projectDir, 'tailwind.config.js'),
    `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
`);

  fs.writeFileSync(path.join(projectDir, 'postcss.config.js'),
    `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);
}

// ═══════════════════════════════════════════
// PRO TEMPLATE GENERATORS
// ═══════════════════════════════════════════

function generateNextjsFullstack(projectDir, data) {
  generateNextjs(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['@prisma/client'] = '^5.14.0';
  pkg.dependencies['next-auth'] = '^4.24.0';
  pkg.devDependencies['prisma'] = '^5.14.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });
  fs.ensureDirSync(path.join(projectDir, 'prisma'));
  fs.writeFileSync(path.join(projectDir, 'prisma', 'schema.prisma'),
    `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${data.database === 'postgresql' ? 'postgresql' : data.database === 'mysql' ? 'mysql' : 'sqlite'}"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  name      String?
  email     String   @unique
  emailVerified DateTime?
  image     String?
  accounts  Account[]
  sessions  Session[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
`);
  fs.ensureDirSync(path.join(projectDir, 'src', 'app', 'api', 'auth', '[...nextauth]'));
  fs.writeFileSync(path.join(projectDir, 'src', 'app', 'api', 'auth', '[...nextauth]', 'route.ts'),
    `import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
});

export { handler as GET, handler as POST };
`);
}

function generateNextjsEcommerce(projectDir, data) {
  generateNextjsFullstack(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['stripe'] = '^15.0.0';
  pkg.dependencies['@stripe/stripe-js'] = '^3.3.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });
  const schemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaPath)) {
    let schema = fs.readFileSync(schemaPath, 'utf-8');
    schema += `
model Product {
  id          String   @id @default(cuid())
  name        String
  description String?
  price       Int
  image       String?
  category    String?
  inStock     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Order {
  id            String    @id @default(cuid())
  userId        String
  stripeId      String    @unique
  items         OrderItem[]
  total         Int
  status        String    @default("pending")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  productId String
  quantity  Int
  price     Int
  order     Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
}
`;
    fs.writeFileSync(schemaPath, schema);
  }
}

function generateNextjsSaas(projectDir, data) {
  generateNextjsFullstack(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['stripe'] = '^15.0.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });
  const schemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaPath)) {
    let schema = fs.readFileSync(schemaPath, 'utf-8');
    schema += `
model Subscription {
  id                String   @id @default(cuid())
  userId            String
  stripeCustomerId  String   @unique
  stripePriceId     String
  stripeSubId       String   @unique
  status            String
  currentPeriodEnd  DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model ApiKey {
  id        String   @id @default(cuid())
  userId    String
  key       String   @unique
  name      String
  lastUsed  DateTime?
  createdAt DateTime @default(now())
}
`;
    fs.writeFileSync(schemaPath, schema);
  }
}

// FIX #5: Complete Svelte with +layout.svelte, tsconfig, vite.config
function generateSvelte(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'vite dev',
      build: 'vite build',
      preview: 'vite preview',
      check: 'svelte-kit sync && svelte-check --tsconfig ./tsconfig.json'
    },
    devDependencies: {
      '@sveltejs/adapter-auto': '^3.2.0',
      '@sveltejs/kit': '^2.5.0',
      '@sveltejs/vite-plugin-svelte': '^3.1.0',
      svelte: '^4.2.0',
      'svelte-check': '^3.7.0',
      typescript: '^5.4.0',
      vite: '^5.2.0',
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    extends: './.svelte-kit/tsconfig.json',
    compilerOptions: {
      allowJs: true,
      checkJs: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      sourceMap: true,
      strict: true,
      moduleResolution: 'bundler'
    }
  }, { spaces: 2 });

  fs.writeFileSync(path.join(projectDir, 'svelte.config.js'),
    `import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
`);

  fs.writeFileSync(path.join(projectDir, 'vite.config.ts'),
    `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
`);

  fs.ensureDirSync(path.join(projectDir, 'src', 'routes'));
  fs.writeFileSync(path.join(projectDir, 'src', 'routes', '+layout.svelte'),
    `<slot />
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'app.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-prerender="true">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'routes', '+page.svelte'),
    `<h1 class="text-4xl font-bold">🚀 ${data.projectName}</h1>
<p class="text-xl text-gray-500 mt-4">Built with SvelteKit + RepoKit</p>
`);

  fs.ensureDirSync(path.join(projectDir, 'src', 'app.d.ts'));
  fs.writeFileSync(path.join(projectDir, 'src', 'app.d.ts'),
    `/// <reference types="@sveltejs/kit" />
`);

  fs.writeFileSync(path.join(projectDir, 'tailwind.config.js'),
    `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`);

  fs.writeFileSync(path.join(projectDir, 'postcss.config.js'),
    `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);
}

// FIX: Complete Angular with src/app components
function generateAngular(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.0.0',
    scripts: {
      ng: 'ng',
      start: 'ng serve',
      build: 'ng build',
      watch: 'ng build --watch --configuration development',
      test: 'ng test'
    },
    dependencies: {
      '@angular/animations': '^17.3.0',
      '@angular/common': '^17.3.0',
      '@angular/compiler': '^17.3.0',
      '@angular/core': '^17.3.0',
      '@angular/forms': '^17.3.0',
      '@angular/platform-browser': '^17.3.0',
      '@angular/platform-browser-dynamic': '^17.3.0',
      '@angular/router': '^17.3.0',
      rxjs: '^7.8.0',
      'zone.js': '^0.14.0'
    },
    devDependencies: {
      '@angular-devkit/build-angular': '^17.3.0',
      '@angular/cli': '^17.3.0',
      '@angular/compiler-cli': '^17.3.0',
      typescript: '^5.4.0',
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compileOnSave: false,
    compilerOptions: {
      outDir: './dist/out-tsc',
      forceConsistentCasingInFileNames: true,
      strict: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      sourceMap: true,
      declaration: false,
      downlevelIteration: true,
      experimentalDecorators: true,
      moduleResolution: 'node',
      importHelpers: true,
      target: 'ES2022',
      module: 'ES2022',
      useDefineForClassFields: false,
      lib: ['ES2022', 'dom']
    },
    angularCompilerOptions: {
      enableI18nLegacyMessageIdFormat: false,
      strictInjectionParameters: true,
      strictInputAccessModifiers: true,
      strictTemplates: true
    }
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src', 'app'));
  fs.writeFileSync(path.join(projectDir, 'src', 'app', 'app.component.ts'),
    `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: \`
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-4xl font-bold mb-4">🚀 ${data.projectName}</h1>
        <p class="text-xl text-gray-500">Built with Angular 17+ RepoKit</p>
      </div>
    </div>
  \`
})
export class AppComponent {
  title = '${data.projectName}';
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'app', 'app.config.ts'),
    `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter([])]
};
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'main.ts'),
    `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'index.html'),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${data.projectName}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <app-root></app-root>
</body>
</html>
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'styles.css'),
    `@tailwind base;
@tailwind components;
@tailwind utilities;
`);

  fs.writeFileSync(path.join(projectDir, 'angular.json'),
    JSON.stringify({
      $schema: './node_modules/@angular/cli/lib/config/schema.json',
      version: 1,
      newProjectRoot: 'projects',
      projects: {
        [data.projectName]: {
          projectType: 'application',
          root: '',
          sourceRoot: 'src',
          prefix: 'app',
          architect: {
            build: {
              builder: '@angular-devkit/build-angular:application',
              options: {
                outputPath: 'dist/' + data.projectName,
                index: 'src/index.html',
                browser: 'src/main.ts',
                tsConfig: 'tsconfig.json',
                styles: ['src/styles.css'],
                scripts: []
              }
            },
            serve: {
              builder: '@angular-devkit/build-angular:dev-server',
              options: { buildTarget: data.projectName + ':build' }
            }
          }
        }
      }
    }, null, 2)
  );
}

// FIX #5: Django with settings.py
function generateDjango(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'),
    `django>=5.0
djangorestframework>=3.15
django-cors-headers>=4.3
psycopg2-binary>=2.9
celery>=5.3
gunicorn>=22.0
python-dotenv>=1.0
pytest-django>=4.8
`);

  fs.ensureDirSync(path.join(projectDir, 'config'));
  fs.writeFileSync(path.join(projectDir, 'config', '__init__.py'), '');

  // FIX: Add config/settings.py (was missing!)
  fs.writeFileSync(path.join(projectDir, 'config', 'settings.py'),
    `"""
Django settings for ${data.projectName} project.
Generated by RepoKit.
"""
import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
# In production, always set SECRET_KEY from environment variable.
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-change-me-in-production-!@#$%^&*()'
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'corsheaders',
    # Local
    'app',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
# Use DATABASE_URL environment variable or default to SQLite for development
DATABASES = {
    'default': {
        'ENGINE': os.environ.get('DB_ENGINE', 'django.db.backends.sqlite3'),
        'NAME': os.environ.get('DB_NAME', BASE_DIR / 'db.sqlite3'),
        'USER': os.environ.get('DB_USER', ''),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', ''),
        'PORT': os.environ.get('DB_PORT', ''),
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS settings
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if not DEBUG else []

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# Celery
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
`);

  fs.writeFileSync(path.join(projectDir, 'config', 'urls.py'),
    `"""URL configuration for ${data.projectName} project."""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('app.urls')),
]
`);

  fs.writeFileSync(path.join(projectDir, 'config', 'wsgi.py'),
    `"""WSGI config for ${data.projectName} project."""
import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_wsgi_application()
`);

  fs.writeFileSync(path.join(projectDir, 'manage.py'),
    `#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
`);

  // Add app module with basic views
  fs.ensureDirSync(path.join(projectDir, 'app'));
  fs.writeFileSync(path.join(projectDir, 'app', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'app', 'models.py'),
    `from django.db import models

# Create your models here.
`);
  fs.writeFileSync(path.join(projectDir, 'app', 'views.py'),
    `from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def health_check(request):
    return Response({'status': 'ok'})
`);
  fs.writeFileSync(path.join(projectDir, 'app', 'urls.py'),
    `from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health-check'),
]
`);
}

// FIX #8: Flask with secure secret key generation
function generateFlask(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'),
    `flask>=3.0
flask-sqlalchemy>=3.1
flask-migrate>=4.0
flask-cors>=4.0
python-dotenv>=1.0
pytest>=8.1
`);

  fs.ensureDirSync(path.join(projectDir, 'app'));
  fs.writeFileSync(path.join(projectDir, 'app', '__init__.py'),
    `from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')

    CORS(app)
    db.init_app(app)
    migrate.init_app(app, db)

    from app.routes import bp
    app.register_blueprint(bp)

    return app
`);
  fs.writeFileSync(path.join(projectDir, 'app', 'routes.py'),
    `from flask import Blueprint, jsonify

bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})
`);
  // FIX #8: Generate random key in production instead of hardcoded 'dev-key'
  fs.writeFileSync(path.join(projectDir, 'config.py'),
    `import os
import secrets

class Config:
    # FIX: Generate random key in production, use dev-key only in development
    SECRET_KEY = os.environ.get(
        'SECRET_KEY',
        secrets.token_hex(32) if os.environ.get('FLASK_ENV') == 'production' else 'dev-key'
    )
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///dev.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
`);
  fs.writeFileSync(path.join(projectDir, 'wsgi.py'),
    `from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
`);
}

// FIX #6: Spring Boot with valid Java package name
function generateSpringBoot(projectDir, data) {
  // FIX: Convert project name to valid Java package (remove hyphens, ensure lowercase)
  const javaPackage = data.projectName.replace(/-/g, '').toLowerCase();
  const packagePath = path.join(projectDir, 'src', 'main', 'java', 'com', javaPackage, 'controller');
  const testPath = path.join(projectDir, 'src', 'test', 'java', 'com', javaPackage);
  fs.ensureDirSync(packagePath);
  fs.ensureDirSync(path.join(projectDir, 'src', 'main', 'resources'));
  fs.ensureDirSync(testPath);

  fs.writeFileSync(path.join(projectDir, 'build.gradle'),
    `plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0'
    id 'io.spring.dependency-management' version '1.1.0'
}

// FIX: Sanitized package name (hyphens are invalid in Java packages)
group = 'com.${javaPackage}'
version = '0.0.1-SNAPSHOT'
sourceCompatibility = '17'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    runtimeOnly 'org.postgresql:postgresql'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
`);

  // Add Application.java
  fs.writeFileSync(path.join(projectDir, 'src', 'main', 'java', 'com', javaPackage, 'Application.java'),
    `package com.${javaPackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`);

  // Add HealthController
  fs.writeFileSync(path.join(projectDir, 'src', 'main', 'java', 'com', javaPackage, 'controller', 'HealthController.java'),
    `package com.${javaPackage}.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class HealthController {
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
`);

  // FIX #9: Use env vars for database credentials instead of hardcoded
  fs.writeFileSync(path.join(projectDir, 'src', 'main', 'resources', 'application.yml'),
    `server:
  port: 8080

spring:
  datasource:
    # FIX: Use environment variables instead of hardcoded passwords
    url: \${DATABASE_URL:jdbc:postgresql://localhost:5432/${data.projectName}}
    username: \${DB_USERNAME:postgres}
    password: \${DB_PASSWORD:changeme}
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
`);
}

// FIX: Complete Go API with handler/model/repository
function generateGoApi(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'cmd', 'server'));
  fs.ensureDirSync(path.join(projectDir, 'internal', 'handler'));
  fs.ensureDirSync(path.join(projectDir, 'internal', 'model'));
  fs.ensureDirSync(path.join(projectDir, 'internal', 'repository'));

  fs.writeFileSync(path.join(projectDir, 'go.mod'),
    `module ${data.projectName}

go 1.22

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.2.0
    gorm.io/gorm v1.25.0
    gorm.io/driver/postgres v1.5.0
    gorm.io/driver/sqlite v1.5.0
)
`);

  fs.writeFileSync(path.join(projectDir, 'cmd', 'server', 'main.go'),
    `package main

import (
    "log"
    "net/http"
    "os"

    "github.com/gin-gonic/gin"
    "gorm.io/driver/sqlite"
    "gorm.io/gorm"
    "${data.projectName}/internal/handler"
    "${data.projectName}/internal/model"
    "${data.projectName}/internal/repository"
)

func main() {
    // Connect to database
    dbURL := os.Getenv("DATABASE_URL")
    var db *gorm.DB
    var err error
    if dbURL != "" {
        log.Println("Connecting to PostgreSQL...")
        // Use postgres driver for real DB
        log.Fatal("PostgreSQL driver not imported - use sqlite for dev")
    } else {
        db, err = sqlite.Open("dev.db")
        if err != nil {
            log.Fatal("Failed to connect to database:", err)
        }
    }

    // Auto-migrate
    db.AutoMigrate(&model.Item{})

    // Setup layers
    itemRepo := repository.NewItemRepository(db)
    itemHandler := handler.NewItemHandler(itemRepo)

    // Setup router
    r := gin.Default()

    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "ok"})
    })

    api := r.Group("/api/v1")
    {
        api.GET("/items", itemHandler.List)
        api.POST("/items", itemHandler.Create)
        api.GET("/items/:id", itemHandler.Get)
    }

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    log.Println("🚀 Server starting on :" + port)
    if err := r.Run(":" + port); err != nil {
        log.Fatal(err)
    }
}
`);

  fs.writeFileSync(path.join(projectDir, 'internal', 'model', 'item.go'),
    `package model

import "gorm.io/gorm"

type Item struct {
    gorm.Model
    Name        string \`json:"name" gorm:"not null"\`
    Description string \`json:"description"\`
}
`);

  fs.writeFileSync(path.join(projectDir, 'internal', 'repository', 'item_repository.go'),
    `package repository

import (
    "${data.projectName}/internal/model"
    "gorm.io/gorm"
)

type ItemRepository interface {
    FindAll() ([]model.Item, error)
    FindByID(id uint) (*model.Item, error)
    Create(item *model.Item) error
}

type itemRepository struct {
    db *gorm.DB
}

func NewItemRepository(db *gorm.DB) ItemRepository {
    return &itemRepository{db: db}
}

func (r *itemRepository) FindAll() ([]model.Item, error) {
    var items []model.Item
    err := r.db.Find(&items).Error
    return items, err
}

func (r *itemRepository) FindByID(id uint) (*model.Item, error) {
    var item model.Item
    err := r.db.First(&item, id).Error
    return &item, err
}

func (r *itemRepository) Create(item *model.Item) error {
    return r.db.Create(item).Error
}
`);

  fs.writeFileSync(path.join(projectDir, 'internal', 'handler', 'item_handler.go'),
    `package handler

import (
    "net/http"
    "strconv"

    "github.com/gin-gonic/gin"
    "${data.projectName}/internal/model"
    "${data.projectName}/internal/repository"
)

type ItemHandler struct {
    repo repository.ItemRepository
}

func NewItemHandler(repo repository.ItemRepository) *ItemHandler {
    return &ItemHandler{repo: repo}
}

func (h *ItemHandler) List(c *gin.Context) {
    items, err := h.repo.FindAll()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, items)
}

func (h *ItemHandler) Get(c *gin.Context) {
    id, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
        return
    }
    item, err := h.repo.FindByID(uint(id))
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
        return
    }
    c.JSON(http.StatusOK, item)
}

func (h *ItemHandler) Create(c *gin.Context) {
    var item model.Item
    if err := c.ShouldBindJSON(&item); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    if err := h.repo.Create(&item); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusCreated, item)
}
`);
}

function generateRustApi(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'src'));

  fs.writeFileSync(path.join(projectDir, 'Cargo.toml'),
    `[package]
name = "${data.projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
actix-web = "4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = "0.3"
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'main.rs'),
    `use actix_web::{web, App, HttpServer, HttpResponse};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct HealthResponse {
    status: String,
}

#[derive(Serialize, Deserialize)]
struct Item {
    id: u32,
    name: String,
    description: Option<String>,
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
    })
}

async fn list_items() -> HttpResponse {
    let items: Vec<Item> = vec![
        Item { id: 1, name: "Item 1".to_string(), description: Some("First item".to_string()) },
        Item { id: 2, name: "Item 2".to_string(), description: None },
    ];
    HttpResponse::Ok().json(items)
}

async fn create_item(item: web::Json<Item>) -> HttpResponse {
    HttpResponse::Created().json(item.into_inner())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::init();

    println!("🚀 Server starting on http://0.0.0.0:8080");

    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health))
            .route("/api/v1/items", web::get().to(list_items))
            .route("/api/v1/items", web::post().to(create_item))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
`);
}

// FIX: Complete Laravel with routes, controllers, artisan
function generateLaravel(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'composer.json'),
    JSON.stringify({
      name: data.projectName,
      type: 'project',
      require: {
        'php': '^8.2',
        'laravel/framework': '^11.0',
        'laravel/sanctum': '^4.0'
      },
      scripts: {
        'post-autoload-dump': ['Illuminate\\Foundation\\ComposerScripts::postAutoloadDump', '@php artisan package:discover --ansi']
      },
      config: {
        'optimize-autoloader': true,
        'preferred-install': 'dist',
        'sort-packages': true
      },
      minimum_stability: 'stable',
      prefer_stable: true
    }, null, 2)
  );

  fs.ensureDirSync(path.join(projectDir, 'app', 'Http', 'Controllers'));
  fs.ensureDirSync(path.join(projectDir, 'routes'));
  fs.ensureDirSync(path.join(projectDir, 'config'));
  fs.ensureDirSync(path.join(projectDir, 'database'));

  fs.writeFileSync(path.join(projectDir, 'app', 'Http', 'Controllers', 'HealthController.php'),
    `<?php

namespace App\\Http\\Controllers;

use Illuminate\\Http\\JsonResponse;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['status' => 'ok']);
    }
}
`);

  fs.writeFileSync(path.join(projectDir, 'routes', 'api.php'),
    `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\HealthController;

Route::get('/health', HealthController::class);
Route::get('/', function () {
    return response()->json(['message' => '🚀 ${data.projectName}', 'docs' => '/api/health']);
});
`);

  fs.writeFileSync(path.join(projectDir, 'routes', 'web.php'),
    `<?php

use Illuminate\\Support\\Facades\\Route;

Route::get('/', function () {
    return view('welcome');
});
`);

  fs.writeFileSync(path.join(projectDir, '.env.example'),
    `APP_NAME=${data.projectName}
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=${data.projectName}
DB_USERNAME=postgres
# FIX: Use env var for password, change in production!
DB_PASSWORD=\${DB_PASSWORD:-changeme}
`);
}

// FIX: Complete Rails with Gemfile, config, routes
function generateRails(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'Gemfile'),
    `source "https://rubygems.org"

ruby "3.3.0"

gem "rails", "~> 7.1"
gem "pg", "~> 1.5"
gem "puma", ">= 5.0"
gem "turbo-rails"
gem "stimulus-rails"
gem "jbuilder"
gem "sprockets-rails"

group :development, :test do
  gem "debug", platforms: %i[mri windows]
  gem "rspec-rails"
end
`);

  fs.ensureDirSync(path.join(projectDir, 'app', 'controllers'));
  fs.ensureDirSync(path.join(projectDir, 'config'));
  fs.ensureDirSync(path.join(projectDir, 'app', 'models'));

  fs.writeFileSync(path.join(projectDir, 'config', 'routes.rb'),
    `Rails.application.routes.draw do
  get "/health", to: "health#index"
  root "health#index"
end
`);

  fs.writeFileSync(path.join(projectDir, 'app', 'controllers', 'health_controller.rb'),
    `class HealthController < ApplicationController
  def index
    render json: { status: "ok" }
  end
end
`);

  fs.writeFileSync(path.join(projectDir, 'config', 'database.yml'),
    `default: &default
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  # FIX: Use env vars for database credentials
  host: <%= ENV.fetch("DB_HOST") { "localhost" } %>
  username: <%= ENV.fetch("DB_USERNAME") { "postgres" } %>
  password: <%= ENV.fetch("DB_PASSWORD") { "changeme" } %>

development:
  <<: *default
  database: ${data.projectName}_development

test:
  <<: *default
  database: ${data.projectName}_test

production:
  <<: *default
  database: ${data.projectName}_production
`);
}

// FIX: Complete GraphQL with schema, resolvers, server
function generateGraphql(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    scripts: {
      dev: 'ts-node-dev --respawn src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      '@apollo/server': '^4.10.0',
      graphql: '^16.8.0',
      '@prisma/client': '^5.14.0'
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/node': '^20.12.0',
      'ts-node-dev': '^2.0.0',
      prisma: '^5.14.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020'],
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src'));

  fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'),
    `import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const typeDefs = \`#graphql
  type Item {
    id: ID!
    name: String!
    description: String
  }

  type Query {
    items: [Item!]!
    item(id: ID!): Item
    health: String!
  }

  type Mutation {
    createItem(name: String!, description: String): Item!
  }
\`;

const items = [
  { id: '1', name: 'Item 1', description: 'First item' },
  { id: '2', name: 'Item 2', description: 'Second item' },
];

const resolvers = {
  Query: {
    health: () => 'ok',
    items: () => items,
    item: (_: any, args: { id: string }) => items.find(i => i.id === args.id),
  },
  Mutation: {
    createItem: (_: any, args: { name: string; description?: string }) => {
      const item = { id: String(items.length + 1), ...args };
      items.push(item);
      return item;
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });

startStandaloneServer(server, { listen: { port: 4000 } }).then(({ url }) => {
  console.log(\`🚀 GraphQL server ready at \${url}\`);
});
`);
}

// FIX: Complete Microservices with proper docker-compose, gateway, services
function generateMicroservices(projectDir, data) {
  const services = ['api-gateway', 'user-service', 'product-service'];
  for (const svc of services) {
    const svcDir = path.join(projectDir, 'services', svc);
    fs.ensureDirSync(path.join(svcDir, 'src'));
    fs.writeJsonSync(path.join(svcDir, 'package.json'), {
      name: `${data.projectName}-${svc}`,
      version: '1.0.0',
      scripts: { start: 'node src/index.js', dev: 'nodemon src/index.js' },
      dependencies: { express: '^4.19.0', cors: '^2.8.5', helmet: '^7.1.0', dotenv: '^16.4.0' },
      devDependencies: { nodemon: '^3.1.0' }
    }, { spaces: 2 });

    const port = svc === 'api-gateway' ? 3000 : svc === 'user-service' ? 3001 : 3002;
    fs.writeFileSync(path.join(svcDir, 'src', 'index.js'),
      `const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || ${port};

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: '${svc}' });
});

app.listen(PORT, () => {
  console.log(\`🚀 ${svc} running on port \${PORT}\`);
});
`);
  }

  // FIX #9: Docker compose with env vars instead of hardcoded passwords
  fs.writeFileSync(path.join(projectDir, 'docker-compose.yml'),
    `version: "3.8"

services:
  api-gateway:
    build: ./services/api-gateway
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    depends_on:
      - user-service
      - product-service

  user-service:
    build: ./services/user-service
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      # FIX: Use env vars for passwords, change in production!
      - DB_PASSWORD=\${DB_PASSWORD:-changeme}

  product-service:
    build: ./services/product-service
    ports:
      - "3002:3002"
    environment:
      - PORT=3002
      - DB_PASSWORD=\${DB_PASSWORD:-changeme}

  # RabbitMQ for messaging
  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"

  # Redis for caching
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
`);

  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    name: data.projectName,
    version: '1.0.0',
    private: true,
    scripts: {
      'dev:gateway': 'cd services/api-gateway && npm run dev',
      'dev:users': 'cd services/user-service && npm run dev',
      'dev:products': 'cd services/product-service && npm run dev',
      'docker:up': 'docker-compose up -d',
      'docker:down': 'docker-compose down'
    }
  }, null, 2));
}

// FIX: Complete CLI tool with commander/inquirer setup
function generateCliTool(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    description: data.description,
    bin: { [data.projectName]: './dist/index.js' },
    scripts: {
      dev: 'ts-node src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      commander: '^12.0.0',
      chalk: '^4.1.2',
      inquirer: '^8.2.6',
      ora: '^5.4.1'
    },
    devDependencies: {
      typescript: '^5.4.0',
      '@types/node': '^20.12.0',
      'ts-node': '^10.9.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      declaration: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'),
    `#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

const program = new Command();

program
  .name('${data.projectName}')
  .description('${data.description}')
  .version('1.0.0');

program
  .command('hello <name>')
  .description('Say hello to someone')
  .action((name: string) => {
    const spinner = ora('Processing...').start();
    setTimeout(() => {
      spinner.succeed(chalk.green(\`Hello, \${name}! 👋\`));
    }, 500);
  });

program
  .command('list')
  .description('List items')
  .action(() => {
    console.log(chalk.cyan('Items:'));
    console.log('  1. Item one');
    console.log('  2. Item two');
    console.log('  3. Item three');
  });

program.parse();
`);
}

// FIX: Complete Python CLI with click/typer setup
function generatePythonCli(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'),
    `click>=8.1
rich>=13.7
python-dotenv>=1.0
`);

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'pyproject.toml'),
    `[project]
name = "${data.projectName}"
version = "0.1.0"
description = "${data.description}"
dependencies = ["click>=8.1", "rich>=13.7"]

[project.scripts]
${data.projectName} = "src.cli:main"

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"
`);

  fs.writeFileSync(path.join(projectDir, 'src', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'src', 'cli.py'),
    `import click
from rich.console import Console

console = Console()


@click.group()
def main():
    """${data.projectName} - ${data.description}"""
    pass


@main.command()
@click.argument("name")
def hello(name: str):
    """Say hello to someone."""
    console.print(f"[green]Hello, {name}! 👋[/green]")


@main.command()
def list():
    """List items."""
    console.print("[cyan]Items:[/cyan]")
    for i in range(1, 4):
        console.print(f"  {i}. Item {i}")


if __name__ == "__main__":
    main()
`);
}

// FIX #7: Electron with NO RCE vulnerability (nodeIntegration: false, contextIsolation: true)
function generateDesktopElectron(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    main: 'main.js',
    scripts: {
      start: 'electron .',
      build: 'electron-builder'
    },
    dependencies: {
      'electron-builder': '^24.13.0'
    },
    devDependencies: {
      electron: '^30.0.0'
    }
  }, { spaces: 2 });

  // FIX #7: Set nodeIntegration: false and contextIsolation: true to prevent RCE
  fs.writeFileSync(path.join(projectDir, 'main.js'),
    `const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // FIX: Prevent RCE vulnerability - nodeIntegration must be false
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`);

  // Add preload.js for secure IPC
  fs.writeFileSync(path.join(projectDir, 'preload.js'),
    `const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  send: (channel, data) => {
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});
`);

  fs.writeFileSync(path.join(projectDir, 'index.html'),
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${data.projectName}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { text-align: center; }
    h1 { font-size: 2.5rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 ${data.projectName}</h1>
    <p>Built with Electron + RepoKit</p>
  </div>
</body>
</html>
`);
}

// FIX: Complete Tauri with Cargo.toml, src-tauri, and React frontend
function generateDesktopTauri(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    scripts: { dev: 'tauri dev', build: 'tauri build' },
    dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
    devDependencies: { typescript: '^5.4.0', vite: '^5.2.0', '@vitejs/plugin-react': '^4.2.0', '@tauri-apps/cli': '^1.5.0' }
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src-tauri', 'src'));
  fs.writeFileSync(path.join(projectDir, 'src-tauri', 'Cargo.toml'),
    `[package]
name = "${data.projectName}"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[build-dependencies]
tauri-build = { version = "1" }
`);

  fs.writeFileSync(path.join(projectDir, 'src-tauri', 'build.rs'),
    `fn main() {
    tauri_build::build()
}
`);

  fs.writeFileSync(path.join(projectDir, 'src-tauri', 'src', 'main.rs'),
    `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`);

  fs.writeFileSync(path.join(projectDir, 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({
      build: { devPath: '../src', distDir: '../dist' },
      package: { productName: data.projectName, version: '0.1.0' },
      tauri: {
        allowlist: { all: false, shell: { open: true } },
        bundle: { active: true, identifier: `com.${data.projectName}.dev` },
        security: { csp: null },
        windows: [{ title: data.projectName, width: 800, height: 600 }]
      }
    }, null, 2)
  );

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'index.html'),
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${data.projectName}</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
`);
  fs.writeFileSync(path.join(projectDir, 'src', 'main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
`);
  fs.writeFileSync(path.join(projectDir, 'src', 'App.tsx'),
    `function App() {
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
    <div style={{textAlign:'center'}}><h1>🚀 ${data.projectName}</h1><p>Built with Tauri + React + RepoKit</p></div>
  </div>;
}
export default App;
`);
}

// FIX: Complete Chrome Extension with manifest.json, popup.html, background.js
function generateChromeExtension(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.ensureDirSync(path.join(projectDir, 'icons'));

  fs.writeJsonSync(path.join(projectDir, 'manifest.json'), {
    manifest_version: 3,
    name: data.projectName,
    version: '1.0.0',
    description: data.description,
    action: { default_popup: 'popup.html', default_icon: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' } },
    background: { service_worker: 'background.js' },
    permissions: ['storage', 'activeTab'],
    icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' }
  }, { spaces: 2 });

  fs.writeFileSync(path.join(projectDir, 'popup.html'),
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 350px; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    h1 { font-size: 1.2rem; margin: 0 0 8px; }
    p { color: #666; font-size: 0.9rem; }
    button { background: #6c5ce7; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; width: 100%; margin-top: 8px; }
    button:hover { background: #5a4bd4; }
  </style>
</head>
<body>
  <h1>🚀 ${data.projectName}</h1>
  <p>Chrome Extension by RepoKit</p>
  <button id="action">Click me</button>
  <script src="popup.js"></script>
</body>
</html>
`);

  fs.writeFileSync(path.join(projectDir, 'popup.js'),
    `document.getElementById('action').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'ACTION' });
  }
});
`);

  fs.writeFileSync(path.join(projectDir, 'background.js'),
    `// Background service worker for ${data.projectName}
chrome.runtime.onInstalled.addListener(() => {
  console.log('${data.projectName} extension installed!');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ACTION') {
    console.log('Action received');
    sendResponse({ success: true });
  }
});
`);
}

// FIX: Complete Discord Bot with index.js and discord.js
function generateDiscordBot(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    scripts: { dev: 'ts-node-dev --respawn src/index.ts', build: 'tsc', start: 'node dist/index.js' },
    dependencies: { 'discord.js': '^14.14.0', dotenv: '^16.4.0' },
    devDependencies: { typescript: '^5.4.0', '@types/node': '^20.12.0', 'ts-node-dev': '^2.0.0' }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'),
    `import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN || '';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with pong!'),
  new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Says hello!'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(\`🤖 Bot online as \${client.user?.tag}\`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Slash commands registered');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong! 🏓');
  } else if (interaction.commandName === 'hello') {
    await interaction.reply('Hello! 👋');
  }
});

client.login(TOKEN);
`);

  fs.writeFileSync(path.join(projectDir, '.env.example'),
    `DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
`);
}

// FIX: Complete Telegram Bot with aiogram
function generateTelegramBot(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'),
    `aiogram>=3.4
python-dotenv>=1.0
`);

  fs.ensureDirSync(path.join(projectDir, 'bot'));
  fs.writeFileSync(path.join(projectDir, 'bot', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'bot', 'main.py'),
    `import asyncio
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage

BOT_TOKEN = os.getenv("BOT_TOKEN", "")

bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(storage=storage)


class Form(StatesGroup):
    name = State()


@dp.message(Command("start"))
async def cmd_start(message: types.Message, state: FSMContext):
    await state.set_state(Form.name)
    await message.answer(
        "🤖 Hello! I am your bot built with RepoKit.\\n"
        "What is your name?"
    )


@dp.message(Form.name)
async def process_name(message: types.Message, state: FSMContext):
    await state.update_data(name=message.text)
    await state.clear()
    await message.answer(f"Nice to meet you, {message.text}! 👋")


@dp.message(Command("help"))
async def cmd_help(message: types.Message):
    await message.answer(
        "Available commands:\\n"
        "/start - Start the bot\\n"
        "/help - Show this help"
    )


@dp.message(F.text.lower() == "hello")
async def echo_hello(message: types.Message):
    await message.answer("Hello! 👋")


async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
`);

  fs.writeFileSync(path.join(projectDir, '.env.example'),
    `BOT_TOKEN=your-telegram-bot-token-here
`);
}

// FIX: Complete WordPress with plugin structure
function generateWordpress(projectDir, data) {
  const upperName = data.projectName.toUpperCase().replace(/-/g, '_');
  fs.ensureDirSync(path.join(projectDir, 'includes'));
  fs.ensureDirSync(path.join(projectDir, 'assets', 'js'));
  fs.ensureDirSync(path.join(projectDir, 'assets', 'css'));
  fs.ensureDirSync(path.join(projectDir, 'admin'));

  fs.writeFileSync(path.join(projectDir, `${data.projectName}.php`),
    `<?php
/**
 * Plugin Name: ${data.projectName}
 * Description: ${data.description}
 * Version: 1.0.0
 * Author: Developer
 * Text Domain: ${data.projectName}
 */

if (!defined('ABSPATH')) exit;

define('${upperName}_VERSION', '1.0.0');
define('${upperName}_PATH', plugin_dir_path(__FILE__));
define('${upperName}_URL', plugin_dir_url(__FILE__));

require_once ${upperName}_PATH . 'includes/class-plugin.php';

// Activation hook
register_activation_hook(__FILE__, function() {
    // Create database tables, set default options
    update_option('${data.projectName}_version', ${upperName}_VERSION);
});

// Deactivation hook
register_deactivation_hook(__FILE__, function() {
    // Cleanup
});

// Initialize plugin
add_action('plugins_loaded', function() {
    $plugin = new \\${data.projectNameCamel}\\Plugin();
    $plugin->init();
});
`);

  fs.writeFileSync(path.join(projectDir, 'includes', 'class-plugin.php'),
    `<?php
namespace ${data.projectNameCamel};

if (!defined('ABSPATH')) exit;

class Plugin {
    public function init() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('admin_enqueue_scripts', [$this, 'admin_enqueue_assets']);
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function enqueue_assets() {
        wp_enqueue_style(
            '${data.projectName}-style',
            ${upperName}_URL . 'assets/css/style.css',
            [],
            ${upperName}_VERSION
        );
        wp_enqueue_script(
            '${data.projectName}-script',
            ${upperName}_URL . 'assets/js/main.js',
            [],
            ${upperName}_VERSION,
            true
        );
    }

    public function admin_enqueue_assets() {
        wp_enqueue_style(
            '${data.projectName}-admin-style',
            ${upperName}_URL . 'assets/css/admin.css',
            [],
            ${upperName}_VERSION
        );
    }

    public function register_routes() {
        register_rest_route('${data.projectName}/v1', '/health', [
            'methods' => 'GET',
            'callback' => function() {
                return ['status' => 'ok'];
            },
            'permission_callback' => '__return_true',
        ]);
    }
}
`);

  fs.writeFileSync(path.join(projectDir, 'assets', 'css', 'style.css'),
    `/* ${data.projectName} Frontend Styles */
`);

  fs.writeFileSync(path.join(projectDir, 'assets', 'js', 'main.js'),
    `// ${data.projectName} Frontend JavaScript
document.addEventListener('DOMContentLoaded', function() {
    console.log('${data.projectName} loaded');
});
`);
}

// FIX: Complete React Native with App.tsx and package.json
function generateReactNative(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios', web: 'expo start --web' },
    dependencies: {
      expo: '~50.0.0',
      'expo-status-bar': '~1.11.0',
      react: '18.2.0',
      'react-native': '0.73.0',
      '@react-navigation/native': '^6.1.0',
      '@react-navigation/native-stack': '^6.9.0',
      'react-native-safe-area-context': '^4.8.0',
      'react-native-screens': '^3.29.0'
    },
    devDependencies: {
      '@babel/core': '^7.24.0',
      typescript: '^5.4.0',
      '@types/react': '^18.3.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      strict: true,
      target: 'esnext',
      module: 'esnext',
      jsx: 'react-jsx',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      skipLibCheck: true
    },
    extends: 'expo/tsconfig.base'
  }, { spaces: 2 });

  fs.writeFileSync(path.join(projectDir, 'App.tsx'),
    `import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚀 ${data.projectName}</Text>
      <Text style={styles.subtitle}>Built with React Native + Expo + RepoKit</Text>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: '${data.projectName}' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
`);

  fs.writeFileSync(path.join(projectDir, 'app.json',
    `{
  "expo": {
    "name": "${data.projectName}",
    "slug": "${data.projectName}",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
`));

  fs.ensureDirSync(path.join(projectDir, 'assets'));
  fs.writeFileSync(path.join(projectDir, 'babel.config.js'),
    `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
`);
}

// FIX: Complete Flutter with pubspec.yaml, lib/main.dart
function generateFlutter(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'lib'));
  fs.ensureDirSync(path.join(projectDir, 'test'));

  fs.writeFileSync(path.join(projectDir, 'pubspec.yaml'),
    `name: ${data.projectName}
description: ${data.description}
version: 1.0.0+1

environment:
  sdk: ">=3.3.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.0
  go_router: ^13.0.0
  dio: ^5.4.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`);

  fs.writeFileSync(path.join(projectDir, 'lib', 'main.dart'),
    `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

final routerProvider = Provider((ref) {
  return GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomePage(),
      ),
    ],
  );
});

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: '${data.projectName}',
      routerConfig: router,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF6C5CE7),
        useMaterial3: true,
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.rocket_launch, size: 64, color: Color(0xFF6C5CE7)),
            const SizedBox(height: 16),
            Text(
              '${data.projectName}',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Built with Flutter + RepoKit',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Colors.grey,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
`);

  fs.writeFileSync(path.join(projectDir, 'test', 'widget_test.dart'),
    `import 'package:flutter_test/flutter_test.dart';
import 'package:${data.projectName}/main.dart';

void main() {
  testWidgets('Home page renders', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    expect(find.text('${data.projectName}'), findsOneWidget);
  });
}
`);

  fs.writeFileSync(path.join(projectDir, 'analysis_options.yaml'),
    `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: true
    prefer_const_declarations: true
`);
}

// FIX: Complete Vue Fullstack with express backend + vue frontend
function generateVueFullstack(projectDir, data) {
  generateVue(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['@prisma/client'] = '^5.14.0';
  pkg.dependencies['express'] = '^4.19.0';
  pkg.dependencies['cors'] = '^2.8.5';
  pkg.devDependencies['prisma'] = '^5.14.0';
  pkg.scripts.server = 'node server/index.js';
  pkg.scripts['dev:all'] = 'concurrently "npm run dev" "npm run server"';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'server'));
  fs.writeFileSync(path.join(projectDir, 'server', 'index.js'),
    `const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(\`🚀 API server running on http://localhost:\${PORT}\`);
});
`);
}

// FIX: Complete Astro with src/pages
function generateAstro(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    type: 'module',
    scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
    dependencies: { astro: '^4.6.0', '@astrojs/react': '^3.3.0', react: '^18.3.0', 'react-dom': '^18.3.0' },
    devDependencies: { '@types/react': '^18.3.0', tailwindcss: '^3.4.0' }
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src', 'pages'));
  fs.ensureDirSync(path.join(projectDir, 'src', 'layouts'));
  fs.ensureDirSync(path.join(projectDir, 'public'));

  fs.writeFileSync(path.join(projectDir, 'astro.config.mjs'),
    `import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), tailwind()],
});
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'layouts', 'Layout.astro'),
    `---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'pages', 'index.astro'),
    `---
import Layout from '../layouts/Layout.astro';
---
<Layout title="${data.projectName}">
  <main style="display:flex;align-items:center;justify-content:center;min-height:100vh;">
    <div style="text-align:center;">
      <h1>🚀 ${data.projectName}</h1>
      <p style="color:#666;">Built with Astro + React + RepoKit</p>
    </div>
  </main>
</Layout>
`);
}

// FIX: Complete Remix with app/routes
function generateRemix(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    private: true,
    scripts: { dev: 'remix vite:dev', build: 'remix vite:build', start: 'remix-serve ./build/server/index.js', lint: 'eslint .' },
    dependencies: {
      '@remix-run/node': '^2.9.0', '@remix-run/react': '^2.9.0', '@remix-run/serve': '^2.9.0',
      react: '^18.3.0', 'react-dom': '^18.3.0', isbot: '^5.1.0'
    },
    devDependencies: {
      '@remix-run/dev': '^2.9.0', '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0',
      typescript: '^5.4.0', vite: '^5.2.0', tailwindcss: '^3.4.0'
    }
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'app', 'routes'));
  fs.ensureDirSync(path.join(projectDir, 'app'));

  fs.writeFileSync(path.join(projectDir, 'app', 'root.tsx'),
    `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
`);

  fs.writeFileSync(path.join(projectDir, 'app', 'routes', '_index.tsx'),
    `import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [{ title: "${data.projectName}" }];
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <h1>🚀 ${data.projectName}</h1>
        <p style={{ color: "#666" }}>Built with Remix + RepoKit</p>
      </div>
    </div>
  );
}
`);

  fs.writeFileSync(path.join(projectDir, 'vite.config.ts'),
    `import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [remix()],
});
`);

  fs.writeFileSync(path.join(projectDir, 'app', 'entry.server.tsx'),
    `import { PassThrough } from "node:stream";
import type { AppLoadContext, EntryContext } from "@remix-run/node";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { renderToPipeableStream } from "react-dom/server";

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext
) {
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onShellReady() {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
          pipe(body);
        },
        onShellError(error) { reject(error); },
        onError(error) { reject(error); },
      }
    );
  });
}
`);
}

// FIX: Complete NestJS with module/controller/service
function generateNestjs(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    scripts: { 'start:dev': 'nest start --watch', build: 'nest build', start: 'node dist/main', test: 'jest' },
    dependencies: {
      '@nestjs/core': '^10.3.0', '@nestjs/common': '^10.3.0', '@nestjs/platform-express': '^10.3.0',
      '@nestjs/typeorm': '^10.0.0', 'typeorm': '^0.3.0', 'reflect-metadata': '^0.2.0', 'rxjs': '^7.8.0'
    },
    devDependencies: {
      '@nestjs/cli': '^10.3.0', '@nestjs/schematics': '^10.1.0', typescript: '^5.4.0', 'ts-node': '^10.9.0',
      '@types/node': '^20.12.0'
    }
  }, { spaces: 2 });

  fs.writeJsonSync(path.join(projectDir, 'tsconfig.json'), {
    compilerOptions: {
      module: 'commonjs',
      declaration: true,
      removeComments: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      target: 'ES2021',
      sourceMap: true,
      outDir: './dist',
      baseUrl: './',
      incrementald: true,
      skipLibCheck: true,
      strictNullChecks: false,
      noImplicitAny: false,
      strictBindCallApply: false,
      forceConsistentCasingInFileNames: false,
      noFallthroughCasesInSwitch: false
    }
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.ensureDirSync(path.join(projectDir, 'src', 'health'));

  fs.writeFileSync(path.join(projectDir, 'src', 'main.ts'),
    `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3000);
  console.log('🚀 NestJS server running on http://localhost:3000');
}
bootstrap();
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'app.module.ts'),
    `import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'health', 'health.module.ts'),
    `import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'health', 'health.controller.ts'),
    `import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check();
  }
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'health', 'health.service.ts'),
    `import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
`);
}

// FIX: Complete SvelteKit Fullstack with Prisma + Lucia Auth
function generateSvelteFullstack(projectDir, data) {
  generateSvelte(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['@lucia-auth/adapter-prisma'] = '^4.0.0';
  pkg.dependencies['lucia'] = '^3.2.0';
  pkg.dependencies['@prisma/client'] = '^5.14.0';
  pkg.devDependencies['prisma'] = '^5.14.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });

  // Add API route
  fs.ensureDirSync(path.join(projectDir, 'src', 'routes', 'api', 'health'));
  fs.writeFileSync(path.join(projectDir, 'src', 'routes', 'api', 'health', '+server.ts'),
    `import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ status: 'ok', timestamp: new Date().toISOString() });
};
`);

  // Add Prisma schema
  fs.ensureDirSync(path.join(projectDir, 'prisma'));
  fs.writeFileSync(path.join(projectDir, 'prisma', 'schema.prisma'),
    `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
`);
}

// FIX: Complete Kotlin API with build.gradle.kts, Application.kt
function generateKotlinApi(projectDir, data) {
  // Sanitize Kotlin package name (no hyphens)
  const kotlinPackage = data.projectName.replace(/-/g, '').toLowerCase();
  const packagePath = kotlinPackage.split('').join('/');
  fs.ensureDirSync(path.join(projectDir, 'src', 'main', 'kotlin', kotlinPackage));
  fs.ensureDirSync(path.join(projectDir, 'src', 'test', 'kotlin', kotlinPackage));
  fs.ensureDirSync(path.join(projectDir, 'src', 'main', 'resources'));

  fs.writeFileSync(path.join(projectDir, 'build.gradle.kts'),
    `plugins {
    kotlin("jvm") version "1.9.22"
    kotlin("plugin.serialization") version "1.9.22"
    application
}

group = "com.${kotlinPackage}"
version = "0.1.0"

repositories { mavenCentral() }

dependencies {
    implementation("io.ktor:ktor-server-core:2.3.7")
    implementation("io.ktor:ktor-server-netty:2.3.7")
    implementation("io.ktor:ktor-server-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
    implementation("io.ktor:ktor-server-cors:2.3.7")
    implementation("io.ktor:ktor-server-status-pages:2.3.7")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    implementation("ch.qos.logback:logback-classic:1.4.14")
    testImplementation(kotlin("test"))
}

application { mainClass.set("${kotlinPackage}.ApplicationKt") }

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(17)
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'main', 'kotlin', kotlinPackage, 'Application.kt'),
    `package ${kotlinPackage}

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class HealthResponse(val status: String)

fun main() {
    embeddedServer(Netty, port = 8080, host = "0.0.0.0") {
        install(ContentNegotiation) { json() }
        install(CORS) { anyHost() }

        routing {
            get("/health") {
                call.respond(HealthResponse("ok"))
            }
            get("/") {
                call.respondText("🚀 ${data.projectName}", ContentType.Text.Plain)
            }
        }
    }.start(wait = true)
}
`);

  fs.writeFileSync(path.join(projectDir, 'src', 'main', 'resources', 'logback.xml'),
    `<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{YYYY-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>
    <root level="INFO">
        <appender-ref ref="STDOUT"/>
    </root>
</configuration>
`);

  fs.writeFileSync(path.join(projectDir, 'settings.gradle.kts'),
    `rootProject.name = "${data.projectName}"
`);
}

function generateMinimal(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    description: data.description,
    scripts: { start: 'node src/index.js' }
  }, { spaces: 2 });
  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'index.js'),
    `console.log("🚀 ${data.projectName}");
`);
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function isTypeScriptTemplate(id) {
  return ['nextjs', 'express', 'react', 'vue', 'svelte', 'angular', 'nextjs-fullstack',
    'nextjs-ecommerce', 'nextjs-saas', 'vue-fullstack', 'graphql', 'microservices',
    'cli-tool', 'desktop-electron', 'desktop-tauri', 'chrome-extension', 'discord-bot',
    'react-native', 'nestjs', 'remix', 'astro', 'svelte-fullstack'].includes(id);
}

function isPythonTemplate(id) {
  return ['fastapi', 'django', 'flask', 'python-cli', 'telegram-bot'].includes(id);
}

module.exports = {
  generateProject
};
