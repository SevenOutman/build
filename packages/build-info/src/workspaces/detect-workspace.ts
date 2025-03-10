import type { PackageJson } from 'read-pkg'
import { parse } from 'yaml'

import { PkgManager } from '../package-managers/detect-package-manager.js'
import { Project } from '../project.js'

import { getWorkspacePackages } from './get-workspace-packages.js'

export type WorkspaceInfo = {
  /** if we are in the current workspace root or not */
  isRoot: boolean
  /** the workspace root directory */
  rootDir: string
  /** list of relative package paths inside the workspace */
  packages: string[]
}

/**
 * Get a list of globs about all the packages inside a pnpm workspace
 * https://pnpm.io/pnpm-workspace_yaml
 */
export async function detectPnpmWorkspaceGlobs(project: Project): Promise<string[]> {
  const workspaceFile = await project.fs.findUp('pnpm-workspace.yaml', {
    cwd: project.baseDirectory,
    stopAt: project.root,
  })
  if (!workspaceFile) {
    return []
  }

  const { packages } = parse(await project.fs.readFile(workspaceFile))
  return packages
}

/** Get the workspace globs from the package.json file */
export async function detectNpmOrYarnWorkspaceGlobs(pkgJSON: PackageJson): Promise<string[]> {
  if (Array.isArray(pkgJSON.workspaces)) {
    return pkgJSON.workspaces
  }
  if (typeof pkgJSON.workspaces === 'object') {
    return pkgJSON.workspaces.packages || []
  }
  return []
}

/**
 * If it's a javascript workspace (npm, pnpm, yarn) it will retrieve a list of all
 * package paths and will indicate if it's the root of the workspace
 */
export async function detectWorkspaces(project: Project): Promise<WorkspaceInfo | undefined> {
  if (!project.packageManager) {
    throw new Error('Please run the packageManager detection before calling the workspace detection!')
  }
  const pkgJSON = await project.getRootPackageJSON()
  const workspaceGlobs =
    project.packageManager.name === PkgManager.PNPM
      ? await detectPnpmWorkspaceGlobs(project)
      : await detectNpmOrYarnWorkspaceGlobs(pkgJSON)

  if (workspaceGlobs.length === 0) {
    return
  }

  const packages = await getWorkspacePackages(project, workspaceGlobs)
  const isRoot = project.baseDirectory === project.jsWorkspaceRoot
  const relBaseDirectory = project.fs.relative(project.jsWorkspaceRoot, project.baseDirectory)
  // if the current base directory is not part of the detected workspace packages it's not part of this workspace
  // and therefore return no workspace info
  if (!isRoot && !packages.includes(relBaseDirectory)) {
    return
  }

  return {
    rootDir: project.jsWorkspaceRoot,
    isRoot,
    packages,
  }
}
