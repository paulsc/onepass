var util = require('util');
var winston = require('winston');
var prompt = require('prompt-sync')();
var readline = require('readline');
var clipboardy = require('clipboardy');

var browserext = require('./browserext');
var opvault = require('./opvault');

var argv = require('minimist')(process.argv.slice(2));

const MAX_RESULTS = 5;
const CLEAR_TIMEOUT = 30000;

if (argv['prompt']) {
    promptMode(argv['v']);
}
else {
    startDaemon();
}

function startDaemon() {
    opvault.unlockKeychain();
    winston.info("Keychain unlocked.");
    browserext.connect();
}

// Prompt mode with live search
// Use stdin rawmode to read input key by key
// Store current query in a variable, remove a key on backspace
// Enter clears the screen, ctrl+c exits
// After every keypress, do a search and clear / redraw the screen
function promptMode(verbose) {

    let query = '';
    lastResultsUUID = undefined;
    let clearScreenTimeoutId = null;
    let clearPromptTimeoutId = null;
    let results = [];

    let clearResults = function() {
        query = '';
        console.log('\033[2J'); // Clear the screen
        printPrompt();
    }

    let clearPrompt = function() {
        process.stdout.write('\r\x1b[K');
        printPrompt();
    }

    let printPrompt = function(prefix) {
        process.stdout.write((prefix ? prefix : '') + '> ' + (query ? query : ''));
    }

    opvault.unlockKeychain();

    console.log('\033[2J');
    console.log("Keychain unlocked, enter query below.");
    console.log(`Screen will clear after ${CLEAR_TIMEOUT/1000}s.`);
    console.log("");
    console.log("<ctrl+c> Exit");
    console.log("<ctrl+l> Load top result password into clipboard");
    console.log("<ctrl+w> Kill last word");
    console.log("<enter>  Clear screen");
    console.log("");
    printPrompt();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name == 'c') {
            process.exit(0);
        } 
        else if (key.name == 'return') {
            query = '';
        }
        else if (key.ctrl && (key.name == 'd' || key.name == 'k')) { // clear
            query = '';
        }
        else if (key.ctrl && key.name == 'w') { // kill word
            tokens = query.split(' ');
            query = tokens.slice(0, tokens.length - 1).join(' ');
        }
        else if (key.ctrl && key.name == 'l') { // load password
            let firstPw = findField(results[0], 'password');
            if (firstPw) {
                clipboardy.writeSync(firstPw);
                clearResults();

                process.stdout.write('\r\x1b[K');
                printPrompt('Copied!');

                setTimeout(clearPrompt, 1000);
                return;
            } else {
                console.log("No password field found.")
            }
        }
        else if (key.name == 'backspace') {
            query = query.substr(0, query.length - 1);
        }
        else {
            query += str;
        }

        if (clearPromptTimeoutId) clearTimeout(clearPromptTimeoutId);
        if (clearScreenTimeoutId) clearTimeout(clearScreenTimeoutId);
        clearScreenTimeoutId = setTimeout(clearResults, CLEAR_TIMEOUT);

        // Below 3 characters results don't make sense
        if (query.length <= 3) {
            // console.log('\033[2J'); // Clear the screen
            // console.log("Query too short.");
            // console.log("");
            process.stdout.write('\r\x1b[K');
            printPrompt();
            return;
        }

        results = opvault.findByQuery(query, MAX_RESULTS);

        let previousResults = lastResultsUUID;
        lastResultsUUID = results.map(r => r.uuid);

        if (typeof(previousResults) != undefined && 
            JSON.stringify(previousResults) == JSON.stringify(lastResultsUUID)) {
            process.stdout.write('\r\x1b[K');
            printPrompt();
            return;
        }

        console.log('\033[2J'); // Clear the screen

        if (results.length == 0) {
            console.log("No results.");
            console.log("");
        } else {
            for (var i = 0; i < results.length; i++) {
                printEntry(results[i], verbose);
            }
        }

        printPrompt();
    })
}

function printEntry(entry, verbose) {

    if (verbose) {
        console.log(util.inspect(entry, false, null));
        return;
    }

    var overview = entry.overview;
    var data = entry.data;
    var detailed = false;

    var title = overview.title ? overview.title : overview.url
    if (typeof(overview.url) != 'undefined') {
        let host = new URL(overview.url).host;
        title += ` (${host})`
    }
    console.log("  " + title); 

    //console.log("  Category: " + entry.category);

    if (entry.category == '003') { // Secure note
        console.log("  Notes:");
        if (data.hasOwnProperty('notesPlain')) {
            var lines = data.notesPlain.split('\n');
            for (var i = 0; i < lines.length; i++) {
                console.log("    " + lines[i]);
            }
        }
        console.log('');
        return;
    }

    if (data.hasOwnProperty('fields')) {
        detailed = true;

        // If has username & pw, just print those
        let username = findField(entry, 'username');
        let password = findField(entry, 'password');
        if (username && password) {
            console.log("    username: " + username);
            // console.log("    password: " + password);
        }
        else { // Print all fields
            for (var i = 0; i < data.fields.length; i++) {
                var field = data.fields[i];
                if (!field.value) {
                    continue;
                }

                var name = field.name ? field.name : field.designation;
                console.log("    " + name + ": " + field.value);
            }
        }
        
    }

    if (data.hasOwnProperty('password')) {
        detailed = true;
        // console.log("    password: " + data.password);
    }

    // If we couldn't find enough info to print, just dump the entry
    if (!detailed) {
        console.log(util.inspect(entry, false, null));
    }

    console.log("");
}

function findField(entry, fieldname) {
    if (!entry.hasOwnProperty('data')) {
        return;
    }
    if (entry.data.hasOwnProperty(fieldname)) {
        return entry.data[fieldname];
    }
    if (entry.data.hasOwnProperty('fields')) {
        let candidates;

        let hasMatch = c => c.length > 0 && c[0].value && c[0].value.length > 0;

        candidates = entry.data.fields.filter(f => f.name == fieldname);
        if (hasMatch(candidates)) {
            return candidates[0].value;
        }

        candidates = entry.data.fields.filter(f => f.designation == fieldname);
        if (hasMatch(candidates)) {
            return candidates[0].value;
        }
    }
}
