'use strict'

const locatePath = require('locate-path')

const { addErrorInfo } = require('../../error/info')

// Retrieve "manifest.yml" path for a specific plugin
const getManifestPath = async function ({ pluginDir, packageDir, packageName }) {
  const dirs = [pluginDir, packageDir].filter(Boolean).map((dir) => `${dir}/${MANIFEST_FILENAME}`)
  const manifestPath = await locatePath(dirs)
  validateManifestExists(manifestPath, packageName)
  return manifestPath
}

const validateManifestExists = function (manifestPath, packageName) {
  if (manifestPath !== undefined) {
    return
  }

  const error = new Error(
    `The plugin "${packageName}" is missing a "manifest.yml".
This might mean:
  - The plugin "package" name is misspelled
  - The plugin "package" points to a Node module that is not a Netlify Build plugin
  - If you're developing a plugin, please see the documentation at https://github.com/netlify/build#anatomy-of-a-plugin`,
  )
  addErrorInfo(error, { type: 'resolveConfig' })
  throw error
}

const MANIFEST_FILENAME = 'manifest.yml'

module.exports = { getManifestPath }
