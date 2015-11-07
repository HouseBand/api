(function () {
    'use strict';
    // Dependencies
    const restify = require('restify');
    const socketio = require('socket.io');

    // Configuration
    const port = 8000;
    const burst = 100;
    const throttleRate = 50;

    var server = restify.createServer();
    var io = socketio.listen(server);

    server.use(restify.CORS());
    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.authorizationParser());
    server.use(restify.dateParser());
    server.use(restify.queryParser());
    server.use(restify.jsonp());
    server.use(restify.gzipResponse());
    server.use(restify.bodyParser());
    server.use(restify.throttle({
        burst: burst,
        rate: throttleRate,
        ip: true
    }));
    server.use(restify.conditionalRequest());

    server.get('/', function (req, res) {
        res.status(200);
        res.send({
            message: 'Oh hai there!'
        });
    });

    io.sockets.on('connection', function (socket) {
        socket.emit('news', {hello: 'world'});
        socket.on('my other event', function (data) {
            console.log(data);
        });
    });

    server.listen(port, function () {
        console.log('socket.io server listening at %s', server.url);
    });

    module.exports = {
        server: server,
        port: port
    };
}());