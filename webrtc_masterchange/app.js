
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var Puid = require('puid');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);

var httpServer = http.createServer(app);
var io = require("socket.io").listen(httpServer, {"log level": 1});

httpServer.listen(app.get("port"));

function showKeys(hash, sep){
    var num = 0;
    if(!sep){
        sep = "######";
    }
    console.log(sep);
    for(var key in hash){
        ++num;
        console.log("key:%s", key);
    }
    console.log("num of keys [%d]", num);
    console.log(sep);
}

function ConnectionMgr(){
    this._connections = {};
    this._listeners = {};
    this._masters = {};
    this._masterCount = 0;
}
ConnectionMgr.prototype = {
    addConnection: function(id, socket){
        console.log("new connection [%s]", id);
        this._connections[id] = socket;
        this.showConnections();
    },
    removeConnection: function(id){
        if(!this._connections[id]){
            console.log("!!!!!!!!! internal error0 !!!!!!!!!");
            return ;
        }
        console.log("remove connection [%s]", id);
        this.removeMaster(id);
        this.removeListener(id);
        delete this._connections[id];
        this.showConnections();
    },
    addMaster: function(id, socket){
        if(this._masterCount >= 3){
            socket.emit("getmaster", {result: false, listeners: []});
            this.broadcast(socket.my_id, "wantMaster", socket.my_id);
            return ;
        }
        ++this._masterCount;
        console.log("new master [%s], num[%d]", id, this._masterCount);
        this._masters[id] = socket;
        socket.emit("getmaster", {result: true, listeners: this.getListenerIDs()});
        this.showMasters();
    },
    removeMaster: function(id){
        if(!this._masters[id]){
            return ;
        }
        --this._masterCount;
        console.log("remove master [%s] num[%d]", id, this._masterCount);
        delete this._masters[id];
        this.showMasters();
    },
    addListener: function(id, socket){
        console.log("new listener [%s]", id);
        this._listeners[id] = socket;
        for(var id in this._masters){
            this._masters[id].emit("listenersChanged", this.getListenerIDs());
        }
        this.showListeners();
    },
    removeListener: function(id){
        if(!this._listeners[id]){
            return ;
        }
        console.log("remove listener [%s]", id);
        delete this._listeners[id];
        for(var id in this._masters){
            this._masters[id].emit("listenersChanged", this.getListenerIDs());
        }
        this.showListeners();
    },
    broadcast: function(myid, key, data){
        for(var id in this._connections){
            console.log("broadcast to [%s]->[%s]", myid, id);
            if(id !== myid){
                this._connections[id].emit(key, data);
            }
        }
    },
    getListenerIDs: function(){
        return Object.keys(this._listeners);
    },
    showConnections: function(){
        showKeys(this._connections, "CCCCC");
    },
    showListeners: function(){
        showKeys(this._listeners, "LLLLL");
    },
    showMasters: function(){
        showKeys(this._masters, "MMMMM");
    },
};

var g_connectionMgrHash = {};

var g_puid = new Puid();

io.sockets.on('connection', function(socket){
    var id = g_puid.generate();
    socket.my_id = id;
    
    socket.emit("clientConnect", id);
    
    socket.on("enterRoom", function(roomName){
        console.log("[%s] enter [%s]", this.my_id, roomName);
        // socket.join(roomName);
        socket.my_roomName = roomName;
        if(!g_connectionMgrHash[roomName]){
            console.log("new Room [%s] created", roomName);
            g_connectionMgrHash[roomName] = new ConnectionMgr();
        }
        g_connectionMgrHash[roomName].addConnection(socket.my_id, socket);
    });
    
    socket.on('getmaster', function(){
        console.log("%s try to get master.", socket.my_id);
        g_connectionMgrHash[this.my_roomName].addMaster(socket.my_id, socket);
        return ;
    });
    socket.on("releasemaster", function(){
        g_connectionMgrHash[this.my_roomName].removeMaster(socket.my_id);
    });
    socket.on("getlisten", function(){
        socket.emit("getlisten", true);
        g_connectionMgrHash[this.my_roomName].addListener(socket.my_id, socket);
    });
    socket.on("releaselisten", function(){
        g_connectionMgrHash[this.my_roomName].removeListener(socket.my_id);
    });
    
    socket.on('disconnect', function(){
        console.log("connection close [%s]", socket.my_id);
        g_connectionMgrHash[this.my_roomName].removeConnection(socket.my_id);
    });
});

// for peer server
var portnum = 9000;
var peerServerKey = "peerjs";
var PeerServer = require('peer').PeerServer;
var server = new PeerServer({ port: portnum, key: peerServerKey, debug:3 });

