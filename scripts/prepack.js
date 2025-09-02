const fs = require('fs');
const path = require('path');

//const gitPath = path.join('maplibre-native', '.git');
//const gitBackupPath = path.join('maplibre-native', '.git.bak');
const npmignorePath = path.join('maplibre-native', '.npmignore');
const npmignoreBackupPath = path.join('maplibre-native', '.npmignore.bak');

// Move maplibre-native/.git directory
//if (fs.existsSync(gitPath)) {
//  fs.renameSync(gitPath, gitBackupPath);
//  console.log('Temporarily moved maplibre-native/.git directory');
//}

// Move maplibre-native/.npmignore file
if (fs.existsSync(npmignorePath)) {
  fs.renameSync(npmignorePath, npmignoreBackupPath);
  console.log('Temporarily moved maplibre-native/.npmignore file');
}