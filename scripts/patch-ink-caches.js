import {readFileSync, writeFileSync, renameSync, unlinkSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supportedInkVersion = '7.1.0';

export const inkPatchTargets = [
	{
		path: 'node_modules/ink/build/measure-text.js',
		original: String.raw`import widestLine from 'widest-line';
const cache = new Map();
const measureText = (text) => {
    if (text.length === 0) {
        return {
            width: 0,
            height: 0,
        };
    }
    const cachedDimensions = cache.get(text);
    if (cachedDimensions) {
        return cachedDimensions;
    }
    const width = widestLine(text);
    const height = text.split('\n').length;
    const dimensions = { width, height };
    cache.set(text, dimensions);
    return dimensions;
};
export default measureText;
//# sourceMappingURL=measure-text.js.map`,
		patched: String.raw`import widestLine from 'widest-line';
const MAX_CACHE_ENTRIES = 512;
const MAX_CACHE_TEXT_LENGTH = 4096;
const MAX_CACHE_UTF16_SIZE = 64 * 1024;
const MAX_CACHE_ENTRY_UTF16_SIZE = 8 * 1024;
let cacheSize = 0;
const cache = new Map();
const getCached = (key) => {
    const entry = cache.get(key);
    if (!entry) {
        return undefined;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
};
const setCached = (key, value) => {
    const size = key.length + (typeof value === 'string' ? value.length : 0);
    if (size > MAX_CACHE_ENTRY_UTF16_SIZE) {
        return;
    }
    const previous = cache.get(key);
    if (previous) {
        cacheSize -= previous.size;
        cache.delete(key);
    }
    while (cache.size >= MAX_CACHE_ENTRIES || cacheSize + size > MAX_CACHE_UTF16_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        cacheSize -= oldest.size;
    }
    cache.set(key, {value, size});
    cacheSize += size;
};
const measureText = (text) => {
    if (text.length === 0) {
        return {
            width: 0,
            height: 0,
        };
    }
    const cachedDimensions = getCached(text);
    if (cachedDimensions !== undefined) {
        return cachedDimensions;
    }
    const width = widestLine(text);
    const height = text.split('\n').length;
    const dimensions = { width, height };
    if (text.length <= MAX_CACHE_TEXT_LENGTH) {
        setCached(text, dimensions);
    }
    return dimensions;
};
export default measureText;
//# sourceMappingURL=measure-text.js.map`,
	},
	{
		path: 'node_modules/ink/build/wrap-text.js',
		original: String.raw`import wrapAnsi from 'wrap-ansi';
import cliTruncate from 'cli-truncate';
const cache = {};
const wrapText = (text, maxWidth, wrapType) => {
    const cacheKey = text + String(maxWidth) + String(wrapType);
    const cachedText = cache[cacheKey];
    if (cachedText) {
        return cachedText;
    }
    let wrappedText = text;
    if (wrapType === 'wrap') {
        wrappedText = wrapAnsi(text, maxWidth, {
            trim: false,
            hard: true,
        });
    }
    if (wrapType === 'hard') {
        wrappedText = wrapAnsi(text, maxWidth, {
            trim: false,
            hard: true,
            wordWrap: false,
        });
    }
    if (wrapType.startsWith('truncate')) {
        let position = 'end';
        if (wrapType === 'truncate-middle') {
            position = 'middle';
        }
        if (wrapType === 'truncate-start') {
            position = 'start';
        }
        wrappedText = cliTruncate(text, maxWidth, { position });
    }
    cache[cacheKey] = wrappedText;
    return wrappedText;
};
export default wrapText;
//# sourceMappingURL=wrap-text.js.map`,
		patched: String.raw`import wrapAnsi from 'wrap-ansi';
import cliTruncate from 'cli-truncate';
const MAX_CACHE_ENTRIES = 512;
const MAX_CACHE_TEXT_LENGTH = 4096;
const MAX_CACHE_UTF16_SIZE = 64 * 1024;
const MAX_CACHE_ENTRY_UTF16_SIZE = 8 * 1024;
let cacheSize = 0;
const cache = new Map();
const getCached = (key) => {
    const entry = cache.get(key);
    if (!entry) {
        return undefined;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
};
const setCached = (key, value) => {
    const size = key.length + value.length;
    if (size > MAX_CACHE_ENTRY_UTF16_SIZE) {
        return;
    }
    const previous = cache.get(key);
    if (previous) {
        cacheSize -= previous.size;
        cache.delete(key);
    }
    while (cache.size >= MAX_CACHE_ENTRIES || cacheSize + size > MAX_CACHE_UTF16_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        cacheSize -= oldest.size;
    }
    cache.set(key, {value, size});
    cacheSize += size;
};
const wrapText = (text, maxWidth, wrapType) => {
    const cacheKey = JSON.stringify([text, maxWidth, wrapType]);
    const cachedText = getCached(cacheKey);
    if (cachedText !== undefined) {
        return cachedText;
    }
    let wrappedText = text;
    if (wrapType === 'wrap') {
        wrappedText = wrapAnsi(text, maxWidth, {
            trim: false,
            hard: true,
        });
    }
    if (wrapType === 'hard') {
        wrappedText = wrapAnsi(text, maxWidth, {
            trim: false,
            hard: true,
            wordWrap: false,
        });
    }
    if (wrapType.startsWith('truncate')) {
        let position = 'end';
        if (wrapType === 'truncate-middle') {
            position = 'middle';
        }
        if (wrapType === 'truncate-start') {
            position = 'start';
        }
        wrappedText = cliTruncate(text, maxWidth, { position });
    }
    if (text.length <= MAX_CACHE_TEXT_LENGTH) {
        setCached(cacheKey, wrappedText);
    }
    return wrappedText;
};
export default wrapText;
//# sourceMappingURL=wrap-text.js.map`,
	},
];

export function patchInkCaches(root = projectRoot) {
	const packagePath = join(root, 'node_modules/ink/package.json');
	let inkPackage;
	try {
		inkPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
	} catch (error) {
		throw new Error(`Cannot read installed Ink package at ${packagePath}: ${error.message}`, {cause: error});
	}
	if (inkPackage.version !== supportedInkVersion) {
		throw new Error(`Ink cache patch supports exactly ${supportedInkVersion}; found ${inkPackage.version ?? 'unknown'} at ${packagePath}`);
	}

	const states = inkPatchTargets.map((target) => {
		const absolutePath = join(root, target.path);
		try {
			const source = readFileSync(absolutePath, 'utf8');
			if (source === target.original) {
				return {target, absolutePath, source, state: 'original'};
			}
			if (source === target.patched) {
				return {target, absolutePath, source, state: 'patched'};
			}
			return {target, absolutePath, source, state: 'unknown'};
		} catch (error) {
			return {target, absolutePath, error, state: 'unreadable'};
		}
	});
	const incompatible = states.filter(({state}) => state === 'unknown' || state === 'unreadable');
	if (incompatible.length > 0) {
		const details = incompatible.map(({absolutePath, error, state}) =>
			`${absolutePath}: ${state === 'unreadable' ? error.message : 'source does not match the known original or patched version'}`,
		).join('\n');
		throw new Error(`Ink cache patch refused to write because target sources are unknown:\n${details}`);
	}

	const pending = states.filter(({state}) => state === 'original');
	const staged = [];
	const committed = [];
	try {
		for (const item of pending) {
			const temporaryPath = `${item.absolutePath}.qq-cli-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`;
			writeFileSync(temporaryPath, item.target.patched, {flag: 'wx'});
			staged.push({...item, temporaryPath});
		}
		for (const item of staged) {
			renameSync(item.temporaryPath, item.absolutePath);
			committed.push(item);
		}
	} catch (error) {
		for (const item of committed.reverse()) {
			const rollbackPath = `${item.absolutePath}.qq-cli-${process.pid}-${Math.random().toString(16).slice(2)}.rollback`;
			writeFileSync(rollbackPath, item.source, {flag: 'wx'});
			renameSync(rollbackPath, item.absolutePath);
		}
		throw new Error(`Failed to apply the Ink cache patch: ${error.message}`, {cause: error});
	} finally {
		for (const item of staged) {
			try {
				unlinkSync(item.temporaryPath);
			} catch (error) {
				if (error.code !== 'ENOENT') {
					throw error;
				}
			}
		}
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		patchInkCaches();
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
