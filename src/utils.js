'use strict';

const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const Handlebars = require('handlebars');

/**
 * Colored output helpers
 */
const log = {
  info: (msg) => console.log(chalk.cyan(msg)),
  success: (msg) => console.log(chalk.green(msg)),
  warn: (msg) => console.log(chalk.yellow(msg)),
  error: (msg) => console.log(chalk.red(msg)),
  dim: (msg) => console.log(chalk.gray(msg)),
  bold: (msg) => console.log(chalk.bold(msg)),
  header: (msg) => console.log('\n' + chalk.bold.cyan(msg) + '\n')
};

/**
 * Print the RepoKit banner
 */
function printBanner() {
  console.log(
    chalk.bold.cyan(`
  ╔══════════════════════════════════════╗
  ║   🚀 RepoKit                         ║
  ║   One command → full project          ║
  ║   in 2 minutes                        ║
  ╚══════════════════════════════════════╝
  `)
  );
}

/**
 * Print completion message with next steps
 */
function printCompletion(projectName, template) {
  console.log();
  log.success('✅ Project created successfully!');
  console.log();
  log.bold('Next steps:');
  console.log(chalk.cyan(`  cd ${projectName}`));

  if (template === 'fastapi' || template === 'flask' || template === 'django') {
    console.log(chalk.cyan('  python -m venv venv'));
    console.log(chalk.cyan('  source venv/bin/activate  # or venv\\Scripts\\activate on Windows'));
    console.log(chalk.cyan('  pip install -r requirements.txt'));
  } else if (template === 'go-api') {
    console.log(chalk.cyan('  go mod tidy'));
    console.log(chalk.cyan('  go run cmd/server/main.go'));
  } else if (template === 'rust-api') {
    console.log(chalk.cyan('  cargo run'));
  } else if (template === 'flutter') {
    console.log(chalk.cyan('  flutter pub get'));
    console.log(chalk.cyan('  flutter run'));
  } else if (template === 'laravel') {
    console.log(chalk.cyan('  composer install'));
    console.log(chalk.cyan('  cp .env.example .env'));
    console.log(chalk.cyan('  php artisan key:generate'));
  } else if (template === 'spring-boot') {
    console.log(chalk.cyan('  ./gradlew bootRun'));
  } else if (template === 'rails') {
    console.log(chalk.cyan('  bundle install'));
    console.log(chalk.cyan('  rails db:setup'));
  } else {
    console.log(chalk.cyan('  npm install'));
    console.log(chalk.cyan('  npm run dev'));
  }

  console.log();
  log.dim('Created with RepoKit — https://github.com/sochiautoparts/repokit');
  console.log();
}

/**
 * Compile a Handlebars template string with data
 */
function compileTemplate(templateStr, data) {
  const compiled = Handlebars.compile(templateStr);
  return compiled(data);
}

/**
 * Compile a Handlebars template file with data
 */
function compileTemplateFile(filePath, data) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return compileTemplate(content, data);
}

/**
 * Process a directory of .hbs template files
 */
function processTemplateDir(templateDir, outputDir, data) {
  if (!fs.existsSync(templateDir)) {
    return;
  }

  const entries = fs.readdirSync(templateDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(templateDir, entry.name);

    if (entry.isDirectory()) {
      const subOutput = path.join(outputDir, entry.name);
      fs.ensureDirSync(subOutput);
      processTemplateDir(srcPath, subOutput, data);
    } else if (entry.name.endsWith('.hbs')) {
      // Remove .hbs extension for output
      const outName = entry.name.replace(/\.hbs$/, '');
      const outPath = path.join(outputDir, outName);
      fs.ensureDirSync(path.dirname(outPath));
      const result = compileTemplateFile(srcPath, data);
      fs.writeFileSync(outPath, result, 'utf-8');
    } else {
      // Copy non-template files as-is
      const outPath = path.join(outputDir, entry.name);
      fs.ensureDirSync(path.dirname(outPath));
      fs.copySync(srcPath, outPath);
    }
  }
}

/**
 * Slugify a project name
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'my-project';
}

/**
 * Validate project name
 */
function isValidProjectName(name) {
  if (!name || typeof name !== 'string') return false;
  // npm package name rules
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slugify(name));
}

/**
 * Check if directory exists and is not empty
 */
function isDirectoryEmpty(dirPath) {
  if (!fs.existsSync(dirPath)) return true;
  const files = fs.readdirSync(dirPath);
  return files.length === 0;
}

/**
 * Create .gitignore based on template type
 */
function generateGitignore(templateId) {
  const common = [
    'node_modules/',
    'dist/',
    'build/',
    '.env',
    '.env.local',
    '.env.*.local',
    '*.log',
    '.DS_Store',
    'Thumbs.db',
    '.idea/',
    '.vscode/',
    '*.swp',
    '*.swo'
  ];

  const specific = {
    nextjs: ['.next/', 'out/'],
    express: ['coverage/'],
    react: ['coverage/'],
    fastapi: ['__pycache__/', '*.py[cod]', '*.egg-info/', '.venv/', 'venv/', '.pytest_cache/'],
    vue: ['coverage/'],
    django: ['__pycache__/', '*.py[cod]', '*.egg-info/', '.venv/', 'venv/', 'db.sqlite3', 'media/', '.pytest_cache/'],
    flask: ['__pycache__/', '*.py[cod]', '*.egg-info/', '.venv/', 'venv/', 'instance/', '.pytest_cache/'],
    'go-api': ['*.exe', '*.exe~', '*.dll', '*.so', '*.dylib', 'vendor/'],
    'rust-api': ['target/', 'Cargo.lock'],
    flutter: ['.dart_tool/', '.flutter-plugins', '.flutter-plugins-dependencies', '.packages', 'build/'],
    laravel: ['vendor/', 'storage/', 'bootstrap/cache/'],
    'spring-boot': ['.gradle/', 'build/', '!gradle/wrapper/gradle-wrapper.jar'],
    rails: ['log/', 'tmp/', 'storage/', '.bundle/', 'vendor/bundle/']
  };

  const extras = specific[templateId] || [];
  return [...common, ...extras].join('\n') + '\n';
}

/**
 * Generate Dockerfile content
 */
function generateDockerfile(templateId, projectName) {
  const dockerfiles = {
    nextjs: `FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`,
    express: `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/index.js"]
`,
    react: `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
    fastapi: `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
    vue: `FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
    'go-api': `FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /server cmd/server/main.go

FROM alpine:3.19
COPY --from=build /server /server
EXPOSE 8080
CMD ["/server"]
`,
    'rust-api': `FROM rust:1.77-alpine AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY src/ src/
RUN cargo build --release

FROM alpine:3.19
COPY --from=build /app/target/release/${projectName} /server
EXPOSE 8080
CMD ["/server"]
`
  };

  return dockerfiles[templateId] || `# Dockerfile for ${projectName}
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]
`;
}

/**
 * Generate docker-compose.yml
 */
function generateDockerCompose(projectName, database) {
  const services = {
    app: {
      build: '.',
      ports: ['3000:3000'],
      environment: [`DATABASE_URL=${getDatabaseUrl(database)}`],
      depends_on: database !== 'none' ? ['db'] : []
    }
  };

  if (database === 'postgresql') {
    services.db = {
      image: 'postgres:16-alpine',
      // FIX: Use env vars with secure defaults instead of hardcoded passwords
      environment: ['POSTGRES_USER=postgres', 'POSTGRES_PASSWORD=${DB_PASSWORD:-changeme}', 'POSTGRES_DB=' + projectName],
      ports: ['5432:5432'],
      volumes: ['pgdata:/var/lib/postgresql/data']
    };
    services.volumes = { pgdata: {} };
  } else if (database === 'mongodb') {
    services.db = {
      image: 'mongo:7',
      ports: ['27017:27017'],
      volumes: ['mongodata:/data/db']
    };
    services.volumes = { mongodata: {} };
  } else if (database === 'mysql') {
    services.db = {
      image: 'mysql:8',
      // FIX: Use env vars instead of hardcoded root/root
      environment: ['MYSQL_ROOT_PASSWORD=${DB_PASSWORD:-changeme}', `MYSQL_DATABASE=${projectName}`],
      ports: ['3306:3306'],
      volumes: ['mysqldata:/var/lib/mysql']
    };
    services.volumes = { mysqldata: {} };
  } else if (database === 'redis') {
    services.redis = {
      image: 'redis:7-alpine',
      ports: ['6379:6379']
    };
  }

  // Convert to YAML string
  let yaml = 'version: "3.8"\n\nservices:\n';

  for (const [name, config] of Object.entries(services)) {
    if (name === 'volumes') continue;
    yaml += `  ${name}:\n`;
    yaml += `    build: .\n`;
    if (config.ports) {
      yaml += `    ports:\n`;
      config.ports.forEach(p => { yaml += `      - "${p}"\n`; });
    }
    if (config.environment) {
      yaml += `    environment:\n`;
      config.environment.forEach(e => { yaml += `      - ${e}\n`; });
    }
    if (config.depends_on && config.depends_on.length) {
      yaml += `    depends_on:\n`;
      config.depends_on.forEach(d => { yaml += `      - ${d}\n`; });
    }
    if (config.image) {
      yaml = yaml.replace('    build: .\n', `    image: ${config.image}\n`);
    }
    if (config.volumes) {
      yaml += `    volumes:\n`;
      config.volumes.forEach(v => { yaml += `      - ${v}\n`; });
    }
    yaml += '\n';
  }

  if (services.volumes) {
    yaml += 'volumes:\n';
    for (const name of Object.keys(services.volumes)) {
      yaml += `  ${name}:\n`;
    }
  }

  return yaml;
}

/**
 * Get database URL for a database type
 */
function getDatabaseUrl(database) {
  const urls = {
    none: '',
    // FIX: Use changeme placeholder instead of hardcoded passwords
    postgresql: 'postgresql://postgres:changeme@localhost:5432/mydb',
    mongodb: 'mongodb://localhost:27017/mydb',
    mysql: 'mysql://root:changeme@localhost:3306/mydb',
    sqlite: 'file:./dev.db',
    redis: 'redis://localhost:6379'
  };
  return urls[database] || '';
}

/**
 * Generate CI/CD configuration
 */
function generateCIConfig(provider, templateId) {
  if (provider === 'GitHub Actions') {
    const isNode = ['nextjs', 'express', 'react', 'vue', 'svelte', 'angular', 'graphql', 'microservices', 'cli-tool', 'nestjs', 'remix', 'astro', 'desktop-electron', 'chrome-extension', 'discord-bot'].includes(templateId);
    const isPython = ['fastapi', 'django', 'flask', 'python-cli', 'telegram-bot'].includes(templateId);
    const isGo = templateId === 'go-api';
    const isRust = templateId === 'rust-api';

    if (isNode) {
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
      - run: npm run lint
`;
    }

    if (isPython) {
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
      - run: pip install -r requirements.txt
      - run: pytest
`;
    }

    if (isGo) {
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go test ./...
      - run: go vet ./...
`;
    }

    if (isRust) {
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test
      - run: cargo clippy -- -D warnings
`;
    }

    return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Add your CI steps here"
`;
  }

  if (provider === 'GitLab CI') {
    return `stages:
  - test
  - deploy

test:
  stage: test
  image: node:20-alpine
  script:
    - npm ci
    - npm test
  only:
    - main
    - merge_requests

deploy:
  stage: deploy
  script:
    - echo "Add deployment steps"
  only:
    - main
`;
  }

  return '';
}

/**
 * Generate README with RepoKit badge
 */
function generateReadme(projectName, description, templateId) {
  return `# ${projectName}

${description || 'A new project'}

[![Created with RepoKit](https://img.shields.io/badge/Created%20with-RepoKit-blue?style=flat-square)](https://github.com/sochiautoparts/repokit)

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Project Structure

\`\`\`
${projectName}/
├── src/
├── tests/
├── package.json
└── README.md
\`\`\`

## Scripts

- \`npm run dev\` — Start development server
- \`npm run build\` — Build for production
- \`npm run test\` — Run tests
- \`npm run lint\` — Lint code

---

*Created with [RepoKit](https://github.com/sochiautoparts/repokit) 🚀*
`;
}

module.exports = {
  log,
  printBanner,
  printCompletion,
  compileTemplate,
  compileTemplateFile,
  processTemplateDir,
  slugify,
  isValidProjectName,
  isDirectoryEmpty,
  generateGitignore,
  generateDockerfile,
  generateDockerCompose,
  generateCIConfig,
  generateReadme,
  getDatabaseUrl
};
