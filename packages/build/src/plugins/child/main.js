require('../../utils/polyfills')

// This needs to be done before `chalk` is loaded
const { setColorLevel, hasColors } = require('../../log/colors')
setColorLevel()

// eslint-disable-next-line import/order
const logProcessErrors = require('log-process-errors')

const { sendEventToParent, getEventsFromParent } = require('../ipc')

const { loadPlugin } = require('./load')

// Boot plugin child process.
const bootPlugin = async function() {
  try {
    handleProcessErrors()

    const state = {}
    await Promise.all([handleEvents(state), sendEventToParent('ready')])
  } catch (error) {
    await handleError(error)
  }
}

// On uncaught exceptions and unhandled rejections, print the stack trace.
// Also, prevent child processes from crashing on uncaught exceptions.
const handleProcessErrors = function() {
  logProcessErrors({ log: handleProcessError, colors: hasColors(), exitOn: [], level: { multipleResolves: 'silent' } })
}

const handleProcessError = async function(error, level) {
  if (level !== 'error') {
    console[level](error)
    return
  }

  await handleError(error)
}

const handleError = async function(error) {
  await sendEventToParent('error', { stack: error.stack })
}

// Wait for events from parent to perform plugin methods
const handleEvents = async function(state) {
  await getEventsFromParent((eventName, payload) => handleEvent(eventName, payload, state))
}

const handleEvent = async function(eventName, payload, state) {
  const response = await EVENTS[eventName](payload, state)
  await sendEventToParent(eventName, response)
}

// Initial plugin load
const load = function(payload, state) {
  const { context, hooks } = loadPlugin(payload)
  state.context = context
  return hooks
}

// Run a specific plugin hook method
const run = async function({ hookName, error }, { context: { hooks, api, constants, pluginConfig, config } }) {
  const { method } = hooks.find(hookA => hookA.hookName === hookName)
  await method({ api, constants, pluginConfig, config, error })
}

const EVENTS = { load, run }

bootPlugin()
