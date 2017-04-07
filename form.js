var exec = require('child_process').exec;
var winston = require('winston');
var util = require('util');

var opvault = require('./opvault');

exports.fill = function(payload, send) {

    payload.fields.removeIf(field => {
        var filterouttype = ["submit", "button", "checkbox"];
        return (field.hasOwnProperty('visible') && !field.visible)
            || (field.hasOwnProperty('type') &&
               filterouttype.indexOf(field.type) != -1);
	});

    var url = payload.url;
    winston.info("Looking up logins for url: " + url);

    var results = opvault.findByURL(url);
    winston.info("Number of entries found: " + results.length);

    if (results.length == 1) { 
        sendFillResult(results[0], payload, send);
    }
    else if (results.length > 1) {
        var cmd = "./gtkmenu";
        results.forEach(result => {
            var username = getUsername(result);
            if (username) {
                cmd += ' "' + result.overview.title 
                    + ' (' + username + ')' + '"';
            }
            else {
                cmd += ' "' + result.overview.title + '"';
            }
        });

        exec(cmd, function(error, stdout, stderr) {
            var selected = parseInt(stdout);
            if (isNaN(selected)) return;

            sendFillResult(results[selected], payload, send);
        });
    }
}

function getUsername(entry) { 
    for (var i = 0; i < entry.data.fields.length; i++) {
        var field = entry.data.fields[i];
        if (field.name == 'username') {
            return field.value;
        }
    }
    return null;
}

function sendFillResult(result, payload, send) {
    if (!result.data.hasOwnProperty('fields') 
        || result.data.fields.length < 1) {
        winston.error("nothing to fill.");
        return;
    }

    mappings = mapEntryToForm(result, payload);

    if (mappings.length < result.data.fields.length) {
        winston.info("Unable to match all data to form inputs.");

        winston.info("Form fields available:")
        winston.info(util.inspect(payload.fields, false, null));
        winston.info("Fields to enter:")
        result.data.fields.forEach(field => {
            winston.info('  ' + field.name);
        });
    }

    if (mappings.length < 1) {
        return;
    }

    var payload = { documentUUID: payload.documentUUID, script: [] };
    for (var i = 0; i < mappings.length; i++) {
        var opid = mappings[i].opid;
        var value = mappings[i].value;

        payload.script.push(["click_on_opid", opid]);
        payload.script.push(["fill_by_opid", opid, value]);
    }
    payloadstr = JSON.stringify(payload);
    send({ action: "executeFillScript", 
           payload: payloadstr });
    winston.info(mappings.length + " fill instruction(s) sent to browser.");
}

function mapEntryToForm(entry, payload) {
    mappings = [];

    var passopid;
    var useropid;
    var username;

    if (entry.hasOwnProperty('category') 
        && entry.category == '001' 
        && entry.data.hasOwnProperty('fields')) {

        for (var i = 0; i < entry.data.fields.length; i++) {
            field = entry.data.fields[i];
            var name = field.name ? field.name : field.designation;
            if (name == "username") {
                username = field.value;
                opids = findUserInputs(payload);
				opids.forEach(opid => {
					mappings.push({opid: opid, value: field.value});
                    useropid = opid;
				});
            }
            if (name == "password") {
                opids = findPasswordInputs(payload);
				opids.forEach(opid => {
                    mappings.push({opid: opid, value: field.value});
                    passopid = opid;
                });
            }
        }

        if (username && passopid && !useropid) {

            var sortedfields = payload.fields.sort(
                (a, b) => {
                    return a.elementNumber - b.elementNumber;
            });

            for (var i = sortedfields.length - 1; i >= 0; i--) {
                var field = sortedfields[i];
                if (field.opid == passopid && i > 0) {
                    var userfield = sortedfields[i - 1];  
                    mappings.push({opid: userfield.opid, value: username });
                }
            }

        }
    }

    return mappings;
}

function findUserInputs(payload) {
	results = [];
    var validtags = ["user", "login", "email", "e-mail"];

	for (var i = 0; i < payload.fields.length; i++) {
		var field = payload.fields[i];
        for (key in field) {
            if (key.indexOf('label') == 0) { 
				var value = field[key].toLowerCase();
                for (var j = 0; j < validtags.length; j++) {
                    if (value.indexOf(validtags[j]) != -1) {
                        results.push(field.opid);
                        break;
                    }
                }
            }
        }
    }
	return results;
}

function findPasswordInputs(payload) {
	results = [];
    for (var i = 0; i < payload.fields.length; i++) {
        var field = payload.fields[i];
		if (field['type'] == 'password') {
			results.push(field.opid);
		}
    }
	return results;
}

Array.prototype.removeIf = function(callback) {
    var i = 0;
    while (i < this.length) {
        if (callback(this[i], i)) {
            this.splice(i, 1);
        }
        else {
            ++i;
        }
    }
};
