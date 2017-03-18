var util = require('util');
var winston = require('winston');
var prompt = require('prompt-sync')();

var browserext = require('./browserext');
var opvault = require('./opvault');

var argv = require('minimist')(process.argv.slice(2));

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

function promptMode(verbose) {
    opvault.unlockKeychain();
    console.log("Keychain unlocked.\n");

    while (true) {
        var keyword = prompt('Keyword: ');
        if (keyword == "") {
            console.log("Please enter a keyword.\n")
            continue;
        }
        if (!keyword) { // ctrl + c
            process.exit(0);
        }

        results = opvault.findByKeyword(keyword);

        if (results.length == 0) {
            console.log("No entries found.\n");
            continue;
        }

        for (var i = 0; i < results.length; i++) {
            printEntry(results[i], verbose);
        }
    }
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
        for (var i = 0; i < data.fields.length; i++) {
            var field = data.fields[i];
            if (!field.value) {
                continue;
            }
            var name = field.name ? field.name : field.designation;
            console.log("    " + name + ": " + field.value);
        }
    }

    if (data.hasOwnProperty('password')) {
        detailed = true;
        console.log("    password: " + data.password);
    }

    if (!detailed) {
        console.log(util.inspect(entry, false, null));
    }

    console.log("");
}
