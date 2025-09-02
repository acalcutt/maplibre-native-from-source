const fs = require('fs');
const path = require('path');

//const gitPath = path.join('maplibre-native', '.git');
//const gitBackupPath = path.join('maplibre-native', '.git.bak');
const npmignorePath = path.join('maplibre-native', '.npmignore');
const npmignoreBackupPath = path.join('maplibre-native', '.npmignore.bak');

// Restore maplibre-native/.git directory
//if (fs.existsSync(gitBackupPath)) {
//  fs.renameSync(gitBackupPath, gitPath);
//  console.log('Restored maplibre-native/.git directory');
//}

// Restore maplibre-native/.npmignore file
if (fs.existsSync(npmignoreBackupPath)) {
  fs.renameSync(npmignoreBackupPath, npmignorePath);
  console.log('Restored maplibre-native/.npmignore file');
}
