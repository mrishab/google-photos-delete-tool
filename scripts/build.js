const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

const COMMON_FILE = path.join(SRC_DIR, 'common.js');
const TARGETS = [
    { src: 'delete_photos.js', out: 'delete_photos.js' },
    { src: 'delete_albums.js', out: 'delete_albums.js' },
    { src: 'restore_photos.js', out: 'restore_photos.js' }
];

function indentBlock(text, spaces) {
    const pad = ' '.repeat(spaces);
    return text
        .trimEnd()
        .split('\n')
        .map((line) => (line.length > 0 ? pad + line : ''))
        .join('\n');
}

function isWordChar(ch) {
    return ch !== undefined && /[a-zA-Z0-9_$]/.test(ch);
}

/**
 * Lightweight, zero-dependency JS minifier for bookmarklet generation.
 * Preserves string literals, template literals, and regex literals while
 * removing comments and collapsing whitespace.
 */
function minifyJs(code) {
    let out = '';
    let i = 0;
    const len = code.length;
    let lastNonSpace = '';
    let lastTokenWord = '';

    const canStartRegex = () => {
        if (!lastNonSpace) return true;
        if ('(=:[,!&|?{};~^+-*%<>'.includes(lastNonSpace)) return true;
        return ['return', 'typeof', 'void', 'delete', 'throw', 'case', 'in', 'of', 'new', 'else', 'await', 'yield'].includes(lastTokenWord);
    };

    const emitSpaceIfNeeded = (nextChar) => {
        const prevChar = out[out.length - 1];
        if (!prevChar) return;
        if (isWordChar(prevChar) && isWordChar(nextChar)) {
            out += ' ';
        } else if ((prevChar === '+' && nextChar === '+') || (prevChar === '-' && nextChar === '-')) {
            out += ' ';
        }
    };

    let pendingSpace = false;

    while (i < len) {
        const ch = code[i];
        const next = code[i + 1];

        // Whitespace
        if (/\s/.test(ch)) {
            pendingSpace = true;
            i++;
            continue;
        }

        // Line comment
        if (ch === '/' && next === '/') {
            i += 2;
            while (i < len && code[i] !== '\n') i++;
            pendingSpace = true;
            continue;
        }

        // Block comment
        if (ch === '/' && next === '*') {
            i += 2;
            while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
            i += 2;
            pendingSpace = true;
            continue;
        }

        // String or template literal
        if (ch === '\'' || ch === '"' || ch === '`') {
            if (pendingSpace) {
                emitSpaceIfNeeded(ch);
                pendingSpace = false;
            }
            const quote = ch;
            out += ch;
            i++;
            while (i < len) {
                const c = code[i];
                out += c;
                if (c === '\\' && i + 1 < len) {
                    out += code[i + 1];
                    i += 2;
                    continue;
                }
                i++;
                if (c === quote) break;
            }
            lastNonSpace = quote;
            lastTokenWord = '';
            continue;
        }

        // Regex literal
        if (ch === '/' && canStartRegex()) {
            if (pendingSpace) {
                emitSpaceIfNeeded(ch);
                pendingSpace = false;
            }
            out += ch;
            i++;
            let inCharClass = false;
            while (i < len) {
                const c = code[i];
                out += c;
                if (c === '\\' && i + 1 < len) {
                    out += code[i + 1];
                    i += 2;
                    continue;
                }
                if (c === '[') inCharClass = true;
                else if (c === ']') inCharClass = false;
                i++;
                if (c === '/' && !inCharClass) break;
            }
            while (i < len && /[a-zA-Z]/.test(code[i])) {
                out += code[i++];
            }
            lastNonSpace = '/';
            lastTokenWord = '';
            continue;
        }

        if (pendingSpace) {
            emitSpaceIfNeeded(ch);
            pendingSpace = false;
        }

        out += ch;
        lastNonSpace = ch;

        if (isWordChar(ch)) {
            let j = out.length - 1;
            while (j >= 0 && isWordChar(out[j])) j--;
            lastTokenWord = out.slice(j + 1);
        } else {
            lastTokenWord = '';
        }

        i++;
    }

    return out;
}

function build() {
    const commonSource = fs.readFileSync(COMMON_FILE, 'utf8');
    const indentedCommon = indentBlock(commonSource, 4);

    let deletePhotosOutput = '';

    for (const target of TARGETS) {
        const srcPath = path.join(SRC_DIR, target.src);
        const outPath = path.join(ROOT, target.out);
        const template = fs.readFileSync(srcPath, 'utf8');

        if (!template.includes('/* @include common.js */')) {
            throw new Error(`Missing /* @include common.js */ marker in ${target.src}`);
        }

        const compiled = template.replace('    /* @include common.js */', indentedCommon);
        fs.writeFileSync(outPath, compiled, 'utf8');
        console.log(`[BUILD] Generated ${target.out}`);

        if (target.out === 'delete_photos.js') {
            deletePhotosOutput = compiled;
        }
    }

    const bookmarklet = 'javascript:' + minifyJs(deletePhotosOutput);
    if (!bookmarklet.startsWith('javascript:(function(){')) {
        throw new Error('Generated bookmarklet does not start with javascript:(function(){');
    }

    fs.writeFileSync(path.join(ROOT, 'delete_photos.bookmarklet.js'), bookmarklet + '\n', 'utf8');
    fs.writeFileSync(path.join(ROOT, 'bookmarklet.js'), bookmarklet + '\n', 'utf8');
    console.log('[BUILD] Generated delete_photos.bookmarklet.js and bookmarklet.js');
}

if (require.main === module) {
    build();
}

module.exports = { build };
