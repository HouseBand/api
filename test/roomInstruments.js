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

    describe('Room Instruments', function () {
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
        it('should be able to get the instruments for a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .get('/rooms/asdf/instruments')
                        .expect({
                            drums: false,
                            bass: false,
                            lead: false,
                            rhythm: false
                        })
                        .expect(200);
                });
        });
        it('shouldn\'t be able to get the instruments for a room that doesn\'t exist', function () {
            return supertest(app.server)
                .get('/rooms/qwerty/instruments')
                .expect({
                    name: 'RoomNotFound',
                    message: 'The room qwerty was not found',
                    statusCode: 404
                })
                .expect(404);
        });
        it('should be able to reserve an instrument for a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .post('/rooms/asdf/instruments/drums')
                        .expect('')
                        .expect(204);
                });
        });
        it('shouldn\'t be able to reserve an instrument for a room that doesn\'t exist', function () {
            return supertest(app.server)
                .post('/rooms/qwerty/instruments/drums')
                .expect({
                    name: 'RoomNotFound',
                    message: 'The room qwerty was not found',
                    statusCode: 404
                })
                .expect(404);
        });
        it('shouldn\'t be able to reserve an instrument that doesn\'t exist for a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .post('/rooms/asdf/instruments/noExist')
                        .expect({
                            name: 'InstrumentNotFound',
                            message: 'The instrument noExist was not found',
                            statusCode: 404
                        })
                        .expect(404);
                });
        });
        it('should be able to release an instrument for a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .post('/rooms/asdf/instruments/drums')
                        .expect('')
                        .expect(204);
                })
                .then(function () {
                    return supertest(app.server)
                        .delete('/rooms/asdf/instruments/drums')
                        .expect('')
                        .expect(204);
                });
        });
        it('shouldn\'t be able to release an instrument for a room that doesn\'t exist', function () {
            return supertest(app.server)
                .delete('/rooms/qwerty/instruments/drums')
                .expect({
                    name: 'RoomNotFound',
                    message: 'The room qwerty was not found',
                    statusCode: 404
                })
                .expect(404);
        });
        it('shouldn\'t be able to release an instrument that doesn\'t exist for a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .delete('/rooms/asdf/instruments/noExist')
                        .expect({
                            name: 'InstrumentNotFound',
                            message: 'The instrument noExist was not found',
                            statusCode: 404
                        })
                        .expect(404);
                });
        });
        it('shouldn\'t be able to release an instrument that isn\'t reserved for a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .delete('/rooms/asdf/instruments/drums')
                        .expect({
                            name: 'InstrumentNotReserved',
                            message: 'The instrument drums has not yet been reserved',
                            statusCode: 412
                        })
                        .expect(412);
                });
        });
    });
}());