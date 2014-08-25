"use strict";

var COON = require("./coon.js");

var args = process.argv;
args.splice(0, 2);

COON.gitSeeker(function(){
    args[1] = JSON.parse(args[1]);
    args[3] = JSON.parse(args[3]);
    COON.deploy.apply({}, args);
});