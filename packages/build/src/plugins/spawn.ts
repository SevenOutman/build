import { fileURLToPath } from 'url'

import { execaNode } from 'execa'

import { addErrorInfo } from '../error/info.js'
import {
  logRuntime,
  logLoadingPlugins,
  logOutdatedPlugins,
  logIncompatiblePlugins,
} from '../log/messages/compatibility.js'
import { measureDuration } from '../time/main.js'

import { getEventFromChild } from './ipc.js'
import { getSpawnInfo } from './options.js'

const CHILD_MAIN_FILE = fileURLToPath(new URL('child/main.js', import.meta.url))

// Start child processes used by all plugins
// We fire plugins through child processes so that:
//  - each plugin is sandboxed, e.g. cannot access/modify its parent `process`
//    (for both security and safety reasons)
//  - logs can be buffered which allows manipulating them for log shipping,
//    transforming and parallel plugins
const tStartPlugins = async function ({ pluginsOptions, buildDir, childEnv, logs, debug, featureFlags, quiet }) {
  if (!quiet) {
    logRuntime(logs, pluginsOptions)
    logLoadingPlugins(logs, pluginsOptions, debug)
  }

  logOutdatedPlugins(logs, pluginsOptions)
  logIncompatiblePlugins(logs, pluginsOptions)

  const childProcesses = await Promise.all(
    pluginsOptions.map(({ pluginDir, nodePath }) =>
      startPlugin({ pluginDir, nodePath, buildDir, childEnv, featureFlags }),
    ),
  )
  return { childProcesses }
}

export const startPlugins = measureDuration(tStartPlugins, 'start_plugins')

const startPlugin = async function ({ pluginDir, nodePath, buildDir, childEnv, featureFlags }) {
  const childProcess = execaNode(CHILD_MAIN_FILE, [], {
    cwd: buildDir,
    preferLocal: true,
    localDir: pluginDir,
    nodePath,
    execPath: nodePath,
    env: childEnv,
    extendEnv: false,
    // Feature flag: https://app.launchdarkly.com/default/production/features/netlify_build_use_json_serialization_for_plugin_ipc/targeting
    // TODO: remove feature flag once fully rolled out
    ...(!featureFlags.netlify_build_use_json_serialization_for_plugin_ipc && {
      serialization: 'advanced',
    }),
  })

  try {
    await getEventFromChild(childProcess, 'ready')
    return { childProcess }
  } catch (error) {
    const spawnInfo = getSpawnInfo()
    addErrorInfo(error, spawnInfo)
    throw error
  }
}

// Stop all plugins child processes
export const stopPlugins = function (childProcesses) {
  childProcesses.forEach(stopPlugin)
}

const stopPlugin = function ({ childProcess }) {
  if (childProcess.connected) {
    childProcess.disconnect()
  }

  childProcess.kill()
}
