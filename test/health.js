(function () {
    'use strict';
    // Dependencies
    const supertest = require('supertest-as-promised');

    var app;

    describe('Health Checks', function () {
        beforeEach(function () {
            // Remove the singleton
            delete require.cache[require.resolve('../server')];
            app = require('../server');
        });
        afterEach(function () {
            app.server.close();
        });
        it('should be able to run the health check', function () {
            return supertest(app.server)
                .get('/')
                .expect({
                    message: 'Oh hai there!'
                })
                .expect(200);
        });
        it('should be able to teardown running rooms', function () {
            return supertest(app.server)
                .post('/rooms/asdf')
                .expect('')
                .expect(204)
                .then(function () {
                    return supertest(app.server)
                        .get('/flush')
                        .expect('')
                        .expect(204);
                });
        });
        it('should run an error for Redis', function () {
            app.redisClient.emit('error', new Error());
        });
    });
}());