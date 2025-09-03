const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// --- Configuration ---
const maplibreNativeSourceDir = path.resolve(__dirname, '../maplibre-native');
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

  // --- Determine Build Directory ---
  let presetDefinition = null;
  let determinedBuildDir = null;

  try {
    // Ensure you are requiring the file correctly relative to the script's location
    const presetsData = require(cmakePresetsPath);
    const configurePreset = presetsData.configurePresets.find(p => p.name === presetName);

    if (configurePreset) {
      presetDefinition = configurePreset;
      if (configurePreset.binaryDir) {
        // CMakePresets uses  as a variable, which we can replace
        // or simply use path.join if binaryDir is relative to sourceDir
        determinedBuildDir = configurePreset.binaryDir.replace('$', maplibreNativeSourceDir);
        // If binaryDir is relative and doesn't use $, use path.join
        if (!determinedBuildDir.startsWith(maplibreNativeSourceDir)) {
           determinedBuildDir = path.join(maplibreNativeSourceDir, configurePreset.binaryDir);
        }
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
  console.log(`Cleaning previous build directory: ${buildDir}`);
  if (fs.existsSync(buildDir)) {
    const rmCommand = os.platform() === 'win32' ? `rmdir /s /q "${buildDir}"` : `rm -rf "${buildDir}"`;
    console.log(`Executing cleanup: ${rmCommand}`);
    execSync(rmCommand, { stdio: 'inherit', shell: true, env: buildEnv });
  } else {
    console.log(`Build directory ${buildDir} does not exist, skipping cleanup.`);
  }

  // --- Configure using CMake with the selected preset ---
  // Construct the full cmake command including the additional arguments
  // Using path.join for source directory to be platform-independent
  const configureCommand = [
    `cmake -S "${maplibreNativeSourceDir}"`,
    `-B "${buildDir}"`,
    `--preset=${presetName}`,
    ...cmakeArgs
  ].join(' ');

  console.log(`Configuring maplibre-native using: ${configureCommand}`);
  execSync(configureCommand, { stdio: 'inherit', shell: true, env: buildEnv }); // Pass the modified environment

  // --- Build using the specified generator ---
  let buildCommand;
  if (generator.toLowerCase().includes('ninja')) {
    buildCommand = `ninja -C "${buildDir}"`;
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
    buildCommand = `cmake --build "${buildDir}" --config ${buildType}`;
    console.log(`For VS generator, using build type: ${buildType}`);
  } else if (generator.toLowerCase().includes('makefiles')) {
    buildCommand = `make -C "${buildDir}"`
  } else {
    throw new Error(`Unsupported CMake generator: ${generator}`);
  }

  console.log(`Building maplibre-native using: ${buildCommand}`);
  execSync(buildCommand, { stdio: 'inherit', shell: true, env: buildEnv });

  console.log('maplibre-native build successful!');

} catch (error) {
  console.error('Error building maplibre-native:', error);
  process.exit(1);
}
