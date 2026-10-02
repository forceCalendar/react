/** Verify the published interface bundle, not only the adapter's DOM stub. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/real-interface.mjs', import.meta.url));
for (const load of ['cold', 'warm']) {
  for (const mode of ['normal', 'strict']) {
    test(`real interface: ${load} definition, ${mode} React mount`, () => {
      const result = spawnSync(process.execPath, [fixture, load, mode], {
        encoding: 'utf8', timeout: 30_000,
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    });
  }
}
