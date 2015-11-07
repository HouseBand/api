(function () {
    'use strict';
    // Dependencies
    const supertest = require('supertest-as-promised');
    const io = require('socket.io-client');
    const Promise = require('bluebird');
    const chai = require('chai');
    chai.use(require('chai-as-promised'));
    chai.use(require('dirty-chai'));

    var app;
    var expect = chai.expect;

    describe('Room Sockets', function () {
        beforeEach(function () {
            // Remove the singleton
            delete require.cache[require.resolve('../server')];
            app = require('../server');
            return supertest(app.server)
                .get('/flush')
                .expect('')
                .expect(204);
        });
        afterEach(function () {
            app.server.close();
        });
        it('should be able to create a room and join it', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    var firstClient = io.connect('http://localhost:' + app.port + '/asdf', {
                        transports: ['websocket'],
                        'force new connection': true
                    });
                    expect(firstClient.nsp).to.equal('/asdf');
                });
        });
        it('should be notified of an instrument being released', function () {
            var firstClient = io.connect('http://localhost:' + app.port + '/asdf', {
                transports: ['websocket'],
                'force new connection': true
            });

            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return expect(Promise.all([
                        new Promise(function (resolve) {
                            firstClient.on('connect', function () {
                                supertest(app.server)
                                    .post('/rooms/asdf/instruments/drums')
                                    .expect('')
                                    .expect(204)
                                    .then(function () {
                                        firstClient.emit('reserved instrument', 'drums');
                                        return supertest(app.server)
                                            .delete('/rooms/asdf/instruments/drums')
                                            .expect('')
                                            .expect(204);
                                    });

                                var firstComplete = false;
                                firstClient.on('instruments changed', function (instruments) {
                                    expect(instruments).to.deep.equal({
                                        drums: !firstComplete,
                                        bass: false,
                                        lead: false,
                                        rhythm: false
                                    });
                                    if (firstComplete) {
                                        resolve();
                                    }
                                    firstComplete = true;
                                });
                            });
                        }),
                        new Promise(function (resolve) {
                            firstClient.on('instrument released', function (instrument) {
                                expect(instrument).to.equal('drums');
                                resolve();
                            });
                        }),
                        new Promise(function (resolve) {
                            firstClient.on('instrument reserved', function (instrument) {
                                expect(instrument).to.equal('drums');
                                resolve();
                            });
                        })
                    ])).to.eventually.be.fulfilled();
                });
        });
        it('should be notified of a user with a reserved instrument dropping off', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    var firstClient = io.connect('http://localhost:' + app.port + '/asdf', {
                        transports: ['websocket'],
                        'force new connection': true
                    });
                    var secondClient = io.connect('http://localhost:' + app.port + '/asdf', {
                        transports: ['websocket'],
                        'force new connection': true
                    });
                    var thirdClient = io.connect('http://localhost:' + app.port + '/asdf', {
                        transports: ['websocket'],
                        'force new connection': true
                    });

                    firstClient.on('connect', function () {
                        supertest(app.server)
                            .post('/rooms/asdf/instruments/drums')
                            .expect('')
                            .expect(204)
                            .then(function () {
                                firstClient.emit('reserved instrument', 'drums');
                            });
                    });

                    return expect(Promise.all([
                        new Promise(function (resolve) {
                            var firstComplete = false;
                            secondClient.on('connect', function () {
                                secondClient.on('instruments changed', function (instruments) {
                                    expect(instruments).to.deep.equal({
                                        drums: !firstComplete,
                                        bass: false,
                                        lead: false,
                                        rhythm: false
                                    });
                                    if (firstComplete) {
                                        resolve();
                                    }
                                    firstClient.disconnect();
                                    thirdClient.disconnect();
                                    firstComplete = true;
                                });
                            });
                        }),
                        new Promise(function (resolve) {
                            secondClient.on('instrument released', function (instrument) {
                                expect(instrument).to.equal('drums');
                                resolve();
                            });
                        })
                    ])).to.eventually.be.fulfilled();
                });
        });
        it('should be able to issue play commands for an instrument', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    var firstClient = io.connect('http://localhost:' + app.port + '/asdf', {
                        transports: ['websocket'],
                        'force new connection': true
                    });
                    var secondClient = io.connect('http://localhost:' + app.port + '/asdf', {
                        transports: ['websocket'],
                        'force new connection': true
                    });

                    return new Promise(function (resolve) {
                        firstClient.on('connect', function () {
                            secondClient.on('connect', function () {
                                firstClient.emit('play drums', {
                                    file: 'someFile.mp3'
                                });
                                resolve();
                            });
                        });
                    }).then(function () {
                        return expect(Promise.all([
                            new Promise(function (resolve) {
                                firstClient.on('drums played', function (sound) {
                                    expect(sound).to.deep.equal({
                                        file: 'someFile.mp3'
                                    });
                                    resolve();
                                });
                            }),
                            new Promise(function (resolve) {
                                secondClient.on('drums played', function (sound) {
                                    expect(sound).to.deep.equal({
                                        file: 'someFile.mp3'
                                    });
                                    resolve();
                                });
                            })
                        ])).to.eventually.be.fulfilled();
                    });
                });
        });
    });
}());