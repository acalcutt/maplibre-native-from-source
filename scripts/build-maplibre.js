const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// --- Configuration ---
const maplibreNativeSourceDir = path.resolve(__dirname, '../maplibre-native');
const maplibreNativeBuilDir = path.resolve(maplibreNativeSourceDir, 'build');
const cmakePresetsPath = path.join(maplibreNativeSourceDir, 'CMakePresets.json');
const VCPKG_BINARY_SOURCES_Path = path.join(maplibreNativeSourceDir, 'platform/windows/vendor/vcpkg/archives');

// --- Preset Mapping Logic ---
function getPresetInfo() {
  const platform = process.platform;
  const arch = process.arch;

  console.log(`Detected Platform: ${platform}, Architecture: ${arch}`);

  let presetName = null;
  let buildDir = null;
  let generator = null;
  let cmakeArgs = [];

  if (platform === 'darwin') { // macOS
    presetName = 'macos-metal-node';
    generator = 'Ninja';
  } else if (platform === 'linux') { // Linux
    presetName = 'linux-opengl-node';
    generator = 'Ninja';
  } else if (platform === 'win32') { // Windows
    if (arch === 'arm64') {
      presetName = 'windows-arm64-opengl-node';
      generator = 'Visual Studio 17 2022'; // Or 'Ninja' if you prefer
      cmakeArgs.push('-DVCPKG_TARGET_TRIPLET=arm64-windows');
    } else if (arch === 'x64') {
      presetName = 'windows-opengl-node';
      generator = 'Ninja'; // Or 'Visual Studio 17 2022'
      cmakeArgs.push('-DVCPKG_TARGET_TRIPLET=x64-windows');
    }
  }

  if (!presetName) {
    throw new Error(`Unsupported OS/Architecture: ${platform}/${arch}`);
  }

  console.log(`Selected Preset: "${presetName}" for ${platform} ${arch}`);
  console.log(`Using Generator: "${generator}"`);
  console.log(`Build Directory: "${maplibreNativeBuilDir}"`);
  console.log(`Additional CMake Args: ${JSON.stringify(cmakeArgs)}`);

  return { presetName, buildDir, generator, cmakeArgs, arch };
}

// --- Main Build Execution ---
try {
  const { presetName, buildDir, generator, cmakeArgs, arch } = getPresetInfo();

  // --- Prepare Environment Variables ---
  const currentEnv = process.env;
  const buildEnv = { ...currentEnv };

  // --- Conditionally add vcpkg specific environment variables for Windows ---
  if (process.platform === 'win32') {
    buildEnv.VCPKG_INSTALL_OPTIONS = "--debug"; 
    buildEnv.VCPKG_BINARY_SOURCES = `clear;files,${VCPKG_BINARY_SOURCES_Path},readwrite`;

    console.log(`Setting VCPKG_INSTALL_OPTIONS for Windows: "${buildEnv.VCPKG_INSTALL_OPTIONS}"`);
    console.log(`Setting VCPKG_BINARY_SOURCES for Windows: "${buildEnv.VCPKG_BINARY_SOURCES}"`);
  }

  // --- Cleanup old build directory before configuring ---
  console.log(`Cleaning previous build directory: ${maplibreNativeBuilDir}`);
  if (fs.existsSync(maplibreNativeBuilDir)) {
    const rmCommand = os.platform() === 'win32' ? `rmdir /s /q "${maplibreNativeBuilDir}"` : `rm -rf "${maplibreNativeBuilDir}"`;
    console.log(`Executing cleanup: ${rmCommand}`);
    execSync(rmCommand, { stdio: 'inherit', shell: true, env: buildEnv });
  } else {
    console.log(`Build directory ${maplibreNativeBuilDir} does not exist, skipping cleanup.`);
  }

  // --- Configure using CMake with the selected preset ---
  // Construct the full cmake command including the additional arguments
  // Using path.join for source directory to be platform-independent
  const configureCommand = [
    `cmake`,
    `--preset=${presetName}`,
    ...cmakeArgs
  ].join(' ');

  console.log(`Configuring maplibre-native using: ${configureCommand}`);
  execSync(configureCommand, { stdio: 'inherit', shell: true, env: buildEnv, cwd: maplibreNativeSourceDir });

  // --- Build using the specified generator ---
  buildCommand = `cmake --build "${maplibreNativeBuilDir}"`;
  console.log(`Building maplibre-native using: ${buildCommand}`);
  execSync(buildCommand, { stdio: 'inherit', shell: true, env: buildEnv, cwd: maplibreNativeSourceDir});

  console.log('maplibre-native build successful!');

} catch (error) {
  console.error('Error building maplibre-native:', error);
  process.exit(1);
}
