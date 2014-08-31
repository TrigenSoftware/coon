"use strict";

var coon = require("./coon.js");

//var args = process.argv;
//args.splice(0, 2);

//args[1] = JSON.parse(args[1]);
//args[3] = JSON.parse(args[3]);

coon.gitSeeker(function(){
    coon.deploy.apply({}, ["test", {}, "trigen", {}]);
});