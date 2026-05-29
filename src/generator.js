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

  // Try to use template files from templates/ directory
  const templateDir = templates.getTemplateDir(templateId);

  if (fs.existsSync(templateDir) && fs.readdirSync(templateDir).length > 0) {
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
  // package.json
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

  // tsconfig.json
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

  // next.config.js
  fs.writeFileSync(path.join(projectDir, 'next.config.js'),
    `/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
`);

  // tailwind.config.ts
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

  // postcss.config.js
  fs.writeFileSync(path.join(projectDir, 'postcss.config.js'),
    `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

  // src/app/layout.tsx
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

  // src/app/page.tsx
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

  // src/app/globals.css
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

  // .eslintrc.json
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

  // tsconfig.json
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

  // src/index.ts
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

  // src/routes/health.ts
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

  // src/middleware/errorHandler.ts
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

  // tests/index.test.ts
  fs.ensureDirSync(path.join(projectDir, 'tests'));
  fs.writeFileSync(path.join(projectDir, 'tests', 'health.test.ts'),
    `import request from 'supertest';

describe('Health endpoint', () => {
  it('should return ok status', async () => {
    // Add your test here
    expect(true).toBe(true);
  });
});
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

  // tsconfig.json
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

  // tsconfig.node.json
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

  // vite.config.ts
  fs.writeFileSync(path.join(projectDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`);

  // tailwind.config.js
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

  // postcss.config.js
  fs.writeFileSync(path.join(projectDir, 'postcss.config.js'),
    `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

  // index.html
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

  // src/main.tsx
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

  // src/App.tsx
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

  // src/index.css
  fs.writeFileSync(path.join(projectDir, 'src', 'index.css'),
    `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}
`);

  // src/vite-env.d.ts
  fs.writeFileSync(path.join(projectDir, 'src', 'vite-env.d.ts'),
    `/// <reference types="vite/client" />
`);
}

function generateFastapi(projectDir, data) {
  // requirements.txt
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'),
    `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
pydantic>=2.6.0
python-dotenv>=1.0.0
httpx>=0.27.0
pytest>=8.1.0
`);

  // pyproject.toml
  fs.writeFileSync(path.join(projectDir, 'pyproject.toml'),
    `[project]
name = "${data.projectName}"
version = "0.1.0"
description = "${data.description}"
requires-python = ">=3.10"

[tool.pytest.ini_options]
testpaths = ["tests"]
`);

  // app/main.py
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

  // app/routers/health.py
  fs.ensureDirSync(path.join(projectDir, 'app', 'routers'));
  fs.writeFileSync(path.join(projectDir, 'app', 'routers', '__init__.py'), '');
  fs.writeFileSync(path.join(projectDir, 'app', 'routers', 'health.py'),
    `from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok"}
`);

  // tests
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

  // tsconfig.json
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

  // tsconfig.node.json
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

  // vite.config.ts
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

  // index.html
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

  // src/main.ts
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

  // src/App.vue
  fs.writeFileSync(path.join(projectDir, 'src', 'App.vue'),
    `<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>
`);

  // src/views/HomeView.vue
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

  // src/router/index.ts
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

  // src/assets/main.css
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

  // src/vite-env.d.ts
  fs.writeFileSync(path.join(projectDir, 'src', 'vite-env.d.ts'),
    `/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
`);

  // tailwind.config.js
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

  // postcss.config.js
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
// PRO TEMPLATE GENERATORS (scaffolding)
// ═══════════════════════════════════════════

function generateNextjsFullstack(projectDir, data) {
  generateNextjs(projectDir, data);
  // Add Prisma
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['@prisma/client'] = '^5.14.0';
  pkg.dependencies['next-auth'] = '^4.24.0';
  pkg.devDependencies['prisma'] = '^5.14.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });
  // Add prisma schema
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
  // Add auth route
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
  // Add product model to prisma schema
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
  // Add subscription model
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
      tailwindcss: '^3.4.0'
    }
  }, { spaces: 2 });

  fs.ensureDirSync(path.join(projectDir, 'src', 'routes'));
  fs.writeFileSync(path.join(projectDir, 'src', 'routes', '+page.svelte'),
    `<h1 class="text-4xl font-bold">🚀 ${data.projectName}</h1>
<p class="text-xl text-gray-500">Built with SvelteKit + RepoKit</p>
`);
  fs.writeFileSync(path.join(projectDir, 'svelte.config.js'),
    `import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter()
  }
};

export default config;
`);
}

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
      typescript: '^5.4.0'
    }
  }, { spaces: 2 });
}

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
  fs.writeFileSync(path.join(projectDir, 'manage.py'),
    `#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
`);
}

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
  fs.writeFileSync(path.join(projectDir, 'config.py'),
    `import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key')
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

function generateSpringBoot(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'src', 'main', 'java', 'com', data.projectName, 'controller'));
  fs.ensureDirSync(path.join(projectDir, 'src', 'main', 'resources'));
  fs.ensureDirSync(path.join(projectDir, 'src', 'test', 'java', 'com', data.projectName));

  fs.writeFileSync(path.join(projectDir, 'build.gradle'),
    `plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0'
    id 'io.spring.dependency-management' version '1.1.0'
}

group = 'com.${data.projectName}'
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

  fs.writeFileSync(path.join(projectDir, 'src', 'main', 'resources', 'application.yml'),
    `server:
  port: 8080

spring:
  datasource:
    url: \${DATABASE_URL:jdbc:postgresql://localhost:5432/${data.projectName}}
    username: postgres
    password: postgres
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
`);
}

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
)
`);

  fs.writeFileSync(path.join(projectDir, 'cmd', 'server', 'main.go'),
    `package main

import (
    "log"
    "net/http"

    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()

    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "status": "ok",
        })
    })

    log.Println("🚀 Server starting on :8080")
    if err := r.Run(":8080"); err != nil {
        log.Fatal(err)
    }
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
use serde::Serialize;

#[derive(Serialize)]
struct HealthResponse {
    status: String,
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
    })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::init();
    
    println!("🚀 Server starting on http://0.0.0.0:8080");
    
    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
`);
}

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
        'post-autoload-dump': ['Illuminate\\Foundation\\ComposerScripts::postAutoloadDump']
      }
    }, null, 2)
  );
  fs.ensureDirSync(path.join(projectDir, 'app', 'Http', 'Controllers'));
  fs.ensureDirSync(path.join(projectDir, 'routes'));
  fs.writeFileSync(path.join(projectDir, 'README.md'),
    `# ${data.projectName}\n\nLaravel project scaffolded with RepoKit.\n\nRun \`composer install\` and \`php artisan serve\` to get started.\n`);
}

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
}

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
}

function generateMicroservices(projectDir, data) {
  // Create gateway service
  const services = ['api-gateway', 'user-service', 'product-service'];
  for (const svc of services) {
    const svcDir = path.join(projectDir, 'services', svc);
    fs.ensureDirSync(svcDir);
    fs.writeJsonSync(path.join(svcDir, 'package.json'), {
      name: `${data.projectName}-${svc}`,
      version: '1.0.0',
      scripts: { start: 'node src/index.js' },
      dependencies: { express: '^4.19.0' }
    }, { spaces: 2 });
  }
  fs.writeFileSync(path.join(projectDir, 'docker-compose.yml'),
    `version: "3.8"
services:
  api-gateway:
    build: ./services/api-gateway
    ports:
      - "3000:3000"
  user-service:
    build: ./services/user-service
    ports:
      - "3001:3001"
  product-service:
    build: ./services/product-service
    ports:
      - "3002:3002"
`);
}

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
}

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
dependencies = ["click>=8.1", "rich>=13.7"]

[project.scripts]
${data.projectName} = "src.cli:main"
`);
}

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
  fs.writeFileSync(path.join(projectDir, 'main.js'),
    `const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: true }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
`);
}

function generateDesktopTauri(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    scripts: { dev: 'tauri dev', build: 'tauri build' }
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
`);
}

function generateChromeExtension(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeJsonSync(path.join(projectDir, 'manifest.json'), {
    manifest_version: 3,
    name: data.projectName,
    version: '1.0.0',
    description: data.description,
    action: { default_popup: 'popup.html' },
    permissions: ['storage']
  }, { spaces: 2 });
  fs.writeFileSync(path.join(projectDir, 'popup.html'),
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{width:300px;padding:10px;font-family:sans-serif;}</style></head>
<body><h1>🚀 ${data.projectName}</h1><p>Chrome Extension by RepoKit</p></body></html>
`);
}

function generateDiscordBot(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    scripts: { dev: 'ts-node-dev --respawn src/index.ts', build: 'tsc', start: 'node dist/index.js' },
    dependencies: { 'discord.js': '^14.14.0', dotenv: '^16.4.0' },
    devDependencies: { typescript: '^5.4.0', '@types/node': '^20.12.0', 'ts-node-dev': '^2.0.0' }
  }, { spaces: 2 });
  fs.ensureDirSync(path.join(projectDir, 'src'));
  fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'),
    `import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(\`🤖 Bot online as \${client.user?.tag}\`);
});

client.login(process.env.DISCORD_TOKEN);
`);
}

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
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command

BOT_TOKEN = os.getenv("BOT_TOKEN", "")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer("🤖 Hello! I am your bot.")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
`);
}

function generateWordpress(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'includes'));
  fs.ensureDirSync(path.join(projectDir, 'assets'));
  fs.writeFileSync(path.join(projectDir, `${data.projectName}.php`),
    `<?php
/**
 * Plugin Name: ${data.projectName}
 * Description: ${data.description}
 * Version: 1.0.0
 * Author: Developer
 */

if (!defined('ABSPATH')) exit;

define('${data.projectName.toUpperCase().replace(/-/g, '_')}_VERSION', '1.0.0');

require_once plugin_dir_path(__FILE__) . 'includes/class-plugin.php';
`);
}

function generateReactNative(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '1.0.0',
    scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios' },
    dependencies: {
      expo: '~50.0.0',
      'expo-status-bar': '~1.11.0',
      react: '18.2.0',
      'react-native': '0.73.0',
      '@react-navigation/native': '^6.1.0',
      '@react-navigation/native-stack': '^6.9.0'
    },
    devDependencies: {
      '@babel/core': '^7.24.0',
      typescript: '^5.4.0'
    }
  }, { spaces: 2 });
  fs.ensureDirSync(path.join(projectDir, 'App'));
  fs.writeFileSync(path.join(projectDir, 'App.tsx'),
    `import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>🚀 ${data.projectName}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
`);
}

function generateFlutter(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'lib'));
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

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${data.projectName}',
      home: const HomePage(),
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
            const Text('🚀', style: TextStyle(fontSize: 48)),
            Text('${data.projectName}', style: Theme.of(context).textTheme.headlineMedium),
          ],
        ),
      ),
    );
  }
}
`);
}

function generateVueFullstack(projectDir, data) {
  generateVue(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['@prisma/client'] = '^5.14.0';
  pkg.devDependencies['prisma'] = '^5.14.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });
}

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
  fs.writeFileSync(path.join(projectDir, 'src', 'pages', 'index.astro'),
    `---
const title = "${data.projectName}";
---
<html>
<head><title>{title}</title></head>
<body>
  <h1>🚀 {title}</h1>
  <p>Built with Astro + RepoKit</p>
</body>
</html>
`);
}

function generateRemix(projectDir, data) {
  fs.writeJsonSync(path.join(projectDir, 'package.json'), {
    name: data.projectName,
    version: '0.1.0',
    private: true,
    scripts: { dev: 'remix vite:dev', build: 'remix vite:build', start: 'remix-serve ./build/server/index.js' },
    dependencies: {
      '@remix-run/node': '^2.9.0', '@remix-run/react': '^2.9.0', '@remix-run/serve': '^2.9.0',
      react: '^18.3.0', 'react-dom': '^18.3.0', isbot: '^5.1.0'
    },
    devDependencies: {
      '@remix-run/dev': '^2.9.0', typescript: '^5.4.0', vite: '^5.2.0', tailwindcss: '^3.4.0'
    }
  }, { spaces: 2 });
}

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
      '@nestjs/cli': '^10.3.0', '@nestjs/schematics': '^10.1.0', typescript: '^5.4.0', 'ts-node': '^10.9.0'
    }
  }, { spaces: 2 });
}

function generateSvelteFullstack(projectDir, data) {
  generateSvelte(projectDir, data);
  const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'));
  pkg.dependencies['@lucia-auth/adapter-prisma'] = '^4.0.0';
  pkg.devDependencies['prisma'] = '^5.14.0';
  fs.writeJsonSync(path.join(projectDir, 'package.json'), pkg, { spaces: 2 });
}

function generateKotlinApi(projectDir, data) {
  fs.ensureDirSync(path.join(projectDir, 'src', 'main', 'kotlin', data.projectName));
  fs.ensureDirSync(path.join(projectDir, 'src', 'test', 'kotlin', data.projectName));
  fs.writeFileSync(path.join(projectDir, 'build.gradle.kts'),
    `plugins {
    kotlin("jvm") version "1.9.22"
    application
}

group = "com.${data.projectName}"
version = "0.1.0"

repositories { mavenCentral() }

dependencies {
    implementation("io.ktor:ktor-server-core:2.3.7")
    implementation("io.ktor:ktor-server-netty:2.3.7")
    implementation("io.ktor:ktor-server-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
    testImplementation(kotlin("test"))
}

application { mainClass.set("ApplicationKt") }
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
