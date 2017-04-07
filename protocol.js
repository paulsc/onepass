var winston = require('winston');
var uuidV1 = require('uuid/v1');
var fs = require('fs');
var sjcl = require('./sjcl');
sjcl.beware["CBC mode is dangerous because it doesn't protect message integrity."]();

var form = require('./form');

var SECRET = loadSecret();
var payloadKey = null;
var m4 = null;

exports.handleMessage = function(connection, message) {

    message = JSON.parse(message.utf8Data);
    winston.debug('[RECV]', message.action);

	if (payloadKey && message.action != "authVerify") {
		message.payload = payloadKey.decryptPayload(message.payload);
	}

    function send(message) {
        if (payloadKey) {
            encpayload = payloadKey.encryptPayload(message.payload);
            message.payload = encpayload;
        }
        connection.send(JSON.stringify(message));
        winston.debug("[SENT]", message.action); 
    }

    if (message.action == "hello") {
        if (SECRET) {
            winston.debug('I have secret, doing authBegin');
            doAuthBegin();
        }
        else {
            winston.info("No secret stored, starting pairing process");
            send({ action: "authNew", 
                   payload: { method: "auth-sma-hmac256",
                              alg: "aead-cbchmac-256",
                              code: 1664 }
                });
                winston.info("*** Open https://agilebits.com/"
                    + "browsers/auth.html in your browser now"
                    + " to finalize pairing process *** ");
        }

    }
    else if (message.action == "authRegister") {
        SECRET = message.payload.secret;
        saveSecret(SECRET);
        winston.info("Received authRegister, secret: " + SECRET)
        doAuthBegin();
    }
    else if (message.action == "authBegin") {
        doAuthContinue(message.payload);
    }
    else if (message.action == "authVerify") {
        if (m4 != message.payload.M4) {
            winston.error("Browser authentication failed"); 
            process.exit();
        }

        send({ action: "welcome", 
               payload: { alg: "aead-cbchmac-256" } });
        winston.info("Succesfully connected to browser extenstion.");
    }
    else if (message.action == "showPopup") {
        msg = { action: "collectDocuments", 
            payload: { context: uuidV1()}};
        send(msg);
    }
    else if (message.action == "collectDocumentResults") {
        form.fill(message.payload, send);
    }

    function doAuthBegin() {
        send({ action: "authBegin", 
               payload: { method: "auth-sma-hmac256",
                          alg: "aead-cbchmac-256" }
            });
    }

    function doAuthContinue(payload) {
        var cc = payload.cc;

		// need to generate payload with M3, cs and method
		// generate CS random number, convert to base64
		// concat that with d, the original challenge
        // hash 256 that, then hmac with key
        d = sjcl.random.randomWords(8);
        cs = sjcl.codec.base64.fromBits(d, true, true);

        b = sjcl.codec.base64.toBits(cc, true);
        a = sjcl.codec.base64.toBits(SECRET, true);
        a = new sjcl.misc.hmac(a,sjcl.hash.sha256);
        var h = sjcl.hash.sha256.hash(sjcl.bitArray.concat(d, b))
          , h = a.encrypt(h);
        computedM3 = sjcl.codec.base64.fromBits(h, !0, !0);
 
        outpayload = { M3: computedM3, cs: cs, method: payload.method };

        winston.debug("Sending computed payload: ", outpayload);

        send({ action: "authContinue", payload: outpayload });

		// Now generate key for encryption derived from M3
        f = a.encrypt(h);
        m4 = r.A(f);

        encryptionBits = sjcl.codec.utf8String.toBits('encryption'),
        hmacBits = sjcl.codec.utf8String.toBits('hmac'),

        c = a.encrypt(h.concat(f).concat(encryptionBits)),
        a = a.encrypt(f.concat(h).concat(hmacBits)),
        payloadKey = new na(c, a);
    }

}

// encryption stuff
var r = new function() {
    this.rot13 = this.Kb = function(a) {
        for (var c = [], b, d = a.length, e = 'a'.charCodeAt(), f = e + 26, h = 'A'.charCodeAt(), k = h + 26; d--; )
            b = a.charCodeAt(d),
            c[d] = b >= e && b < f ? String.fromCharCode((b - e + 13) % 26 + e) : b >= h && b < k ? String.fromCharCode((b - h + 13) % 26 + h) : a.charAt(d);
        return c.join('')
    }
    ;
    this.base64toBits = this.H = function(a) {
        return sjcl.codec.base64.toBits(a.replace('\x00', ''), !0)
    }
    ;
    this.bitsToBase64 = this.A = function(a) {
        return sjcl.codec.base64.fromBits(a, !0, !0)
    }
}

function na(a, c) {
    function b(a, b, c) {

        if (void 0 === a)
            throw new sjcl.exception.invalid('iv is required');
        if (void 0 === b && void 0 === c)
            throw new sjcl.exception.invalid('Either ciphertext or adata is required for hmac calculation.');
        if ('string' !== typeof a || void 0 !== b && 'string' !== typeof b || void 0 !== c && 'string' !== typeof c)
            throw new sjcl.exception.invalid('Invalid input: ' + typeof a + '/' + typeof b + '/' + typeof c);
        a = [a];
        void 0 !== b && a.push(b);
        void 0 !== c && a.push(c);
        return d.encrypt(a.join(''))
    }
    var d;
    this.Ya = new sjcl.cipher.aes(a);
    d = new sjcl.misc.hmac(c,sjcl.hash.sha256);
    this.aa = 'aead-cbchmac-256';
    this.encryptPayload = this.vb = function(a) {
        var c, d;
        a = 'object' === typeof a ? JSON.stringify(a) : a;
        c = sjcl.codec.utf8String.toBits(a);

        //a = crypto.getRandomValues(new Uint8Array(16));
        //d = sjcl.codec.bytes.toBits(a);
        d = sjcl.random.randomWords(4);

        a = r.A(d);
        c = sjcl.mode.cbc.encrypt(this.Ya, c, d);
        d = r.A(c);
        c = {
            alg: this.aa,
            iv: a,
            data: d
        };
        a = b(a, d, void 0);
        a = sjcl.bitArray.clamp(a, 96);
        c.hmac = r.A(a);
        return c
    }
    ;
    this.decryptPayload = this.ub = function(a) {
        var c, d, k, l, p, m, t, x;
        if (a.alg !== this.aa)
            throw Error('Mismatched payload algorithm: <' + a.alg + '/' + this.aa + '>');
        c = a.iv;
        d = a.data;
        k = a.adata;
        try {
            p = a.hmac;
            l = r.H(p);
            a = k;
            var C, D;
            void 0 === l && (l = a,
            a = void 0);
            D = sjcl.bitArray.bitLength(l);
            if (96 > D)
                throw new sjcl.exception.invalid('The supplied hmac value is invalid.');
            C = b(c, d, a);
            sjcl.bitArray.bitLength(C) > D && (C = sjcl.bitArray.bitSlice(C, 0, D));
            if (!sjcl.bitArray.equal(C, l))
                throw new sjcl.exception.corrupt('Failed to validate payload hmac.');
            m = sjcl.mode.cbc.decrypt(this.Ya, r.H(d), r.H(c));
            t = sjcl.codec.utf8String.fromBits(m);
            x = JSON.parse(t)
        } catch (X) {
            console.error(X)
        } finally {
            return x
        }
    }
}



function saveSecret(secret) {
    fs.writeFile('.secret', secret, function(err) {
        if (err) {
            winston.error("error storing secret", err);
            return
        }
        winston.info("secret saved");
    });
}

function loadSecret() {
    return fs.readFileSync('.secret', 'utf8');
}
