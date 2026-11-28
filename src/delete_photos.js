(function () {
    'use strict';

    const maxImageCount = "ALL_PHOTOS";
    const autoZoom = 0.25;

    const TIME_CONFIG = {
        delete_cycle: 10000,
        press_button_delay: 2000
    };

    const MAX_CHECKBOX_RETRIES = 10;
    const CHECKBOX_RETRY_DELAY = 1000;
    const MAX_DIALOGS = 3;

    const SELECTORS = {
        toolbarContainer: 'header, [role="toolbar"], div[data-delete-origin], div[aria-label*="Selected" i], div[aria-label*="seleccionad" i], div[aria-label*="sélectionné" i], div[aria-label*="ausgewählt" i]',
        languageAgnosticDeleteButton: 'div[data-delete-origin] button',
        deleteButton: 'button[aria-label="Delete"], button[data-tooltip*="Delete" i], button[aria-label*="Trash" i], button[aria-label*="Move to trash" i], button[aria-label*="Move to bin" i], button[aria-label*="papelera" i], button[aria-label*="corbeille" i], button[aria-label*="löschen" i], button[aria-label*="cestino" i], button[aria-label*="lixeira" i], button[aria-label*="удалить" i], button[aria-label*="휴지통" i], button[aria-label*="ゴミ箱" i], button[aria-label*="回收站" i]'
    };

    const CONFIRM_TEXTS = [
        'move to trash', 'move to bin', 'delete', 'ok', 'got it', 'entendido', 'continue', 'trash', 'bin', 'remove',
        'mover a la papelera', 'eliminar', 'supprimer', 'placer dans la corbeille', 'löschen',
        'in den papierkorb verschieben', 'sposta nel cestino', 'elimina', 'mover para a lixeira',
        'excluir', 'verwijderen', 'удалить', 'в корзину', '삭제', '휴지통', '削除', 'ゴミ箱',
        '移至回收站', '移到废纸篓'
    ];

    /* @include common.js */

    const runtime = createRuntime({
        stateKey: '__googlePhotosDeleteState',
        stopFnName: 'stopGooglePhotosDelete',
        taskLabel: 'Google Photos Delete Tool',
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

    async function waitForDeletionProgress(timeout = 10000) {
        await wait(600);
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && state.isRunning) {
            const notifications = [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]')];
            const busy = notifications.some((el) => {
                if (!isVisible(el)) return false;
                const text = (el.innerText || el.textContent || '').toLowerCase();
                return text.includes('moving') || text.includes('deleting') || text.includes('déplacement') ||
                       text.includes('verschoben') || text.includes('spostamento') || text.includes('movendo') ||
                       text.includes('перемещение') || text.includes('이동 중') || text.includes('移動中') ||
                       text.includes('正在移动') || text.includes('borrando');
            });
            if (!busy) break;
            await wait(500);
        }
    }

    async function confirmDeletion() {
        for (let index = 0; index < MAX_DIALOGS; index++) {
            if (!state.isRunning) return false;

            const timeout = index === 0 ? TIME_CONFIG.press_button_delay + 3000 : Math.min(TIME_CONFIG.press_button_delay, 1000);
            const dialog = await waitForDialog(runtime, timeout);

            if (!state.isRunning) return false;

            if (!dialog) {
                if (index === 0) {
                    console.warn('[WARN] Confirmation dialog did not appear. Retrying in next cycle...');
                    return false;
                }
                return true;
            }

            const confirmButton = findConfirmButton(dialog, CONFIRM_TEXTS);
            if (!confirmButton) {
                console.warn('[WARN] Modal detected but could not locate a matching confirmation button (fail-closed). Please click manually if visible.');
                return false;
            }

            const buttonLabel = labelOf(confirmButton);
            confirmButton.click();
            console.log(`[INFO] Confirmed dialog ${index + 1}: "${buttonLabel}"`);

            await waitForDialogClose(runtime, dialog, 5000);
        }

        if (!state.isRunning) return false;

        if (findVisibleDialog()) {
            console.warn('[WARN] A dialog is still open after handling confirmations. Retrying in next cycle.');
            return false;
        }

        await waitForDeletionProgress();
        return true;
    }

    function clickDeleteButton() {
        try {
            const deleteBtn = document.querySelector(SELECTORS.languageAgnosticDeleteButton);
            if (deleteBtn && isVisible(deleteBtn)) {
                deleteBtn.click();
                return true;
            }
        } catch (e) {}

        try {
            const btns = document.querySelectorAll(SELECTORS.deleteButton);
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
                    if (isVisible(btn)) {
                        if (labelMatches(btn, CONFIRM_TEXTS) || labelMatches(btn, ['delete', 'trash', 'bin', 'papelera', 'corbeille', 'löschen', 'cestino', 'lixeira', 'verwijderen', 'удалить', '휴지통', 'ゴミ箱', '回收站', '废纸篓'])) {
                            btn.click();
                            return true;
                        }
                    }
                }
            }
        }

        console.warn('[WARN] Delete button not found in toolbar. Retrying in next cycle...');
        return false;
    }

    async function deletionCycle() {
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
                console.log('[INFO] No more photos found.');
                state.finish();
                console.log(`[SUCCESS] Deletion completed! Total deleted: ${state.imageCount} photos. Tool exited.`);
                return;
            }

            let targetBatchCount = checkboxes.length;
            if (maxImageCount !== "ALL_PHOTOS") {
                const maxInt = parseInt(maxImageCount, 10);
                const remaining = Math.max(0, maxInt - state.imageCount);
                if (remaining <= 0) {
                    state.finish();
                    console.log(`[SUCCESS] Target of ${maxImageCount} photos already reached. Tool exited.`);
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

            if (!clickDeleteButton()) {
                return;
            }

            const confirmed = await confirmDeletion();
            if (!confirmed || !state.isRunning) {
                return;
            }

            state.imageCount += targetBatchCount;
            const targetDisplay = maxImageCount === "ALL_PHOTOS" ? "All" : maxImageCount;
            console.log(`[INFO] Deleted batch. Total so far: ${state.imageCount} / ${targetDisplay}`);

            if (maxImageCount !== "ALL_PHOTOS" && state.imageCount >= parseInt(maxImageCount, 10)) {
                state.finish();
                console.log(`[SUCCESS] Target of ${maxImageCount} photos deleted as requested. Tool exited.`);
                return;
            }
        } catch (err) {
            console.error('[ERROR] Unexpected error in deletion cycle:', err);
        } finally {
            state.cycleInProgress = false;
            if (!state.isRunning) {
                restoreZoom();
            }
        }
    }

    const isEnglish = window.location.search.includes('hl=en') || (document.documentElement && document.documentElement.lang && document.documentElement.lang.startsWith('en'));
    if (!isEnglish) {
        console.warn('[TIP] For best results and maximum selector compatibility, use the English interface: https://photos.google.com/?hl=en');
    }

    console.log('==================================================');
    console.log('  Google Photos Delete Tool');
    console.log('  Target: ' + (maxImageCount === "ALL_PHOTOS" ? "All photos" : maxImageCount + " photos"));
    console.log('  Cycle delay: ' + TIME_CONFIG.delete_cycle + 'ms');
    console.log('  To stop anytime, type: stopGooglePhotosDelete()');
    console.log('==================================================');

    async function runLoop() {
        while (state.isRunning) {
            await deletionCycle();
            if (!state.isRunning) break;
            await wait(TIME_CONFIG.delete_cycle);
        }
    }

    runLoop();
})();
