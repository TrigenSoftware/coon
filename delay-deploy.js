"use strict";

// require
var sys = require("util"),
    fs = require("fs"),
    path = require("path"),
    ssh = require("ssh2"),
    git = require("git-info"),
    sh = require("shelljs");

var args = process.argv;

// some data
var keys = {
    NAME: 0,
    SSH_HOST: 1,
    SSH_USER: 2,
    SSH_PKP: 3,
    SSH_PORT: 4,
    BRANCH: 5,
    REPO_DIR: 6,
    SERVER_PATH: 7
};


// hook
if(!sh.test('-e', process.cwd() + "/.git/hooks")) sh.mkdir(process.cwd() + "/.git/hooks");
var hookScript = sh.test('-e', process.cwd() + "/.git/hooks/pre-push") ? sh.cat(process.cwd() + "/.git/hooks/pre-push") : "#!/bin/sh\n\n";

// configs
var configsData = sh.test('-e', process.cwd() + "/.git/coon.json") ? JSON.parse(sh.cat(process.cwd() + "/.git/coon.json")) : {};

function remoteExec(conn, command, cb){
    conn.exec(command, function(err, stream) {
        if (err) {
            throw err;
            process.exit();
        }

        stream.on('close', function() {
            cb();
        }).stderr.on('data', function(data) {
            process.exit();
        });
    });
}

function remoteExecQueue(conf, commands, cb){
    var conn = new ssh();
    conn.on('ready', function() {
        var i = 0;

        function rec(data){
            if(i == commands.length) return conn.end(), cb();
            remoteExec(conn, commands[i++], rec);
        }

        rec();
    }).connect({
        host: conf[keys.SSH_HOST],
        port: conf[keys.SSH_PORT],
        username: conf[keys.SSH_USER],
        privateKey: require('fs').readFileSync(conf[keys.SSH_PKP].replace("~", process.env.HOME + "/"), "utf8")
    });
}

// go

if (!sh.test('-e', process.cwd() + "/.git")) {
    process.exit();
}

args.splice(0, 2);

if (args[0] == "delay-deploy") {
    if (!args[1]) {

        process.exit();
    }

    if (!configsData[args[1]]) {

        process.exit();
    }

    var conf = configsData[args[1]].slice();

    if (args[2]) {
        if (args[2] != "with") {
    
            process.exit();
        }

        if (!args[3]) {
    
            process.exit();
        }

        conf[keys.BRANCH] = args[3];
    }

    git(["repository", "branch"], function(err ,res){
        if (err) {
    
            process.exit();
        }

        var cmds = [
            "mkdir -p " + conf[keys.SERVER_PATH] + "/.coon-tmp",
            "git clone " + res.repository + " " + conf[keys.SERVER_PATH] + "/.coon-tmp/" + (conf[keys.NAME] + " " + conf[keys.BRANCH]).replace(/\s/g, "_"),
        ];

        if(conf[keys.BRANCH] != "master")
            cmds.push(
                "cd " + conf[keys.SERVER_PATH] + "/.coon-tmp/" + (conf[keys.NAME] + " " + conf[keys.BRANCH]).replace(/\s/g, "_") + " \n" +
                "   git checkout -b " + conf[keys.BRANCH]
            );

        cmds.push(
            "mv -f " + conf[keys.SERVER_PATH] + "/.coon-tmp/" + (conf[keys.NAME] + " " + conf[keys.BRANCH]).replace(/\s/g, "_") + "/" + conf[keys.REPO_DIR] + "/* " + conf[keys.SERVER_PATH],
            "rm -rf " + conf[keys.SERVER_PATH] + "/.coon-tmp" 
        );

        
        var seeker = setInterval(function(){
            var lsof = sh.exec("lsof | grep git", {silent:true}).output;
            if(lsof.match(/(^|\n)git .*\n/g) == null){
                clearInterval(seeker);
                remoteExecQueue(conf, cmds, function(){
                    process.exit();
                });
            }
        }, 2000 );
    });
}