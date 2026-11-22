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
    // If you have a slower internet connection, increase these values.
    const TIME_CONFIG = {
        delete_cycle: 10000,       // Interval between batch deletion cycles (default: 10 seconds)
        press_button_delay: 2000   // Delay between clicking delete and confirming (default: 2 seconds)
    };

    // Retry settings for detecting photos before concluding the library is empty
    const MAX_CHECKBOX_RETRIES = 10;
    const CHECKBOX_RETRY_DELAY = 1000; // ms between retries

    // Google occasionally presents an extra informational notice on first deletion
    // before the actual confirmation dialog. We handle up to 3 chained dialogs.
    const MAX_DIALOGS = 3;

    // =========================================================================
    // SELECTORS & CONSTANTS
    // =========================================================================

    const SELECTORS = {
        // Selection checkbox on photo cards
        checkbox: '.ckGgle',

        // Delete (trash bin) button in the top action bar
        languageAgnosticDeleteButton: 'div[data-delete-origin] button',
        deleteButton: 'button[aria-label="Delete"], button[data-tooltip*="Delete" i], button[aria-label*="Trash" i]',

        // Modal dialog containers
        dialog: '[aria-modal="true"], [role="alertdialog"], [role="dialog"]',

        // Structural attribute Google sets on the primary affirmative button of a dialog
        dialogDefaultButton: 'button[data-mdc-dialog-button-default]'
    };

    // Affirmative action keywords across English and common UI variants
    const CONFIRM_TEXTS = ['Move to trash', 'Move to bin', 'Delete', 'OK', 'Got it', 'Continue'];

    // Negative/dismiss action keywords that must NEVER be clicked
    const CANCEL_TEXTS = ['Cancel', 'Close', 'Learn more', 'Dismiss', 'Back'];

    // =========================================================================
    // STATE MANAGEMENT & INSTANCE CLEANUP
    // =========================================================================

    // Clean up any previously running instance in the current tab
    if (window.__googlePhotosDeleteTask) {
        clearInterval(window.__googlePhotosDeleteTask);
        window.__googlePhotosDeleteTask = null;
        console.log('[INFO] Stopped previously active deletion task.');
    }

    let imageCount = 0;
    let cycleInProgress = false;

    // Expose a global stop function so users can stop the tool anytime
    window.stopGooglePhotosDelete = function () {
        if (window.__googlePhotosDeleteTask) {
            clearInterval(window.__googlePhotosDeleteTask);
            window.__googlePhotosDeleteTask = null;
            console.log('[INFO] Google Photos Delete Tool stopped by user.');
        } else {
            console.log('[INFO] No active deletion task is currently running.');
        }
    };

    // =========================================================================
    // DOM HELPERS
    // =========================================================================

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const isVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        return element.getClientRects().length > 0;
    };

    const labelOf = (element) =>
        (element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim();

    const labelMatches = (element, texts) => {
        const label = labelOf(element).toLowerCase();
        return texts.some((text) => label.includes(text.toLowerCase()));
    };

    const findVisibleDialog = () =>
        [...document.querySelectorAll(SELECTORS.dialog)].find(isVisible) || null;

    async function waitForDialog(timeout) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const dialog = findVisibleDialog();
            if (dialog) return dialog;
            await wait(250);
        }
        return null;
    }

    function findConfirmButton(dialog) {
        const candidates = [...dialog.querySelectorAll('button')]
            .filter(isVisible)
            .filter((button) => !labelMatches(button, CANCEL_TEXTS));

        // Priority 1: Google's default affirmative button attribute
        const marked = candidates.find((button) => button.matches(SELECTORS.dialogDefaultButton));
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
            const timeout = index === 0 ? TIME_CONFIG.press_button_delay + 3000 : 2000;
            const dialog = await waitForDialog(timeout);

            // No dialog left — previous actions resolved the prompt
            if (!dialog) return true;

            const confirmButton = findConfirmButton(dialog);
            if (!confirmButton) {
                console.warn('[WARN] Modal detected but could not locate confirmation button. Please click manually if visible.');
                return false;
            }

            const buttonLabel = labelOf(confirmButton);
            confirmButton.click();
            console.log(`[INFO] Confirmed dialog ${index + 1}: "${buttonLabel}"`);

            // Wait for dialog to dismiss before continuing
            for (let i = 0; i < 20 && document.contains(dialog) && isVisible(dialog); i++) {
                await wait(250);
            }
        }

        if (findVisibleDialog()) {
            console.warn('[WARN] A dialog is still open after handling confirmations. Retrying next cycle.');
            return false;
        }
        return true;
    }

    function clickDeleteButton() {
        let deleteBtn = null;
        try {
            deleteBtn = document.querySelector(SELECTORS.languageAgnosticDeleteButton);
        } catch (e) {}

        if (!deleteBtn) {
            try {
                deleteBtn = document.querySelector(SELECTORS.deleteButton);
            } catch (e) {}
        }

        if (deleteBtn && isVisible(deleteBtn)) {
            deleteBtn.click();
            return true;
        }

        // Fallback: search visible buttons with delete/trash label
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            if (isVisible(btn)) {
                const label = labelOf(btn).toLowerCase();
                if (label.includes('delete') || label.includes('trash') || label.includes('bin')) {
                    btn.click();
                    return true;
                }
            }
        }

        console.warn('[WARN] Delete button not found in toolbar.');
        return false;
    }

    // =========================================================================
    // DELETION CYCLE
    // =========================================================================

    async function deletionCycle() {
        if (cycleInProgress) return;
        cycleInProgress = true;

        try {
            let attemptCount = 0;
            let checkboxes = [];

            // Wait for photos to appear with retry
            while (attemptCount < MAX_CHECKBOX_RETRIES) {
                checkboxes = document.querySelectorAll(SELECTORS.checkbox);
                if (checkboxes.length > 0) break;
                await wait(CHECKBOX_RETRY_DELAY);
                attemptCount++;
            }

            // If no photos found after all retries, finish
            if (checkboxes.length === 0) {
                console.log('[INFO] No more photos found.');
                if (window.__googlePhotosDeleteTask) {
                    clearInterval(window.__googlePhotosDeleteTask);
                    window.__googlePhotosDeleteTask = null;
                }
                console.log(`[SUCCESS] Deletion completed! Total deleted: ${imageCount} photos. Tool exited.`);
                return;
            }

            // Select all visible photos
            checkboxes.forEach((cb) => cb.click());
            console.log(`[INFO] Selected ${checkboxes.length} photos.`);

            // Wait before clicking delete button
            await wait(TIME_CONFIG.press_button_delay);

            if (!clickDeleteButton()) {
                console.warn('[WARN] Could not click delete button. Retrying in next cycle...');
                return;
            }

            // Confirm deletion dialog(s)
            const confirmed = await confirmDeletion();
            if (!confirmed) {
                return;
            }

            // Update count only after successful confirmation
            imageCount += checkboxes.length;
            const targetDisplay = maxImageCount === "ALL_PHOTOS" ? "All" : maxImageCount;
            console.log(`[INFO] Deleted batch. Total so far: ${imageCount} / ${targetDisplay}`);

            // Check if user requested limit is reached
            if (maxImageCount !== "ALL_PHOTOS" && imageCount >= parseInt(maxImageCount, 10)) {
                if (window.__googlePhotosDeleteTask) {
                    clearInterval(window.__googlePhotosDeleteTask);
                    window.__googlePhotosDeleteTask = null;
                }
                console.log(`[SUCCESS] Target of ${maxImageCount} photos deleted as requested. Tool exited.`);
                return;
            }
        } catch (err) {
            console.error('[ERROR] Unexpected error in deletion cycle:', err);
        } finally {
            cycleInProgress = false;
        }
    }

    // =========================================================================
    // STARTUP
    // =========================================================================

    console.log('==================================================');
    console.log('  Google Photos Delete Tool');
    console.log('  Target: ' + (maxImageCount === "ALL_PHOTOS" ? "All photos" : maxImageCount + " photos"));
    console.log('  Cycle delay: ' + TIME_CONFIG.delete_cycle + 'ms');
    console.log('  To stop anytime, type: stopGooglePhotosDelete()');
    console.log('==================================================');

    // Run first batch immediately
    deletionCycle();

    // Schedule recurring cycles
    window.__googlePhotosDeleteTask = setInterval(deletionCycle, TIME_CONFIG.delete_cycle);
})();
