// Selector for Images and buttons
const DATE_CHECKBOXES_CLASS = '.ckGgle';
const DELETE_BUTTON_SELECTOR = '#yDmH0d > c-wiz > c-wiz.QtDoYb.KWdEHf.u5a4d.g7of6e.maPcY > content > div.c9yG5b.txMZRd > div > div:nth-child(3) > button';
const CONFIRMATION_BOX_SELECTOR = '#yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.V639qd.bvQPzd.oEOLpc.Up8vH.J9Nfi.A9Uzve.iWO5td > div.XfpsVe.J9fJmf > button.VfPpkd-LgbsSe.VfPpkd-LgbsSe-OWXEXe-k8QpJ.nCP5yc.DuMIQc.kHssdc.HvOprf';

// Time Configuration (in milliseconds)
const DELETE_CYCLE_DELAY = 7000;
const PRESS_DELETE_DELAY = 1000;
const PRESS_CONFIRMATION_DELAY = 2000;

let checkboxes, deleteButton, confirmation_button;
let numOfImages = 0;

let deleteTask = setInterval(() => {

    checkboxes = document.querySelectorAll(DATE_CHECKBOXES_CLASS);

    if (checkboxes.length <= 0) {
        console.log("[INFO] No more images to delete.");
        clearInterval(deleteTask);
        console.log("[SUCCESS] Tool exited.");
        return;
    }

    numOfImages += checkboxes.length;

    checkboxes.forEach((checkbox) => {checkbox.click()});
    console.log("[INFO] Deleting", checkboxes.length, "images");

    setTimeout(()=>{
        deleteButton = document.querySelector(DELETE_BUTTON_SELECTOR);
        deleteButton.click();
    }, PRESS_DELETE_DELAY);

    setTimeout(() => {
        confirmation_button = document.querySelector(CONFIRMATION_BOX_SELECTOR);
        confirmation_button.click();
    }, PRESS_CONFIRMATION_DELAY);
},
DELETE_CYCLE_DELAY);