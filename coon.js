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
		target: ".",
		delta_mode: "false"
	},
	deployProps: [
		"branch",
		"build_command",
		"source",
		"target",
		"delta_mode"
	]
};


ConfigsStorage.openHosts = function () {
	if(sh.test('-e', "/usr/local/etc/coon-hosts.json"))
		this.hosts = JSON.parse(sh.cat("/usr/local/etc/coon-hosts.json"));
	
	return true;
};

ConfigsStorage.openDeploys = function () {
	if(!__git) throw new Error("You are not in git repo.");
	if(sh.test('-e', __git + "/coon-deploys.json"))
		this.deploys = JSON.parse(sh.cat(__git + "/coon-deploys.json"));

	return true;
};


ConfigsStorage.saveHosts = function () {
	JSON.stringify(this.hosts).to("/usr/local/etc/coon-hosts.json");

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
	sh.mkdir("-p", __git + "/hooks");
	this.pre_commit.to(__git + "/hooks/pre-commit");
	sh.chmod("+x", __git + "/hooks/pre-commit");

	return true;
};

ScriptsStorage.saveDeploys = function () {
	if(!__git) throw new Error("You are not in git repo.");
	sh.mkdir("-p", __git + "/hooks");
	this.pre_push.to(__git + "/hooks/pre-push");
	sh.chmod("+x", __git + "/hooks/pre-push");

	return true;
};


ScriptsStorage.addBuild = function (name, host_name, config) {
	if(!__git) throw new Error("You are not in git repo.");
	if(this.pre_commit.indexOf("# build " + name + " for " + host_name + "\n") != -1)
		throw new Error("Already binded.");

	if(!config.build_command) return false;

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
        	if(data.indexOf("-bash: ") == 0) return;
        	print(data, "data");
        });
    });
}


/* GitSeeker */

function GitSeeker (closed) {
	var seeker = setInterval(function(){
        var lsof = sh.exec("lsof | grep git", {silent:true}).output;
        if(lsof.match(/(^|\n)git( |-).*\n/g) == null){
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

	var repo_dir = ( name + " " + config.branch ).replace(/\s/g, "_"),
		repo_index = ( name + " " + __branch ).replace(/\s/g, "-"),
		commands = [
        "mkdir -p " + config.target + "/.coon",
        "[ ! -e \"" + config.target + "/.coon/index-" + repo_index + "\" ] && touch \"" + config.target + "/.coon/index-" + repo_index + "\""
    ];

    if(config.delta_mode != "true"){
	    commands.push(
	    	"rm -rf " + config.target + "/.coon/" + repo_dir,
	    	"git clone " + __remote + " " + config.target + "/.coon/" + repo_dir
	    );

	    if(config.branch == "*")
		commands.push(
	        "cd " + config.target + "/.coon/" + repo_dir + " \n" +
	        "   git checkout " + __branch
	    );
		else
	    if(__branch != "master")
		commands.push(
	        "cd " + config.target + "/.coon/" + repo_dir + " \n" +
	        "   git checkout " + config.branch
	    );
	} else {
		commands.push(
			"cd " + config.target + "/.coon/\n" +
			"   if [ -d \"" + repo_dir + "\" ]; then\n" +
			"   	cd \"" + repo_dir + "\"\n" + 
			"   	git pull\n" +
			"   else\n" +
			"   	git clone " + __remote + " " + repo_dir + "\n" +
			(function(){
				if(config.branch == "*"){ 
					return "   	cd \"" + repo_dir + "\"\n" + 
						   "   	git checkout " + __branch + "\n";
				} else 
				if(__branch != "master"){
					return "   	cd \"" + repo_dir + "\"\n" + 
						   "   	git checkout " + config.branch + "\n";
				} else return "";
			})() +
			"   fi"
		);
	}

    commands.push(
        "cd " + config.target + "\n" + 
        "   while read line; do\n" +
		"       if [ ! -z \"$line\" ] && [ -f \"$line\" ] && [ ! -f \".coon/" + repo_dir + "/$line\" ]; then\n" + 
		"           echo \"$line will be deleted\"\n" + 
		"           rm -rf \"$line\"\n" + 
		"       fi\n" + 
		"   done < \".coon/index-" + repo_index + "\"\n" +
        "   while read line; do\n" +
		"       if [ ! -z \"$line\" ] && [ -d \"$line\" ] && [ ! -d \".coon/" + repo_dir + "/$line\" ] && [ ! $(ls -A \"$line\") ]; then\n" + 
		"           echo \"$line will be deleted\"\n" + 
		"           rm -rf \"$line\"\n" + 
		"       fi\n" + 
		"   done < \".coon/index-" + repo_index + "\"",

        "cd " + config.target + "/.coon/" + repo_dir + " \n" +
        "   rm \"../index-" + repo_index + "\"\n" +
        "   find . -path ./.git -prune -o -regextype posix-extended -regex \"\\..+\" -exec echo \"{}\" \\; >> \"../index-" + repo_index + "\"",

        "rsync -a " + config.target + "/.coon/" + repo_dir + "/" + config.source + "/* " + config.target 
    );

	if(config.delta_mode != "true")
	commands.push("rm -rf " + config.target + "/.coon/" + repo_dir);

    RemoteExec(host_config, commands, (print || function(){}), (end || function(){}));

	return true;
}

function DelayDeploy (name, config, host_name, host_config) {
	config = JSON.stringify(config || {});
	host_config = JSON.stringify(host_config || {});
	
	(new (fe.Monitor)('./coon.js', {
        max: 3,
        silent: true,
        options: ["dd", name, config, host_name, host_config]
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

var args = process.argv;

if(args[2] == "dd"){
	args.splice(0, 3);

	args[1] = JSON.parse(args[1]);
	args[3] = JSON.parse(args[3]);

	args.push(function(){}, function(){
	    process.exit();
	});

	GitSeeker(function(){
	    Deploy.apply({}, args);
	});
} else {
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
}