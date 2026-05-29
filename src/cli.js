'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');

const templates = require('./templates');
const license = require('./license');
const generator = require('./generator');
const utils = require('./utils');

/**
 * Main CLI entry point
 */
async function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle subcommands
  if (command === 'activate') {
    const key = args[1];
    await license.activateLicense(key);
    return;
  }

  if (command === 'deactivate') {
    license.deactivateLicense();
    return;
  }

  if (command === 'status') {
    await license.showStatus();
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    showHelp();
    return;
  }

  if (command === '--version' || command === '-v') {
    showVersion();
    return;
  }

  // Default: create project
  await createProject(args);
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
${chalk.bold.cyan('🚀 RepoKit')} — One command → full project in 2 minutes

${chalk.bold('USAGE')}
  npx repokit create          Interactive project creation
  npx repokit                 Same as create (alias)
  npx repokit activate <key>  Activate Pro license
  npx repokit deactivate      Remove Pro license
  npx repokit status          Show license status
  npx repokit --help          Show this help
  npx repokit --version       Show version

${chalk.bold('EXAMPLES')}
  npx repokit create
  npx repokit activate SP-RPK-ABCD-1234
  npx repokit status

${chalk.bold('FREE TEMPLATES')}
  nextjs     Next.js App Router + TypeScript
  express    Express.js + TypeScript
  react      React + Vite + TypeScript
  fastapi    FastAPI + Python
  vue        Vue 3 + Vite

${chalk.bold('PRO TEMPLATES')} (25+)
  Unlock all templates with: npx repokit activate <key>
  Get a key: https://t.me/allstarspay_bot?start=buy_repokit_month
`);
}

/**
 * Show version
 */
function showVersion() {
  const pkg = require('../package.json');
  console.log(`repokit v${pkg.version}`);
}

/**
 * Create a project interactively
 */
async function createProject(args) {
  utils.printBanner();

  // Check if 'create' was passed as command
  const effectiveArgs = args[0] === 'create' ? args.slice(1) : args;

  // Parse any pre-provided arguments
  const preConfig = parseArgs(effectiveArgs);

  // Check Pro status
  const proStatus = await license.checkProAccess();

  // Prompt for project configuration
  const answers = await promptForConfig(preConfig, proStatus);

  // Generate project
  const spinner = ora('Generating project...').start();

  try {
    const projectDir = await generator.generateProject({
      templateId: answers.template,
      projectName: answers.projectName,
      database: answers.database,
      orm: answers.orm,
      auth: answers.auth,
      deploy: answers.deploy,
      cicd: answers.cicd,
      description: answers.description || ''
    });

    spinner.succeed(chalk.green('Project generated successfully!'));
    utils.printCompletion(answers.projectName, answers.template);
  } catch (error) {
    spinner.fail(chalk.red('Failed to generate project'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

/**
 * Parse CLI arguments for non-interactive mode
 */
function parseArgs(args) {
  const config = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template' || args[i] === '-t') {
      config.template = args[++i];
    } else if (args[i] === '--name' || args[i] === '-n') {
      config.projectName = args[++i];
    } else if (args[i] === '--database' || args[i] === '-d') {
      config.database = args[++i];
    } else if (args[i] === '--orm') {
      config.orm = args[++i];
    } else if (args[i] === '--auth') {
      config.auth = args[++i];
    } else if (args[i] === '--deploy') {
      config.deploy = args[++i];
    } else if (args[i] === '--ci') {
      config.cicd = args[++i];
    } else if (args[i] === '--yes' || args[i] === '-y') {
      config.useDefaults = true;
    }
  }
  return config;
}

/**
 * Prompt user for project configuration
 */
async function promptForConfig(preConfig, proStatus) {
  // If template is already provided via CLI args, skip category prompt
  let templateId = preConfig.template;

  if (!templateId) {
    // 1. Project type — only prompt if template not already chosen
    const categories = templates.getCategories();

    const categoryAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'category',
        message: 'What type of project?',
        choices: [
          ...categories.map(c => ({ name: getCategoryEmoji(c) + ' ' + c, value: c })),
          new inquirer.Separator(),
          { name: '🎯 All Templates', value: 'all' }
        ]
      }
    ]);
    const category = categoryAnswer.category;

    // 2. Choose template
    let availableTemplates;
    if (category === 'all') {
      availableTemplates = templates.TEMPLATES;
    } else {
      availableTemplates = templates.getByCategory(category);
    }

    // Filter out Pro templates if user doesn't have Pro
    const templateChoices = availableTemplates.map(t => ({
      name: t.pro
        ? `${chalk.yellow('⭐ PRO')} ${t.name} — ${t.description}`
        : `${chalk.green('🆓 FREE')} ${t.name} — ${t.description}`,
      value: t.id,
      disabled: t.pro && !proStatus.pro ? chalk.gray('Requires Pro license') : false
    }));

    const templateAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Choose a template:',
        choices: templateChoices,
        pageSize: 15
      }
    ]);
    templateId = templateAnswer.template;
  }

  // Verify Pro access for Pro templates
  const selectedTemplate = templates.getById(templateId);
  if (selectedTemplate && selectedTemplate.pro && !proStatus.pro) {
    console.log();
    console.log(chalk.yellow('⭐ This template requires a Pro license!'));
    console.log(chalk.gray('   Get one at: https://t.me/allstarspay_bot?start=buy_repokit_month'));
    console.log(chalk.gray('   Activate with: repokit activate SP-RPK-XXXX-XXXX'));
    console.log();

    // If running non-interactively (stdin is not a TTY), exit with error
    if (!process.stdin.isTTY) {
      console.log(chalk.red('❌ Cannot proceed: Pro template selected without a valid license in non-interactive mode.'));
      process.exit(1);
    }

    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enterKey',
        message: 'Do you have a license key to enter now?',
        default: false
      }
    ]);

    if (answer.enterKey) {
      const keyAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'key',
          message: 'Enter your license key (SP-RPK-XXXX-XXXX):',
          validate: (input) => license.isValidKeyFormat(input) || 'Invalid key format. Expected: SP-RPK-XXXX-XXXX'
        }
      ]);

      const result = await license.activateLicense(keyAnswer.key);
      if (!result) {
        console.log(chalk.red('\n❌ License activation failed. Choosing a free template instead.\n'));
        const freeTemplates = templates.getFreeTemplates();
        const freeChoices = freeTemplates.map(t => ({
          name: `${chalk.green('🆓 FREE')} ${t.name} — ${t.description}`,
          value: t.id
        }));
        const freeAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'template',
            message: 'Choose a free template:',
            choices: freeChoices
          }
        ]);
        templateId = freeAnswer.template;
      }
    } else {
      const freeTemplates = templates.getFreeTemplates();
      const freeChoices = freeTemplates.map(t => ({
        name: `${chalk.green('🆓 FREE')} ${t.name} — ${t.description}`,
        value: t.id
      }));
      const freeAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'template',
          message: 'Choose a free template:',
          choices: freeChoices
        }
      ]);
      templateId = freeAnswer.template;
    }
  }

  // 3. Project name
  let projectName = preConfig.projectName;
  if (!projectName) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name?',
        default: 'my-project',
        validate: (input) => {
          if (!input.trim()) return 'Project name is required';
          if (!utils.isValidProjectName(input)) return 'Use lowercase letters, numbers, and hyphens only';
          return true;
        },
        filter: (input) => utils.slugify(input)
      }
    ]);
    projectName = answer.projectName;
  } else {
    projectName = utils.slugify(projectName);
  }

  // 4. Database
  let database = preConfig.database;
  if (!database) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'database',
        message: 'Choose database?',
        choices: [
          { name: 'None', value: 'none' },
          { name: '🐘 PostgreSQL', value: 'postgresql' },
          { name: '🍃 MongoDB', value: 'mongodb' },
          { name: '🐬 MySQL', value: 'mysql' },
          { name: '📄 SQLite', value: 'sqlite' },
          { name: '🔴 Redis', value: 'redis' }
        ]
      }
    ]);
    database = answer.database;
  }

  // 5. ORM
  let orm = preConfig.orm;
  if (!orm) {
    const ormChoices = getOrmChoices(database, templateId);
    if (ormChoices.length > 1) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'orm',
          message: 'Choose ORM?',
          choices: ormChoices
        }
      ]);
      orm = answer.orm;
    } else {
      orm = ormChoices[0]?.value || 'none';
    }
  }

  // 6. Authentication
  let auth = preConfig.auth;
  if (!auth) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'auth',
        message: 'Add authentication?',
        choices: [
          { name: 'None', value: 'none' },
          { name: '🔑 JWT', value: 'JWT' },
          { name: '🔐 OAuth2', value: 'OAuth2' },
          { name: '🔥 Firebase Auth', value: 'Firebase Auth' }
        ]
      }
    ]);
    auth = answer.auth;
  }

  // 7. Deploy target
  let deploy = preConfig.deploy;
  if (!deploy) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'deploy',
        message: 'Deploy target?',
        choices: [
          { name: '🐳 Docker', value: 'Docker' },
          { name: '▲ Vercel', value: 'Vercel' },
          { name: '🚂 Railway', value: 'Railway' },
          { name: '☁️  AWS', value: 'AWS' },
          { name: '🌐 GCP', value: 'GCP' },
          { name: 'None', value: 'None' }
        ]
      }
    ]);
    deploy = answer.deploy;
  }

  // 8. CI/CD
  let cicd = preConfig.cicd;
  if (!cicd) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'cicd',
        message: 'Include CI/CD?',
        choices: [
          { name: 'GitHub Actions', value: 'GitHub Actions' },
          { name: 'GitLab CI', value: 'GitLab CI' },
          { name: 'None', value: 'None' }
        ]
      }
    ]);
    cicd = answer.cicd;
  }

  return {
    template: templateId,
    projectName,
    database,
    orm,
    auth,
    deploy,
    cicd
  };
}

/**
 * Get ORM choices based on database and template
 */
function getOrmChoices(database, templateId) {
  const choices = [{ name: 'None', value: 'none' }];

  if (database === 'none') return choices;

  const isPython = ['fastapi', 'django', 'flask', 'telegram-bot'].includes(templateId);
  const isGo = templateId === 'go-api';
  const isRust = templateId === 'rust-api';
  const isJava = templateId === 'spring-boot';

  if (isPython) {
    choices.push({ name: '🐍 SQLAlchemy', value: 'SQLAlchemy' });
    return choices;
  }

  if (isGo) {
    choices.push({ name: 'GORM', value: 'GORM' });
    return choices;
  }

  if (isRust) {
    choices.push({ name: 'Diesel', value: 'Diesel' });
    return choices;
  }

  if (isJava) {
    choices.push({ name: 'JPA/Hibernate', value: 'JPA' });
    return choices;
  }

  // JS/TS templates
  choices.push({ name: '🔺 Prisma', value: 'Prisma' });
  choices.push({ name: '📚 Sequelize', value: 'Sequelize' });
  choices.push({ name: '🏛️ TypeORM', value: 'TypeORM' });

  return choices;
}

/**
 * Get emoji for category
 */
function getCategoryEmoji(category) {
  const emojis = {
    Frontend: '🎨',
    Backend: '⚙️',
    Fullstack: '🌐',
    Mobile: '📱',
    'CLI/Tool': '🔧'
  };
  return emojis[category] || '📦';
}

module.exports = { run };
