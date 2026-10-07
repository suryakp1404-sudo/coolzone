const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coolzone-deployment-'));
const source = path.join(root, 'source');
const server = path.join(root, 'server');
const destination = path.join(root, 'public_html');
const bin = path.join(root, 'bin');
const shell = process.env.DEPLOY_TEST_SHELL || '/bin/sh';
const gitBinary = process.env.DEPLOY_TEST_GIT || 'git';
const slash = value => value.replaceAll('\\', '/');
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
let checks = 0;

function git(cwd, ...args) {
  const result = spawnSync(gitBinary, args, { cwd, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}
function commit(cwd, message) {
  git(cwd, 'add', '.');
  git(cwd, '-c', 'user.name=Deployment Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', message);
  return git(cwd, 'rev-parse', 'HEAD');
}
function deploy(expectedStatus, mode = '--pull') {
  const result = spawnSync(shell, ['scripts/deploy.sh', mode], {
    cwd: server,
    env: {
      ...env,
      DEPLOYPATH: slash(destination),
      PATH: `${slash(bin)}${path.delimiter}${process.env.PATH}`,
    },
    encoding: 'utf8',
  });
  if (expectedStatus === 0) assert.equal(result.status, 0, result.stderr || String(result.error));
  else assert.notEqual(result.status, 0, 'Deployment unexpectedly succeeded');
  return result;
}
function check(name, callback) {
  callback();
  checks++;
  console.log(`PASS ${name}`);
}

try {
  for (const directory of [source, destination, bin]) fs.mkdirSync(directory);
  // The bundled Windows Git shell lacks flock and chmod. These tests exercise
  // deployment logic; Linux locking and Unix permissions need server validation.
  if (process.platform === 'win32') {
    for (const command of ['flock', 'chmod']) {
      fs.writeFileSync(path.join(bin, command), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    }
  }
  fs.mkdirSync(path.join(source, 'scripts'));
  fs.mkdirSync(path.join(source, 'assets'));
  fs.copyFileSync(path.join(__dirname, '../scripts/deploy.sh'), path.join(source, 'scripts/deploy.sh'));
  fs.writeFileSync(path.join(source, 'index.html'), 'version one');
  fs.writeFileSync(path.join(source, 'assets', 'style.css'), 'version one');
  fs.writeFileSync(path.join(source, '.gitattributes'), '*.sh text eol=lf\n');
  git(source, 'init', '-q', '-b', 'main');
  const first = commit(source, 'First version');
  git(root, 'clone', '-q', source, server);
  const marker = path.join(server, '.git', 'coolzone-last-deployed');
  fs.writeFileSync(path.join(destination, '.htaccess'), 'hosting settings');

  check('initial publication and preservation of hosting files', () => {
    deploy(0);
    assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'), 'version one');
    assert.equal(fs.readFileSync(path.join(destination, '.htaccess'), 'utf8'), 'hosting settings');
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), first);
  });
  check('unchanged commit does not copy again', () => {
    const before = fs.statSync(path.join(destination, 'index.html')).mtimeMs;
    assert.equal(deploy(0).stdout, '');
    assert.equal(fs.statSync(path.join(destination, 'index.html')).mtimeMs, before);
  });
  fs.writeFileSync(path.join(source, 'index.html'), 'version two');
  const second = commit(source, 'Second version');
  check('new commit is fetched and published', () => {
    deploy(0);
    assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'), 'version two');
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), second);
  });
  check('uncommitted server edits stop deployment', () => {
    fs.writeFileSync(path.join(server, 'index.html'), 'local edit');
    assert.match(deploy(1).stderr, /uncommitted changes/);
    assert.equal(fs.readFileSync(path.join(server, 'index.html'), 'utf8'), 'local edit');
    assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'), 'version two');
    git(server, 'restore', 'index.html');
  });
  fs.writeFileSync(path.join(source, 'index.html'), 'version three');
  const third = commit(source, 'Third version');
  check('failed copy is retried without another commit', () => {
    fs.renameSync(path.join(destination, 'assets'), path.join(destination, 'assets.saved'));
    fs.writeFileSync(path.join(destination, 'assets'), 'cannot overwrite a file with a directory');
    deploy(1);
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), second);
    assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'), 'version two');
    fs.unlinkSync(path.join(destination, 'assets'));
    fs.renameSync(path.join(destination, 'assets.saved'), path.join(destination, 'assets'));
    deploy(0);
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), third);
  });
  check('unexpected checked-out branch stops deployment', () => {
    git(server, 'switch', '-qc', 'other');
    assert.match(deploy(1).stderr, /main branch/);
    git(server, 'switch', '-q', 'main');
  });
  check('manual cPanel deployment can republish the same commit', () => {
    fs.writeFileSync(path.join(destination, 'index.html'), 'hosting edit');
    deploy(0, 'local');
    assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'), 'version three');
  });
  check('server-only commits are preserved and not published', () => {
    fs.writeFileSync(path.join(server, 'index.html'), 'server-only commit');
    const local = commit(server, 'Server-only change');
    assert.match(deploy(1).stderr, /differs from GitHub/);
    assert.equal(git(server, 'rev-parse', 'HEAD'), local);
    assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'), 'version three');
  });
  console.log(`${checks} checks passed. Live hosting, Linux locking and permissions remain unverified.`);
} finally {
  // Remove only the uniquely created test fixture under the OS temp directory.
  assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('coolzone-deployment-'));
  fs.rmSync(root, { recursive: true, force: true });
}
