(function () {
    'use strict';

    const maxImageCount = "ALL_PHOTOS";
    const autoZoom = 0.25;

    const TIME_CONFIG = {
        restore_cycle: 10000,
        press_button_delay: 2000
    };

    const MAX_CHECKBOX_RETRIES = 10;
    const CHECKBOX_RETRY_DELAY = 1000;
    const MAX_DIALOGS = 3;

    const SELECTORS = {
        toolbarContainer: 'header, [role="toolbar"], div[aria-label*="Selected" i], div[aria-label*="seleccionad" i]',
        restoreButton: 'button[aria-label*="Restore" i], button[data-tooltip*="Restore" i], button[aria-label*="Restaurar" i], button[aria-label*="Restaurer" i], button[aria-label*="Wiederherstellen" i], button[aria-label*="Ripristina" i], button[aria-label*="Восстановить" i], button[aria-label*="복원" i], button[aria-label*="復元" i], button[aria-label*="恢复" i]'
    };

    const RESTORE_TEXTS = [
        'restore', 'restaurar', 'restaurer', 'wiederherstellen', 'ripristina',
        'восстановить', '복원', '復元', '恢复', 'ok', 'continue'
    ];

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

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\    /* @include common.js */');

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

    const runtime = createRuntime({
        stateKey: '__googlePhotosRestoreState',
        stopFnName: 'stopGooglePhotosRestore',
        taskLabel: 'Google Photos Restore Tool',
        manageZoom: true,
        initialCounts: { imageCount: 0 }
    });
    const { state, wait, restoreZoom } = runtime;

    if (autoZoom && typeof autoZoom === 'number') {
        try {
            document.body.style.zoom = String(autoZoom);
            console.log(`[INFO] Auto-zoom set to ${Math.round(autoZoom * 100)}% to fit more photos per batch.`);
        } catch (e) {}
    }

    async function waitForRestoreProgress(timeout = 10000) {
        await wait(600);
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && state.isRunning) {
            const notifications = [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]')];
            const busy = notifications.some((el) => {
                if (!isVisible(el)) return false;
                const text = (el.innerText || el.textContent || '').toLowerCase();
                return text.includes('restoring') || text.includes('restaurando') || text.includes('restauration') || text.includes('wiederherstellung');
            });
            if (!busy) break;
            await wait(500);
        }
    }

    async function confirmRestore() {
        for (let index = 0; index < MAX_DIALOGS; index++) {
            if (!state.isRunning) return false;

            const timeout = index === 0 ? TIME_CONFIG.press_button_delay + 2000 : Math.min(TIME_CONFIG.press_button_delay, 1000);
            const dialog = await waitForDialog(runtime, timeout);

            if (!state.isRunning) return false;

            if (!dialog) {
                return true;
            }

            const confirmButton = findConfirmButton(dialog, RESTORE_TEXTS);
            if (!confirmButton) {
                console.warn('[WARN] Modal detected but could not locate a matching confirmation button (fail-closed).');
                return false;
            }

            const buttonLabel = labelOf(confirmButton);
            confirmButton.click();
            console.log(`[INFO] Confirmed restore dialog ${index + 1}: "${buttonLabel}"`);

            await waitForDialogClose(runtime, dialog, 5000);
        }

        if (!state.isRunning) return false;

        await waitForRestoreProgress();
        return true;
    }

    function clickRestoreButton() {
        try {
            const btns = document.querySelectorAll(SELECTORS.restoreButton);
            for (const btn of btns) {
                if (isVisible(btn) && !btn.closest('nav, aside, [role="navigation"]')) {
                    btn.click();
                    return true;
                }
            }
        } catch (e) {}

        const toolbars = document.querySelectorAll(SELECTORS.toolbarContainer);
        for (const toolbar of toolbars) {
            if (isVisible(toolbar)) {
                const buttons = toolbar.querySelectorAll('button, [role="button"]');
                for (const btn of buttons) {
                    if (isVisible(btn) && labelMatches(btn, RESTORE_TEXTS)) {
                        btn.click();
                        return true;
                    }
                }
            }
        }

        console.warn('[WARN] Restore button not found in toolbar. Retrying in next cycle...');
        return false;
    }

    async function restoreCycle() {
        if (!state.isRunning || state.cycleInProgress) return;
        state.cycleInProgress = true;

        try {
            let attemptCount = 0;
            let checkboxes = [];

            while (attemptCount < MAX_CHECKBOX_RETRIES && state.isRunning) {
                checkboxes = findCheckboxes();
                if (checkboxes.length > 0) break;

                window.scrollBy(0, 300);
                await wait(CHECKBOX_RETRY_DELAY);
                attemptCount++;
            }

            if (!state.isRunning) return;

            if (checkboxes.length === 0) {
                console.log('[INFO] No more photos found in Trash.');
                state.finish();
                console.log(`[SUCCESS] Restore completed! Total restored: ${state.imageCount} photos. Tool exited.`);
                return;
            }

            let targetBatchCount = checkboxes.length;
            if (maxImageCount !== "ALL_PHOTOS") {
                const maxInt = parseInt(maxImageCount, 10);
                const remaining = Math.max(0, maxInt - state.imageCount);
                if (remaining <= 0) {
                    state.finish();
                    console.log(`[SUCCESS] Target of ${maxImageCount} photos already restored. Tool exited.`);
                    return;
                }
                targetBatchCount = Math.min(checkboxes.length, remaining);
            }

            const targetCheckboxes = checkboxes.slice(0, targetBatchCount);
            const toSelect = targetCheckboxes.filter((cb) => cb.getAttribute('aria-checked') !== 'true');
            toSelect.forEach((cb) => cb.click());
            console.log(`[INFO] Selected ${targetBatchCount} photos (${toSelect.length} newly clicked).`);

            await wait(TIME_CONFIG.press_button_delay);
            if (!state.isRunning) return;

            if (!clickRestoreButton()) {
                return;
            }

            const confirmed = await confirmRestore();
            if (!confirmed || !state.isRunning) {
                return;
            }

            state.imageCount += targetBatchCount;
            const targetDisplay = maxImageCount === "ALL_PHOTOS" ? "All" : maxImageCount;
            console.log(`[INFO] Restored batch. Total so far: ${state.imageCount} / ${targetDisplay}`);

            if (maxImageCount !== "ALL_PHOTOS" && state.imageCount >= parseInt(maxImageCount, 10)) {
                state.finish();
                console.log(`[SUCCESS] Target of ${maxImageCount} photos restored as requested. Tool exited.`);
                return;
            }
        } catch (err) {
            console.error('[ERROR] Unexpected error in restore cycle:', err);
        } finally {
            state.cycleInProgress = false;
            if (!state.isRunning) {
                restoreZoom();
            }
        }
    }

    if (!window.location.href.includes('/trash')) {
        console.warn('[TIP] Make sure you are on https://photos.google.com/trash before running this restore tool.');
    }

    console.log('==================================================');
    console.log('  Google Photos Restore Tool');
    console.log('  Target: ' + (maxImageCount === "ALL_PHOTOS" ? "All photos in trash" : maxImageCount + " photos"));
    console.log('  Cycle delay: ' + TIME_CONFIG.restore_cycle + 'ms');
    console.log('  To stop anytime, type: stopGooglePhotosRestore()');
    console.log('==================================================');

    async function runRestoreLoop() {
        while (state.isRunning) {
            await restoreCycle();
            if (!state.isRunning) break;
            await wait(TIME_CONFIG.restore_cycle);
        }
    }

    runRestoreLoop();
})();
