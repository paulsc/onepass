var url = require('url');
var crypto = require('crypto');
var fs = require('fs');
var winston = require('winston');
var prompt = require('prompt-sync')();

require('dotenv').config()

var masterKey, overviewKey;
//var basedir = "onepassword_data/default";
var basedir = "1Password/1Password.opvault/default";
var entries = [];

function hexdump(label, bin) {
    console.log(label + ":");

    var linesize = 32;
    var offset = 0;

    while (offset < bin.length) {
        
        var remaining = bin.length - offset;
        if (remaining < linesize) {
            var buf = Buffer.allocUnsafe(remaining);
            bin.copy(buf, 0, offset, offset + remaining);
            console.log(buf.toString('hex'));
        }
        else {
            var buf = Buffer.allocUnsafe(linesize);
            bin.copy(buf, 0, offset, offset + linesize); 
            console.log(buf.toString('hex'));
        }

        offset += linesize;
    }
}

function loadJson(filename) {
	var contents = fs.readFileSync(filename, 'utf8');

	var index = contents.indexOf('{');
	if (index != -1) {
		contents = contents.substr(index);
	}
	if (contents[contents.length - 1] == ';') {
		contents = contents.substr(0, contents.length - 1);
	}
	if (contents[contents.length - 1] == ')') {
		contents = contents.substr(0, contents.length - 1);
	}

	return JSON.parse(contents);
}

function deriveKey(password, profile) {
    var saltbin = Buffer.from(profile.salt, 'base64');
    return crypto.pbkdf2Sync(password, saltbin, 
        profile.iterations, 64, 'sha512');
}

function decryptItemKey(base64blob, masterkey) {

    var encryptionkey = Buffer.allocUnsafe(32); 
    masterkey.copy(encryptionkey, 0, 0, 32);
    var hmackey = Buffer.allocUnsafe(32); 
    masterkey.copy(hmackey, 0, 32, 64);

    var bin = Buffer.from(base64blob, 'base64');

    var aesiv = Buffer.allocUnsafe(16); 
    bin.copy(aesiv);
    var hmac = Buffer.allocUnsafe(32); 
    bin.copy(hmac, 0, bin.length - 32);

    var cryptohmac = crypto.createHmac('sha256', hmackey);
    var tohash = Buffer.allocUnsafe(bin.length - 32);
    bin.copy(tohash, 0, 0, tohash.length);
    cryptohmac.update(tohash);

    var computedhmac = cryptohmac.digest('hex');  

    if (computedhmac != hmac.toString('hex')) {
        throw Error("Couldn't validate hmac");
    }

    var ciphertext = Buffer.allocUnsafe(bin.length - 48);
    bin.copy(ciphertext, 0, 16);

    var decoded = decryptBlob(ciphertext, encryptionkey, aesiv);

    return decoded;
}


function decryptOpdata(base64opdata, key) {
    var opdatabin = Buffer.from(base64opdata, 'base64');
    
    var prefix = Buffer.from('opdata01');
    if(opdatabin.compare(prefix, 0, 8, 0, 8) != 0) {
        throw Error("Invalid prefix");
    }

    var aesiv = Buffer.allocUnsafe(16); 
    var hmac = Buffer.allocUnsafe(32); 

    var encryptionkey = Buffer.allocUnsafe(32); 
    var hmackey = Buffer.allocUnsafe(32); 

    key.copy(encryptionkey, 0, 0, 32);
    key.copy(hmackey, 0, 32, 64);

    var plaintextlen = Number(opdatabin.readBigUInt64LE(8));

    opdatabin.copy(aesiv, 0, 16, 32);

    opdatabin.copy(hmac, 0, opdatabin.length - 32);

    var cryptohmac = crypto.createHmac('sha256', hmackey);
    var tohash = Buffer.allocUnsafe(opdatabin.length - 32);
    opdatabin.copy(tohash, 0, 0, tohash.length);
    cryptohmac.update(tohash);

    var computedhmac = cryptohmac.digest('hex');  

    if (computedhmac != hmac.toString('hex')) {
        return;
    }

    var ciphertext = Buffer.allocUnsafe(opdatabin.length - 64);
    opdatabin.copy(ciphertext, 0, 32);

    var decoded = decryptBlob(ciphertext, encryptionkey, aesiv);

    var nopadding = Buffer.allocUnsafe(plaintextlen);
    var diff = decoded.length - plaintextlen;
    decoded.copy(nopadding, 0, diff);

    return nopadding;
}

function decryptBlob(blob, key, iv) {
    var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    var decoded = 
        Buffer.concat([ decipher.update(blob), decipher.final()]);
    return decoded;
}

function sha512(blob) {
    return crypto.createHash('sha512').update(blob).digest();
}

function decryptMainKeys(password) {
    profile = loadJson(basedir + "/profile.js");

    key = deriveKey(password, profile);

    masterKeyBlob = decryptOpdata(profile.masterKey, key);

    if (!masterKeyBlob) {
        return;
    }

    masterKey = sha512(masterKeyBlob);

    overviewKeyBlob = decryptOpdata(profile.overviewKey, key);
    overviewKey = sha512(overviewKeyBlob);

    return [masterKey, overviewKey];
}

exports.unlockKeychain = function() {

    var profilejs = basedir + "/profile.js";
    if (!fs.existsSync(profilejs)) {
        throw new Error("Vault not found at: " + basedir 
            + " please add symbolic link here to your 1Password folder");
    }

    var keys = null;
    while (!keys) {
        winston.info("Unlocking vault...");

        let password;
        if (process.env.PASSWORD) {
            password = process.env.PASSWORD;
        } else {
            password = prompt.hide('Password: ');
            if (password == null) process.exit(0);
        }

        keys = decryptMainKeys(password);
    }

    masterKey = keys[0];
    overviewKey = keys[1];

    var bands = "0123456789ABCDEF";

    for (var i = 0; i < bands.length; i++) {
        var filename = "/band_" + bands[i] + ".js";
        var fullpath = basedir + filename;

        if (!fs.existsSync(fullpath)) continue;

        var band = loadJson(fullpath);

        for (var uuid in band) {
            var enc = band[uuid].o;
            var cleartext = decryptOpdata(enc, overviewKey);
            overviewJson = cleartext.toString('utf8');
            entries.push({ 
                uuid: uuid,
                overview: JSON.parse(overviewJson),
                data: band[uuid],
                category: band[uuid].category
            });
        } 
    }
}

// findByQuery(): search for this multi-word query
// Query can be multiple space-separated keywords
// Try to match every keyword independently, and the more keywords the query
// matches, the higher ranked it will be. 
// The results for every keyword match is added to a hashmap with a counter. 
// If the result is matched again for another keyword, increase the counter. 
// At the end sort the results by highest counter.

exports.findByQuery = function(query, maxresults) {
    let tokens = query.split(' ');
    let points = {};
    let matches = {};
    if (!maxresults) maxresults = 10;

    for (let token of tokens) {
        let found = exports.findByKeyword(token);

        for (let entry of found) {
            if (!(entry.uuid in points)) {
                points[entry.uuid] = 1;
            } else {
                points[entry.uuid] += 1;
            }
            matches[entry.uuid] = entry;
        }
    }

    let results = Object.values(matches);
    let sortFn = (a, b) => points[b.uuid] - points[a.uuid];
    results.sort(sortFn);
    return results.slice(0, maxresults);
}

// Returns an array of result objects:
// { 
//   overview: { url, URLs, title }
//   uuid,
//   data: { fields }
//   }
// }
exports.findByKeyword = function(keyword) {
    results = [];
    keyword = keyword.toLowerCase()

    if (keyword.length == 0) return [];

    for (var i = 0; i < entries.length; i++) {
        var overview = entries[i].overview;
        if (!overview.hasOwnProperty('title')) continue;

        var matchTitle = 
            overview.title.toLowerCase().indexOf(keyword) != -1;

        var matchUrl = false;
        if (overview.hasOwnProperty('url')) {
            matchUrl = 
                overview.url.toLowerCase().indexOf(keyword) != -1;
        }

        if (matchTitle || matchUrl) {

            var itemKey = decryptItemKey(entries[i].data.k, masterKey);
            var cleartext = decryptOpdata(entries[i].data.d, itemKey);

            results.push({
                    overview: overview, 
                    uuid: entries[i].uuid,
                    data: JSON.parse(cleartext),
                    category: entries[i].category
            });
        }
    }

    return results;
}

function extractHost(urlstr) {
    parsed = url.parse(urlstr);
    var host = parsed.hostname.toLowerCase();

    var split = host.split('.');
    while (split.length > 2) {
        split.shift();
    }
    return split.join('.');
}

exports.findByURL = function(browserurl) {
    results = [];

    var browserhost = extractHost(browserurl);

    for (var i = 0; i < entries.length; i++) {
        var overview = entries[i].overview;

        if (!overview.hasOwnProperty('url')) {
            continue;
        }

        var entryurl = url.parse(overview.url);

        if (!entryurl.hostname) {
            continue;
        }

        var entryurlhost = extractHost(overview.url);

        if (browserhost == entryurlhost) {
            var itemKey = decryptItemKey(entries[i].data.k, masterKey);
            var cleartext = decryptOpdata(entries[i].data.d, itemKey);

            results.push({
                    overview: overview, 
                    data: JSON.parse(cleartext),
                    category: entries[i].category
            });
        }
    }

    return results;
}

