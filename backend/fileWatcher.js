const chokidar = require('chokidar');
const path = require('path');

function initFileWatcher(filePath, onChangeCallback) {
  const absolutePath = path.resolve(filePath);
  const watcher = chokidar.watch(absolutePath, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
  });

  watcher.on('change', () => {
    setTimeout(() => { onChangeCallback(); }, 500);
  });

  return watcher;
}

module.exports = { initFileWatcher };