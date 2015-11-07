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
        let roomName = req.params.room;
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                rooms = rooms || [];

                if (rooms.indexOf(roomName) >= 0) {
                    res.status(419);
                    return res.send({
                        name: 'RoomAlreadyExists',
                        message: 'The room ' + roomName + ' already exists',
                        statusCode: 419
                    })
                }

                rooms.push(roomName);

                return Promise.all([
                    redisClient.setAsync('rooms:' + roomName, JSON.stringify(defaultInstruments)),
                    redisClient.setAsync('rooms', JSON.stringify(rooms))
                ]).then(function () {
                    res.status(204);
                    res.end();
                });
            })
            .catch(next);
    });
    server.del('/rooms/:room', function (req, res) {
        let roomName = req.params.room;
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                rooms = rooms || [];
                let roomIndex = rooms.indexOf(roomName);
                if (roomIndex >= 0) {
                    rooms.splice(roomIndex, 1);
                    return Promise.all([
                        redisClient.delAsync('rooms:' + roomName),
                        redisClient.setAsync('rooms', JSON.stringify(rooms))
                    ]).then(function () {
                        res.status(204);
                        res.end();
                    });
                }
                res.status(404);
                res.send({
                    name: 'RoomNotFound',
                    message: 'The room ' + roomName + ' was not found',
                    statusCode: 404
                });
            })
    });

    server.get('/rooms/:room/instruments', function (req, res) {
        let roomName = req.params.room;
        redisClient
            .getAsync('rooms:' + roomName)
            .then(JSON.parse)
            .then(function (room) {
                if (!room) {
                    res.status(404);
                    return res.send({
                        name: 'RoomNotFound',
                        message: 'The room ' + roomName + ' was not found',
                        statusCode: 404
                    });
                }

                res.send(room);
            });
    });

    server.post('/rooms/:room/instruments/:instrument', function (req, res) {
        let roomName = req.params.room;
        var instrumentName = req.params.instrument;
        redisClient
            .getAsync('rooms:' + roomName)
            .then(JSON.parse)
            .then(function (room) {
                if (!room) {
                    res.status(404);
                    return res.send({
                        name: 'RoomNotFound',
                        message: 'The room ' + roomName + ' was not found',
                        statusCode: 404
                    });
                }

                if (!(instrumentName in room)) {
                    res.status(404);
                    res.send({
                        name: 'InstrumentNotFound',
                        message: 'The instrument ' + instrumentName + ' was not found',
                        statusCode: 404
                    });
                } else if (room[instrumentName]) {
                    res.status(412);
                    return res.send({
                        name: 'InstrumentNotAvailable',
                        message: 'The instrument ' + instrumentName + ' has already been reserved',
                        statusCode: 412
                    });
                }

                room[instrumentName] = true;
                return redisClient
                    .setAsync('rooms:' + roomName, JSON.stringify(room))
                    .then(function () {
                        //instrumentSubscriptionChanged(instrumentName, 'reserved');
                        res.status(204);
                        res.end();
                    });
            });
    });

    server.del('/rooms/:room/instruments/:instrument', function (req, res) {
        let roomName = req.params.room;
        var instrumentName = req.params.instrument;
        redisClient
            .getAsync('rooms:' + roomName)
            .then(JSON.parse)
            .then(function (room) {
                if (!room) {
                    res.status(404);
                    return res.send({
                        name: 'RoomNotFound',
                        message: 'The room ' + roomName + ' was not found',
                        statusCode: 404
                    });
                }

                if (!(instrumentName in room)) {
                    res.status(404);
                    res.send({
                        name: 'InstrumentNotFound',
                        message: 'The instrument ' + instrumentName + ' was not found',
                        statusCode: 404
                    });
                } else if (!room[instrumentName]) {
                    res.status(412);
                    return res.send({
                        name: 'InstrumentNotReserved',
                        message: 'The instrument ' + instrumentName + ' has not yet been reserved',
                        statusCode: 412
                    });
                }

                room[instrumentName] = false;
                return redisClient
                    .setAsync('rooms:' + roomName, JSON.stringify(room))
                    .then(function () {
                        //instrumentSubscriptionChanged(instrumentName, 'reserved');
                        res.status(204);
                        res.end();
                    });
            });
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