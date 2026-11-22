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
        checkbox: '.ckGgle',
        toolbarContainer: 'header, [role="toolbar"], div[data-delete-origin], div[aria-label*="Selected" i]',
        languageAgnosticDeleteButton: 'div[data-delete-origin] button',
        deleteButton: 'button[aria-label="Delete"], button[data-tooltip*="Delete" i], button[aria-label*="Trash" i], button[aria-label*="Move to trash" i], button[aria-label*="Move to bin" i]',
        dialog: '[aria-modal="true"], [role="alertdialog"], [role="dialog"]',
        dialogDefaultButton: 'button[data-mdc-dialog-button-default], [data-mdc-dialog-button-default], [data-mdc-dialog-action="accept"], [data-mdc-dialog-action="ok"]'
    };

    const CONFIRM_TEXTS = [
        'move to trash', 'move to bin', 'delete', 'ok', 'got it', 'continue', 'trash', 'bin', 'remove',
        'mover a la papelera', 'eliminar', 'supprimer', 'placer dans la corbeille', 'löschen',
        'in den papierkorb verschieben', 'sposta nel cestino', 'elimina', 'mover para a lixeira',
        'excluir', 'verwijderen', 'удалить', 'в корзину', '삭제', '휴지통', '削除', 'ゴミ箱',
        '移至回收站', '移到废纸篓'
    ];

    const CANCEL_TEXTS = [
        'cancel', 'close', 'learn more', 'dismiss', 'back', 'keep', 'undo', 'no thanks',
        'cancelar', 'annuler', 'abbrechen', 'annulla', 'отмена', '취소', 'キャンセル', '取消'
    ];

    if (window.__googlePhotosDeleteState && window.__googlePhotosDeleteState.isRunning) {
        window.__googlePhotosDeleteState.isRunning = false;
        if (window.__googlePhotosDeleteState.timerId) {
            clearTimeout(window.__googlePhotosDeleteState.timerId);
            window.__googlePhotosDeleteState.timerId = null;
        }
        if (window.__googlePhotosDeleteState.originalZoom !== undefined) {
            try { document.body.style.zoom = window.__googlePhotosDeleteState.originalZoom; } catch (e) {}
        }
        console.log('[INFO] Stopped previously active deletion task.');
    }

    const state = {
        isRunning: true,
        imageCount: 0,
        cycleInProgress: false,
        timerId: null,
        originalZoom: document.body.style.zoom || ''
    };
    window.__googlePhotosDeleteState = state;

    if (autoZoom && typeof autoZoom === 'number') {
        try {
            document.body.style.zoom = String(autoZoom);
            console.log(`[INFO] Auto-zoom set to ${Math.round(autoZoom * 100)}% to fit more photos per batch.`);
        } catch (e) {}
    }

    window.stopGooglePhotosDelete = function () {
        if (state.isRunning) {
            state.isRunning = false;
            if (state.timerId) {
                clearTimeout(state.timerId);
                state.timerId = null;
            }
            if (state.originalZoom !== undefined) {
                try { document.body.style.zoom = state.originalZoom; } catch (e) {}
            }
            console.log('[INFO] Google Photos Delete Tool stopped by user.');
        } else {
            console.log('[INFO] No active deletion task is currently running.');
        }
    };

    const wait = (ms) => new Promise((resolve) => {
        if (!state.isRunning) return resolve();
        state.timerId = setTimeout(() => {
            state.timerId = null;
            resolve();
        }, ms);
    });

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
         element.textContent || '').trim();

    const labelMatches = (element, texts) => {
        const label = labelOf(element).toLowerCase();
        return texts.some((text) => label.includes(text.toLowerCase()));
    };

    const findVisibleDialog = () =>
        [...document.querySelectorAll(SELECTORS.dialog)].find(isVisible) || null;

    async function waitForDialog(timeout) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && state.isRunning) {
            const dialog = findVisibleDialog();
            if (dialog) return dialog;
            await wait(250);
        }
        return findVisibleDialog();
    }

    function findConfirmButton(dialog) {
        const candidates = [...dialog.querySelectorAll('button, [role="button"]')]
            .filter(isVisible)
            .filter((button) => !labelMatches(button, CANCEL_TEXTS));

        const marked = candidates.find((button) => {
            try { return button.matches(SELECTORS.dialogDefaultButton); } catch (e) { return false; }
        });
        if (marked) return marked;

        for (const text of CONFIRM_TEXTS) {
            const hit = candidates.find((button) => labelMatches(button, [text]));
            if (hit) return hit;
        }

        return candidates[candidates.length - 1] || null;
    }

    async function waitForDeletionProgress(timeout = 5000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && state.isRunning) {
            const notifications = [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]')];
            const busy = notifications.some((el) => {
                if (!isVisible(el)) return false;
                const text = (el.innerText || el.textContent || '').toLowerCase();
                return text.includes('moving') || text.includes('deleting') || text.includes('déplacement') || text.includes('verschoben');
            });
            if (!busy) break;
            await wait(500);
        }
    }

    async function confirmDeletion() {
        for (let index = 0; index < MAX_DIALOGS; index++) {
            if (!state.isRunning) return false;

            const timeout = index === 0 ? TIME_CONFIG.press_button_delay + 3000 : Math.min(TIME_CONFIG.press_button_delay, 1000);
            const dialog = await waitForDialog(timeout);

            if (!state.isRunning) return false;

            if (!dialog) {
                if (index === 0) {
                    console.warn('[WARN] Confirmation dialog did not appear. Retrying in next cycle...');
                    return false;
                }
                return true;
            }

            const confirmButton = findConfirmButton(dialog);
            if (!confirmButton) {
                console.warn('[WARN] Modal detected but could not locate confirmation button. Please click manually if visible.');
                return false;
            }

            const buttonLabel = labelOf(confirmButton);
            confirmButton.click();
            console.log(`[INFO] Confirmed dialog ${index + 1}: "${buttonLabel}"`);

            for (let i = 0; i < 20 && document.contains(dialog) && isVisible(dialog) && state.isRunning; i++) {
                await wait(250);
            }
        }

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
                        if (labelMatches(btn, CONFIRM_TEXTS) || labelMatches(btn, ['delete', 'trash', 'bin'])) {
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
                checkboxes = [...document.querySelectorAll(SELECTORS.checkbox)].filter(isVisible);
                if (checkboxes.length > 0) break;

                window.scrollBy(0, 300);
                await wait(CHECKBOX_RETRY_DELAY);
                attemptCount++;
            }

            if (!state.isRunning) return;

            if (attemptCount > 0 && checkboxes.length > 0) {
                window.scrollTo(0, 0);
            }

            if (checkboxes.length === 0) {
                console.log('[INFO] No more photos found.');
                state.isRunning = false;
                if (state.originalZoom !== undefined) {
                    try { document.body.style.zoom = state.originalZoom; } catch (e) {}
                }
                console.log(`[SUCCESS] Deletion completed! Total deleted: ${state.imageCount} photos. Tool exited.`);
                return;
            }

            const toSelect = checkboxes.filter((cb) => cb.getAttribute('aria-checked') !== 'true');
            toSelect.forEach((cb) => cb.click());
            console.log(`[INFO] Selected ${checkboxes.length} photos (${toSelect.length} newly clicked).`);

            await wait(TIME_CONFIG.press_button_delay);
            if (!state.isRunning) return;

            if (!clickDeleteButton()) {
                return;
            }

            const confirmed = await confirmDeletion();
            if (!confirmed || !state.isRunning) {
                return;
            }

            state.imageCount += checkboxes.length;
            const targetDisplay = maxImageCount === "ALL_PHOTOS" ? "All" : maxImageCount;
            console.log(`[INFO] Deleted batch. Total so far: ${state.imageCount} / ${targetDisplay}`);

            if (maxImageCount !== "ALL_PHOTOS" && state.imageCount >= parseInt(maxImageCount, 10)) {
                state.isRunning = false;
                if (state.originalZoom !== undefined) {
                    try { document.body.style.zoom = state.originalZoom; } catch (e) {}
                }
                console.log(`[SUCCESS] Target of ${maxImageCount} photos deleted as requested. Tool exited.`);
                return;
            }
        } catch (err) {
            console.error('[ERROR] Unexpected error in deletion cycle:', err);
        } finally {
            state.cycleInProgress = false;
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
