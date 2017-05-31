/**
 * Created by jchanowitz on 5/31/2017.
 */

"use strict";

require ('dotenv').config();

var log4js = require('log4js');
log4js.configure({
    appenders: [
        { type: 'console' },
        { type: 'file', filename: 'logs/sh_data_services.log', category: 'sh_data_services' }
    ]
});
var logger = log4js.getLogger('sh_data_services');
logger.setLevel('INFO');

var restify = require('restify');
var mysql = require('promise-mysql');
var moment = require('moment');

// Set up mysql-promise
var connection;
mysql.createConnection({
    host    : process.env.MYSQL_HOST,
    user    : process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
}).then(function(conn) {
    connection = conn;
    logger.info('Connected to mysql', process.env.MYSQL_HOST);
});


// Set up API Server
var server = restify.createServer();
server.use(restify.bodyParser({ mapParams: true }));
server.pre(restify.CORS());
server.use(restify.fullResponse());

server.post('/message/pull', function(req, res, next) {
    var myBody = req.body;
    var inboxDid = '+' + myBody.phone_number;
    var selectedDateString = myBody.selected_date;
    var startDateString = null;
    var endDateString = null;
    var qry = 'select e.start_cycle_date from enterprise e join inbox i on e.enterprise_id = i.enterprise_id where did = ?';
    connection.query(qry, [inboxDid])
        .then(function(results) {
            if (!results || results.length == 0) {
                res.send(JSON.stringify({ alert: 'No did found'}));
                return;
            }
            var selectedDate = moment(selectedDateString);
            var periodStartDate = moment(results[0].cycle_start_date);
            var startDate = selectedDate.clone();
            if (selectedDate.date() >= periodStartDate.date()) {
                startDate.date(periodStartDate.date());
            }
            else {
                startDate.subtract(1, 'month');
                startDate.date(periodStartDate.date());
                if (!startDate.isValid()) {
                    startDate = selectedDate.clone();
                    startDate.startOf('month');
                }
            }
            var endDate = startDate.clone().add(1, 'month').subtract(1, 'day');
            startDateString = startDate.format('YYYY-MM-DD');
            endDateString = endDate.format('YYYY-MM-DD');

            var qry = 'select f.segment_count, d.date, m.direction, m.text, i.did, ' +
                't.created_date as thread_created_date, m.is_deleted, i.name as inbox_name, c.name as contact_name, ' +
                'c.phone_number, e.name as enterprise_name, e.plan ' +
                'from message_leg_fact f ' +
                'join date d on d.id = f.fk_date ' +
                'join enterprise e on e.id = f.fk_enterprise ' +
                'join inbox i on i.id = f.fk_inbox ' +
                'join message m on f.fk_message = m.id ' +
                'join contact c on f.fk_contact = c.id ' +
                'join thread t on f.fk_thread = t.id ' +
                'where d.date >= ? and d.date < ?  and did = ?';

            return connection.query(qry, [startDateString, endDateString, '+' + req.body.phone_number]);
        })
        .then(function(msgs) {
            var payload = {
                inboxDid : inboxDid,
                inboxName : msgs && msgs.length > 0 ? msgs[0].inbox_name : '',
                cycleStart : startDateString,
                cycleEnd : endDateString,
                msgs: msgs
            };
            /*
             if (msgs && msgs.length > 0) {
             payload.inboxName = msgs[0].member_name;
             }
             */
            res.send(200, JSON.stringify(payload));
        });
});

server.post('/auth/login', function(req, res) {
    logger.info('login request for', req.body.username);
    let myResponse = 'failure';
    connection.query('select name, password from user where name = ?', [req.body.username])
        .then(function(userRec) {
            if(userRec.length > 0 && userRec[0].password === req.body.password) {
                myResponse = 'success';
            }
            res.json({authResponse: myResponse});
        });
});

server.post('/', function(req, res) {
    res.send({msg: 'hi'});
});


server.listen(3000, function() {
    logger.info('Server Listening');
});
