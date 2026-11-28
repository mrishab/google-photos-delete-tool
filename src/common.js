const COMMON_SELECTORS = {
    checkboxPrimary: '[role="checkbox"]',
    checkboxFallback: '.ckGgle',
    dialog: '[aria-modal="true"], [role="alertdialog"], [role="dialog"]',
    dialogDefaultButton: 'button[data-mdc-dialog-button-default], [data-mdc-dialog-button-default], [data-mdc-dialog-action="accept"], [data-mdc-dialog-action="ok"]'
};

const COMMON_CANCEL_TEXTS = [
    'cancel', 'close', 'learn more', 'dismiss', 'back', 'keep', 'undo', 'no thanks',
    'cancelar', 'annuler', 'abbrechen', 'annulla', 'отмена', '취소', 'キャンセル', '取消'
];

function createRuntime({ stateKey, stopFnName, taskLabel, manageZoom = false, initialCounts = {} }) {
    const prev = window[stateKey];
    if (prev && typeof prev.stop === 'function') {
        prev.stop({ silentIfStopped: true, reason: `Stopped previously active ${taskLabel} task.` });
    } else if (prev && prev.isRunning) {
        prev.isRunning = false;
    }

    const activeTimers = new Set();
    const activeCleanups = new Set();

    const state = Object.assign({
        isRunning: true,
        cycleInProgress: false,
        originalZoom: manageZoom ? (document.body.style.zoom || '') : undefined
    }, initialCounts);

    function restoreZoom() {
        if (manageZoom && state.originalZoom !== undefined) {
            try { document.body.style.zoom = state.originalZoom; } catch (e) {}
        }
    }

    function cleanupAll() {
        for (const entry of [...activeTimers]) {
            clearTimeout(entry.id);
            activeTimers.delete(entry);
            try { entry.resolve(); } catch (e) {}
        }
        for (const fn of [...activeCleanups]) {
            activeCleanups.delete(fn);
            try { fn(); } catch (e) {}
        }
        restoreZoom();
    }

    state.stop = function ({ silentIfStopped = false, reason } = {}) {
        if (state.isRunning) {
            state.isRunning = false;
            cleanupAll();
            console.log(reason ? `[INFO] ${reason}` : `[INFO] ${taskLabel} stopped by user.`);
        } else if (!silentIfStopped) {
            console.log(`[INFO] No active ${taskLabel} task is currently running.`);
        }
    };

    state.finish = function () {
        state.isRunning = false;
        cleanupAll();
    };

    window[stateKey] = state;
    window[stopFnName] = () => state.stop();

    const wait = (ms) => new Promise((resolve) => {
        if (!state.isRunning) return resolve();
        const entry = { id: null, resolve };
        entry.id = setTimeout(() => {
            activeTimers.delete(entry);
            resolve();
        }, ms);
        activeTimers.add(entry);
    });

    const registerCleanup = (fn) => {
        activeCleanups.add(fn);
        return () => activeCleanups.delete(fn);
    };

    return { state, wait, registerCleanup, restoreZoom };
}

const isVisible = (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    return element.getClientRects().length > 0;
};

const labelOf = (element) =>
    (element.getAttribute('aria-label') ||
     element.getAttribute('data-tooltip') ||
     element.getAttribute('title') ||
     element.innerText ||
     element.textContent || '').replace(/\s+/g, ' ').trim();

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const textMatchesLabel = (label, text) => {
    const needle = text.toLowerCase();
    if (!label || !needle) return false;
    if (label === needle) return true;
    if (/^[\p{Script=Latin}\p{Script=Cyrillic}\s]+$/u.test(needle)) {
        try {
            const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(needle)}(?![\\p{L}\\p{N}])`, 'u');
            return pattern.test(label);
        } catch (e) {
            return label.includes(needle);
        }
    }
    return label.includes(needle);
};

const labelMatches = (element, texts) => {
    const label = labelOf(element).toLowerCase();
    return texts.some((text) => textMatchesLabel(label, text));
};

const findCheckboxes = () => {
    const excluded = 'nav, aside, [role="navigation"], [role="dialog"], [role="alertdialog"]';
    const primary = [...document.querySelectorAll(COMMON_SELECTORS.checkboxPrimary)]
        .filter((el) => isVisible(el) && !el.closest(excluded));
    if (primary.length > 0) return primary;
    return [...document.querySelectorAll(COMMON_SELECTORS.checkboxFallback)].filter(isVisible);
};

const findVisibleDialog = (dialogSelector = COMMON_SELECTORS.dialog) =>
    [...document.querySelectorAll(dialogSelector)].find(isVisible) || null;

function waitForDialog(runtime, timeout, dialogSelector = COMMON_SELECTORS.dialog) {
    if (!runtime.state.isRunning) return Promise.resolve(null);

    const existing = findVisibleDialog(dialogSelector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
        let settled = false;
        let observer = null;
        let timerId = null;
        let unregisterCleanup = null;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            if (unregisterCleanup) {
                unregisterCleanup();
                unregisterCleanup = null;
            }
            resolve(runtime.state.isRunning ? result : null);
        };

        unregisterCleanup = runtime.registerCleanup(() => finish(null));

        observer = new MutationObserver(() => {
            if (!runtime.state.isRunning) {
                finish(null);
                return;
            }
            const dialog = findVisibleDialog(dialogSelector);
            if (dialog) {
                finish(dialog);
            }
        });

        const target = document.body || document.documentElement;
        if (target) {
            observer.observe(target, { childList: true, subtree: true, attributes: true });
        }

        timerId = setTimeout(() => {
            finish(findVisibleDialog(dialogSelector));
        }, timeout);
    });
}

function waitForDialogClose(runtime, dialog, timeout = 5000) {
    if (!runtime.state.isRunning || !dialog || !document.contains(dialog) || !isVisible(dialog)) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let settled = false;
        let observer = null;
        let timerId = null;
        let unregisterCleanup = null;

        const finish = () => {
            if (settled) return;
            settled = true;
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            if (unregisterCleanup) {
                unregisterCleanup();
                unregisterCleanup = null;
            }
            resolve();
        };

        unregisterCleanup = runtime.registerCleanup(finish);

        observer = new MutationObserver(() => {
            if (!runtime.state.isRunning || !document.contains(dialog) || !isVisible(dialog)) {
                finish();
            }
        });

        const target = document.body || document.documentElement;
        if (target) {
            observer.observe(target, { childList: true, subtree: true, attributes: true });
        }

        timerId = setTimeout(finish, timeout);
    });
}

function findConfirmButton(dialog, confirmTexts, cancelTexts = COMMON_CANCEL_TEXTS) {
    const candidates = [...dialog.querySelectorAll('button, [role="button"]')]
        .filter(isVisible)
        .filter((button) => !labelMatches(button, cancelTexts));

    const marked = candidates.find((button) => {
        try { return button.matches(COMMON_SELECTORS.dialogDefaultButton); } catch (e) { return false; }
    });
    if (marked) return marked;

    for (const text of confirmTexts) {
        const exactHit = candidates.find((button) => labelOf(button).toLowerCase() === text.toLowerCase());
        if (exactHit) return exactHit;
    }

    for (const text of confirmTexts) {
        const hit = candidates.find((button) => labelMatches(button, [text]));
        if (hit) return hit;
    }

    return null;
}
