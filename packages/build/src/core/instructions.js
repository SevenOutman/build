const execa = require('execa')
const pMapSeries = require('p-map-series')
const pReduce = require('p-reduce')

const { getEventFromChild, sendEventToChild } = require('../plugins/ipc')
const {
  logLifeCycleStart,
  logErrorInstructions,
  logInstruction,
  logCommandStart,
  logInstructionSuccess,
} = require('../log/main')
const { startTimer, endTimer } = require('../log/timer')
const { pipeOutput, unpipeOutput } = require('../log/stream')

const { LIFECYCLE } = require('./lifecycle')

// Get instructions for all hooks
const getInstructions = function({ pluginsHooks, config }) {
  const instructions = LIFECYCLE.flatMap(hook => getHookInstructions({ hook, pluginsHooks, config }))
  const buildInstructions = instructions.filter(({ hook }) => hook !== 'onError')
  const errorInstructions = instructions.filter(({ hook }) => hook === 'onError')
  return { buildInstructions, errorInstructions }
}

// Get instructions for a specific hook
const getHookInstructions = function({
  hook,
  pluginsHooks: { [hook]: pluginHooks = [] },
  config: {
    build: {
      lifecycle: { [hook]: commands },
    },
  },
}) {
  if (commands === undefined) {
    return pluginHooks
  }

  const lifeCycleHook = { id: `config.build.lifecycle.${hook}`, hook, commands, override: {} }
  return [lifeCycleHook, ...pluginHooks]
}

// Run build instructions, i.e. all instructions except error handling ones
const runBuildInstructions = async function(buildInstructions, { config, configPath, token, baseDir }) {
  logLifeCycleStart(buildInstructions)

  await runInstructions(buildInstructions, { config, configPath, token, baseDir })
}

// Error handler when an instruction fails
// Resolve all 'onError' methods and try to fix things
const runErrorInstructions = async function(errorInstructions, { config, configPath, token, baseDir, error }) {
  if (errorInstructions.length === 0) {
    return
  }

  logErrorInstructions()

  await runInstructions(errorInstructions, { config, configPath, token, baseDir, error })
}

// Run a set of instructions
const runInstructions = async function(instructions, { config, configPath, token, baseDir, error }) {
  const manifest = await pReduce(
    instructions,
    (currentData, instruction, index) => {
      return runInstruction(instruction, {
        currentData,
        index,
        config,
        configPath,
        token,
        baseDir,
        error,
      })
    },
    {},
  )
  return manifest
}

// Run a single instruction
const runInstruction = async function(instruction, { currentData, index, config, configPath, token, baseDir, error }) {
  const { id, hook } = instruction

  const methodTimer = startTimer()

  logInstruction(instruction, { index, configPath, error })

  const pluginReturnValue = await fireMethod(instruction, { baseDir, config, token, error })

  logInstructionSuccess()

  endTimer(methodTimer, id, hook)

  return { ...currentData, ...pluginReturnValue }
}

const fireMethod = function(instruction, { baseDir, config, token, error }) {
  if (instruction.commands !== undefined) {
    return execCommands(instruction, { baseDir })
  }

  return firePluginHook(instruction, { config, token, baseDir, error })
}

// Fire a `config.lifecycle.*` series of commands
const execCommands = async function({ hook, commands }, { baseDir }) {
  await pMapSeries(commands, command => execCommand({ hook, command, baseDir }))
}

const execCommand = async function({ hook, command, baseDir }) {
  logCommandStart(command)

  const childProcess = execa(command, { shell: true, cwd: baseDir, preferLocal: true })
  pipeOutput(childProcess)

  try {
    await childProcess
  } catch (error) {
    error.message = `In "${hook}" command "${command}":\n${error.message}`
    error.cleanStack = true
    throw error
  } finally {
    unpipeOutput(childProcess)
  }
}

// Fire a plugin hook method
const firePluginHook = async function({ id, childProcess, hook, hookName }, { config, token, baseDir, error }) {
  pipeOutput(childProcess)

  try {
    await sendEventToChild(childProcess, 'run', { hookName, error })
    await getEventFromChild(childProcess, 'run')
  } catch (error) {
    error.message = `In "${hook}" step from "${id}":\n${error.message}`
    error.cleanStack = true
    throw error
  } finally {
    unpipeOutput(childProcess)
  }
}

module.exports = { getInstructions, runBuildInstructions, runErrorInstructions }
