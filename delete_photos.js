/* 
Mass delete google photos
Works best in Chrom(ium); Firefox works but can have loading issues and timing issues with HUGE photo sets. 
https://github.com/mrishab/google-photos-delete-tool/
*/

//let deleteGooglePhotos = async function(
const maxItemCount = "ALL_PHOTOS";
//, 
const itemUnit = "photos";
//) {

const CHECKBOX_CLASSES = {
	days: '.QcpS9c.R4HkWb',	// Delete whole days at a time - Won't delete dates with only one image!
	photos: '.ckGgle',		// Delete sets of photos at a time
	infinity: '.ckGgle'		// Delete everything and do not exit: if you have 10k+ photos and don't want to risk it quitting part way through
}

// Selector for Images and buttons
const ELEMENT_SELECTORS = {
    checkboxClass: CHECKBOX_CLASSES[itemUnit], 
    languageAgnosticDeleteButton: 'div[data-delete-origin] button',
    deleteButton: 'button[aria-label="Delete"]',
    confirmationButton: '#yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.V639qd.bvQPzd.oEOLpc.Up8vH.J9Nfi.A9Uzve.iWO5td > div.XfpsVe.J9fJmf > button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.kHssdc.HvOprf'
}

// Time Configuration (in milliseconds)
const TIME_CONFIG = {
    delete_cycle: 10000,
    press_button_delay: 2000,
};

const MAX_RETRIES = 10;

// Force sleep a bit
const sleep = ms => new Promise(r => setTimeout(r, ms));

let imageCount = 0;

let checkboxes;
let buttons = {
    deleteButton: null,
    confirmationButton: null
}

let deleteTask = setInterval(async function () {
    let attemptCount = 1;

    do {
        checkboxes = document.querySelectorAll(ELEMENT_SELECTORS['checkboxClass']);
	 if (attemptCount > 1) {
	     console.log("No checkboxes found; retrying, " + attemptCount + "/" + MAX_RETRIES);
	     await sleep(TIME_CONFIG['delete_cycle']); // Give a bit of extra time for the page to load more
	 }
    } while (checkboxes.length <= 0 && attemptCount++ < MAX_RETRIES);

    if (checkboxes.length <= 0) {
        console.log("[INFO] No more images to delete.");
	 if (itemUnit != "infinity") {
	        clearInterval(deleteTask);
	        console.log("[SUCCESS] Tool exited.");
       	 return;
	 }
    }

    imageCount += checkboxes.length;

    checkboxes.forEach((checkbox) => { checkbox.click() });
    console.log("[INFO] Deleting", checkboxes.length, "images/sets");

    setTimeout(() => {
        try {
            buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['languageAgnosticDeleteButton']);
            buttons.deleteButton.click();
        } catch {
            buttons.deleteButton = document.querySelector(ELEMENT_SELECTORS['deleteButton']);
            buttons.deleteButton.click();
        }

        setTimeout(() => {
            buttons.confirmation_button = document.querySelector(ELEMENT_SELECTORS['confirmationButton']);
            buttons.confirmation_button.click();

            console.log(`[INFO] ${imageCount}/${maxItemCount} Images/Sets Deleted`);
            if (maxItemCount !== "ALL_PHOTOS" && imageCount >= parseInt(maxItemCount)) {
                console.log(`${imageCount} photos deleted as requested`);
                clearInterval(deleteTask);
                console.log("[SUCCESS] Tool exited.");
                return;
            }

        }, TIME_CONFIG['press_button_delay']);
    }, TIME_CONFIG['press_button_delay']);
}, TIME_CONFIG['delete_cycle']);
//};

// How many photos to delete?
// Put a number value, like this
//   deleteGooglePhotos(5896, "photos");
// If the first argument is missing, we will delete all photos.
//deleteGooglePhotos(); // Rerun this line to start the program again
