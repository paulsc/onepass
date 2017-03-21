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

    console.log(payload);

    var url = payload.url;
    winston.info("Looking up logins for url: " + url);

    var results = opvault.findByURL(url);
    console.log("results: %d", results.length);

    if (results.length == 1) { 
        sendFillResult(results[0], payload, send);
    }
    else if (results.length > 1) {
        var cmd = "./gtkmenu";
        results.forEach(result => {
            //cmd += ' "' + result.overview.title 
            //    + ' - ' + result.overview.url + '"';
            cmd += ' "' + result.overview.title + '"';
        });

        exec(cmd, function(error, stdout, stderr) {
            var selected = parseInt(stdout);
            if (isNaN(selected)) return;

            sendFillResult(results[selected], payload, send);
        });
    }
}

function sendFillResult(result, payload, send) {
    mappings = mapEntryToForm(result, payload);
    if (mappings.length < 1) {
        console.log(util.inspect(result, false, null));
        winston.info("Unable to find form inputs");
        return;
    }

    var payload = { documentUUID: payload.documentUUID, script: [] };
    for (var i = 0; i < mappings.length; i++) {
        var opid = mappings[i].opid;
        var value = mappings[i].value;

        payload.script.push(["click_on_opid", opid]);
        payload.script.push(["fill_by_opid", opid, value]);
    }
    console.log(payload);
    payloadstr = JSON.stringify(payload);
    send({ action: "executeFillScript", 
           payload: payloadstr });
}

function mapEntryToForm(entry, payload) {
    mappings = [];

    if (entry.hasOwnProperty('category') 
        && entry.category == '001' 
        && entry.data.hasOwnProperty('fields')) {

        for (var i = 0; i < entry.data.fields.length; i++) {
            field = entry.data.fields[i];
            var name = field.name ? field.name : field.designation;
            if (name == "username") {
                opids = findUserInputs(payload);
				opids.forEach(opid => {
					mappings.push({opid: opid, value: field.value});
				});
            }
            if (name == "password") {
                opids = findPasswordInputs(payload);
				opids.forEach(opid => {
                    mappings.push({opid: opid, value: field.value});
                });
            }
        }
    }

    return mappings;
}

function findUserInputs(payload) {
	results = [];
    var validtags = ["user", "login", "email"];

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
