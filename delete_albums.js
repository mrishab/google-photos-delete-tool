(function () {
    'use strict';

    const maxAlbumCount = "ALL_ALBUMS";

    const TIME_CONFIG = {
        delete_cycle: 4000,
        press_button_delay: 1500
    };

    const MAX_ALBUM_RETRIES = 10;
    const ALBUM_RETRY_DELAY = 1000;

    const SELECTORS = {
        albumCard: 'a[href*="./album/"], a[href^="/album/"], div[role="listitem"]',
        albumMenuButton: 'button[aria-label*="options" i], button[aria-label*="menu" i], button[data-tooltip*="options" i], .U26fgb',
        menuItem: '[role="menuitem"], .z80M1, div[data-action="delete"]',
        dialog: '[aria-modal="true"], [role="alertdialog"], [role="dialog"]',
        dialogDefaultButton: 'button[data-mdc-dialog-button-default], [data-mdc-dialog-action="accept"], [data-mdc-dialog-action="ok"]'
    };

    const DELETE_ALBUM_TEXTS = [
        'delete album', 'supprimer l\'album', 'álbum eliminar', 'album löschen',
        'elimina album', 'excluir álbum', 'album verwijderen', 'удалить альбом',
        '앨범 삭제', 'アルバムを削除', '删除相册'
    ];

    const CONFIRM_TEXTS = [
        'delete', 'supprimer', 'eliminar', 'löschen', 'elimina', 'excluir',
        'verwijderen', 'удалить', '삭제', '削除', '删除', 'ok'
    ];

    const CANCEL_TEXTS = [
        'cancel', 'annuler', 'cancelar', 'abbrechen', 'annulla', 'отмена', '취소', 'キャンセル', '取消'
    ];

    if (window.__googlePhotosAlbumDeleteState && window.__googlePhotosAlbumDeleteState.isRunning) {
        window.__googlePhotosAlbumDeleteState.isRunning = false;
        if (window.__googlePhotosAlbumDeleteState.timerId) {
            clearTimeout(window.__googlePhotosAlbumDeleteState.timerId);
            window.__googlePhotosAlbumDeleteState.timerId = null;
        }
        console.log('[INFO] Stopped previously active album deletion task.');
    }

    const state = {
        isRunning: true,
        albumCount: 0,
        cycleInProgress: false,
        timerId: null
    };
    window.__googlePhotosAlbumDeleteState = state;

    window.stopGooglePhotosAlbumDelete = function () {
        if (state.isRunning) {
            state.isRunning = false;
            if (state.timerId) {
                clearTimeout(state.timerId);
                state.timerId = null;
            }
            console.log('[INFO] Google Photos Album Delete Tool stopped by user.');
        } else {
            console.log('[INFO] No active album deletion task is currently running.');
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

    async function deleteNextAlbum() {
        if (!state.isRunning || state.cycleInProgress) return;
        state.cycleInProgress = true;

        try {
            let attemptCount = 0;
            let albumCards = [];

            while (attemptCount < MAX_ALBUM_RETRIES && state.isRunning) {
                albumCards = [...document.querySelectorAll(SELECTORS.albumCard)].filter(isVisible);
                if (albumCards.length > 0) break;
                window.scrollBy(0, 300);
                await wait(ALBUM_RETRY_DELAY);
                attemptCount++;
            }

            if (!state.isRunning) return;

            if (albumCards.length === 0) {
                console.log('[INFO] No more albums found.');
                state.isRunning = false;
                console.log(`[SUCCESS] Album deletion completed! Total deleted: ${state.albumCount} albums. Tool exited.`);
                return;
            }

            const targetCard = albumCards[0];
            targetCard.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));

            let menuButton = targetCard.querySelector(SELECTORS.albumMenuButton) ||
                             [...targetCard.querySelectorAll('button')].find(isVisible);

            if (!menuButton) {
                const parent = targetCard.parentElement;
                if (parent) {
                    menuButton = parent.querySelector(SELECTORS.albumMenuButton);
                }
            }

            if (menuButton) {
                menuButton.click();
            } else {
                targetCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
            }

            await wait(TIME_CONFIG.press_button_delay);
            if (!state.isRunning) return;

            const menuItems = [...document.querySelectorAll(SELECTORS.menuItem)].filter(isVisible);
            const deleteOption = menuItems.find((item) => labelMatches(item, DELETE_ALBUM_TEXTS));

            if (!deleteOption) {
                console.warn('[WARN] Could not find "Delete album" in menu. Skipping to next cycle...');
                document.body.click();
                return;
            }

            deleteOption.click();

            const dialog = await waitForDialog(TIME_CONFIG.press_button_delay + 2000);
            if (!dialog || !state.isRunning) {
                console.warn('[WARN] Confirmation dialog did not appear for album deletion.');
                return;
            }

            const confirmBtn = findConfirmButton(dialog);
            if (!confirmBtn) {
                console.warn('[WARN] Confirmation button not found in album deletion dialog.');
                return;
            }

            confirmBtn.click();
            console.log(`[INFO] Confirmed deletion of album: "${labelOf(confirmBtn)}"`);

            for (let i = 0; i < 20 && document.contains(dialog) && isVisible(dialog) && state.isRunning; i++) {
                await wait(250);
            }

            state.albumCount++;
            const targetDisplay = maxAlbumCount === "ALL_ALBUMS" ? "All" : maxAlbumCount;
            console.log(`[INFO] Deleted album. Total so far: ${state.albumCount} / ${targetDisplay}`);

            if (maxAlbumCount !== "ALL_ALBUMS" && state.albumCount >= parseInt(maxAlbumCount, 10)) {
                state.isRunning = false;
                console.log(`[SUCCESS] Target of ${maxAlbumCount} albums deleted as requested. Tool exited.`);
                return;
            }
        } catch (err) {
            console.error('[ERROR] Unexpected error in album deletion cycle:', err);
        } finally {
            state.cycleInProgress = false;
        }
    }

    if (!window.location.href.includes('/albums')) {
        console.warn('[TIP] Make sure you are on https://photos.google.com/albums before running this tool.');
    }

    console.log('==================================================');
    console.log('  Google Photos Album Delete Tool');
    console.log('  Target: ' + (maxAlbumCount === "ALL_ALBUMS" ? "All albums" : maxAlbumCount + " albums"));
    console.log('  Cycle delay: ' + TIME_CONFIG.delete_cycle + 'ms');
    console.log('  To stop anytime, type: stopGooglePhotosAlbumDelete()');
    console.log('==================================================');

    async function runAlbumLoop() {
        while (state.isRunning) {
            await deleteNextAlbum();
            if (!state.isRunning) break;
            await wait(TIME_CONFIG.delete_cycle);
        }
    }

    runAlbumLoop();
})();
