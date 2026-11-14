// SPDX-License-Identifier: Apache-2.0
const ref = process.argv[2] ?? '';
const match = /^refs\/tags\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(ref);
if (!match) {
  process.stderr.write('Expected refs/tags/vX.Y.Z or refs/tags/vX.Y.Z-pre.N\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`${match[1]}\n`);
}
