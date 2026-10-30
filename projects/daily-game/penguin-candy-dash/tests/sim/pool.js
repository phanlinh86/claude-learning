// Runs sim jobs on all CPU cores (child processes). Each job = runGame() options. (Copied from Foxy's Reef Memory.)
'use strict';
const { fork } = require('child_process');
const os = require('os');

if (require.main === module && process.argv[2] === '--worker') {
  const { runGame } = require('./sim');
  process.on('message', (msg) => {
    if (msg === 'exit') process.exit(0);
    const r = runGame(msg.job);
    process.send({ i: msg.i, r });
  });
} else {
  module.exports = function runPool(jobs, nWorkers) {
    nWorkers = Math.max(1, Math.min(nWorkers || os.cpus().length, jobs.length));
    return new Promise((resolve) => {
      const out = new Array(jobs.length);
      let next = 0, done = 0;
      const t0 = Date.now();
      for (let k = 0; k < nWorkers; k++) {
        const ch = fork(__filename, ['--worker']);
        const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
        ch.on('message', (m) => {
          out[m.i] = m.r; done++;
          if (done % 200 === 0) process.stderr.write(`  ${done}/${jobs.length} runs (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
          if (done === jobs.length) resolve(out);
          feed();
        });
        feed();
      }
    });
  };
}
