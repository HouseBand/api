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

    describe.only('Rooms', function () {
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
        it('should be able to list the current rooms', function () {
            return supertest(app.server)
                .get('/rooms')
                .expect([])
                .expect(200);
        });
        it('should be able to create a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204);
        });
        it('should be able to create then get a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .get('/rooms')
                        .expect(['asdf'])
                        .expect(200);
                });
        });
        it('should be able to create then get a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .get('/rooms')
                        .expect(['asdf'])
                        .expect(200);
                });
        });
    });
}());