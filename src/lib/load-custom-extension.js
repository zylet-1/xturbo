import {ArgumentType, BlockType} from 'scratch-vm';
import extensionLibraryContent from './libraries/extensions/index.jsx';
import Cast from './turbowarp-cast';

const loadedExtensionsByURL = new Map();
const localModuleUrls = [];
let turboWarpExtensionLoadQueue = Promise.resolve();

const ensureExtensionLibrary = vm => {
    if (!vm.extensionManager.extensionLibraryContent) {
        vm.extensionManager.extensionLibraryContent = extensionLibraryContent;
    }
};

const ensureTurboWarpGuiCompatibility = vm => {
    const runtime = vm.runtime;
    if (!runtime.extensionStorage) runtime.extensionStorage = {};
    if (!runtime.extensionStorage.SPmbpCST) runtime.extensionStorage.SPmbpCST = {};

    const ensureTargetStorage = target => {
        if (!target.extensionStorage) target.extensionStorage = {};
    };
    runtime.targets.forEach(ensureTargetStorage);
    if (!runtime.__customExtensionTargetStorageListener) {
        runtime.on('targetWasCreated', ensureTargetStorage);
        runtime.__customExtensionTargetStorageListener = true;
    }
};

const ensureRendererOverlaySupport = vm => {
    const renderer = vm.renderer;
    if (!renderer || (typeof renderer.addOverlay === 'function' && typeof renderer.removeOverlay === 'function')) {
        return;
    }

    const containersByElement = new Map();
    renderer.addOverlay = (element, mode) => { // eslint-disable-line no-param-reassign
        const canvas = renderer.canvas;
        const stage = canvas && canvas.closest('[data-scratch-stage]');
        const overlayLayer = stage && stage.parentElement.querySelector('[data-scratch-stage-overlays]');
        if (!overlayLayer) {
            throw new Error('The editor stage overlay layer is not available.');
        }

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.overflow = 'visible';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '1';
        container.dataset.overlayMode = mode || 'scale';
        overlayLayer.appendChild(container);
        container.appendChild(element);
        containersByElement.set(element, container);
        return {container: container};
    };
    renderer.removeOverlay = element => { // eslint-disable-line no-param-reassign
        const container = containersByElement.get(element);
        if (container) container.remove();
        containersByElement.delete(element);
    };
};

const getExtensionPath = url => {
    try {
        return new URL(url, window.location.href).pathname.toLowerCase();
    } catch (error) {
        return String(url).toLowerCase();
    }
};

const translate = (message, substitutions = {}) => {
    const text = typeof message === 'string' ?
        message : (message && (message.default || message.defaultMessage)) || '';
    return text.replace(/\{([^}]+)\}/g, (placeholder, key) => (
        Object.prototype.hasOwnProperty.call(substitutions, key) ?
            Cast.toString(substitutions[key]) : placeholder
    ));
};

const download = (url, fileName) => new Promise(resolve => {
    const link = document.createElement('a');
    link.href = Cast.toString(url);
    link.download = Cast.toString(fileName);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Let the browser start reading a blob URL before its caller revokes it.
    window.setTimeout(resolve, 0);
});

const registerTurboWarpExtension = (extension, name, url, vm) => {
    if (!extension || typeof extension.getInfo !== 'function') {
        throw new Error(`${name} did not register a TurboWarp extension.`);
    }

    const info = extension.getInfo();
    const extensionId = info && info.id;
    if (!extensionId || !/^[a-z0-9]+$/i.test(extensionId)) {
        throw new Error('The extension ID must contain only letters and numbers.');
    }

    const entry = {
        extensionId: extensionId,
        name: info.name || extensionId,
        description: info.description || '',
        iconURL: info.menuIconURI || info.iconURI,
        insetIconURL: info.blockIconURI,
        extensionURL: url || `local:${name}`
    };
    const blockClass = class {
        constructor () {
            return extension;
        }
    };
    ensureExtensionLibrary(vm);
    vm.extensionManager.registerExtensionBlock(entry, blockClass);
    if (url) loadedExtensionsByURL.set(url, extensionId);
    return extensionId;
};

const executeTurboWarpScript = (source, scriptURL, name, url, vm) => {
    const execute = () => new Promise((resolve, reject) => {
        let extension = null;
        let settled = false;
        let blobURL = null;
        let scriptRuntimeError = null;
        const previousScratch = window.Scratch;
        ensureTurboWarpGuiCompatibility(vm);
        ensureRendererOverlaySupport(vm);
        if (vm.ScratchBlocks) window.ScratchBlocks = vm.ScratchBlocks;
        const scratchAPI = {
            vm: vm,
            runtime: vm.runtime,
            renderer: vm.renderer,
            gui: {
                getBlockly: () => {
                    const scratchBlocks = vm.ScratchBlocks || window.ScratchBlocks;
                    return scratchBlocks ?
                        Promise.resolve(scratchBlocks) :
                        Promise.reject(new Error('The Scratch Blocks workspace is not available yet.'));
                }
            },
            BlockType: BlockType,
            ArgumentType: ArgumentType,
            Cast: Cast,
            fetch: (...args) => window.fetch(...args),
            download: download,
            extensions: {
                unsandboxed: true,
                register: candidate => {
                    if (extension) throw new Error('A file can register only one extension.');
                    extension = candidate;
                }
            },
            translate: translate
        };
        scratchAPI.translate.setup = () => {};
        window.Scratch = scratchAPI;

        const script = document.createElement('script');
        script.async = true;
        if (scriptURL) {
            script.src = scriptURL;
        } else {
            blobURL = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
            script.src = blobURL;
        }

        const captureScriptError = event => {
            if (!event.filename) return;
            let eventURL;
            try {
                eventURL = new URL(event.filename, window.location.href).href;
            } catch (error) {
                eventURL = event.filename;
            }
            if (eventURL !== script.src) return;
            scriptRuntimeError = event.error || new Error(event.message || `Error while running ${name}`);
        };
        window.addEventListener('error', captureScriptError, true);

        const cleanup = restoreScratch => {
            window.removeEventListener('error', captureScriptError, true);
            if (restoreScratch) {
                if (typeof previousScratch === 'undefined') {
                    delete window.Scratch;
                } else {
                    window.Scratch = previousScratch;
                }
            }
            script.remove();
            if (blobURL) URL.revokeObjectURL(blobURL);
        };
        script.onload = () => {
            if (settled) return;
            settled = true;
            if (scriptRuntimeError) {
                cleanup(true);
                reject(scriptRuntimeError);
                return;
            }
            try {
                const extensionId = registerTurboWarpExtension(extension, name, url, vm);
                // TurboWarp extensions can refer to Scratch from block methods after loading.
                window.Scratch = scratchAPI;
                cleanup(false);
                resolve(extensionId);
            } catch (error) {
                cleanup(true);
                reject(error);
            }
        };
        script.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup(true);
            reject(new Error(`Could not load extension script: ${name}`));
        };
        document.head.appendChild(script);
    });

    const loadPromise = turboWarpExtensionLoadQueue.then(execute);
    turboWarpExtensionLoadQueue = loadPromise.catch(() => undefined);
    return loadPromise;
};

const loadTurboWarpExtensionScript = (url, vm) => {
    let protocol;
    try {
        protocol = new URL(url, window.location.href).protocol;
    } catch (error) {
        return Promise.reject(error);
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
        return Promise.reject(new Error('Extension URLs must use HTTP or HTTPS.'));
    }
    return executeTurboWarpScript(null, url, url, url, vm);
};

const loadXcratchModule = (url, vm) => vm.extensionManager.fetchExtension(url)
    .then(({entry, blockClass}) => {
        ensureExtensionLibrary(vm);
        vm.extensionManager.registerExtensionBlock(entry, blockClass);
        loadedExtensionsByURL.set(url, entry.extensionId);
        return entry.extensionId;
    });

export const loadCustomExtensionURL = (url, vm) => {
    if (loadedExtensionsByURL.has(url)) {
        return Promise.resolve(loadedExtensionsByURL.get(url));
    }

    const path = getExtensionPath(url);
    if (/\.js$/.test(path)) return loadTurboWarpExtensionScript(url, vm);
    if (/\.mjs$/.test(path)) return loadXcratchModule(url, vm);

    return loadXcratchModule(url, vm).catch(() => loadTurboWarpExtensionScript(url, vm));
};

export const loadCustomExtensionFile = (file, vm) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.mjs')) {
        const url = URL.createObjectURL(file);
        localModuleUrls.push(url);
        return loadXcratchModule(url, vm);
    }
    if (!name.endsWith('.js')) {
        return Promise.reject(new Error('Choose a .js or .mjs extension file.'));
    }
    return file.text().then(source => executeTurboWarpScript(source, null, file.name, null, vm));
};

