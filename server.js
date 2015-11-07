(function () {
    'use strict';
    // Dependencies
    const restify = require('restify');
    const socketio = require('socket.io');

    // Configuration
    const port = 8080;
    const burst = 100;
    const throttleRate = 50;

    var server = restify.createServer();
    var io = socketio.listen(server);
    var sockets = {};

    server.use(restify.CORS());
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

    var instruments = {
        drums: false,
        bass: false,
        lead: false,
        rhythm: false
    };
    server.get('/instruments', function (req, res) {
        res.status(200);
        res.send(instruments);
    });

    server.post('/instruments/:instrument', function (req, res) {
        var instrument = req.params.instrument;
        if (!(instrument in instruments)) {
            res.status(404);
            res.send({
                name: 'InstrumentNotFound',
                message: 'The instrument ' + instrument + ' was not found',
                statusCode: 404
            });
        } else if (instruments[instrument]) {
            res.status(412);
            return res.send({
                name: 'InstrumentNotAvailable',
                message: 'The instrument ' + instrument + ' has already been reserved',
                statusCode: 412
            });
        }

        instruments[instrument] = true;
        instrumentSubscriptionChanged(instrument, 'reserved');
        res.status(204);
        res.end();
    });

    server.del('/instruments/:instrument', function (req, res) {
        let instrument = req.params.instrument;
        instruments[instrument] = false;
        instrumentSubscriptionChanged(instrument, 'released');
        res.status(204);
        res.end();
    });

    io.sockets.on('connection', function (socket) {
        // Keep a reference so that we can notify the sockets on changes.
        sockets[socket.id] = socket;

        socket.on('reserved instrument', function (instrument) {
            instruments[instrument] = socket.id;
        });

        socket.on('disconnect', function () {
            delete sockets[socket.id];
            Object.keys(instruments).forEach(function (instrument) {
                if (instruments[instrument] === socket.id) {
                    instruments[instrument] = false;
                    broadcastEvent('instruments changed', instruments);
                    broadcastEvent('instrument released', instrument);
                }
            });
        });

        Object.keys(instruments).forEach(function (instrument) {
            socket.on('play ' + instrument, function (sound) {
                broadcastEvent(instrument + ' played', sound);
            });
        });
    });

    server.listen(port, function () {
        console.log('socket.io server listening at %s', server.url);
    });

    function instrumentSubscriptionChanged(instrument, action) {
        broadcastEvent('instrument ' + action, instrument);
        broadcastEvent('instruments changed', instruments);
    }

    function broadcastEvent(name, data) {
        Object.keys(sockets).forEach(function (socketId) {
            let socket = sockets[socketId];
            socket.emit(name, data);
        });
    }

    module.exports = {
        server: server,
        port: process.env.PORT || port
    };
}());