(function () {
    'use strict';
    // Dependencies
    const supertest = require('supertest-as-promised');

    var app;

    describe('Rooms', function () {
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
        it('shouldn\'t be able to create a duplicate room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .post('/rooms/asdf')
                        .expect({
                            name: 'RoomAlreadyExists',
                            message: 'The room asdf already exists',
                            statusCode: 419
                        })
                        .expect(419);
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
        it('should be able to create rooms then get them', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .post('/rooms/fdsa')
                        .expect('')
                        .expect(204);
                })
                .then(function () {
                    return supertest(app.server)
                        .get('/rooms')
                        .expect(['asdf', 'fdsa'])
                        .expect(200);
                });
        });
        it('should be able to create then delete a room', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .delete('/rooms/asdf')
                        .expect('')
                        .expect(204);
                })
                .then(function () {
                    return supertest(app.server)
                        .get('/rooms')
                        .expect([])
                        .expect(200);
                });
        });
        it('shouldn\'t be able to delete a room that doesn\'t exist', function () {
            return supertest(app.server)
                .delete('/rooms/qwerty')
                .expect({
                    name: 'RoomNotFound',
                    message: 'The room qwerty was not found',
                    statusCode: 404
                })
                .expect(404);
        });
    });
}());