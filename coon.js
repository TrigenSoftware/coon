"use strict";

// require
var ssh  = require("ssh2"),
    sh   = require("shelljs"),
    fe   = require('forever-monitor');


var __git = !sh.test('-e', process.cwd() + "/.git") 
		? false : process.cwd() + "/.git", 
	__branch = __git 
		? sh.exec("git branch", {silent:true})
			.output.match(/\* ([^\n]+)\n/)[1]
		: false,
	__remote = __git 
		? sh.exec("git remote -v", {silent:true})
			.output.match(/origin[\s\t]+(.+)[\s\t]+\(push\)/)[1]
		: false,
	__dir = __dirname,
	__cwd = process.cwd();


/* ConfigsStorage */

var ConfigsStorage = {
	hosts: {},
	hostDefs: {
		ssh_port: 22,
	},
	hostProps: [
		"ssh_host",
		"ssh_user",
		"ssh_privatekey",
		"ssh_port",
	],

	deploys: {},
	deployDefs: {
		branch: "*",
		build_command: "",
		source: ".",
		target: "."
	},
	deployProps: [
		"branch",
		"build_command",
		"source",
		"target"
	]
};


ConfigsStorage.openHosts = function () {
	if(sh.test('-e', __dir + "/coon-hosts.json"))
		this.hosts = JSON.parse(sh.cat(__dir + "/coon-hosts.json"));
	
	return true;
};

ConfigsStorage.openDeploys = function () {
	if(!__git) throw new Error("You are not in git repo.");
	if(sh.test('-e', __git + "/coon-deploys.json"))
		this.deploys = JSON.parse(sh.cat(__git + "/coon-deploys.json"));

	return true;
};


ConfigsStorage.saveHosts = function () {
	JSON.stringify(this.hosts).to(__dir + "/coon-hosts.json");

	return true;
};

ConfigsStorage.saveDeploys = function () {
	if(!__git) throw new Error("You are not in git repo.");
	JSON.stringify(this.deploys).to(__git + "/coon-deploys.json");

	return true;
};


ConfigsStorage.mergeConfigs = function (config, other) {
	for(var key in config) 
		if(config.hasOwnProperty(key) && !other[key]){
			other[key] = config[key];
		}

	return other;
};


ConfigsStorage.setHostDefaults = function (config) {
	for(var key in this.hostDefs) 
		if(this.hostDefs.hasOwnProperty(key) && !config[key]){
			config[key] = this.hostDefs[key];
		}

	return config;
};

ConfigsStorage.setDeployDefaults = function (config) {
	for(var key in this.deployDefs) 
		if(this.deployDefs.hasOwnProperty(key) && !config[key]){
			config[key] = this.deployDefs[key];
		}

	return config;
};


ConfigsStorage.testHostConfig = function (config) {
	for(var key in config) if(config.hasOwnProperty(key)){
		if(this.hostProps.indexOf(key) == -1 || !this.hostDefs.hasOwnProperty(key) && !config[key])
			throw new Error("Unknown key `" + key + "`.");
	}

	this.hostProps.forEach(function(prop){
		if(config[prop] === undefined) throw new Error("Key `" + prop + "` is required.");
	});

	return true;
};

ConfigsStorage.testDeployConfig = function (config) {
	for(var key in config) if(config.hasOwnProperty(key)){
		if(this.deployProps.indexOf(key) == -1 || !this.deployDefs.hasOwnProperty(key) && !config[key])
			throw new Error("Unknown key `" + key + "`.");
	}

	this.deployProps.forEach(function(prop){
		if(config[prop] === undefined) throw new Error("Key `" + prop + "` is required.");
	});

	return true;
};


ConfigsStorage.addHost = function (name, config) {
	if(this.hosts[name]) throw new Error("Host config with name `" + name + "` already exist.");
	config = this.setHostDefaults(config);
	if(!this.testHostConfig(config)) return false;

	this.hosts[name] = config;

	return true;
};

ConfigsStorage.addDeploy = function (name, config) {
	if(this.deploys[name]) throw new Error("Deploy config with name `" + name + "` already exist.");
	config = this.setDeployDefaults(config);
	if(!this.testDeployConfig(config)) return false;
	this.deploys[name] = config;

	return true;
};


ConfigsStorage.removeHost = function (name) {
	if(!this.hosts[name]) throw new Error("Host config with name `" + name + "` doesn't exist.");
	
	delete this.hosts[name];

	return true;
};

ConfigsStorage.removeDeploy = function (name) {
	if(!this.deploys[name]) throw new Error("Deploy config with name `" + name + "` doesn't exist.");
	
	delete this.deploys[name];

	return true;
};


/* ScriptsStorage */

var ScriptsStorage = {
	pre_commit: "#!/bin/sh\n\n",
	pre_push: "#!/bin/sh\n\n"
};


ScriptsStorage.configToArgs = function (config) {
	var args = " ";

	for(var name in config) if(config.hasOwnProperty(name)) 
		args += "--" + name.replace(/_/g, "-") + "=\"" + config[name] + "\" " 

	return args;
};


ScriptsStorage.openBuilds = function () {
	if(!__git) throw new Error("You are not in git repo.");
	if(sh.test('-e', __git + "/hooks/pre-commit"))
		this.pre_commit = sh.cat(__git + "/hooks/pre-commit");

	return true;
};

ScriptsStorage.openDeploys = function () {
	if(!__git) throw new Error("You are not in git repo.");
	if(sh.test('-e', __git + "/hooks/pre-push"))
		this.pre_push = sh.cat(__git + "/hooks/pre-push");

	return true;
};


ScriptsStorage.saveBuilds = function () {
	if(!__git) throw new Error("You are not in git repo.");
	this.pre_commit.to(__git + "/hooks/pre-commit");
	sh.chmod("+x", __git + "/hooks/pre-commit");

	return true;
};

ScriptsStorage.saveDeploys = function () {
	if(!__git) throw new Error("You are not in git repo.");
	this.pre_push.to(__git + "/hooks/pre-push");
	sh.chmod("+x", __git + "/hooks/pre-push");

	return true;
};


ScriptsStorage.addBuild = function (name, host_name, config) {
	if(!__git) throw new Error("You are not in git repo.");
	if(this.pre_commit.indexOf("# build " + name + " for " + host_name + "\n") != -1)
		throw new Error("Already binded.");

	this.pre_commit += 
		"# build " + name + " for " + host_name + "\n" 
		+ __dir + "/coon build \"" + name + "\"" + this.configToArgs(config) 
		+ "\n\n";

	return true;
};

ScriptsStorage.addDeploy = function (name, host_name, config) {
	if(!__git) throw new Error("You are not in git repo.");
	if(this.pre_push.indexOf("# deploy " + name + " to " + host_name + "\n") != -1)
		throw new Error("Already binded.");

	this.pre_push += 
		"# deploy " + name + " to " + host_name + "\n" 
		+ __dir + "/coon delay-deploy \"" + name + "\" to \"" + host_name + "\" " + this.configToArgs(config) 
		+ "\n\n";

	return true;
};


ScriptsStorage.removeBuild = function (name, host_name) {
	if(!__git) throw new Error("You are not in git repo.");

	var re = host_name
		? new RegExp("# build " + name + " for " + host_name + "\n[^\\n]+\n\n", "g")
		: new RegExp("# build " + name + " for [^\\n]+\n[^\\n]+\n\n", "g");

	this.pre_commit = this.pre_commit.replace(re, "");

	return true;
};

ScriptsStorage.removeDeploy = function (name, host_name) {
	if(!__git) throw new Error("You are not in git repo.");

	var re = host_name
		? new RegExp("# deploy " + name + " to " + host_name + "\n[^\\n]+\n\n", "g")
		: new RegExp("# deploy " + name + " to [^\\n]+\n[^\\n]+\n\n", "g");

	this.pre_push = this.pre_push.replace(re, "");

	return true;
};


ScriptsStorage.removeAllBuild = function () {
	if(!__git) throw new Error("You are not in git repo.");

	var re = new RegExp("# build [^\\n]+ for [^\\n]+\n[^\\n]+\n\n", "g");

	this.pre_commit = this.pre_commit.replace(re, "");

	return true;
};

ScriptsStorage.removeAllDeploy = function () {
	if(!__git) throw new Error("You are not in git repo.");

	var re = new RegExp("# deploy [^\\n]+ to [^\\n]+\n[^\\n]+\n\n", "g");

	this.pre_push = this.pre_push.replace(re, "");

	return true;
};


/* RemoteExec */

function RemoteExec (conf, commands, print, end) {
    var conn = new ssh();
    conn.on('ready', function() {
        var i = 0;

        function rec(data){
            if(i == commands.length) return conn.end(), end();
            print(commands[i], "command");
            RemoteExec.exec(conn, commands[i++], print, rec);
        }

        rec();
    }).connect({
        host: conf.ssh_host,
        port: conf.ssh_port,
        username: conf.ssh_user,
        privateKey: sh.cat(conf.ssh_privatekey.replace("~", process.env.HOME + "/"))
    });
}

RemoteExec.exec = function (conn, command, print, end) {
    conn.exec(command, function(err, stream) {
        if (err) {
            throw err;
            process.exit();
        }

        stream.on('data', function(data) {
            print(data + "", "data");
        }).on('close', function() {
            end();
        }).stderr.on('data', function(data) {
        	data = data + "";
            print(data, data.indexOf("Switched to a new branch") == -1 ? "error" : "data");
            if(data.indexOf("Switched to a new branch") == -1) process.exit();
        });
    });
}


/* GitSeeker */

function GitSeeker (closed) {
	var seeker = setInterval(function(){
        var lsof = sh.exec("lsof | grep git", {silent:true}).output;
        if(lsof.match(/(^|\n)git .*\n/g) == null){
            clearInterval(seeker);
            closed();
        }
    }, 2000 );
}


function Build (name, config, print) {
	if(!__git) throw new Error("You are not in git repo.");
	if(!config) config = {};

	ConfigsStorage.openDeploys();

	if(!ConfigsStorage.deploys[name]) throw new Error("Deploy config with name `" + name + "` doesn't exist.");

	config = ConfigsStorage.mergeConfigs(ConfigsStorage.deploys[name], config);

	if(!ConfigsStorage.testDeployConfig(config) 
	|| (config.branch.trim() != "*" && config.branch.trim() != __branch)) return false;

	sh.exec(config.build_command, { silent: !print });

	return true;
}

function Deploy (name, config, host_name, host_config, print, end) {
	if(!__git) throw new Error("You are not in git repo.");
	if(!config) config = {};
	if(!host_config) host_config = {};

	ConfigsStorage.openDeploys();
	ConfigsStorage.openHosts();

	if(!ConfigsStorage.deploys[name]) throw new Error("Deploy config with name `" + name + "` doesn't exist.");
	if(!ConfigsStorage.hosts[host_name]) throw new Error("Host config with name `" + name + "` doesn't exist.");

	config = ConfigsStorage.mergeConfigs(ConfigsStorage.deploys[name], config);
	host_config = ConfigsStorage.mergeConfigs(ConfigsStorage.hosts[host_name], host_config);

	if(!ConfigsStorage.testDeployConfig(config) || !ConfigsStorage.testHostConfig(host_config) 
	|| (config.branch.trim() != "*" && config.branch.trim() != __branch)) return false;

	var commands = [
        "mkdir -p " + config.target + "/.coon-tmp",
        "rm -rf " + config.target + "/.coon-tmp/" + ( name + " " + config.branch).replace(/\s/g, "_"),
        "git clone " + __remote + " " + config.target + "/.coon-tmp/" + ( name + " " + config.branch).replace(/\s/g, "_")
    ];

    if(config.branch == "*")
	commands.push(
        "cd " + config.target + "/.coon-tmp/" + ( name + " " + config.branch ).replace(/\s/g, "_") + " \n" +
        "   git checkout " + __branch
    );
	else
    if(__branch != "master")
	commands.push(
        "cd " + config.target + "/.coon-tmp/" + ( name + " " + config.branch ).replace(/\s/g, "_") + " \n" +
        "   git checkout " + config.branch
    );

    commands.push(
        "rsync -a --delete-before " + config.target + "/.coon-tmp/" + ( name + " " + config.branch ).replace(/\s/g, "_") + "/" + config.source + "/* " + config.target,
        "rm -rf " + config.target + "/.coon-tmp" 
    );

    RemoteExec(host_config, commands, (print || function(){}), (end || function(){}));

	return true;
}

function DelayDeploy (name, config, host_name, host_config) {
	arguments[1] = JSON.stringify(config || {});
	arguments[3] = JSON.stringify(host_config || {});
	
	(new (fe.Monitor)('delay-deploy.js', {
        max: 3,
        silent: true,
        options: Array.prototype.slice.call(arguments)
    })).start();
}

function Bind (name, config, host_name, host_config) {
	if(!__git) throw new Error("You are not in git repo.");
	if(!config) config = {};
	if(!host_config) host_config = {};

	ConfigsStorage.openDeploys();
	ConfigsStorage.openHosts();

	if(!ConfigsStorage.deploys[name]) throw new Error("Deploy config with name `" + name + "` doesn't exist.");
	if(!ConfigsStorage.hosts[host_name]) throw new Error("Host config with name `" + name + "` doesn't exist.");

	config = ConfigsStorage.mergeConfigs(ConfigsStorage.deploys[name], config);
	host_config = ConfigsStorage.mergeConfigs(ConfigsStorage.hosts[host_name], host_config);

	if(!ConfigsStorage.testDeployConfig(config) || !ConfigsStorage.testHostConfig(host_config)) return false;

	ScriptsStorage.openBuilds();
	ScriptsStorage.openDeploys();

	ScriptsStorage.addBuild(name, host_name, config);
	ScriptsStorage.addDeploy(name, host_name, ConfigsStorage.mergeConfigs(config, host_config));

	ScriptsStorage.saveBuilds();
	ScriptsStorage.saveDeploys();

	return true;
}

function Unbind (name, host_name) {
	if(!__git) throw new Error("You are not in git repo.");

	ConfigsStorage.openDeploys();
	ConfigsStorage.openHosts();

	if(!ConfigsStorage.deploys[name]) throw new Error("Deploy config with name `" + name + "` doesn't exist.");
	if(host_name && !ConfigsStorage.hosts[host_name]) throw new Error("Host config with name `" + name + "` doesn't exist.");

	ScriptsStorage.openBuilds();
	ScriptsStorage.openDeploys();

	ScriptsStorage.removeBuild(name, host_name);
	ScriptsStorage.removeDeploy(name, host_name);

	ScriptsStorage.saveBuilds();
	ScriptsStorage.saveDeploys();

	return true;
}

function Clear () {
	if(!__git) throw new Error("You are not in git repo.");

	sh.config.silent = true;

	sh.rm(__git + "/coon-deploys.json");
	sh.rm(__git + "/hooks/pre-commit");
	sh.rm(__git + "/hooks/pre-push");

	sh.config.silent = false;
}

exports.__git = __git;
exports.__remote = __remote;
exports.__branch = __branch;
exports.__dir = __dir;
exports.__cwd = __cwd;

exports.ConfigsStorage = ConfigsStorage;
exports.ScriptsStorage = ScriptsStorage;

exports.gitSeeker = GitSeeker;

exports.build = Build;
exports.deploy = Deploy;
exports.delayDeploy = DelayDeploy;
exports.bind = Bind;
exports.unbind = Unbind;
exports.clear = Clear;