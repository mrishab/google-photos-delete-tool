# Google Photos Delete All Tool
If you have ever wanted to delete your thousands of photos from the [Google Photos](https://photos.google.com/) but failed to find an easy way to do so, then this is the tool for you. This script goes through all your photos in Google Photos app on the desktop and deletes them. You can visually see the process while it happens!

# Getting Started
Follow the step-by-step instructions below to run the tool.

## Prerequisites
- A fairly recent version of a modern web browser. This script has not been tested with any browser other than Google Chrome `Version 71.0.3578.98`. You can [download the latest version of the Google Chrome browser here](https://www.google.com/chrome/). However, you can still use it with any modern browser, like, [Firefox](https://www.mozilla.org/en-US/firefox/download/thanks/) or [IE Edge](https://www.microsoft.com/en-ca/windows/microsoft-edge).

## Assumptions
The manual steps assume that these steps are performed on the Google Chrome Browser. If you're using a different browser, the steps still remain the same, however, the keyboard shortcuts or browser specific keywords may not be same for you, as described below.

## Steps
1) [Login into your Google Account](https://accounts.google.com/ServiceLogin).

![Google Account Sign-in Page](images/google-signin-page.jpg)

2) Go to [Google Photos](https://photos.google.com/).

![Google Photos Page](images/google-photos-page.jpg)

_Note: If you're logged into Google, you will see your images._

3) Open Developer Tools. You can do so by following either of the three options

    - **Keyboard Shortcut**
        
        Press the three keys together in the sequence - `CTRL + SHIFT + I`

    - **From the Page**
        
        Right click on an empty area with your mouse and select `Inspect` (last option)
        
        ![Google Chrome Right Click Pop-up Menu](images/chrome-popup-menu.jpg)

    - **From Menu**
        
        1) Click on the menu button ![Google Chrome Menu Icon](images/chrome-menu-icon.jpg) on Google Chrome (By default, the button is present on the top right corner of the window). 
        
        2) Select `More tools`.
        
        3) Select `Developer tools`.
        
        ![Google Chrome Menu Developer Tools](images/chrome-menu-popup.jpg)

4) After opening the developer tools, click on the `Console` tab.
    ![Google Chrome Console on Google Photos page](images/chrome-console.jpg)
    
    ```
    Note: _This console lets you run custom code, like this tool! You can learn about it on [Google Console page](https://developers.google.com/web/tools/chrome-devtools/console/)_.
    ```
    
    ```
    You will see a warning from Google to stay cautious. If you run code in this console that's malicious, you could be hacked. Therefore, make sure that you only run the code that you understand.
    ```

5) Copy all the code in the called `delete_photos.js` and paste it in the console.
    ![The Code in Chrome Console](images/code-in-console.jpg)

6) Done! Now, you should see the script delete all your photos in the batch

# Deleting albums
1) Follow `Step 1`

2) Go to your [albums](https://photos.google.com/albums) 

3) Follow `Steps` 3 & 4

4) Follow `Step 5` using `delete_albums.js` instead of `delete_photos.js`

5) Wait for all albums to be deleted

# Debugging

The script may not work as expected in case your internet speed is considerably slow. In that case, you may want to increase the `DELETE_DELAY_CYCLE` by few thousands of milliseconds. This is to ensure that the page has refreshed before the tool tries to delete the images again.