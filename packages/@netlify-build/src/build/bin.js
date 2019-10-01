#!/usr/bin/env node
require('./colors')
const chalk = require('chalk')
const { getConfigPath } = require('@netlify/config')
const minimist = require('minimist')

const cleanStack = require('../utils/clean-stack')

const build = require('./main')

const args = minimist(process.argv.slice(2))

async function execBuild() {
  console.log(chalk.greenBright.bold(`Starting Netlify Build`))
  console.log()
  // Automatically resolve the config path
  const configPath = await getConfigPath(process.cwd())

  console.log(chalk.cyanBright.bold(`Using config file:`))
  console.log(configPath)
  console.log()
  // Then run build lifecycle

  // Redact argv so raw API key not exposed
  let skipNext = false
  const newArgv = process.argv.reduce((acc, value) => {
    if (skipNext && (value && value.length > 20)) {
      // length === 64
      skipNext = false
      return acc
    }
    if (value === '--token') {
      skipNext = true
      return acc
    }
    return acc.concat(value)
  }, [])
  await build(configPath, newArgv, args.token)
}

execBuild()
  .then(() => {
    const sparkles = chalk.cyanBright('(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧')
    console.log(`\n${sparkles} Finished with the build process!\n`)
  })
  .catch(e => {
    console.log()
    console.log(chalk.redBright.bold('┌─────────────────────────────┐'))
    console.log(chalk.redBright.bold('│    Netlify Build Error!     │'))
    console.log(chalk.redBright.bold('└─────────────────────────────┘'))
    console.log(chalk.bold(` ${e.message}`))
    console.log()
    console.log(chalk.yellowBright.bold('┌─────────────────────────────┐'))
    console.log(chalk.yellowBright.bold('│      Error Stack Trace      │'))
    console.log(chalk.yellowBright.bold('└─────────────────────────────┘'))
    if (process.env.ERROR_VERBOSE) {
      console.log(e.stack)
    } else {
      console.log(` ${chalk.bold(cleanStack(e.stack))}`)
      console.log()
      console.log(` Set environment variable ERROR_VERBOSE=true for deep traces`)
    }
    console.log()
  })
