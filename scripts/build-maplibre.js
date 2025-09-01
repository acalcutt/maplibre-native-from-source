const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// --- Configuration ---
const maplibreNativeSourceDir = path.resolve(__dirname, '../maplibre-native');
const cmakePresetsPath = path.join(maplibreNativeSourceDir, 'CMakePresets.json');

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
      generator = 'Visual Studio 17 2022';
      cmakeArgs.push('-DVCPKG_TARGET_TRIPLET=arm64-windows');
    } else if (arch === 'x64') {
      presetName = 'windows-opengl-node';
      generator = 'Ninja';
      cmakeArgs.push('-DVCPKG_TARGET_TRIPLET=x64-windows');
    }
  }

  if (!presetName) {
    throw new Error(`Unsupported OS/Architecture: ${platform}/${arch}`);
  }

  // --- Determine Build Directory ---
  let presetDefinition = null;
  let determinedBuildDir = null;

  try {
    const presetsData = require(cmakePresetsPath);
    const configurePreset = presetsData.configurePresets.find(p => p.name === presetName);

    if (configurePreset) {
      presetDefinition = configurePreset;
      if (configurePreset.binaryDir) {
        determinedBuildDir = configurePreset.binaryDir.replace('${sourceDir}', maplibreNativeSourceDir);
      }
    }
  } catch (e) {
    console.warn(`Could not parse CMakePresets.json to find binaryDir for preset "${presetName}":`, e.message);
    determinedBuildDir = path.join(maplibreNativeSourceDir, `build-${presetName}`);
  }

  if (!determinedBuildDir) {
    determinedBuildDir = path.join(maplibreNativeSourceDir, `build-${presetName}`);
  }
  buildDir = determinedBuildDir;

  console.log(`Selected Preset: "${presetName}" for ${platform} ${arch}`);
  console.log(`Using Generator: "${generator}"`);
  console.log(`Build Directory: "${buildDir}"`);
  console.log(`Additional CMake Args: ${JSON.stringify(cmakeArgs)}`);

  return { presetName, buildDir, generator, cmakeArgs };
}

// --- Main Build Execution ---
try {
  const { presetName, buildDir, generator, cmakeArgs } = getPresetInfo();

  // --- Cleanup old build directory before configuring ---
  console.log(`Cleaning previous build directory: ${buildDir}`);
  if (fs.existsSync(buildDir)) {
    const rmCommand = os.platform() === 'win32' ? `rmdir /s /q "${buildDir}"` : `rm -rf "${buildDir}"`;
    console.log(`Executing cleanup: ${rmCommand}`);
    execSync(rmCommand, { stdio: 'inherit', shell: true });
  } else {
    console.log(`Build directory ${buildDir} does not exist, skipping cleanup.`);
  }

  // --- Configure using CMake with the selected preset ---
  // Construct the full cmake command including the additional arguments
  const configureCommand = [
    `cmake -S ${maplibreNativeSourceDir}`,
    `-B ${buildDir}`,
    `--preset=${presetName}`,
    ...cmakeArgs // Pass the already formatted arguments
  ].join(' ');

  console.log(`Configuring maplibre-native using: ${configureCommand}`);
  execSync(configureCommand, { stdio: 'inherit' });

  // --- Build using the specified generator ---
  let buildCommand;
  if (generator.toLowerCase().includes('ninja')) {
    buildCommand = `ninja -C ${buildDir}`;
  } else if (generator.toLowerCase().includes('xcode')) {
    throw new Error("Xcode generator is not directly supported by this script. Ensure your Node.js presets use Ninja or a compatible generator.");
  } else if (generator.toLowerCase().includes('visual studio')) {
    let buildType = 'Release'; // Default
    try {
      const presetsData = require(cmakePresetsPath);
      const configurePreset = presetsData.configurePresets.find(p => p.name === presetName);
      if (configurePreset && configurePreset.cacheVariables && configurePreset.cacheVariables.CMAKE_BUILD_TYPE) {
        buildType = configurePreset.cacheVariables.CMAKE_BUILD_TYPE;
      }
    } catch (e) {
      console.warn(`Could not find CMAKE_BUILD_TYPE for preset "${presetName}":`, e.message);
    }
    // For VS generators, the --config argument is critical.
    buildCommand = `cmake --build ${buildDir} --config ${buildType}`;
    console.log(`For VS generator, using build type: ${buildType}`);
  } else if (generator.toLowerCase().includes('makefiles')) {
    buildCommand = `make -C ${buildDir}`;
  } else {
    throw new Error(`Unsupported CMake generator: ${generator}`);
  }

  console.log(`Building maplibre-native using: ${buildCommand}`);
  execSync(buildCommand, { stdio: 'inherit', shell: true });

  console.log('maplibre-native build successful!');

} catch (error) {
  console.error('Error building maplibre-native:', error);
  process.exit(1);
}
