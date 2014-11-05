var io = require("socket.io")();
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var users = require('./routes/users');
var app = express();
var argv = require("argv");
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var cookie = require('cookie');

var myutil = require('./mod/myutil');

// const
var SESSKEY = "sessID";
var SECRET = "kobayashi_secret";

// original
var sslmode = false;

argv.option({
    name: 'ssl',
    short: 's',
    type : 'string',
    description :'Enable SSL',
    example: "'script -s'"
});

if(argv.run().options.ssl || process.env.SECURE){
    console.log("SSL-Mode");
    sslmode = true;
} else{
    console.log("NORMAL-Mode");
}

console.log("dirname[%s], filename[%s]", __dirname, __filename);
var Test = require("./mod/testmod"); 
var test = new Test("test");
console.log("%s", test.teststr);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public/images
app.use(favicon(__dirname + '/public/images/favicon.ico'));

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// var redis = require("socket.io-redis");
// io.adapter(redis({host: "localhost", port: 6379}));

var redisStore = new RedisStore({
    })
});

var redisStore = new RedisStore({
    host: "127.0.0.1",
    port: 6379
});

app.use(cookieParser(SECRET));
app.use(session({
    name: SESSKEY,
    secret: SECRET,
    store: redisStore,
    cookie: {httpOnly: false}
}));

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

var server;
if(sslmode){
    var https = require('https');
    var fs = require('fs');
    var opts = {
        key: fs.readFileSync("./server.key"),
        cert: fs.readFileSync("./server.crt")
    };
    server = https.createServer(opts, app);
    app.set("port", process.env.PORT || 4443);
    io.attach(server, {'log level': 2, secure: true});
} else{
    var http = require('http');
    server = http.createServer(app);
    app.set("port", process.env.PORT || 3000);
    io.attach(server, {'log level': 2});
}

server.listen(app.get("port"), function(){
    console.log("listen %s", app.get("port"));
});

// app.get("env")には環境変数 NODE_ENVが設定される
// defaultはdevelopment

// error handlers
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

// http://jxck.hatenablog.com/entry/20110809/1312847290
io.sockets.on("connection", function (socket) {
    console.log(socket.handshake);
    var targetCookie = cookie.parse(decodeURIComponent(socket.handshake.headers.cookie))
    var sessID = require("cookie-parser/lib/parse").signedCookies(targetCookie, "kobayashi_secret")[SESSKEY];
    if(!sessID){
        console.log("invalid sessID");
        return ;
    }
    
    console.log("connection sessID[%s], sockID[%s]", sessID, socket.id);
    socket.sessID = sessID;


    socket.on("disconnect", function(){
        console.log("disconnect sessID[%s], sockID[%s]", socket.sessID, socket.id);
    });
    
    socket.on("test", function(){
        console.log("test");
    });
});
io.set("authorization", function(handshake, callback){
    console.log("##### authorization #####");
    
    var targetCookie = cookie.parse(decodeURIComponent(handshake.headers.cookie))
    var sessID = require("cookie-parser/lib/parse").signedCookies(targetCookie, "kobayashi_secret")[SESSKEY];
    if(!sessID){
        callback("autherror", false);
        return ;
    }
    console.log("sessID[%s]", sessID);
    handshake.hoge = "test";
    console.log(handshake);
    
    // redisStore.get(sessID, function(err, session){
        // if(err){
            // console.log("EEEEEEEEEEEEEEEEEEEEE");
        // } else{
            // console.log("OOOOOOOOOOOOOOOOOOOO");
            // console.log(session);

            // redisStore.set(sessID, session, function(err, session){
                // if(err){
                    // console.log("EEEEEEEEEEEEEEEEEEEEE");
                // } else{
                    // console.log("OOOOOOOOOOOOOOOOOOOO");
                    // console.log(session);
                // }
            // });
        // }
    // });

    // callback("auth error", false);
    callback(null, true);
});



// rpc
var dnode = require('dnode');
var dserver = dnode({
    test: function(str, callback){
        console.log(str);
        callback(str);
    }
});
dserver.listen(5004);

module.exports = app;