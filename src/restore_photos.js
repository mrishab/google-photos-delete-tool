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

    /* @include common.js */

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
