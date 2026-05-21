/* eslint-disable no-console */
import process from 'node:process'
import globalSetup from './global-setup'

globalSetup()
  .then(() => {
    console.log('[fixtures] ready')
  })
  .catch((error) => {
    console.error('[fixtures] failed', error)
    process.exit(1)
  })
