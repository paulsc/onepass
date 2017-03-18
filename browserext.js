var WebSocketServer = require('websocket').server;
var http = require('http');
var winston = require('winston');

var protocol = require('./protocol');

var portNumbers = [6263, 10196, 14826, 24866, 
    25012, 38156, 46365, 49806, 55735, 59488];

var extId = 'chrome-extension://aomjjhallfgjeglblehebfpbcfeobpgk';

exports.connect = function() {
    winston.info('Connecting to browser...');
    portNumbers.forEach(function(port) {
        startServer(port)
    });
    winston.info('Servers started on all ports');
}

function startServer(port) {
    var server = http.createServer(function(request, response) { });
    server.listen(port, function() { });

    wsServer = new WebSocketServer({
        httpServer: server
    });

    wsServer.on('request', function(request) {

        winston.info('Connection request from origin: ' + request.origin);
        if (request.origin != extId) {
            winston.log("not authorized, rejected.");
            request.reject();
            return;
        }

        var connection = request.accept(null, request.origin);

        winston.info('Connection accepted');

        connection.on('message', function(message) {
            protocol.handleMessage(connection, message); 
        });

        connection.on('close', function(connection) {
            winston.info('Connection closed');
            payloadKey = null;
            m4 = null;
        });
    });

    // winston.info("Websocket server started on port " + port)
}


