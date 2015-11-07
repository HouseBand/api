(function () {
    'use strict';
    // Dependencies
    const restify = require('restify');
    const socketio = require('socket.io');
    const redis = require('redis');
    const Promise = require('bluebird');

    // Setup Redis client with promises
    Promise.promisifyAll(redis.RedisClient.prototype);
    Promise.promisifyAll(redis.Multi.prototype);

    // Configuration
    const port = 8080;
    const burst = 100;
    const throttleRate = 50;

    var server = restify.createServer();
    var io = socketio.listen(server);
    var redisClient = redis.createClient({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
    });

    redisClient.on("error", function (err) {
        console.log("Error " + err);
    });

    server.use(restify.CORS());
    server.use(restify.gzipResponse());
    server.use(restify.bodyParser());
    server.use(restify.throttle({
        burst: burst,
        rate: throttleRate,
        ip: true
    }));
    server.use(restify.conditionalRequest());

    // Health Check
    server.get('/', function (req, res) {
        res.status(200);
        res.send({
            message: 'Oh hai there!'
        });
    });

    var defaultInstruments = {
        drums: false,
        bass: false,
        lead: false,
        rhythm: false
    };

    server.get('/flush', function (req, res) {
        redisClient
            .flushdbAsync()
            .then(function () {
                res.status(204);
                res.end();
            });
    });

    server.get('/rooms', function (req, res, next) {
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                res.send(rooms || []);
            })
            .catch(next);
    });
    server.post('/rooms/:room', function (req, res, next) {
        let room = req.params.room;
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                rooms = rooms || {};
                if (rooms[room]) {
                    res.status(412);
                    return res.send({
                        name: 'RoomAlreadyExists',
                        message: 'The room ' + room + ' already exists',
                        statusCode: 419
                    })
                }

                rooms[room] = defaultInstruments;

                return Promise.all([
                    redisClient.setAsync('rooms:' + room, JSON.stringify(rooms)),
                    redisClient.setAsync('rooms', JSON.stringify(Object.keys(rooms)))
                ]).then(function () {
                    res.status(204);
                    res.end();
                });
            })
            .catch(next);
    });
    server.del('/rooms/:room', function (req, res) {
        let room = req.params.room;
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                let roomIndex = rooms.indexOf(room);
            })
    });

    server.get('/rooms/:room/instruments', function (req, res) {
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