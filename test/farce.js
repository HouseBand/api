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

    describe('API Tests', function () {
        before(function () {
            app = require('../server.js');
        });
        it('should get a message back', function () {
            return supertest(app.server)
                .get('/')
                .expect({
                    message: 'Oh hai there!'
                })
                .expect(200);
        });
        it('should be able to connect to the socket', function () {
            return chai.expect(new Promise(function (resolve) {
                var firstClient = io.connect('http://0.0.0.0:' + app.port, {
                    transports: ['websocket'],
                    'force new connection': true
                });

                firstClient.on('connect', function () {
                    firstClient.emit('my other event', 'some event');
                    firstClient.on('news', resolve);
                });
            })).to.eventually.deep.equal({
                hello: 'world'
            });
        });
    });
}());