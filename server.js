(function () {
    'use strict';
    // Dependencies
    const restify = require('restify');
    const socketio = require('socket.io');
    const redis = require('redis');
    const Promise = require('bluebird');
    const socketIORedis = require('socket.io-redis');

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
    io.adapter(socketIORedis({host: process.env.REDIS_HOST, port: process.env.REDIS_PORT}));

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

    var roomNamespaces = {};
    var defaultInstruments = {
        drums: false,
        bass: false,
        lead: false,
        rhythm: false
    };

    server.get('/flush', function (req, res) {
        console.log('Flushing Current State');
        redisClient
            .flushallAsync()
            .then(function () {
                res.status(204);
                res.end();
            });
    });

    server.get('/rooms', function (req, res, next) {
        console.log('Retrieving Room List');
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                console.log('Got Room List');
                res.send(rooms || []);
            })
            .catch(next);
    });
    server.post('/rooms/:room', function (req, res, next) {
        let roomName = req.params.room;
        console.log('Creating Room ' + roomName);
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                rooms = rooms || [];

                if (rooms.indexOf(roomName) >= 0) {
                    console.log('Room ' + roomName + ' already exists');
                    res.status(419);
                    return res.send({
                        name: 'RoomAlreadyExists',
                        message: 'The room ' + roomName + ' already exists',
                        statusCode: 419
                    });
                }

                rooms.push(roomName);

                console.log('Storing newly created room');
                return Promise.all([
                    redisClient.setAsync('rooms:' + roomName, JSON.stringify(defaultInstruments)),
                    redisClient.setAsync('rooms', JSON.stringify(rooms))
                ]).then(function () {
                    console.log('Room stored, setting it up');
                    setupRoom(roomName);
                    res.status(204);
                    res.end();
                });
            })
            .catch(next);
    });
    server.del('/rooms/:room', function (req, res) {
        let roomName = req.params.room;
        console.log('Removing Room ' + roomName);
        redisClient
            .getAsync('rooms')
            .then(JSON.parse)
            .then(function (rooms) {
                rooms = rooms || [];
                let roomIndex = rooms.indexOf(roomName);
                if (roomIndex >= 0) {
                    console.log('Room ' + roomName + ' exists, removing it');
                    rooms.splice(roomIndex, 1);
                    return Promise.all([
                        redisClient.delAsync('rooms:' + roomName),
                        redisClient.setAsync('rooms', JSON.stringify(rooms))
                    ]).then(function () {
                        teardownRoom(roomName);
                        console.log('Deleted room ' + roomName);
                        res.status(204);
                        res.end();
                    });
                }
                teardownRoom(roomName);
                res.status(404);
                res.send({
                    name: 'RoomNotFound',
                    message: 'The room ' + roomName + ' was not found',
                    statusCode: 404
                });
            });
    });

    server.get('/rooms/:room/instruments', function (req, res) {
        let roomName = req.params.room;
        console.log('Retrieving instruments for ' + roomName);
        redisClient
            .getAsync('rooms:' + roomName)
            .then(JSON.parse)
            .then(function (room) {
                if (!room) {
                    console.log('Room ' + roomName + 'doesn\'t exist');
                    res.status(404);
                    return res.send({
                        name: 'RoomNotFound',
                        message: 'The room ' + roomName + ' was not found',
                        statusCode: 404
                    });
                }

                console.log('Sending back instruments for room ' + roomName);
                res.send(room);
            });
    });

    server.post('/rooms/:room/instruments/:instrument', function (req, res) {
        let roomName = req.params.room;
        var instrumentName = req.params.instrument;
        console.log('Reserving ' + instrumentName + ' in ' + roomName);
        redisClient
            .getAsync('rooms:' + roomName)
            .then(JSON.parse)
            .then(function (room) {
                if (!room) {
                    console.log('Can\'t reserve ' + instrumentName + ' in ' + roomName + ' room doesn\'t exist');
                    res.status(404);
                    return res.send({
                        name: 'RoomNotFound',
                        message: 'The room ' + roomName + ' was not found',
                        statusCode: 404
                    });
                }

                if (!(instrumentName in room)) {
                    console.log('Can\'t reserve ' + instrumentName + ' in ' + roomName + ' instrument doesn\'t exist');
                    res.status(404);
                    return res.send({
                        name: 'InstrumentNotFound',
                        message: 'The instrument ' + instrumentName + ' was not found',
                        statusCode: 404
                    });
                } else if (room[instrumentName]) {
                    console.log('Can\'t reserve ' + instrumentName + ' in ' + roomName + ' instrument not available');
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
                        console.log('Instrument ' + instrumentName + ' in ' + roomName + ' reserved');
                        io.of('/' + roomName).emit('instrument reserved', instrumentName);
                        io.of('/' + roomName).emit('instruments changed', room);
                        res.status(204);
                        res.end();
                    });
            });
    });

    server.del('/rooms/:room/instruments/:instrument', function (req, res, next) {
        let roomName = req.params.room;
        var instrumentName = req.params.instrument;
        console.log('Releasing ' + instrumentName + ' in ' + roomName);
        releaseInstrument(roomName, instrumentName)
            .then(function () {
                console.log('Released ' + instrumentName + ' in ' + roomName + ' reserved');
                res.status(204);
                res.end();
            })
            .catch(function (reason) {
                console.log('Failed to release ' + instrumentName + ' in ' + roomName + ' because ' + reason);
                console.error(reason);
                res.status(reason.statusCode);
                return res.send(reason);
            });
    });

    server.listen(port, function () {
        console.log('socket.io server listening at %s', server.url);
    });

    function releaseInstrument(roomName, instrumentName) {
        console.log('Releasing Instrument ' + instrumentName + ' in ' + roomName);
        return redisClient
            .getAsync('rooms:' + roomName)
            .then(JSON.parse)
            .then(function (room) {
                if (!room) {
                    console.log('Failed Release ' + instrumentName + ' in ' + roomName + ' because room is not found');
                    return Promise.reject({
                        name: 'RoomNotFound',
                        message: 'The room ' + roomName + ' was not found',
                        statusCode: 404
                    });
                }

                if (!(instrumentName in room)) {
                    console.log('Failed Release ' + instrumentName + ' in ' + roomName + ' because instrument is not found');
                    return Promise.reject({
                        name: 'InstrumentNotFound',
                        message: 'The instrument ' + instrumentName + ' was not found',
                        statusCode: 404
                    });
                } else if (!room[instrumentName]) {
                    console.log('Failed Release ' + instrumentName + ' in ' + roomName + ' because instrument is not reserved');
                    return Promise.reject({
                        name: 'InstrumentNotReserved',
                        message: 'The instrument ' + instrumentName + ' has not yet been reserved',
                        statusCode: 412
                    });
                }

                room[instrumentName] = false;
                return redisClient
                    .setAsync('rooms:' + roomName, JSON.stringify(room))
                    .then(function () {

                        io.of('/' + roomName).emit('instrument released', instrumentName);
                        io.of('/' + roomName).emit('instruments changed', room);
                    })
                    .return(room);
            });
    }

    function setupRoom(roomName) {
        console.log('Setting up room ' + roomName);
        let socketInstruments = {};
        let nsp = io.of('/' + roomName);
        nsp.on('connection', function (socket) {
            console.log('Socket ' + socket.id + ' connected');

            socket.on('reserved instrument', function (instrument) {
                console.log('Instrument ' + instrument + ' has been confirmed reserved in ' + roomName);
                socketInstruments[socket.id] = instrument;
            });

            socket.on('disconnect', function () {
                console.log('Socket ' + socket.id + ' disconnected');
                // If the socket that disconnected has an instrument, release it
                if (socketInstruments[socket.id]) {
                    console.log('Releasing ' + socketInstruments[socket.id] + ' due to disconnect in ' + roomName);
                    releaseInstrument(roomName, socketInstruments[socket.id]);
                    delete socketInstruments[socket.id];
                }
            });

            Object.keys(defaultInstruments).forEach(function (instrument) {
                console.log('Setting up ' + instrument + ' for ' + roomName);
                socket.on('play ' + instrument, function (sound) {
                    console.log('Playing ' + sound + ' for ' + instrument + ' in ' + roomName);
                    io.of('/' + roomName).emit(instrument + ' played', sound);
                });
                socket.on('stop ' + instrument, function (sound) {
                    console.log('Stopping ' + sound + ' for ' + instrument + ' in ' + roomName);
                    io.of('/' + roomName).emit(instrument + ' stopped', sound);
                });
            });
        });
    }

    function teardownRoom(room) {
        console.log('Tearing down room ' + room);
        delete io.nsps['/' + room];
        delete roomNamespaces[room];
    }

    module.exports = {
        server: server,
        port: process.env.PORT || port
    };
}());