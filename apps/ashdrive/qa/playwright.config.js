// Reuse the shared headed fixture and right-side layout without simultaneously
// encoding another video on a machine already recording the live code-off.
import base from '../../../playwright.config.js';
import { fileURLToPath } from 'node:url';
export default {
  ...base,
  testDir: fileURLToPath(new URL('../', import.meta.url)),
  outputDir: fileURLToPath(new URL('../../../test-results/ashdrive-polish/', import.meta.url)),
  reporter: [['list'], ['html', { open: 'never', outputFolder: fileURLToPath(new URL('../../../playwright-report/ashdrive-polish/', import.meta.url)) }]],
  timeout: 240000,
  webServer: { ...base.webServer, cwd: fileURLToPath(new URL('../../../', import.meta.url)), timeout: 120000 },
  use: { ...base.use, video: 'off' },
};
