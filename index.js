#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const moment = require('moment');

(async () => {
    const homedir = require('os').homedir();
    const configFile = path.join(homedir, ".payslip4u-downloader.json");
    let config = {};

    try {
        config = JSON.parse(fs.readFileSync(configFile));
    } catch (e) {
        error(`${configFile} could not be loaded - ${e}`);
    }

    // Validate config file
    if (!config.url) { error("'url' is required in the config"); }
    if (!config.username) { error("'username' is required in the config"); }
    if (!config.password) { error("'password' is required in the config"); }

    // Run Puppeteer
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();

    // Log in
    await page.goto(config.url);
    await page.type('#Username', config.username);
    await page.type('#Password', config.password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();

    // Find all payslips
    await timeout(1500);
    await page.click('[ng-click="showAllPayslips()"]');
    await timeout(500);

    // We have to expose this to the page to write the data to disk
    page.exposeFunction("writeABString", async (strbuf, targetFile) => {
        var str2ab = function _str2ab(str) { // Convert a UTF-8 String to an ArrayBuffer
            var buf = new ArrayBuffer(str.length); // 1 byte for each char
            var bufView = new Uint8Array(buf);

            for (var i=0, strLen=str.length; i < strLen; i++) {
                bufView[i] = str.charCodeAt(i);
            }
            return buf;
        }

        return new Promise((resolve, reject) => {
            // Convert the ArrayBuffer string back to an ArrayBufffer, which in turn is converted to a Buffer
            let buf = Buffer.from(str2ab(strbuf));
            // Try saving the file.        
            fs.writeFile(targetFile, buf, (err, text) => {
                if(err) reject(err);
                else resolve(targetFile);
            });
        });
    });

    // For each row, extract the date and the document
    const rows = await page.$$(".row .hide-for-small");
    rows.forEach(async (row) => {
        const entry = {};

        // Fetch the date
        const divs = await row.$$("div");
        if (divs[0]) {
            const d = (await (await divs[0].getProperty("innerText")).jsonValue());
            const d2 = moment(d, "D MMM YYYY").format("YYYY-MM-DD");
            entry.date = d2;
        }

        // Fetch the type of pay slip
        if (divs[1]) {
            const t = slugify((await (await divs[1].getProperty("innerText")).jsonValue()));
            entry.type = t;
        }

        // Fetch the URL
        if (divs[4]) {
            const u = await divs[4].$eval("a", (link) => link.href);
            entry.url = u;
        }

        if (entry.url) {
            // Download the payslip
            // via https://github.com/GoogleChrome/puppeteer/issues/299#issuecomment-340199753
            const result = await page.evaluate(({entry, config}) => {
                function arrayBufferToString(buffer){ // Convert an ArrayBuffer to an UTF-8 String
                    var bufView = new Uint8Array(buffer);
                    var length = bufView.length;
                    var result = '';
                    var addition = Math.pow(2,8)-1;

                    for(var i = 0;i<length;i+=addition){
                        if(i + addition > length){
                            addition = length - i;
                        }
                        result += String.fromCharCode.apply(null, bufView.subarray(i,i+addition));
                    }
                    return result;
                }

                return fetch(entry.url, {method: "GET", credentials: "include"})
                    .then(response => response.arrayBuffer())
                    .then( arrayBuffer => {
                        var bufstring = arrayBufferToString(arrayBuffer);
                        return window.writeABString(bufstring, `${config.saveDir}/${entry.date}-${entry.type}.pdf`);
                    })
                .catch(function (error) {
                    console.log('Request failed: ', error);
                });
            }, {entry, config});
        }

        // This is done async. 10 seconds should be long enough to download everything
        await timeout(10000);
        await browser.close();
    });
})();

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function error(msg) {
    console.log(msg);
    process.exit(1);
}

function slugify(text)
{
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}
