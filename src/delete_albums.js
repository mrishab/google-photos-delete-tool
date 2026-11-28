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
        menuItem: '[role="menuitem"], .z80M1, div[data-action="delete"]'
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

    const SYSTEM_ALBUM_PATTERNS = [
        '/favorites', '/trash', '/archive', '/utilities', '/explore',
        '/places', '/things', '/people', '/sharing'
    ];

    /* @include common.js */

    const runtime = createRuntime({
        stateKey: '__googlePhotosAlbumDeleteState',
        stopFnName: 'stopGooglePhotosAlbumDelete',
        taskLabel: 'Google Photos Album Delete Tool',
        manageZoom: false,
        initialCounts: { albumCount: 0 }
    });
    const { state, wait } = runtime;

    async function deleteNextAlbum() {
        if (!state.isRunning || state.cycleInProgress) return;
        state.cycleInProgress = true;

        try {
            let attemptCount = 0;
            let albumCards = [];

            while (attemptCount < MAX_ALBUM_RETRIES && state.isRunning) {
                albumCards = [...document.querySelectorAll(SELECTORS.albumCard)]
                    .filter(isVisible)
                    .filter((el) => !el.hasAttribute('data-skip-album'))
                    .filter((el) => {
                        const href = el.getAttribute('href') || (el.querySelector('a') && el.querySelector('a').getAttribute('href')) || '';
                        return !SYSTEM_ALBUM_PATTERNS.some((p) => href.toLowerCase().includes(p));
                    });
                if (albumCards.length > 0) break;
                window.scrollBy(0, 300);
                await wait(ALBUM_RETRY_DELAY);
                attemptCount++;
            }

            if (!state.isRunning) return;

            if (albumCards.length === 0) {
                console.log('[INFO] No more albums found.');
                state.finish();
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
                console.warn('[WARN] Could not find "Delete album" in menu for this card. Marking as skipped and proceeding...');
                targetCard.setAttribute('data-skip-album', 'true');
                document.body.click();
                return;
            }

            deleteOption.click();

            const dialog = await waitForDialog(runtime, TIME_CONFIG.press_button_delay + 2000);
            if (!state.isRunning) return;
            if (!dialog) {
                console.warn('[WARN] Confirmation dialog did not appear for album deletion. Marking as skipped...');
                targetCard.setAttribute('data-skip-album', 'true');
                return;
            }

            const confirmBtn = findConfirmButton(dialog, CONFIRM_TEXTS);
            if (!confirmBtn) {
                console.warn('[WARN] Confirmation button not found in album deletion dialog (fail-closed). Marking as skipped...');
                targetCard.setAttribute('data-skip-album', 'true');
                return;
            }

            confirmBtn.click();
            console.log(`[INFO] Confirmed deletion of album: "${labelOf(confirmBtn)}"`);

            await waitForDialogClose(runtime, dialog, 5000);
            if (!state.isRunning) return;

            state.albumCount++;
            const targetDisplay = maxAlbumCount === "ALL_ALBUMS" ? "All" : maxAlbumCount;
            console.log(`[INFO] Deleted album. Total so far: ${state.albumCount} / ${targetDisplay}`);

            if (maxAlbumCount !== "ALL_ALBUMS" && state.albumCount >= parseInt(maxAlbumCount, 10)) {
                state.finish();
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
