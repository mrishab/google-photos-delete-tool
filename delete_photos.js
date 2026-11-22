/**
 * Google Photos Delete Tool
 * https://github.com/mrishab/google-photos-delete-tool
 *
 * Bulk delete photos from Google Photos directly in your browser.
 * Safe, automated, open-source, and runs entirely on your local machine.
 */

(function () {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    // How many photos to delete?
    // Options:
    //   - "ALL_PHOTOS" : Deletes all photos until your library is empty.
    //   - Number (e.g. 500) : Stops automatically after deleting this many photos.
    const maxImageCount = "ALL_PHOTOS";

    // Timing Configuration (in milliseconds)
    // If you have a slower internet connection or huge library, increase these values.
    const TIME_CONFIG = {
        delete_cycle: 10000,       // Pause between batches after a cycle completes (default: 10 seconds)
        press_button_delay: 2000   // Delay after selecting photos before clicking delete (default: 2 seconds)
    };

    // Retry settings for detecting photos before concluding the library is empty
    const MAX_CHECKBOX_RETRIES = 10;
    const CHECKBOX_RETRY_DELAY = 1000; // ms between retries

    // Google occasionally presents an extra informational notice on first deletion
    // before the actual confirmation dialog. We handle chained dialogs (up to 3).
    const MAX_DIALOGS = 3;

    // =========================================================================
    // SELECTORS & CONSTANTS
    // =========================================================================

    const SELECTORS = {
        // Selection checkbox on photo cards
        checkbox: '.ckGgle',

        // Action bar / selection toolbar container
        toolbarContainer: 'header, [role="toolbar"], div[data-delete-origin], div[aria-label*="Selected" i]',

        // Language-agnostic delete button in the selection action bar
        languageAgnosticDeleteButton: 'div[data-delete-origin] button',

        // Delete button selectors in top action bar
        deleteButton: 'button[aria-label="Delete"], button[data-tooltip*="Delete" i], button[aria-label*="Trash" i], button[aria-label*="Move to trash" i], button[aria-label*="Move to bin" i]',

        // Modal dialog containers
        dialog: '[aria-modal="true"], [role="alertdialog"], [role="dialog"]',

        // Structural attributes Google sets on primary affirmative buttons in dialogs
        dialogDefaultButton: 'button[data-mdc-dialog-button-default], [data-mdc-dialog-button-default], [data-mdc-dialog-action="accept"], [data-mdc-dialog-action="ok"]'
    };

    // Affirmative action keywords across English and common UI variants
    const CONFIRM_TEXTS = [
        'move to trash', 'move to bin', 'delete', 'ok', 'got it', 'continue',
        'trash', 'bin', 'remove'
    ];

    // Negative/dismiss action keywords that must NEVER be clicked
    const CANCEL_TEXTS = [
        'cancel', 'close', 'learn more', 'dismiss', 'back', 'keep', 'undo', 'no thanks'
    ];

    // =========================================================================
    // STATE MANAGEMENT & INSTANCE CLEANUP
    // =========================================================================

    // Stop and clean up any previously running instance in the current tab
    if (window.__googlePhotosDeleteState && window.__googlePhotosDeleteState.isRunning) {
        window.__googlePhotosDeleteState.isRunning = false;
        if (window.__googlePhotosDeleteState.timerId) {
            clearTimeout(window.__googlePhotosDeleteState.timerId);
            window.__googlePhotosDeleteState.timerId = null;
        }
        console.log('[INFO] Stopped previously active deletion task.');
    }

    const state = {
        isRunning: true,
        imageCount: 0,
        cycleInProgress: false,
        timerId: null
    };
    window.__googlePhotosDeleteState = state;

    // Expose global stop function so users can halt execution anytime
    window.stopGooglePhotosDelete = function () {
        if (state.isRunning) {
            state.isRunning = false;
            if (state.timerId) {
                clearTimeout(state.timerId);
                state.timerId = null;
            }
            console.log('[INFO] Google Photos Delete Tool stopped by user.');
        } else {
            console.log('[INFO] No active deletion task is currently running.');
        }
    };

    // =========================================================================
    // DOM HELPERS
    // =========================================================================

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

        // Priority 1: Google's default affirmative button attribute
        const marked = candidates.find((button) => {
            try { return button.matches(SELECTORS.dialogDefaultButton); } catch (e) { return false; }
        });
        if (marked) return marked;

        // Priority 2: Affirmative text match
        for (const text of CONFIRM_TEXTS) {
            const hit = candidates.find((button) => labelMatches(button, [text]));
            if (hit) return hit;
        }

        // Priority 3: Last non-cancel button by convention
        return candidates[candidates.length - 1] || null;
    }

    async function confirmDeletion() {
        for (let index = 0; index < MAX_DIALOGS; index++) {
            if (!state.isRunning) return false;

            const timeout = index === 0 ? TIME_CONFIG.press_button_delay + 3000 : Math.min(TIME_CONFIG.press_button_delay, 1000);
            const dialog = await waitForDialog(timeout);

            if (!state.isRunning) return false;

            // On the FIRST pass (index === 0), a dialog is strictly required.
            // If no dialog appears, the deletion action was not acknowledged by Google Photos.
            if (!dialog) {
                if (index === 0) {
                    console.warn('[WARN] Confirmation dialog did not appear. Retrying in next cycle...');
                    return false;
                }
                // On subsequent passes (index > 0), null dialog means all dialogs have been confirmed.
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

            // Wait for this dialog to dismiss before continuing
            for (let i = 0; i < 20 && document.contains(dialog) && isVisible(dialog) && state.isRunning; i++) {
                await wait(250);
            }
        }

        if (findVisibleDialog()) {
            console.warn('[WARN] A dialog is still open after handling confirmations. Retrying in next cycle.');
            return false;
        }
        return true;
    }

    function clickDeleteButton() {
        // Priority 1: Language-agnostic container button
        try {
            const deleteBtn = document.querySelector(SELECTORS.languageAgnosticDeleteButton);
            if (deleteBtn && isVisible(deleteBtn)) {
                deleteBtn.click();
                return true;
            }
        } catch (e) {}

        // Priority 2: Standard delete button selector (exclude navigation sidebar)
        try {
            const btns = document.querySelectorAll(SELECTORS.deleteButton);
            for (const btn of btns) {
                if (isVisible(btn) && !btn.closest('nav, aside, [role="navigation"]')) {
                    btn.click();
                    return true;
                }
            }
        } catch (e) {}

        // Priority 3: Search within the selection action bar / toolbar
        const toolbars = document.querySelectorAll(SELECTORS.toolbarContainer);
        for (const toolbar of toolbars) {
            if (isVisible(toolbar)) {
                const buttons = toolbar.querySelectorAll('button, [role="button"]');
                for (const btn of buttons) {
                    if (isVisible(btn)) {
                        const label = labelOf(btn).toLowerCase();
                        if (label.includes('delete') || label.includes('trash') || label.includes('bin')) {
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

    // =========================================================================
    // DELETION CYCLE
    // =========================================================================

    async function deletionCycle() {
        if (!state.isRunning || state.cycleInProgress) return;
        state.cycleInProgress = true;

        try {
            let attemptCount = 0;
            let checkboxes = [];

            // Wait for photos to appear with retry and scroll nudge
            while (attemptCount < MAX_CHECKBOX_RETRIES && state.isRunning) {
                checkboxes = [...document.querySelectorAll(SELECTORS.checkbox)].filter(isVisible);
                if (checkboxes.length > 0) break;

                // Nudge scroll to trigger virtual list lazy-loader if photos are not loaded yet
                window.scrollBy(0, 300);
                await wait(CHECKBOX_RETRY_DELAY);
                attemptCount++;
            }

            if (!state.isRunning) return;

            // Scroll back up after retries
            if (attemptCount > 0 && checkboxes.length > 0) {
                window.scrollTo(0, 0);
            }

            // If no photos found after all retries, conclude deletion
            if (checkboxes.length === 0) {
                console.log('[INFO] No more photos found.');
                state.isRunning = false;
                console.log(`[SUCCESS] Deletion completed! Total deleted: ${state.imageCount} photos. Tool exited.`);
                return;
            }

            // Only click checkboxes that are NOT already checked (prevents unselecting)
            const toSelect = checkboxes.filter((cb) => cb.getAttribute('aria-checked') !== 'true');
            toSelect.forEach((cb) => cb.click());
            console.log(`[INFO] Selected ${checkboxes.length} photos (${toSelect.length} newly clicked).`);

            // Wait for toolbar to update before clicking delete button
            await wait(TIME_CONFIG.press_button_delay);
            if (!state.isRunning) return;

            if (!clickDeleteButton()) {
                return;
            }

            // Confirm deletion dialog(s)
            const confirmed = await confirmDeletion();
            if (!confirmed || !state.isRunning) {
                return;
            }

            // Update count only after successful confirmation
            state.imageCount += checkboxes.length;
            const targetDisplay = maxImageCount === "ALL_PHOTOS" ? "All" : maxImageCount;
            console.log(`[INFO] Deleted batch. Total so far: ${state.imageCount} / ${targetDisplay}`);

            // Check if user requested limit is reached
            if (maxImageCount !== "ALL_PHOTOS" && state.imageCount >= parseInt(maxImageCount, 10)) {
                state.isRunning = false;
                console.log(`[SUCCESS] Target of ${maxImageCount} photos deleted as requested. Tool exited.`);
                return;
            }
        } catch (err) {
            console.error('[ERROR] Unexpected error in deletion cycle:', err);
        } finally {
            state.cycleInProgress = false;
        }
    }

    // =========================================================================
    // STARTUP & LOOP
    // =========================================================================

    // Language guidance check
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
