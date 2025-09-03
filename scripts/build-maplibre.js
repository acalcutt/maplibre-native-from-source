const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function setupWindowsDevEnvironment(arch) {
    if (process.platform !== 'win32') return;

    // Check if we're already in a VS dev environment
    if (process.env.VCINSTALLDIR && process.env.VSCMD_ARG_TGT_ARCH) {
        console.log('✓ Already running in Visual Studio Developer Command Prompt');
        return;
    }

    console.log('⚙️  Setting up Visual Studio environment using VsDevCmd.bat...');

    // Find VsDevCmd.bat
    const vsDevCmdPaths = [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\Tools\\VsDevCmd.bat',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\Tools\\VsDevCmd.bat',
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise\\Common7\\Tools\\VsDevCmd.bat',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional\\Common7\\Tools\\VsDevCmd.bat',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\Common7\\Tools\\VsDevCmd.bat'
    ];

    let vsDevCmdPath = null;
    for (const p of vsDevCmdPaths) { // Use 'p' to avoid conflict with the 'path' module
        if (fs.existsSync(p)) {
            vsDevCmdPath = p;
            console.log(`🔧 Found VsDevCmd.bat: ${p}`);
            break;
        }
    }

    if (!vsDevCmdPath) {
        console.warn('❌ VsDevCmd.bat not found in standard Visual Studio locations');
        console.log('Expected locations checked:');
        vsDevCmdPaths.forEach(p => console.log(`    ${p}`));
        console.log('');
        console.log('💡 Please ensure Visual Studio 2019/2022 is installed with C++ tools');

        // Manual fallback
        process.env.VCINSTALLDIR = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\';
        process.env.VSCMD_ARG_TGT_ARCH = arch;
        return;
    }

    // Execute VsDevCmd.bat with architecture parameter and capture environment
    const archParam = arch === 'arm64' ? '-arch=arm64' : '-arch=amd64';
    const command = `"${vsDevCmdPath}" ${archParam} && set`;

    console.log(`🔧 Executing: VsDevCmd.bat ${archParam}`);

    try {
        // Execute and capture all environment variables
        const result = execSync(command, {
            encoding: 'utf8',
            shell: true,
            timeout: 30000, // 30 second timeout
            stdio: ['pipe', 'pipe', 'pipe'] // capture stdout/stderr
        });

        // Parse environment variables from output
        const lines = result.split('\n');
        let envVarsSet = 0;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.includes('=')) {
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=');
                    if (key && value) {
                        process.env[key] = value;
                        envVarsSet++;
                    }
                }
            }
        }

        console.log(`✓ VsDevCmd.bat executed successfully`);
        console.log(`    Environment variables set: ${envVarsSet}`);
        console.log(`    VCINSTALLDIR: ${process.env.VCINSTALLDIR ? '✓ Set' : '❌ Not set'}`);
        console.log(`    VSCMD_ARG_TGT_ARCH: ${process.env.VSCMD_ARG_TGT_ARCH || '❌ Not set'}`);
        console.log(`    WindowsSDKVersion: ${process.env.WindowsSDKVersion || '❌ Not set'}`);
        console.log(`    Platform: ${process.env.Platform || '❌ Not set'}`);

        // Ensure target architecture is set correctly
        if (!process.env.VSCMD_ARG_TGT_ARCH) {
            process.env.VSCMD_ARG_TGT_ARCH = arch;
            console.log(`    ⚠️  Manually set VSCMD_ARG_TGT_ARCH to ${arch}`);
        }

    } catch (error) {
        console.error('❌ Failed to execute VsDevCmd.bat:', error.message);
        console.log('');
        console.log('💡 Troubleshooting suggestions:');
        console.log('1. Ensure Visual Studio is properly installed');
        console.log('2. Try running the script as Administrator');
        console.log('3. Manually run `VsDevCmd.bat` from a terminal and check for errors');
    }
}

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
            cmakeArgs.push('-DBUILD_SHARED_LIBS=ON'); // Required for Windows introspection
        } else if (arch === 'x64') {
            presetName = 'windows-opengl-node';
            generator = 'Ninja';
            cmakeArgs.push('-DVCPKG_TARGET_TRIPLET=x64-windows');
            cmakeArgs.push('-DBUILD_SHARED_LIBS=ON'); // Required for Windows introspection
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

    return {
        presetName,
        buildDir,
        generator,
        cmakeArgs,
        arch
    };
}

// --- Main Build Execution ---
(async function() {
    try {
        const {
            presetName,
            buildDir,
            generator,
            cmakeArgs,
            arch
        } = getPresetInfo();

        // --- Call your function here to set up the VS environment
        if (os.platform() === 'win32') {
            await setupWindowsDevEnvironment(arch);
        }

        // --- Cleanup old build directory before configuring ---
        console.log(`Cleaning previous build directory: ${buildDir}`);
        if (fs.existsSync(buildDir)) {
            const rmCommand = os.platform() === 'win32' ? `rmdir /s /q "${buildDir}"` : `rm -rf "${buildDir}"`;
            console.log(`Executing cleanup: ${rmCommand}`);
            execSync(rmCommand, {
                stdio: 'inherit',
                shell: true
            });
        } else {
            console.log(`Build directory ${buildDir} does not exist, skipping cleanup.`);
        }

        // --- Configure using CMake with the selected preset ---
        // Construct the full cmake command including the additional arguments
        const configureCommand = [
            `cmake -S "${maplibreNativeSourceDir}"`,
            `-B "${buildDir}"`,
            `--preset=${presetName}`,
            ...cmakeArgs // Pass the already formatted arguments
        ].join(' ');

        console.log(`Configuring maplibre-native using: ${configureCommand}`);
        execSync(configureCommand, {
            stdio: 'inherit',
            shell: true
        });

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
            buildCommand = `make -C "${buildDir}"`;
        } else {
            throw new Error(`Unsupported CMake generator: ${generator}`);
        }

        console.log(`Building maplibre-native using: ${buildCommand}`);
        execSync(buildCommand, {
            stdio: 'inherit',
            shell: true
        });

        console.log('maplibre-native build successful!');

    } catch (error) {
        console.error('Error building maplibre-native:', error);
        process.exit(1);
    }
})();
