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
    TIMEOUT: 5,
    DEPLOY: 6,
    BRANCH: 7,
    REPO_DIR: 8,
    SERVER_PATH: 9
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
    console.log("❗️  " + "You not in git repo.".red);
    process.exit();
}

args.splice(0, 2);

if (args[0] == "delay-deploy") {
    if (!args[1]) {
        console.log("❗️  " + "You should write config name.".red);
        process.exit();
    }

    if (!configsData[args[1]]) {
        console.log("❗️  " + "Config with name `".red + args[1] + "` doesn't exist.".red);
        process.exit();
    }

    var conf = configsData[args[1]].slice();

    if (args[2]) {
        if (args[2] != "with") {
            console.log("❗️  " + "Unknown command `".red + args[2] + "`.".red);
            process.exit();
        }

        if (!args[3]) {
            console.log("❗️  " + "You should write branch name.".red);
            process.exit();
        }

        conf[keys.BRANCH] = args[3];
    }

    git(["repository", "branch"], function(err ,res){
        if (err) {
            console.log("❗️  " + "Something goes wrong.".red);
            process.exit();
        }

        if(conf[keys.DEPLOY].trim().length > 0){
            console.log("=> " + conf[keys.DEPLOY].trim().cyan);
            sh.exec(conf[keys.DEPLOY].trim());
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
            "mv -f " + conf[keys.SERVER_PATH] + "/.coon-tmp/" + (conf[keys.NAME] + " " + conf[keys.BRANCH]).replace(/\s/g, "_") + "/* " + conf[keys.SERVER_PATH],
            "rm -rf " + conf[keys.SERVER_PATH] + "/.coon-tmp" 
        );

        if(args[0] == "deploy")
            remoteExecQueue(conf, cmds, function(){
                console.log("🍻  " + "`".green + conf[keys.BRANCH] + "` branch was successfully deployed on `".green + conf[keys.NAME] + "`.".green);
                process.exit();
            });
        else
            setTimeout(function(){
                remoteExecQueue(conf, cmds, function(){
                    console.log("🍻  " + "`".green + conf[keys.BRANCH] + "` branch was successfully deployed on `".green + conf[keys.NAME] + "`.".green);
                    process.exit();
                });
            }, conf[keys.TIMEOUT] * 1000 );
    });
}