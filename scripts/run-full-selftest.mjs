#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const backendDir = path.join(cwd, 'backend')
const frontendDir = path.join(cwd, 'frontend')

const frontendUrl = (process.env.INFOHUB_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
const backendUrl = (process.env.INFOHUB_BACKEND_URL || 'http://localhost:3002').replace(/\/$/, '')

function log(step, message) {
  console.log(`${step} ${message}`)
}

function parseArgs(argv) {
  return {
    start: argv.includes('--start'),
    headed: argv.includes('--headed'),
    install: argv.includes('--install'),
  }
}

function runCommand(command, args, options = {}) {
  const resolvedCommand = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command
  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      cwd,
      shell: false,
      stdio: 'inherit',
      ...options,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${resolvedCommand} ${args.join(' ')} failed with exit code ${code}`))
    })
    child.on('error', reject)
  })
}

async function waitForHttpOk(url, timeoutMs = 90_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function ensureStarted() {
  log('[INFO]', 'Starting InfoHub via start.bat')
  await runCommand('cmd', ['/c', 'start.bat'])
  await waitForHttpOk(`${backendUrl}/health`)
  await waitForHttpOk(frontendUrl)
  log('[PASS]', 'Frontend and backend are reachable')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  log('[INFO]', `Frontend: ${frontendUrl}`)
  log('[INFO]', `Backend: ${backendUrl}`)

  if (args.install) {
    log('[INFO]', 'Running install.bat')
    await runCommand('cmd', ['/c', 'install.bat'])
  }

  if (args.start) {
    await ensureStarted()
  } else {
    await waitForHttpOk(`${backendUrl}/health`, 10_000).catch(() => {
      throw new Error('Backend is not reachable. Run .\\start.bat or rerun this script with --start')
    })
    await waitForHttpOk(frontendUrl, 10_000).catch(() => {
      throw new Error('Frontend is not reachable. Run .\\start.bat or rerun this script with --start')
    })
  }

  log('[INFO]', 'Running backend regression tests')
  await runCommand('powershell', ['-Command', 'npm run test:run'], { cwd: backendDir })

  log('[INFO]', 'Running deep local smoke')
  await runCommand('node', ['scripts/run-local-smoke.mjs', '--deep'])

  log('[INFO]', 'Running Playwright end-to-end tests')
  const e2eCommand = args.headed ? 'npm run test:e2e -- --headed' : 'npm run test:e2e'
  await runCommand('powershell', ['-Command', e2eCommand], { cwd: frontendDir })

  log('[PASS]', 'Full self-test suite passed')
}

main().catch((error) => {
  log('[FAIL]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
