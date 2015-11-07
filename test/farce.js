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

    describe.skip('API Tests', function () {
        beforeEach(function () {
            // Remove the singleton
            delete require.cache[require.resolve('../server')];
            app = require('../server');
        });
        afterEach(function () {
            app.server.close();
        });
        it('should get a message back', function () {
            return supertest(app.server)
                .get('/')
                .expect({
                    message: 'Oh hai there!'
                })
                .expect(200);
        });
        it('should be able to list the instruments', function () {
            return supertest(app.server)
                .get('/instruments')
                .expect({
                    drums: false,
                    bass: false,
                    lead: false,
                    rhythm: false
                })
                .expect(200);
        });
        it('should be able to reserve an instrument', function () {
            return supertest(app.server)
                .post('/instruments/drums')
                .expect('')
                .expect(204);
        });
        it('should be able to reserve an instrument and then see the updated list', function () {
            return supertest(app.server)
                .post('/instruments/drums')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .get('/instruments')
                        .expect({
                            drums: true,
                            bass: false,
                            lead: false,
                            rhythm: false
                        })
                        .expect(200);
                });
        });
        it('shouldn\'t be able to reserve an instrument that has already been reserved', function () {
            return supertest(app.server)
                .post('/instruments/drums')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .post('/instruments/drums')
                        .expect({
                            message: 'The instrument drums has already been reserved',
                            name: 'InstrumentNotAvailable',
                            statusCode: 412
                        })
                        .expect(412);
                });
        });
        it('shouldn\'t be able to reserve an instrument that doesn\'t exist', function () {
            return supertest(app.server)
                .post('/instruments/noExist')
                .expect({
                    name: 'InstrumentNotFound',
                    message: 'The instrument noExist was not found',
                    statusCode: 404
                })
                .expect(404);
        });
        it('should be able to reserve an instrument then release it', function () {
            return supertest(app.server)
                .post('/instruments/drums')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .delete('/instruments/drums')
                        .expect('')
                        .expect(204)
                        .then(function () {
                            return supertest(app.server)
                                .post('/instruments/drums')
                                .expect('')
                                .expect(204);
                        });
                });
        });
    });
}());